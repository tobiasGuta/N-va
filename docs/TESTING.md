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
- [ ] Play a track with square album art and a video with a wide thumbnail.
  The compact capsule should keep its small thumbnail. The expanded card
  should show larger artwork on the left, with wide thumbnails centered at
  their original proportions against the capsule background.
- [ ] At the minimum expanded width, verify that long media titles and
  artist names truncate cleanly and playback controls stay visible. Play
  media without artwork and confirm the music icon appears.
- [ ] Shortcut disabled: no binding. Enable either preset, toggle twice,
  then disable extension and confirm the shortcut no longer responds.

## Hide Top Bar compatibility

The Node.js geometry tests cover panel heights, scaled logical sizes, and
offset monitor origins. The Shell smoke test uses a virtual Wayland display
and a panel hide/reveal animation. It checks pointer picking for compact and
expanded Nova, stacking after the panel is re-registered, live preference
changes, fullscreen, Activities, and cleanup after disabling and re-enabling.

Run the smoke test from the repository root on a system with
`gnome-shell-test-tool`. It uses temporary settings and an isolated session bus.

```bash
bash scripts/package.sh
(
    nova_test_runtime="$(mktemp -d)"
    trap 'rmdir "$nova_test_runtime" 2>/dev/null || true' EXIT
    dbus-run-session -- env -u DISPLAY -u WAYLAND_DISPLAY \
        XDG_RUNTIME_DIR="$nova_test_runtime" GSK_RENDERER=cairo GTK_A11Y=none \
        gnome-shell-test-tool --headless --extension "$PWD/dist/Nova-v0.7.0-GNOME.zip" \
        "$PWD/tests/gnome-top-bar-smoke.mjs"
)
```

For a desktop test, install a Hide Top Bar release that supports your Shell
version. Enable its mouse-at-screen-edge reveal option. Turn off Intellihide
to reproduce hiding without opening a window, then repeat with Intellihide on.

- [ ] With **Keep Nova visible when the top bar is hidden** on, move to and
  away from the top edge repeatedly. The panel should slide in and out
  while Nova stays centered. Open Activities and Quick Settings from the
  revealed bar.
- [ ] Hover to expand Nova while the top bar is hidden. Use the calendar
  pin and notification history buttons, then repeat with a media player.
  Keep Nova pinned while revealing and hiding the panel.
- [ ] Switch to panel-relative placement in Nova Preferences while the
  panel is hidden, then switch back. Nova should return to the top center
  as soon as independent placement is enabled.
- [ ] Switch the primary display to an offset monitor and try 100%, 125%
  and 200% scaling where available. Try fullscreen on each monitor.
  Nova should hide when fullscreen covers its primary display and return
  in Activities and after leaving fullscreen.
- [ ] Toggle both extensions in each order. Disabling Nova should restore
  the native clock and panel styling while Hide Top Bar can still hide and
  reveal the panel. Re-enable Nova and check that its controls respond.

The Shell smoke test passed on Fedora 45 with GNOME Shell 51.1. Isolated runs
with Hide Top Bar v129 also verified pressure reveal, autohide, Nova's hover
and pin controls, and switching to an offset primary virtual display at
125% scale. Physical displays, real pointer hardware, and Shell 49 and 50
remain to be tested.

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

## Privacy indicators

- [ ] Start microphone capture and confirm the orange dot. Toggle system mute
  and stop capture to verify that the status updates.
- [ ] Start a PipeWire camera preview and confirm the green dot. Use the
  camera and microphone together and check that the expanded summary lists both.
- [ ] On Fedora, enable **Settings → Privacy & Security → Location →
  Automatic Device Location**, then run the GeoClue demo:

  ```bash
  sudo dnf install geoclue2-demos
  /usr/libexec/geoclue-2.0/demos/where-am-i
  ```

  Look for Nova's blue arrow while GNOME reports location activity. Press
  Ctrl+C to stop the demo and check that the arrow clears. If GeoClue reports
  `Geolocation disabled for UID`, check the GNOME setting before retrying.
- [ ] Share a window from a Wayland browser call. Check that Nova's sharing
  icon follows GNOME's sharing indicator when you start and stop.
- [ ] Toggle **Appearance → Privacy indicators** during capture and confirm
  Nova's indicators clear and return while GNOME's indicators remain visible.

The maintainer confirmed microphone, camera, and location on Fedora 45 with
GNOME Shell 51.1. An isolated GNOME Shell 51.1 smoke test exercised the layout
with simulated activity, including screen sharing, and checked signal cleanup.

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
