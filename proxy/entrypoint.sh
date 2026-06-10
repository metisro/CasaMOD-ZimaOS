#!/bin/sh
set -eu

dashboard_port=${ZIMAMOD_DASHBOARD_PORT:-8088}
api_port=${ZIMAMOD_API_PORT:-8090}

valid_port() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$1" -ge 1 ] && [ "$1" -le 65535 ]
}

valid_port "$dashboard_port" || {
  echo "Invalid ZIMAMOD_DASHBOARD_PORT: $dashboard_port" >&2
  exit 1
}

valid_port "$api_port" || {
  echo "Invalid ZIMAMOD_API_PORT: $api_port" >&2
  exit 1
}

[ "$dashboard_port" != "$api_port" ] || {
  echo "ZIMAMOD_DASHBOARD_PORT and ZIMAMOD_API_PORT must be different" >&2
  exit 1
}

sed \
  -e "s/__DASHBOARD_PORT__/$dashboard_port/g" \
  -e "s/__API_PORT__/$api_port/g" \
  /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

nginx -t
exec nginx -g 'daemon off;'
