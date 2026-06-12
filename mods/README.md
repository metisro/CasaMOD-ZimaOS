# Developing And Contributing ZimaMOD Mods

This directory contains the mods bundled with ZimaMOD and serves as the catalog
source for the built-in MOD Store. External developers can use the same format
to create mods for their own installations or propose mods for inclusion in
ZimaMOD.

All contributions are submitted through pull requests and reviewed by the
ZimaMOD maintainer before they are merged. Submission does not guarantee
inclusion.

## How Mods Are Loaded

Installed mods live under:

```text
/DATA/AppData/zimamod/mod/<mod-id>
```

ZimaMOD scans that directory dynamically and loads the enabled scripts and
styles declared by each mod. A proxy configuration change is not required.
Reload the proxied ZimaMOD dashboard after changing a mod.

Available MOD Store entries live under:

```text
/DATA/AppData/zimamod/store/<mod-id>
```

Installing a MOD Store entry copies it into `mod/<mod-id>`. Uninstalling it
removes only the installed copy and leaves its store entry available.

The directories in this repository's `mods/` folder are copied into the MOD
Store whenever the API image starts. They are installed automatically only on
the first deployment. On an existing development installation, rebuild the
images and then uninstall and reinstall the mod from the MOD Store, or replace
its installed directory manually, to test the refreshed copy.

For framework and mod uninstall, rollback, backup, and recovery procedures, see
the repository [operations guide](../docs/OPERATIONS.md).

## Install A Mod Outside The MOD Store

Users can install a mod manually without adding it to the MOD Store:

1. Download or copy the complete mod directory.
2. Review and trust its source code before installing it.
3. Confirm that the directory name is a valid mod ID and that it contains
   `zimamod.json`, or at minimum a `mod.js` or `mod.css` file.
4. Copy the directory to:

   ```text
   /DATA/AppData/zimamod/mod/<mod-id>
   ```

5. Reload the proxied ZimaMOD dashboard, normally
   `http://ZIMAOS-IP:8088`, with the browser cache disabled.

To update a manually installed mod, replace its complete directory and reload
the dashboard. To uninstall it, remove its directory from
`/DATA/AppData/zimamod/mod/` and reload the dashboard. Manually installed mods
do not need a matching entry under `/DATA/AppData/zimamod/store/`.

Mods execute with access to the authenticated ZimaOS browser session. Treat
mods from outside the MOD Store as unverified software and back up important
data before installing them.

## CasaMOD Compatibility

Some CasaMOD mods may be compatible with ZimaMOD and ZimaOS without any source
changes, particularly simple JavaScript or CSS mods that do not depend on
CasaOS-specific dashboard elements or APIs. Compatibility must not be assumed:
test each mod on ZimaOS before relying on it.

The MOD Store category **Compatible with ZimaMOD created for CasaMOD** contains
CasaMOD mods that have been tested on ZimaMOD. Entries in this category retain
their original CasaMOD authorship and source links. A compatible entry may
include a small documented adaptation, such as an English translation, when
required for inclusion.

Mods commonly need adaptation when they depend on CasaOS DOM selectors,
`.ps-container`, the CasaOS `/v1/file` API, fixed asset paths, or dashboard
behavior that differs in ZimaOS. Use the ZimaMOD browser API and runtime
requirements documented below when changes are needed.

## Create A Mod

Create a directory whose name is also the mod ID:

```text
mods/example-mod/
  zimamod.json
  mod.js
  mod.css
  README.md
  screenshot.webp
```

A mod ID must start with a lowercase letter or number, contain only lowercase
letters, numbers, and hyphens, and be no longer than 64 characters. For
example, `example-mod` is valid and `Example_Mod` is not.

Only include files needed by the mod. Add a mod-level `README.md` explaining
its behavior, installation or configuration requirements, and any known
limitations.

## Manifest Reference

Every contributed mod must include `zimamod.json`. Use this complete example as
a starting point:

```json
{
  "name": "Example Mod",
  "version": "1.0.0",
  "description": "A short explanation shown in the MOD Store.",
  "authors": [
    {
      "name": "Author name",
      "url": "https://github.com/author"
    }
  ],
  "origin": {
    "type": "native"
  },
  "screenshot": "screenshot.webp",
  "enabled": true,
  "scripts": ["mod.js"],
  "styles": ["mod.css"]
}
```

The supported fields are:

| Field | Purpose |
| --- | --- |
| `name` | Display name. Defaults to the mod ID. |
| `version` | Version string used for display and asset cache busting. |
| `description` | Short MOD Store description. |
| `category` | Optional MOD Store category and filter label. |
| `authors` | Author names with optional HTTP or HTTPS profile URLs. |
| `origin` | Declares a `native`, `compatible`, or `adapted` mod and its source. |
| `screenshot` | Relative path to the MOD Store card image. |
| `enabled` | Set to `false` to prevent an installed mod from loading. |
| `scripts` | JavaScript files loaded in listed order. |
| `styles` | CSS files loaded in listed order. |

If `scripts` or `styles` is omitted, ZimaMOD automatically uses `mod.js` or
`mod.css` when that file exists. Relative asset paths must not contain `..`.

### Adapted Mods

For a mod adapted from another project, credit the adapter and link to the
original source:

```json
{
  "origin": {
    "type": "adapted",
    "adapter": "Your name",
    "source": "https://github.com/original/project"
  }
}
```

Confirm that the original license permits adaptation and redistribution.
Preserve all required copyright, license, and attribution notices inside the
mod directory. Code without a license is not automatically available for
reuse.

### Compatible CasaMOD Mods

Use the following metadata for an unchanged CasaMOD mod that has been tested
and confirmed to work with ZimaMOD:

```json
{
  "category": "Compatible with ZimaMOD created for CasaMOD",
  "origin": {
    "type": "compatible",
    "source": "https://github.com/Cp0204/CasaMOD/tree/main/app/mod/example-mod"
  }
}
```

Use `origin.type: "adapted"` instead when the source was changed for ZimaMOD,
while retaining the same category when it remains a CasaMOD-created mod.

## Browser API

Mods run in the authenticated ZimaOS dashboard and can use the API exposed as
`window.ZimaMOD`:

```js
const MOD_ID = "example-mod";

const config = await window.ZimaMOD.getConfig(MOD_ID, {
  enabled: true
});

await window.ZimaMOD.setConfig(MOD_ID, {
  ...config,
  enabled: false
});

const iconUrl = window.ZimaMOD.assetUrl(MOD_ID, "icons/example.svg");
```

Configuration is stored as JSON under:

```text
/DATA/AppData/zimamod/config/<mod-id>.json
```

Configuration request bodies are limited to 64 KiB. Use a stable, valid mod ID
for configuration and asset calls.

## Runtime Requirements

Dashboard mods execute with access to the authenticated ZimaOS browser session.
Keep contributions focused, inspectable, and safe.

- Do not send credentials, tokens, personal data, or dashboard data elsewhere.
- Do not load untrusted remote scripts or styles.
- Avoid global variables and unscoped CSS selectors.
- Prevent repeated initialization because the dashboard is a single-page app.
- Handle asynchronous dashboard rendering without busy loops.
- Do not run inside Wujie micro-apps, iframes, or shadow roots.
- Clean up timers, listeners, and DOM elements when practical.
- Use `window.ZimaMOD.assetUrl()` instead of hard-coded asset paths.
- Use `window.ZimaMOD.getConfig()` and `setConfig()` for persistent settings.

The bundled Weather Widget and Widget Sortable mods demonstrate the expected
patterns.

## Store Card Image

Place a PNG, JPEG, WebP, or SVG image inside the mod directory and reference
its relative path with `screenshot`.

A landscape image around `800x450` pixels is recommended. The MOD Store uses
`object-fit: cover`, so keep important content away from the edges.

## Test A Mod

For quick iteration on a ZimaOS host, copy the mod directory to:

```text
/DATA/AppData/zimamod/mod/<mod-id>
```

Then reload the proxied dashboard, normally `http://ZIMAOS-IP:8088`, with the
browser cache disabled. Check the browser console for errors and verify that
the normal ZimaOS dashboard still works when the mod is enabled and disabled.

To test a bundled contribution from a source checkout:

```sh
docker compose -f docker-compose.build.yml up -d --build
./verify.sh
```

Also run syntax checks for each JavaScript file changed:

```sh
node --check mods/example-mod/mod.js
```

Test installation, uninstallation, configuration persistence, repeated page
loads, and the MOD Store card. Test on each ZimaOS version and architecture
available to you, and list anything you could not test in the pull request.

## Contribute A Mod

External developers can propose a new mod or improvements to an existing mod:

1. Fork [metisro/ZimaMOD](https://github.com/metisro/ZimaMOD) on GitHub.
2. Create a focused branch from the latest `main`.
3. Add or update one mod under `mods/<mod-id>/`.
4. Include its manifest, documentation, screenshot, authorship, origin, and all
   required third-party notices.
5. Run the relevant tests and syntax checks.
6. Open a pull request against `metisro/ZimaMOD:main`.

For example:

```sh
git clone https://github.com/YOUR-USERNAME/ZimaMOD.git
cd ZimaMOD
git switch -c add-example-mod
# Add and test mods/example-mod/
git add mods/example-mod
git commit -m "Add example mod"
git push -u origin add-example-mod
```

Then open a pull request from the branch in your fork. For a substantial mod or
an idea that changes shared behavior, open a GitHub issue before investing in
the full implementation so its scope and fit can be discussed.

In the pull request, explain what the mod does, why it is useful, how it was
tested, which ZimaOS versions were tested, and any security, compatibility, or
licensing considerations. Include screenshots for visible changes.

The maintainer will review the code, behavior, security implications,
documentation, attribution, and license compliance. Address review feedback by
pushing additional commits to the same pull-request branch. The maintainer
makes the final merge and release decision.

## Contribute Framework Changes

Changes to the API, proxy, runtime loader, MOD Store, documentation, tests, or
build configuration follow the same fork and pull-request workflow.

Keep each pull request focused on one change. Explain the problem and intended
behavior before describing the implementation. Add or update tests when
changing shared behavior, and call out compatibility or migration effects.

Before submitting framework changes, run the relevant repository checks:

```sh
node --test api/server.test.js
node --check runtime/loader.js
node --check runtime/store.js
node --check mods/weather-widget/mod.js
node --check mods/widget-sortable-zimaos/mod.js
```

See the repository-wide [contribution policy](../CONTRIBUTING.md) for licensing
requirements that apply to every submission.
