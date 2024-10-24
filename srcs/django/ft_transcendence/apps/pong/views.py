from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from apps.pong.models import GameRoom

def pong_view(request, room_name):
    context = {'room': {'name': room_name}}
    return render(request, 'pong.html', context)

def pong_view_local(request):
    return render(request, 'pong/ponglocal.html')

@login_required
def room(request, room_name):
    room, created = GameRoom.objects.get_or_create(name=room_name)
    if room.players.count() < 2:
        room.players.add(request.user)
    return render(request, 'room.html', {'room_name': room_name})

def online_pong_view(request, room_name):
    room = get_object_or_404(GameRoom, id=room_name)  # Obtener la sala de juego o devolver un 404 si no existe
    room_name = room.id  # O room.name si tienes un campo 'name' 
    return render(request, 'pong/online_pong.html', {'room_name': room_name})  # Renderizar la plantilla con la sala
