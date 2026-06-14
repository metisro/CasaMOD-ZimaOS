# Compatibility Findings

Validated against ZimaOS v1.6.1 running inside `dockurr/zima`.

## Legacy Mod-System Limitations

Traditional CasaOS host-patching mod systems assume:

- `/var/lib/casaos/www/index.html`
- a `casaos` executable
- `casaos-gateway.service`
- the `.ps-container` dashboard widget container

ZimaOS provides:

- `/usr/bin/zimaos-gateway`
- embedded dashboard assets served by Caddy
- a different home-page DOM
- Wujie micro-app shadow roots that replay injected scripts

## Proven Compatibility Approach

- Reverse proxy ZimaOS gateway port `80` through dashboard port `8088` by
  default, with runtime-configurable dashboard and API ports.
- Disable upstream compression so Nginx can inject the framework loader.
- Serve mod assets from `/DATA/AppData/zimamod/mod`.
- Run mod code only in the top dashboard document.
- Store settings through a constrained local API.
- Package the API, proxy, loader, and bundled mods as a self-contained Docker
  Compose app; use `/DATA/AppData/zimamod` only for persistent state.

## Tested Mods

The bundled MOD Store catalog currently contains:

- Built for ZimaMOD: Weather Widget
- Adapted from CasaMOD for ZimaMOD: Bing Wallpaper v2, Network Title Setter,
  and Widget Sortable
- CasaMOD-compatible without source adaptation: Add Hostname to Title, Emoji
  Cursor, Hello, World!, and Snow Wallpaper

Bundled catalog mods remain uninstalled until selected by the user. The
long-term goal is to adapt all CasaMOD mods for ZimaMOD in future releases,
after each one is reviewed and tested on ZimaOS.
