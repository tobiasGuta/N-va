import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {choosePlayer, normalizePlayer} from './player.js';

const BUS = Gio.DBus.session;
const PLAYER_PREFIX = 'org.mpris.MediaPlayer2.';
const OBJECT_PATH = '/org/mpris/MediaPlayer2';
const PLAYER_INTERFACE = 'org.mpris.MediaPlayer2.Player';
const DBUS_INTERFACE = 'org.freedesktop.DBus';
const PROPERTIES_INTERFACE = 'org.freedesktop.DBus.Properties';
const CALL_TIMEOUT_MS = 2000;

export class MprisService {
    constructor(onChange) {
        this._onChange = onChange;
        this._selected = null;
        this._cancellable = new Gio.Cancellable();
        this._subscriptions = [];
        this._refreshSource = 0;
        this._pollSource = 0;
        this._disposed = false;
        this._refreshing = false;
        this._refreshAgain = false;
    }

    start() {
        this._subscriptions.push(BUS.signal_subscribe(
            DBUS_INTERFACE,
            DBUS_INTERFACE,
            'NameOwnerChanged',
            '/org/freedesktop/DBus',
            null,
            Gio.DBusSignalFlags.NONE,
            (_bus, _sender, _path, _iface, _signal, params) => {
                const [name] = params.recursiveUnpack();
                if (name.startsWith(PLAYER_PREFIX))
                    this.scheduleRefresh();
            }
        ));

        this._subscriptions.push(BUS.signal_subscribe(
            null,
            PROPERTIES_INTERFACE,
            'PropertiesChanged',
            OBJECT_PATH,
            PLAYER_INTERFACE,
            Gio.DBusSignalFlags.NONE,
            () => this.scheduleRefresh()
        ));

        // Fallback for players that don't reliably emit property changes.
        this._pollSource = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 12, () => {
                this.scheduleRefresh();
                return GLib.SOURCE_CONTINUE;
            }
        );
        this.scheduleRefresh();
    }

    scheduleRefresh() {
        if (this._disposed || this._refreshSource)
            return;

        this._refreshSource = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, 120, () => {
                this._refreshSource = 0;
                void this.refresh();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    async refresh() {
        if (this._disposed)
            return;
        if (this._refreshing) {
            this._refreshAgain = true;
            return;
        }

        this._refreshing = true;

        try {
            const reply = await BUS.call(
                DBUS_INTERFACE,
                '/org/freedesktop/DBus',
                DBUS_INTERFACE,
                'ListNames',
                null,
                new GLib.VariantType('(as)'),
                Gio.DBusCallFlags.NONE,
                CALL_TIMEOUT_MS,
                this._cancellable
            );

            const [names] = reply.recursiveUnpack();
            const matches = names.filter(name => name.startsWith(PLAYER_PREFIX));
            const players = (await Promise.all(matches.map(name =>
                this._readPlayer(name)))).filter(Boolean);

            if (!this._disposed) {
                this._selected = choosePlayer(players, this._selected?.name);
                this._onChange(this._selected);
            }
        } catch (error) {
            if (!this._disposed && !this._cancellable.is_cancelled())
                console.warn('Nova: unable to read MPRIS players: ' + error.message);
        } finally {
            this._refreshing = false;
            if (this._refreshAgain && !this._disposed) {
                this._refreshAgain = false;
                this.scheduleRefresh();
            }
        }
    }

    async _readPlayer(name) {
        try {
            const reply = await BUS.call(
                name,
                OBJECT_PATH,
                PROPERTIES_INTERFACE,
                'GetAll',
                new GLib.Variant('(s)', [PLAYER_INTERFACE]),
                new GLib.VariantType('(a{sv})'),
                Gio.DBusCallFlags.NONE,
                CALL_TIMEOUT_MS,
                this._cancellable
            );

            const [properties] = reply.recursiveUnpack();
            return normalizePlayer(name, properties);
        } catch (_error) {
            // Players can disappear between ListNames and GetAll.
            return null;
        }
    }

    control(action) {
        const player = this._selected;
        const methods = {
            toggle: 'PlayPause',
            next: 'Next',
            previous: 'Previous',
        };
        const method = methods[action];

        if (this._disposed || !player || !method)
            return;
        if (action === 'toggle' && !player.canToggle)
            return;
        if (action === 'next' && !player.canNext)
            return;
        if (action === 'previous' && !player.canPrevious)
            return;

        void BUS.call(
            player.name,
            OBJECT_PATH,
            PLAYER_INTERFACE,
            method,
            null,
            null,
            Gio.DBusCallFlags.NONE,
            CALL_TIMEOUT_MS,
            this._cancellable
        ).then(() => this.scheduleRefresh()).catch(error => {
            if (!this._disposed && !this._cancellable.is_cancelled())
                console.warn('Nova: MPRIS command failed: ' + error.message);
        });
    }

    destroy() {
        this._disposed = true;
        this._cancellable.cancel();

        if (this._refreshSource) {
            GLib.Source.remove(this._refreshSource);
            this._refreshSource = 0;
        }
        if (this._pollSource) {
            GLib.Source.remove(this._pollSource);
            this._pollSource = 0;
        }
        for (const id of this._subscriptions)
            BUS.signal_unsubscribe(id);

        this._subscriptions = [];
        this._selected = null;
        this._onChange = null;
    }
}
