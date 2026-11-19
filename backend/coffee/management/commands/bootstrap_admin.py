import secrets
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.conf import settings


class Command(BaseCommand):
    help = '仅首次创建本地开发管理员，随机密码写入被 Git 忽略的 .local-admin.txt；不重置已有账户。'

    def handle(self, *args, **kwargs):
        User = get_user_model()
        if User.objects.filter(is_superuser=True).exists():
            self.stdout.write('管理员已存在，保留已有账号和密码。')
            return
        username = 'admin'
        if User.objects.filter(username=username).exists():
            username = 'slowisle_admin'
        password = secrets.token_urlsafe(18)
        User.objects.create_superuser(username=username, password=password)
        path = settings.BASE_DIR / '.local-admin.txt'
        path.write_text(f'仅供本机开发使用。请勿提交或分享本文件。\n后台：http://127.0.0.1:8000/admin/\n账号：{username}\n密码：{password}\n', encoding='utf-8')
        self.stdout.write(f'已创建开发管理员，登录信息保存在 {path}。')
