import json
import jwt
import logging
import uuid
import redis
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth import get_user_model
from channels.db import database_sync_to_async
from django.conf import settings

# Se establece la conexión con Redis, que se usa para almacenar invitaciones y gestionar la lista de usuarios en línea.
redis_client = redis.StrictRedis(host="redis", port=6379, db=0, decode_responses=True)

# Se obtiene el modelo de usuario definido en el proyecto (puede ser el modelo estándar o uno personalizado).
User = get_user_model()

class OnlineUsersConsumer(AsyncWebsocketConsumer):
    # Este consumidor gestiona la conexión y comunicación vía websocket para usuarios online e invitaciones.
    
    async def connect(self):
        """Cuando se establece una conexión, se valida el token JWT y se registra al usuario."""
        # Se extrae el usuario a partir del token que viene en la query string de la conexión.
        self.user = await self.get_user_from_token()
        # Si no se pudo obtener un usuario válido, se cierra la conexión.
        if not self.user:
            await self.close()
            return
        # Se añade el nombre del usuario a la lista de usuarios conectados en Redis.
        await self.add_user(self.user.username)
        # Se agrega el canal actual al grupo 'online_users' para poder enviar mensajes a todos los usuarios.
        await self.channel_layer.group_add("online_users", self.channel_name)
        # Se acepta la conexión del websocket.
        await self.accept()
        # Se envía a todos los clientes la lista actualizada de usuarios conectados.
        await self.send_online_users()

    async def disconnect(self, close_code):
        """Al desconectar, se remueve al usuario de la lista y se actualiza el grupo."""
        if self.user:
            # Se elimina el nombre de usuario de la lista en Redis.
            await self.remove_user(self.user.username)
            # Se quita el canal del usuario del grupo 'online_users'.
            await self.channel_layer.group_discard("online_users", self.channel_name)
            # Se notifica a los clientes la actualización en la lista de usuarios online.
            await self.send_online_users()

    async def receive(self, text_data):
        """Procesa los mensajes entrantes y delega acciones según el tipo de mensaje."""
        # Se convierte el mensaje JSON en un diccionario de Python.
        data = json.loads(text_data)
        # Se obtiene el tipo de mensaje para determinar qué acción realizar.
        msg_type = data.get("type")
        if msg_type == "invite":
            # Se procesa el envío de una invitación a otro usuario.
            await self.handle_invite(data)
        elif msg_type == "accept_invite":
            # Se maneja la aceptación de una invitación.
            await self.handle_accept_invite(data)
        elif msg_type == "cancel_invite":
            # Se gestiona la cancelación de una invitación.
            await self.handle_cancel_invite(data)
        # Nota: La acción "reject_invite" puede ser gestionada en el lado del cliente sin notificar al servidor.

    async def handle_invite(self, data):
        """Gestiona el envío de una invitación entre usuarios."""
        # Se extraen los identificadores del usuario que envía y del usuario destino.
        from_user = data["from"]
        to_user = data["to"]
        # Evitar que un usuario se envíe una invitación a sí mismo.
        if from_user == to_user:
            return
        # Si ya hay una invitación pendiente para el usuario destino, no se envía otra.
        if redis_client.get(f"invite:{to_user}"):
            return
        # Se genera un identificador único para la sala de juego que se creará.
        room_id = str(uuid.uuid4())
        # Se almacena la invitación en Redis con un tiempo de expiración de 30 segundos.
        redis_client.set(f"invite:{to_user}", json.dumps({"from": from_user, "room": room_id}), ex=30)
        # Se envía la invitación a todos los usuarios del grupo; el método 'invite' se encargará de filtrar el destinatario.
        await self.channel_layer.group_send(
            "online_users",
            {
                "type": "invite",   # Esto indica qué método se invocará en el consumidor.
                "from": from_user,
                "to": to_user,
                "room": room_id,
            },
        )

    async def invite(self, event):
        """Envía el mensaje de invitación únicamente al usuario destinatario."""
        # Se comprueba si el mensaje está dirigido al usuario conectado.
        if event["to"] == self.user.username:
            await self.send(text_data=json.dumps(event))

    async def handle_accept_invite(self, data):
        """
        Cuando se acepta una invitación:
         - Se verifica la invitación almacenada en Redis.
         - Se recupera el identificador de la sala de juego y se elimina la invitación.
         - Se envía un mensaje para iniciar el juego, con los datos de los participantes.
        """
        # Se asignan los roles: el que acepta y el que originalmente invitó.
        accepting_user = data["from"]
        inviting_user = data["to"]
        # Se busca la invitación en Redis utilizando la clave del usuario que acepta.
        stored_invite = redis_client.get(f"invite:{accepting_user}")
        if not stored_invite:
            return  # Si la invitación ya expiró o no existe, se sale de la función.
        invite_data = json.loads(stored_invite)
        room_id = invite_data["room"]
        # Se elimina la invitación de Redis, ya que ha sido aceptada.
        redis_client.delete(f"invite:{accepting_user}")

        # Se arma la información necesaria para iniciar el juego.
        game_start_data = {
            "from": inviting_user,
            "to": accepting_user,
            "room": room_id,
            "player_1": inviting_user,
            "player_2": accepting_user,
        }
        # Se envía un mensaje a todos los usuarios para iniciar el juego; solo los jugadores involucrados responderán.
        await self.channel_layer.group_send(
            "online_users",
            {"type": "start_game", "game_data": game_start_data}
        )

    async def start_game(self, event):
        """
        Envía el evento 'start_game' únicamente a los usuarios que forman parte de la partida.
        Los clientes usarán estos datos para redirigir y configurar la sesión de juego.
        """
        game_data = event.get("game_data", {})
        # Se verifica si el usuario conectado es uno de los jugadores (ya sea como player_1 o player_2).
        if game_data.get("player_1") == self.user.username or game_data.get("player_2") == self.user.username:
            await self.send(text_data=json.dumps(event))

    async def handle_cancel_invite(self, data):
        """Gestiona la cancelación de una invitación enviada."""
        from_user = data["from"]
        to_user = data["to"]
        # Se elimina la invitación del usuario destino en Redis.
        redis_client.delete(f"invite:{to_user}")
        # Se envía un mensaje notificando la cancelación a todos los usuarios del grupo.
        await self.channel_layer.group_send(
            "online_users",
            {"type": "cancel_invite", "from": from_user, "to": to_user}
        )

    async def cancel_invite(self, event):
        """Envía la notificación de cancelación solo al usuario que debía recibir la invitación."""
        if event["to"] == self.user.username:
            await self.send(text_data=json.dumps(event))

    async def send_online_users(self):
        """Recupera la lista de usuarios conectados y la difunde a todo el grupo."""
        users = await self.get_online_users()
        await self.channel_layer.group_send(
            "online_users", {"type": "update_users", "users": users}
        )

    async def update_users(self, event):
        """Envía la lista actualizada de usuarios online al cliente actual."""
        await self.send(text_data=json.dumps({"users": event["users"]}))

    async def get_user_from_token(self):
        """
        Extrae el token JWT de la query string, lo decodifica y devuelve el usuario asociado.
        Si el token es inválido o ha expirado, retorna None.
        """
        # Se decodifica la query string para extraer parámetros.
        query_string = self.scope["query_string"].decode()
        # Se convierte la query string en un diccionario.
        params = dict(q.split("=") for q in query_string.split("&") if "=" in q)
        token = params.get("token", None)
        if not token:
            return None
        try:
            # Se decodifica el token utilizando la clave secreta definida en settings.
            decoded_data = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            # Se obtiene el usuario usando la ID extraída del token, de forma sincrónica adaptada a asincronía.
            user = await database_sync_to_async(User.objects.get)(id=decoded_data["user_id"])
            return user
        except (jwt.ExpiredSignatureError, jwt.DecodeError, User.DoesNotExist):
            return None

    @database_sync_to_async
    def add_user(self, username):
        """Añade el nombre de usuario al conjunto de usuarios online en Redis."""
        redis_client.sadd("online_users", username)

    @database_sync_to_async
    def remove_user(self, username):
        """Elimina el nombre de usuario del conjunto de usuarios online en Redis."""
        redis_client.srem("online_users", username)

    @database_sync_to_async
    def get_online_users(self):
        """Recupera y retorna la lista de usuarios online almacenados en Redis."""
        return list(redis_client.smembers("online_users"))
