from django.urls import path, include
from .views import RegisterView, LoginView, UserDetailView, OnlineUsersView, UserUpdateView, UserDetailView, UserDeleteView, AddFriendView, RemoveFriendView, BlockFriendView, UnblockFriendView, update_my_stat
from backend.views import pong_room  # Importa la vista de la sala

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path('api/pong/', include('pong.urls')),
    path('update/', UserUpdateView.as_view(), name='user-update'),
    path('detail/', UserDetailView.as_view(), name='user-detail'),
    path('delete/', UserDeleteView.as_view(), name='user-delete'),
    path('add-friend/', AddFriendView.as_view(), name='add-friend'),
    path('remove-friend/', RemoveFriendView.as_view(), name='remove-friend'),
    path('block-friend/', BlockFriendView.as_view(), name='block-friend'),
    path('unblock-friend/', UnblockFriendView.as_view(), name='unblock-friend'),
    path("update_my_stat/", update_my_stat, name="update_my_stat"),
    #path('online-users/', OnlineUsersView.as_view(), name='online-users'),  # Nueva ruta
]

