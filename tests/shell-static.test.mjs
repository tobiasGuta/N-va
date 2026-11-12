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
