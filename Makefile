COMPOSE_SRCS = srcs/docker-compose.yaml
UPFLAG = --detach
DOWNFLAG = --volumes --rmi all
FRONTEND_DIR = srcs/react-frontend

# Compila y construye el entorno completo
all: build

# Construye y levanta los contenedores
build:
	@docker compose -f ${COMPOSE_SRCS} up --build # ${UPFLAG}

# Levanta los contenedores en modo detach
up:
	@docker compose -f ${COMPOSE_SRCS} up ${UPFLAG}

# Inicia los contenedores existentes
start:
	@docker compose -f ${COMPOSE_SRCS} start

# Detiene los contenedores
stop:
	@docker compose -f ${COMPOSE_SRCS} stop

# Baja los contenedores
down:
	@docker compose -f ${COMPOSE_SRCS} down

# Instala las dependencias del frontend
install-frontend:
	@echo "Installing frontend dependencies..."
	@cd ${FRONTEND_DIR} && npm install

# Inicia el frontend localmente
start-frontend:
	@echo "Starting frontend..."
	@cd ${FRONTEND_DIR} && npm start

# Levanta todo: backend y frontend
start-all: up start-frontend
	@echo "Backend and frontend are running."

# Limpia los contenedores y archivos de Docker
clean:
	@docker compose -f ${COMPOSE_SRCS} down ${DOWNFLAG}

# Limpieza adicional de Docker, Python y otros archivos
prune:
	@docker system prune -af --volumes
	@find . -name '__pycache__' -exec rm -rf {} +
	@find . -name '*.pyc' -delete
	@find . -name '*.pyo' -delete
	@find . -path "*/migrations/*.py" -not -name "__init__.py" -delete
	@find . -path "*/migrations/*.pyc" -delete
	@rm -rf logs/*.log
	@rm -rf tmp/

# Limpieza completa, incluyendo dependencias y archivos generados
fclean: clean prune
	@rm -rf ${FRONTEND_DIR}/node_modules
	@rm -rf ${FRONTEND_DIR}/build
	@rm -rf ${FRONTEND_DIR}/.cache

# Reconstrucción completa
re: fclean all

# Declaración de objetivos phony
.PHONY: all build up start stop down clean prune fclean re install-frontend start-frontend start-all
