# Bundled Mods

These mods demonstrate the ZimaMOD compatibility APIs.

Install a mod by copying its directory to:

```text
/DATA/AppData/zimamod/mod/<mod-id>
```

The framework scans that directory dynamically. A proxy configuration change is
not required.

## MOD Store Catalog

Place available mods under:

```text
/DATA/AppData/zimamod/store/<mod-id>
```

The MOD Store reads the same `zimamod.json` manifest used by installed mods.
Add `description` and an optional relative `screenshot` path for the store card:

```json
{
  "name": "Example Mod",
  "version": "1.0.0",
  "description": "A short explanation shown in the MOD Store.",
  "screenshot": "screenshot.png",
  "enabled": true,
  "scripts": ["mod.js"],
  "styles": ["mod.css"]
}
```

Installing copies the catalog directory into `mod/<mod-id>`. Uninstalling
removes only the installed copy and leaves the store catalog entry intact.
