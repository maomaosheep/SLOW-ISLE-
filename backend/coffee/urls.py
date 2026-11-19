from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.health),
    path('session/', views.session),
    path('catalog/', views.catalog),
    path('orders/', views.orders),
    path('orders/create/', views.create_order),
    path('orders/<uuid:order_id>/', views.order_detail),
    path('orders/<uuid:order_id>/cancel/', views.cancel_order),
]
