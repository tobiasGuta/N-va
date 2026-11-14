// Follow Shell's existing indicators so Nova shares their detection coverage
// and can read the current state even when enabled during an ongoing session.
export class PrivacyMonitor {
    constructor(statusArea, sessionMode, onChanged) {
        const quick = statusArea?.quickSettings;
        this._camera = quick?._camera?._indicator;
        this._microphone = quick?._volumeInput?._input;
        this._location = quick?._location?._indicator;
        this._screenSharing = statusArea?.screenSharing;
        this._sessionMode = sessionMode;
        this._onChanged = onChanged;
        this._signals = [];
        this._state = null;
    }

    start() {
        const watch = (object, signal) => {
            if (!object?.connect)
                return;
            try {
                const id = object.connect(signal, () => this._sync());
                this._signals.push([object, id]);
            } catch (error) {
                console.debug(`Nova: privacy signal unavailable (${signal}): ${error.message}`);
            }
        };
        watch(this._camera, 'notify::visible');
        watch(this._microphone, 'notify::visible');
        watch(this._microphone, 'stream-updated');
        watch(this._location, 'notify::visible');
        watch(this._screenSharing, 'notify::visible');
        watch(this._sessionMode, 'updated');
        this._sync();
    }

    _sync() {
        const unlocked = !this._sessionMode?.isLocked;
        const state = {
            camera: unlocked && this._camera?.visible === true,
            microphone: unlocked && this._microphone?.visible === true &&
                this._microphone.stream?.is_muted === false,
            location: unlocked && this._location?.visible === true,
            screenSharing: unlocked && this._screenSharing?.visible === true,
        };
        if (this._state && Object.keys(state).every(key => state[key] === this._state[key]))
            return;

        this._state = state;
        this._onChanged(state);
    }

    destroy() {
        for (const [object, id] of this._signals.splice(0))
            object.disconnect(id);
    }
}
