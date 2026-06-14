# Bing Wallpaper v2

Sets the current Bing image of the day as the ZimaOS dashboard wallpaper.
Right-click the wallpaper to view its description and open the Bing image
information page. The information bubble also includes a **Save** button that
stores the current image in `/DATA/Gallery/Bing Wallpapers`.

The `zimamod-api` container must have the matching bind mount:

```yaml
- /DATA/Gallery/Bing Wallpapers:/gallery
```

If an existing installation was upgraded by changing only image tags, add this
volume in ZimaOS Settings and recreate the API container. Without the mount,
ZimaMOD refuses to report the wallpaper as saved.

Before recreating an affected container, recover any wallpapers that were
previously written into its private `/gallery` directory:

```sh
mkdir -p "/DATA/Gallery/Bing Wallpapers"
docker cp "zimamod-api:/gallery/." "/DATA/Gallery/Bing Wallpapers/"
```

After adding the volume and recreating the container, verify the mount:

```sh
curl -fsS http://127.0.0.1:8088/zimamod-api/health
```

The response must include `"galleryMounted":true`.

- Original idea and author: Cp0204
- Original source: [CasaMOD bing-wallpaper-v2](https://github.com/Cp0204/CasaMOD/tree/main/app/mod/bing-wallpaper-v2)
- ZimaMOD adaptation: independently reimplemented for the ZimaOS dashboard,
  targeting ZimaOS's `#wallpaper` element and using a self-contained wallpaper
  information card instead of CasaOS's context menu
- MOD Store category: Compatible with ZimaMOD created for CasaMOD

## Network Access

The mod requests metadata from the public `bing.biturl.top` service because
Bing does not allow direct browser cross-origin requests. The browser then
loads the wallpaper image and information link directly from Bing. Returned
image and information URLs must be HTTPS Bing URLs.

If the metadata service or Bing is unavailable or blocked, the existing
dashboard wallpaper remains unchanged.

## Usage

Install the mod from the ZimaMOD MOD Store and reload the dashboard. Right-click
an empty area of the wallpaper to display the image description. Click the
description to open Bing's information page, click **Save** to keep the image
in Gallery, or click elsewhere to close it. Saving is an authenticated write
operation and uses the same API token prompt once per browser session as MOD
installation and removal.

For a manual update, replace the complete `bing-wallpaper-v2` directory,
confirm its manifest reports version `1.1.0` or newer, and reload the dashboard.
