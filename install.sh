#!/bin/sh
set -eu

if docker ps --format '{{.Names}}' | grep -qx casamod-proxy; then
  echo "The prototype casamod-proxy container is still using port 8088."
  echo "Stop and remove it before installing CasaMOD-ZimaOS:"
  echo "  docker stop casamod-proxy"
  echo "  docker rm casamod-proxy"
  exit 1
fi

docker compose up -d

echo
echo "CasaMOD-ZimaOS is available at http://ZIMAOS-IP:8088"
echo "Run ./verify.sh to validate the deployment."
