from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import authenticate, login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from apps.welcome.models import UserSession
from apps.pong.models import GameRoom

def login_view(request):
    if request.method == "POST":
        username = request.POST['username']
        password = request.POST['password']
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect('welcome')
        else:
            return render(request, 'login.html', {'error': 'Invalid username or password'})
    else:
        return render(request, 'login.html')

@login_required
def welcome_view(request):
    logged_in_users = UserSession.objects.exclude(user=request.user).values_list('user', flat=True)
    users = User.objects.filter(id__in=logged_in_users)

    if request.method == 'POST':
        room_name = request.POST.get('room_name')  # Obtén el ID de la sala del formulario

        # Verifica si la sala ya existe, de lo contrario la crea
        room, created = GameRoom.objects.get_or_create(id=room_name)

        # Redirige a la sala de juego
        return redirect('online_pong', room_name=room.name)

    return render(request, 'welcome/welcome.html', {'users': users})

@login_required
def online_pong_view(request, room_name):
    # Obtén la sala de juego o devuelve un error 404 si no existe
    room = get_object_or_404(GameRoom, id=room_name)

    # Aquí se manejaría la lógica de juego, websockets, etc.
    return render(request, 'pong/online_pong.html', {'room': room})
