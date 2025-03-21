from django.contrib.auth import get_user_model
from rest_framework import serializers
import re

User = get_user_model()

class FriendSerializer(serializers.ModelSerializer):
    avatar = serializers.ImageField(use_url=True)
    blocked = serializers.SerializerMethodField()
    class Meta:
        model = User
        fields = ['username', 'avatar', 'blocked']
    def get_blocked(self, obj):
        # 'context' debe incluir el usuario actual
        current_user = self.context.get("current_user")
        if current_user:
            # Retorna True si el amigo está en el conjunto de bloqueados del usuario actual
            return obj in current_user.blocked_friends.all()
        return False

class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6, required=False)
    avatar = serializers.ImageField(use_url=True, required=False, allow_null=True)
    friends = FriendSerializer(many=True, read_only=True)
    blocked_friends = FriendSerializer(many=True, read_only=True)  # Lista de usuarios bloqueados
    
    class Meta:
        model = User
        fields = ['id', 'username', 'password', 'avatar', 'wins', 'losses', 'friends', 'blocked_friends']
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
            'wins': {'read_only': True},
            'losses': {'read_only': True},
        }

    def validate_password(self, value):
        """
        Valida que la contraseña contenga al menos un número.
        """
        if not re.search(r'\d', value):
            raise serializers.ValidationError("La contraseña debe contener al menos un número.")
        return value

    def create(self, validated_data):
        """
        Crea un nuevo usuario. Se espera que se provea la contraseña para encriptarla.
        """
        password = validated_data.pop('password', None)
        if not password:
            raise serializers.ValidationError({"password": "Este campo es requerido."})
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        """
        Actualiza la información del usuario.
        Si se envía una contraseña, se encripta antes de guardar.
        """
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
