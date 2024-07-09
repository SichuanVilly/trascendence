from django.shortcuts import render

def pong_view(request):
    return render(request, 'pong/pongai.html')

def pong_view_local(request):
    return render(request, 'pong/ponglocal.html')
