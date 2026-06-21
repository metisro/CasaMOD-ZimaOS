# Dashboard Themes

Dashboard Themes is a standalone ZimaMOD visual manager for ZimaOS dashboard
surfaces. It replaces native app, widget, search, and header glass styles and
lets the user choose a dashboard-wide theme from **DTM Settings**.

It works independently from Weather Widget and independently from the MOD Store.
The MOD Store only exposes a launcher button for convenience.

## Included Themes

- **Sanded Glass** - the current flicker-fixed glass style for ZimaOS dashboard
  cards and widgets.
- **Liquid Glass** - a macOS-inspired refractive glass theme adapted from the
  Weather Widget Liquid Glass theme.
- **Aero** - a Windows 7 inspired blue glass style adapted from the Weather
  Widget Aero theme.
- **CasaOS** - a dark CasaOS-style dashboard material adapted from the Weather
  Widget CasaOS theme.
- **Chaos** - a high-energy neon glass style created for the dashboard theme
  manager.

## Theme Files

Shared manager and surface rules live in `mod.css`. Each theme has its own CSS
file in `themes/`:

```text
themes/sanded-glass.css
themes/liquid-glass.css
themes/aero.css
themes/casaos.css
themes/chaos.css
```

## What It Changes

- App tiles that use ZimaOS `.blur-background` surfaces inside the `wujie-app`
  shadow root.
- Search bars that use ZimaOS `.bg-blur` surfaces.
- Dashboard widgets that use the native ZimaOS blur utility combination:
  `rounded-lg bg-[#35363a66] shadow-pale-blur backdrop-blur-sm backdrop-saturate-180`.
- The native page header `#page-header`.

## Settings

Open the ZimaMOD **MOD Store** and select **DTM Settings** in the sidebar.
Theme changes are previewed immediately. Select **Save theme** to persist the
theme through the ZimaMOD configuration API.

## Install

Open the ZimaMOD **MOD Store**, find **Dashboard Themes**, and select
**Install**. Reload the ZimaOS dashboard after installation.

## Uninstall

Open the ZimaMOD **MOD Store**, find **Dashboard Themes**, and select
**Uninstall**. Reload the dashboard to remove the injected stylesheet, shadow
styles, and SVG filter from the current page.
