import test from 'node:test';
import assert from 'node:assert/strict';
import {osdPreview} from '../lib/osd-utils.js';

test('native GNOME OSD level is shown directly in Nova', () => {
    assert.equal(osdPreview('audio-volume-high-symbolic', 0.76).percent, 76);
    assert.equal(osdPreview('display-brightness-symbolic', 0.75).percent, 75);
    assert.equal(osdPreview('audio-volume-muted-symbolic', null).percent, 0);
});

test('unrelated GNOME overlays remain native', () => {
    assert.equal(osdPreview('input-keyboard-symbolic', 0.5), null);
    assert.equal(osdPreview('audio-input-microphone-muted-symbolic', 0.5), null);
    assert.equal(osdPreview('display-brightness-symbolic', null), null);
});

test('out of range OSD values are bounded safely', () => {
    assert.equal(osdPreview('audio-volume-high-symbolic', 0.75, 1.5).percent, 50);
    assert.equal(osdPreview('display-brightness-symbolic', null, 1, 35).percent, 35);
});
