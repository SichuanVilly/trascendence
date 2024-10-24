import json
from channels.generic.websocket import AsyncWebsocketConsumer
import asyncio
from redis.asyncio import Redis  # Usar redis-py para conexiones asíncronas

# Variable global para la conexión Redis
redis = None

async def get_redis_connection():
    global redis
    if redis is None:
        redis = await Redis.from_url("redis://redis:6379", encoding="utf-8", decode_responses=True)
    return redis

class PongConsumer(AsyncWebsocketConsumer):

    def pong_view(request, room_name):
        print(f"Room name: {room_name}")  # Para verificar si el valor de room_name es correcto
        return render(request, 'online_pong.html', {'room_name': room_name})
    
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'pong_{self.room_name}'

        # Unirse al grupo de WebSocket de la sala
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

        # Obtener el número de jugadores conectados
        redis = await get_redis_connection()
        player_count = await redis.zcard(self.room_group_name)
        await redis.zadd(self.room_group_name, {self.channel_name: player_count + 1})

        # Inicializar el estado del juego si es el primer jugador
        if player_count == 0:
            self.game_state = {
                'player1Y': 150,
                'player2Y': 150,
                'ballX': 400,
                'ballY': 200,
                'ballSpeedX': 5,
                'ballSpeedY': 5,
                'paddleHeight': 100,
                'paddleWidth': 10,
                'canvasWidth': 800,
                'canvasHeight': 400
            }
            # Aquí se usa hset con el parámetro mapping en lugar de hmset_dict
            await redis.hset(self.room_group_name + '_state', mapping=self.game_state)

        # Esperar al segundo jugador
        if player_count == 1:
            await self.send(text_data=json.dumps({
                'type': 'waiting',
                'message': 'Esperando a otro jugador...'
            }))
        elif player_count == 2:
            await self.start_game()

    async def disconnect(self, close_code):
        # Salir del grupo de WebSocket de la sala
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
        redis = await get_redis_connection()
        await redis.zrem(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        direction = data.get('direction')

        # Obtener el estado actual del juego
        redis = await get_redis_connection()
        game_state = await redis.hgetall(self.room_group_name + '_state')

        # Convertir los valores del juego a enteros
        game_state = {k: int(v) for k, v in game_state.items()}

        # Asegurarse de que todas las claves estén presentes
        game_state = self.initialize_game_state_if_missing(game_state)

        # Actualizar la posición de las palas basándose en la entrada del jugador
        if direction == 'up':
            game_state['player1Y'] = max(game_state['player1Y'] - 20, 0)
        elif direction == 'down':
            game_state['player1Y'] = min(game_state['player1Y'] + 20, game_state['canvasHeight'] - game_state['paddleHeight'])

        # Guardar el nuevo estado en Redis
        await redis.hset(self.room_group_name + '_state', mapping=game_state)

        # Enviar el estado actualizado a todos los jugadores
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'game_update',
                'game_state': game_state
            }
        )

    async def game_update(self, event):
        game_state = event['game_state']

        # Enviar el estado del juego a todos los jugadores
        await self.send(text_data=json.dumps({
            'player1Y': game_state['player1Y'],
            'player2Y': game_state['player2Y'],
            'ballX': game_state['ballX'],
            'ballY': game_state['ballY']
        }))

    async def start_game(self):
        # Iniciar el ciclo del juego en el servidor
        while True:
            redis = await get_redis_connection()
            game_state = await redis.hgetall(self.room_group_name + '_state')
            game_state = {k: int(v) for k, v in game_state.items()}

            # Asegurarse de que todas las claves estén presentes
            game_state = self.initialize_game_state_if_missing(game_state)

            # Actualizar la posición de la pelota
            self.update_ball_position(game_state)

            # Verificar colisiones y actualizar el estado
            self.check_collisions(game_state)

            # Guardar el nuevo estado del juego en Redis
            await redis.hset(self.room_group_name + '_state', mapping=game_state)

            # Enviar el estado actualizado a todos los jugadores
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'game_update',
                    'game_state': game_state
                }
            )

            await asyncio.sleep(0.03)  # Actualizar el juego cada 30ms

    def initialize_game_state_if_missing(self, game_state):
        # Asegurarse de que las claves importantes estén presentes en el estado del juego
        default_state = {
            'player1Y': 150,
            'player2Y': 150,
            'ballX': 400,
            'ballY': 200,
            'ballSpeedX': 5,
            'ballSpeedY': 5,
            'paddleHeight': 100,
            'paddleWidth': 10,
            'canvasWidth': 800,
            'canvasHeight': 400
        }

        for key, value in default_state.items():
            if key not in game_state:
                game_state[key] = value

        return game_state

    def update_ball_position(self, game_state):
        game_state['ballX'] += game_state['ballSpeedX']
        game_state['ballY'] += game_state['ballSpeedY']

    def check_collisions(self, game_state):
        # Rebote de la pelota en la parte superior e inferior
        if game_state['ballY'] <= 0 or game_state['ballY'] >= game_state['canvasHeight']:
            game_state['ballSpeedY'] = -game_state['ballSpeedY']

        # Colisiones con las palas
        if game_state['ballX'] <= game_state['paddleWidth']:  # Pala del jugador 1
            if game_state['player1Y'] <= game_state['ballY'] <= game_state['player1Y'] + game_state['paddleHeight']:
                game_state['ballSpeedX'] = -game_state['ballSpeedX']

        if game_state['ballX'] >= game_state['canvasWidth'] - game_state['paddleWidth']:  # Pala del jugador 2
            if game_state['player2Y'] <= game_state['ballY'] <= game_state['player2Y'] + game_state['paddleHeight']:
                game_state['ballSpeedX'] = -game_state['ballSpeedX']

        # Reiniciar la pelota si se sale por los lados
        if game_state['ballX'] <= 0 or game_state['ballX'] >= game_state['canvasWidth']:
            game_state['ballX'] = game_state['canvasWidth'] // 2
            game_state['ballY'] = game_state['canvasHeight'] // 2
            game_state['ballSpeedX'] = -game_state['ballSpeedX']
