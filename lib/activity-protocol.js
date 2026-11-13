// Validate all strings and values originating from local D-Bus clients.
// This is a same-user, opt-in API; it never accepts markup, icon names or URLs.
export function developerActivity(title, detail, percent, durationMs) {
    const clean = (value, max) => Array.from(
        String(value ?? '').replace(/[\x00-\x1f\x7f]+/g, ' ').trim()
    ).slice(0, max).join('');
    const safeTitle = clean(title, 54);
    if (!safeTitle)
        return null;
    const safeDetail = clean(detail, 78);
    const rawDuration = Number.isFinite(durationMs) ? durationMs : 3000;
    const duration = Math.max(1200, Math.min(8000, Math.trunc(rawDuration)));
    const hasProgress = Number.isInteger(percent) && percent >= 0 && percent <= 100;
    return {
        kind: 'developer',
        icon: 'utilities-terminal-symbolic',
        title: safeTitle,
        detail: safeDetail || 'Local application activity',
        ...(hasProgress ? {percent} : {}),
        duration,
    };
}
