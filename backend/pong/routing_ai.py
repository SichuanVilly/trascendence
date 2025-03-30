# pong/routing_ai.py  (o en tu routing.py si prefieres)
from django.urls import re_path
from .consumers_ai import PongAIGameConsumer

websocket_urlpatterns = [
    re_path(r"^ws/pong_ai/(?P<room_id>[\w-]+)/$", PongAIGameConsumer.as_asgi()),
]

