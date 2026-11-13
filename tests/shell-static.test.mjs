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
    assert.match(extension, /this\._musicView\.visible = !activity && playing/);
    assert.match(extension, /this\._calendarView\.visible = !activity && !playing/);
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

test('visualizer timers and artwork requests clean up on disable', () => {
    assert.match(extension, /this\._stopWave\(\)/);
    assert.match(extension, /this\._artLoader\?\.destroy\(\)/);
    assert.match(extension, /this\._updateArt\(/);
});

test('no visible PIN text remains in the island', () => {
    assert.doesNotMatch(extension, /label\(['"]PIN['"]/);
    assert.match(extension, /view-pin-symbolic/);
});

test('progress is rendered by a width-constrained fill inside a bar', () => {
    assert.match(extension, /_activityProgress\.add_child\(this\._activityBarFill\)/);
    assert.match(extension, /_activityBarFill\.width = hasPercent/);
    assert.match(extension, /Math\.round\(Math\.max\(0, Math\.min\(100, activity\.percent\)\)/);
});

test('Nova exposes preferences directly from the island', () => {
    assert.match(extension, /this\.openPreferences\(\)/);
    assert.match(extension, /emblem-system-symbolic/);
});

test('optional native OSD interception is reversible on disable', () => {
    assert.match(extension, /_syncNativeOsd\(\)/);
    assert.match(extension, /_restoreNativeOsd\(\)/);
    assert.match(extension, /this\._restoreNativeOsd\(\)/);
});

test('normal notifications can be acknowledged after Nova preview, critical alerts stay native', () => {
    const monitor = readFileSync(new URL('../lib/activity-monitor.js', import.meta.url), 'utf8');
    assert.match(monitor, /replace-native-notifications/);
    assert.match(monitor, /MessageTray\.Urgency\.CRITICAL/);
    assert.match(monitor, /notification\.acknowledged = true/);
    assert.doesNotMatch(monitor, /Main\.messageTray\.bannerBlocked = true/);
});

test('native OSD events show Nova preview, not silent suppression', () => {
    assert.match(extension, /_handleNativeOsd\(args\)/);
    assert.match(extension, /const activity = osdPreview\(/);
    assert.match(extension, /this\._showPreview\(activity\)/);
});

test('Nova does not suppress native OSD while the island is hidden or locked', () => {
    assert.match(extension, /!this\._island\.visible/);
    assert.match(extension, /Main\.sessionMode\?\.isLocked/);
});

test('download notices do not show a fake percentage progress bar', () => {
    assert.match(extension, /this\._activityProgress\.visible = hasPercent/);
    assert.match(extension, /this\._activityFooter\.visible = hasPercent/);
    assert.doesNotMatch(extension, /_activityBarFill\.width = 52/);
});

test('keyboard binding is limited to normal Shell mode and torn down on disable', () => {
    assert.match(extension, /Main\.wm\.addKeybinding\(/);
    assert.match(extension, /Shell\.ActionMode\.NORMAL/);
    assert.match(extension, /this\._unbindShortcut\(\)/);
    assert.match(extension, /Main\.wm\.removeKeybinding\('toggle-shortcut'\)/);
});

test('static notifications do not rebuild their actor tree every second', () => {
    assert.match(extension, /if \(!this\._transient && \(this\._timerTarget \|\| this\._recording\)\)/);
    assert.match(extension, /if \(this\._lastActivityIcon !== activityIcon\)/);
});

test('the optional developer service starts and stops from settings', () => {
    assert.match(extension, /this\._syncDeveloperApi\(\)/);
    assert.match(extension, /this\._liveActivityService\?\.destroy\(\)/);
    const service = readFileSync(new URL('../lib/live-activity.js', import.meta.url), 'utf8');
    assert.match(service, /Gio\.DBusExportedObject\.wrapJSObject\(/);
    assert.match(service, /Gio\.bus_unown_name\(/);
    assert.doesNotMatch(service, /spawn|execSync|subprocess/i);
});
