# Nova architecture

Nova is a GNOME Shell **GJS extension**, not a separate GTK/Electron window.
A single top-centered `St.Widget` displays one of three view families:
clock/calendar, MPRIS media, or a temporary activity card. Pure JavaScript
modules implement time, geometry, artwork URL policy, activity payloads and
theme resolution; these are covered by Node.js tests.

## Main services

- `extension.js`: extension lifecycle, UI composition, transitions, settings,
  popup priority and cleanup.
- `lib/mpris.js`, `lib/player.js`: MPRIS discovery and media actions.
- `lib/artwork.js`: bounded asynchronous local/HTTPS cover loading; cache in
  memory and cancel on disable.
- `lib/activity-monitor.js`, `lib/downloads.js`: optional GNOME status
  sources and asynchronous XDG Downloads scans.
- `lib/privacy-monitor.js`: subscribes to existing Shell privacy indicators
  and the microphone mute state. Subscriptions are removed when the feature
  or extension is disabled.
- `lib/themes.js`: pure preset palettes and approved keyboard combinations.
- `lib/live-activity.js`, `lib/activity-protocol.js`: optional local
  session-bus integration and strict payload validation.
- `prefs.js`: separate GTK4/libadwaita preferences process. Never import
  Shell/St/Clutter here.
- `schemas/`: typed preferences; defaults must avoid invasive behavior.

## Ownership and lifecycle

`enable()` owns the extension actor, settings signals, keyboard binding,
monitors, GLib timeouts, artwork requests and (when opted in) D-Bus bus name.
The corresponding `disable()` must undo **every** registration and restore
the original GNOME clock and panel styling. An exception during enable triggers
cleanup.

Avoid doing synchronous disk/network I/O on GNOME's UI thread. Don't poll
faster than necessary. A running animation should stop immediately when its
feature is disabled. Critical GNOME notifications/overlays must never silently
disappear if Nova's replacement cannot be shown.

## Privacy/security

- No AI, analytics, telemetry, clipboard access or arbitrary subprocesses.
- Cover art may contact HTTPS hosts supplied by the active media player only;
  see the README for validation/limits.
- Download monitoring is restricted to the configured XDG Downloads folder.
- Developer activity API is **disabled by default**, limited to brief local
  status text and bounded progress, and never accepts markup, file paths,
  arbitrary icons or network URLs for loading or execution. Client strings
  are sanitized and used only as display text.
- D-Bus on the same session is **not** an identity or permission boundary:
  other same-user processes can submit previews while opted in.

## Compatibility

Shell 49–51 are targets, not proof of coverage. Prefer public GI APIs and
stable GNOME facilities. Any private Shell API must have a fallback and
GNOME-version-dependent testing.
