import secrets
import uuid
from datetime import time
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models


def default_options():
    return {
        'temperature': [{'label': '热', 'extra': '0.00'}, {'label': '冰', 'extra': '0.00'}],
        'size': [{'label': '标准杯', 'extra': '0.00'}, {'label': '大杯', 'extra': '4.00'}],
        'sweetness': [{'label': '标准甜', 'extra': '0.00'}, {'label': '半甜', 'extra': '0.00'}, {'label': '不另加糖', 'extra': '0.00'}],
    }


def validate_options(value):
    if not isinstance(value, dict) or set(value) - {'temperature', 'size', 'sweetness'}:
        raise ValidationError('规格必须是对象，且只包含 temperature、size、sweetness。')
    for choices in value.values():
        if not isinstance(choices, list) or not 1 <= len(choices) <= 10:
            raise ValidationError('每项规格必须有 1 到 10 个选项。')
        labels = set()
        for choice in choices:
            if not isinstance(choice, dict) or not isinstance(choice.get('label'), str) or not 1 <= len(choice['label'].strip()) <= 20:
                raise ValidationError('每个选项名称需要填写 1 到 20 个字。')
            if choice['label'] in labels:
                raise ValidationError('同一项规格的选项名称不可重复。')
            labels.add(choice['label'])
            try:
                extra = Decimal(str(choice.get('extra', '0')))
                if not extra.is_finite() or extra < 0 or extra > 999 or extra.as_tuple().exponent < -2:
                    raise ValueError
            except (ValueError, TypeError, ArithmeticError):
                raise ValidationError('加价金额请填写 0 至 999 之间的数字，最多两位小数。')


class Store(models.Model):
    name = models.CharField('门店名称', max_length=80, default='慢屿 · 梧桐街店')
    address = models.CharField('门店地址', max_length=200, default='梧桐街 18 号 · 一楼临街')
    phone = models.CharField('门店电话（选填）', max_length=30, blank=True)
    opening_time = models.TimeField('开始营业', default=time(8, 0))
    closing_time = models.TimeField('结束营业', default=time(20, 0))
    is_open = models.BooleanField('接受点单', default=True, help_text='手动营业开关；营业时间作为展示信息，不自动开关。')
    pickup_minutes = models.PositiveSmallIntegerField('预计制作分钟', default=10, validators=[MinValueValidator(1), MaxValueValidator(180)])
    announcement = models.CharField('门店公告', max_length=200, default='认真做好每一杯日常。')

    class Meta:
        verbose_name = '门店设置'
        verbose_name_plural = verbose_name

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Category(models.Model):
    name = models.CharField('分类名称', max_length=40, unique=True)
    sort_order = models.PositiveIntegerField('排序', default=0, help_text='越小越靠前')
    is_active = models.BooleanField('显示分类', default=True)

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name = '商品分类'
        verbose_name_plural = verbose_name

    def __str__(self):
        return self.name


class Product(models.Model):
    category = models.ForeignKey(Category, verbose_name='商品分类', on_delete=models.PROTECT, related_name='products')
    name = models.CharField('商品名称', max_length=80)
    english_name = models.CharField('英文名称', max_length=120, blank=True)
    description = models.TextField('商品描述', max_length=1000, blank=True)
    flavor = models.CharField('风味简述', max_length=120, blank=True)
    price = models.DecimalField('基础售价', max_digits=7, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    image = models.ImageField('商品图片', upload_to='products/', blank=True)
    fallback_image = models.CharField('内置图片', max_length=30, default='latte.jpg', choices=[('latte.jpg', '拿铁'), ('americano.jpg', '美式'), ('croissant.jpg', '可颂')])
    options = models.JSONField('规格与加价', default=default_options, blank=True, validators=[validate_options], help_text='勾选需要的规格，填写选项名称与加价；关闭全部规格适用于小食。')
    is_available = models.BooleanField('上架', default=True)
    is_featured = models.BooleanField('首页推荐', default=False)
    sort_order = models.PositiveIntegerField('排序', default=0)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        ordering = ['sort_order', 'id']
        verbose_name = '咖啡与小食'
        verbose_name_plural = verbose_name

    def __str__(self):
        return self.name


class CustomerSession(models.Model):
    token = models.CharField(max_length=64, unique=True, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def issue(cls):
        return cls.objects.create(token=secrets.token_urlsafe(32))


class TicketCounter(models.Model):
    date = models.DateField(unique=True)
    counter = models.PositiveIntegerField(default=0)


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', '待接单'
        PREPARING = 'preparing', '制作中'
        READY = 'ready', '待取餐'
        COMPLETED = 'completed', '已完成'
        CANCELLED = 'cancelled', '已取消'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(CustomerSession, verbose_name='顾客会话', on_delete=models.PROTECT)
    request_id = models.UUIDField('提交标识', unique=True, editable=False)
    pickup_code = models.CharField('取餐码', max_length=20, unique=True, blank=True)
    customer_name = models.CharField('取餐称呼', max_length=20, blank=True)
    note = models.CharField('顾客备注', max_length=200, blank=True)
    status = models.CharField('订单状态', max_length=20, choices=Status.choices, default=Status.PENDING)
    total = models.DecimalField('商品合计', max_digits=9, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    store_name = models.CharField('下单门店', max_length=80)
    store_address = models.CharField('取餐地址', max_length=200)
    pickup_minutes = models.PositiveSmallIntegerField('预计制作分钟', default=10)
    created_at = models.DateTimeField('下单时间', auto_now_add=True)
    updated_at = models.DateTimeField('更新时间', auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = '自取订单'
        verbose_name_plural = verbose_name

    def clean(self):
        super().clean()
        if not self._state.adding:
            old_status = Order.objects.filter(pk=self.pk).values_list('status', flat=True).first()
            allowed = {
                'pending': {'pending', 'preparing', 'cancelled'},
                'preparing': {'preparing', 'ready', 'cancelled'},
                'ready': {'ready', 'completed', 'cancelled'},
                'completed': {'completed'}, 'cancelled': {'cancelled'},
            }
            if old_status and self.status not in allowed[old_status]:
                raise ValidationError({'status': '请按待接单 → 制作中 → 待取餐 → 已完成的顺序更新；完成或取消后不可更改。'})

    def save(self, *args, **kwargs):
        if not self.pickup_code:
            self.pickup_code = 'A' + self.id.hex[:12].upper()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.pickup_code} · {self.get_status_display()}'


class OrderItem(models.Model):
    order = models.ForeignKey(Order, verbose_name='订单', on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, verbose_name='商品', on_delete=models.SET_NULL, null=True)
    product_name = models.CharField('商品名称', max_length=80)
    specification = models.CharField('规格', max_length=200, blank=True)
    unit_price = models.DecimalField('单价', max_digits=8, decimal_places=2)
    quantity = models.PositiveSmallIntegerField('数量', validators=[MinValueValidator(1), MaxValueValidator(20)])
    image = models.CharField('商品图片', max_length=500, blank=True)

    class Meta:
        verbose_name = '订单商品'
        verbose_name_plural = verbose_name

    def __str__(self):
        return f'{self.product_name} × {self.quantity}'
