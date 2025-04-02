from django.urls import re_path
from .consumers import PongGameConsumer
from .consumers_local import LocalPongGameConsumer

websocket_urlpatterns = [
    re_path(r"^ws/pong/(?P<room_id>[\w-]+)/$", PongGameConsumer.as_asgi()),
    re_path(r"^ws/local_pong/$", LocalPongGameConsumer.as_asgi()),
]
