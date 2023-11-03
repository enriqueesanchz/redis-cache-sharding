#!/bin/bash

docker compose up -d
sleep 7
docker exec -it redis-1 redis-cli --cluster create redis-1:6379 redis-2:6379 redis-3:6379
docker exec timescaledb psql -c 'create table solar_plants (timestamp timestamp with time zone default now(), id smallint, kw real, temp real);'
docker exec nodejs node populate
