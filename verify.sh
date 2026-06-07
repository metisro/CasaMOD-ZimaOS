#!/bin/sh
set -eu

base_url=${CASAMOD_URL:-http://127.0.0.1:8088}
config_id=casamod-deployment-check
config_url="$base_url/casamod-api/config/$config_id"
expected='{"deployment":"ok"}'

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

check_status() {
  url=$1
  expected_status=$2
  actual_status=$(curl -sS -o /dev/null -w '%{http_code}' "$url")
  [ "$actual_status" = "$expected_status" ] ||
    fail "$url returned HTTP $actual_status, expected $expected_status"
  echo "PASS: $url returned HTTP $actual_status"
}

docker inspect -f '{{.State.Running}}' casamod-zimaos-api | grep -qx true ||
  fail "casamod-zimaos-api is not running"
docker inspect -f '{{.State.Running}}' casamod-zimaos-proxy | grep -qx true ||
  fail "casamod-zimaos-proxy is not running"
echo "PASS: CasaMOD-ZimaOS containers are running"

check_status "$base_url/casamod-api/health" 200
check_status "$base_url/casamod-api/mods" 200
check_status "$base_url/casamod-runtime/loader.js" 200
check_status "$base_url/mod/weather-widget/mod.js" 200
check_status "$base_url/mod/widget-sortable-zimaos/mod.js" 200
check_status "$base_url/mod/widget-sortable-zimaos/mod.css" 200

curl -fsS "$base_url/" | grep -q '/casamod-runtime/loader.js' ||
  fail "dashboard HTML does not contain the CasaMOD-ZimaOS loader"
echo "PASS: dashboard HTML contains the CasaMOD-ZimaOS loader"

curl -fsS \
  -X PUT \
  -H 'Content-Type: application/json' \
  --data "$expected" \
  "$config_url" >/dev/null

curl -fsS "$config_url" | grep -q '"deployment":"ok"' ||
  fail "configuration API did not persist and return the deployment check"
docker exec casamod-zimaos-api test -f "/data/config/$config_id.json" ||
  fail "configuration file was not written to the persistent config volume"
echo "PASS: configuration API persisted data"

docker exec casamod-zimaos-api rm -f "/data/config/$config_id.json"
echo "CasaMOD-ZimaOS deployment verification passed."
