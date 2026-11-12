import test from 'node:test';
import assert from 'node:assert/strict';

import {choosePlayer, normalizePlayer} from '../lib/player.js';

test('normalizes metadata and capabilities', () => {
    const player = normalizePlayer('org.mpris.MediaPlayer2.demo', {
        PlaybackStatus: 'Playing',
        CanControl: true,
        CanPause: true,
        CanGoNext: true,
        CanGoPrevious: false,
        Metadata: {
            'xesam:title': 'Nova Song',
            'xesam:artist': ['Artist A', 'Artist B'],
            'mpris:artUrl': 'https://images.example.org/cover.jpg',
        },
    });

    assert.equal(player.title, 'Nova Song');
    assert.equal(player.artist, 'Artist A, Artist B');
    assert.equal(player.artUrl, 'https://images.example.org/cover.jpg');
    assert.equal(player.canNext, true);
    assert.equal(player.canPrevious, false);
    assert.equal(player.canToggle, true);
});

test('uses safe defaults for missing and malformed metadata', () => {
    const player = normalizePlayer('org.mpris.MediaPlayer2.demo', {
        PlaybackStatus: 'Something else',
        Metadata: {'xesam:title': 123, 'xesam:artist': 'not an array'},
    });
    assert.equal(player.title, 'Unknown track');
    assert.equal(player.artist, 'Unknown artist');
    assert.equal(player.status, 'Stopped');
    assert.equal(player.artUrl, null);
});

test('does not offer actions when the player cannot be controlled', () => {
    const player = normalizePlayer('org.mpris.MediaPlayer2.demo', {
        CanControl: false, CanGoNext: true, CanGoPrevious: true,
    });
    assert.equal(player.canToggle, false);
    assert.equal(player.canNext, false);
    assert.equal(player.canPrevious, false);
});

test('prioritizes playing over paused and stopped', () => {
    const stopped = {name: 'a', status: 'Stopped'};
    const playing = {name: 'b', status: 'Playing'};
    const paused = {name: 'c', status: 'Paused'};
    assert.equal(choosePlayer([stopped, paused, playing]), playing);
});

test('keeps the preferred player when statuses tie', () => {
    const a = {name: 'a', status: 'Playing'};
    const b = {name: 'b', status: 'Playing'};
    assert.equal(choosePlayer([a, b], 'b'), b);
});

test('handles no players', () => {
    assert.equal(choosePlayer([]), null);
});
