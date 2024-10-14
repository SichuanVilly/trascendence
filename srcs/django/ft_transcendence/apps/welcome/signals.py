from django.contrib.auth.signals import user_logged_in, user_logged_out
from django.dispatch import receiver
from django.utils.timezone import now
from apps.welcome.models import UserSession

# sender: Es el objeto que envia la señal
# request: Es el objeto HttpRequest asociado con la solicitud actual, contiene informacion sobre la solicitud HTTP de la señal
# user: Es el objeto User de Django que esta iniciando sesion o cerrando sesion
# kwargs: Es un diccionario que contiene cualquier argumento adicional

@receiver(user_logged_in) # Recibe la señal de que un usuario ha iniciado sesion
def user_logged_in_handler(sender, request, user, **kwargs):
    #Se crea una instancia de UserSession para el usuario que ha iniciado sesión
    session, created = UserSession.objects.get_or_create(user=user)
    # Se actualiza el atributo last_login de la sesion con el tiempo actual
    session.last_login = now()
    # se guarda en la base de datos
    session.save()

@receiver(user_logged_out) # Cuando se recibe la señal de que un usuario ha cerrado sesión
def user_logged_out_handler(sender, request, user, **kwargs):
    # Se borran todas las instancias de UserSession del usuario
    UserSession.objects.filter(user=user).delete()
