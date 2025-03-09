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

        # Inicializamos las posiciones de las palas en el centro (sin gravedad)
        self.paddle1_pos = 50  # Pala izquierda
        self.paddle2_pos = 50  # Pala derecha

        # Inicializamos atributos para guardar los nombres de los jugadores
        self.player1_name = None
        self.player2_name = None

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
                # Solo el jugador anfitrión (player1) inicia el bucle del juego
                if self.room.player1 and self.room.player1.username == self.user.username:
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

        # Actualiza la posición de la pala en el servidor (sin aplicar gravedad)
        if paddle_key == "paddle_1":
            self.paddle1_pos = new_position
        else:
            self.paddle2_pos = new_position

        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "update_paddle", "paddle_key": paddle_key, "position": new_position},
        )

    async def update_paddle(self, event):
        # Actualiza el estado interno en todos los consumidores (incluido el host)
        if event["paddle_key"] == "paddle_1":
            self.paddle1_pos = event["position"]
        else:
            self.paddle2_pos = event["position"]
        # Envía el mensaje a la conexión del cliente
        await self.send(text_data=json.dumps({
            "type": "update_paddle",
            "paddle": event["paddle_key"],
            "position": event["position"]
        }))

    async def game_update(self, event):
        await self.send(text_data=json.dumps(event["data"]))

    async def send_room_update(self):
        # Obtiene los nombres de los jugadores desde la base de datos
        players = await self.get_room_players()
        # Actualiza los atributos de instancia para guardar los nombres
        self.player1_name = players.get("player1")
        self.player2_name = players.get("player2")
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
        velocity_x = 1.0  # Velocidad horizontal (por iteración)
        velocity_y = 1.0  # Velocidad vertical

        # Parámetros para la detección de colisiones
        ball_radius = 2
        left_paddle_x = 5    # Posición fija de la pala izquierda
        right_paddle_x = 95  # Posición fija de la pala derecha
        paddle_half_height = 10  # Mitad de la altura de la pala (altura total = 20)

        logging.debug("🏁 Iniciando bucle del juego")
        while self.game_loop_running:
            ball_x += velocity_x
            ball_y += velocity_y

            # Rebote vertical: si la pelota toca la parte superior o inferior
            if ball_y <= 0 or ball_y >= 100:
                velocity_y = -velocity_y
                ball_y = max(0, min(ball_y, 100))

            # Colisión con la pala izquierda
            if ball_x - ball_radius <= left_paddle_x:
                if self.paddle1_pos - paddle_half_height <= ball_y <= self.paddle1_pos + paddle_half_height:
                    velocity_x = abs(velocity_x)  # Rebota hacia la derecha
                    ball_x = left_paddle_x + ball_radius  # Ajusta para evitar múltiples colisiones

            # Colisión con la pala derecha
            if ball_x + ball_radius >= right_paddle_x:
                if self.paddle2_pos - paddle_half_height <= ball_y <= self.paddle2_pos + paddle_half_height:
                    velocity_x = -abs(velocity_x)  # Rebota hacia la izquierda
                    ball_x = right_paddle_x - ball_radius

            # Rebote lateral (por si la pelota se sale de la pantalla)
            if ball_x <= 0 or ball_x >= 100:
                velocity_x = -velocity_x
                ball_x = max(0, min(ball_x, 100))

            await self.channel_layer.group_send(
                self.room_group_name,
                {"type": "game_update", "data": {
                    "type": "game_update",
                    "ball_x": ball_x,
                    "ball_y": ball_y
                }}
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
