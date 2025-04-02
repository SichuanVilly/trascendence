# pong/api_views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from channels.layers import get_channel_layer
import json

channel_layer = get_channel_layer()

class StartGameAPIView(APIView):
    """
    Endpoint para iniciar el juego local.
    Envia un comando al grupo "local_pong" para iniciar el ciclo del juego.
    """
    async def post(self, request, format=None):
        await channel_layer.group_send(
            "local_pong",
            {
                "type": "control",
                "command": "start_game"
            }
        )
        return Response({"status": "game_started"}, status=status.HTTP_200_OK)

class MovePaddleAPIView(APIView):
    """
    Endpoint para mover una pala.
    Se espera un JSON con:
    {
        "paddle": "left" o "right",
        "direction": entero (por ejemplo, -5 para subir, 5 para bajar)
    }
    """
    async def post(self, request, format=None):
        paddle = request.data.get("paddle")
        direction = request.data.get("direction")
        if paddle not in ["left", "right"] or not isinstance(direction, int):
            return Response({"error": "Payload inválido"}, status=status.HTTP_400_BAD_REQUEST)

        await channel_layer.group_send(
            "local_pong",
            {
                "type": "control",
                "command": "move_paddle",
                "paddle": paddle,
                "direction": direction,
            }
        )
        return Response({"status": "paddle_moved"}, status=status.HTTP_200_OK)
