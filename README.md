# ZimaMOD

<img src="assets/zimamod-icon.png" alt="ZimaMOD icon" width="180">

Independent mod framework for ZimaOS.

ZimaOS uses the CasaOS design language and APIs, but its dashboard is served by
`zimaos-gateway` from embedded assets. It does not expose the editable
dashboard files expected by traditional host-patching mod systems.

ZimaMOD solves this with a reverse proxy and a small compatibility API:

```text
Browser
  -> ZimaMOD proxy :8088
     -> ZimaOS gateway :80
     -> ZimaMOD API :8090
```

## Features

- Injects one stable compatibility loader into the ZimaOS dashboard.
- Discovers enabled mods dynamically from `/DATA/AppData/zimamod/mod`.
- Serves mod JavaScript, CSS, icons, and other assets with correct MIME types.
- Stores per-mod JSON configuration under `/DATA/AppData/zimamod/config`.
- Avoids execution inside ZimaOS Wujie micro-apps, shadow roots, and iframes.
- Includes adapted Weather Widget and Widget Sortable example mods.
- Includes ZimaOS custom-app metadata and a dedicated ZimaMOD app icon.
- Includes a dashboard MOD Store for installing and uninstalling catalog mods.

## Container Images

The app uses two ZimaMOD images:

```text
ghcr.io/metisro/zimamod-api:latest
ghcr.io/metisro/zimamod-proxy:latest
```

Releases also publish immutable semantic-version tags, such as:

```text
ghcr.io/metisro/zimamod-api:1.1.8
ghcr.io/metisro/zimamod-proxy:1.1.8
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

The install Compose file pins both images and `x-casaos.version` to the current
semantic release. This lets ZimaOS display the installed version and provides
reliable app-store update comparisons. The publishing workflow also updates
`:latest` for users who prefer manually tracking the newest build.

ZimaOS can automatically offer future versions only when ZimaMOD is installed
from an app-store source that tracks this manifest. A one-time custom Compose
import displays the version but must be re-imported or rebuilt manually when a
new manifest is released.

### Creating A Release

The project version is stored in `VERSION`, the install Compose image tags, and
`x-casaos.version`. To publish a release, update those values together, commit
the change, then create and push a matching `v<version>` Git tag:

```sh
git tag v1.1.8
git push origin v1.1.8
```

The tag publishes immutable `:<version>` API and proxy images and creates a
GitHub Release. Normal pushes to `main` update only `:latest` and commit-SHA
image tags.

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
/DATA/AppData/zimamod/
  mod/                    bundled and user-installed mods
  config/                 persistent per-mod settings
  store/                  mods available through the MOD Store
```

These directories are mounted into the containers. Rebuilding the app refreshes
the bundled mods without deleting user-installed mods or persistent settings.

Hover over the ZimaMOD app tile on the dashboard and select **MOD Store** to
view the catalog. Installing copies a catalog mod from `store/<mod-id>` into
`mod/<mod-id>`; uninstalling removes only the installed copy. Reload the
dashboard after changing installed mods.

Each enabled mod is a directory containing `zimamod.json`:

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
const config = await window.ZimaMOD.getConfig("example-mod", {
  enabled: true
});

await window.ZimaMOD.setConfig("example-mod", {
  enabled: false
});

const icon = window.ZimaMOD.assetUrl("example-mod", "icons/icon.svg");
```

Configuration is written atomically to:

```text
/DATA/AppData/zimamod/config/<mod-id>.json
```

## Porting CasaOS Mods

CasaOS mods commonly require these changes:

1. Replace `.ps-container` and legacy widget-class assumptions with ZimaOS DOM
   discovery.
2. Use `window.ZimaMOD.getConfig()` and `setConfig()` instead of
   `/v1/file`.
3. Use `window.ZimaMOD.assetUrl()` for mod assets.
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

## ZimaOS Compatibility

When ZimaOS returns `400 Bad Request` for the optional
`/v2/settings/fe.custom` request, the proxy supplies an empty custom-settings
response so the dashboard can continue without logging an unhandled error.
