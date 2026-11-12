import test from 'node:test';
import assert from 'node:assert/strict';
import {backlightLevel, percentage, remainingSeconds, durationLabel, formatBytes, safeTitle, isPartialDownload} from '../lib/activity-utils.js';

test('clamps percentages and refuses invalid ranges', () => {
    assert.equal(percentage(50), 50);
    assert.equal(percentage(999), 100);
    assert.equal(percentage(-10), 0);
    assert.equal(percentage(150, 100, 200), 50);
    assert.equal(percentage(3, 8, 8), null);
});

test('timer uses monotonic microseconds and displays mm:ss', () => {
    assert.equal(remainingSeconds(11000000, 10000000), 1);
    assert.equal(remainingSeconds(10000000, 11000000), 0);
    assert.equal(durationLabel(301), '05:01');
    assert.equal(durationLabel(0), '00:00');
});

test('sanitizes names and recognizes partial browser downloads', () => {
    assert.equal(safeTitle('hello\nworld'), 'hello world');
    assert.equal(isPartialDownload('video.crdownload'), true);
    assert.equal(isPartialDownload('video.part'), true);
    assert.equal(isPartialDownload('finished.mp4'), false);
});

test('download bytes are displayed as actual received data, not fabricated percent', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(1048576), '1.0 MB');
    assert.equal(formatBytes(Number.NaN), 'Size unknown');
});

test('download filename normalization supports browser temp extensions', () => {
    for (const ext of ['.part', '.crdownload']) {
        const name = 'report.pdf' + ext;
        assert.equal(isPartialDownload(name), true);
        assert.equal(name.replace(/\.(crdownload|part|download)$/i, ''), 'report.pdf');
    }
});

test('Mutter Backlight entries support non-0 minima and unsupported displays', () => {
    assert.equal(backlightLevel([2, [
        {connector: 'HDMI-A-1', active: true},
        {connector: 'eDP-1', active: true, min: 200, max: 1800, value: 1000},
    ]]), 50);
    assert.equal(backlightLevel([2, [{active: false, min: 0, max: 100, value: 50}]]), null);
    assert.equal(backlightLevel(null), null);
});
