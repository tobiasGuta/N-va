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

## Notification history

1. Send desktop notifications from two applications, then open Nova's bell.
   Confirm the list includes notifications that arrived before it opened, in
   newest-first order, with the app name, title, message, and time.
2. Send another notification with the list open. The list should update without
   closing, and GNOME should handle the banner according to its own settings.
3. Select the × next to a notification in Nova. Confirm it disappears from
   both Nova and GNOME, and that the other notifications are still present.
   Dismiss another from GNOME and confirm it disappears from Nova too. Dismiss
   the last notification to check the empty state.
4. Send enough notifications to scroll. Use keyboard focus and scroll
   controls, then press Escape or use the back button to return to Nova.
5. Lock the session or disable Nova with history open. Reopen Nova and check
   that it starts on its regular view.

Nova reads up to 50 entries from GNOME's retained notifications. GNOME and
the sending app determine how long each notification stays available.
Opening history leaves new banners to GNOME.

The maintainer confirmed the history view, row dismissal, and capsule corner
fix on Fedora 45 with GNOME Shell 51.1. A headless Shell test also covered
sorting, live updates, scrolling, dismissal, keyboard focus, and cleanup.

## Rollback

To return to the release before notification history, download
`Nova-v0.7.0-GNOME.zip` from the [v0.7.0 release](https://github.com/tobiasGuta/N-va/releases/tag/v0.7.0)
and run this command in the download directory:

```bash
gnome-extensions install --force Nova-v0.7.0-GNOME.zip
```

Log out and back in to load the release build.
