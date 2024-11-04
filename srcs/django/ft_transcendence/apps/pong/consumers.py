import json
from channels.generic.websocket import AsyncWebsocketConsumer
import asyncio
from redis.asyncio import Redis

redis = None

async def get_redis_connection():
    global redis
    if redis is None:
        redis = await Redis.from_url("redis://redis:6379", encoding="utf-8", decode_responses=True)
    return redis

class PongConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'pong_{self.room_name}'
        self.player_role = None
        self.username = self.scope["user"].username  # Obtener el nombre del usuario conectado

        # Conectar al grupo de WebSocket
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

        # Obtener conexión Redis y roles de la sala
        redis = await get_redis_connection()
        roles = await redis.hgetall(f"{self.room_group_name}_roles")
        
        # Asignar roles a los jugadores
        if 'player1' not in roles:
            self.player_role = 'player1'
            await redis.hset(f"{self.room_group_name}_roles", 'player1', self.channel_name)
            print("Assigned role player1")
        elif 'player2' not in roles:
            self.player_role = 'player2'
            await redis.hset(f"{self.room_group_name}_roles", 'player2', self.channel_name)
            print("Assigned role player2")
        else:
            await self.close()
            return

        # Informar al cliente del rol y nombre del usuario
        await self.send(text_data=json.dumps({
            'type': 'player_info',
            'player': self.player_role,
            'username': self.username  # Enviar el nombre de usuario al cliente
        }))

        # Verificar si ambos jugadores están listos para iniciar el juego
        roles = await redis.hgetall(f"{self.room_group_name}_roles")
        if 'player1' in roles and 'player2' in roles:
            # Solo el jugador que inicia el juego envía la señal
            if self.player_role == 'player1':
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'start_game'
                    }
                )

    async def disconnect(self, close_code):
        if self.player_role:
            redis = await get_redis_connection()
            await redis.hdel(f"{self.room_group_name}_roles", self.player_role)
            print(f"Disconnected: {self.player_role} has left the room")

        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        direction = data.get('direction')

        redis = await get_redis_connection()
        game_state = await redis.hgetall(f"{self.room_group_name}_state")
        game_state = {k: int(v) for k, v in game_state.items()}
        game_state = self.initialize_game_state_if_missing(game_state)

        # Control de pala según el rol del jugador
        if self.player_role == 'player1':
            if direction == 'up':
                game_state['player1Y'] = max(game_state['player1Y'] - 20, 0)
            elif direction == 'down':
                game_state['player1Y'] = min(game_state['player1Y'] + 20, game_state['canvasHeight'] - game_state['paddleHeight'])
        elif self.player_role == 'player2':
            if direction == 'up':
                game_state['player2Y'] = max(game_state['player2Y'] - 20, 0)
            elif direction == 'down':
                game_state['player2Y'] = min(game_state['player2Y'] + 20, game_state['canvasHeight'] - game_state['paddleHeight'])

        await redis.hset(f"{self.room_group_name}_state", mapping=game_state)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'game_update',
                'game_state': game_state
            }
        )

    async def game_update(self, event):
        game_state = event['game_state']
        
        await self.send(text_data=json.dumps({
            'player1Y': game_state['player1Y'],
            'player2Y': game_state['player2Y'],
            'ballX': game_state['ballX'],
            'ballY': game_state['ballY']
        }))

    async def start_game(self, event):  # Se agrega el parámetro 'event'
        print("Starting game loop...")
        while True:
            redis = await get_redis_connection()
            game_state = await redis.hgetall(f"{self.room_group_name}_state")
            game_state = {k: int(v) for k, v in game_state.items()}
            game_state = self.initialize_game_state_if_missing(game_state)

            self.update_ball_position(game_state)
            self.check_collisions(game_state)
            await redis.hset(f"{self.room_group_name}_state", mapping=game_state)

            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'game_update',
                    'game_state': game_state
                }
            )
            await asyncio.sleep(0.03)

    def initialize_game_state_if_missing(self, game_state):
        default_state = {
            'player1Y': 150, 'player2Y': 150, 'ballX': 400, 'ballY': 200,
            'ballSpeedX': 5, 'ballSpeedY': 5, 'paddleHeight': 100, 'paddleWidth': 10,
            'canvasWidth': 800, 'canvasHeight': 400
        }
        for key, value in default_state.items():
            if key not in game_state:
                game_state[key] = value
        return game_state

    def update_ball_position(self, game_state):
        game_state['ballX'] += game_state['ballSpeedX']
        game_state['ballY'] += game_state['ballSpeedY']

    def check_collisions(self, game_state):
        if game_state['ballY'] <= 0 or game_state['ballY'] >= game_state['canvasHeight']:
            game_state['ballSpeedY'] = -game_state['ballSpeedY']
        if game_state['ballX'] <= game_state['paddleWidth'] and game_state['player1Y'] <= game_state['ballY'] <= game_state['player1Y'] + game_state['paddleHeight']:
            game_state['ballSpeedX'] = -game_state['ballSpeedX']
        if game_state['ballX'] >= game_state['canvasWidth'] - game_state['paddleWidth'] and game_state['player2Y'] <= game_state['ballY'] <= game_state['player2Y'] + game_state['paddleHeight']:
            game_state['ballSpeedX'] = -game_state['ballSpeedX']
        if game_state['ballX'] <= 0 or game_state['ballX'] >= game_state['canvasWidth']:
            game_state['ballX'] = game_state['canvasWidth'] // 2
            game_state['ballY'] = game_state['canvasHeight'] // 2
            game_state['ballSpeedX'] = -game_state['ballSpeedX']
