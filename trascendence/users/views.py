from django.shortcuts import render
from django.shortcuts import redirect
from django.contrib import messages
from django.http import HttpResponse
from django.template import loader
from django.contrib import auth
from django.contrib.auth import authenticate, login

# Create your views here.
def main(request):
    if request.method == 'POST':
        username =request.POST['username']
        password = request.POST['password']
        user = auth.authenticate(username=username, password=password)

        if user is not None:
            auth.login(request, user)
            return render(request, 'welcome.html')
        else:
            messages.info(request, "invalid login")
            return redirect('main')
    else:
        return render(request, 'main.html')

def welcome(request):
    return render(request, 'welcome.html')