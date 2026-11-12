import test from 'node:test';
import assert from 'node:assert/strict';
import {artUriKind} from '../lib/artwork-url.js';

test('accepts local artwork and public-looking HTTPS hostnames', () => {
    assert.equal(artUriKind('file:///home/me/Music/cover.jpg'), 'local');
    assert.equal(artUriKind('https://i.scdn.co/image/abc'), 'remote');
    assert.equal(artUriKind('https://images.example.net/cover.png'), 'remote');
});

test('rejects unsafe URL forms supplied by MPRIS clients', () => {
    for (const url of [
        '', 'http://example.com/art', 'data:image/png;base64,xyz',
        'https://localhost/a', 'https://127.0.0.1/a',
        'https://192.168.1.1/a', 'https://images.local/a',
        'https://example.com:8080/a', 'https://name:pass@example.com/a',
        'file://remotehost/tmp/foo.png', 'https://bad..domain/a',
        'https://example.com.evil:1234/a',
    ]) {
        assert.equal(artUriKind(url), null, url);
    }
});
