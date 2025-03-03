import os
import django

# Configuración de Django antes de importar módulos dependientes
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

import logging
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from backend.jwt_middleware import JWTAuthMiddleware  # Importar después de django.setup()
from users.routing import websocket_urlpatterns as users_ws
from pong.routing import websocket_urlpatterns as pong_ws

# Unificar todas las rutas WebSocket
websocket_patterns = users_ws + pong_ws

logging.basicConfig(level=logging.DEBUG)
logging.debug(f"📌 WebSocket patterns registrados: {websocket_patterns}")

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": JWTAuthMiddleware(
        URLRouter(websocket_patterns)
    ),
})
