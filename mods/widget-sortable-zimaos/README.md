# Widget Sortable - ZimaOS

Reimplementation of the original `widget-sortable` mod for ZimaMOD and ZimaOS.

It discovers the ZimaOS widget column, makes its direct children draggable, and
stores their order through the ZimaMOD configuration API at:

```text
/DATA/AppData/zimamod/config/sortable-widgets.json
```

## Attribution

Original `widget-sortable` authors: **LANMIN-X** and **Cp0204**.

Original source:
[Cp0204/CasaMOD widget-sortable](https://github.com/Cp0204/CasaMOD/tree/main/app/mod/widget-sortable)

This implementation was rewritten for the ZimaMOD framework and the ZimaOS
dashboard DOM. It does not require the original CasaMOD container or mod.
