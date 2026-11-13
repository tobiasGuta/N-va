# Nova local live activities (experimental)

Nova's **developer activity API** lets Linux terminal commands, build tools and
other apps briefly show progress in the island using the **session D-Bus**.
It is optional, disabled by default, and requires no Python package, Electron,
network service or background daemon.

## Enable

Open **Extensions → Nova → Preferences → Live activities** and turn on
**Developer activity API**. Other applications running under your **same Linux
user account** can then submit small, temporary status cards.

The API is not an authentication mechanism: any process with access to your
session bus can send a preview while this feature is enabled.

## Try it

On the same Fedora login session:

```bash
gdbus call --session \
  --dest org.gnome.Shell.Extensions.Nova \
  --object-path /org/gnome/Shell/Extensions/Nova \
  --method org.gnome.Shell.Extensions.Nova1.Show \
  "Build finished" "42 tests passed" 100 3500
```

For unknown progress, pass `-1` instead of a percent. A simple developer
workflow can call the method when a build finishes; Nova doesn't run the
build or inspect your terminal.

## Interface contract

| Field | Type | Rules |
|---|---|---|
| `title` | string | 1–54 visible characters after cleaning |
| `detail` | string | Up to 78 characters; optional |
| `percent` | int32 | 0–100 or -1 for unknown progress |
| `durationMs` | uint32 | Clamped to 1.2–8 seconds |

- Only fixed, built-in symbolic icons are accepted.
- Arguments are plain display text and a number; Nova does not interpret
  input as markup, file paths, URLs, shell commands or icon identifiers.
- Calls are rate-limited to approximately one preview every 350 ms.
- Closing/disabling Nova unexports its D-Bus object and releases the name.
- The session API is not intended to be a privileged system-monitor service.

This is a **developer preview** that should be tested on Fedora before
becoming part of a stable Nova release.
