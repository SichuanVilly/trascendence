from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse
from django.conf import settings
from django.conf.urls.static import static

# Función de prueba para verificar conexión con el backend
def test_api(request):
    return JsonResponse({"message": "¡El backend está funcionando correctamente!"})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/users/', include('users.urls')),  # Rutas para usuarios
    path('api/test/', test_api),  # Nueva ruta de prueba
    path("api/pong/", include("pong.urls")),
    path('api/chat/', include('chat.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
