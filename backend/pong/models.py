from django.db import models
from django.contrib.auth import get_user_model
import uuid

User = get_user_model()

class PongRoom(models.Model):
    id = models.UUIDField(default=uuid.uuid4, primary_key=True, editable=False)
    # Se usan nombres de related_name más específicos para evitar colisiones
    player1 = models.ForeignKey(User, related_name="pong_rooms_as_player1", on_delete=models.CASCADE, null=True, blank=True)
    player2 = models.ForeignKey(User, related_name="pong_rooms_as_player2", on_delete=models.CASCADE, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"PongRoom {self.id} - {self.player1} vs {self.player2}"

    def is_full(self):
        """Retorna True si ambos jugadores están asignados."""
        return self.player1 is not None and self.player2 is not None

    def has_player(self, user):
        """Verifica si el usuario ya está en la sala."""
        return self.player1 == user or self.player2 == user

    def add_player(self, user):
        if self.player1 is None:
            self.player1 = user
        elif self.player2 is None:
            self.player2 = user
        self.save()


    def remove_player(self, user):
        """
        Remueve al usuario de la sala.
        Si al remover el jugador la sala queda vacía, se elimina la sala.
        """
        if self.player1 == user:
            self.player1 = None
        elif self.player2 == user:
            self.player2 = None
        # Si no queda ningún jugador, se elimina la sala para limpiar recursos
        if self.player1 is None and self.player2 is None:
            self.delete()
        else:
            self.save()
