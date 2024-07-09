from django.http import HttpResponse
from django.template import loader
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.forms import UserCreationForm, AuthenticationForm
from django.shortcuts import render, redirect

# Create your views here.
def main(request):
    template = loader.get_template('main.html')
    return HttpResponse(template.render())

def login_view(request):
    if request.method == 'POST':
        form = AuthenticationForm(request, data=request.POST)
        if form.is_valid():
            username = form.cleaned_data.get('username')
            password = form.cleaned_data.get('password')
            user = authenticate(username=username, password=password)
            if user is not None:
                login(request, user)
                return redirect('welcome')  # Redirigir a la página principal del juego
    else:
        form = AuthenticationForm()
    return render(request, 'accounts/login.html', {'form': form})

def register_view(request):
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('login')
    else:
        form = UserCreationForm()

    # Remove the error messages for password conditions initially
    form.fields['password1'].error_messages = {'required': ''}
    form.fields['password2'].error_messages = {'required': ''}

    return render(request, 'accounts/register.html', {'form': form})
def logout_view(request):
    logout(request)
    return redirect('login')  # Redirigir a la página de login después de cerrar sesión