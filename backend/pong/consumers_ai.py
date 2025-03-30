import json
import logging
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
import random

logging.basicConfig(level=logging.DEBUG)

class PongAIGameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        """
        Acepta la conexión solo si el usuario está autenticado.
        (Si no deseas auth, elimina el check.)
        """
        self.room_id = self.scope["url_route"]["kwargs"]["room_id"]
        self.room_group_name = f"pong_ai_{self.room_id}"

        self.user = self.scope["user"]
        if not self.user.is_authenticated:
            await self.close()
            return

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        # ----------------------------------------------
        # Constantes y estado
        # ----------------------------------------------
        self.PADDLE_HEIGHT = 20
        self.PADDLE_HALF = self.PADDLE_HEIGHT / 2.0
        self.MAX_SPEED_PER_FRAME = 2  # Velocidad con la que la IA se acerca a su "target"

        # Donde la IA quiere colocar su pala derecha (centro)
        self.ai_target = 50  

        # Palas
        self.paddle_left = 50
        self.paddle_right = 50
        self.paddle_left_speed = 0
        self.paddle_right_speed = 0

        # Pelota
        self.ball_x = 50
        self.ball_y = 50
        self.initial_vx = -1.0
        self.initial_vy = 0.7

        # Marcador
        self.score_left = 0
        self.score_right = 0

        # Tareas
        self.ai_task = None
        self.game_task = None

        await self.send_initial_state()
        logging.debug(f"🔗 {self.user.username} conectado a la sala IA {self.room_id}")

    async def disconnect(self, close_code):
        """
        Cancelamos tareas y abandonamos el grupo.
        """
        if self.ai_task:
            self.ai_task.cancel()
        if self.game_task:
            self.game_task.cancel()

        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        logging.debug(f"❌ {self.user.username} desconectado de la sala IA {self.room_id}")

    async def receive(self, text_data):
        """
        Mensajes JSON desde el frontend:
         - "paddle_input": speed => Jugador humano
         - "start_game": iniciar IA + bucle ~60 FPS
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
        """
        speed = float(data.get("speed", 0))
        self.paddle_left_speed = speed
        logging.debug(f"🚀 Jugador humano -> pala izquierda speed={speed}")

    async def start_game(self):
        """
        {type:"start_game"} => inicia la IA y el bucle principal
        """
        logging.debug("⏯ start_game recibido => Iniciando IA + bucle principal")

        if not self.ai_task:
            self.ai_task = asyncio.create_task(self.ai_loop())

        if not self.game_task:
            self.ball_vx = self.initial_vx
            self.ball_vy = self.initial_vy
            self.game_task = asyncio.create_task(self.game_loop())

    # ======================================================
    #   IA loop => actualiza ai_target cada 1 seg
    # ======================================================
    async def ai_loop(self):
        """
        Cada 1 segundo, la IA predice la trayectoria
        y decide a dónde colocar la pala derecha.
        Con 1/5 de probabilidad “falla” y elige
        un objetivo aleatorio.
        """
        try:
            while True:
                await asyncio.sleep(1.0)

                # 1) 1/10 chance de fallar
                chance = random.random()  # Valor en [0..1)
                if chance < 0.1:
                    # IA se equivoca: objetivo aleatorio en [0..100]
                    # De este modo a veces no ataja la pelota
                    self.ai_target = random.uniform(0, 100)
                    logging.debug(f"🤖 IA => HA FALLADO INTENCIONALMENTE. target={self.ai_target:.2f}")
                else:
                    # IA se comporta normal => predice la trayectoria
                    predicted = self.predict_ball_y_assuming_rebound()
                    if predicted is not None:
                        error = random.uniform(-3, 3)
                        self.ai_target = predicted + error
                    else:
                        self.ai_target = self.paddle_right
                    logging.debug(f"🤖 IA => target={self.ai_target:.2f}")

        except asyncio.CancelledError:
            logging.debug("🚫 ai_loop cancelado (socket cerrado).")

    def predict_ball_y_assuming_rebound(self):
        """
        Si vx<0 => la pelota va a x=5, rebota,
        luego vx>0 => va a x=95. 
        Devuelve Y final o None si se vuelve a la izquierda antes.
        """
        sim_x = self.ball_x
        sim_y = self.ball_y
        vx = self.ball_vx
        vy = self.ball_vy

        # Fase 1: si vx<0 => simulamos hasta x=5
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

        # Fase 2: ahora vx>0 => hasta x=95
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
                # Mover pelota
                self.ball_x += self.ball_vx
                self.ball_y += self.ball_vy

                # Mover pala izquierda
                self.paddle_left += self.paddle_left_speed
                self.paddle_left = max(self.PADDLE_HALF, min(100 - self.PADDLE_HALF, self.paddle_left))

                # Pala derecha => se acerca a ai_target
                dist = self.ai_target - self.paddle_right
                if abs(dist) < 0.5:
                    self.paddle_right = self.ai_target
                else:
                    move = max(min(dist, self.MAX_SPEED_PER_FRAME), -self.MAX_SPEED_PER_FRAME)
                    self.paddle_right += move

                self.paddle_right = max(self.PADDLE_HALF, min(100 - self.PADDLE_HALF, self.paddle_right))

                # Rebotes verticales
                if self.ball_y <= 0 or self.ball_y >= 100:
                    self.ball_vy *= -1

                # Gol a la derecha
                if self.ball_x <= 0:
                    self.score_right += 1
                    self.reset_ball(right_side=True)

                # Gol a la izquierda
                if self.ball_x >= 100:
                    self.score_left += 1
                    self.reset_ball(right_side=False)

                # Colisión con pala izquierda
                if self.ball_x < 5:
                    if self.check_paddle_collision(self.paddle_left):
                        self.ball_vx *= -1
                        self.speed_up_ball()

                # Colisión con pala derecha
                if self.ball_x > 95:
                    if self.check_paddle_collision(self.paddle_right):
                        self.ball_vx *= -1
                        self.speed_up_ball()

                # Emitir "game_update"
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

                # Fin de partida
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

    def check_paddle_collision(self, paddle_center):
        """
        Retorna True si la pelota colisiona con la pala (paddle_center).
        """
        min_paddle = paddle_center - self.PADDLE_HALF
        max_paddle = paddle_center + self.PADDLE_HALF
        return (min_paddle < self.ball_y < max_paddle)

    def speed_up_ball(self):
        """
        Aumenta la velocidad de la pelota (vx, vy) en ±0.01 
        según su dirección actual.
        """
        increment = 0.01
        # Ajustar vx
        if self.ball_vx > 0:
            self.ball_vx += increment
        else:
            self.ball_vx -= increment
        # Ajustar vy
        if self.ball_vy > 0:
            self.ball_vy += increment
        else:
            self.ball_vy -= increment

        logging.debug(f"⚡ Ball speed up => vx={self.ball_vx:.2f}, vy={self.ball_vy:.2f}")

    def reset_ball(self, right_side=True):
        """
        Resetea la pelota y la velocidad al anotar un punto.
        """
        self.ball_x = 50
        self.ball_y = 50
        self.ball_vx = self.initial_vx
        self.ball_vy = self.initial_vy

        if right_side:
            self.ball_vx = abs(self.ball_vx)
        else:
            self.ball_vx = -abs(self.ball_vx)

    # ======================================================
    # Handlers group_send
    # ======================================================
    async def update_paddle(self, event):
        """
        (Opcional) si se manda un "update_paddle" vía group_send,
        se reenvía aquí al front.
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
        Reenvía 'game_update' al front.
        """
        data = event["data"]
        await self.send(text_data=json.dumps(data))

    async def game_over(self, event):
        """
        Notifica el final de la partida.
        """
        data = event["data"]
        if self.ai_task:
            self.ai_task.cancel()
        if self.game_task:
            self.game_task.cancel()
        await self.send(text_data=json.dumps(data))

    async def send_initial_state(self):
        """
        Envía el estado inicial.
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
