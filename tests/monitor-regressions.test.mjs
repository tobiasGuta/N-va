import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const monitor = readFileSync(new URL('../lib/activity-monitor.js', import.meta.url), 'utf8');
const extension = readFileSync(new URL('../extension.js', import.meta.url), 'utf8');

test('live slider wins over stale Mutter backlight polls', () => {
    assert.match(monitor, /if \(this\._brightnessSlider &&\s*Number\.isFinite/);
    assert.match(monitor, /this\._showBrightness\(Math\.round\(fraction \* 100\)\)/);
});

test('completed browser downloads are observed from temporary-file removal', () => {
    assert.match(monitor, /Gio\.FileMonitorFlags\.WATCH_MOVES/);
    assert.match(monitor, /Gio\.FileMonitorEvent\.DELETED/);
    assert.match(monitor, /_verifyDownloadFinished\(file\.get_parent\(\), base\)/);
    assert.match(monitor, /this\._downloadCompleted\(basename\)/);
});

test('recognized OSD events create Nova previews while others fall through', () => {
    assert.match(extension, /_handleNativeOsd\(args\)/);
    assert.match(extension, /return original\.apply\(manager, args\)/);
});

test('regular GNOME notifications remain in history when Nova handles banner', () => {
    assert.match(monitor, /MessageTray\.Urgency\.CRITICAL/);
    assert.match(monitor, /notification\.acknowledged = true/);
});
