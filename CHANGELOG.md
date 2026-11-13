# Changelog

## v0.7.0 — Rich notification previews (Fedora-tested)

- Display the notification's title, message body, and source app separately
- Use app-specific GIcons where the GNOME notification exposes one
- Queue up to six pending notifications in FIFO order instead of overwriting
  the current preview; show the count of pending alerts
- Fail open to GNOME's regular banner when the queue is full, Nova is hidden,
  or the session is locked; keep critical alerts native
- Sanitize and bound text, add notification queue regression tests and
  a manual Fedora test guide

**Validation:** The maintainer confirmed notification handling with real Fedora desktop apps. JavaScript tests, GSettings schema validation and installable ZIP checks passed. Overflow, lock-screen, accessibility, and cross-GNOME-version behaviors still warrant additional testing.

## v0.6.0 — Customization and developer activities (Fedora-tested)

- Preset capsule themes, preserving existing custom accent colors
- Optional, conflict-avoiding keyboard shortcut to open/close Nova
- Avoid redrawing static notifications every second and give users a visualizer toggle
- Opt-in bounded D-Bus session API for local build/terminal activities
- Extended GNOME lifecycle and packaging checks
- Architecture, performance, testing and contribution documentation

**Validation:** Automated tests, schema/package checks, and hands-on Fedora verification of themes, keyboard shortcuts, developer API, music, downloads, notifications, and enable/disable. Other GNOME versions and performance characteristics remain to be measured.

## v0.5.4 — First stable milestone (Fedora-tested)

- Clock/calendar and MPRIS media capsule with optional floating GNOME top bar
- Album art and synthetic playback bars
- Timers, screen-recording status, notifications, volume/brightness OSD and download tracking
- Native GSettings preferences
- Faster download completion detection and smaller completion cards without fake progress percentages
- Installer, unit tests, schema checks and user documentation

See [the release notes](docs/releases/v0.5.4.md) for installation and limitations.
