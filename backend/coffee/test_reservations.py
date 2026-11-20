import json
import uuid
from datetime import datetime, time, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from .models import Category, Order, Product, Store


class ReservationTests(TestCase):
    def setUp(self):
        self.now = timezone.make_aware(datetime(2026, 11, 20, 10, 7))
        clock = patch('django.utils.timezone.now', return_value=self.now)
        clock.start()
        self.addCleanup(clock.stop)
        self.store = Store.objects.create()
        self.category = Category.objects.create(name='甜点')
        self.product = Product.objects.create(name='黄油芝士蛋糕', category=self.category, price='28.00', options={})
        token = self.client.post('/api/session/').json()['token']
        self.auth = {'HTTP_AUTHORIZATION': 'Bearer ' + token}

    def choices(self, ids=None):
        return self.client.get('/api/pickup-slots/', {'product_ids': ids or str(self.product.pk)})

    def payload(self, **changes):
        data = {'request_id': str(uuid.uuid4()), 'expected_total': '28.00',
                'items': [{'product_id': self.product.pk, 'quantity': 1, 'options': {}}]}
        data.update(changes)
        return data

    def submit(self, data):
        return self.client.post('/api/orders/create/', json.dumps(data), content_type='application/json', **self.auth)

    def require_reservation(self, minutes=120):
        self.product.reservation_only = True
        self.product.reservation_lead_minutes = minutes
        self.product.save()

    def test_slots_follow_server_clock_hours_and_24_hour_limit(self):
        result = self.choices().json()
        self.assertFalse(result['required'])
        self.assertEqual(result['slots'][0]['label'], '今天 11月20日 10:30')
        self.assertTrue(any('明天' in slot['label'] for slot in result['slots']))
        for slot in result['slots']:
            value = datetime.fromisoformat(slot['value'])
            self.assertGreaterEqual(value, self.now + timedelta(minutes=10))
            self.assertLessEqual(value, self.now + timedelta(hours=24))
            self.assertEqual(value.minute % 15, 0)
            self.assertTrue(time(8) <= value.time() <= time(20))

    def test_regular_product_supports_both_immediate_and_reserved_orders(self):
        self.assertIsNone(self.submit(self.payload()).json()['scheduled_for'])
        value = self.choices().json()['slots'][0]['value']
        response = self.submit(self.payload(scheduled_for=value))
        self.assertEqual(response.status_code, 201)
        order = Order.objects.get(pk=response.json()['id'])
        self.assertEqual(order.scheduled_for, datetime.fromisoformat(value))
        self.assertEqual(response.json()['pickup_label'], '11月20日 10:30')
        listing = self.client.get('/api/orders/', **self.auth).json()['results']
        self.assertEqual(next(item for item in listing if item['id'] == str(order.pk))['scheduled_for'], response.json()['scheduled_for'])
        reserved = self.client.get('/api/orders/?kind=reserved', **self.auth).json()['results']
        self.assertEqual([entry['id'] for entry in reserved], [str(order.pk)])

    def test_reservation_only_goods_stay_visible_but_cannot_order_immediately(self):
        self.require_reservation()
        product = self.client.get('/api/catalog/').json()['products'][0]
        self.assertTrue(product['reservation_only'])
        self.assertEqual(product['reservation_lead_minutes'], 120)
        self.assertEqual(self.submit(self.payload()).status_code, 400)
        options = self.choices().json()
        self.assertTrue(options['required'])
        self.assertEqual(options['slots'][0]['label'], '今天 11月20日 12:15')
        self.assertEqual(self.submit(self.payload(scheduled_for=options['slots'][0]['value'])).status_code, 201)

    def test_mixed_cart_uses_longest_preparation_time(self):
        self.require_reservation(180)
        coffee = Product.objects.create(name='咖啡', category=self.category, price='20', options={})
        options = self.choices(f'{self.product.pk},{coffee.pk}').json()
        self.assertEqual(options['lead_minutes'], 180)
        self.assertTrue(options['required'])
        payload = self.payload(expected_total='48.00', scheduled_for=options['slots'][0]['value'])
        payload['items'].append({'product_id': coffee.pk, 'quantity': 1, 'options': {}})
        self.assertEqual(self.submit(payload).status_code, 201)

    def test_invalid_past_too_early_beyond_limit_off_grid_and_closed_hours_rejected(self):
        invalid = ['bad', '', '2026-11-20T12:00:00', 123, {},
                   (self.now - timedelta(minutes=1)).isoformat(),
                   (self.now + timedelta(minutes=5)).isoformat(),
                   (self.now + timedelta(hours=24, seconds=1)).isoformat(),
                   '2026-11-20T12:01:00+08:00', '2026-11-20T23:00:00+08:00']
        for value in invalid:
            with self.subTest(value=value):
                self.assertEqual(self.submit(self.payload(scheduled_for=value)).status_code, 400)
        self.assertFalse(Order.objects.exists())

    def test_exact_24_hour_boundary_and_offset_equivalence(self):
        with patch('django.utils.timezone.now', return_value=self.now.replace(minute=0)):
            value = (self.now.replace(minute=0) + timedelta(hours=24)).isoformat()
            self.assertEqual(self.submit(self.payload(scheduled_for=value)).status_code, 201)
        # UTC input is compared as an instant, then checked against Shanghai business hours.
        self.assertEqual(self.submit(self.payload(scheduled_for='2026-11-20T04:00:00+00:00')).status_code, 201)

    def test_changed_preparation_time_revalidated_at_submit(self):
        value = self.choices().json()['slots'][0]['value']
        self.require_reservation(300)
        self.assertEqual(self.submit(self.payload(scheduled_for=value)).status_code, 400)

    def test_unavailable_items_and_bad_identifiers_cannot_get_slots(self):
        for ids in ['bad', '0', '-1', '1,' + '9' * 450]:
            self.assertEqual(self.choices(ids).status_code, 400)
        self.product.is_available = False
        self.product.save()
        self.assertEqual(self.choices().status_code, 400)

    def test_closed_store_and_no_slots_within_24_hours(self):
        self.store.is_open = False
        self.store.save()
        self.assertEqual(self.choices().json()['slots'], [])
        self.assertEqual(self.submit(self.payload(scheduled_for='2026-11-20T12:00:00+08:00')).status_code, 409)
        self.store.is_open = True
        self.store.save()
        self.require_reservation(1440)
        self.assertEqual(self.choices().json()['slots'], [])

    def test_overnight_business_hours(self):
        self.store.opening_time, self.store.closing_time = time(20), time(4)
        self.store.save()
        slots = self.choices().json()['slots']
        self.assertTrue(slots)
        self.assertTrue(all(datetime.fromisoformat(slot['value']).hour >= 20 or datetime.fromisoformat(slot['value']).time() <= time(4) for slot in slots))

    def test_retry_keeps_same_order_even_after_reservation_time_has_passed(self):
        data = self.payload(scheduled_for=self.choices().json()['slots'][0]['value'])
        first = self.submit(data).json()
        with patch('django.utils.timezone.now', return_value=self.now + timedelta(days=2)):
            self.assertEqual(self.submit(data).json()['id'], first['id'])
        self.assertEqual(Order.objects.count(), 1)

    def test_pickup_codes_share_counter_for_the_collection_day(self):
        value = '2026-11-21T09:00:00+08:00'
        reserved = self.submit(self.payload(scheduled_for=value)).json()
        self.assertEqual(reserved['order_number'], '261121-A001')
        with patch('django.utils.timezone.now', return_value=self.now + timedelta(days=1)):
            immediate = self.submit(self.payload()).json()
        self.assertEqual(immediate['order_number'], '261121-A002')

    def test_staff_form_and_reservation_queue(self):
        user = get_user_model().objects.create_superuser(username='reservation_manager', password='reservation-testing-4289')
        value = self.choices().json()['slots'][0]['value']
        self.submit(self.payload(scheduled_for=value))
        self.client.force_login(user)
        response = self.client.get(f'/admin/products/{self.product.pk}/edit/')
        self.assertContains(response, 'name="reservation_only"')
        self.assertContains(response, 'name="reservation_lead_minutes"')
        response = self.client.get('/admin/orders/?status=reserved')
        self.assertContains(response, '11月20日 10:30')
        self.assertContains(response, '预约取餐')
        response = self.client.post(f'/admin/products/{self.product.pk}/edit/', {
            'name': self.product.name, 'category': self.category.pk, 'price': '28.00', 'fallback_image': 'latte.jpg',
            'is_available': 'on', 'reservation_only': 'on', 'reservation_lead_minutes': 180, 'sort_order': 0})
        self.assertEqual(response.status_code, 302)
        self.product.refresh_from_db()
        self.assertTrue(self.product.reservation_only)
        self.assertEqual(self.product.reservation_lead_minutes, 180)
