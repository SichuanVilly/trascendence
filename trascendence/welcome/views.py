from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User  # Asegúrate de importar el modelo User
from .models import UserSession

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
    return render(request, 'welcome/welcome.html', {'users': users})