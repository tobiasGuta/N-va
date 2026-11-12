import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const extension = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');

test('St.BoxLayout spacing is CSS, not a removed GObject property', () => {
    // GNOME Shell St.BoxLayout has orientation but no spacing constructor
    // property; assigning spacing directly breaks extension enable().
    assert.doesNotMatch(extension, /\bspacing:\s*\d+\s*,/);
    assert.match(extension, /style: 'spacing: 8px;'/);
});

test('Nova draws its capsule background even with external Shell themes', () => {
    assert.match(extension, /background-color: #050608/);
    assert.match(extension, /border-radius: 21px/);
});

test('floating bar does not remove the GNOME panel or its controls', () => {
    assert.match(extension, /Main\.panel\.add_style_class_name\('nova-floating-panel'\)/);
    assert.match(extension, /Main\.panel\.remove_style_class_name\('nova-floating-panel'\)/);
    assert.doesNotMatch(extension, /Main\.panel\.hide\(/);
});

test('clock and music modes have independent expanded layouts', () => {
    assert.match(extension, /_buildCalendar\(\)/);
    assert.match(extension, /this\._musicView\.visible = playing/);
    assert.match(extension, /this\._calendarView\.visible = !playing/);
});

test('never connects to unsupported Main.panel allocation-changed signal', () => {
    assert.doesNotMatch(extension,
        /Main\.panel\.connect\(\s*['"]allocation-changed['"]/);
    assert.match(extension, /'monitors-changed'/);
});

test('enable failure rolls back panel and clock changes', () => {
    assert.match(extension, /this\._enable\(\)/);
    assert.match(extension, /this\.disable\(\)/);
    assert.match(extension, /this\._oldPanelStyle/);
});
