#!/bin/bash

################
# file name ----> dump.bak
################

docker cp ./dump.bak postgres_postgres_1:/dump.bak
docker exec -it postgres_postgres_1 psql -U postgres -p 5432 -f /dump.bak postgres
docker exec -it postgres_postgres_1 rm /dump.bak

exit 0
