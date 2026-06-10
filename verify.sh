#!/bin/sh
set -eu

dashboard_port=${ZIMAMOD_DASHBOARD_PORT:-8088}
base_url=${ZIMAMOD_URL:-http://127.0.0.1:$dashboard_port}
config_id=zimamod-deployment-check
config_url="$base_url/zimamod-api/config/$config_id"
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

docker inspect -f '{{.State.Running}}' zimamod-api | grep -qx true ||
  fail "zimamod-api is not running"
docker inspect -f '{{.State.Running}}' zimamod-proxy | grep -qx true ||
  fail "zimamod-proxy is not running"
echo "PASS: ZimaMOD containers are running"

check_status "$base_url/zimamod-api/health" 200
check_status "$base_url/zimamod-api/mods" 200
check_status "$base_url/zimamod-api/store" 200
check_status "$base_url/zimamod-api/update" 200
check_status "$base_url/zimamod-runtime/loader.js" 200
check_status "$base_url/zimamod-runtime/store.js" 200
check_status "$base_url/zimamod-runtime/store.css" 200
check_status "$base_url/zimamod-runtime/zimamod-icon.png" 200
check_status "$base_url/mod/weather-widget/mod.js" 200
check_status "$base_url/store/weather-widget/screenshot.jpg" 200
check_status "$base_url/mod/widget-sortable-zimaos/mod.js" 200
check_status "$base_url/mod/widget-sortable-zimaos/mod.css" 200
check_status "$base_url/v2/settings/fe.custom" 200

curl -fsS "$base_url/" | grep -q '/zimamod-runtime/loader.js?v=1.1.17' ||
  fail "dashboard HTML does not contain the ZimaMOD loader"
echo "PASS: dashboard HTML contains the ZimaMOD loader"

curl -fsS \
  -X PUT \
  -H 'Content-Type: application/json' \
  --data "$expected" \
  "$config_url" >/dev/null

curl -fsS "$config_url" | grep -q '"deployment":"ok"' ||
  fail "configuration API did not persist and return the deployment check"
docker exec zimamod-api test -f "/data/config/$config_id.json" ||
  fail "configuration file was not written to the persistent config volume"
echo "PASS: configuration API persisted data"

docker exec zimamod-api rm -f "/data/config/$config_id.json"
echo "ZimaMOD deployment verification passed."
