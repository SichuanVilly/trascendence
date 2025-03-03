import json
import logging
import asyncio
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
        self.game_loop_running = False  # Bandera para controlar el bucle del juego

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
        # Detiene el juego si está en ejecución
        self.game_loop_running = False
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
            if data["type"] == "move_paddle":
                await self.update_paddle_position(data)
            elif data["type"] == "start_game":
                # Inicia el bucle del juego solo si aún no está en ejecución
                if not self.game_loop_running:
                    self.game_loop_running = True
                    asyncio.create_task(self.run_game_loop())
            elif data["type"] == "game_update":
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {"type": "game_update", "data": data}
                )
        except json.JSONDecodeError:
            logging.error("❌ Error al parsear JSON")

    async def update_paddle_position(self, data):
        username = data.get("username")
        direction = int(data.get("direction", 0))

        if self.room.player1 and self.room.player1.username == username:
            paddle_key = "paddle_1"
        elif self.room.player2 and self.room.player2.username == username:
            paddle_key = "paddle_2"
        else:
            logging.debug("❌ Usuario no reconocido en la sala para mover la pala.")
            return

        new_position = max(0, min(100, int(data.get("position", 50)) + direction))
        logging.debug(f"Movimiento de {username}: {paddle_key} a posición {new_position}")

        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "update_paddle", "paddle_key": paddle_key, "position": new_position},
        )

    async def update_paddle(self, event):
        await self.send(text_data=json.dumps({
            "type": "update_paddle",
            "paddle": event["paddle_key"],
            "position": event["position"]
        }))

    async def game_update(self, event):
        await self.send(text_data=json.dumps(event["data"]))

    async def send_room_update(self):
        players = await self.get_room_players()
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "room_update", "players": players},
        )

    async def room_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "room_update",
            "players": event["players"]
        }))

    async def run_game_loop(self):
        # Inicializa la posición y velocidad de la bola (en porcentaje)
        ball_x = 50.0
        ball_y = 50.0
        velocity_x = 1.0  # Velocidad horizontal (porcentaje por iteración)
        velocity_y = 1.0  # Velocidad vertical

        logging.debug("🏁 Iniciando bucle del juego")
        while self.game_loop_running:
            ball_x += velocity_x
            ball_y += velocity_y

            # Rebote horizontal
            if ball_x <= 0 or ball_x >= 100:
                velocity_x = -velocity_x
                ball_x = max(0, min(ball_x, 100))
            # Rebote vertical
            if ball_y <= 0 or ball_y >= 100:
                velocity_y = -velocity_y
                ball_y = max(0, min(ball_y, 100))

            await self.channel_layer.group_send(
                self.room_group_name,
                {"type": "game_update", "data": {"type": "game_update", "ball_x": ball_x, "ball_y": ball_y}}
            )
            await asyncio.sleep(0.016)

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
