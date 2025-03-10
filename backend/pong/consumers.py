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
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.room_group_name = f"pong_{self.room_id}"
        self.user = self.scope["user"]

        # Bandera para controlar el ciclo del juego (bucle game_loop)
        self.game_loop_running = False

        # Posiciones iniciales de las palas
        self.paddle1_pos = 50
        self.paddle2_pos = 50

        # Nombres de jugadores (se llenan en send_room_update())
        self.player1_name = None
        self.player2_name = None

        # Puntuaciones y puntos para ganar
        self.score1 = 0
        self.score2 = 0
        self.winningScore = 10

        # Si el usuario no está autenticado, se cierra la conexión
        if not self.user.is_authenticated:
            await self.close()
            return

        try:
            # Obtiene o crea la sala PongRoom
            self.room, created = await self.get_or_create_room(self.room_id)
            # Agrega el usuario a la sala (player1 o player2)
            await self.add_player_to_room(self.room, self.user)

            # Añade este canal al grupo y acepta la conexión
            await self.channel_layer.group_add(self.room_group_name, self.channel_name)
            await self.accept()

            logging.debug(f"🔗 {self.user.username} conectado a la sala {self.room_id}")

            # Envía la info de player1/player2 a todos
            await self.send_room_update()

        except Exception as e:
            logging.error(f"❌ Error al conectar: {e}")
            await self.close()

    async def disconnect(self, close_code):
        logging.debug(f"❌ {self.user.username} desconectado de la sala {self.room_id}")
        # Detenemos el bucle de juego
        self.game_loop_running = False
        try:
            # Remueve el usuario de la sala
            await self.remove_player_from_room(self.room, self.user)
            # Saca el canal del grupo
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
            # Actualiza la sala (por si se fue un jugador)
            await self.send_room_update()
        except Exception as e:
            logging.warning(f"⚠️ Error en disconnect: {e}")

    async def receive(self, text_data):
        """Procesa mensajes del cliente (move_paddle, start_game, etc.)."""
        try:
            data = json.loads(text_data)

            if data["type"] == "move_paddle":
                await self.update_paddle_position(data)

            elif data["type"] == "start_game":
                # Solo Player1 puede iniciar el juego
                if self.room.player1 and self.room.player1.username == self.user.username:
                    if not self.game_loop_running:
                        self.score1 = 0
                        self.score2 = 0
                        self.game_loop_running = True
                        # Arrancamos el loop asíncrono que mueve la bola
                        asyncio.create_task(self.run_game_loop())

            elif data["type"] == "game_update":
                # Mensajes genéricos de game_update (p.ej. si el cliente quisiera reenviar algo)
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {"type": "game_update", "data": data}
                )
        except json.JSONDecodeError:
            logging.error("❌ Error al parsear JSON")

    async def update_paddle_position(self, data):
        """Mueve la pala del usuario correspondiente (player1 o player2)."""
        username = data.get("username")
        direction = int(data.get("direction", 0))

        # Determina si es la pala 1 o 2 en base al username
        if self.room.player1 and self.room.player1.username == username:
            paddle_key = "paddle_1"
        elif self.room.player2 and self.room.player2.username == username:
            paddle_key = "paddle_2"
        else:
            logging.debug("❌ Usuario no reconocido en la sala para mover la pala.")
            return

        # Calcula la nueva posición sin salir de 0..100
        new_position = max(0, min(100, int(data.get("position", 50)) + direction))
        logging.debug(f"Movimiento de {username}: {paddle_key} => {new_position}")

        # Actualiza tu posición interna
        if paddle_key == "paddle_1":
            self.paddle1_pos = new_position
        else:
            self.paddle2_pos = new_position

        # Avisamos a todos que la pala X cambió de posición
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "update_paddle", "paddle_key": paddle_key, "position": new_position},
        )

    async def update_paddle(self, event):
        """
        Handler de 'update_paddle' que se llama en cada cliente del grupo,
        actualiza su estado local y reenvía un mensaje al socket del cliente.
        """
        if event["paddle_key"] == "paddle_1":
            self.paddle1_pos = event["position"]
        else:
            self.paddle2_pos = event["position"]

        await self.send(text_data=json.dumps({
            "type": "update_paddle",
            "paddle": event["paddle_key"],
            "position": event["position"]
        }))

    async def game_update(self, event):
        """Reenvía datos genéricos de 'game_update' a este cliente."""
        await self.send(text_data=json.dumps(event["data"]))

    async def send_room_update(self):
        """
        Notifica (mediante group_send) la info de player1 y player2 a todos los clientes del grupo.
        """
        players = await self.get_room_players()
        self.player1_name = players.get("player1")
        self.player2_name = players.get("player2")

        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "room_update", "players": players},
        )

    async def room_update(self, event):
        """Recibe el 'room_update' y lo envía al cliente para que sepa quién es player1/player2."""
        await self.send(text_data=json.dumps({
            "type": "room_update",
            "players": event["players"]
        }))

    async def run_game_loop(self):
        """
        Bucle principal del juego (movimiento de la bola, colisiones, puntuación).
        Al llegar a winningScore, manda 'game_over' y cierra el bucle.
        """
        ball_x = 50.0
        ball_y = 50.0
        velocity_x = 1.0
        velocity_y = 1.0

        # ~1.25% de radio, si canvas es 800x400
        ball_radius_percent = (10 / 800) * 100
        left_paddle_x = 5
        right_paddle_x = 95
        paddle_half_height = 10  # ~20% de altura => 80px en un canvas 400px

        logging.debug("🏁 Iniciando bucle de juego Pong")
        while self.game_loop_running:
            # Mueve la bola
            ball_x += velocity_x
            ball_y += velocity_y

            # Rebote vertical superior/inferior
            if ball_y <= 0 or ball_y >= 100:
                velocity_y = -velocity_y
                ball_y = max(0, min(ball_y, 100))

            # Verifica colisión con pala izquierda
            if ball_x - ball_radius_percent <= left_paddle_x:
                # Si la bola está dentro de la "franja" vertical de la pala
                if (self.paddle1_pos - paddle_half_height <= ball_y <= self.paddle1_pos + paddle_half_height):
                    velocity_x = abs(velocity_x)  # rebota a la derecha
                    ball_x = left_paddle_x + ball_radius_percent
                else:
                    # Gol para Player2
                    self.score2 += 1
                    if self.score2 >= self.winningScore:
                        await self.declare_winner(self.player2_name)
                        break

                    # Dejar que la bola salga por la izquierda
                    while ball_x + ball_radius_percent > 0:
                        ball_x += velocity_x
                        ball_y += velocity_y
                        await self.send_game_update(ball_x, ball_y)
                        await asyncio.sleep(0.016)
                    await asyncio.sleep(1)
                    # Re-colocar la bola en el centro
                    ball_x = 50.0
                    ball_y = 50.0
                    velocity_x = 1.0
                    velocity_y = 1.0

            # Verifica colisión con pala derecha
            if ball_x + ball_radius_percent >= right_paddle_x:
                if (self.paddle2_pos - paddle_half_height <= ball_y <= self.paddle2_pos + paddle_half_height):
                    velocity_x = -abs(velocity_x)
                    ball_x = right_paddle_x - ball_radius_percent
                else:
                    # Gol para Player1
                    self.score1 += 1
                    if self.score1 >= self.winningScore:
                        await self.declare_winner(self.player1_name)
                        break

                    while ball_x - ball_radius_percent < 100:
                        ball_x += velocity_x
                        ball_y += velocity_y
                        await self.send_game_update(ball_x, ball_y)
                        await asyncio.sleep(0.016)
                    await asyncio.sleep(1)
                    ball_x = 50.0
                    ball_y = 50.0
                    velocity_x = -1.0
                    velocity_y = 1.0

            # Rebote lateral extra (por seguridad)
            if ball_x <= 0 or ball_x >= 100:
                velocity_x = -velocity_x
                ball_x = max(0, min(ball_x, 100))

            # Envía "game_update" con posición de la bola y score
            await self.send_game_update(ball_x, ball_y)
            await asyncio.sleep(0.016)

        logging.debug("🏁 Bucle de juego finalizado")

    async def declare_winner(self, winner_name):
        """
        Envía 'game_over' con score1, score2, y 'winner' a todos en la sala.
        """
        players = await self.get_room_players()
        self.player1_name = players.get("player1")
        self.player2_name = players.get("player2")

        # winner_name viene de self.player1_name o self.player2_name
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "game_update",
                "data": {
                    "type": "game_over",
                    "score1": self.score1,
                    "score2": self.score2,
                    "winner": winner_name
                }
            }
        )
        self.game_loop_running = False

    async def send_game_update(self, ball_x, ball_y):
        """
        Envia 'game_update' a todos con la posición de la bola y el score actual.
        """
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "game_update",
                "data": {
                    "type": "game_update",
                    "ball_x": ball_x,
                    "ball_y": ball_y,
                    "score1": self.score1,
                    "score2": self.score2,
                }
            }
        )

    @database_sync_to_async
    def get_or_create_room(self, room_id):
        return PongRoom.objects.get_or_create(id=room_id)

    @database_sync_to_async
    def add_player_to_room(self, room, user):
        """
        Lógica que asigna al usuario a player1 o player2 dentro del modelo PongRoom.
        Asegúrate de que tu 'room.add_player(user)' asigne a la segunda persona a 'player2'.
        """
        room.add_player(user)

    @database_sync_to_async
    def remove_player_from_room(self, room, user):
        room.remove_player(user)

    @database_sync_to_async
    def get_room_players(self):
        """
        Devuelve { "player1": <username1> or None, "player2": <username2> or None }.
        """
        return {
            "player1": self.room.player1.username if self.room.player1 else None,
            "player2": self.room.player2.username if self.room.player2 else None,
        }
