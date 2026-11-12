import test from 'node:test';
import assert from 'node:assert/strict';

import {
    activeMode, compactClock, fullClock, longDate,
    monthCells, monthLabel, weekdayLabels,
} from '../lib/clock.js';

test('clock is the default unless a player is actively playing', () => {
    assert.equal(activeMode(null), 'clock');
    assert.equal(activeMode({status: 'Paused'}), 'clock');
    assert.equal(activeMode({status: 'Stopped'}), 'clock');
    assert.equal(activeMode({status: 'Playing'}), 'music');
});

test('formats local time and date without relying on hard-coded text', () => {
    const date = new Date(2026, 10, 12, 16, 13);
    assert.ok(compactClock(date).length >= 6);
    assert.ok(fullClock(date).length >= 4);
    assert.ok(longDate(date).length > 5);
    assert.match(monthLabel(date), /2026/);
    assert.equal(weekdayLabels().length, 7);
});

test('calendar always covers six complete weeks including today', () => {
    const date = new Date(2026, 10, 12, 12);
    const cells = monthCells(date, date);
    assert.equal(cells.length, 42);
    assert.equal(cells[0].day, 1);
    assert.equal(cells[0].inMonth, true);
    assert.equal(cells.filter(c => c.isToday).length, 1);
    assert.ok(cells.some(c => !c.inMonth));
});

test('month navigation handles the year boundary and leap years', () => {
    const today = new Date(2026, 11, 15);
    const january = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    assert.equal(january.getFullYear(), 2027);
    assert.equal(january.getMonth(), 0);
    const leap = monthCells(new Date(2028, 1, 1), today);
    assert.equal(leap.filter(c => c.inMonth).length, 29);
});
