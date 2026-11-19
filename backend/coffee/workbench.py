from functools import wraps

from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Count, Q
from django.db.models.deletion import ProtectedError
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import path, reverse
from django.views.decorators.http import require_POST

from .forms import CategoryForm, ProductForm, StoreForm
from .models import Category, Order, Product, Store


def permitted(model, action='view'):
    def decorator(view):
        @wraps(view)
        def wrapped(request, *args, **kwargs):
            if not request.user.has_perm(f'coffee.{action}_{model}'):
                raise PermissionDenied
            return view(request, *args, **kwargs)
        return admin.site.admin_view(wrapped)
    return decorator


def context(request, section, **kwargs):
    return {
        'section': section, 'store': Store.objects.first(),
        'pending_count': Order.objects.filter(status='pending').count(),
        'can_add_product': request.user.has_perm('coffee.add_product'),
        'can_change_product': request.user.has_perm('coffee.change_product'),
        'can_delete_product': request.user.has_perm('coffee.delete_product'),
        'can_add_category': request.user.has_perm('coffee.add_category'),
        'can_change_category': request.user.has_perm('coffee.change_category'),
        'can_delete_category': request.user.has_perm('coffee.delete_category'),
        'can_change_order': request.user.has_perm('coffee.change_order'),
        'can_delete_order': request.user.has_perm('coffee.delete_order'),
        'can_change_store': request.user.has_perm('coffee.change_store'),
        **kwargs,
    }


def product_context(request):
    query = request.GET.get('q', '').strip()[:80]
    category_id = request.GET.get('category', '')
    availability = request.GET.get('availability', '')
    products = Product.objects.select_related('category')
    if query:
        products = products.filter(Q(name__icontains=query) | Q(english_name__icontains=query))
    if category_id.isdigit():
        products = products.filter(category_id=category_id)
    if availability in ('on', 'off'):
        products = products.filter(is_available=availability == 'on')
    return dict(
        products=Paginator(products, 24).get_page(request.GET.get('page')),
        categories=Category.objects.annotate(product_count=Count('products')),
        query=query, selected_category=category_id, availability=availability,
        total_products=Product.objects.count(), available_products=Product.objects.filter(is_available=True).count(),
    )


@permitted('product')
def products(request):
    return render(request, 'coffee/products.html', context(request, 'products', **product_context(request)))


def product_edit(request, product_id=None):
    action = 'change' if product_id else 'add'
    if not request.user.has_perm(f'coffee.{action}_product'):
        raise PermissionDenied
    product = get_object_or_404(Product, pk=product_id) if product_id else None
    form = ProductForm(request.POST or None, request.FILES or None, instance=product)
    if request.method == 'POST' and form.is_valid():
        product = form.save()
        messages.success(request, f'「{product.name}」已保存，小程序刷新后即可看到。')
        return redirect('workbench-products')
    return render(request, 'coffee/products.html', context(request, 'products', **product_context(request),
        edit_form=form, edit_object=product, drawer_title='编辑商品' if product else '新增商品'))


@permitted('product', 'change')
@require_POST
def product_toggle(request, product_id):
    with transaction.atomic():
        product = get_object_or_404(Product.objects.select_for_update(), pk=product_id)
        product.is_available = not product.is_available
        product.save(update_fields=['is_available', 'updated_at'])
    messages.success(request, f'「{product.name}」已{"上架" if product.is_available else "下架"}。')
    return redirect('workbench-products')


@permitted('product', 'delete')
@require_POST
def product_delete(request, product_id):
    product = get_object_or_404(Product, pk=product_id)
    name = product.name
    product.delete()
    messages.success(request, f'已删除「{name}」，历史订单仍然保留。')
    return redirect('workbench-products')


@permitted('category')
def categories(request):
    return category_page(request)


def category_page(request, form=None, category=None):
    return render(request, 'coffee/categories.html', context(request, 'categories',
        categories=Category.objects.annotate(product_count=Count('products')), edit_form=form,
        edit_object=category, drawer_title='编辑分类' if category else '新增分类'))


def category_edit(request, category_id=None):
    if not request.user.has_perm(f'coffee.{"change" if category_id else "add"}_category'):
        raise PermissionDenied
    category = get_object_or_404(Category, pk=category_id) if category_id else None
    form = CategoryForm(request.POST or None, instance=category)
    if request.method == 'POST' and form.is_valid():
        category = form.save()
        messages.success(request, f'「{category.name}」分类已保存。')
        return redirect('workbench-categories')
    return category_page(request, form, category)


@permitted('category', 'delete')
@require_POST
def category_delete(request, category_id):
    category = get_object_or_404(Category, pk=category_id)
    try:
        category.delete()
        messages.success(request, '分类已删除。')
    except ProtectedError:
        messages.error(request, '这个分类还有商品，请先把商品移到其他分类，再删除。')
    return redirect('workbench-categories')


@permitted('order')
def orders(request):
    query = request.GET.get('q', '').strip()[:80]
    status = request.GET.get('status', 'active')
    queryset = Order.objects.prefetch_related('items')
    if query:
        queryset = queryset.filter(Q(pickup_code__icontains=query) | Q(customer_name__icontains=query))
    if status == 'active':
        queryset = queryset.filter(status__in=['pending', 'preparing', 'ready'])
    elif status in Order.Status.values:
        queryset = queryset.filter(status=status)
    page = Paginator(queryset, 20).get_page(request.GET.get('page'))
    selected = None
    order_id = request.GET.get('order')
    if order_id:
        try:
            selected = queryset.filter(pk=order_id).first()
        except (ValueError, ValidationError):
            pass
    if not selected:
        selected = next(iter(page), None)
    next_status = {'pending': ('preparing', '接单，开始制作'), 'preparing': ('ready', '制作完成，通知取餐'), 'ready': ('completed', '确认已取餐')}
    return render(request, 'coffee/orders.html', context(request, 'orders', orders=page, selected_order=selected,
        next_action=next_status.get(selected.status) if selected else None, query=query, status=status))


@permitted('order', 'change')
@require_POST
def order_status(request, order_id):
    with transaction.atomic():
        order = get_object_or_404(Order.objects.select_for_update(), pk=order_id)
        old_status = order.status
        order.status = request.POST.get('status', '')
        try:
            order.full_clean()
            from django.utils import timezone
            updated = Order.objects.filter(pk=order.pk, status=old_status).update(status=order.status, updated_at=timezone.now())
            if not updated:
                messages.error(request, '订单已被其他店员更新，请重新确认。')
            else:
                messages.success(request, f'取餐单已更新为「{order.get_status_display()}」。')
        except ValidationError:
            messages.error(request, '订单状态已变化，请按制作顺序操作；已完成或已取消的订单不能回退。')
    return redirect(reverse('workbench-orders') + '?status=all&order=' + str(order.pk))


@permitted('order', 'delete')
@require_POST
def order_delete(request, order_id):
    get_object_or_404(Order, pk=order_id).delete()
    messages.success(request, '订单记录已删除。')
    return redirect('workbench-orders')


@permitted('store')
def store_settings(request):
    store = Store.objects.first()
    form = StoreForm(request.POST or None, instance=store)
    if request.method == 'POST':
        if not request.user.has_perm('coffee.change_store'):
            raise PermissionDenied
        if form.is_valid():
            form.save()
            messages.success(request, '门店资料已保存，小程序刷新后同步。')
            return redirect('workbench-store')
    return render(request, 'coffee/store.html', context(request, 'store', form=form))


urlpatterns = [
    path('', products, name='workbench-home'),
    path('products/', products, name='workbench-products'),
    path('products/new/', admin.site.admin_view(product_edit), name='workbench-product-new'),
    path('products/<int:product_id>/edit/', admin.site.admin_view(product_edit), name='workbench-product-edit'),
    path('products/<int:product_id>/toggle/', product_toggle, name='workbench-product-toggle'),
    path('products/<int:product_id>/delete/', product_delete, name='workbench-product-delete'),
    path('categories/', categories, name='workbench-categories'),
    path('categories/new/', admin.site.admin_view(category_edit), name='workbench-category-new'),
    path('categories/<int:category_id>/edit/', admin.site.admin_view(category_edit), name='workbench-category-edit'),
    path('categories/<int:category_id>/delete/', category_delete, name='workbench-category-delete'),
    path('orders/', orders, name='workbench-orders'),
    path('orders/<uuid:order_id>/status/', order_status, name='workbench-order-status'),
    path('orders/<uuid:order_id>/delete/', order_delete, name='workbench-order-delete'),
    path('store/', store_settings, name='workbench-store'),
    # Keep existing bookmarks working while retiring duplicate Django CRUD screens.
    path('coffee/product/', admin.site.admin_view(lambda request: redirect('workbench-products'))),
    path('coffee/product/add/', admin.site.admin_view(lambda request: redirect('workbench-product-new'))),
    path('coffee/product/<int:product_id>/change/', admin.site.admin_view(lambda request, product_id: redirect('workbench-product-edit', product_id=product_id))),
    path('coffee/category/', admin.site.admin_view(lambda request: redirect('workbench-categories'))),
    path('coffee/order/', admin.site.admin_view(lambda request: redirect('workbench-orders'))),
]
