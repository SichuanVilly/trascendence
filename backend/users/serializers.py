from django.contrib.auth import get_user_model  # Importa la función para obtener el modelo de usuario activo (puede ser el modelo estándar o uno personalizado)
from rest_framework import serializers         # Importa los serializers de Django REST Framework para transformar datos complejos en tipos de datos nativos de Python
import re  # Importa la librería de expresiones regulares para validar patrones en cadenas, en este caso la contraseña

# Se obtiene el modelo de usuario definido en el proyecto
User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    # Se define el campo 'password' para que sea de solo escritura y tenga una longitud mínima de 6 caracteres
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        # Se especifica que el modelo a serializar es 'User'
        model = User
        # Se indican los campos que se incluirán en la serialización
        fields = ('id', 'username', 'password', 'email', 'avatar')

    def validate_password(self, value):
        """
        Verifica que la contraseña contenga al menos un número.
        Si la contraseña no cumple con este requisito, se genera un error de validación.
        """
        if not re.search(r'\d', value):  # Busca algún dígito en la contraseña
            raise serializers.ValidationError("La contraseña debe contener al menos un número.")
        return value

    def create(self, validated_data):
        """
        Crea un nuevo usuario utilizando los datos validados.
        Se usa el método 'create_user' del modelo para que la contraseña se encripte automáticamente.
        """
        user = User.objects.create_user(**validated_data)
        return user

class LoginSerializer(serializers.Serializer):
    # Serializer básico para el proceso de autenticación que requiere solo 'username' y 'password'
    username = serializers.CharField()  # Campo para el nombre de usuario
    password = serializers.CharField(write_only=True)  # Campo para la contraseña, definido como solo escritura para no exponerlo en las respuestas
