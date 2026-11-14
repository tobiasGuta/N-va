import test from 'node:test';
import assert from 'node:assert/strict';
import {PrivacyMonitor} from '../lib/privacy-monitor.js';

class ShellObject {
    constructor(properties) {
        Object.assign(this, properties);
        this.handlers = new Map();
        this.nextId = 1;
    }

    connect(signal, callback) {
        const id = this.nextId++;
        this.handlers.set(id, {signal, callback});
        return id;
    }

    disconnect(id) {
        assert.ok(this.handlers.delete(id));
    }

    emit(signal) {
        for (const handler of this.handlers.values()) {
            if (handler.signal === signal)
                handler.callback();
        }
    }
}

test('privacy state follows Shell visibility, system mute, and session lock', () => {
    const camera = new ShellObject({visible: true});
    const microphone = new ShellObject({visible: true, stream: {is_muted: false}});
    const location = new ShellObject({visible: false});
    const sharing = new ShellObject({visible: false});
    const session = new ShellObject({isLocked: false});
    const states = [];
    const monitor = new PrivacyMonitor({
        quickSettings: {
            _camera: {_indicator: camera},
            _volumeInput: {_input: microphone},
            _location: {_indicator: location},
        },
        screenSharing: sharing,
    }, session, state => states.push(state));

    monitor.start();
    assert.deepEqual(states.at(-1), {
        camera: true, microphone: true, location: false, screenSharing: false,
    });
    microphone.stream.is_muted = true;
    microphone.emit('stream-updated');
    assert.equal(states.at(-1).microphone, false);
    microphone.emit('stream-updated');
    assert.equal(states.length, 2);

    location.visible = true;
    location.emit('notify::visible');
    sharing.visible = true;
    sharing.emit('notify::visible');
    assert.deepEqual(states.at(-1), {
        camera: true, microphone: false, location: true, screenSharing: true,
    });

    session.isLocked = true;
    session.emit('updated');
    assert.deepEqual(states.at(-1), {
        camera: false, microphone: false, location: false, screenSharing: false,
    });
    session.isLocked = false;
    session.emit('updated');
    assert.deepEqual(states.at(-1), states.at(-3));

    monitor.destroy();
    for (const source of [camera, microphone, location, sharing, session])
        assert.equal(source.handlers.size, 0);
});

test('missing Shell sources can coexist with available indicators', () => {
    const location = new ShellObject({visible: true});
    const states = [];
    const monitor = new PrivacyMonitor({
        quickSettings: {_location: {_indicator: location}},
    }, undefined, state => states.push(state));
    monitor.start();
    assert.deepEqual(states, [{
        camera: false, microphone: false, location: true, screenSharing: false,
    }]);
    monitor.destroy();
});
