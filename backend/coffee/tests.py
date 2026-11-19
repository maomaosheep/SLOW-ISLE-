import json
import uuid
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import Client, TestCase

from .models import Category, Order, Product, Store, TicketCounter, default_options, validate_options


class OrderingTests(TestCase):
    def setUp(self):
        self.store = Store.objects.create()
        self.category = Category.objects.create(name='风味特调')
        self.product = Product.objects.create(category=self.category, name='海盐焦糖拿铁', price=Decimal('28.00'), options=default_options())
        self.token = self.client.post('/api/session/').json()['token']
        self.auth = {'HTTP_AUTHORIZATION': 'Bearer ' + self.token}

    def payload(self, **overrides):
        data = {'request_id': str(uuid.uuid4()), 'customer_name': '小屿', 'note': '谢谢', 'expected_total': '32.00',
                'items': [{'product_id': self.product.pk, 'quantity': 1,
                           'options': {'temperature': '冰', 'size': '大杯', 'sweetness': '半甜'}}]}
        data.update(overrides)
        return data

    def submit(self, payload=None, auth=None):
        return self.client.post('/api/orders/create/', data=json.dumps(payload or self.payload()), content_type='application/json', **(auth or self.auth))

    def test_variant_price_and_snapshot_are_computed_on_server(self):
        data = self.payload()
        data['items'][0]['price'] = '0.01'
        response = self.submit(data)
        self.assertEqual(response.status_code, 201)
        order = response.json()
        self.assertEqual(order['total'], '32.00')
        self.assertEqual(order['items'][0]['unit_price'], '32.00')
        self.assertEqual(order['items'][0]['specification'], '冰 / 大杯 / 半甜')
        self.assertEqual(order['pickup_code'], 'A001')
        self.assertEqual(order['store_name'], self.store.name)

    def test_price_change_needs_new_confirmation_and_creates_nothing(self):
        response = self.submit(self.payload(expected_total='0.01'))
        self.assertEqual(response.status_code, 409)
        self.assertFalse(Order.objects.exists())
        self.assertFalse(TicketCounter.objects.exists())

    def test_idempotent_retry_returns_same_order_even_when_store_closed(self):
        payload = self.payload()
        first = self.submit(payload).json()
        Store.objects.update(is_open=False)
        second = self.submit(payload)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first['id'], second.json()['id'])
        self.assertEqual(Order.objects.count(), 1)
        self.assertEqual(TicketCounter.objects.get().counter, 1)

    def test_daily_tickets_increment(self):
        self.assertEqual(self.submit().json()['pickup_code'], 'A001')
        self.assertEqual(self.submit().json()['pickup_code'], 'A002')

    def test_orders_are_private_to_device_session(self):
        payload = self.payload()
        order = self.submit(payload).json()
        token = self.client.post('/api/session/').json()['token']
        other_auth = {'HTTP_AUTHORIZATION': 'Bearer ' + token}
        self.assertEqual(self.client.get('/api/orders/' + order['id'] + '/', **other_auth).status_code, 404)
        self.assertEqual(self.client.get('/api/orders/', **other_auth).json()['results'], [])
        self.assertEqual(self.submit(payload, other_auth).status_code, 409)
        self.assertEqual(self.client.post('/api/orders/' + order['id'] + '/cancel/', **other_auth).status_code, 404)

    def test_orders_require_authentication(self):
        self.assertEqual(self.client.get('/api/orders/').status_code, 401)
        self.assertEqual(self.client.post('/api/orders/create/', data='{}', content_type='application/json').status_code, 401)

    def test_off_shelf_and_hidden_category_are_unorderable(self):
        self.product.is_available = False
        self.product.save()
        self.assertEqual(self.client.get('/api/catalog/').json()['products'], [])
        self.assertEqual(self.submit().status_code, 400)
        self.product.is_available = True
        self.product.save()
        self.category.is_active = False
        self.category.save()
        self.assertEqual(self.client.get('/api/catalog/').json()['products'], [])
        self.assertEqual(self.submit().status_code, 400)

    def test_store_closed_refuses_new_orders(self):
        Store.objects.update(is_open=False)
        self.assertEqual(self.submit().status_code, 409)
        self.assertFalse(Order.objects.exists())

    def test_malformed_requests_are_rejected(self):
        invalids = [
            self.payload(items=[]), self.payload(items='bad'), self.payload(request_id='bad'),
            self.payload(customer_name='x' * 21), self.payload(note=[]),
            self.payload(items=[{'product_id': self.product.pk, 'quantity': True, 'options': {}}]),
            self.payload(items=[{'product_id': self.product.pk, 'quantity': 21, 'options': {}}]),
            self.payload(items=[{'product_id': self.product.pk, 'quantity': 1, 'options': {'size': '标准杯'}}]),
            self.payload(items=[{'product_id': self.product.pk, 'quantity': 1, 'options': {'temperature':'冷冻', 'size':'大杯', 'sweetness':'半甜'}}]),
        ]
        for data in invalids:
            with self.subTest(data=data):
                self.assertEqual(self.submit(data).status_code, 400)
        response = self.client.post('/api/orders/create/', data='[]', content_type='application/json', **self.auth)
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Order.objects.exists())

    def test_quantity_limit_is_enforced_across_lines(self):
        data = self.payload()
        data['items'] = [dict(data['items'][0], quantity=20) for _ in range(3)]
        data['expected_total'] = '1920.00'
        self.assertEqual(self.submit(data).status_code, 400)

    def test_only_pending_orders_can_be_cancelled_and_cancel_is_idempotent(self):
        order = self.submit().json()
        url = '/api/orders/' + order['id'] + '/cancel/'
        self.assertEqual(self.client.post(url, **self.auth).json()['status'], 'cancelled')
        self.assertEqual(self.client.post(url, **self.auth).json()['status'], 'cancelled')
        other = self.submit().json()
        Order.objects.filter(pk=other['id']).update(status='preparing')
        self.assertEqual(self.client.post('/api/orders/' + other['id'] + '/cancel/', **self.auth).status_code, 409)

    def test_product_deletion_preserves_order_snapshot(self):
        order = self.submit().json()
        self.product.delete()
        response = self.client.get('/api/orders/' + order['id'] + '/', **self.auth)
        self.assertEqual(response.json()['items'][0]['product_name'], '海盐焦糖拿铁')
        self.assertEqual(response.json()['total'], '32.00')
        self.assertIsNone(Order.objects.get(pk=order['id']).items.get().product_id)

    def test_no_options_baked_goods(self):
        self.product.options = {}
        self.product.save()
        data = self.payload(expected_total='56.00', items=[{'product_id':self.product.pk,'quantity':2,'options':{}}])
        self.assertEqual(self.submit(data).status_code, 201)

    def test_order_pagination(self):
        self.submit()
        data = self.client.get('/api/orders/', **self.auth).json()
        self.assertEqual(len(data['results']), 1)
        self.assertFalse(data['has_more'])
        self.assertEqual(self.client.get('/api/orders/?page=bad', **self.auth).status_code, 400)

    def test_options_validator_rejects_invalid_prices(self):
        for value in ['NaN', '-1', 'Infinity', '1.001', '1000', []]:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                validate_options({'size': [{'label':'大杯', 'extra':value}]})
        validate_options({})

    def test_order_state_cannot_move_backwards(self):
        order = Order.objects.get(pk=self.submit().json()['id'])
        order.status = 'preparing'
        order.full_clean(); order.save()
        order.status = 'pending'
        with self.assertRaises(ValidationError):
            order.full_clean()


class AdminTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(username='test_admin', password='testing-admin-password-4289')

    def test_admin_requires_login(self):
        self.assertEqual(self.client.get('/admin/products/').status_code, 302)

    def test_admin_category_crud(self):
        self.client.force_login(self.user)
        self.assertContains(self.client.get('/admin/'), '慢屿咖啡')
        result = self.client.post('/admin/categories/new/', {'name':'测试分类','sort_order':0,'is_active':'on'})
        self.assertEqual(result.status_code, 302)
        category = Category.objects.get(name='测试分类')
        result = self.client.post(f'/admin/categories/{category.pk}/edit/', {'name':'修改后的分类','sort_order':2,'is_active':'on'})
        self.assertEqual(result.status_code, 302)
        self.assertContains(self.client.get('/admin/categories/'), '修改后的分类')
        result = self.client.post(f'/admin/categories/{category.pk}/delete/')
        self.assertEqual(result.status_code, 302)
        self.assertFalse(Category.objects.exists())


class WorkbenchTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_superuser(username='manager', password='manager-testing-4289')
        self.client.force_login(self.user)
        self.category = Category.objects.create(name='经典咖啡')
        self.product = Product.objects.create(name='测试拿铁', category=self.category, price='28.00')
        Store.objects.create()

    def product_data(self, **overrides):
        data = {'name': '测试大杯拿铁', 'category': self.category.pk, 'price': '28.00', 'fallback_image': 'latte.jpg',
                'is_available': 'on', 'sort_order': '0', 'options_size_enabled': 'on',
                'options_size_label': ['标准杯', '大杯'], 'options_size_extra': ['0', '4']}
        data.update(overrides)
        return data

    def test_product_form_is_visual_and_roundtrips_existing_specifications(self):
        result = self.client.get(f'/admin/products/{self.product.pk}/edit/')
        self.assertContains(result, 'data-spec-editor')
        self.assertContains(result, '添加杯型选项')
        self.assertNotContains(result, 'name="options"')
        self.assertContains(result, 'value="大杯"')
        self.assertContains(result, 'value="4.00"')

    def test_create_edit_toggle_and_delete_product(self):
        result = self.client.post('/admin/products/new/', self.product_data())
        self.assertEqual(result.status_code, 302)
        product = Product.objects.get(name='测试大杯拿铁')
        self.assertEqual(product.options, {'size': [{'label': '标准杯', 'extra': '0.00'}, {'label': '大杯', 'extra': '4.00'}]})
        result = self.client.post(f'/admin/products/{product.pk}/edit/', self.product_data(name='改名拿铁', options_size_extra=['0', '5']))
        self.assertEqual(result.status_code, 302)
        product.refresh_from_db()
        self.assertEqual(product.options['size'][1]['extra'], '5.00')
        self.client.post(f'/admin/products/{product.pk}/toggle/')
        product.refresh_from_db(); self.assertFalse(product.is_available)
        self.assertEqual(self.client.get(f'/admin/products/{product.pk}/delete/').status_code, 405)
        self.client.post(f'/admin/products/{product.pk}/delete/')
        self.assertFalse(Product.objects.filter(pk=product.pk).exists())

    def test_disabled_specs_removed_and_invalid_price_preserves_form(self):
        invalid = self.client.post(f'/admin/products/{self.product.pk}/edit/', self.product_data(options_size_extra=['0', '-4']))
        self.assertEqual(invalid.status_code, 200)
        self.assertContains(invalid, '加价金额请填写')
        self.product.refresh_from_db()
        self.assertEqual(self.product.options, default_options())
        response = self.client.post(f'/admin/products/{self.product.pk}/edit/', self.product_data(options_size_enabled=''))
        self.assertEqual(response.status_code, 302)
        self.product.refresh_from_db(); self.assertEqual(self.product.options, {})

    def test_duplicate_and_blank_options_rejected(self):
        for labels in [['大杯', '大杯'], ['标准杯', '']]:
            result = self.client.post('/admin/products/new/', self.product_data(options_size_label=labels))
            self.assertEqual(result.status_code, 200)
            self.assertEqual(Product.objects.count(), 1)

    def test_product_filters_and_store_pages(self):
        self.assertContains(self.client.get('/admin/products/?q=测试'), '测试拿铁')
        self.assertNotContains(self.client.get('/admin/products/?q=不存在'), '测试拿铁')
        self.assertContains(self.client.get('/admin/store/'), '接受点单')
        self.assertEqual(self.client.get('/admin/orders/?order=invalid').status_code, 200)

    def test_nonstaff_and_readonly_staff_permissions(self):
        from django.contrib.auth.models import Permission
        user = get_user_model().objects.create_user(username='viewer', password='viewer-4289', is_staff=True)
        user.user_permissions.add(Permission.objects.get(codename='view_product'))
        self.client.force_login(user)
        self.assertEqual(self.client.get('/admin/products/').status_code, 200)
        self.assertEqual(self.client.post('/admin/products/new/', self.product_data()).status_code, 403)
        self.assertEqual(self.client.post(f'/admin/products/{self.product.pk}/delete/').status_code, 403)
        self.assertEqual(self.client.post(f'/admin/products/{self.product.pk}/toggle/').status_code, 403)
        self.assertEqual(self.client.get('/admin/orders/').status_code, 403)

    def test_category_with_products_is_not_deleted(self):
        result = self.client.post(f'/admin/categories/{self.category.pk}/delete/', follow=True)
        self.assertContains(result, '请先把商品移到其他分类')
        self.assertTrue(Category.objects.filter(pk=self.category.pk).exists())

    def test_mutations_require_csrf(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.user)
        self.assertEqual(client.post(f'/admin/products/{self.product.pk}/toggle/').status_code, 403)

    def test_order_workflow_uses_snapshot_and_refuses_backwards_transition(self):
        customer_token = self.client.post('/api/session/').json()['token']
        data = {'request_id': str(uuid.uuid4()), 'expected_total': '32.00', 'customer_name': '门店测试',
                'items': [{'product_id': self.product.pk, 'quantity': 1,
                           'options': {'temperature': '热', 'size': '大杯', 'sweetness': '标准甜'}}]}
        response = self.client.post('/api/orders/create/', data=json.dumps(data), content_type='application/json', HTTP_AUTHORIZATION='Bearer ' + customer_token)
        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(pk=response.json()['id'])
        self.assertContains(self.client.get('/admin/orders/'), '门店测试')
        for status in ['preparing', 'ready', 'completed']:
            result = self.client.post(f'/admin/orders/{order.pk}/status/', {'status': status})
            self.assertEqual(result.status_code, 302)
            order.refresh_from_db(); self.assertEqual(order.status, status)
        self.client.post(f'/admin/orders/{order.pk}/status/', {'status': 'pending'})
        order.refresh_from_db(); self.assertEqual(order.status, 'completed')
        self.assertEqual(self.client.post(f'/admin/orders/{order.pk}/delete/').status_code, 302)
        self.assertFalse(Order.objects.exists())
