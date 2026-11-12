import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('..', import.meta.url));
const uuid = 'nova@tobiasguta.github.io';

test('installer includes every runtime library, including geometry.js', () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-install-'));
    try {
        const bin = path.join(sandbox, 'bin');
        fs.mkdirSync(bin);
        const gnomeCommand = path.join(bin, 'gnome-extensions');
        fs.writeFileSync(gnomeCommand, '#!/bin/sh\nexit 0\n');
        fs.chmodSync(gnomeCommand, 0o755);
        const run = spawnSync('bash', [path.join(root, 'install.sh')], {
            encoding: 'utf8',
            env: {
                ...process.env,
                HOME: sandbox,
                PATH: bin + path.delimiter + process.env.PATH,
            },
        });
        assert.equal(run.status, 0, run.stderr || run.stdout);
        const installed = path.join(sandbox, '.local/share/gnome-shell/extensions', uuid);
        const sourceModules = fs.readdirSync(path.join(root, 'lib')).filter(
            name => name.endsWith('.js')
        );
        assert.ok(sourceModules.includes('geometry.js'));
        for (const file of sourceModules) {
            assert.equal(
                fs.readFileSync(path.join(installed, 'lib', file), 'utf8'),
                fs.readFileSync(path.join(root, 'lib', file), 'utf8'),
                file + ' must be installed'
            );
        }
    } finally {
        fs.rmSync(sandbox, {recursive: true, force: true});
    }
});
