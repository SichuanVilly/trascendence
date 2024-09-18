
from django.urls import path
from . import consumers

websocket_urlpatterns = [
    path('ws/pong/<str:room_name>/', consumers.PongConsumer.as_asgi()),
]
