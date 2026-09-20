# PaNasMs Terminal module

Installable interactive terminal for PaNasMs. Current manifest version: **0.2.3**.
Requires core `>=0.2.0,<0.3.0`, module API 1 and ARM64 Linux.

## Behavior

The React/xterm interface connects to a dedicated authenticated WebSocket. The Go
module server opens a PTY under the authorized system user's identity, subject to
administrator access checks. Terminal I/O is separate from the core event stream
and is not stored as notification/job history. This module provides a shell;
other system adapters do not use it as a generic command-execution service.

## Development

The frontend uses React/TypeScript and host-provided UI contracts. The server uses
Go and the pinned [module SDK](https://github.com/PaNasMs/module-sdk). Python helpers
are included where the module requires them. Do not bundle another copy of the
host React/router/query runtime.

Use ARM64 Linux, Node.js 24, Go 1.26 or newer, Python 3, a C compiler and
`libpam0g-dev`. The release workflow pins Go 1.27.1. From this repository:

```sh
sh scripts/build.sh
```

This installs locked npm dependencies, builds the UI, runs PAM-enabled Go tests,
builds the server, checks Python syntax/translation keys and available Python
tests, then writes `dist/<id>-<version>-arm64.unsigned.zip`. This is an unsigned
build payload and cannot be installed directly. The script labels output ARM64;
build on ARM64 rather than treating it as a cross-compilation command.

## Install and release

Install the signed version from the PaNasMs **Modules** catalog, or upload a signed
`.panasms` archive from the [registry](https://github.com/PaNasMs/module-registry).

For a new release, update `manifest.json`, `package.json` and the npm lockfile
consistently, commit, then push the matching `vX.Y.Z` tag. The workflow also builds
branches/PRs, but only a version tag publishes a source release. Its unsigned
payload is imported and signed by the registry, which publishes the installable
archive and updates the catalog. Signing keys are not stored in this repository.
Publish a new version instead of replacing an existing release.

## Documentation and license

Public documentation is maintained in English. Original code uses
[PolyForm Noncommercial 1.0.0](LICENSE); see [NOTICE](NOTICE) for third-party scope.
