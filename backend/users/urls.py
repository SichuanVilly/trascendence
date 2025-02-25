from django.urls import path, include
from .views import RegisterView, LoginView, UserDetailView, OnlineUsersView
from backend.views import pong_room  # Importa la vista de la sala

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path('api/pong/', include('pong.urls')),
    #path('online-users/', OnlineUsersView.as_view(), name='online-users'),  # Nueva ruta
]

