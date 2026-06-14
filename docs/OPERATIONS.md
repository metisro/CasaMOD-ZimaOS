# Uninstall, Rollback, Backup, And Recovery

This guide covers ZimaMOD framework and mod operations on ZimaOS. Commands
assume the persistent data directory is:

```text
/DATA/AppData/zimamod
```

Use the actual dashboard and API ports configured for your installation.
Examples use the defaults `8088` and `8090`.

## Understand Persistent State

ZimaMOD containers are replaceable. User state is stored under:

```text
/DATA/AppData/zimamod/
  mod/       installed mods loaded by the dashboard
  config/    persistent per-mod settings and the current API token
  store/     MOD Store catalog copied from the API image
```

Older releases may have created a hidden `.bundled-mods-seeded` marker after
installing bundled mods during the first deployment. Current releases ignore
this legacy marker; it can remain in place or be removed.

Starting a newer or older API image refreshes bundled entries in `store/`, but
does not replace already-installed copies under `mod/`. This protects local
changes, but it also means a framework rollback does not automatically roll
back installed mod files.

The API token is regenerated whenever `zimamod-api` starts. A restored token
file is therefore replaced on the next API startup.

## Back Up ZimaMOD

Create a backup before changing image versions, manually editing mods, or
performing recovery.

### Consistent Full Backup

Stop both containers so no configuration or mod installation changes occur
during the archive:

```sh
docker stop zimamod-proxy zimamod-api
mkdir -p /DATA/Backup
tar -C /DATA/AppData -czf "/DATA/Backup/zimamod-$(date +%Y%m%d-%H%M%S).tar.gz" zimamod
docker start zimamod-api zimamod-proxy
```

Verify the archive contains the expected directories:

```sh
tar -tzf /DATA/Backup/zimamod-YYYYMMDD-HHMMSS.tar.gz | head
```

Store an additional copy outside the ZimaOS device when the backup is
important.

### Back Up One Mod And Its Configuration

```sh
mkdir -p /DATA/Backup/weather-widget
cp -a /DATA/AppData/zimamod/mod/weather-widget /DATA/Backup/weather-widget/
cp -a /DATA/AppData/zimamod/config/weather-widget.json /DATA/Backup/weather-widget/
```

If a configuration file does not exist, the mod is using defaults or has not
saved settings yet.

## Uninstall A Mod

Use **Uninstall** in the MOD Store, then reload the proxied dashboard with cache
disabled.

Uninstalling through the Store removes:

```text
/DATA/AppData/zimamod/mod/<mod-id>
```

It preserves the Store entry and configuration:

```text
/DATA/AppData/zimamod/store/<mod-id>
/DATA/AppData/zimamod/config/<mod-id>.json
```

To remove a manually installed mod, first move it aside so it can be recovered:

```sh
mkdir -p /DATA/AppData/zimamod/disabled
mv /DATA/AppData/zimamod/mod/<mod-id> /DATA/AppData/zimamod/disabled/
```

To reset its settings separately, back up and move its configuration:

```sh
mkdir -p /DATA/AppData/zimamod/disabled-config
mv /DATA/AppData/zimamod/config/<mod-id>.json /DATA/AppData/zimamod/disabled-config/
```

## Uninstall ZimaMOD

Before uninstalling the framework, create a full backup if any mods or settings
may be needed later.

From a Compose installation directory:

```sh
docker compose down
```

When removing ZimaMOD through ZimaOS Settings, confirm whether the interface
offers to remove application data. Preserve `/DATA/AppData/zimamod` if a future
reinstall should retain mods and settings.

For a complete removal, only after confirming a valid backup exists, remove:

```sh
rm -rf /DATA/AppData/zimamod
```

Removing this directory permanently deletes installed mods, settings, Store
state, and any legacy marker. Optionally remove downloaded images after
confirming that no remaining installation uses them:

```sh
docker image rm ghcr.io/metisro/zimamod-api:<version>
docker image rm ghcr.io/metisro/zimamod-proxy:<version>
```

## Roll Back The ZimaMOD Framework

Use immutable matching API and proxy tags. Never run the API and proxy from
different releases.

1. Create a full backup.
2. Use the target release's complete Compose manifest so its image tags,
   volumes, and environment entries remain compatible. For example:

   ```yaml
   image: ghcr.io/metisro/zimamod-api:1.1.22
   image: ghcr.io/metisro/zimamod-proxy:1.1.22
   ```

   In ZimaOS Settings, keep both image versions identical and apply any volume
   or environment differences from that release before selecting **Install**
   or **Save**.

3. For a Compose installation, recreate both containers:

   ```sh
   docker compose pull
   docker compose up -d --force-recreate
   ```

4. Verify the deployment:

   ```sh
   docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
   curl -fsS http://127.0.0.1:8088/zimamod-api/health
   ```

5. Reload the proxied dashboard with cache disabled.

The rollback refreshes bundled Store entries from the older API image but
leaves installed mods and configurations unchanged. Restore a full backup when
the previous installed mod files or settings are also required.

## Recover Bing Wallpapers From An Unmounted Container

ZimaMOD `1.1.27` introduced `/DATA/Gallery/Bing Wallpapers:/gallery`. An
installation upgraded by changing only image tags may have written wallpapers
into the API container's private `/gallery` directory instead of the host
Gallery.

Recover those files before recreating the container:

```sh
mkdir -p "/DATA/Gallery/Bing Wallpapers"
docker cp "zimamod-api:/gallery/." "/DATA/Gallery/Bing Wallpapers/"
```

Add `/DATA/Gallery/Bing Wallpapers:/gallery` to the `zimamod-api` volumes,
recreate the container, and confirm `/zimamod-api/health` reports
`"galleryMounted":true`.

## Roll Back One Mod

For a Store mod, replace its installed copy with the current Store copy:

1. Back up its installed directory and configuration.
2. Uninstall it through the MOD Store.
3. Install it again through the MOD Store.
4. Reload the dashboard with cache disabled.

This copies:

```text
/DATA/AppData/zimamod/store/<mod-id>
```

to:

```text
/DATA/AppData/zimamod/mod/<mod-id>
```

To restore a specifically backed-up mod version, move the current installed
copy aside and copy the backup into `mod/<mod-id>`.

## Recover From A Broken Mod

If the dashboard becomes unusable after installing or editing a mod, disable
the suspected mod from the ZimaOS terminal:

```sh
mkdir -p /DATA/AppData/zimamod/disabled
mv /DATA/AppData/zimamod/mod/<mod-id> /DATA/AppData/zimamod/disabled/
```

Then reload:

```text
http://ZIMAOS-IP:8088
```

with browser cache disabled. ZimaMOD discovers installed mods dynamically, so a
container restart is normally unnecessary.

If the failing mod is unknown, move all installed mods aside, confirm the
dashboard works, then restore them one at a time:

```sh
mv /DATA/AppData/zimamod/mod /DATA/AppData/zimamod/mod.disabled
mkdir -p /DATA/AppData/zimamod/mod
```

Do not remove `store/`; it is the source used by the MOD Store for
reinstallation.

## Restore A Full Backup

Stop ZimaMOD before replacing persistent state:

```sh
docker stop zimamod-proxy zimamod-api
mv /DATA/AppData/zimamod /DATA/AppData/zimamod.before-restore
tar -C /DATA/AppData -xzf /DATA/Backup/zimamod-YYYYMMDD-HHMMSS.tar.gz
docker start zimamod-api zimamod-proxy
```

After startup:

1. Confirm both containers are running.
2. Confirm `/zimamod-api/health` returns success.
3. Reload the dashboard with cache disabled.
4. Use **Copy key** again because API startup generated a new token.
5. Keep `zimamod.before-restore` until the restored system is verified.

## Recover Missing Or Corrupt Store Entries

Restarting `zimamod-api` copies the bundled catalog from the image into
`store/`:

```sh
docker restart zimamod-api
```

This refreshes bundled Store entries. It does not overwrite installed copies
under `mod/`. Uninstall and reinstall an affected mod to replace its installed
copy with the refreshed Store version.

## Recover Containers Without Replacing Data

If the containers fail but persistent data is intact:

```sh
docker compose pull
docker compose up -d --force-recreate
```

Then inspect:

```sh
docker logs --tail 200 zimamod-api
docker logs --tail 200 zimamod-proxy
curl -i http://127.0.0.1:8090/health
curl -i http://127.0.0.1:8088/zimamod-api/health
```

Confirm custom dashboard and API ports match across both services.

## Recovery Checklist

1. Preserve `/DATA/AppData/zimamod` before destructive changes.
2. Disable recently changed mods first.
3. Keep API and proxy image versions identical.
4. Recreate containers without deleting persistent data.
5. Restore a full backup only when narrower recovery fails.
6. Reload the dashboard with cache disabled.
7. Copy the regenerated API key after every API restart.
