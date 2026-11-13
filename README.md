# Nova

**A lightweight, Apple-inspired Dynamic Island for GNOME Shell.** Smooth animations, music controls, live desktop activities, a clock and calendar — **no AI, Electron, or background daemon**.

[![Nova checks](https://github.com/tobiasGuta/N-va/actions/workflows/ci.yml/badge.svg)](https://github.com/tobiasGuta/N-va/actions/workflows/ci.yml)
[![Release](https://img.shields.io/badge/release-v0.5.4-blue)](https://github.com/tobiasGuta/N-va/releases/tag/v0.5.4)

**[Get Nova v0.5.4](https://github.com/tobiasGuta/N-va/releases/tag/v0.5.4)** · **[Installation](#install-on-fedora-gnome)** · **[Preferences](#preferences)** · **[Report a bug](https://github.com/tobiasGuta/N-va/issues/new/choose)**

### Screenshots

<table>
<tr>
<td width="53%" align="center">
<img src="assets/screenshots/desktop.webp" alt="Nova compact music island floating in a transparent GNOME panel" width="720"/>
<sub>Compact island with floating top bar</sub>
</td>
<td width="47%" align="center">
<img src="assets/screenshots/music.webp" alt="Nova expanded music controls with artwork and playback buttons" width="450"/>
<sub>Expanded MPRIS music card</sub>
</td>
</tr>
</table>

<sub>Real Fedora screenshots provided during development and cropped to highlight Nova. Some controls in the captures have since been refined.</sub>

## Features in v0.5.4

- Compact, centered black pill fitted to the GNOME panel height, with smooth expand/collapse and content fade-in.
- Default compact clock with local time and weekday; expanded month-view calendar with navigation.
- Music card only while a compatible MPRIS player reports `Playing`; pauses and stops return to the clock.
- Floating-panel mode removes GNOME's top bar background but retains left/right controls.
- A rounded black expanded media card, styled independently of custom GNOME themes.
- Album art for MPRIS `mpris:artUrl` (local files or bounded HTTPS downloads), with fallback music icons.
- Animated playback bars in both compact and expanded media views; a decorative activity indicator rather than a live audio spectrum.
- Gentle cross-fades as Nova morphs from the calendar to music and back.
- Play/pause, previous and next buttons (when the player supports them).
- Hover to expand; use an icon-only pin button to keep Nova open while using other apps; close to collapse.
- Countdown timers (5, 15, or 25 minutes) launched from the calendar and shown as live activities.
- Native Nova notification previews, with an optional Nova-only mode that keeps GNOME history and critical alerts.
- Faster signal-driven volume indicators from GNOME Quick Settings and brightness updates from Mutter.
- Optional experimental replacement of GNOME’s volume/brightness OSD with Nova’s own overlays, with safe restoration when disabled.
- GNOME built-in screencast activity with elapsed time.
- Download activity and completion previews from the XDG Downloads folder using asynchronous scans and filesystem events, including received bytes when possible (no invented percentages).
- Native settings window for sizes, accent color, animation duration, floating bar, and individual activity toggles.
- Automatically discovers MPRIS players and follows playback changes.
- Restores the original GNOME center clock when disabled.
- Respects GNOME 51 reduced-motion preference; no AI or subprocesses. Optional HTTPS requests occur only for remote cover art during playback.

**Status:** v0.5.4 is our first Fedora-tested stable milestone, targeting GNOME Shell 49–51. Not all GNOME versions and themes have been independently verified; live activities use Shell APIs that may vary between setups. The calendar is local-only (no appointments). Nova can replace ordinary banners when the optional Nova-only setting is enabled; GNOME's critical alerts remain native.

## Install on Fedora GNOME

1. Confirm that you are running GNOME Shell, not KDE Plasma:

   ```bash
   echo $XDG_CURRENT_DESKTOP
   gnome-shell --version
   ```

2. For the tested source installation, clone and install locally (or get the ZIP from the [v0.5.4 release](https://github.com/tobiasGuta/N-va/releases/tag/v0.5.4)):

   ```bash
   git clone https://github.com/tobiasGuta/N-va.git
   cd N-va
   bash ./install.sh
   ```

3. **Log out and back in** on a Wayland session, then enable:

   ```bash
   gnome-extensions enable nova@tobiasguta.github.io
   ```

   If the extension isn't listed, verify that it is installed at `~/.local/share/gnome-shell/extensions/nova@tobiasguta.github.io/` and log out/in once more.

To disable Nova and restore the original clock:

```bash
gnome-extensions disable nova@tobiasguta.github.io
```

To uninstall it completely, disable it first, then run:

```bash
rm -r "$HOME/.local/share/gnome-shell/extensions/nova@tobiasguta.github.io"
```

## Artwork and privacy

Nova reads `mpris:artUrl` only while an MPRIS client reports active playback. Local cover files load directly. Remote covers use HTTPS only (no redirects, IP literals, localhost, custom ports, or HTTP), with an 8-second timeout and 2 MB data limit. A small in-memory cache is released when Nova is disabled; no disk cache is created.

Remote cover images do cause HTTPS requests to the provider's image server. If artwork is missing or unsupported, Nova falls back to a note icon.

The four moving bars are a **synthetic playback animation**, not a live waveform. Nova does not capture or inspect audio.

## Music player compatibility

Nova reads `org.mpris.MediaPlayer2.*` services from the user's session D-Bus. Spotify, VLC and some browsers expose MPRIS interfaces. Browser media support depends on the browser's settings and the current playback session. Nova displays music only when the selected player is actively playing, and returns to the clock when playback pauses or stops.

Useful optional diagnostic tool:

```bash
sudo dnf install playerctl
playerctl -l
playerctl metadata
```

`playerctl` is **not** a Nova runtime dependency.

## Preferences

Open **Extensions → Nova → Preferences**, click the small gear button inside Nova’s expanded calendar or music player, or run:

```bash
gnome-extensions prefs nova@tobiasguta.github.io
```

Adjust the compact/expanded widths, accent color (hex `#RRGGBB`), animation speed, floating top bar, and individual activity features. The installer now compiles an extension-local GSettings schema. If you install manually, include `prefs.js` and the `schemas/` directory.

## Live activity coverage

- **Timer:** Start a 5-, 15-, or 25-minute countdown in the expanded calendar. It remains visible until stopped or finished.
- **Notifications:** Nova previews regular GNOME notification titles. In **Nova-only notification banners** mode, it acknowledges the incoming normal alert before GNOME displays a second banner, while leaving the notification in GNOME's history. Critical alerts remain native. Disable the Nova-only switch to see both banners. If you previously turned off **Show notifications in Nova**, turn it back on in preferences; GSettings retains explicit choices across upgrades.
- **Volume / brightness OSD:** GNOME normally shows its own OSD as well as Nova. The **Replace native volume/brightness OSD** preference now defaults to on for new installs. You can turn it off to keep GNOME's overlays. When enabled, Nova reads the volume/brightness percentage from the same GNOME OSD event, renders it directly, and suppresses only that native popup. Unsupported GNOME overlays remain intact. Existing saved settings may override the new default; check the preferences switch if two popups remain. Disabling Nova restores the original GNOME methods.
- **Volume:** Mirrors output-volume changes from compatible GNOME Quick Settings stream objects.
- **Brightness:** Uses GNOME's active Quick Settings slider as the authoritative source to avoid incorrect jumps between readings. Falls back to Mutter's `org.gnome.Mutter.DisplayConfig.Backlight` property only when the slider is unavailable. Some hardware may not expose either.
- **Screen recording:** Tracks GNOME Shell's built-in screencast status, not OBS, browser sharing, or other third-party recorders.
- **Downloads:** Nova uses your configured XDG Downloads directory (fallback `~/Downloads`) and listens for Gio file-monitor events, with asynchronous folder scans every ~2.4 seconds as a fallback. Rename completions are checked immediately, and direct-to-final files receive a follow-up scan after ~700 ms rather than waiting for the next fallback poll. It recognizes Firefox `.part` and Chromium `.crdownload` transfers, and also detects files written directly to their final name. It shows `Downloading` for temporary files, `Download complete` after the associated final file is present, or `Saving to Downloads` / `Saved to Downloads` for files without a temporary filename once their size stabilizes. The latter is **best-effort** and can include ordinary file copies. Very fast image downloads now show only a compact Saved notification after a brief settling interval. Download cards without an actual percentage no longer display a misleading progress bar. No browser-wide exact percentage is available through folder monitoring. Files saved outside the configured Downloads folder aren't tracked.

All preview/monitor timers and listeners are cleaned up when Nova is disabled.

## Floating top bar

By default, Nova makes the **existing** GNOME top bar transparent. It does not remove the panel, icons, indicators, or their click targets.

To keep the usual solid GNOME panel, turn off **Transparent top panel** in Nova's preferences. The change applies immediately. Disabling Nova also restores the original panel styling.

**Note:** Custom GNOME themes and other panel-styling extensions may override transparency. If you use **Blur my Shell**, its **Panel** blur or background layer may still paint behind Nova's transparent panel. For testing, disable only Blur my Shell's **Panel** blur in its preferences; keep its other blur effects enabled if you like. GNOME still reserves panel space for maximized windows, so transparency reveals whatever is behind the bar (often a window's dark header), not necessarily your wallpaper.

Nova now avoids the unsupported `Main.panel 'allocation-changed'` signal that previously caused an extension startup error.

## Development

Only GNOME Shell 49–51 is targeted. JavaScript is written as modern GJS ES modules. The unit tests cover MPRIS selection/normalization, artwork URL policy, waveform frames and can be run without GNOME:

```bash
npm run check
```

For UI testing, use a nested GNOME Shell development session when possible. Because GNOME extensions run inside the shell process, test safely before enabling on your main desktop. After editing JavaScript under Wayland, log out and back in to reload. CSS is also automatically installed by `install.sh`.

Debug extension errors with:

```bash
journalctl --user -b /usr/bin/gnome-shell --no-pager | grep -i nova
```

## Architecture

```text
extension.js       top-center pill, hover/click, animations, GNOME lifecycle
stylesheet.css     dark pill styling
lib/geometry.js    panel-aware island sizing and anchoring
lib/clock.js       clock formatting, calendar dates, and display-mode logic
prefs.js            GTK4/libadwaita preferences window
schemas/            GSettings schema for appearance and feature toggles
lib/activity-utils.js pure timer and transfer-formatting helpers
lib/activity-monitor.js GNOME notification, volume, brightness, recording and download signals
lib/artwork.js     bounded async HTTPS/local cover loading (Soup/Gio)
lib/artwork-url.js pure metadata URL policy
lib/waveform.js    synthetic playback animation frames
lib/mpris.js       session D-Bus discovery, updates, media commands
lib/player.js      pure media state normalization / player selection
tests/             pure JavaScript regression tests
install.sh         user-local installation
```

All media commands go to the selected MPRIS player over the session bus. Nova never runs shell commands, opens listening sockets, or uses external AI services.

## Roadmap

- Calendar events integration and locale-specific first day of week.
- Optional browser-specific integration for exact download percentages and estimated completion.
- Support for third-party recorder status when their applications expose compatible APIs.
- Better small-screen, scaling and multi-monitor testing.

## Contributing

Bug reports and PRs are welcome. Please include Fedora and GNOME Shell versions when reporting a rendering or behavior issue.

## License

**License selection is still pending.** Public source code does not automatically grant permission to redistribute or create derivative works. Please do not assume Nova has an approved open-source license yet. This is tracked as a release follow-up; the implementation was written from scratch.
