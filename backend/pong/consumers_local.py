import json
import asyncio
import logging
from channels.generic.websocket import AsyncWebsocketConsumer

logging.basicConfig(level=logging.DEBUG)

class LocalPongGameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Se usa "local" como room_id por defecto (o se puede pasar por URL)
        self.room_id = self.scope["url_route"]["kwargs"].get("room_id", "local")
        self.room_group_name = f"pong_local_{self.room_id}"
        
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        logging.debug("Conexión WebSocket para juego local establecida.")
        
        # Estado del juego (en porcentajes, 0-100)
        self.PADDLE_HEIGHT = 20            # Altura de la pala en %
        self.PADDLE_HALF = self.PADDLE_HEIGHT / 2.0
        self.paddle_left = 50             # Centro vertical de la pala izquierda
        self.paddle_right = 50            # Centro vertical de la pala derecha
        self.paddle_left_speed = 0        # Velocidad en % por frame
        self.paddle_right_speed = 0
        
        # Estado de la pelota (en %)
        self.ball_x = 50
        self.ball_y = 50
        self.ball_vx = 1.0                # Velocidad horizontal
        self.ball_vy = 1.0                # Velocidad vertical
        
        # Marcadores
        self.score_left = 0
        self.score_right = 0
        
        # La partida no inicia hasta recibir "start_game" (luego de la cuenta atrás)
        self.game_task = None
        
        await self.send_initial_state()
        logging.debug("Estado inicial enviado para juego local.")
    
    async def disconnect(self, close_code):
        if self.game_task:
            self.game_task.cancel()
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        logging.debug("Conexión WebSocket para juego local cerrada.")
    
    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            msg_type = data.get("type")
            if msg_type == "paddle_input":
                await self.handle_paddle_input(data)
            elif msg_type == "start_game":
                await self.start_game()
        except Exception as e:
            logging.error(f"Error procesando mensaje: {e}")
    
    async def handle_paddle_input(self, data):
        """
        Se espera:
          {"type": "paddle_input", "paddle": "left" o "right", "speed": valor}
        Donde "speed" es la velocidad (delta en %) que se aplicará cada frame.
        """
        paddle = data.get("paddle")
        speed = float(data.get("speed", 0))
        if paddle == "left":
            self.paddle_left_speed = speed
            logging.debug(f"Pala izquierda: velocidad establecida a {speed}")
        elif paddle == "right":
            self.paddle_right_speed = speed
            logging.debug(f"Pala derecha: velocidad establecida a {speed}")
    
    async def start_game(self):
        logging.debug("Mensaje start_game recibido: iniciando juego local...")
        if not self.game_task:
            # Reinicia la pelota si es necesario
            self.ball_vx = 1.0 if self.ball_vx >= 0 else -1.0
            self.ball_vy = 1.0
            self.game_task = asyncio.create_task(self.game_loop())
    
    async def game_loop(self):
        try:
            max_score = 5
            # Radio de la pelota en porcentaje: 10px de 800 = 1.25%
            ball_radius = 1.25
            # Ubicación de las palas (dibujo en el front)
            left_paddle_right = 5 + 1.25    # Aproximadamente 6.25%
            right_paddle_left = 95 - 1.25     # Aproximadamente 93.75%
            # Umbrales para anotar puntos
            score_threshold_left = 2    # Debe pasar el 2% en el lado izquierdo
            score_threshold_right = 98  # Debe pasar el 98% en el lado derecho

            while True:
                # Actualiza la posición de las palas usando la velocidad fluida
                self.paddle_left += self.paddle_left_speed
                self.paddle_right += self.paddle_right_speed
                self.paddle_left = max(self.PADDLE_HALF, min(100 - self.PADDLE_HALF, self.paddle_left))
                self.paddle_right = max(self.PADDLE_HALF, min(100 - self.PADDLE_HALF, self.paddle_right))
                
                # Actualiza la posición de la pelota
                self.ball_x += self.ball_vx
                self.ball_y += self.ball_vy
                
                # Rebote vertical
                if self.ball_y <= 0 or self.ball_y >= 100:
                    self.ball_vy *= -1
                
                # Primero, chequea si la pelota ha pasado la zona de anotación
                if self.ball_x - ball_radius <= score_threshold_left:
                    self.score_right += 1
                    self.reset_ball()
                elif self.ball_x + ball_radius >= score_threshold_right:
                    self.score_left += 1
                    self.reset_ball()
                else:
                    # Chequea colisión con la pala izquierda
                    if self.ball_x - ball_radius <= left_paddle_right:
                        if abs(self.ball_y - self.paddle_left) <= self.PADDLE_HALF:
                            self.ball_vx = abs(self.ball_vx)
                            self.ball_x = left_paddle_right + ball_radius
                    # Chequea colisión con la pala derecha
                    if self.ball_x + ball_radius >= right_paddle_left:
                        if abs(self.ball_y - self.paddle_right) <= self.PADDLE_HALF:
                            self.ball_vx = -abs(self.ball_vx)
                            self.ball_x = right_paddle_left - ball_radius
                
                # Envía el estado actual al cliente
                update = {
                    "type": "local_game_update",
                    "ball_x": self.ball_x,
                    "ball_y": self.ball_y,
                    "paddle_left": self.paddle_left,
                    "paddle_right": self.paddle_right,
                    "score_left": self.score_left,
                    "score_right": self.score_right,
                }
                await self.send(text_data=json.dumps(update))
                
                # Fin de partida
                if self.score_left >= max_score or self.score_right >= max_score:
                    winner = "Player Left" if self.score_left > self.score_right else "Player Right"
                    await self.send(text_data=json.dumps({
                        "type": "game_over",
                        "score_left": self.score_left,
                        "score_right": self.score_right,
                        "winner": winner
                    }))
                    break
                
                await asyncio.sleep(0.016)
        except asyncio.CancelledError:
            logging.debug("Game loop cancelado (socket cerrado).")
    
    def reset_ball(self):
        self.ball_x = 50
        self.ball_y = 50
        self.ball_vx = 1.0 if self.ball_vx < 0 else -1.0
        self.ball_vy = 1.0
    
    async def send_initial_state(self):
        init_state = {
            "type": "initial_state",
            "paddle_left": self.paddle_left,
            "paddle_right": self.paddle_right,
            "ball_x": self.ball_x,
            "ball_y": self.ball_y,
            "score_left": self.score_left,
            "score_right": self.score_right,
        }
        await self.send(text_data=json.dumps(init_state))
