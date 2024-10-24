from django.urls import re_path
from . import consumers  # Importa los consumers que manejarán las conexiones

websocket_urlpatterns = [
    re_path(r'ws/pong/online_pong/(?P<room_name>\w+)/$', consumers.PongConsumer.as_asgi()),
]
