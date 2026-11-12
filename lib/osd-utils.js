// GNOME OSD event interpretation: don't capture unsupported overlay types.
export function osdPreview(iconName, level, maxLevel = 1, fallbackPercent = null) {
    const name = typeof iconName === 'string' ? iconName.toLowerCase() : '';
    const kind = name.includes('audio-volume-') ? 'volume'
        : name.includes('display-brightness-') ? 'brightness' : null;
    if (!kind)
        return null;
    let percent = null;
    if (typeof level === 'number' && Number.isFinite(level)) {
        const max = typeof maxLevel === 'number' &&
            Number.isFinite(maxLevel) && maxLevel > 0 ? maxLevel : 1;
        percent = Math.max(0, Math.min(100, Math.round(level / max * 100)));
    } else if (name.includes('muted')) {
        percent = 0;
    } else if (Number.isFinite(fallbackPercent)) {
        percent = Math.max(0, Math.min(100, Math.round(fallbackPercent)));
    }
    if (percent === null)
        return null;
    return {
        kind,
        title: kind === 'volume' ? 'Volume' : 'Brightness',
        icon: kind === 'volume'
            ? name.includes('muted') ? 'audio-volume-muted-symbolic'
                : 'audio-volume-high-symbolic'
            : 'display-brightness-symbolic',
        detail: String(percent) + '%',
        percent,
        duration: 1600,
    };
}
