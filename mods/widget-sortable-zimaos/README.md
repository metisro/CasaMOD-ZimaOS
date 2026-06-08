# Widget Sortable - ZimaOS

Reimplementation of the original `widget-sortable` mod for ZimaMOD and ZimaOS.

It discovers the ZimaOS widget column, makes its direct children draggable, and
stores their order through the ZimaMOD configuration API at:

```text
/DATA/AppData/zimamod/config/sortable-widgets.json
```

Saved widget positions are restored by absolute slot. This keeps custom widgets
in their selected position even when ZimaOS recreates native widgets with
different dynamic labels after a refresh or restart.

Native widgets use stable semantic IDs such as `clock`, `system`, `storage`,
and `network`. Older saved IDs containing live time, resource, or network
values are normalized and migrated automatically.

During dragging, widgets move only after the pointer crosses a directional
threshold and displaced widgets animate into place. Order restoration is
paused until the drag finishes to prevent flickering and unwanted swaps.

## Attribution

Original `widget-sortable` authors: **LANMIN-X** and **Cp0204**.

Original source:
[Cp0204/CasaMOD widget-sortable](https://github.com/Cp0204/CasaMOD/tree/main/app/mod/widget-sortable)

This implementation was rewritten for the ZimaMOD framework and the ZimaOS
dashboard DOM. It does not require the original CasaMOD container or mod.
