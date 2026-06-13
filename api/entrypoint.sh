#!/bin/sh
set -eu

mkdir -p /data/mod /data/config /data/store

for mod in /bundled-mods/*; do
  [ -d "$mod" ] || continue
  mod_id=$(basename "$mod")
  mkdir -p "/data/store/$mod_id"
  cp -R "$mod"/. "/data/store/$mod_id"/
  echo "Updated MOD Store entry: $mod_id"
done

exec node /app/server.js
