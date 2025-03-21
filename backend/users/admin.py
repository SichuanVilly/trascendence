from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser  # Ajusta el nombre si tu modelo se llama distinto

@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    # Opcionalmente, puedes personalizar cómo se muestran los campos en el admin
    fieldsets = (
        (None, {'fields': ('username', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name', 'email', 'avatar')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
        ('Game Stats', {'fields': ('wins', 'losses')}),
    )
