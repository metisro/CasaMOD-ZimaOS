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

if [ ! -f /data/.bundled-mods-seeded ]; then
  for mod in /data/store/*; do
    [ -d "$mod" ] || continue
    mod_id=$(basename "$mod")
    mkdir -p "/data/mod/$mod_id"
    cp -R "$mod"/. "/data/mod/$mod_id"/
    echo "Initially installed bundled mod: $mod_id"
  done
  touch /data/.bundled-mods-seeded
fi

exec node /app/server.js
