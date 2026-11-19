import json
import uuid
from decimal import Decimal
from functools import wraps

from django.core.exceptions import RequestDataTooBig, ValidationError
from django.db import IntegrityError, transaction
from django.db.models import F
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .models import Category, CustomerSession, Order, OrderItem, Product, Store, TicketCounter, validate_options


def error(message, status=400):
    return JsonResponse({'message': message}, status=status)


def body(request):
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError, RequestDataTooBig):
        raise ValueError('请求内容不是有效的 JSON。')
    if not isinstance(data, dict):
        raise ValueError('请求内容必须是 JSON 对象。')
    return data


def customer_required(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        authorization = request.headers.get('Authorization', '')
        if not authorization.startswith('Bearer ') or len(authorization) > 100:
            return error('请重新连接门店。', 401)
        request.customer = CustomerSession.objects.filter(token=authorization[7:]).first()
        if not request.customer:
            return error('点单会话已失效，请重新连接。', 401)
        return view(request, *args, **kwargs)
    return wrapped


def image_url(request, product):
    path = product.image.url if product.image else f'/static/coffee/products/{product.fallback_image}'
    return request.build_absolute_uri(path)


def product_json(request, product):
    return {
        'id': product.pk, 'category_id': product.category_id, 'name': product.name,
        'english_name': product.english_name, 'description': product.description,
        'flavor': product.flavor, 'price': str(product.price), 'image': image_url(request, product),
        'fallback_image': product.fallback_image, 'options': product.options, 'is_featured': product.is_featured,
    }


def order_json(order):
    return {
        'id': str(order.pk), 'pickup_code': order.pickup_code.split('-')[-1], 'order_number': order.pickup_code,
        'customer_name': order.customer_name, 'note': order.note,
        'status': order.status, 'status_label': order.get_status_display(),
        'total': str(order.total), 'store_name': order.store_name,
        'store_address': order.store_address, 'pickup_minutes': order.pickup_minutes,
        'created_at': order.created_at.isoformat(),
        'items': [
            {'id': item.pk, 'product_name': item.product_name, 'specification': item.specification,
             'unit_price': str(item.unit_price), 'quantity': item.quantity, 'image': item.image,
             'subtotal': str(item.unit_price * item.quantity)}
            for item in order.items.all()
        ],
    }


@require_GET
def health(request):
    return JsonResponse({'status': 'ok'})


@csrf_exempt
@require_POST
def session(request):
    # Anonymous device-scoped credential; no WeChat profile or payment permission required.
    customer = CustomerSession.issue()
    return JsonResponse({'token': customer.token}, status=201)


@require_GET
def catalog(request):
    store = Store.objects.first()
    if not store:
        return error('门店尚未配置，请先初始化后台。', 503)
    categories = Category.objects.filter(is_active=True)
    products = Product.objects.filter(is_available=True, category__is_active=True).select_related('category')
    return JsonResponse({
        'store': {'name': store.name, 'address': store.address, 'phone': store.phone,
                  'hours': f'{store.opening_time:%H:%M} — {store.closing_time:%H:%M}',
                  'is_open': store.is_open, 'pickup_minutes': store.pickup_minutes,
                  'announcement': store.announcement},
        'categories': [{'id': c.pk, 'name': c.name} for c in categories],
        'products': [product_json(request, p) for p in products],
    })


def validate_items(request, raw_items):
    if not isinstance(raw_items, list) or not 1 <= len(raw_items) <= 30:
        raise ValueError('请选择 1 至 30 项商品。')
    result, total, count = [], Decimal('0.00'), 0
    for raw in raw_items:
        if not isinstance(raw, dict):
            raise ValueError('商品信息无效。')
        product_id, quantity = raw.get('product_id'), raw.get('quantity')
        if type(product_id) is not int or type(quantity) is not int or not 1 <= quantity <= 20:
            raise ValueError('商品编号无效或数量超出 1 至 20。')
        count += quantity
        if count > 50:
            raise ValueError('单笔订单最多 50 件商品。')
        product = Product.objects.select_for_update().filter(pk=product_id, is_available=True, category__is_active=True).first()
        if not product:
            raise ValueError('部分商品已下架，请刷新菜单后重试。')
        try:
            validate_options(product.options)
        except ValidationError:
            raise ValueError('商品规格暂不可用，请联系门店。')
        selected = raw.get('options', {})
        if not isinstance(selected, dict) or set(selected) != set(product.options):
            raise ValueError(f'请选择「{product.name}」的全部规格。')
        price, labels = product.price, []
        for key, choices in product.options.items():
            choice = next((c for c in choices if c['label'] == selected[key]), None)
            if choice is None:
                raise ValueError(f'「{product.name}」的规格已变更，请重新选择。')
            price += Decimal(str(choice.get('extra', '0')))
            labels.append(choice['label'])
        price = price.quantize(Decimal('0.01'))
        total += price * quantity
        result.append({'product': product, 'product_name': product.name,
                       'specification': ' / '.join(labels), 'unit_price': price,
                       'quantity': quantity, 'image': image_url(request, product)})
    return result, total


@csrf_exempt
@require_POST
@customer_required
def create_order(request):
    try:
        data = body(request)
        try:
            request_id = uuid.UUID(str(data.get('request_id', '')))
        except ValueError:
            raise ValueError('缺少有效的提交标识，请重试。')
        existing = Order.objects.filter(request_id=request_id).prefetch_related('items').first()
        if existing:
            if existing.customer_id != request.customer.pk:
                return error('提交标识已使用，请重试。', 409)
            return JsonResponse(order_json(existing))
        name, note = data.get('customer_name', ''), data.get('note', '')
        if not isinstance(name, str) or len(name) > 20 or not isinstance(note, str) or len(note) > 200:
            raise ValueError('称呼最多 20 字，备注最多 200 字。')
        with transaction.atomic():
            store = Store.objects.select_for_update().first()
            if not store or not store.is_open:
                return error('门店暂未接受点单，晚点再来吧。', 409)
            items, total = validate_items(request, data.get('items'))
            # Compare the current server quote to the amount the customer reviewed.
            if str(total) != str(data.get('expected_total')):
                return error('商品价格已更新，请刷新菜单并重新确认。', 409)
            today = timezone.localdate()
            counter, _ = TicketCounter.objects.select_for_update().get_or_create(date=today)
            TicketCounter.objects.filter(pk=counter.pk).update(counter=F('counter') + 1)
            counter.refresh_from_db()
            pickup_code = f'{today:%y%m%d}-A{counter.counter:03d}'
            order = Order.objects.create(customer=request.customer, request_id=request_id,
                customer_name=name.strip(), note=note.strip(), total=total,
                store_name=store.name, store_address=store.address, pickup_minutes=store.pickup_minutes,
                pickup_code=pickup_code)
            OrderItem.objects.bulk_create([OrderItem(order=order, **item) for item in items])
        return JsonResponse(order_json(order), status=201)
    except ValueError as exc:
        return error(str(exc))
    except IntegrityError:
        existing = Order.objects.filter(request_id=request_id, customer=request.customer).prefetch_related('items').first()
        if existing:
            return JsonResponse(order_json(existing))
        return error('提交冲突，请重试。', 409)


@require_GET
@customer_required
def orders(request):
    try:
        page = max(1, int(request.GET.get('page', 1)))
    except (ValueError, TypeError):
        return error('页码无效。')
    queryset = Order.objects.filter(customer=request.customer).prefetch_related('items')
    start = (page - 1) * 20
    entries = list(queryset[start:start + 21])
    return JsonResponse({'results': [order_json(o) for o in entries[:20]], 'has_more': len(entries) > 20, 'page': page})


@require_GET
@customer_required
def order_detail(request, order_id):
    order = Order.objects.filter(pk=order_id, customer=request.customer).prefetch_related('items').first()
    if not order:
        return error('没有找到这笔订单。', 404)
    return JsonResponse(order_json(order))


@csrf_exempt
@require_POST
@customer_required
def cancel_order(request, order_id):
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(pk=order_id, customer=request.customer).first()
        if not order:
            return error('没有找到这笔订单。', 404)
        if order.status == Order.Status.CANCELLED:
            return JsonResponse(order_json(order))
        if order.status != Order.Status.PENDING:
            return error('门店已经开始制作，如需调整请联系门店。', 409)
        # The conditional update also prevents cancellation races on SQLite.
        updated = Order.objects.filter(pk=order.pk, status=Order.Status.PENDING).update(status=Order.Status.CANCELLED, updated_at=timezone.now())
        if not updated:
            return error('订单状态已更新，请刷新后重试。', 409)
        order.refresh_from_db()
    return JsonResponse(order_json(order))
