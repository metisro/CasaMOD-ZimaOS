# Resource Alerts

Resource Alerts is a built-for-ZimaMOD dashboard widget for lightweight health
monitoring inside ZimaOS.

It watches host metrics exposed by the ZimaMOD API, including CPU, RAM, disk,
network throughput, and available temperature sensors. It can also run simple
API-side service checks against URLs, TCP ports, or process names you configure.

The alert engine runs in `zimamod-api`, so Telegram and Gotify alerts continue
to work even when the ZimaOS dashboard is closed. The dashboard widget is the
viewer and settings panel for the API-side monitor.

## Features

- Dashboard widget with CPU, RAM, and storage threshold status.
- Tabbed details view with Status, Events, Notes, and Settings tabs.
- Status tab with resource cards, service check badges, temperature when
  available, and network download/upload throughput.
- Host runtime details with uptime and last reboot timestamp.
- Top memory-consuming process list from `/proc`.
- ZFS and Linux mdraid health indicators when the host exposes them.
- Events tab with configurable default event count, 40-event incremental
  expansion, and confirmed clear-all behavior.
- Notes tab with a saved text box for maintenance context.
- Settings tab with theme, threshold, event, notification, and service check
  sections.
- Configurable warning and critical thresholds for CPU, RAM, disk, and
  temperature.
- Theme selector with Sanded Glass, Liquid Glass, Aero, CasaOS, and Chaos.
- API-side HTTP, TCP, and process-name service checks.
- Browser notifications and optional sound alerts for warning and critical
  transitions.
- Optional Telegram or Gotify delivery from the API monitor.
- Event history for recent alerts.

## Data Source

Resource metrics come from `/zimamod-api/metrics`. The API reads host `/proc`
and `/sys` through read-only mounts:

```yaml
- type: bind
  source: /proc
  target: /host/proc
  read_only: true
- type: bind
  source: /sys
  target: /host/sys
  read_only: true
```

The mod does not need to parse native dashboard widgets for CPU, RAM, or disk
values. It also does not mount the Docker socket.

Top memory processes require the host `/proc` bind mount to be available at
`/host/proc` inside `zimamod-api`. If that mount is missing, Resource Alerts
does not show container-only process data as host data.

## Tab Layout

- **Status** shows live CPU, memory, disk, optional temperature, service check
  badges, network download/upload rates, uptime, last reboot, top memory
  processes, and ZFS/RAID health.
- **Events** shows recent threshold and service state changes. The default
  number shown and the maximum loaded by expansion are controlled from
  Settings.
- **Notes** stores local maintenance notes for the current ZimaMOD install.
- **Settings** contains the theme selector, thresholds, event limits,
  notification toggles, and service check editor.

## Notifications

Browser notifications require permission from the browser and only fire while
the dashboard is open. Telegram and Gotify delivery run from `zimamod-api`, so
they can notify while no browser session is active.

For Telegram, configure:

- Bot token
- Chat ID

For Gotify, configure:

- Server URL
- App token

Keep alert tokens private. They are stored in the ZimaMOD config directory for
this mod.

## Example Service Checks

Use the full URL that your browser can reach. Good first checks are:

```text
ZimaMOD API
http://YOUR-ZIMAOS-IP:8088/zimamod-api/health
```

```text
ZimaOS dashboard
http://YOUR-ZIMAOS-IP/
```

```text
Gotify
http://YOUR-GOTIFY-IP:8080/health
```

For your bare-metal test machine, if ZimaMOD is available at
`http://192.168.0.96:8088`, add:

```text
Name: ZimaMOD API
URL:  http://192.168.0.96:8088/zimamod-api/health
```

HTTP, TCP, and process-name checks run in `zimamod-api`, so they verify what the
ZimaMOD host can reach.

## Limitations

- Docker container/service-down detection is not included yet unless exposed as
  an HTTP, TCP, or process-name check.
- Disk usage is measured from the filesystem that backs the ZimaMOD data mount.
- Temperature sensors depend on what the host exposes under `/sys`.
- ZFS health requires `zpool` to be available inside the API container. Linux
  mdraid health depends on `/proc/mdstat`.
- Telegram/Gotify delivery requires outbound network access from the
  `zimamod-api` container.
