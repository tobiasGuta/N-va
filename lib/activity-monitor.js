import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

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
        this._brightnessSlider = null;
        this._brightnessSignal = 0;
        this._lastRecording = false;
        this._brightnessPending = false;
        this._pollCount = 0;
        this._recentDownload = '';
        this._lastDownloadTime = 0;
        this._completedDownloads = new Set();
        this._downloadCheckSources = new Set();
    }

    start() {
        this._watchNotifications();
        this._watchDownloads();
        this._connectVolumeStream();
        this._watchBrightnessSlider();
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
                    Main.messageTray.bannerBlocked || Main.messageTray._bannerBlocked)
                    return;
                const title = safeTitle(notification?.title);
                if (!title)
                    return;
                this._onPreview({
                    kind: 'notification', icon: 'mail-unread-symbolic',
                    title, detail: safeTitle(source.title || source.name || 'Notification'),
                    duration: 3200,
                });
                // Source.addNotification emits 'notification-added' before
                // 'notification-request-banner'. Acknowledge ONLY normal,
                // non-critical alerts when Nova is showing the preview.
                // The notification stays in the source/history; we do not
                // turn off GNOME notifications or patch Shell internals.
                if (this._settings.get_boolean('replace-native-notifications') &&
                    notification.urgency !== MessageTray.Urgency.CRITICAL)
                    notification.acknowledged = true;
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
                Gio.FileMonitorFlags.WATCH_MOVES, this._cancellable
            );
            this._downloadStarts = new Map();
            this._downloadSignal = this._downloadMonitor.connect(
                'changed', (_monitor, file, otherFile, event) => {
                    if (this._disposed ||
                        !this._settings.get_boolean('show-downloads'))
                        return;
                    const oldName = safeTitle(file?.get_basename() ?? '');
                    const newName = safeTitle(otherFile?.get_basename() ?? '');
                    const partial = isPartialDownload(oldName);
                    const base = partial
                        ? oldName.replace(/\.(crdownload|part|download)$/i, '')
                        : oldName;
                    const now = GLib.get_monotonic_time();

                    if (event === Gio.FileMonitorEvent.RENAMED &&
                        partial && newName && !isPartialDownload(newName)) {
                        this._downloadStarts.delete(base);
                        this._downloadCompleted(newName);
                        return;
                    }

                    // Firefox often creates the final path early, writes to
                    // filename.part, then deletes .part without renaming it.
                    if (partial && (event === Gio.FileMonitorEvent.DELETED ||
                        event === Gio.FileMonitorEvent.MOVED_OUT)) {
                        if (this._downloadStarts.has(base))
                            this._verifyDownloadFinished(file.get_parent(), base);
                        return;
                    }

                    if (partial && [
                        Gio.FileMonitorEvent.CREATED,
                        Gio.FileMonitorEvent.CHANGED,
                        Gio.FileMonitorEvent.MOVED_IN,
                    ].includes(event)) {
                        this._downloadStarts.set(base, now);
                        // Completion must not be overwritten by a late async
                        // size lookup from the previous file.
                        if (this._completedDownloads.has(base))
                            return;
                        const key = 'active:' + oldName;
                        if (this._recentDownload === key &&
                            now - this._lastDownloadTime < 2300000)
                            return;
                        this._recentDownload = key;
                        this._lastDownloadTime = now;
                        file.query_info_async('standard::size',
                            Gio.FileQueryInfoFlags.NONE,
                            GLib.PRIORITY_DEFAULT, this._cancellable,
                            (handle, result) => {
                                if (this._disposed ||
                                    this._completedDownloads.has(base))
                                    return;
                                let bytes = null;
                                try {
                                    bytes = Number(handle.query_info_finish(result).get_size());
                                } catch (_error) {}
                                this._onPreview({
                                    kind: 'download',
                                    icon: 'folder-download-symbolic',
                                    title: 'Downloading',
                                    detail: safeTitle(base, 38) +
                                        (bytes !== null
                                            ? ' · ' + formatBytes(bytes) + ' received'
                                            : ''),
                                    duration: 3000,
                                });
                            });
                        return;
                    }

                    if (!partial && this._downloadStarts.has(oldName) &&
                        (event === Gio.FileMonitorEvent.MOVED_IN ||
                            event === Gio.FileMonitorEvent.CHANGES_DONE_HINT)) {
                        // Some backends report only final-file events.
                        this._verifyDownloadFinished(file.get_parent(), oldName);
                    }
                }
            );
        } catch (_error) {
            // Unsupported folder or file-monitor backend.
        }
    }

    _verifyDownloadFinished(folder, basename) {
        if (this._disposed || this._completedDownloads.has(basename))
            return;
        const source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 450, () => {
            this._downloadCheckSources.delete(source);
            if (this._disposed || this._completedDownloads.has(basename))
                return GLib.SOURCE_REMOVE;
            const file = folder.get_child(basename);
            file.query_info_async('standard::type,standard::size',
                Gio.FileQueryInfoFlags.NONE,
                GLib.PRIORITY_DEFAULT, this._cancellable,
                (handle, result) => {
                    if (this._disposed || this._completedDownloads.has(basename))
                        return;
                    try {
                        const info = handle.query_info_finish(result);
                        if (info.get_file_type() === Gio.FileType.REGULAR &&
                            Number(info.get_size()) > 0) {
                            this._downloadStarts.delete(basename);
                            this._downloadCompleted(basename);
                        }
                    } catch (_error) {
                        // A canceled or unfinished file is not confirmed.
                    }
                });
            return GLib.SOURCE_REMOVE;
        });
        this._downloadCheckSources.add(source);
    }

    _downloadCompleted(basename) {
        if (this._disposed || this._completedDownloads.has(basename))
            return;
        this._completedDownloads.add(basename);
        this._onPreview({
            kind: 'download',
            icon: 'emblem-ok-symbolic',
            title: 'Download complete',
            detail: safeTitle(basename, 43),
            duration: 4200,
        });
    }

    _poll() {
        if (this._disposed)
            return;
        this._connectVolumeStream();
        this._pollVolume();
        this._watchBrightnessSlider();
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

    _watchBrightnessSlider() {
        let slider = null;
        try {
            const indicator = Main.panel?.statusArea?.quickSettings?._brightness;
            for (const item of [
                indicator?._slider, indicator?.quickSettingsItems?.[0],
                indicator?.slider,
            ]) {
                const candidate = item?.slider ?? item?._slider ?? item;
                if (Number.isFinite(Number(candidate?.value))) {
                    slider = candidate;
                    break;
                }
            }
        } catch (_error) {}
        if (slider === this._brightnessSlider)
            return;
        if (this._brightnessSlider && this._brightnessSignal) {
            try { this._brightnessSlider.disconnect(this._brightnessSignal); }
            catch (_error) {}
        }
        this._brightnessSlider = slider;
        this._brightnessSignal = 0;
        if (!slider)
            return;
        const update = () => {
            const fraction = Number(slider.value);
            if (Number.isFinite(fraction) && fraction >= 0 && fraction <= 1)
                this._showBrightness(Math.round(fraction * 100));
        };
        try {
            this._brightnessSignal = slider.connect('notify::value', update);
        } catch (_error) {
            try {
                this._brightnessSignal = slider.connect('value-changed', update);
            } catch (_other) {}
        }
        update();
    }

    _showBrightness(level) {
        if (this._disposed || !this._settings.get_boolean('show-brightness'))
            return;
        const old = this._lastBrightness;
        this._lastBrightness = level;
        if (old !== null && level !== old)
            this._onPreview({
                kind: 'brightness', icon: 'display-brightness-symbolic',
                title: 'Brightness', detail: String(level) + '%',
                percent: level, duration: 1600,
            });
    }

    async _pollBrightness() {
        // GNOME's live slider is the display the user is controlling.
        // Polling a different Mutter backlight device would overwrite
        // 75% with e.g. 35%, even though actual brightness never changed.
        if (this._brightnessSlider &&
            Number.isFinite(Number(this._brightnessSlider.value)))
            return;
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
            if (level !== null)
                this._showBrightness(level);
        } catch (_error) {
            // External monitors and older GNOME releases may not expose Backlight.
        } finally {
            this._brightnessPending = false;
        }
    }

    destroy() {
        this._disposed = true;
        this._disconnectVolumeStream();
        if (this._brightnessSlider && this._brightnessSignal) {
            try { this._brightnessSlider.disconnect(this._brightnessSignal); }
            catch (_error) {}
        }
        this._brightnessSlider = null;
        this._brightnessSignal = 0;
        if (this._backlightSubscription) {
            Gio.DBus.session.signal_unsubscribe(this._backlightSubscription);
            this._backlightSubscription = 0;
        }
        this._cancellable.cancel();
        for (const source of this._downloadCheckSources) {
            GLib.Source.remove(source);
        }
        this._downloadCheckSources.clear();
        this._completedDownloads.clear();
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
