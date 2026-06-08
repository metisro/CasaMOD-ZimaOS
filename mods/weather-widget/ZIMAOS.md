# ZimaOS Compatibility

This build supports loading through the ZimaMOD compatibility framework.

When the CasaOS `.ps-container` dashboard anchor is unavailable, the widget is
shown as a fixed overlay in the upper-right corner of the ZimaOS dashboard.

Widget settings are stored through the framework API at:

```text
/DATA/AppData/zimamod/config/weather-widget.json
```

## Install

Replace the weather widget directory under:

```text
/DATA/AppData/zimamod/mod/weather-widget
```

Then reload the proxied dashboard with cache disabled.
