import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {backlightLevel, formatBytes, isPartialDownload, percentage, safeTitle} from './activity-utils.js';

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
        this._volumeStream = null;
        this._volumeSignals = [];
        this._backlightSubscription = 0;
        this._lastRecording = false;
        this._brightnessPending = false;
        this._pollCount = 0;
        this._recentDownload = '';
        this._lastDownloadTime = 0;
    }

    start() {
        this._watchNotifications();
        this._watchDownloads();
        this._connectVolumeStream();
        // Mutter pushes brightness property changes immediately; periodic
        // reads remain as a fallback for compositor/driver variations.
        this._backlightSubscription = Gio.DBus.session.signal_subscribe(
            'org.gnome.Mutter.DisplayConfig',
            'org.freedesktop.DBus.Properties',
            'PropertiesChanged',
            '/org/gnome/Mutter/DisplayConfig',
            'org.gnome.Mutter.DisplayConfig',
            Gio.DBusSignalFlags.NONE,
            (_bus, _sender, _path, _iface, _signal, params) => {
                const [iface, changed] = params.recursiveUnpack();
                if (iface === 'org.gnome.Mutter.DisplayConfig' &&
                    Object.prototype.hasOwnProperty.call(changed, 'Backlight'))
                    void this._pollBrightness();
            }
        );
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
            // WATCH_MOVES is essential: browsers finalize .part/.crdownload by rename.
            this._downloadMonitor = directory.monitor_directory(
                Gio.FileMonitorFlags.WATCH_MOVES, this._cancellable
            );
            this._downloadStarts = new Map();
            this._lastDownloadKind = '';
            this._downloadSignal = this._downloadMonitor.connect(
                'changed', (_monitor, file, otherFile, event) => {
                    if (this._disposed ||
                        !this._settings.get_boolean('show-downloads'))
                        return;

                    const oldName = safeTitle(file?.get_basename() ?? '');
                    const renamed = event === Gio.FileMonitorEvent.RENAMED;
                    const name = safeTitle((renamed && otherFile
                        ? otherFile : file)?.get_basename() ?? '');
                    if (!name)
                        return;
                    const partial = isPartialDownload(name);
                    const oldPartial = isPartialDownload(oldName);
                    const isPartialUpdate = partial && (
                        event === Gio.FileMonitorEvent.CREATED ||
                        event === Gio.FileMonitorEvent.CHANGED ||
                        event === Gio.FileMonitorEvent.MOVED_IN
                    );
                    const isFinishedRename = renamed && oldPartial && !partial;
                    const base = partial
                        ? name.replace(/\.(crdownload|part|download)$/i, '')
                        : name;
                    const now = GLib.get_monotonic_time();

                    if (isPartialUpdate)
                        this._downloadStarts.set(base, now);
                    // Explicit rename or a finalized path matching a known
                    // temporary name: reliable download-completion evidence.
                    const isFinishedCreate = !partial &&
                        this._downloadStarts.has(name) &&
                        (event === Gio.FileMonitorEvent.CREATED ||
                            event === Gio.FileMonitorEvent.MOVED_IN ||
                            event === Gio.FileMonitorEvent.CHANGES_DONE_HINT);
                    const complete = isFinishedRename || isFinishedCreate;
                    const isSavedFile = !partial && !complete &&
                        (event === Gio.FileMonitorEvent.MOVED_IN ||
                            event === Gio.FileMonitorEvent.CREATED);
                    if (!isPartialUpdate && !complete && !isSavedFile)
                        return;

                    if (complete) {
                        this._downloadStarts.delete(name);
                        if (oldPartial)
                            this._downloadStarts.delete(
                                oldName.replace(/\.(crdownload|part|download)$/i, '')
                            );
                    }
                    const kind = complete ? 'complete' :
                        isPartialUpdate ? 'active' : 'saved';
                    const key = kind + ':' + name;
                    if (this._lastDownloadKind === key &&
                        now - this._lastDownloadTime < 2500000)
                        return;
                    this._lastDownloadKind = key;
                    this._lastDownloadTime = now;

                    const shownName = safeTitle(base, 38);
                    const report = bytes => {
                        if (this._disposed)
                            return;
                        this._onPreview({
                            kind: 'download',
                            icon: complete ? 'emblem-ok-symbolic'
                                : 'folder-download-symbolic',
                            title: complete ? 'Download complete' :
                                partial ? 'Downloading' : 'Saved to Downloads',
                            detail: partial && Number.isFinite(bytes)
                                ? shownName + ' · ' + formatBytes(bytes) + ' received'
                                : shownName,
                            duration: complete ? 4500 : 3000,
                        });
                    };
                    if (!partial) {
                        report(null);
                        return;
                    }
                    file.query_info_async(
                        'standard::size', Gio.FileQueryInfoFlags.NONE,
                        GLib.PRIORITY_DEFAULT, this._cancellable,
                        (handle, result) => {
                            try {
                                const info = handle.query_info_finish(result);
                                report(Number(info.get_size()));
                            } catch (_error) {
                                report(null);
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
        this._connectVolumeStream();
        this._pollVolume();
        this._pollRecording();
        if (++this._pollCount % 2 === 0)
            void this._pollBrightness();
    }

    _connectVolumeStream() {
        let stream;
        try {
            const quick = Main.panel?.statusArea?.quickSettings;
            const slider = quick?._volumeOutput?._output ??
                quick?._volume?._output;
            stream = slider?._stream ?? null;
        } catch (_error) {
            stream = null;
        }
        if (stream === this._volumeStream)
            return;
        this._disconnectVolumeStream();
        this._volumeStream = stream;
        this._lastVolume = null;
        if (!stream)
            return;
        // Prefer signal-based updates: the old 1100ms poll caused a laggy OSD.
        for (const signal of ['notify::volume', 'notify::is-muted']) {
            try {
                const id = stream.connect(signal, () => this._pollVolume());
                this._volumeSignals.push(id);
            } catch (_error) {
                // Property names vary across mixer implementations.
            }
        }
        this._pollVolume();
    }

    _disconnectVolumeStream() {
        if (this._volumeStream) {
            for (const id of this._volumeSignals) {
                try {
                    this._volumeStream.disconnect(id);
                } catch (_error) {}
            }
        }
        this._volumeSignals = [];
        this._volumeStream = null;
    }

    _pollVolume() {
        try {
            const stream = this._volumeStream;
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
                    kind: 'volume',
                    icon: muted ? 'audio-volume-muted-symbolic'
                        : 'audio-volume-high-symbolic',
                    title: 'Volume',
                    detail: String(level) + '%',
                    percent: level,
                    duration: 1600,
                });
        } catch (_error) {
            // User's mixer implementation may not expose the stream.
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
            const payload = response.get_child_value(0).get_variant().recursiveUnpack();
            const level = backlightLevel(payload);
            if (level !== null) {
                const old = this._lastBrightness;
                this._lastBrightness = level;
                if (old !== null && old !== level)
                    this._onPreview({
                        kind: 'brightness',
                        icon: 'display-brightness-symbolic',
                        title: 'Brightness',
                        detail: String(level) + '%',
                        percent: level,
                        duration: 1600,
                    });
            }
        } catch (_error) {
            // External monitors and older GNOME releases may not expose Backlight.
        } finally {
            this._brightnessPending = false;
        }
    }

    destroy() {
        this._disposed = true;
        this._disconnectVolumeStream();
        if (this._backlightSubscription) {
            Gio.DBus.session.signal_unsubscribe(this._backlightSubscription);
            this._backlightSubscription = 0;
        }
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
