from datetime import timedelta

from django.utils import timezone
from django.utils.dateparse import parse_datetime


def lead_minutes(store, products):
    return max([store.pickup_minutes] + [p.reservation_lead_minutes for p in products if p.reservation_only])


def during_hours(store, moment):
    clock = timezone.localtime(moment).time()
    start, end = store.opening_time, store.closing_time
    if start == end:
        return True
    if start < end:
        return start <= clock <= end
    return clock >= start or clock <= end


def pickup_choices(store, products, now=None):
    now = now or timezone.now()
    required = any(p.reservation_only for p in products)
    earliest = now + timedelta(minutes=lead_minutes(store, products))
    cursor = timezone.localtime(earliest).replace(second=0, microsecond=0)
    cursor += timedelta(minutes=(-cursor.minute) % 15)
    if cursor < earliest:
        cursor += timedelta(minutes=15)
    deadline = now + timedelta(hours=24)
    today = timezone.localdate(now)
    slots = []
    while store.is_open and cursor <= deadline:
        if during_hours(store, cursor):
            day = '今天' if cursor.date() == today else '明天'
            slots.append({'value': cursor.isoformat(), 'label': f'{day} {cursor:%m月%d日 %H:%M}'})
        cursor += timedelta(minutes=15)
    return {'required': required, 'lead_minutes': lead_minutes(store, products),
            'server_now': now.isoformat(), 'deadline': deadline.isoformat(), 'slots': slots}


def validate_pickup(store, products, value, now=None):
    if value is None:
        if any(p.reservation_only for p in products):
            raise ValueError('购物袋含仅接受预约的商品，请选择预约取餐时间。')
        return None
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError('请选择有效的预约取餐时间。')
    try:
        moment = parse_datetime(value)
    except ValueError:
        moment = None
    if moment is None or timezone.is_naive(moment):
        raise ValueError('预约时间无效，请重新选择。')
    now = now or timezone.now()
    if moment > now + timedelta(hours=24):
        raise ValueError('最多只能预约下单后 24 小时内的取餐时间。')
    minutes = lead_minutes(store, products)
    if moment < now + timedelta(minutes=minutes):
        raise ValueError(f'预约时间已过期或准备时间不足，请选择至少 {minutes} 分钟后的时段。')
    local = timezone.localtime(moment)
    if local.minute % 15 or local.second or local.microsecond or not during_hours(store, moment):
        raise ValueError('请选择营业时间内每 15 分钟一个的预约时段。')
    return moment
