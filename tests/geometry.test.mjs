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
    assert.equal(expanded.height, 136);
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
    assert.deepEqual(geometry, {x: 22, y: 23, width: 256, height: 136});
});

test('calendar expands downward without shifting its centered anchor', () => {
    const panel = {x: 0, y: 0, width: 1648, height: 28};
    const compact = getIslandGeometry(panel, panel, false, 'clock');
    const calendar = getIslandGeometry(panel, panel, true, 'clock');
    assert.equal(calendar.height, 354);
    assert.equal(calendar.y, compact.y);
    assert.equal(calendar.x + calendar.width / 2,
        compact.x + compact.width / 2);
});

test('configurable pill dimensions respect user preferences', () => {
    const panel = {x: 0, y: 0, width: 1800, height: 28};
    const options = {compactWidth: 188, expandedWidth: 380};
    assert.equal(getIslandGeometry(panel, panel, false, 'clock', options).width, 188);
    assert.equal(getIslandGeometry(panel, panel, true, 'clock', options).width, 380);
});

test('non-progress activity cards are shorter than percentage OSD cards', () => {
    const panel = {x: 0, y: 0, width: 1648, height: 28};
    const simple = getIslandGeometry(panel, panel, true, 'activity-simple');
    const percent = getIslandGeometry(panel, panel, true, 'activity');
    assert.equal(simple.height, 86);
    assert.equal(percent.height, 124);
    assert.equal(simple.x + simple.width / 2, percent.x + percent.width / 2);
});

test('monitor anchoring matches a standard panel in every presentation', () => {
    const monitor = {x: 1280, y: 96, width: 1920, height: 1080};
    const panel = {...monitor, height: 32};
    for (const mode of ['clock', 'music', 'activity', 'activity-simple', 'notification', 'history']) {
        for (const expanded of [false, true]) {
            assert.deepEqual(
                getIslandGeometry({height: panel.height}, monitor, expanded, mode),
                getIslandGeometry(panel, monitor, expanded, mode)
            );
        }
    }
});

test('monitor anchoring uses logical coordinates and the current panel height', () => {
    // A 2880px-wide output takes 2880, 2304 or 1440 logical units at
    // 100%, 125% or 200%, respectively. Primary display origins can change.
    for (const {x, y, width, scale, panelHeight, compactHeight, inset} of [
        {x: 0, y: 0, width: 2880, scale: 1, panelHeight: 28, compactHeight: 22, inset: 3},
        {x: 640, y: 480, width: 2304, scale: 1.25, panelHeight: 34, compactHeight: 26, inset: 4},
        {x: 1920, y: 72, width: 1440, scale: 2, panelHeight: 44, compactHeight: 32, inset: 6},
    ]) {
        const primary = {x, y, width, geometry_scale: scale};
        const panel = {height: panelHeight};
        assert.deepEqual(getIslandGeometry(panel, primary), {
            x: x + width / 2 - 83, y: y + inset, width: 166, height: compactHeight,
        });
        assert.deepEqual(getIslandGeometry(panel, primary, true, 'clock'), {
            x: x + width / 2 - 164, y: y + inset, width: 328, height: 354,
        });
    }
});

test('panel-relative placement still accepts translated panel coordinates', () => {
    const primary = {x: 1280, y: 96, width: 1920, height: 1080};
    const panel = {x: 1300, y: 68, width: 1600, height: 28};
    const compact = getIslandGeometry(panel, primary);
    const expanded = getIslandGeometry(panel, primary, true, 'clock');
    assert.deepEqual(compact, {x: 2017, y: 71, width: 166, height: 22});
    assert.deepEqual(expanded, {x: 1936, y: 71, width: 328, height: 354});
});
