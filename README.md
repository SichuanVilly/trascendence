# trascendence

IMPORTANTE

Teneis que instalaros docker compose V2 (docker compose version)

## USEFUL STUFF

docker exec -it app-web-1  sh

docker compose run web django-admin startproject trascendence (no need to do this)

docker compose build

docker compose up -d

docker compose logs web

docker exec -it [container-id] bash

-----------------------------------------

HOW TO REMOVE STUFF 

docker stop (container_name)

docker image rmi $(docker images -qa)

docker rm $(docker ps -qa)

docker volume prune

docker system prune
