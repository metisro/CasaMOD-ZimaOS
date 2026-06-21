# ZimaMOD Weather Widget v1.3.9

Weather Widget adds a configurable weather card to the ZimaOS dashboard through
ZimaMOD.

It was inspired by the Weather widget idea from
[IceWhaleTech/CasaOS-UI pull request #257](https://github.com/IceWhaleTech/CasaOS-UI/pull/257/commits),
but is implemented as an independent runtime-loaded ZimaMOD extension instead
of a compiled dashboard component.

## Features

- Shows current temperature, apparent temperature, humidity, wind speed, and
  weather description.
- Includes an hourly temperature chart and compact 10-day forecast.
- Provides temperature tooltips for chart points.
- Includes a clickable clock that toggles between 12-hour and 24-hour time.
- Supports custom city, coordinates, refresh interval, Celsius or Fahrenheit,
  and theme selection.
- Resolves city coordinates through Open-Meteo geocoding.
- Includes Casa, Aero, Liquid Glass, and Sanded Glass themes.
- Uses Open-Meteo without requiring an API key.

## Install And Uninstall

Open the ZimaMOD **MOD Store**, find **Weather Widget**, and select
**Install**. Reload the proxied ZimaMOD dashboard after installation.

To uninstall it, select **Uninstall** in the MOD Store and reload the dashboard.
Uninstalling removes the installed mod files but preserves the configuration so
the same settings are available if the widget is installed again.

For backup, rollback, and recovery procedures, see the repository
[operations guide](../../docs/OPERATIONS.md).

Manual installations use:

```text
/DATA/AppData/zimamod/mod/weather-widget
```

## Configuration

Weather Widget uses the ZimaMOD browser configuration API:

```js
await window.ZimaMOD.getConfig("weather-widget", defaults);
await window.ZimaMOD.setConfig("weather-widget", config);
```

ZimaMOD stores the resulting JSON file at:

```text
/DATA/AppData/zimamod/config/weather-widget.json
```

The widget contains legacy local-storage and CasaOS file-API fallbacks for use
outside the normal ZimaMOD runtime. On ZimaMOD, the framework configuration API
is the primary and expected storage mechanism.

To reset only Weather Widget settings, back up and then remove
`weather-widget.json`. The widget recreates its defaults when it next saves
configuration.

## Usage

- Click the clock to switch between 12-hour and 24-hour time.
- Click refresh to update weather immediately.
- Click settings to configure a city or coordinates.
- Select **Look Up City** to resolve coordinates with Open-Meteo.
- Select Celsius or Fahrenheit and choose a theme in settings.

## Themes

Theme CSS is split into separate files:

```text
themes/base.css
themes/casa.css
themes/aero.css
themes/liquid-glass.css
themes/sanded-glass.css
```

The Aero theme uses selected Meteocons Fill SVG icons from `@meteocons/svg`,
which is MIT licensed. The selected icons, license, and attribution are under:

```text
icons/meteocons-fill/
```

The selected theme is saved in the ZimaMOD Weather Widget configuration.

### Creating A Custom Theme

Keep shared sizing and layout rules in `themes/base.css`. A custom theme should
override only theme-specific colors, materials, borders, shadows, and artwork.

Avoid `backdrop-filter` on the widget or its controls. On ZimaOS, an additional
live backdrop blur causes Chromium compositor flickering across native app
tiles while recommendation cards are visible. Use transparent gradients,
highlights, borders, and inset shadows for glass effects instead.

Liquid Glass uses a static SVG displacement filter on an internal decorative
layer to provide subtle refraction without sampling or blurring the dashboard.
Sanded Glass is the renamed brushed-glass style and keeps the stronger frosted
surface from the pasted theme.

The widget observes only dashboard mutations that add or remove its own mount.
Unrelated native overlays, recommendation cards, and app animations do not
trigger full-page widget reconciliation or geometry reads.

During initial dashboard construction, a temporary observer retries mounting
for up to 15 seconds. It disconnects immediately after the widget appears.

1. Create a theme file such as `themes/my-theme.css`.
2. Add it to the `THEMES` registry near the top of `mod.js`.
3. Scope every selector to its theme root class.

Example registry entry:

```js
myTheme: {
  label: "My Theme",
  file: "themes/my-theme.css",
  className: MOD_ID + "-theme-my-theme"
}
```

Example CSS:

```css
.zimamod-weather.zimamod-weather-theme-my-theme {
  --zimamod-weather-chart-line: rgb(120, 220, 255);
  --zimamod-weather-chart-fill: rgba(120, 220, 255, .25);
}

.zimamod-weather.zimamod-weather-theme-my-theme .zimamod-weather-card {
  background: rgba(20, 30, 45, .8);
  border: 1px solid rgba(255, 255, 255, .2);
}
```

The same theme root class is applied to the settings overlay. Weather scene
classes are also applied automatically:

```text
zimamod-weather-scene-sun
zimamod-weather-scene-moon
zimamod-weather-scene-partly-cloudy
zimamod-weather-scene-moon-cloudy
zimamod-weather-scene-cloudy
zimamod-weather-scene-fog
zimamod-weather-scene-showers
zimamod-weather-scene-rain
zimamod-weather-scene-snow
zimamod-weather-scene-hail
zimamod-weather-scene-thunderstorm
zimamod-weather-scene-wind
```

## Development

Before publishing a change, run:

```sh
node --check mods/weather-widget/mod.js
```

## Author And Attribution

Created by **metisro** as part of
[ZimaMOD](https://github.com/metisro/ZimaMOD).
