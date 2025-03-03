import json
import jwt
import logging
import uuid
import redis
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth import get_user_model
from channels.db import database_sync_to_async
from django.conf import settings

# Configuración de logging
logging.basicConfig(level=logging.DEBUG)

# Se establece la conexión con Redis (cliente síncrono, se envolverá en funciones asíncronas)
redis_client = redis.StrictRedis(host="redis", port=6379, db=0, decode_responses=True)
User = get_user_model()

class OnlineUsersConsumer(AsyncWebsocketConsumer):
    """
    Este consumidor gestiona la conexión de usuarios online, invitaciones y el inicio de partidas.
    """

    async def connect(self):
        """Al conectar, se valida el token, se registra el usuario y se notifica la lista de usuarios online."""
        self.user = await self.get_user_from_token()
        if not self.user:
            await self.close()
            return

        await self.add_user(self.user.username)
        await self.channel_layer.group_add("online_users", self.channel_name)
        await self.accept()
        await self.send_online_users()

    async def disconnect(self, close_code):
        """Al desconectar, se remueve el usuario de Redis y se notifica la actualización."""
        if self.user:
            await self.remove_user(self.user.username)
            await self.channel_layer.group_discard("online_users", self.channel_name)
            await self.send_online_users()

    async def receive(self, text_data):
        """Procesa los mensajes entrantes y delega acciones según el tipo de mensaje."""
        data = json.loads(text_data)
        msg_type = data.get("type")
        if msg_type == "invite":
            await self.handle_invite(data)
        elif msg_type == "accept_invite":
            await self.handle_accept_invite(data)
        elif msg_type == "cancel_invite":
            await self.handle_cancel_invite(data)
        # Nota: "reject_invite" se puede gestionar en el cliente

    async def handle_invite(self, data):
        """Gestiona el envío de una invitación entre usuarios."""
        from_user = data["from"]
        to_user = data["to"]
        if from_user == to_user:
            return
        # Evita enviar una nueva invitación si ya existe una pendiente.
        if await self.get_invite(f"invite:{to_user}"):
            return
        room_id = str(uuid.uuid4())
        invite_payload = json.dumps({"from": from_user, "room": room_id})
        await self.set_invite(f"invite:{to_user}", invite_payload, ex=30)
        await self.channel_layer.group_send(
            "online_users",
            {
                "type": "invite",
                "from": from_user,
                "to": to_user,
                "room": room_id,
            },
        )

    async def invite(self, event):
        """Envía el mensaje de invitación solo al usuario destinatario."""
        if event["to"] == self.user.username:
            await self.send(text_data=json.dumps(event))

    async def handle_accept_invite(self, data):
        """
        Al aceptar una invitación:
         - Se verifica y recupera la invitación desde Redis.
         - Se elimina la invitación.
         - Se notifica el inicio del juego con la información necesaria.
        """
        accepting_user = data["from"]
        inviting_user = data["to"]
        stored_invite = await self.get_invite(f"invite:{accepting_user}")
        if not stored_invite:
            return
        invite_data = json.loads(stored_invite)
        room_id = invite_data["room"]
        await self.delete_invite(f"invite:{accepting_user}")

        game_start_data = {
            "from": inviting_user,
            "to": accepting_user,
            "room": room_id,
            "player_1": inviting_user,
            "player_2": accepting_user,
        }
        await self.channel_layer.group_send(
            "online_users",
            {"type": "start_game", "game_data": game_start_data}
        )

    async def start_game(self, event):
        """Envía el evento 'start_game' solo a los usuarios involucrados en la partida."""
        game_data = event.get("game_data", {})
        if game_data.get("player_1") == self.user.username or game_data.get("player_2") == self.user.username:
            await self.send(text_data=json.dumps(event))

    async def handle_cancel_invite(self, data):
        """Gestiona la cancelación de una invitación."""
        from_user = data["from"]
        to_user = data["to"]
        await self.delete_invite(f"invite:{to_user}")
        await self.channel_layer.group_send(
            "online_users",
            {"type": "cancel_invite", "from": from_user, "to": to_user}
        )

    async def cancel_invite(self, event):
        """Envía la notificación de cancelación solo al destinatario de la invitación."""
        if event["to"] == self.user.username:
            await self.send(text_data=json.dumps(event))

    async def send_online_users(self):
        """Recupera y difunde la lista actualizada de usuarios online."""
        users = await self.get_online_users()
        await self.channel_layer.group_send(
            "online_users", {"type": "update_users", "users": users}
        )

    async def update_users(self, event):
        """Envía la lista actualizada de usuarios online al cliente actual."""
        await self.send(text_data=json.dumps({"users": event["users"]}))

    async def get_user_from_token(self):
        """
        Extrae y decodifica el token JWT de la query string para obtener el usuario.
        Retorna None si el token es inválido o ha expirado.
        """
        query_string = self.scope["query_string"].decode()
        params = dict(q.split("=") for q in query_string.split("&") if "=" in q)
        token = params.get("token", None)
        if not token:
            return None
        try:
            decoded_data = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            user = await database_sync_to_async(User.objects.get)(id=decoded_data["user_id"])
            return user
        except (jwt.ExpiredSignatureError, jwt.DecodeError, User.DoesNotExist):
            return None

    # Operaciones con Redis encapsuladas en funciones asíncronas

    @database_sync_to_async
    def add_user(self, username):
        """Añade un usuario al conjunto de usuarios online en Redis."""
        redis_client.sadd("online_users", username)

    @database_sync_to_async
    def remove_user(self, username):
        """Elimina un usuario del conjunto de usuarios online en Redis."""
        redis_client.srem("online_users", username)

    @database_sync_to_async
    def get_online_users(self):
        """Recupera la lista de usuarios online desde Redis."""
        return list(redis_client.smembers("online_users"))

    @database_sync_to_async
    def get_invite(self, key):
        """Obtiene el valor de una invitación almacenada en Redis."""
        return redis_client.get(key)

    @database_sync_to_async
    def set_invite(self, key, value, ex):
        """Establece una invitación en Redis con expiración."""
        return redis_client.set(key, value, ex=ex)

    @database_sync_to_async
    def delete_invite(self, key):
        """Elimina una invitación de Redis."""
        return redis_client.delete(key)
