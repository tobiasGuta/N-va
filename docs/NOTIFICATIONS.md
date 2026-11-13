# Notification previews — v0.7.0

This feature is included in stable v0.7.0. The Fedora maintainer confirmed the
richer previews with real desktop applications. The test scenarios below
remain useful for wider compatibility testing.
Nova listens to GNOME Shell's existing notification sources. It does **not**
replace the freedesktop notification daemon or record a second history.

## Presentation

- The compact island shows the notification title.
- The expanded island shows the app/source name, title and message body,
  with a native GIcon when the source supplies one.
- Up to **six additional notifications** wait in a FIFO queue. A small
  `+N` label indicates how many are queued.
- If the queue fills, the new notification falls back to GNOME's normal
  banner rather than being acknowledged by Nova.
- Long titles and bodies are abbreviated to fit (up to 90/160 Unicode
  characters before UI layout), and shown as **plain text**, not markup.
- Ordinary notifications remain in GNOME history. Critical notifications
  remain native and are not acknowledged by Nova.
- Notifications cannot be queued by Nova while its island is hidden or
  the GNOME session is locked. The queue is cleared when hidden and is
  released when Nova is disabled.
- Apps displaying their own proprietary/in-app popups may not use GNOME
  notification sources, so Nova cannot mirror them.

## Fedora testing

After installing v0.7.0 and logging out/back in, verify
the extension is active and version **11**:

```bash
gnome-extensions info nova@tobiasguta.github.io
```

Send a single notification:

```bash
notify-send -a Nova-Test 'Hello from Nova' 'This message body should appear below the title.'
```

Then send three in quick succession:

```bash
for i in 1 2 3; do
  notify-send -a Nova-Test "Message $i" "Notification number $i"
done
```

Expected: Message 1 appears first, then 2, then 3, each with its own body,
and the pending count decreases. If your desktop groups repeated test
notifications, try different `-a` names.

Test with your regular browser and messaging apps to verify actual icons;
not all GNOME notification sources provide an icon. For queue overflow,
send at least eight notifications quickly and confirm GNOME still handles
those beyond Nova's queue capacity. Verify the notification history in
GNOME's date menu remains available.

Then try:
1. Turning off **Show notifications in Nova** in Preferences.
2. Turning **Nova-only notification banners** off and on.
3. Logging out/in, fullscreen, and the lock screen.
4. Disabling the extension while notifications are queued.
5. A critical notification emitted by a test tool, if available.

Send screenshots of the expanded preview, and note the output of
`gnome-shell --version` if something behaves differently.
Do not include sensitive message content in screenshots.

## Rollback

From your stable `main` worktree:

```bash
cd ~/N-va
git checkout main
git pull origin main
bash install.sh
```

Log out and back in. To return specifically to v0.6.0, install the ZIP
from its existing GitHub release and log out/back in.
