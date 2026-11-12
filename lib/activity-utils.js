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

export function safeTitle(value, max = 64) {
    if (typeof value !== 'string')
        return '';
    return Array.from(value.replace(/[\r\n\t]+/g, ' ').trim()).slice(0, max).join('');
}

export function isPartialDownload(name) {
    return typeof name === 'string' && /\.(crdownload|part|download)$/i.test(name);
}
