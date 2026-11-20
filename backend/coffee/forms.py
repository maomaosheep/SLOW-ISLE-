from decimal import Decimal, InvalidOperation

from django import forms
from django.conf import settings
from django.templatetags.static import static

from .models import Category, Product, Store, validate_options


class SpecificationWidget(forms.Widget):
    template_name = 'coffee/specification_widget.html'
    groups = [('temperature', '温度'), ('size', '杯型'), ('sweetness', '甜度')]

    def value_omitted_from_data(self, data, files, name):
        # Disabled groups intentionally mean {}; don't restore the model's default.
        return False

    def value_from_datadict(self, data, files, name):
        result = {}
        for key, _ in self.groups:
            if data.get(f'{name}_{key}_enabled') != 'on':
                continue
            labels = data.getlist(f'{name}_{key}_label')
            prices = data.getlist(f'{name}_{key}_extra')
            result[key] = [{'label': label.strip(), 'extra': prices[index] if index < len(prices) else ''}
                           for index, label in enumerate(labels)]
        return result

    def get_context(self, name, value, attrs):
        context = super().get_context(name, value, attrs)
        value = value if isinstance(value, dict) else {}
        context['groups'] = [
            {'key': key, 'title': title, 'enabled': key in value,
             'placeholder': {'temperature': '例如：冰', 'size': '例如：大杯', 'sweetness': '例如：七分糖'}[key],
             'rows': value.get(key) or [{'label': '', 'extra': '0.00'}]}
            for key, title in self.groups
        ]
        return context

    @property
    def media(self):
        assets = settings.BASE_DIR / 'static' / 'coffee'
        version = max((assets / name).stat().st_mtime_ns for name in ('specifications.css', 'specifications.js'))
        return forms.Media(css={'all': (f'{static("coffee/specifications.css")}?v={version}',)}, js=(f'{static("coffee/specifications.js")}?v={version}',))


class SpecificationField(forms.Field):
    widget = SpecificationWidget

    def clean(self, value):
        value = value or {}
        validate_options(value)
        for choices in value.values():
            for choice in choices:
                try:
                    choice['extra'] = str(Decimal(choice['extra']).quantize(Decimal('0.01')))
                except (InvalidOperation, ValueError):
                    raise forms.ValidationError('请填写有效的加价金额。')
        return value


class ProductForm(forms.ModelForm):
    options = SpecificationField(required=False, label='规格与加价', help_text='打开需要的规格，填写选项和加价即可；原价选项的加价填 0。')
    reservation_lead_minutes = forms.IntegerField(required=False, initial=60, min_value=1, max_value=1440,
        label='预约最少提前（分钟）', help_text='仅接受预约时生效，例如 120 表示提前 2 小时。顾客只能预约未来 24 小时内的营业时段。')

    def clean_reservation_lead_minutes(self):
        return self.cleaned_data.get('reservation_lead_minutes') or 60

    class Meta:
        model = Product
        fields = ['name', 'english_name', 'category', 'price', 'image', 'fallback_image',
                  'flavor', 'description', 'options', 'is_available', 'is_out_of_stock', 'reservation_only',
                  'reservation_lead_minutes', 'is_featured', 'sort_order']
        widgets = {'description': forms.Textarea(attrs={'rows': 3}), 'price': forms.NumberInput(attrs={'step': '0.01', 'min': '0.01'})}


class CategoryForm(forms.ModelForm):
    class Meta:
        model = Category
        fields = ['name', 'sort_order', 'is_active']


class StoreForm(forms.ModelForm):
    class Meta:
        model = Store
        fields = ['name', 'address', 'phone', 'opening_time', 'closing_time', 'pickup_minutes', 'is_open', 'announcement']
        widgets = {'opening_time': forms.TimeInput(format='%H:%M', attrs={'type': 'time'}),
                   'closing_time': forms.TimeInput(format='%H:%M', attrs={'type': 'time'})}
