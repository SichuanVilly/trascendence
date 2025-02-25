from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse

# Función de prueba para verificar conexión con el backend
def test_api(request):
    return JsonResponse({"message": "¡El backend está funcionando correctamente!"})

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/users/', include('users.urls')),  # Rutas para usuarios
    path('api/test/', test_api),  # Nueva ruta de prueba
    path("api/pong/", include("pong.urls")),
]
