import test from 'node:test';
import assert from 'node:assert/strict';
import {THEME_PRESETS, KEYBOARD_SHORTCUTS, resolveTheme, validShortcut} from '../lib/themes.js';

test('the original accent stays unchanged for existing Nova users', () => {
    assert.deepEqual(resolveTheme('custom', '#a1b2c3'), {
        id: 'custom', background: '#050608', accent: '#a1b2c3',
    });
});
test('presets are valid and have unique identifiers', () => {
    assert.equal(new Set(THEME_PRESETS.map(t => t.id)).size, THEME_PRESETS.length);
    for (const theme of THEME_PRESETS) {
        assert.match(theme.background, /^#[0-9a-f]{6}$/i);
        assert.match(resolveTheme(theme.id).accent, /^#[0-9a-f]{6}$/i);
    }
});
test('malformed colors and unknown presets fail back safely', () => {
    assert.equal(resolveTheme('unknown', 'rgba(1,2,3,4)').accent, '#baff80');
    assert.equal(resolveTheme('mint', '#123456').accent, '#baff80');
});
test('keyboard shortcut selection is restricted to supported accelerators', () => {
    for (const choice of KEYBOARD_SHORTCUTS) {
        assert.equal(validShortcut(choice.accelerator ?
            [choice.accelerator] : []), choice.accelerator);
    }
    assert.equal(validShortcut(['<Super>q']), '');
    assert.equal(validShortcut(['<Super>n', '<Super><Alt>n']), '');
});
