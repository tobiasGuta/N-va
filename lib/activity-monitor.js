import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import {DownloadsMonitor} from './downloads.js';
import {notificationPreview} from './notification-preview.js';

import {backlightLevel, percentage} from './activity-utils.js';

// No subprocesses or global notification-daemon replacement.
// Ordinary GNOME banner acknowledgement is optional and leaves notification
// history intact; unsupported integration points fail open to GNOME.
export class ActivityMonitor {
    constructor(settings, onPreview, onRecording) {
        this._settings = settings;
        this._onPreview = onPreview;
        this._onRecording = onRecording;
        this._signals = [];
        this._sources = new Map();
        this._pollId = 0;
        this._downloads = null;
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
                if (this._disposed || !this._settings.get_boolean('show-notifications') ||
                    Main.messageTray.bannerBlocked || Main.messageTray._bannerBlocked)
                    return;
                const preview = notificationPreview(notification, source);
                if (!preview)
                    return;
                preview.gicon = this._notificationIcon(notification, source);
                // The UI returns false if it is hidden, locked or its bounded
                // queue is full. Never suppress GNOME when Nova cannot preview.
                const accepted = this._onPreview(preview) === true;
                // The notification stays in GNOME history; keep critical alerts
                // native, and fail open if Nova could not accept the preview.
                if (accepted && this._settings.get_boolean('replace-native-notifications') &&
                    notification.urgency !== MessageTray.Urgency.CRITICAL)
                    notification.acknowledged = true;
            });
            this._sources.set(source, id);
        } catch (_error) {
            // No source-level notification signal on this Shell version.
        }
    }

    _notificationIcon(notification, source) {
        // GNOME 49–51 exposes icons through slightly different fields.
        // Use only actual Gio.Icons; never load a URL named by the sender.
        const candidates = [
            notification?.gicon,
            notification?.icon,
            source?.icon,
        ];
        try {
            candidates.push(source?.app?.get_icon?.());
        } catch (_error) {}
        try {
            candidates.push(source?.app?.get_app_info?.()?.get_icon?.());
        } catch (_error) {}
        try {
            candidates.push(source?._app?.get_icon?.());
        } catch (_error) {}
        for (const candidate of candidates) {
            try {
                if (candidate instanceof Gio.Icon)
                    return candidate;
            } catch (_error) {}
        }
        return null;
    }

    _watchDownloads() {
        this._downloads = new DownloadsMonitor(
            this._settings,
            activity => this._onPreview(activity)
        );
        this._downloads.start();
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
        this._downloads?.destroy();
        this._downloads = null;
    }
}
