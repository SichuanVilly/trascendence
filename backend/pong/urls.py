from django.urls import path
from .views import create_pong_room, join_pong_room
from .api_views import StartGameAPIView, MovePaddleAPIView

urlpatterns = [
    path("create/", create_pong_room, name="create_pong_room"),
    path("join/<uuid:room_id>/", join_pong_room, name="join_pong_room"),
    path('api/pong/local/start/', StartGameAPIView.as_view(), name='start_game'),
    path('api/pong/local/move/', MovePaddleAPIView.as_view(), name='move_paddle'),
]
