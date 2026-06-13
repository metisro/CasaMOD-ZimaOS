#!/bin/sh
set -eu

docker compose up -d

echo
echo "ZimaMOD is available at the Web UI port configured in docker-compose.yml (default: http://ZIMAOS-IP:8088)"
echo "Run ./verify.sh to validate the deployment."
