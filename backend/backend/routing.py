from django.urls import re_path
from users.consumers import OnlineUsersConsumer
from pong.consumers import PongGameConsumer  # Importar directamente el consumidor

websocket_urlpatterns = [
    re_path(r"ws/online_users/$", OnlineUsersConsumer.as_asgi()),
    re_path(r"ws/pong/(?P<room_id>[a-zA-Z0-9-]+)/$", PongGameConsumer.as_asgi()),
]

# Cuando un cliente se conecta a una URL que comienza con "ws/", como en ws/online_users/, 
# se inicia el proceso de handshake para actualizar la conexión HTTP a una conexión websocket persistente. 
# Esto permite que se mantenga una conexión abierta en la que tanto el cliente como el servidor pueden enviar y recibir datos en tiempo real 
# sin tener que reestablecer la conexión constantemente.