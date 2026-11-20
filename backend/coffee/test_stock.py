import json
import uuid
from datetime import datetime
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import Client, TestCase
from django.utils import timezone

from .models import Category, Order, Product, Store


class StockTests(TestCase):
    def setUp(self):
        clock = patch('django.utils.timezone.now', return_value=timezone.make_aware(datetime(2026, 11, 20, 10)))
        clock.start()
        self.addCleanup(clock.stop)
        Store.objects.create()
        self.category = Category.objects.create(name='小食')
        self.product = Product.objects.create(category=self.category, name='芝士蛋糕', price='28.00', options={})
        self.auth = {'HTTP_AUTHORIZATION': 'Bearer ' + self.client.post('/api/session/').json()['token']}

    def payload(self, reserved=False):
        return {'request_id': str(uuid.uuid4()), 'expected_total': '28.00',
                'scheduled_for': '2026-11-20T12:00:00+08:00' if reserved else None,
                'items': [{'product_id': self.product.pk, 'quantity': 1, 'options': {}}]}

    def submit(self, payload):
        return self.client.post('/api/orders/create/', json.dumps(payload), content_type='application/json', **self.auth)

    def mark(self, stock, reservation=False):
        self.product.is_out_of_stock = stock
        self.product.reservation_only = reservation
        self.product.save()

    def test_all_stock_and_reservation_combinations(self):
        for stock, reserved, immediate_status, scheduled_status in [
            (False, False, 201, 201), (False, True, 400, 201),
            (True, False, 400, 400), (True, True, 400, 201),
        ]:
            with self.subTest(stock=stock, reserved=reserved):
                self.mark(stock, reserved)
                catalog = self.client.get('/api/catalog/').json()['products']
                self.assertEqual(catalog[0]['is_out_of_stock'], stock)
                self.assertEqual(catalog[0]['reservation_only'], reserved)
                self.assertEqual(self.submit(self.payload()).status_code, immediate_status)
                self.assertEqual(self.submit(self.payload(True)).status_code, scheduled_status)
                slots = self.client.get('/api/pickup-slots/', {'product_ids': self.product.pk})
                self.assertEqual(slots.status_code, 400 if stock and not reserved else 200)
                if slots.status_code == 200:
                    self.assertEqual(slots.json()['required'], reserved)

    def test_cached_product_and_time_cannot_bypass_a_new_stock_block(self):
        self.assertEqual(self.client.get('/api/pickup-slots/', {'product_ids': self.product.pk}).status_code, 200)
        self.mark(True)
        for reserved in (False, True):
            response = self.submit(self.payload(reserved))
            self.assertEqual(response.status_code, 400)
            self.assertIn('缺货', response.json()['message'])
        self.assertFalse(Order.objects.exists())

    def test_existing_order_retry_remains_idempotent_after_stock_change(self):
        payload = self.payload()
        first = self.submit(payload).json()
        self.mark(True)
        retry = self.submit(payload)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.json()['id'], first['id'])
        self.assertEqual(Order.objects.count(), 1)

    def test_unlisted_stock_cannot_be_reserved(self):
        self.mark(True, True)
        self.product.is_available = False
        self.product.save()
        self.assertEqual(self.client.get('/api/catalog/').json()['products'], [])
        self.assertEqual(self.submit(self.payload(True)).status_code, 400)

    def test_mixed_cart_blocks_the_whole_order_until_unavailable_item_removed(self):
        other = Product.objects.create(category=self.category, name='咖啡', price='20.00', options={})
        self.mark(True)
        payload = self.payload(True)
        payload['items'].append({'product_id': other.pk, 'quantity': 1, 'options': {}})
        payload['expected_total'] = '48.00'
        self.assertEqual(self.submit(payload).status_code, 400)
        self.assertFalse(Order.objects.exists())

    def test_staff_stock_controls_preserve_reservation_and_require_permission(self):
        user = get_user_model().objects.create_user(username='stock_reader', password='reader-test-only-4289', is_staff=True)
        user.user_permissions.add(Permission.objects.get(codename='view_product'))
        self.client.force_login(user)
        path = f'/admin/products/{self.product.pk}/stock/'
        self.assertEqual(self.client.post(path).status_code, 403)
        admin = get_user_model().objects.create_superuser(username='stock_admin', password='admin-test-only-4289')
        self.client.force_login(admin)
        self.assertEqual(self.client.get(path).status_code, 405)
        self.mark(False, True)
        self.assertEqual(self.client.post(path).status_code, 302)
        self.product.refresh_from_db()
        self.assertTrue(self.product.is_out_of_stock)
        self.assertTrue(self.product.reservation_only)
        self.assertContains(self.client.get('/admin/products/?availability=stock'), '缺货 · 可预约')
        self.assertEqual(self.client.post(path).status_code, 302)
        self.product.refresh_from_db()
        self.assertFalse(self.product.is_out_of_stock)
        csrf_client = Client(enforce_csrf_checks=True)
        csrf_client.force_login(admin)
        self.assertEqual(csrf_client.post(path).status_code, 403)

    def test_staff_form_exposes_stock_and_correct_group_examples(self):
        admin = get_user_model().objects.create_superuser(username='stock_editor', password='editor-test-only-4289')
        self.client.force_login(admin)
        response = self.client.get(f'/admin/products/{self.product.pk}/edit/')
        for text in ('name="is_out_of_stock"', 'placeholder="例如：冰"', 'placeholder="例如：大杯"', 'placeholder="例如：七分糖"'):
            self.assertContains(response, text)
        self.assertContains(response, 'specifications.css?v=')
