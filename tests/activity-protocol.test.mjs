import test from 'node:test';
import assert from 'node:assert/strict';
import {developerActivity} from '../lib/activity-protocol.js';

test('developer activities are bounded, sanitized and short-lived', () => {
    assert.deepEqual(developerActivity('Build complete', 'All checks passed', 100, 3500), {
        kind: 'developer', icon: 'utilities-terminal-symbolic',
        title: 'Build complete', detail: 'All checks passed',
        percent: 100, duration: 3500,
    });
    assert.equal(developerActivity('   ', '', 20, 5000), null);
    const entry = developerActivity('A'.repeat(400), 'Hello\nworld', 105, 100000);
    assert.equal(entry.title.length, 54);
    assert.equal(entry.detail, 'Hello world');
    assert.equal(entry.duration, 8000);
    assert.equal('percent' in entry, false);
});

test('unknown progress is omitted, zero is a valid progress value', () => {
    assert.equal('percent' in developerActivity('Build', '', -1, 100), false);
    assert.equal(developerActivity('Build', '', 0, 1200).percent, 0);
    assert.equal(developerActivity('Build', '', 73, 1200).percent, 73);
    assert.equal(developerActivity('Build', '', Infinity, Number.NaN).duration, 3000);
});

test('control characters are not rendered from external local clients', () => {
    assert.equal(developerActivity('Done\0\t\n!', '\x1b[31m', -1, 1200).title, 'Done !');
});
