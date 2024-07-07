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

-----------------------------------------

INSTALL DBEAVER IN WSL

sudo apt install snapd

sudo systemctl restart snapd

sudo snap install dbeaver-ce

dbeaver-ce

-----------------------------------------

USE DBEAVER

database -> New Database connection -> PostgreSQL

host -> sudo docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "container ID"
Database -> myproject_db
Username -> myproject_user
Password -> myproject_password

test connection -> ok

myproject_db -> Databases -> myproject_db -> Schemas -> public








