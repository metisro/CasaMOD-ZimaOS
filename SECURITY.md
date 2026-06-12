# Security Policy

## Supported Versions

Security fixes are applied to the latest published ZimaMOD release. Older
releases may be useful for rollback and compatibility testing, but they do not
receive guaranteed security updates.

## Reporting A Vulnerability

Do not open a public issue for an undisclosed vulnerability.

Report it privately through
[GitHub Security Advisories](https://github.com/metisro/ZimaMOD/security/advisories/new).
Include:

- A clear description of the vulnerability and its impact.
- The affected ZimaMOD and ZimaOS versions.
- Reproduction steps or a proof of concept.
- Relevant logs with tokens, credentials, private addresses, and personal data
  removed.
- Any suggested mitigation or fix.

The maintainer will review the report, confirm whether it affects ZimaMOD, and
coordinate disclosure and remediation when practical. Please allow reasonable
time for investigation before public disclosure.

## Security Boundaries

ZimaMOD is a modding framework, not a sandbox or operating-system security
boundary.

- Installed mods execute inside the authenticated ZimaOS dashboard origin.
- Mods may intentionally use dashboard APIs, internal APIs, DOM structures, and
  other unstable ZimaOS behavior.
- Users must review and trust a mod before installing it.
- The ZimaMOD API token protects mutating ZimaMOD API routes from requests that
  do not possess the current token.
- Configuration reads and mod assets are intentionally available to the
  dashboard runtime.
- The default HTTP connection does not protect traffic from an attacker capable
  of intercepting the local network.

Reports about intentionally installed mod behavior, expected compatibility
breakage, unsupported ZimaOS internals, or general hardening suggestions may be
handled as normal issues rather than vulnerabilities.

## Operational Response

If a mod or deployment is causing immediate problems:

1. Disconnect untrusted network access when relevant.
2. Disable the suspected mod or stop ZimaMOD.
3. Preserve logs and a backup before making destructive changes.
4. Follow the [operations guide](docs/OPERATIONS.md) for uninstall, rollback,
   backup, and recovery procedures.
