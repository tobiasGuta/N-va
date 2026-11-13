import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFileSync(join(root, file), 'utf8');

test('developer features are explicitly opt-in on fresh installation', () => {
    const schema = read('schemas/org.gnome.shell.extensions.nova.gschema.xml');
    assert.match(schema, /name="developer-activities" type="b"><default>false<\/default>/);
    assert.match(schema, /name="toggle-shortcut" type="as"><default>\[\]<\/default>/);
});

test('all runtime JS modules are included by packaging glob', () => {
    const pkg = read('scripts/package.sh');
    const installer = read('install.sh');
    assert.match(pkg, /"\$\{ROOT\}"\/lib\/\*\.js/);
    assert.match(installer, /"\$\{SOURCE_DIR\}"\/lib\/\*\.js/);
    assert.ok(readdirSync(join(root, 'lib')).includes('live-activity.js'));
});

test('dev metadata is deliberately distinct from latest stable release', () => {
    assert.equal(JSON.parse(read('package.json')).version, '0.6.0-dev');
    assert.equal(JSON.parse(read('metadata.json')).uuid, 'nova@tobiasguta.github.io');
    assert.ok(read('README.md').includes('v0.5.4'));
});
