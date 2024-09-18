# pong/consumers.py

import json
from channels.generic.websocket import AsyncWebsocketConsumer

class PongConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'pong_{self.room_name}'

        # Unirse al grupo de WebSocket de la sala
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        # Lista para llevar la cuenta de los jugadores
        if 'players' not in self.scope['session']:
            self.scope['session']['players'] = []

        # Aceptar la conexión si hay espacio para otro jugador
        if len(self.scope['session']['players']) < 2:
            self.scope['session']['players'].append(self.channel_name)
            await self.accept()
        else:
            # Si ya hay dos jugadores, rechazar la conexión
            await self.close()

        # Si hay dos jugadores, iniciar el juego
        if len(self.scope['session']['players']) == 2:
            await self.start_game()

    async def disconnect(self, close_code):
        # Salir del grupo de WebSocket de la sala
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

        # Eliminar el jugador de la lista cuando se desconecta
        if 'players' in self.scope['session'] and self.channel_name in self.scope['session']['players']:
            self.scope['session']['players'].remove(self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        
        # Manejar el movimiento de la pala
        if 'paddle_position' in data:
            paddle_position = data['paddle_position']
            new_game_state = self.update_game_state(paddle_position)

            # Enviar el nuevo estado del juego a todos los clientes conectados
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'game_update',
                    'game_state': new_game_state
                }
            )

    async def game_update(self, event):
        game_state = event['game_state']

        # Enviar el estado del juego al cliente
        await self.send(text_data=json.dumps({
            'game_state': game_state
        }))

    async def start_game(self):
        # Inicializar el estado del juego y enviarlo a los clientes
        initial_game_state = self.initialize_game_state()
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'game_update',
                'game_state': initial_game_state
            }
        )

    def update_game_state(self, paddle_position):
        # Aquí se actualizará el estado del juego basándote en la posición de las palas
        # Implementa la lógica para actualizar el estado del juego (posiciones, pelota, etc.)
        game_state = {
            'paddle_position': paddle_position,
            # Actualiza otros elementos del juego aquí
        }
        return game_state

    def initialize_game_state(self):
        # Inicializa el estado del juego cuando ambos jugadores estén conectados
        initial_state = {
            'paddle1_position': 0,
            'paddle2_position': 0,
            'ball_position': [50, 50],
            'ball_velocity': [1, 1]
        }
        return initial_state
