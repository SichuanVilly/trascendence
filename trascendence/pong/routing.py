from django.urls import re_path
from pong.consumers import PongConsumer

websocket_urlpatterns = [
    re_path(r'ws/pong/(?P<room_name>\w+)/$', PongConsumer.as_asgi()),
]
