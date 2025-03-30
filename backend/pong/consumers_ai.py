import json
import logging
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
import random

logging.basicConfig(level=logging.DEBUG)

class PongAIGameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        """
        Acepta la conexión si el usuario está autenticado (elimínalo si no deseas auth).
        """
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.room_group_name = f"pong_ai_{self.room_id}"

        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            await self.close()
            return

        # Unir el canal al grupo
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        # ----------------------------------------------
        # Constantes y estado
        # ----------------------------------------------
        self.PADDLE_HEIGHT = 20
        self.PADDLE_HALF = self.PADDLE_HEIGHT / 2.0

        # Velocidad máxima de la pala por frame (~60 FPS).
        # Este valor define la rapidez con la que la pala
        # puede acercarse a su objetivo en el bucle principal.
        self.MAX_SPEED_PER_FRAME = 2

        # Posiciones iniciales (centro) de las palas
        self.paddle_left = 50   # Jugador humano
        self.paddle_right = 50  # IA

        # Velocidades actuales
        self.paddle_left_speed = 0
        self.paddle_right_speed = 0

        # **Objetivo** de la pala derecha, donde la IA quiere parar
        self.ai_target = 50  # Al inicio está en 50

        # Pelota
        self.ball_x = 50
        self.ball_y = 50
        self.ball_vx = 0
        self.ball_vy = 0

        # Marcador
        self.score_left = 0
        self.score_right = 0

        # Tareas asíncronas
        self.ai_task = None
        self.game_task = None

        await self.send_initial_state()
        logging.debug(f"🔗 {self.user.username} conectado a la sala IA {self.room_id}")

    async def disconnect(self, close_code):
        """
        Cancelar tareas y abandonar el grupo.
        """
        if self.ai_task:
            self.ai_task.cancel()
        if self.game_task:
            self.game_task.cancel()

        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        logging.debug(f"❌ {self.user.username} desconectado de la sala IA {self.room_id}")

    async def receive(self, text_data):
        """
        Mensajes del frontend:
         - "paddle_input": speed => Jugador humano
         - "start_game" => Inicia IA + bucle ~60 FPS
        """
        try:
            data = json.loads(text_data)
            msg_type = data.get("type")

            if msg_type == "paddle_input":
                await self.handle_paddle_input_left(data)

            elif msg_type == "start_game":
                await self.start_game()

        except Exception as e:
            logging.error(f"❌ Error al procesar mensaje: {e}")

    async def handle_paddle_input_left(self, data):
        """
        Ajusta la velocidad de la pala IZQUIERDA (jugador humano).
        data: {"speed": ±N}
        """
        speed = float(data.get("speed", 0))
        self.paddle_left_speed = speed
        logging.debug(f"🚀 Jugador humano -> pala izquierda speed={speed}")

    async def start_game(self):
        """
        Cuando llega {type:"start_game"} => inicia la IA (cada 1s) y el bucle ~60 FPS.
        """
        logging.debug("⏯ start_game recibido => Iniciando IA + bucle principal")

        if not self.ai_task:
            # Iniciar la IA loop (cada 1 segundo actualiza self.ai_target)
            self.ai_task = asyncio.create_task(self.ai_loop())

        if not self.game_task:
            # Pelota a la izquierda
            self.ball_vx = -1.0
            self.ball_vy = 0.7
            self.game_task = asyncio.create_task(self.game_loop())

    # ======================================================
    #   IA loop => actualiza "ai_target" una vez por segundo
    # ======================================================
    async def ai_loop(self):
        """
        Cada 1 segundo, la IA predice dónde estará la pelota
        y elige un "ai_target" (centro de su pala) donde quiere
        "parar" en x=95.
        """
        try:
            while True:
                await asyncio.sleep(1.0)

                predicted = self.predict_ball_y_assuming_rebound()
                if predicted is not None:
                    # Pequeño error para que no sea perfecta
                    error = random.uniform(-3, 3)
                    self.ai_target = predicted + error
                else:
                    # Si no habrá rebote en x=95 => se queda quieta en su posición actual
                    self.ai_target = self.paddle_right

                logging.debug(f"🤖 IA => ai_target={self.ai_target:.2f}")
        except asyncio.CancelledError:
            logging.debug("🚫 ai_loop cancelado (socket cerrado).")

    def predict_ball_y_assuming_rebound(self):
        """
        Simula la pelota: si vx<0, rebota en x=5, luego va a x=95.
        Retorna la Y final. None si se vuelve a la izquierda.
        """
        sim_x = self.ball_x
        sim_y = self.ball_y
        vx = self.ball_vx
        vy = self.ball_vy

        # Fase 1: si va a la izquierda => simular hasta x=5
        if vx < 0:
            while sim_x > 5:
                sim_x += vx
                sim_y += vy
                if sim_y <= 0:
                    sim_y = -sim_y
                    vy = -vy
                elif sim_y >= 100:
                    sim_y = 200 - sim_y
                    vy = -vy
            vx = abs(vx)

        # Fase 2: con vx>0 => x=95
        while sim_x < 95:
            sim_x += vx
            sim_y += vy
            if sim_y <= 0:
                sim_y = -sim_y
                vy = -vy
            elif sim_y >= 100:
                sim_y = 200 - sim_y
                vy = -vy

            if vx < 0:
                return None

        return sim_y

    # ======================================================
    #   Bucle principal => ~60 FPS
    # ======================================================
    async def game_loop(self):
        """
        Cada ~16ms mueve la pelota y palas, y difunde "game_update".
        """
        try:
            max_score = 5
            while True:
                # 1) Mover pelota
                self.ball_x += self.ball_vx
                self.ball_y += self.ball_vy

                # 2) Mover pala izquierda según su speed
                self.paddle_left += self.paddle_left_speed
                self.paddle_left = max(self.PADDLE_HALF, min(100 - self.PADDLE_HALF, self.paddle_left))

                # 3) Mover pala derecha hacia ai_target, con velocidad limitada
                dist = self.ai_target - self.paddle_right
                # Si la distancia es pequeña, paramos
                if abs(dist) < 0.5:
                    self.paddle_right = self.ai_target
                else:
                    # Ajustar la velocidad en [−MAX_SPEED_PER_FRAME, +MAX_SPEED_PER_FRAME]
                    move = max(min(dist, self.MAX_SPEED_PER_FRAME), -self.MAX_SPEED_PER_FRAME)
                    self.paddle_right += move

                # Limitar a [PADDLE_HALF, 100 - PADDLE_HALF]
                self.paddle_right = max(self.PADDLE_HALF, min(100 - self.PADDLE_HALF, self.paddle_right))

                # 4) Rebotes verticales
                if self.ball_y <= 0 or self.ball_y >= 100:
                    self.ball_vy *= -1

                # 5) Gol a la derecha
                if self.ball_x <= 0:
                    self.score_right += 1
                    self.reset_ball(right_side=True)

                # 6) Gol a la izquierda
                if self.ball_x >= 100:
                    self.score_left += 1
                    self.reset_ball(right_side=False)

                # 7) Colisión con pala izquierda
                if self.ball_x < 5:
                    min_left = self.paddle_left - self.PADDLE_HALF
                    max_left = self.paddle_left + self.PADDLE_HALF
                    if min_left < self.ball_y < max_left:
                        self.ball_vx *= -1

                # 8) Colisión con pala derecha
                if self.ball_x > 95:
                    min_right = self.paddle_right - self.PADDLE_HALF
                    max_right = self.paddle_right + self.PADDLE_HALF
                    if min_right < self.ball_y < max_right:
                        self.ball_vx *= -1

                # 9) Difundir "game_update"
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "game_update",
                        "data": {
                            "type": "game_update",
                            "ball_x": self.ball_x,
                            "ball_y": self.ball_y,
                            "score_left": self.score_left,
                            "score_right": self.score_right,
                            "paddle_left": self.paddle_left,
                            "paddle_right": self.paddle_right,
                        }
                    }
                )

                # 10) ¿Alguien llegó a 5?
                if self.score_left >= max_score or self.score_right >= max_score:
                    winner = self.user.username if (self.score_left > self.score_right) else "La IA"
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            "type": "game_over",
                            "data": {
                                "type": "game_over",
                                "score_left": self.score_left,
                                "score_right": self.score_right,
                                "winner": winner
                            }
                        }
                    )
                    break

                await asyncio.sleep(0.016)
        except asyncio.CancelledError:
            logging.debug("🚫 game_loop cancelado (socket cerrado).")

    def reset_ball(self, right_side=True):
        """
        Resetea pelota a (50,50). 
        Si right_side=True => sale moviéndose a la derecha.
        """
        self.ball_x = 50
        self.ball_y = 50
        if right_side:
            self.ball_vx = abs(self.ball_vx)
        else:
            self.ball_vx = -abs(self.ball_vx)

    # ======================================================
    # Handlers group_send
    # ======================================================
    async def update_paddle(self, event):
        """
        Si en algún momento enviamos 'update_paddle' al grupo,
        se reenvía al front aquí.
        """
        which_paddle = event["which"]
        position = event["position"]
        await self.send(text_data=json.dumps({
            "type": "update_paddle",
            "paddle": which_paddle,
            "position": position
        }))

    async def game_update(self, event):
        """
        Reenviar 'game_update' al front.
        """
        data = event["data"]
        await self.send(text_data=json.dumps(data))

    async def game_over(self, event):
        """
        Notifica 'game_over' y cancela tareas IA + loop.
        """
        data = event["data"]
        if self.ai_task:
            self.ai_task.cancel()
        if self.game_task:
            self.game_task.cancel()
        await self.send(text_data=json.dumps(data))

    async def send_initial_state(self):
        """
        Envía estado inicial (pelota, palas, marcador).
        """
        await self.send(text_data=json.dumps({
            "type": "initial_state",
            "paddle_left": self.paddle_left,
            "paddle_right": self.paddle_right,
            "ball_x": self.ball_x,
            "ball_y": self.ball_y,
            "score_left": self.score_left,
            "score_right": self.score_right
        }))
