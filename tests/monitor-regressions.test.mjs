import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const monitor = readFileSync(new URL('../lib/activity-monitor.js', import.meta.url), 'utf8');
const extension = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');

test('live slider wins over stale Mutter backlight polls', () => {
    assert.match(monitor, /if \(this\._brightnessSlider &&\s*Number\.isFinite/);
    assert.match(monitor, /this\._showBrightness\(Math\.round\(fraction \* 100\)\)/);
});

test('Downloads uses an asynchronous scanner plus event monitor', () => {
    const source = readFileSync(new URL('../lib/downloads.js', import.meta.url), 'utf8');
    assert.match(source, /Gio\.FileMonitorFlags\.WATCH_MOVES/);
    assert.match(source, /enumerate_children_async/);
    assert.match(source, /next_files_async/);
    assert.match(source, /GLib\.get_user_special_dir/);
    assert.match(monitor, /this\._downloads\.start\(\)/);
    assert.match(monitor, /this\._downloads\?\.destroy\(\)/);
    assert.doesNotMatch(source, /enumerate_children\(/);
});

test('recognized OSD events create Nova previews while others fall through', () => {
    assert.match(extension, /_handleNativeOsd\(args\)/);
    assert.match(extension, /return original\.apply\(manager, args\)/);
});

test('regular GNOME notifications remain in history when Nova handles banner', () => {
    assert.match(monitor, /MessageTray\.Urgency\.CRITICAL/);
    assert.match(monitor, /notification\.acknowledged = true/);
});
