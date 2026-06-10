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
  "authors": [
    {
      "name": "Author name",
      "url": "https://github.com/author"
    }
  ],
  "origin": {
    "type": "native"
  },
  "screenshot": "screenshot.png",
  "enabled": true,
  "scripts": ["mod.js"],
  "styles": ["mod.css"]
}
```

Use `"type": "native"` for mods made for ZimaMOD. For mods adapted from an
existing project, include adaptation credit and the original source:

```json
{
  "origin": {
    "type": "adapted",
    "adapter": "ZimaMOD",
    "source": "https://github.com/original/project"
  }
}
```

Installing copies the catalog directory into `mod/<mod-id>`. Uninstalling
removes only the installed copy and leaves the store catalog entry intact.

### Store Card Image

Place a PNG, JPEG, WebP, or SVG image inside the MOD directory and reference
its relative path using `screenshot`:

```text
mods/example-mod/
  zimamod.json
  screenshot.webp
```

```json
{
  "screenshot": "screenshot.webp"
}
```

The MOD Store displays the image with `object-fit: cover` in a wide card media
area. A landscape image around `800x450` pixels is recommended. Keep important
content away from the edges because the image may be cropped.
