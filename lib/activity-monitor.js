import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {formatBytes, isPartialDownload, percentage, safeTitle} from './activity-utils.js';

// No patches to GNOME internals, notification replacement, or subprocesses.
// All integration points are optional: unsupported versions simply skip them.
export class ActivityMonitor {
    constructor(settings, onPreview, onRecording) {
        this._settings = settings;
        this._onPreview = onPreview;
        this._onRecording = onRecording;
        this._signals = [];
        this._sources = new Map();
        this._pollId = 0;
        this._downloadMonitor = null;
        this._downloadSignal = 0;
        this._cancellable = new Gio.Cancellable();
        this._disposed = false;
        this._lastVolume = null;
        this._lastBrightness = null;
        this._lastRecording = false;
        this._brightnessPending = false;
        this._pollCount = 0;
        this._recentDownload = '';
        this._lastDownloadTime = 0;
    }

    start() {
        this._watchNotifications();
        this._watchDownloads();
        this._poll();
        this._pollId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, 1100, () => {
                this._poll();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _connect(object, signal, callback) {
        try {
            const id = object.connect(signal, callback);
            this._signals.push([object, id]);
        } catch (error) {
            console.debug('Nova: optional signal not available: ' + signal);
        }
    }

    _watchNotifications() {
        const tray = Main.messageTray;
        if (!tray)
            return;
        for (const source of tray.getSources?.() ?? [])
            this._watchSource(source);
        this._connect(tray, 'source-added', (_tray, source) => this._watchSource(source));
    }

    _watchSource(source) {
        if (!source || this._sources.has(source))
            return;
        try {
            const id = source.connect('notification-added', (_obj, notification) => {
                if (!this._settings.get_boolean('show-notifications') ||
                    Main.messageTray.bannerBlocked)
                    return;
                const title = safeTitle(notification?.title);
                if (!title)
                    return;
                this._onPreview({
                    kind: 'notification', icon: 'mail-unread-symbolic',
                    title, detail: safeTitle(source.title || source.name || 'Notification'),
                    duration: 3200,
                });
            });
            this._sources.set(source, id);
        } catch (_error) {
            // No source-level notification signal on this Shell version.
        }
    }

    _watchDownloads() {
        try {
            const directory = Gio.File.new_for_path(
                GLib.build_filenamev([GLib.get_home_dir(), 'Downloads'])
            );
            this._downloadMonitor = directory.monitor_directory(
                Gio.FileMonitorFlags.NONE, this._cancellable
            );
            this._downloadSignal = this._downloadMonitor.connect(
                'changed', (_monitor, file, _other, event) => {
                    if (!this._settings.get_boolean('show-downloads'))
                        return;
                    const candidate = event === Gio.FileMonitorEvent.RENAMED &&
                        _other ? _other : file;
                    const name = safeTitle(candidate?.get_basename() ?? '');
                    if (!name)
                        return;
                    const partial = isPartialDownload(name);
                    const active = event === Gio.FileMonitorEvent.CREATED ||
                        event === Gio.FileMonitorEvent.CHANGED ||
                        event === Gio.FileMonitorEvent.MOVED_IN ||
                        event === Gio.FileMonitorEvent.RENAMED;
                    if (!active || (!partial && event === Gio.FileMonitorEvent.CHANGED))
                        return;
                    const now = GLib.get_monotonic_time();
                    if (this._recentDownload === name &&
                        now - this._lastDownloadTime < 4500000)
                        return;
                    this._recentDownload = name;
                    this._lastDownloadTime = now;
                    const displayName = safeTitle(name.replace(
                        /\\.(crdownload|part|download)$/i, ''
                    ), 38);
                    const preview = bytes => {
                        if (this._disposed)
                            return;
                        this._onPreview({
                            kind: 'download', icon: 'folder-download-symbolic',
                            title: partial ? 'Downloading' : 'Saved to Downloads',
                            detail: partial && Number.isFinite(bytes)
                                ? `${displayName} · ${formatBytes(bytes)} received`
                                : displayName,
                            // Sizes are real bytes received; the overall percent
                            // is unknown without browser download APIs.
                            duration: 3400,
                        });
                    };
                    if (!partial) {
                        preview(null);
                        return;
                    }
                    // Read metadata asynchronously, never block GNOME Shell.
                    file.query_info_async(
                        'standard::size', Gio.FileQueryInfoFlags.NONE,
                        GLib.PRIORITY_DEFAULT, this._cancellable,
                        (handle, result) => {
                            try {
                                const info = handle.query_info_finish(result);
                                preview(Number(info.get_size()));
                            } catch (_error) {
                                preview(null);
                            }
                        }
                    );
                }
            );
        } catch (_error) {
            // Missing folder or unsupported Gio monitoring; optional feature.
        }
    }

    _poll() {
        if (this._disposed)
            return;
        this._pollVolume();
        this._pollRecording();
        if (++this._pollCount % 2 === 0)
            void this._pollBrightness();
    }

    _pollVolume() {
        try {
            const quick = Main.panel?.statusArea?.quickSettings;
            const slider = quick?._volumeOutput?._output ??
                quick?._volume?._output;
            const stream = slider?._stream;
            if (!stream)
                return;
            const raw = Number(stream.volume ?? stream.get_volume?.());
            const muted = Boolean(stream.is_muted ?? stream.get_is_muted?.());
            const level = muted ? 0 : percentage(raw, 0, 65536);
            if (level === null)
                return;
            const was = this._lastVolume;
            this._lastVolume = level;
            if (was !== null && level !== was &&
                this._settings.get_boolean('show-volume'))
                this._onPreview({
                    kind: 'volume', icon: muted ? 'audio-volume-muted-symbolic'
                        : 'audio-volume-high-symbolic',
                    title: 'Volume', detail: `${level}%`, percent: level, duration: 1900,
                });
        } catch (_error) {
            // Quick Settings private interfaces vary by GNOME version.
        }
    }

    _pollRecording() {
        try {
            const recording = Boolean(Main.screenshotUI?.screencast_in_progress);
            if (recording !== this._lastRecording) {
                this._lastRecording = recording;
                this._onRecording(recording);
            }
        } catch (_error) {
            // Native GNOME screencast indicator not available.
        }
    }

    async _pollBrightness() {
        if (this._brightnessPending || this._disposed ||
            !this._settings.get_boolean('show-brightness'))
            return;
        this._brightnessPending = true;
        try {
            const response = await Gio.DBus.session.call(
                'org.gnome.Mutter.DisplayConfig',
                '/org/gnome/Mutter/DisplayConfig',
                'org.freedesktop.DBus.Properties',
                'Get',
                new GLib.Variant('(ss)', [
                    'org.gnome.Mutter.DisplayConfig', 'Backlight',
                ]),
                new GLib.VariantType('(v)'),
                Gio.DBusCallFlags.NONE,
                1600,
                this._cancellable
            );
            if (this._disposed)
                return;
            const variant = response.get_child_value(0).get_variant();
            const tuple = variant.deepUnpack();
            const entries = tuple[1] ?? [];
            for (const item of entries) {
                const props = item ?? {};
                const value = key => {
                    const v = props[key];
                    return v?.deepUnpack?.() ?? v?.recursiveUnpack?.() ?? v;
                };
                if (value('active') === false)
                    continue;
                const level = percentage(
                    Number(value('value')), Number(value('min')),
                    Number(value('max'))
                );
                if (level === null)
                    continue;
                const old = this._lastBrightness;
                this._lastBrightness = level;
                if (old !== null && level !== old)
                    this._onPreview({
                        kind: 'brightness', icon: 'display-brightness-symbolic',
                        title: 'Brightness', detail: `${level}%`, percent: level,
                        duration: 1900,
                    });
                break;
            }
        } catch (_error) {
            // External monitors and older GNOME releases may not expose Backlight.
        } finally {
            this._brightnessPending = false;
        }
    }

    destroy() {
        this._disposed = true;
        this._cancellable.cancel();
        if (this._pollId) {
            GLib.Source.remove(this._pollId);
            this._pollId = 0;
        }
        for (const [object, id] of this._signals) {
            try { object.disconnect(id); } catch (_error) {}
        }
        this._signals = [];
        for (const [source, id] of this._sources) {
            try { source.disconnect(id); } catch (_error) {}
        }
        this._sources.clear();
        if (this._downloadMonitor) {
            try {
                this._downloadMonitor.disconnect(this._downloadSignal);
                this._downloadMonitor.cancel();
            } catch (_error) {}
            this._downloadMonitor = null;
        }
    }
}
