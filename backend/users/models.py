from django.contrib.auth.models import AbstractUser  # Se importa AbstractUser para extender y personalizar el modelo de usuario.
from django.db import models  # Se importa models para definir campos y comportamientos de la base de datos.

class CustomUser(AbstractUser):
    # Se agrega un campo 'avatar' que permite subir imágenes para el perfil del usuario.
    # Las imágenes se guardarán en la carpeta 'avatars/' y el campo es opcional (puede estar vacío o ser nulo).
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)

    def __str__(self):
        # Se redefine el método __str__ para representar al usuario mediante su nombre de usuario.
        # Esto facilita la identificación del usuario en interfaces de administración y depuración.
        return self.username  # El identificador principal sigue siendo el nombre de usuario (username).
