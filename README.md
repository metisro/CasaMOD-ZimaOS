# CasaMOD-ZimaOS

CasaMOD compatibility framework for ZimaOS.

ZimaOS uses the CasaOS design language and APIs, but its dashboard is served by
`zimaos-gateway` from embedded assets. It does not expose the editable
`/var/lib/casaos/www/index.html` used by CasaMOD.

CasaMOD-ZimaOS solves this with a reverse proxy and a small compatibility API:

```text
Browser
  -> CasaMOD-ZimaOS proxy :8088
     -> ZimaOS gateway :80
     -> CasaMOD-ZimaOS API :8090
```

## Features

- Injects one stable compatibility loader into the ZimaOS dashboard.
- Discovers enabled mods dynamically from `/DATA/AppData/casamod/mod`.
- Serves mod JavaScript, CSS, icons, and other assets with correct MIME types.
- Stores per-mod JSON configuration under `/DATA/AppData/casamod/config`.
- Avoids execution inside ZimaOS Wujie micro-apps, shadow roots, and iframes.
- Includes adapted Weather Widget and Widget Sortable example mods.

## Container Images

The app uses two CasaMOD-ZimaOS images:

```text
ghcr.io/metisro/casamod-zimaos-api:latest
ghcr.io/metisro/casamod-zimaos-proxy:latest
```

They are built from this GitHub repository. Their upstream Docker Official
Images are `node:22-alpine` and `nginx:alpine`.

The GitHub Actions workflow at `.github/workflows/publish-docker.yml` publishes
both images to GitHub Container Registry for `linux/amd64` and `linux/arm64`.
It uses the repository's built-in `GITHUB_TOKEN`; no registry secret is needed.

## Docker Compose Install

Download `docker-compose.yml` from GitHub or import it as a custom Compose app,
then run:

```sh
docker compose up -d
chmod +x verify.sh
./verify.sh
```

### ZimaOS UI Registry Fallback

Some ZimaOS releases rewrite GHCR pulls through forced registry mirrors. Those
mirrors can fail even when the GHCR images are public and anonymously pullable.
If the ZimaOS custom-app installer reports that it tried four mirror methods,
import `docker-compose.zimaos.yml` instead. It pulls identical images from
Docker Hub, which avoids the broken GHCR mirror path.

To confirm the ZimaOS mirror issue from its terminal:

```sh
docker pull ghcr.io/metisro/casamod-zimaos-api:latest
docker pull flaviusgheorghe/casamod-zimaos-api:latest
```

If the GHCR pull fails but the Docker Hub pull succeeds, use the ZimaOS fallback
Compose file. Alternatively, a direct terminal deployment may bypass the UI
pull mechanism:

```sh
docker compose -f docker-compose.yml up -d
```

If the standalone prototype from earlier compatibility testing still exists,
remove it once before starting the Compose app:

```sh
docker stop casamod-proxy
docker rm casamod-proxy
```

No source checkout, host installation script, or manual mod copying is required
on ZimaOS. `install.sh` remains as a convenience wrapper around
`docker compose up -d`.

### Local Image Build

Developers can build the images directly from the GitHub source checkout:

```sh
docker compose -f docker-compose.build.yml up -d --build
```

Open:

```text
http://ZIMAOS-IP:8088
```

The standard ZimaOS dashboard remains available on port `80`.

## Directories

```text
/DATA/AppData/casamod/
  mod/                    bundled and user-installed mods
  config/                 persistent per-mod settings
```

Both directories are mounted into the containers. Rebuilding the app refreshes
the bundled mods without deleting user-installed mods or persistent settings.

Each enabled mod is a directory containing `casamod.json`:

```json
{
  "name": "Example Mod",
  "enabled": true,
  "scripts": ["mod.js"],
  "styles": ["mod.css"]
}
```

## Compatibility API

Mods can use the browser API exposed by the loader:

```js
const config = await window.CasaMODZimaOS.getConfig("example-mod", {
  enabled: true
});

await window.CasaMODZimaOS.setConfig("example-mod", {
  enabled: false
});

const icon = window.CasaMODZimaOS.assetUrl("example-mod", "icons/icon.svg");
```

Configuration is written atomically to:

```text
/DATA/AppData/casamod/config/<mod-id>.json
```

## Porting CasaOS Mods

CasaOS mods commonly require these changes:

1. Replace `.ps-container` and legacy widget-class assumptions with ZimaOS DOM
   discovery.
2. Use `window.CasaMODZimaOS.getConfig()` and `setConfig()` instead of
   `/v1/file`.
3. Use `window.CasaMODZimaOS.assetUrl()` for mod assets.
4. Avoid running in Wujie micro-apps, shadow roots, and iframes.
5. Guard against repeated execution and asynchronous SPA rendering.

The bundled mods demonstrate these patterns.

## Security

- The API accepts only validated mod IDs.
- Configuration requests cannot contain filesystem paths.
- Request bodies are limited to 64 KiB.
- Configuration writes are JSON-only and atomic.
- The API listens only on `127.0.0.1`; it is exposed through the dashboard
  proxy on the same origin.

Do not install mods whose source code you do not trust. Dashboard mods execute
with access to the authenticated ZimaOS browser session.

## Known ZimaOS Behavior

When accessed through port `8088`, ZimaOS v1.6.1 may log a
`/v2/settings/fe.custom` `400 Bad Request`. It does not prevent the tested mods
from working.
