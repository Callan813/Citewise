#!/bin/sh
# Brings the server up to the latest main. Migrations run before the new app
# starts, and if they fail, compose stops there and the old containers keep going.
set -eu

cd "$(dirname "$0")/.."
git pull --ff-only
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --wait
docker image prune -f
