from django.contrib.auth import get_user_model
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import AllowAny
from django.contrib.auth import authenticate
from rest_framework.views import APIView
from .serializers import UserSerializer, LoginSerializer
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import render
from rest_framework.parsers import MultiPartParser, FormParser
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from rest_framework.decorators import api_view, permission_classes


User = get_user_model()

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    permission_classes = (AllowAny,)
    serializer_class = UserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)

        return Response({
            "user": UserSerializer(user).data,
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request, *args, **kwargs):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = authenticate(
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
        )

        if user is not None:
            refresh = RefreshToken.for_user(user)
            return Response({
                "user": UserSerializer(user).data,
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            }, status=status.HTTP_200_OK)
        else:
            return Response({"error": "Invalid Credentials"}, status=status.HTTP_401_UNAUTHORIZED)

class UserDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Carga el usuario junto con la relación 'friends'
        user = User.objects.prefetch_related('friends', 'blocked_friends').get(pk=request.user.pk)
        print("Amigos del usuario:", list(user.friends.all()))  # Debug
        serializer = UserSerializer(user)
        return Response(serializer.data)


class OnlineUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = User.objects.all().values("username")  # Obtiene todos los usuarios
        return Response({"users": list(users)})

class UserUpdateView(generics.UpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)  

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        partial = True  # Actualización parcial
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

class UserDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request):
        user = request.user
        user.delete()
        return Response({"message": "Usuario eliminado exitosamente."}, status=status.HTTP_200_OK)
        
class AddFriendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        friend_username = request.data.get("friend")
        if not friend_username:
            return Response({"error": "Debes enviar el nombre del amigo."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            friend = User.objects.get(username=friend_username)
        except User.DoesNotExist:
            return Response({"error": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        
        # No permitir agregarse a uno mismo
        if friend == request.user:
            return Response({"error": "No te puedes agregar a ti mismo."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Agrega el amigo; al ser simétrica, Django lo añade a ambos usuarios.
        request.user.friends.add(friend)
        # Enviar notificación vía WebSocket al usuario agregado para actualizar su lista
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"user_{friend.id}",
            {
                "type": "friend.update",
                "friends": list(friend.friends.values_list("username", flat=True))
            }
        )
        return Response({"message": f"{friend_username} añadido a tus amigos."}, status=status.HTTP_200_OK)


class RemoveFriendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        friend_username = request.data.get("friend")
        if not friend_username:
            return Response({"error": "Debes enviar el nombre del amigo."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            friend = User.objects.get(username=friend_username)
        except User.DoesNotExist:
            return Response({"error": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        
        # No permitir eliminarse a sí mismo
        if friend == request.user:
            return Response({"error": "No puedes eliminarte a ti mismo."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Remover la relación en ambos sentidos
        request.user.friends.remove(friend)
        friend.friends.remove(request.user)
        
        # Enviar notificación vía WebSocket al usuario afectado
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            f"user_{friend.id}",
            {
                "type": "friend.update",
                "friends": list(friend.friends.values_list("username", flat=True))
            }
        )
        
        return Response({"message": f"{friend_username} eliminado de tus amigos."}, status=status.HTTP_200_OK)
        
class BlockFriendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        friend_username = request.data.get("friend")
        if not friend_username:
            return Response({"error": "Debes enviar el nombre del amigo."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            friend = User.objects.get(username=friend_username)
        except User.DoesNotExist:
            return Response({"error": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        request.user.blocked_friends.add(friend)
        return Response({"message": f"{friend_username} bloqueado."}, status=status.HTTP_200_OK)

class UnblockFriendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        friend_username = request.data.get("friend")
        if not friend_username:
            return Response({"error": "Debes enviar el nombre del amigo."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            friend = User.objects.get(username=friend_username)
        except User.DoesNotExist:
            return Response({"error": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        request.user.blocked_friends.remove(friend)
        return Response({"message": f"{friend_username} desbloqueado."}, status=status.HTTP_200_OK)
class UpdateStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        winner_username = request.data.get('winner')
        loser_username = request.data.get('loser')

        if not winner_username or not loser_username:
            return Response(
                {'error': 'Debes proporcionar el nombre del ganador y del perdedor.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            winner = User.objects.get(username=winner_username)
            loser = User.objects.get(username=loser_username)
        except User.DoesNotExist:
            return Response(
                {'error': 'El ganador o el perdedor no existen.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Incrementar estadísticas:
        winner.wins = (winner.wins or 0) + 1
        loser.losses = (loser.losses or 0) + 1
        winner.save()
        loser.save()

        return Response({'message': 'Estadísticas actualizadas exitosamente.'}, status=status.HTTP_200_OK)

    
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def update_my_stat(request):
    stat = request.data.get("stat")
    if stat == "win":
        request.user.wins = (request.user.wins or 0) + 1
        request.user.save()
        return Response({"message": "Victoria sumada."})
    elif stat == "loss":
        request.user.losses = (request.user.losses or 0) + 1
        request.user.save()
        return Response({"message": "Derrota sumada."})
    else:
        return Response({"error": "Tipo de estadística inválido."}, status=400)