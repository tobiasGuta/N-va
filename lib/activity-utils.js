export function percentage(value, min = 0, max = 100) {
    if (![value, min, max].every(Number.isFinite) || max <= min)
        return null;
    return Math.max(0, Math.min(100, Math.round((value - min) / (max - min) * 100)));
}

export function remainingSeconds(targetMicroseconds, nowMicroseconds) {
    if (!Number.isFinite(targetMicroseconds) || !Number.isFinite(nowMicroseconds))
        return 0;
    return Math.max(0, Math.ceil((targetMicroseconds - nowMicroseconds) / 1000000));
}

export function durationLabel(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0)
        return 'Size unknown';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes, i = 0;
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
    }
    return `${i === 0 ? Math.floor(value) : value.toFixed(1)} ${units[i]}`;
}

export function safeTitle(value, max = 64) {
    if (typeof value !== 'string')
        return '';
    return Array.from(value.replace(/[\r\n\t]+/g, ' ').trim()).slice(0, max).join('');
}

export function isPartialDownload(name) {
    return typeof name === 'string' && /\.(crdownload|part|download)$/i.test(name);
}

// Backlight is the (u aa{sv}) Mutter DisplayConfig property since GNOME 49.
// The values may still be GVariant wrappers depending on the GJS unpack method.
export function backlightLevel(payload) {
    if (!Array.isArray(payload) || !Array.isArray(payload[1]))
        return null;
    const unpack = value => value?.recursiveUnpack?.() ??
        value?.deepUnpack?.() ?? value;
    for (const entry of payload[1]) {
        if (!entry || typeof entry !== 'object')
            continue;
        if (unpack(entry.active) === false)
            continue;
        const current = Number(unpack(entry.value));
        const min = Number(unpack(entry.min));
        const max = Number(unpack(entry.max));
        const scaled = percentage(current, min, max);
        if (scaled !== null)
            return scaled;
    }
    return null;
}
