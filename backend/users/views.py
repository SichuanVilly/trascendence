from django.contrib.auth import get_user_model, authenticate
from django.db import models
from django.shortcuts import render, get_object_or_404
from django.core.mail import send_mail
from django.contrib.auth.hashers import make_password
from django.utils import timezone
from datetime import timedelta
import random

from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from rest_framework.parsers import MultiPartParser, FormParser
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from rest_framework.decorators import api_view, permission_classes

from .serializers import UserSerializer, LoginSerializer
from .models import MatchHistory, PendingRegistration  # Asegúrate de tener PendingRegistration en models

User = get_user_model()

# ---------------------------
# Registro 2FA sin crear usuario hasta verificar
# ---------------------------
import random
from datetime import timedelta
from django.utils import timezone
from django.core.mail import send_mail
from django.contrib.auth.hashers import make_password
from django.db import IntegrityError

from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

from .serializers import UserSerializer
from .models import PendingRegistration

import uuid
from uuid import uuid4

class RegisterView(generics.CreateAPIView):
    permission_classes = (AllowAny,)
    serializer_class = UserSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"]
        email = serializer.validated_data["email"]
        password = serializer.validated_data["password"]

        hashed_password = make_password(password)
        code = f"{random.randint(100000, 999999)}"
        expires_at = timezone.now() + timedelta(minutes=10)

        try:
            pending, created = PendingRegistration.objects.update_or_create(
                username=username,
                defaults={
                    "email": email,
                    "password": hashed_password,
                    "code": code,
                    "expires_at": expires_at,
                }
            )
        except IntegrityError:
            return Response({"error": "Ya existe un registro pendiente para este usuario."},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            send_mail(
                'Verifica tu cuenta',
                f'Tu código de verificación es: {code}',
                'transcendencepong42@gmail.com',  # Remitente configurado
                [email],
                fail_silently=False,
            )
        except Exception as e:
            return Response(
                {"error": "No se pudo enviar el correo de verificación. Intenta nuevamente."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response(
            {"message": "Registro pendiente. Se ha enviado un código de verificación a tu correo."},
            status=status.HTTP_201_CREATED
        )


class VerifyCodeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        code = request.data.get("code")
        if not username or not code:
            return Response({"error": "Se requieren 'username' y 'code'."},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            pending = PendingRegistration.objects.get(username=username)
        except PendingRegistration.DoesNotExist:
            return Response({"error": "No se encontró registro pendiente para este usuario."},
                            status=status.HTTP_404_NOT_FOUND)

        if pending.expires_at < timezone.now():
            pending.delete()
            return Response({"error": "El código ha expirado. Por favor, regístrate nuevamente."},
                            status=status.HTTP_400_BAD_REQUEST)

        if pending.code != code:
            return Response({"error": "El código es incorrecto."},
                            status=status.HTTP_400_BAD_REQUEST)

        # Crear usuario y asignar verification_token
        user = User.objects.create(
            username=pending.username,
            email=pending.email,
            password=pending.password,
            is_active=True,
            verification_token=uuid.uuid4()
        )

        refresh = RefreshToken.for_user(user)
        pending.delete()

        return Response({
            "user": UserSerializer(user).data,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "verification_token": str(user.verification_token)
        }, status=status.HTTP_200_OK)


# ---------------------------
# Resto de los endpoints
# ---------------------------

class LoginView(APIView):
    permission_classes = (AllowAny,)

    def post(self, request, *args, **kwargs):
        force_verification = request.data.get("force_verification", False)
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]
        user = authenticate(username=username, password=password)

        if user is not None:
            # ✅ Login directo si ya tiene verification_token y no se forza verificación
            if not force_verification and user.verification_token:
                refresh = RefreshToken.for_user(user)
                return Response({
                    "user": UserSerializer(user).data,
                    "refresh": str(refresh),
                    "access": str(refresh.access_token),
                }, status=status.HTTP_200_OK)

            # ❗ Enviar código si no tiene token o si se fuerza verificación
            code = f"{random.randint(100000, 999999)}"
            expires_at = timezone.now() + timedelta(minutes=10)

            PendingRegistration.objects.update_or_create(
                username=user.username,
                defaults={
                    "email": user.email,
                    "password": user.password,
                    "code": code,
                    "expires_at": expires_at,
                }
            )

            try:
                send_mail(
                    'Verifica tu inicio de sesión',
                    f'Tu código de verificación para el login es: {code}',
                    'transcendencepong42@gmail.com',
                    [user.email],
                    fail_silently=False,
                )
            except Exception:
                return Response(
                    {"error": "No se pudo enviar el correo de verificación."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            return Response({
                "error": "Verificación requerida. Se ha enviado un código a tu correo.",
                "user": {"username": user.username}
            }, status=status.HTTP_403_FORBIDDEN)

        return Response({"error": "Credenciales inválidas"}, status=status.HTTP_401_UNAUTHORIZED)



class LoginVerifyView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get("username")
        code = request.data.get("code")

        if not username or not code:
            return Response(
                {"error": "Se requieren 'username' y 'code'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            pending = PendingRegistration.objects.get(username=username)
        except PendingRegistration.DoesNotExist:
            return Response(
                {"error": "No se encontró verificación pendiente para este usuario."},
                status=status.HTTP_404_NOT_FOUND
            )

        if pending.expires_at < timezone.now():
            pending.delete()
            return Response(
                {"error": "El código ha expirado. Por favor, inicia sesión nuevamente."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if pending.code != code:
            return Response(
                {"error": "El código es incorrecto."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = User.objects.get(username=username)
        refresh = RefreshToken.for_user(user)

        # Asignar nuevo verification_token
        user.verification_token = uuid.uuid4()
        user.save()

        pending.delete()

        return Response({
            "user": UserSerializer(user).data,
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "verification_token": str(user.verification_token)
        }, status=status.HTTP_200_OK)

class UserDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = User.objects.prefetch_related('friends', 'blocked_friends').get(pk=request.user.pk)
        print("Amigos del usuario:", list(user.friends.all()))
        serializer = UserSerializer(user)
        return Response(serializer.data)

class OnlineUsersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        users = User.objects.all().values("username")
        return Response({"users": list(users)})

class UserUpdateView(generics.UpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser)

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        partial = True
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
        
        if friend == request.user:
            return Response({"error": "No te puedes agregar a ti mismo."}, status=status.HTTP_400_BAD_REQUEST)
        
        request.user.friends.add(friend)
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
        
        if friend == request.user:
            return Response({"error": "No puedes eliminarte a ti mismo."}, status=status.HTTP_400_BAD_REQUEST)
        
        request.user.friends.remove(friend)
        friend.friends.remove(request.user)
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

        winner.wins = (winner.wins or 0) + 1
        loser.losses = (loser.losses or 0) + 1
        winner.save()
        loser.save()

        return Response({'message': 'Estadísticas actualizadas exitosamente.'}, status=status.HTTP_200_OK)

class MatchHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        matches = MatchHistory.objects.filter(models.Q(player1=user) | models.Q(player2=user)).order_by('-played_at')
        data = [{
            "player1": m.player1.username,
            "player2": m.player2.username,
            "score1": m.score1,
            "score2": m.score2,
            "winner": m.winner.username if m.winner else "Desconocido",
            "played_at": m.played_at.strftime("%Y-%m-%d %H:%M")
        } for m in matches]
        return Response(data)

class SaveMatchView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data
        try:
            player1 = User.objects.get(username=data["player1"])
            player2 = User.objects.get(username=data["player2"])
            winner = User.objects.get(username=data["winner"]) if data["winner"] else None

            MatchHistory.objects.create(
                player1=player1,
                player2=player2,
                score1=data["score1"],
                score2=data["score2"],
                winner=winner
            )
            return Response({"message": "Partida guardada correctamente."}, status=201)

        except User.DoesNotExist:
            return Response({"error": "Uno de los usuarios no existe."}, status=400)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

class PublicUserProfileView(APIView):
    permission_classes = [IsAuthenticated]  # O AllowAny si deseas que sea público

    def get(self, request, username):
        user = get_object_or_404(User, username=username)
        serializer = UserSerializer(user)
        return Response(serializer.data)

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
