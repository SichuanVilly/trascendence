from django.urls import path
from apps.pong import views

urlpatterns = [
    path('pongai/', views.pong_view, name='pongai'),
    path('ponglocal/', views.pong_view_local, name='ponglocal'),
]
