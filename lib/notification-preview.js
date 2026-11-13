// Pure transformations. Never interpret notification content as Pango markup
// or as code; the Shell UI assigns the resulting strings to St.Label.text.
export function cleanNotificationText(value, maxLength = 160) {
    if (typeof value !== 'string')
        return '';
    const plain = value
        .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
        // Prevent notification text from visually spoofing neighboring UI.
        .replace(/[\u202a-\u202e\u2066-\u2069]/g, '')
        .replace(/\s+/gu, ' ')
        .trim();
    const chars = Array.from(plain);
    return chars.length > maxLength
        ? chars.slice(0, maxLength - 1).join('') + '…' : plain;
}

export function notificationPreview(notification, source) {
    const title = cleanNotificationText(notification?.title, 90);
    if (!title)
        return null;
    const appName = cleanNotificationText(
        source?.title ?? source?.name ?? 'Notification', 48
    ) || 'Notification';
    const body = cleanNotificationText(
        notification?.body || notification?.bannerBodyText || '', 160
    );
    return {
        kind: 'notification',
        icon: 'mail-unread-symbolic',
        appName,
        title,
        detail: body === title ? '' : body,
        duration: 3200,
    };
}

// At most six notices can be awaiting display. If full, the caller must
// decline the preview so GNOME can show its ordinary banner instead.
export class NotificationQueue {
    constructor(limit = 6) {
        this._limit = Math.max(1, Math.trunc(limit));
        this._pending = [];
    }

    enqueue(activity) {
        if (this._pending.length >= this._limit)
            return false;
        this._pending.push(activity);
        return true;
    }

    next() {
        return this._pending.shift() ?? null;
    }

    clear() {
        this._pending.length = 0;
    }

    get length() {
        return this._pending.length;
    }
}
