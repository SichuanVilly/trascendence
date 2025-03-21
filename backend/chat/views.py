from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Message
from .serializers import MessageSerializer
from django.db.models import Q

class ConversationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        friend_username = request.query_params.get("friend")
        if not friend_username:
            return Response({"error": "Debes proporcionar el nombre del amigo."}, status=400)
        
        # Filtrar mensajes donde el usuario sea el sender o el receiver con ese amigo
        messages = Message.objects.filter(
            Q(sender=request.user, receiver__username=friend_username) |
            Q(sender__username=friend_username, receiver=request.user)
        ).order_by("timestamp")
        
        serializer = MessageSerializer(messages, many=True)
        return Response({"messages": serializer.data})

class SendMessageView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        friend_username = request.data.get("friend")
        text = request.data.get("text")
        
        if not friend_username or not text:
            return Response({"error": "Debes proporcionar el nombre del amigo y el mensaje."}, status=400)
        
        try:
            # Asumimos que el receptor existe
            from django.contrib.auth import get_user_model
            User = get_user_model()
            receiver = User.objects.get(username=friend_username)
        except User.DoesNotExist:
            return Response({"error": "El amigo especificado no existe."}, status=404)
        
        # Crea el mensaje; el sender es el usuario autenticado
        message = Message.objects.create(
            sender=request.user,
            receiver=receiver,
            text=text
        )
        
        serializer = MessageSerializer(message)
        return Response(serializer.data, status=201)
