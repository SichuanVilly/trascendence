#!/bin/bash
export DJANGO_SETTINGS_MODULE=trascendence.settings

# No es necesario hacer cd si ya estás en el directorio correcto
# cd trascendence  

# Verificar si el superusuario ya existe
if python manage.py shell -c "from django.contrib.auth.models import User; print(User.objects.filter(username='admin').exists())" | grep -q "True"; then
    echo "Superuser already exists"
else
    # Crear el superusuario
    echo "from django.contrib.auth.models import User; User.objects.create_superuser('admin', 'admin@example.com', 'password')" | python manage.py shell
    echo "Superuser created successfully (username: admin, password: password)"
fi

echo "Creating Migrations..."
python manage.py makemigrations trascendence
echo ====================================

echo "Starting Migrations..."
python manage.py migrate
echo ====================================

echo "Starting Server..."
python manage.py runserver 0.0.0.0:8000

