import GLib from 'gi://GLib';
import {NotificationDestroyedReason} from 'resource:///org/gnome/shell/ui/messageTray.js';

import {notificationPreview} from './notification-preview.js';

const HISTORY_LIMIT = 50;

// Observe the tray only while the history is open. GNOME owns the records.
export class NotificationHistory {
    constructor(tray, onChanged) {
        this._tray = tray;
        this._onChanged = onChanged;
        this._signals = [];
        this._entrySignals = new Map();
        this._refreshId = 0;
    }

    open() {
        const refresh = () => this._scheduleRefresh();
        this._watch(this._signals, this._tray, 'source-added', refresh);
        this._watch(this._signals, this._tray, 'source-removed', refresh);
        this._refresh();
    }

    close() {
        if (this._refreshId) {
            GLib.Source.remove(this._refreshId);
            this._refreshId = 0;
        }
        this._disconnectEntries();
        this._disconnect(this._signals);
    }

    _watch(signals, object, signal, callback) {
        try {
            signals.push([object, object.connect(signal, callback)]);
        } catch (error) {
            console.debug(`Nova: notification history signal unavailable (${signal}): ${error.message}`);
        }
    }

    _disconnect(signals) {
        for (const [object, id] of signals.splice(0))
            object.disconnect(id);
    }

    _watchEntry(object, names, refresh) {
        const signals = [];
        this._entrySignals.set(object, signals);
        // Shell disposes these objects immediately after emitting destroy.
        this._watch(signals, object, 'destroy', () => {
            this._entrySignals.delete(object);
            refresh();
        });
        for (const name of names)
            this._watch(signals, object, name, refresh);
    }

    _disconnectEntries() {
        for (const signals of this._entrySignals.values())
            this._disconnect(signals);
        this._entrySignals.clear();
    }

    _scheduleRefresh() {
        if (!this._refreshId) {
            this._refreshId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this._refreshId = 0;
                this._refresh();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _refresh() {
        this._disconnectEntries();
        const refresh = () => this._scheduleRefresh();
        const records = [];
        for (const source of this._tray?.getSources?.() ?? []) {
            this._watchEntry(source,
                ['notification-added', 'notification-removed', 'notify::title'], refresh);
            for (const notification of source.notifications ?? []) {
                // Shell updates datetime when a notification's content changes.
                this._watchEntry(notification, ['notify::datetime'], refresh);
                const preview = notificationPreview(notification, source);
                if (!preview)
                    continue;
                const datetime = notification.datetime;
                const timestamp = datetime
                    ? datetime.to_unix() * 1000 + datetime.get_microsecond() / 1000
                    : null;
                const dismiss = () => {
                    if (this._entrySignals.has(notification) &&
                        this._tray.contains(source) && source.notifications.includes(notification))
                        notification.destroy(NotificationDestroyedReason.DISMISSED);
                };
                records.push({...preview, timestamp, dismiss});
            }
        }
        records.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
        this._onChanged(records.slice(0, HISTORY_LIMIT));
    }
}
