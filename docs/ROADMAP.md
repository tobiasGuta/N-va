# Nova roadmap

Nova's direction is to feel **native to GNOME**, rather than copying macOS
behavior blindly. This is a living engineering plan, not a promise of dates.

| Pillar | Available now | Next validation/build |
|---|---|---|
| Visual polish | Floating capsule, motion, artwork, theme presets (Fedora-tested) | Motion/accessibility review at multiple scaling factors; keyboard navigation |
| Stability | Cleanup on disable, async I/O, regression tests | Repeated enable/disable stress tests; memory/CPU baseline across GNOME 49–51 |
| Linux integrations | MPRIS, GNOME notifications/OSD, XDG Downloads, native recorder, opt-in local D-Bus API | PipeWire-native recording status and browser download API (requires design + hardware tests) |
| Customization | Color, widths, timings, per-activity toggles, preset themes/shortcut (Fedora-tested) | User-configurable activities and layout presets |
| Community | Release notes, issue/PR templates, docs, CI | License decision, contributor onboarding, GNOME Extensions review |

## v0.6.0 — released

- [x] Add compact theme presets without overriding saved custom colors
- [x] Add an optional keyboard shortcut with cleanup on disable
- [x] Reduce repeated actor creation for static activity previews
- [x] Add an opt-in, bounded D-Bus activity interface for local tools
- [x] Add regression and package checks
- [x] Verify themes, shortcut, developer API and existing live activities in a real Fedora GNOME session (other GNOME versions remain unverified)
- [ ] Record a repeatable idle CPU/memory baseline
- [ ] Audit theme, keyboard focus, and reduced-motion behavior
- [x] Owner confirmed theme, shortcut, developer API, music, downloads, notification and enable/disable tests

## v0.7.0-dev — notification experience

- [x] Preserve GNOME notification titles and message bodies as plain text
- [x] Show app-provided GIcons with a safe generic fallback
- [x] Add a bounded FIFO queue with visible pending count
- [x] Keep native fallback for overflow, hidden mode and critical alerts
- [x] Add pure queue/text tests and preview packaging CI
- [ ] Test Discord/Firefox/Telegram/VS Code and `notify-send` on Fedora
- [ ] Validate three or more rapidly arriving notifications, correct order
- [ ] Confirm GNOME notification history and critical alerts are unchanged
- [ ] Check long messages, app icons, scaling, lock/fullscreen and disabling Nova

## Later exploration

- PipeWire session-status integration: first define which recording and
  microphone states can be observed reliably without system-wide privileges.
- Browser companion for exact percent and time remaining: explicitly opt-in,
  no background tracking or browser history collection.
- App-provided live activities using the optional D-Bus contract, with
  permissions and cancellation support if developer feedback warrants it.
- Translation/localization and first-day-of-week locale controls.
- GNOME Extensions review readiness, license selection, reproducible builds
  and accessibility audits.

Please avoid speculative "performance" or "compatibility" claims until they
are backed by measurements or runtime test results.
