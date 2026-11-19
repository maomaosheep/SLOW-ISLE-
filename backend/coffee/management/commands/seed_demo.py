from decimal import Decimal
from django.core.management.base import BaseCommand
from coffee.models import Category, Product, Store, default_options


class Command(BaseCommand):
    help = '初始化演示门店和商品，保留已有商品修改；不会创建默认管理员。'

    def handle(self, *args, **kwargs):
        Store.objects.get_or_create(pk=1)
        categories = {}
        for index, name in enumerate(['经典咖啡', '风味特调', '烘焙小食']):
            categories[name], _ = Category.objects.get_or_create(name=name, defaults={'sort_order': index})
        data = [
            ('海盐焦糖拿铁', 'Sea Salt Caramel Latte', '风味特调', '28.00', 'latte.jpg', '醇厚浓缩 / 海盐 / 焦糖', '海盐轻轻提味，焦糖缓缓融入。与醇厚浓缩相遇，是一口温柔的平衡。', default_options(), True),
            ('经典美式', 'Classic Americano', '经典咖啡', '20.00', 'americano.jpg', '干净明亮 / 坚果余韵', '双份浓缩与纯净水，轻盈、干净，留下坚果与可可的余韵。', {'temperature': [{'label':'热','extra':'0.00'},{'label':'冰','extra':'0.00'}], 'size':[{'label':'标准杯','extra':'0.00'},{'label':'大杯','extra':'4.00'}]}, False),
            ('黄油可颂', 'Butter Croissant', '烘焙小食', '16.00', 'croissant.jpg', '层层酥香 / 每日烘焙', '轻轻一掰，酥层散开。黄油的香气，和咖啡刚好相配。', {}, False),
            ('燕麦拿铁', 'Oat Milk Latte', '经典咖啡', '26.00', 'latte.jpg', '植物燕麦 / 顺滑轻盈', '浓缩咖啡与燕麦奶的柔和相遇，谷物香气轻轻铺开。', {'temperature':[{'label':'热','extra':'0.00'},{'label':'冰','extra':'0.00'}], 'size':[{'label':'标准杯','extra':'0.00'},{'label':'大杯','extra':'4.00'}]}, False),
        ]
        for index, (name, en, category, price, image, flavor, description, options, featured) in enumerate(data):
            _, created = Product.objects.get_or_create(name=name, defaults={
                'english_name': en, 'category': categories[category], 'price': Decimal(price),
                'fallback_image': image, 'flavor': flavor, 'description': description,
                'options': options, 'is_featured': featured, 'sort_order': index,
            })
            self.stdout.write(f'{"新增" if created else "保留"}：{name}')
        self.stdout.write(self.style.SUCCESS('演示数据已就绪。请执行 createsuperuser 创建自己的后台账号。'))
