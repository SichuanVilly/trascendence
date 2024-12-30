from django.db import models
from django.contrib.auth.models import User  # Importar el modelo User

class GameRoom(models.Model):
    name = models.CharField(max_length=100, unique=True)  # Asegura que el nombre de la sala sea único
    description = models.TextField(blank=True, null=True)  # Campo opcional para descripción
    players = models.ManyToManyField(User, related_name="game_rooms")  # Relación con los usuarios en la sala

    def __str__(self):
        return self.name
