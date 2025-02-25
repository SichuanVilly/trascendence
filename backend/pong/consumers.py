import json
import logging
import jwt
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.conf import settings
from .models import PongRoom

User = get_user_model()
logging.basicConfig(level=logging.DEBUG)

# Diccionarios globales para manejar conexiones y eliminación diferida por jugador
PONG_USER_CONNECTION_COUNTS = {}
PONG_USER_REMOVAL_TASKS = {}
GAME_LOOP_TASKS = {}

class PongGameConsumer(AsyncWebsocketConsumer):
    async def get_user_from_token(self):
        """Extrae el token de la query string y retorna el usuario autenticado."""
        query_string = self.scope["query_string"].decode()
        params = dict(q.split("=") for q in query_string.split("&") if "=" in q)
        token = params.get("token", None)
        if not token:
            return None
        try:
            decoded_data = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            user = await database_sync_to_async(User.objects.get)(id=decoded_data["user_id"])
            return user
        except (jwt.ExpiredSignatureError, jwt.DecodeError, User.DoesNotExist) as e:
            logging.error("Token error: %s", e)
            return None

    async def connect(self):
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.room_group_name = f"pong_{self.room_id}"
        self.user = await self.get_user_from_token()
        if not self.user:
            await self.close()
            return
        try:
            # Obtener o crear la sala de Pong
            self.room, created = await database_sync_to_async(PongRoom.objects.get_or_create)(id=self.room_id)
            # Agregar el jugador a la sala (si ya está, add_player no modificará la posición)
            await database_sync_to_async(self.room.add_player)(self.user)

            # Incrementar contador de conexiones para este jugador
            key = (self.room_id, self.user.id)
            if key in PONG_USER_CONNECTION_COUNTS:
                PONG_USER_CONNECTION_COUNTS[key] += 1
            else:
                PONG_USER_CONNECTION_COUNTS[key] = 1
            logging.debug(f"Conexiones para {key}: {PONG_USER_CONNECTION_COUNTS[key]}")
            # Si había una tarea de eliminación pendiente, cancelarla
            if key in PONG_USER_REMOVAL_TASKS and PONG_USER_REMOVAL_TASKS[key]:
                PONG_USER_REMOVAL_TASKS[key].cancel()
                PONG_USER_REMOVAL_TASKS[key] = None

            await self.channel_layer.group_add(self.room_group_name, self.channel_name)
            await self.accept()
            logging.debug(f"🔗 {self.user.username} conectado a la sala {self.room_id}")
            await self.send_room_update()

            # Iniciar el game loop si la sala está llena y aún no se inició
            if self.room.is_full() and self.room_id not in GAME_LOOP_TASKS:
                logging.debug(f"Iniciando game loop para la sala {self.room_id}")
                GAME_LOOP_TASKS[self.room_id] = asyncio.create_task(self.game_loop())
        except Exception as e:
            logging.error(f"❌ Error al conectar: {e}")
            await self.close()

    async def disconnect(self, close_code):
        if self.user:
            logging.debug(f"❌ {self.user.username} desconectado de la sala {self.room_id}")
        else:
            logging.debug(f"❌ Usuario no autenticado desconectado de la sala {self.room_id}")
        key = (self.room_id, self.user.id) if self.user else None
        if key and key in PONG_USER_CONNECTION_COUNTS:
            PONG_USER_CONNECTION_COUNTS[key] -= 1
            logging.debug(f"Conexiones restantes para {key}: {PONG_USER_CONNECTION_COUNTS[key]}")
            # Aquí, en vez de eliminar al jugador, simplemente se decrementa el contador
            # y se deja la referencia en la sala para que la posición de la pala se mantenga.
        try:
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            await self.send_room_update()
        except Exception as e:
            logging.warning("⚠️ Error en disconnect: %s", e)
        # Opcional: Si la sala queda vacía, se podría cancelar el game loop.
        # Pero en este caso queremos que el juego siga corriendo.

    # Eliminación diferida: se deja sin remover al jugador para mantener la posición de la pala.
    async def delayed_remove(self, delay_seconds):
        await asyncio.sleep(delay_seconds)
        key = (self.room_id, self.user.id) if self.user else None
        logging.debug(f"Verificando eliminación de {key} tras {delay_seconds} segundos")
        if key and key in PONG_USER_CONNECTION_COUNTS and PONG_USER_CONNECTION_COUNTS[key] > 0:
            logging.debug(f"Cancelando eliminación para {key} por reconexión.")
            return
        # Si se decide eliminar al jugador (por inactividad prolongada), se podría hacerlo aquí,
        # pero para mantener la posición de la pala, NO se elimina la referencia.
        logging.debug(f"No se elimina {key} para preservar la posición de la pala")
        if key:
            PONG_USER_REMOVAL_TASKS[key] = None

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            if data["type"] == "move_paddle":
                await self.update_paddle_position(data)
            elif data["type"] == "game_update":
                await self.channel_layer.group_send(
                    self.room_group_name, {"type": "game_update", "data": data}
                )
        except json.JSONDecodeError:
            logging.error("❌ Error al parsear JSON")

    async def update_paddle_position(self, data):
        username = data.get("username")
        direction = int(data.get("direction", 0))
        # Determinar a qué pala se mueve basado en el usuario
        if self.room.player1 and self.room.player1.username == username:
            paddle_key = "paddle_1"
        elif self.room.player2 and self.room.player2.username == username:
            paddle_key = "paddle_2"
        else:
            return
        # Obtener la posición actual desde el modelo; si no existe, usar 50 por defecto
        try:
            current_position = getattr(self.room, f"{paddle_key}_position", 50)
        except Exception:
            current_position = 50
        new_position = max(0, min(100, current_position + direction))
        # Actualizar la posición en el modelo y guardarla
        setattr(self.room, f"{paddle_key}_position", new_position)
        await database_sync_to_async(self.room.save)()
        # Difundir la actualización a todos los conectados
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
        state = {
            "players": {
                "player1": self.room.player1.username if self.room.player1 else None,
                "player2": self.room.player2.username if self.room.player2 else None,
            },
            "paddles": {
                "paddle_1": getattr(self.room, "paddle_1_position", 50),
                "paddle_2": getattr(self.room, "paddle_2_position", 50),
            }
        }
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "room_update", "state": state},
        )

    async def room_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "room_update",
            "state": event["state"]
        }))

    async def game_loop(self):
        room_group_name = self.room_group_name
        room_id = self.room_id
        logging.debug(f"Iniciando game loop para la sala {room_id}")
        ball_x = 50
        ball_y = 50
        velocity_x = 1
        velocity_y = 1
        try:
            while True:
                ball_x += velocity_x
                ball_y += velocity_y
                if ball_y <= 0 or ball_y >= 100:
                    velocity_y *= -1
                if ball_x <= 0 or ball_x >= 100:
                    velocity_x *= -1
                await self.channel_layer.group_send(
                    room_group_name,
                    {"type": "game_update", "data": {
                        "ball_x": ball_x,
                        "ball_y": ball_y,
                    }}
                )
                await asyncio.sleep(0.05)
        except asyncio.CancelledError:
            logging.info(f"Game loop cancelado para la sala {room_id}")
