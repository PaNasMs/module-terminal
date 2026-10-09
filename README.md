# PaNasMs Terminal module

Terminal is the browser shell module for [PaNasMs](https://github.com/PaNasMs/panasms),
a browser panel for managing a NAS on Debian-based Linux. It opens `bash` sessions
on the NAS as the signed-in administrator's Linux user, in several tabs that stay
alive while you use other parts of the panel. Project website:
<https://panasms.github.io/>.

The current version is 0.2.11. It requires PaNasMs core `>=0.2.15,<0.3.0` and
module API 1, and is published for ARM64 and AMD64.

## Install

Open **Modules** in the PaNasMs panel and install Terminal from the catalog. The
module manager picks the package for your architecture. Signed packages and the
catalog are in the [module registry](https://panasms.github.io/module-registry/);
an administrator can also upload a signed `.panasms` archive from there.

Terminal is available to panel administrators only.

## Using terminal tabs

Opening Terminal starts a shell. The plus button opens another independent
session. Switching tabs, or moving to another panel section, keeps every shell
and its output. Closing a tab ends that session. Reloading or closing the browser
tab, or signing out, ends all of them. After a connection ends, use the reconnect
action to start a new shell. Arrow keys, Home and End move between tabs.

While sessions are open, the application bar shows a terminal icon with the
session count in every section. Its menu returns to Terminal or, after
confirmation, closes every session in the current browser tab. Sessions in other
browser tabs are not affected.

The UI is available in English, Russian and Ukrainian.

## How sessions run

The React and xterm.js UI connects to a dedicated authenticated WebSocket. For
each session, the Go server checks that the panel user is an allowed
administrator, allocates a PTY owned by that user and starts `bash --login` in
the user's home directory. The shell runs in the host mount namespace with the
user's UID, primary group and supplementary groups, so `sudo` and other privileged
commands still need the user's own system authorization. One module server runs
at most 8 sessions at a time.

Terminal input and output do not go through the core event stream and are not
stored in notification or job history. Other modules do not use Terminal to run
commands.

New files and directories created in a session use the system `UMASK` from
`/etc/login.defs` (`022` if unset) instead of the service's private mask.
Ownership stays with the Linux user, and parent setgid bits and default ACLs still
apply. The user's shell startup scripts can set a different mask.

## Development

The UI is React and TypeScript built with Vite against the host-provided UI
contracts. Do not bundle a second copy of the host React, router or query
runtime. The server is Go, built on the pinned
[module SDK](https://github.com/PaNasMs/module-sdk).

| Path | Contents |
| --- | --- |
| `frontend/` | Terminal UI and `locales/` (`en`, `ru`, `uk`) |
| `cmd/server/` | Module service, WebSocket and PTY handling |
| `scripts/` | `build.sh`, translation check and payload packaging |

You need Linux on the target architecture (ARM64 or AMD64), Node.js 24, Go 1.26
or newer, Python 3, a C compiler and `libpam0g-dev`. CI uses Go 1.27.1. To build:

```sh
sh scripts/build.sh
```

The script runs `npm ci`, builds the UI, runs `go test -tags pam ./...`, builds
`dist/bin/server`, checks that `ru` and `uk` have the same translation keys as
`en` (also available as `npm test`) and writes
`dist/terminal-<version>-<arch>.unsigned.zip`. The architecture comes from
`go env GOARCH`, and packaging fails if the server binary does not match it, so
build on the architecture you are packaging for. The unsigned payload cannot be
installed directly. The repository has no Go unit tests yet.

## Release

Update the version in `manifest.json`, `package.json` and `package-lock.json`
together, commit, then push a matching `vX.Y.Z` tag. The
[build workflow](.github/workflows/build.yml) builds both architectures on every
push to `main` and on pull requests. Only a version tag publishes a GitHub release
with the two unsigned payloads, and packaging fails if the tag does not match the
manifest version. The module registry imports and signs the payloads, publishes
the installable archives and updates the catalog. Signing keys are not stored in
this repository. Publish a new version instead of replacing an existing release.

## License

Original code is licensed under
[PolyForm Noncommercial 1.0.0](LICENSE). See [NOTICE](NOTICE) for the scope of
the license and for third-party components.
