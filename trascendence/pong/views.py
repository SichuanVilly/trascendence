from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from .models import GameRoom
from django.shortcuts import get_object_or_404

def pong_view(request):
    return render(request, 'pong/pongai.html')

def pong_view_local(request):
    return render(request, 'pong/ponglocal.html')

@login_required
def room(request, room_name):
    room, created = Room.objects.get_or_create(name=room_name)
    if room.players.count() < 2:
        room.players.add(request.user)
    return render(request, 'room.html', {'room_name': room_name})

# Vista para unirse a una sala de juego y empezar a jugar en línea
def online_pong_view(request, room_id):
    room = get_object_or_404(GameRoom, id=room_id)  # Obtener la sala de juego o devolver un 404 si no existe
    return render(request, 'pong/online_pong.html', {'room': room})  # Renderizar la plantilla del juego en línea con la sala