# Makefile para iniciar todo el proyecto con Docker

# Variables
DOCKER_COMPOSE = sudo docker-compose

# Construye y levanta los contenedores, asegurando que se ejecuten las migraciones
up:
	$(DOCKER_COMPOSE) up -d --build
	@echo "⏳ Esperando a que el backend esté listo..."
	@sleep 5
	@echo "🚀 Ejecutando migraciones..."
	$(DOCKER_COMPOSE) exec backend python manage.py makemigrations
	$(DOCKER_COMPOSE) exec backend python manage.py migrate

# Detiene y elimina los contenedores
down:
	$(DOCKER_COMPOSE) down

# Reinicia los contenedores con migraciones
restart:
	$(DOCKER_COMPOSE) down
	$(DOCKER_COMPOSE) up -d --build
	@sleep 5
	$(DOCKER_COMPOSE) exec backend python manage.py makemigrations
	$(DOCKER_COMPOSE) exec backend python manage.py migrate

# Muestra los logs de los contenedores
logs:
	$(DOCKER_COMPOSE) logs -f

# Ejecuta migraciones de Django manualmente
migrate:
	$(DOCKER_COMPOSE) exec backend python manage.py makemigrations
	$(DOCKER_COMPOSE) exec backend python manage.py migrate

# Crea un superusuario de Django
createsuperuser:
	$(DOCKER_COMPOSE) exec backend python manage.py createsuperuser

# Ejecuta la consola de Django en el backend
shell:
	$(DOCKER_COMPOSE) exec backend python manage.py shell

# Borra y reconstruye los contenedores asegurando migraciones
rebuild:
	@echo "Deteniendo y eliminando contenedores..."
	$(DOCKER_COMPOSE) down -v
	@echo "🚀 Reconstruyendo contenedores..."
	$(DOCKER_COMPOSE) up -d --build
	@sleep 5
	@echo "🚀 Ejecutando migraciones..."
	$(DOCKER_COMPOSE) exec backend python manage.py makemigrations
	$(DOCKER_COMPOSE) exec backend python manage.py migrate
	$(DOCKER_COMPOSE) exec backend python3 manage.py makemigrations
	$(DOCKER_COMPOSE) exec backend python3 manage.py migrate
# Accede a la base de datos PostgreSQL dentro de Docker
dbshell:
	$(DOCKER_COMPOSE) exec db psql -U postgres -d transcendence_db

# Accede al contenedor del backend
backend-shell:
	$(DOCKER_COMPOSE) exec backend sh

# Accede al contenedor del frontend
frontend-shell:
	$(DOCKER_COMPOSE) exec frontend sh

# Muestra los contenedores activos
ps:
	$(DOCKER_COMPOSE) ps

# Limpieza completa del proyecto
clean:
	@echo "⏳ Deteniendo contenedores..."
	-docker stop transcendence_redis transcendence_backend transcendence_frontend transcendence_db || true
	@echo "🗑️  Eliminando contenedores..."
	-docker rm transcendence_redis transcendence_backend transcendence_frontend transcendence_db || true
	@echo "🗑️  Eliminando volúmenes de PostgreSQL y Redis..."
	-docker volume rm transcendence_postgres_data || true
	-docker volume prune -f
	@echo "🗑️  Eliminando redes de Docker..."
	-docker network prune -f
	@echo "🔄 Liberando puertos (Redis y PostgreSQL)..."
	-sudo fuser -k 5432/tcp || true
	-sudo fuser -k 6379/tcp || true
	@echo "💀 Matando procesos de Redis si existen..."
	-ps aux | grep redis | grep -v grep | awk '{print $$2}' | xargs -r sudo kill -9
	@echo "🧹 Eliminando migraciones de Django..."
	find backend/users/migrations/ -name "*.py" -not -name "__init__.py" -delete
	@echo "🧹 Eliminando archivos de caché de Python..."
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	@echo "🗑️  Eliminando archivos estáticos recolectados..."
	rm -rf backend/staticfiles
	@echo "🗑️  Eliminando logs antiguos..."
	rm -rf backend/logs/*.log || true
	@echo "🧹 Eliminando imágenes de Docker sin usar (⚠️ Puede tardar)..."
	-docker image prune -af || true
	@echo "✅ Limpieza completada."

# Logs
logs-backend:
	docker logs -f transcendence_backend

logs-frontend:
	docker logs -f transcendence_frontend

.PHONY: up down restart logs migrate createsuperuser shell rebuild dbshell backend-shell frontend-shell ps clean logs-backend logs-frontend
