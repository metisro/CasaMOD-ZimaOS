#!/bin/sh
set -eu

mkdir -p /data/mod /data/config

for mod in /bundled-mods/*; do
  [ -d "$mod" ] || continue
  mod_id=$(basename "$mod")
  mkdir -p "/data/mod/$mod_id"
  cp -R "$mod"/. "/data/mod/$mod_id"/
  echo "Installed or updated bundled mod: $mod_id"
done

exec node /app/server.js
