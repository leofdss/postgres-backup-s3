#!/bin/bash
mkdir -p ./postgres_database
docker-compose -p postgres up -d --build

exit 0