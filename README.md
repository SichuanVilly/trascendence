# trascendence

IMPORTANTE

Teneis que instalaros docker compose V2 (docker compose version)

## USEFUL STUFF

HOW TO START DOCKER

docker compose run web django-admin startproject trascendence (no need to do this)

docker compose build

docker compose up -d

LOGS

docker compose logs web

-----------------------------------------

HOW TO REMOVE STUFF 

docker stop (container_name)

docker image rmi $(docker images -qa)

docker rm $(docker ps -qa)