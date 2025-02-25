from urllib.parse import parse_qs  # Importa la función para parsear (analizar) la query string de la URL.
from django.contrib.auth.models import AnonymousUser  # Importa el modelo de usuario anónimo.
from channels.db import database_sync_to_async  # Permite ejecutar funciones de base de datos de manera asíncrona.
from channels.middleware.base import BaseMiddleware  # Middleware base para Channels.
from rest_framework_simplejwt.tokens import AccessToken  # Clase para trabajar con tokens JWT de SimpleJWT.
from django.contrib.auth import get_user_model  # Función para obtener el modelo de usuario activo.

# Obtiene el modelo de usuario actual, ya sea el estándar o uno personalizado.
User = get_user_model()

class JWTAuthMiddleware(BaseMiddleware):
    """
    Middleware que se encarga de autenticar a los usuarios mediante un token JWT.
    Extrae el token de la query string, lo decodifica y asigna el usuario al scope.
    Si no se proporciona un token válido, se asigna un usuario anónimo.
    """
    
    async def __call__(self, scope, receive, send):
        # Se extrae y decodifica la query string de la conexión.
        query_string = scope.get("query_string", b"").decode()
        # Se convierte la query string en un diccionario de parámetros.
        query_params = parse_qs(query_string)

        # Se intenta obtener el token; se toma el primer valor si existe.
        token = query_params.get("token", [None])[0]
        # Se asigna un usuario anónimo por defecto al scope.
        scope["user"] = AnonymousUser()

        # Si se encontró un token, se intenta obtener el usuario correspondiente.
        if token:
            user = await self.get_user_from_token(token)
            if user:
                # Si se encuentra un usuario válido, se asigna al scope.
                scope["user"] = user

        # Se continúa con la ejecución del siguiente middleware o del consumidor.
        return await super().__call__(scope, receive, send)

    @database_sync_to_async
    def get_user_from_token(self, token):
        """
        Decodifica el token JWT y obtiene el usuario correspondiente de la base de datos.
        En caso de error (token inválido, expirado o usuario inexistente), retorna None.
        """
        try:
            # Se crea un objeto AccessToken a partir del token proporcionado.
            access_token = AccessToken(token)
            # Se busca el usuario en la base de datos usando la 'user_id' del token.
            return User.objects.get(id=access_token["user_id"])
        except Exception:
            # Si ocurre cualquier error, se retorna None.
            return None
