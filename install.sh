#!/bin/sh
set -eu

docker compose up -d

echo
echo "ZimaMOD is available at http://ZIMAOS-IP:8088"
echo "Run ./verify.sh to validate the deployment."
