#!/bin/sh
set -eu

docker compose up -d

echo
dashboard_port=${ZIMAMOD_DASHBOARD_PORT:-8088}
echo "ZimaMOD is available at http://ZIMAOS-IP:$dashboard_port"
echo "Run ./verify.sh to validate the deployment."
