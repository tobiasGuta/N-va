# Contributing to Nova

Thanks for helping make Nova better. This extension executes inside GNOME Shell, so changes to signals, timers or UI layout need careful cleanup and testing.

## Before a pull request

1. Create a branch from `main`, keep each PR focused, and explain the user-visible behavior.
2. Run `npm run check` (Node.js 20 or newer). The CI checks JavaScript syntax and unit tests, and also validates the GSettings schema.
3. For UI changes, test in a nested GNOME Shell session if possible, then on a Fedora/GNOME desktop after logging out and back in.
4. Make sure disabling Nova restores the original top panel and clock and disconnects listeners/timers.
5. Include Fedora version, GNOME Shell version, and screenshots when filing UI issues.

Useful diagnostics:

```bash
gnome-shell --version
gnome-extensions info nova@tobiasguta.github.io
journalctl --user -b /usr/bin/gnome-shell --no-pager | grep -i nova
```

## Limitations

GNOME 49–51 are declared compatibility targets. Private GNOME APIs may vary, and other extensions can affect the top panel. Please avoid blocking I/O in Shell.

## License status

The repository owner has **not yet selected a software license**. Please discuss licensing before submitting code intended for redistribution; the repository being public is not itself a grant of redistribution rights.
