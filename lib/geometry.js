// Both placements use the native panel height. Omit the panel position
// and width to anchor the island to the primary monitor instead.
const COMPACT_WIDTH = 166;
const COMPACT_MAX_HEIGHT = 32;
const EXPANDED_WIDTH = 328;
const EXPANDED_HEIGHT = 124;
const MUSIC_HEIGHT = 136;
const CALENDAR_HEIGHT = 354;
const SIMPLE_ACTIVITY_HEIGHT = 86;
const NOTIFICATION_HEIGHT = 146;

export function getIslandGeometry(panel, monitor, expanded = false, mode = 'music', options = {}) {
    const panelHeight = panel.height > 0 ? panel.height : 38;
    // Keep breathing room above and below the compact pill.
    const inset = Math.max(2, Math.min(4, Math.floor(panelHeight / 8)));
    const compactHeight = Math.min(
        COMPACT_MAX_HEIGHT, Math.max(1, panelHeight - 2 * inset)
    );

    const width = Math.min(
        expanded ? (options.expandedWidth ?? EXPANDED_WIDTH)
            : (options.compactWidth ?? COMPACT_WIDTH),
        Math.max(1, monitor.width - 24)
    );
    const anchorWidth = panel.width > 0 ? panel.width : monitor.width;
    const anchorX = Number.isFinite(panel.x) ? panel.x : monitor.x;
    const anchorY = Number.isFinite(panel.y) ? panel.y : monitor.y;

    return {
        x: Math.round(anchorX + (anchorWidth - width) / 2),
        y: Math.round(anchorY + (panelHeight - compactHeight) / 2),
        width,
        height: expanded
            ? (mode === 'music' ? MUSIC_HEIGHT
                : mode === 'clock' || mode === 'history' ? CALENDAR_HEIGHT
                : mode === 'notification' ? NOTIFICATION_HEIGHT
                    : mode === 'activity-simple' ? SIMPLE_ACTIVITY_HEIGHT
                        : EXPANDED_HEIGHT)
            : compactHeight,
    };
}
