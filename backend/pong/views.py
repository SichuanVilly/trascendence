import uuid
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from .models import PongRoom

@login_required
def create_pong_room(request):
    """Crea una sala nueva y la asigna al jugador."""
    user = request.user
    room_id = uuid.uuid4()
    room = PongRoom.objects.create(id=room_id, player1=user)
    return JsonResponse({"room_id": str(room_id)})

@login_required
def join_pong_room(request, room_id):
    """Permite que un jugador se una a una sala existente."""
    user = request.user
    try:
        room = PongRoom.objects.get(id=room_id)
        if room.player2 is None:
            room.player2 = user
            room.save()
            return JsonResponse({"status": "joined", "room_id": room_id})
        else:
            return JsonResponse({"status": "full"})
    except PongRoom.DoesNotExist:
        return JsonResponse({"status": "not_found"})
