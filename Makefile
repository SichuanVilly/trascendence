COMPOSE_SRCS = srcs/docker-compose.yaml
UPFLAG = --detach
DOWNFLAG = --volumes --rmi all

all: build

build:
	@docker compose -f ${COMPOSE_SRCS} up --build #${UPFLAG}

up:
	@docker compose -f ${COMPOSE_SRCS} up ${UPFLAG}

start:
	@docker compose -f ${COMPOSE_SRCS} start

stop:
	@docker compose -f ${COMPOSE_SRCS} stop

down:
	@docker compose -f ${COMPOSE_SRCS} down

clean:
	@docker compose -f ${COMPOSE_SRCS} down ${DOWNFLAG}

prune:
	@docker system prune -af --volumes
	@find . -name '__pycache__' -exec rm -rf {} +
	@find . -name '*.pyc' -delete
	@find . -name '*.pyo' -delete
	@find . -path "*/migrations/*.py" -not -name "__init__.py" -delete
	@find . -path "*/migrations/*.pyc" -delete

fclean: clean prune

re: fclean all

.PHONY: all build up start stop down clean prune fclean re
