import test from 'node:test';
import assert from 'node:assert/strict';

import {getIslandGeometry} from '../lib/geometry.js';

test('compact island fits within a short GNOME panel', () => {
    const panel = {x: 0, y: 0, width: 1648, height: 28};
    const geometry = getIslandGeometry(panel, panel, false);

    assert.deepEqual(geometry, {x: 741, y: 3, width: 166, height: 22});
    assert.ok(geometry.y >= panel.y);
    assert.ok(geometry.y + geometry.height <= panel.y + panel.height);
});

test('expanded mode retains the same top anchor and grows downward', () => {
    const panel = {x: 0, y: 0, width: 1648, height: 28};
    const compact = getIslandGeometry(panel, panel, false);
    const expanded = getIslandGeometry(panel, panel, true);
    assert.equal(compact.y, expanded.y);
    assert.equal(compact.x + compact.width / 2,
        expanded.x + expanded.width / 2);
    assert.equal(expanded.height, 124);
});

test('respects offset multi-monitor geometry and taller panels', () => {
    const panel = {x: 1920, y: 100, width: 2560, height: 42};
    const monitor = {x: 1920, y: 100, width: 2560, height: 1440};
    const geometry = getIslandGeometry(panel, monitor, false);
    assert.deepEqual(geometry, {x: 3117, y: 105, width: 166, height: 32});
});

test('limits island width on narrow screens', () => {
    const panel = {x: 10, y: 20, width: 280, height: 30};
    const monitor = {x: 10, y: 20, width: 280, height: 500};
    const geometry = getIslandGeometry(panel, monitor, true);
    assert.deepEqual(geometry, {x: 22, y: 23, width: 256, height: 124});
});

test('calendar expands downward without shifting its centered anchor', () => {
    const panel = {x: 0, y: 0, width: 1648, height: 28};
    const compact = getIslandGeometry(panel, panel, false, 'clock');
    const calendar = getIslandGeometry(panel, panel, true, 'clock');
    assert.equal(calendar.height, 316);
    assert.equal(calendar.y, compact.y);
    assert.equal(calendar.x + calendar.width / 2,
        compact.x + compact.width / 2);
});
