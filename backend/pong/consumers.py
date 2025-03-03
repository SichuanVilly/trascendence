import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from .models import PongRoom

User = get_user_model()
logging.basicConfig(level=logging.DEBUG)

class PongGameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Extrae el room_id de la URL y define el nombre del grupo de canales
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.room_group_name = f"pong_{self.room_id}"
        self.user = self.scope["user"]

        # Si el usuario no está autenticado, cierra la conexión
        if not self.user.is_authenticated:
            await self.close()
            return

        try:
            # Obtiene o crea la sala de forma asíncrona
            self.room, created = await self.get_or_create_room(self.room_id)
            # Agrega al usuario a la sala (el método add_player actualiza el modelo y lo guarda)
            await self.add_player_to_room(self.room, self.user)
            
            # Añade el canal al grupo y acepta la conexión
            await self.channel_layer.group_add(self.room_group_name, self.channel_name)
            await self.accept()

            logging.debug(f"🔗 {self.user.username} conectado a la sala {self.room_id}")

            # Envía a todos una actualización de la sala (con la lista de jugadores)
            await self.send_room_update()
        except Exception as e:
            logging.error(f"❌ Error al conectar: {e}")
            await self.close()

    async def disconnect(self, close_code):
        logging.debug(f"❌ {self.user.username} desconectado de la sala {self.room_id}")
        try:
            # Remueve al usuario de la sala de forma asíncrona
            await self.remove_player_from_room(self.room, self.user)
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            # Actualiza la sala para notificar a los demás
            await self.send_room_update()
        except Exception as e:
            logging.warning(f"⚠️ Error en disconnect: {e}")

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            # Se espera que el mensaje incluya el tipo y, en el caso de mover la pala, el username y la dirección
            if data["type"] == "move_paddle":
                await self.update_paddle_position(data)
            elif data["type"] == "game_update":
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {"type": "game_update", "data": data}
                )
        except json.JSONDecodeError:
            logging.error("❌ Error al parsear JSON")

    async def update_paddle_position(self, data):
        # Extrae el username y la dirección del mensaje
        username = data.get("username")
        direction = int(data.get("direction", 0))

        # Verifica a qué jugador corresponde el movimiento
        if self.room.player1 and self.room.player1.username == username:
            paddle_key = "paddle_1"
        elif self.room.player2 and self.room.player2.username == username:
            paddle_key = "paddle_2"
        else:
            logging.debug("❌ Usuario no reconocido en la sala para mover la pala.")
            return

        # Se usa un valor inicial de 50 si no se envía "position"; esto puede ser mejorado para acumular movimientos
        new_position = max(0, min(100, int(data.get("position", 50)) + direction))
        logging.debug(f"Movimiento de {username}: {paddle_key} a posición {new_position}")

        # Notifica a todos los clientes la actualización de la posición de la pala
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "update_paddle", "paddle_key": paddle_key, "position": new_position},
        )

    async def update_paddle(self, event):
        # Envía al cliente la actualización de la pala
        await self.send(text_data=json.dumps({
            "type": "update_paddle",
            "paddle": event["paddle_key"],
            "position": event["position"]
        }))

    async def game_update(self, event):
        # Reenvía la actualización del juego al cliente
        await self.send(text_data=json.dumps(event["data"]))

    async def send_room_update(self):
        # Obtiene la lista de jugadores de la sala y la envía a todo el grupo
        players = await self.get_room_players()
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "room_update", "players": players},
        )

    async def room_update(self, event):
        # Envía la actualización de la sala al cliente
        await self.send(text_data=json.dumps({
            "type": "room_update",
            "players": event["players"]
        }))

    # Métodos para operaciones de base de datos, ejecutadas de forma asíncrona

    @database_sync_to_async
    def get_or_create_room(self, room_id):
        return PongRoom.objects.get_or_create(id=room_id)

    @database_sync_to_async
    def add_player_to_room(self, room, user):
        room.add_player(user)

    @database_sync_to_async
    def remove_player_from_room(self, room, user):
        room.remove_player(user)

    @database_sync_to_async
    def get_room_players(self):
        return {
            "player1": self.room.player1.username if self.room.player1 else None,
            "player2": self.room.player2.username if self.room.player2 else None,
        }
