import json
from channels.generic.websocket import AsyncWebsocketConsumer
from redis.asyncio import Redis  # Asegúrate de tener instalado redis-py para conexiones asíncronas

# Variable global para la conexión Redis
redis = None

async def get_redis_connection():
    global redis
    if redis is None:
        redis = await Redis.from_url("redis://redis:6380", encoding="utf-8", decode_responses=True)
    return redis

class PongConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'pong_{self.room_name}'

        # Unirse al grupo de WebSocket de la sala
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()
        print(f"Connected to room group: {self.room_group_name}")

        # Obtener el número de jugadores en la sala desde Redis
        redis = await get_redis_connection()
        player_count = await redis.zcard("asgi:group:pong_1")
        print(f"Players in room: {player_count}")

        # Si es el primer jugador, enviar mensaje de espera
        if player_count == 1:
            await self.send(text_data=json.dumps({
                'type': 'waiting',
                'message': 'Esperando a otro jugador...'
            }))
        elif player_count == 2:
            # Si hay dos jugadores, iniciar el juego
            await self.start_game()

    async def disconnect(self, close_code):
        # Salir del grupo de WebSocket de la sala
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        message = data.get('message')

        # Enviar el nuevo estado del juego a todos los clientes conectados
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'game_update',
                'message': message
            }
        )

    async def game_update(self, event):
        message = event['message']

        # Enviar el estado del juego al cliente
        await self.send(text_data=json.dumps({
            'message': message
        }))

    async def start_game(self):
        # Notificar a ambos jugadores que el juego puede comenzar
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'game_start',
                'message': 'El juego ha comenzado!'
            }
        )

    async def game_start(self, event):
        # Enviar mensaje para comenzar el juego
        await self.send(text_data=json.dumps({
            'message': event['message']
        }))

    async def get_player_count(self):
        # Obtener el número de jugadores conectados a la sala
        group_data = await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'count_players'
            }
        )
        return group_data.get('player_count', 1)  # Devuelve 1 si no se pudo contar correctamente
