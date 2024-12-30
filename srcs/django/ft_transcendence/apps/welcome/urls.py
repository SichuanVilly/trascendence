from django.urls import path
from apps.welcome import views

urlpatterns = [
    path('', views.welcome_view, name='welcome'),
]
