#!/bin/bash

docker stop $(docker ps -qa);
docker rm -f $(docker ps -qa);
docker rmi $(docker images -qa);
docker volume prune;
docker system prune;
