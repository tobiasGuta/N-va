# Nova

**A tiny Dynamic Island for GNOME. No AI, no background daemon, no Electron.**

Nova is an early-stage GNOME Shell extension with a compact clock and calendar by default. When an MPRIS player actively plays audio/video, it switches to a music island. Hover to expand; PIN to keep it open.

## Features in v0.3

- Compact, centered black pill fitted to the GNOME panel height, with smooth expand/collapse and content fade-in.
- Default compact clock with local time and weekday; expanded month-view calendar with navigation.
- Music card only while a compatible MPRIS player reports `Playing`; pauses and stops return to the clock.
- Floating-panel mode removes GNOME's top bar background but retains left/right controls.
- A rounded black expanded media card, styled independently of custom GNOME themes.
- Play/pause, previous and next buttons (when the player supports them).
- Hover to expand; use the PIN button to keep Nova open while using other apps; close to collapse.
- Automatically discovers MPRIS players and follows playback changes.
- Restores the original GNOME center clock when disabled.
- Respects GNOME 51 reduced-motion preference; no network calls, AI, or subprocesses.

**Status:** Early development release. Source targets GNOME Shell 49–51; automated tests pass, but the transparent panel and calendar still need runtime testing on Fedora. The calendar shows the local month (not appointments or notification events). Album art and notification previews are not implemented yet.

## Install on Fedora GNOME

1. Confirm that you are running GNOME Shell, not KDE Plasma:

   ```bash
   echo $XDG_CURRENT_DESKTOP
   gnome-shell --version
   ```

2. Download and install locally:

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

## Music player compatibility

Nova reads `org.mpris.MediaPlayer2.*` services from the user's session D-Bus. Spotify, VLC and some browsers expose MPRIS interfaces. Browser media support depends on the browser's settings and the current playback session. Nova displays music only when the selected player is actively playing, and returns to the clock when playback pauses or stops.

Useful optional diagnostic tool:

```bash
sudo dnf install playerctl
playerctl -l
playerctl metadata
```

`playerctl` is **not** a Nova runtime dependency.

## Floating top bar

By default, Nova makes the **existing** GNOME top bar transparent. It does not remove the panel, icons, indicators, or their click targets.

To keep the usual solid GNOME panel, edit `lib/config.js` and set:

```js
export const FLOATING_PANEL = false;
```

Then run `bash install.sh` and log out/back in. Disabling Nova also restores the original panel styling.

**Note:** Custom GNOME themes and other panel-styling extensions may override transparency, and GNOME still reserves panel space for maximized windows.

## Development

Only GNOME Shell 49–51 is targeted. JavaScript is written as modern GJS ES modules. The unit tests cover pure MPRIS selection/normalization and can be run without GNOME:

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
lib/config.js      opt-out for floating panel background
lib/mpris.js       session D-Bus discovery, updates, media commands
lib/player.js      pure media state normalization / player selection
tests/             pure JavaScript regression tests
install.sh         user-local installation
```

All media commands go to the selected MPRIS player over the session bus. Nova never runs shell commands, opens listening sockets, or uses external AI services.

## Roadmap

- Calendar events integration and locale-specific first day of week.
- Artwork with a privacy-conscious loading path.
- Optional notification previews without suppressing GNOME's native banners.
- Timer/live activities and user preferences.
- Better small-screen, scaling and multi-monitor testing.

## Contributing

Bug reports and PRs are welcome. Please include Fedora and GNOME Shell versions when reporting a rendering or behavior issue.

## License

License selection is pending the repository owner's decision; do not assume third-party code is included. The implementation here was written from scratch.
