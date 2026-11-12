# Nova

**A tiny Dynamic Island for GNOME. No AI, no background daemon, no Electron.**

Nova is an early-stage GNOME Shell extension that puts a dark, interactive pill at the top center of your desktop. Hover or click to expand it; control compatible music players through the standard Linux MPRIS D-Bus interface.

## Features in v0.1

- Compact, centered black pill and smooth expand/collapse animation.
- Shows the currently playing track and artist.
- Play/pause, previous and next buttons (when the player supports them).
- Automatically discovers MPRIS players and follows playback changes.
- Restores the original GNOME center clock when disabled.
- Respects GNOME 51 reduced-motion preference; no network calls, AI, or subprocesses.

**Status:** First development release. Source targets GNOME Shell 49, 50 and 51, but has not yet been runtime-tested on Fedora. Notifications, artwork, timers, and configurable positioning are not implemented yet.

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

Nova reads `org.mpris.MediaPlayer2.*` services from the user's session D-Bus. Spotify, VLC and some browsers expose MPRIS interfaces. Browser media support depends on the browser's settings and the current playback session. A stopped player may still be displayed until it disconnects.

Useful optional diagnostic tool:

```bash
sudo dnf install playerctl
playerctl -l
playerctl metadata
```

`playerctl` is **not** a Nova runtime dependency.

## Development

Only GNOME Shell 49–51 is targeted. JavaScript is written as modern GJS ES modules. The unit tests cover pure MPRIS selection/normalization and can be run without GNOME:

```bash
npm run check
```

For UI testing, use a nested GNOME Shell development session when possible. Because GNOME extensions run inside the shell process, test safely before enabling on your main desktop. After editing JavaScript under Wayland, log out and back in to reload.

Debug extension errors with:

```bash
journalctl --user -b /usr/bin/gnome-shell --no-pager | grep -i nova
```

## Architecture

```text
extension.js       top-center pill, hover/click, animations, GNOME lifecycle
stylesheet.css     dark pill styling
lib/mpris.js       session D-Bus discovery, updates, media commands
lib/player.js      pure media state normalization / player selection
tests/             pure JavaScript regression tests
install.sh         user-local installation
```

All media commands go to the selected MPRIS player over the session bus. Nova never runs shell commands, opens listening sockets, or uses external AI services.

## Roadmap

- Artwork with a privacy-conscious loading path.
- Optional notification previews without suppressing GNOME's native banners.
- Timer/live activities and user preferences.
- Better small-screen, scaling and multi-monitor testing.

## Contributing

Bug reports and PRs are welcome. Please include Fedora and GNOME Shell versions when reporting a rendering or behavior issue.

## License

License selection is pending the repository owner's decision; do not assume third-party code is included. The implementation here was written from scratch.
