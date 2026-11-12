import test from 'node:test';
import assert from 'node:assert/strict';
import {DownloadTracker} from '../lib/download-tracker.js';

const snap = entries => new Map(entries.map(([name, size]) => [name, {size}]));
const types = events => events.map(event => event.type);

test('Firefox .part: downloading, then completed only after partial removal', () => {
    const tracker = new DownloadTracker();
    tracker.observe(snap([]), 0);
    assert.deepEqual(types(tracker.observe(snap([
        ['movie.mp4.part', 120], ['movie.mp4', 0],
    ]), 1000)), ['started']);
    assert.equal(tracker.observe(snap([
        ['movie.mp4.part', 400], ['movie.mp4', 0],
    ]), 2000).length, 0);
    assert.deepEqual(types(tracker.observe(snap([
        ['movie.mp4', 900],
    ]), 3000)), ['complete']);
});

test('Chromium .crdownload rename yields exactly one completion', () => {
    const tracker = new DownloadTracker();
    tracker.observe(snap([]), 0);
    assert.deepEqual(types(tracker.observe(snap([['pdf.crdownload', 23]]), 1000)),
        ['started']);
    assert.deepEqual(types(tracker.observe(snap([['pdf', 230]]), 2000)),
        ['complete']);
    assert.deepEqual(tracker.observe(snap([['pdf', 230]]), 5000), []);
});

test('random Firefox part basename can match one new final file', () => {
    const tracker = new DownloadTracker();
    tracker.observe(snap([]), 0);
    tracker.observe(snap([['random.part', 100]]), 1000);
    tracker.observe(snap([['random.part', 200], ['report.pdf', 0]]), 2000);
    assert.deepEqual(tracker.observe(snap([['report.pdf', 500]]), 3000),
        [{type: 'complete', name: 'report.pdf'}]);
});

test('disappearing .part without final is not reported as complete', () => {
    const tracker = new DownloadTracker();
    tracker.observe(snap([]), 0);
    tracker.observe(snap([['not-done.part', 2]]), 1000);
    assert.deepEqual(tracker.observe(snap([]), 2000), []);
    assert.deepEqual(tracker.observe(snap([]), 15000), []);
});

test('direct-to-final files show saving and later saved after stable size', () => {
    const tracker = new DownloadTracker();
    tracker.observe(snap([]), 0);
    assert.deepEqual(types(tracker.observe(snap([['small.txt', 20]]), 1000)),
        ['saving']);
    assert.deepEqual(tracker.observe(snap([['small.txt', 40]]), 2000), []);
    assert.deepEqual(tracker.observe(snap([['small.txt', 40]]), 4000), []);
    assert.deepEqual(types(tracker.observe(snap([['small.txt', 40]]), 5500)),
        ['saved']);
});

test('baseline existing files do not cause spurious download popups', () => {
    const tracker = new DownloadTracker();
    assert.deepEqual(tracker.observe(snap([['old.mp4', 400]]), 0), []);
    assert.deepEqual(tracker.observe(snap([['old.mp4', 400]]), 1000), []);
});

test('file in Downloads should not be reported complete while temp sibling exists', () => {
    const tracker = new DownloadTracker();
    tracker.observe(snap([]), 0);
    tracker.observe(snap([['a.zip', 0], ['a.zip.part', 50]]), 1000);
    assert.deepEqual(tracker.observe(snap([
        ['a.zip', 100], ['a.zip.part', 95],
    ]), 6000).filter(x => x.type === 'complete' || x.type === 'saved'), []);
});
