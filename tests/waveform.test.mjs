import test from 'node:test';
import assert from 'node:assert/strict';
import {waveFrame} from '../lib/waveform.js';

test('sparse visualizer frames are bounded and repeat', () => {
    for (let i = 0; i < 24; i++) {
        const frame = waveFrame(i);
        assert.equal(frame.length, 4);
        assert.ok(frame.every(value => value >= 3 && value <= 13));
        assert.deepEqual(frame, waveFrame(i + 8));
    }
});
