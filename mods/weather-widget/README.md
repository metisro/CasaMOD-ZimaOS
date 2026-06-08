# ZimaMOD - Weather Widget v1.1.0

ZimaMOD Weather Widget adds a weather card to the CasaOS dashboard.

It is based on the Weather widget idea from
[IceWhaleTech/CasaOS-UI pull request #257](https://github.com/IceWhaleTech/CasaOS-UI/pull/257/commits),
but adapted as a standalone ZimaMOD extension instead of a compiled Vue
component.

## Features

- Injects a Weather widget into the CasaOS dashboard.
- Shows current temperature, apparent temperature, humidity, wind speed, and
  weather description.
- Includes a compact hourly temperature chart for the next 8 hours.
- Shows temperature-only tooltips when hovering over chart dots or nearby graph
  points.
- Includes a stats-style **10 days** button that switches the widget content to
  a compact 10-day forecast while keeping the header visible.
- Shows a clickable clock that toggles between 12-hour and 24-hour time.
- Allows custom city, latitude, longitude, refresh interval, and Celsius or
  Fahrenheit settings.
- Includes CasaOS, Aero, and macOS-inspired Liquid Glass themes.
- Uses Open-Meteo, so no bundled OpenWeatherMap API key is required.
- Persists settings through CasaOS' file API at:

```text
/var/lib/casaos/1/weather-widget.json
```

## Installation

1. Copy `mod.js`, `themes/`, and `icons/` into your ZimaMOD extension/mod
   location.
2. Enable or load the mod in CasaOS.
3. Open the CasaOS dashboard.

## Usage

- Click the clock in the widget header to switch between 12-hour and 24-hour time.
- Click the refresh icon to update weather immediately.
- Click the settings icon to configure a custom city or coordinates.
- In settings, click **Look Up City** to resolve coordinates using Open-Meteo
  geocoding.
- In settings, use the temperature unit switch to choose Celsius or Fahrenheit.
- In settings, use the theme switch to choose CasaOS, Aero, or Liquid Glass.

## Themes

Theme CSS is split into separate files:

```text
themes/base.css
themes/casa.css
themes/aero.css
themes/liquid-glass.css
```

The Aero theme does not use the original Windows gadget images. It uses selected
Meteocons Fill SVG icons from `@meteocons/svg`, which is MIT licensed. The
selected icons and attribution are stored in:

```text
icons/meteocons-fill/
```

The selected theme is stored in the CasaOS weather config and loaded by the mod
at runtime.

### Creating A Custom Theme

Keep shared sizing and layout rules in `themes/base.css`. A custom theme should
only override colors, materials, borders, shadows, artwork placement, and other
visual details.

1. Create a new CSS file, for example:

   ```text
   themes/my-theme.css
   ```

2. Add the theme to the `THEMES` registry near the top of `mod.js`:

   ```js
   myTheme: {
     label: "My Theme",
     file: "themes/my-theme.css",
     className: MOD_ID + "-theme-my-theme"
   }
   ```

3. Scope every CSS selector to the theme root class:

   ```css
   .zimamod-weather.zimamod-weather-theme-my-theme {
     --zimamod-weather-chart-line: rgb(120, 220, 255);
     --zimamod-weather-chart-fill: rgba(120, 220, 255, .25);
     --zimamod-weather-chart-grid: rgba(255, 255, 255, .12);
     --zimamod-weather-chart-text: rgba(255, 255, 255, .75);
   }

   .zimamod-weather.zimamod-weather-theme-my-theme .zimamod-weather-card {
     background: rgba(20, 30, 45, .8);
     border: 1px solid rgba(255, 255, 255, .2);
   }
   ```

The same theme root class is applied to the settings overlay, so modal styles
can use selectors such as:

```css
.zimamod-weather.zimamod-weather-theme-my-theme .zimamod-weather-modal {
  /* Custom modal appearance */
}
```

Useful scene classes are applied automatically:

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

Use these classes to change colors or artwork positioning for particular
weather conditions. Avoid unscoped selectors such as `#zimamod-weather-icon`,
because they affect every theme.

## How It Differs From CasaOS-UI PR #257

The original PR added a `src/widgets/Weather.vue` component and a `chart.js`
dependency to CasaOS-UI.

This ZimaMOD version does not require rebuilding CasaOS-UI. It injects a widget
at runtime and draws the forecast chart with the browser canvas API. It also
uses Open-Meteo instead of the demo OpenWeatherMap API key from the PR.

The PR also contains a separate Cloudflared/Syncthing block refactor. That is
not included in this weather extension because it targets a different dashboard
component and should be packaged as a separate ZimaMOD if needed.

## Development

Before publishing a change, run:

```powershell
node --check mod.js
```

## Author

Created by **metisro**.
Part of ZimaMOD - [https://github.com/metisro/ZimaMOD](https://github.com/metisro/ZimaMOD)
