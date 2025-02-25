import os
import django
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

#Configuración correcta de Django antes de importar WebSockets
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

#Importar las rutas WebSocket después de inicializar Django
from users.routing import websocket_urlpatterns as users_ws
from pong.routing import websocket_urlpatterns as pong_ws

#Unificar todas las rutas WebSocket en una sola lista
websocket_patterns = users_ws + pong_ws

#Agregar logs para verificar las rutas registradas
import logging
logging.basicConfig(level=logging.DEBUG)
logging.debug(f"📌 WebSocket patterns registrados: {websocket_patterns}")

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        URLRouter(websocket_patterns)
    ),
})
