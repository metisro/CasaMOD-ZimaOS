# Contributing To ZimaMOD

Contributions are welcome through issues and pull requests.

## Contribution License

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in ZimaMOD is provided under the Apache License 2.0, in accordance
with section 5 of that license. By submitting a contribution, you represent
that you have the right to provide it under those terms.

Do not submit copied or adapted code, assets, or other material unless its
license permits inclusion and redistribution. Preserve all required copyright,
license, and attribution notices, and identify third-party material clearly in
the pull request.

## Bundled Mods

New or adapted mods must identify their authors and origin in `zimamod.json`.
Adapted mods must link to their original source and comply with the original
license. Include any required third-party license text and attribution inside
the mod directory.

## Validation

Before submitting a change, run the relevant checks:

```sh
node --test api/server.test.js
node --check runtime/loader.js
node --check runtime/store.js
node --check mods/weather-widget/mod.js
node --check mods/widget-sortable-zimaos/mod.js
```
