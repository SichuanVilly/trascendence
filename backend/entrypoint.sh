#!/bin/sh

echo "Esperando a que la base de datos esté lista..."
while ! nc -z transcendence_db 5432; do
  sleep 1
done
echo "Base de datos lista, aplicando migraciones..."

python manage.py migrate --noinput
python manage.py collectstatic --noinput  # ✅ Asegurar que Django recolecta archivos estáticos

# Espera unos segundos antes de iniciar Daphne
echo "Esperando que Django termine de cargar aplicaciones..."
sleep 5  # Puedes aumentar el tiempo si sigue fallando

echo "Iniciando servidor Daphne..."
daphne -b 0.0.0.0 -p 8000 backend.asgi:application


