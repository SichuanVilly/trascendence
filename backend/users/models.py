from django.contrib.auth.models import AbstractUser
from django.db import models

class CustomUser(AbstractUser):
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True, default='avatars/default_avatar.png')
    
    # Campos adicionales
    wins = models.IntegerField(default=0)
    losses = models.IntegerField(default=0)
    #ManyToManyField('self'): Permite que cada usuario se relacione con otros usuarios.
    #symmetrical=True: Significa que la relación es bidireccional (si A es amigo de B, B es amigo de A).
    #blank=True: Permite que este campo sea opcional.
    # Campo para amigos: relación many-to-many consigo mismo
    friends = models.ManyToManyField('self', symmetrical=True, blank=True)
    def __str__(self):
        return self.username
