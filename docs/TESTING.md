# Fedora / GNOME manual test plan

Automated Node.js checks do not emulate GNOME Shell. Before merging a new
release, test with the current Fedora/GNOME version and record the results.

## Visual and interaction tests

- [ ] Default compact mode shows the local clock without overlap.
- [ ] Hover expands smoothly; mouse exit collapses; pin and close work.
- [ ] Test at 100%, 125% and 200% scaling where available.
- [ ] Each theme preset changes the capsule and accent without losing contrast.
- [ ] Editing the custom accent returns the theme selection to Custom.
- [ ] GNOME reduced-motion setting eliminates decorative animations.
- [ ] Disable visualizer while music plays; bars stop immediately.
- [ ] Shortcut disabled: no binding. Enable either preset, toggle twice,
  then disable extension and confirm the shortcut no longer responds.

## Linux-specific tests

- [ ] MPRIS starts/stops in Firefox/Spotify/VLC as available.
- [ ] Notifications preserve critical GNOME alerts and history.
- [ ] Notification preview branch: run burst test, check app names,
  message bodies, queue order, critical and overflow behavior using
  [the notification testing guide](NOTIFICATIONS.md).
- [ ] Volume and brightness show the actual value, not a stale reading.
- [ ] Downloads: quick image, large file, renamed Firefox `.part`,
  Chromium `.crdownload`, cancellation and non-Downloads destination.
- [ ] Timer, screen recording indicator, and panel transparency.
- [ ] Check with Blur my Shell disabled and its panel effect separately
  disabled; never assume compatibility with every theme.
- [ ] Developer API off: D-Bus name absent.
- [ ] Developer API on: send `gdbus` sample from
  [developer-api.md](developer-api.md); inspect title sanitization and the
  automatic collapse after a short timeout.
- [ ] Disable Nova while a timer, download and developer preview are active;
  no stranded actor, overlay hook or D-Bus name should remain.

## Resource checks

- [ ] Compare GNOME Shell CPU and memory at idle with Nova off/on.
- [ ] Repeat enable/disable 20 times in a nested development session and
  inspect `journalctl` for leaks/warnings.
- [ ] Check the idle cost with no player, with MPRIS playing and with the
  visualizer disabled.
- [ ] Test a directory with many Downloads files; GNOME Shell must remain
  responsive during asynchronous scans.

Suggested diagnostics:

```bash
gnome-shell --version
gnome-extensions info nova@tobiasguta.github.io
journalctl --user -b /usr/bin/gnome-shell --no-pager | grep -i nova
```

Report Fedora release, Shell version, enabled extensions and reproducible
steps. Don't publish sensitive filenames or notification text.
