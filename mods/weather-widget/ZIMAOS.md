# ZimaOS Compatibility

This build supports loading through the CasaMOD-ZimaOS compatibility framework.

When the CasaOS `.ps-container` dashboard anchor is unavailable, the widget is
shown as a fixed overlay in the upper-right corner of the ZimaOS dashboard.

Widget settings are stored through the framework API at:

```text
/DATA/AppData/casamod/config/weather-widget.json
```

## Install

Replace the weather widget directory under:

```text
/DATA/AppData/casamod/mod/weather-widget
```

Then reload the proxied dashboard with cache disabled.
