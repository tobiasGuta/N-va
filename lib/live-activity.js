import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {developerActivity} from './activity-protocol.js';

export const BUS_NAME = 'org.gnome.Shell.Extensions.Nova';
export const OBJECT_PATH = '/org/gnome/Shell/Extensions/Nova';
export const INTERFACE = 'org.gnome.Shell.Extensions.Nova1';

const INTERFACE_XML = `<node>
    <interface name="${INTERFACE}">
        <method name="Show">
            <arg type="s" name="title" direction="in"/>
            <arg type="s" name="detail" direction="in"/>
            <arg type="i" name="percent" direction="in"/>
            <arg type="u" name="durationMs" direction="in"/>
        </method>
    </interface>
</node>`;

// Opt-in Linux desktop integration. Other same-user session applications can
// send a short activity without spawning anything from GNOME Shell. It does
// not expose files, the clipboard, or arbitrary app-controlled icons.
export class LiveActivityService {
    constructor(onActivity) {
        this._onActivity = onActivity;
        this._ownerId = 0;
        this._exported = null;
        this._disposed = false;
        this._lastShownUs = 0;
    }

    start() {
        if (this._disposed || this._ownerId)
            return;
        this._ownerId = Gio.bus_own_name(
            Gio.BusType.SESSION,
            BUS_NAME,
            Gio.BusNameOwnerFlags.NONE,
            connection => {
                if (this._disposed)
                    return;
                try {
                    this._exported = Gio.DBusExportedObject.wrapJSObject(
                        INTERFACE_XML, this
                    );
                    this._exported.export(connection, OBJECT_PATH);
                } catch (error) {
                    console.warn('Nova: could not export activity API: ' +
                        error.message);
                }
            },
            () => {},
            () => {
                // Another instance may own the name; Nova still works
                // without its optional developer API.
            }
        );
    }

    Show(title, detail, percent, durationMs) {
        if (this._disposed)
            return;
        const activity = developerActivity(title, detail, percent, durationMs);
        if (!activity)
            return;
        const now = GLib.get_monotonic_time();
        if (now - this._lastShownUs < 350000)
            return;
        this._lastShownUs = now;
        this._onActivity?.(activity);
    }

    destroy() {
        this._disposed = true;
        if (this._exported) {
            this._exported.unexport();
            this._exported = null;
        }
        if (this._ownerId) {
            Gio.bus_unown_name(this._ownerId);
            this._ownerId = 0;
        }
        this._onActivity = null;
    }
}
