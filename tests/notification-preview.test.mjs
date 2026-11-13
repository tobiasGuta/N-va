import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanNotificationText, notificationPreview, NotificationQueue} from '../lib/notification-preview.js';

test('title and body are separate and the app name is preserved', () => {
    const preview = notificationPreview(
        {title: 'Message from team', body: 'Your build is ready.'},
        {title: 'Chat App'}
    );
    assert.deepEqual(preview, {
        kind: 'notification', icon: 'mail-unread-symbolic',
        appName: 'Chat App', title: 'Message from team',
        detail: 'Your build is ready.', duration: 3200,
    });
});

test('GNOME legacy bannerBodyText is a fallback and empty body is fine', () => {
    assert.equal(notificationPreview(
        {title: 'Download complete', bannerBodyText: 'photo.png'},
        {name: 'Browser'}
    ).detail, 'photo.png');
    assert.equal(notificationPreview(
        {title: 'Hello'}, {}
    ).detail, '');
    assert.equal(notificationPreview({title: '   '}, {}), null);
});

test('unsafe control characters are removed; markup is never interpreted', () => {
    const preview = notificationPreview({
        title: 'Hello\n\u202eWorld',
        body: '<b>Hello</b>\tfrom\nNova\u0000',
    }, {title: 'App'});
    assert.equal(preview.title, 'Hello World');
    assert.equal(preview.detail, '<b>Hello</b> from Nova');
});

test('long text is bounded by Unicode code points and the limit', () => {
    const s = cleanNotificationText('😀'.repeat(300), 160);
    assert.equal(Array.from(s).length, 160);
    assert.ok(s.endsWith('…'));
    assert.equal(cleanNotificationText(123), '');
    assert.equal(notificationPreview({title: 'same', body: 'same'}, {}).detail, '');
});

test('multiple notifications display in FIFO order, without overwrite', () => {
    const queue = new NotificationQueue(3);
    assert.equal(queue.enqueue({title: 'first'}), true);
    assert.equal(queue.enqueue({title: 'second'}), true);
    assert.equal(queue.enqueue({title: 'third'}), true);
    assert.equal(queue.enqueue({title: 'overflow'}), false);
    assert.equal(queue.length, 3);
    assert.deepEqual([queue.next().title, queue.next().title, queue.next().title],
        ['first', 'second', 'third']);
    assert.equal(queue.next(), null);
    assert.equal(queue.length, 0);
});

test('clearing queued notifications does not hold stale private content', () => {
    const queue = new NotificationQueue(2);
    queue.enqueue({title: 'Private'});
    queue.clear();
    assert.equal(queue.length, 0);
    assert.equal(queue.next(), null);
});
