from django.contrib import admin
from apps.pong.models import GameRoom  # Importa correctamente el modelo GameRoom

@admin.register(GameRoom)
class GameRoomAdmin(admin.ModelAdmin):
    list_display = ['name']  # Configuración de la lista de visualización
