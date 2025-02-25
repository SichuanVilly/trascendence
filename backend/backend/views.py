from django.shortcuts import render

def pong_room(request, room_name):
    return render(request, "pong_game.html", {"room_name": room_name})
