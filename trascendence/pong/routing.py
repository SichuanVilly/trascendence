from django.urls import path
from your_app.consumers import PongConsumer

websocket_urlpatterns = [
    re_path(r'ws/pong/(?P<room_name>\w+)/$', consumers.PongConsumer.as_asgi()),
]