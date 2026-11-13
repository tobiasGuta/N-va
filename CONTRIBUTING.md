# Contributing to Nova

Thanks for improving Nova. It runs inside GNOME Shell, so contributors should
prioritize responsiveness, reliable cleanup, user consent, and compatibility.

**License status:** The repository owner has not selected an open-source
license yet. Public GitHub access alone does not grant permission to
redistribute or relicense the project. Please discuss any code contributions
with the maintainer until [licensing is settled](https://github.com/tobiasGuta/N-va/issues/1).

## Development workflow

1. Open a focused issue or PR with a clear motivation. Look at
   [the roadmap](docs/ROADMAP.md) before proposing major additions.
2. Branch from the latest `main`, or from `feat/nova-next-foundations` for
   changes to the unreleased v0.6 work.
3. Run `npm run check` with Node.js 20+, and
   `glib-compile-schemas --strict --dry-run schemas`.
4. Build a preview ZIP with `bash scripts/package.sh`. The CI validates the
   package, but only live GNOME testing can confirm behavior.
5. For UI changes attach a compact and expanded screenshot. Test both
   light/dark backgrounds, reduced motion, and hover/pin behavior.
6. Confirm disabling Nova disconnects signals and timers, cancels asynchronous
   work, removes its optional shortcuts and D-Bus name, and restores GNOME's
   native clock, panel styling, and OSD handling.
7. Avoid modifying private GNOME Shell methods unless unavoidable, guarded,
   reversible, and covered by runtime tests.

## Testing on Fedora

GNOME 49 and later can use a nested development session when the
`mutter-devkit` package is installed:

```bash
sudo dnf install mutter-devkit
dbus-run-session gnome-shell --devkit --wayland
```

For ordinary Wayland sessions, log out and back in after modifying an
extension, then enable:

```bash
gnome-extensions enable nova@tobiasguta.github.io
```

Diagnostics:

```bash
gnome-shell --version
gnome-extensions info nova@tobiasguta.github.io
journalctl --user -b /usr/bin/gnome-shell --no-pager | grep -i nova
```

See [manual test scenarios](docs/TESTING.md) and
[architecture/resource lifecycle](docs/ARCHITECTURE.md).

## Compatibility and scope

GNOME 49–51 are declared targets, but private APIs and extensions such as
Blur my Shell can alter panel behavior. Please don't make untested compatibility
claims or introduce blocking file/network I/O inside Shell. The local activity
API is opt-in and must never expose arbitrary file access or privileged actions.
