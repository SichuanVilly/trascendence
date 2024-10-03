# asgi.py
import os
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from channels.auth import AuthMiddlewareStack
import pong.routing 

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'trascendence.settings')

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        URLRouter(
            pong.routing.websocket_urlpatterns
        )
    ),
})
