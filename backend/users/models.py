from django.contrib.auth.models import AbstractUser
from django.db import models
from django.conf import settings
from django.utils import timezone
import uuid

class CustomUser(AbstractUser):
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True, default='avatars/default_avatar.png')
    email = models.EmailField(unique=False)
    verification_token = models.UUIDField(default=uuid.uuid4, editable=False)
    # Campos adicionales
    wins = models.IntegerField(default=0)
    losses = models.IntegerField(default=0)
    info = models.TextField(
        blank=True,
        default='',
        help_text="Información adicional que el usuario quiera mostrar"
    )
    #ManyToManyField('self'): Permite que cada usuario se relacione con otros usuarios.
    #symmetrical=True: Significa que la relación es bidireccional (si A es amigo de B, B es amigo de A).
    #blank=True: Permite que este campo sea opcional.
    # Campo para amigos: relación many-to-many consigo mismo
    friends = models.ManyToManyField('self', symmetrical=True, blank=True)
    blocked_friends = models.ManyToManyField('self', symmetrical=False, blank=True, related_name="blocked_by")
    def __str__(self):
        return self.username

class MatchHistory(models.Model):
    player1 = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="matches_as_player1")
    player2 = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="matches_as_player2")
    score1 = models.IntegerField()
    score2 = models.IntegerField()
    winner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="matches_won")
    played_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.player1.username} vs {self.player2.username} ({self.score1} - {self.score2})"

class PendingRegistration(models.Model):
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField()
    password = models.CharField(max_length=128)  # Se almacenará la contraseña encriptada
    code = models.CharField(max_length=6)  # Código de 6 dígitos
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    def is_expired(self):
        return timezone.now() > self.expires_at

    def __str__(self):
        return self.username