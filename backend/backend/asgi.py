import os
import django

# 1) Establecer la variable de entorno con el settings.py de tu proyecto
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

# 2) Inicializar Django antes de importar módulos que dependen de él
django.setup()

import logging
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter

# 3) Importa tu middleware DESPUÉS de django.setup()
from backend.jwt_middleware import JWTAuthMiddleware

# 4) Importa tus rutas WebSocket
from users.routing import websocket_urlpatterns as users_ws
from pong.routing import websocket_urlpatterns as pong_ws
from pong.routing_ai import websocket_urlpatterns as pong_ai_ws

# 5) Combina las rutas de "users" y "pong"
websocket_patterns = users_ws + pong_ws + pong_ai_ws

# 6) Configura logging (opcional)
logging.basicConfig(level=logging.DEBUG)
logging.debug(f"📌 WebSocket patterns registrados: {websocket_patterns}")

# 7) Define la aplicación ASGI con Channels
application = ProtocolTypeRouter({
    "http": get_asgi_application(),

    "websocket": JWTAuthMiddleware(
        URLRouter(websocket_patterns)
    ),
})
