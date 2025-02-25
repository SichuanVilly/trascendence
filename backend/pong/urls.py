from django.urls import path
from .views import create_pong_room, join_pong_room

urlpatterns = [
    path("create/", create_pong_room, name="create_pong_room"),
    path("join/<uuid:room_id>/", join_pong_room, name="join_pong_room"),
]
