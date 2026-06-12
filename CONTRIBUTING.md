# Contributing To ZimaMOD

Contributions are welcome through issues and pull requests. All pull requests
are reviewed by the ZimaMOD maintainer before merge. Submission does not
guarantee inclusion, and the maintainer makes the final merge and release
decision.

## Pull Request Workflow

1. Fork [metisro/ZimaMOD](https://github.com/metisro/ZimaMOD).
2. Create a focused branch from the latest `main`.
3. Make and test one cohesive change.
4. Open a pull request against `metisro/ZimaMOD:main`.
5. Address maintainer review feedback on the same pull-request branch.

Explain the problem, the proposed behavior, the implementation, and the checks
you ran. Include screenshots for visible changes and identify anything you
could not test. Open a GitHub issue first for substantial changes so their
scope and fit can be discussed before implementation.

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

See the [mod development and contribution guide](mods/README.md) for the
manifest format, runtime requirements, testing workflow, and mod review
expectations.

## Validation

Before submitting a change, run the relevant checks:

```sh
node --test api/server.test.js
node --test runtime/loader.test.js
node --check runtime/loader.js
node --check runtime/store.js
node --check mods/weather-widget/mod.js
node --check mods/widget-sortable-zimaos/mod.js
```

Pull requests run these tests and syntax checks automatically. Publishing is
also blocked unless the same validation job succeeds.
