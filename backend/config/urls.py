from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.shortcuts import redirect
from django.urls import include, path, re_path
from django.views.static import serve

urlpatterns = [
    path('', lambda request: redirect('/prototype/')),
    path('admin/', include('coffee.workbench')),
    path('admin/', admin.site.urls),
    path('api/', include('coffee.urls')),
]
if settings.DEBUG:
    urlpatterns += [
        path('prototype/', serve, {'path': 'index.html', 'document_root': settings.BASE_DIR.parent / 'prototype'}),
        re_path(r'^prototype/(?P<path>.*)$', serve, {'document_root': settings.BASE_DIR.parent / 'prototype'}),
        re_path(r'^miniprogram/assets/(?P<path>.*)$', serve, {'document_root': settings.BASE_DIR.parent / 'miniprogram' / 'assets'}),
    ] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
