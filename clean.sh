#!/bin/bash

# Parar y eliminar todos los contenedores de Docker
docker stop $(docker ps -qa)
docker rm -f $(docker ps -qa)

# Eliminar todas las imagenes de Docker
docker rmi $(docker images -qa)

# Eliminar todos los volúmenes de Docker
docker volume prune -f

# Eliminar todos los contenedores, imagenes, redes y volúmenes no utilizados
docker system prune -a --volumes -f

# Encontrar y eliminar carpetas __pycache__
echo "Eliminando carpetas __pycache__..."
find . -name '__pycache__' -exec rm -rf {} +

# Eliminar archivos .pyc y .pyo
echo "Eliminando archivos .pyc y .pyo..."
find . -name '*.pyc' -delete
find . -name '*.pyo' -delete

# Eliminar migraciones de Django innecesarias (excepto __init__.py)
echo "Eliminando migraciones de Django innecesarias..."
find . -path "*/migrations/*.py" -not -name "__init__.py" -delete
find . -path "*/migrations/*.pyc" -delete

# Eliminar el entorno virtual si existe
if [ -d "venv" ]; then
    echo "Eliminando entorno virtual..."
    rm -rf venv/
fi

# Eliminar node_modules si existe
if [ -d "node_modules" ]; then
    echo "Eliminando node_modules..."
    rm -rf node_modules/
fi

# Detener el servicio de Redis si está corriendo en el sistema fuera de Docker
sudo systemctl stop redis-server || sudo service redis-server stop

#eliminar el redis del purto 6379
sudo fuser -k 6379/tcp

# Limpieza completa terminada
echo "Limpieza completa terminada."
