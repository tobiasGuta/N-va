// Pure geometry function: GNOME panel geometry comes from Main.panel,
// not from a hard-coded offset relative to the monitor.
const COMPACT_WIDTH = 166;
const COMPACT_MAX_HEIGHT = 32;
const EXPANDED_WIDTH = 328;
const EXPANDED_HEIGHT = 124;

export function getIslandGeometry(panel, monitor, expanded = false) {
    const panelHeight = panel.height > 0 ? panel.height : 38;
    // Keep breathing room above and below the compact pill.
    const inset = Math.max(2, Math.min(4, Math.floor(panelHeight / 8)));
    const compactHeight = Math.min(
        COMPACT_MAX_HEIGHT, Math.max(1, panelHeight - 2 * inset)
    );

    const width = Math.min(
        expanded ? EXPANDED_WIDTH : COMPACT_WIDTH,
        Math.max(1, monitor.width - 24)
    );
    const anchorWidth = panel.width > 0 ? panel.width : monitor.width;

    return {
        x: Math.round(panel.x + (anchorWidth - width) / 2),
        y: Math.round(panel.y + (panelHeight - compactHeight) / 2),
        width,
        height: expanded ? EXPANDED_HEIGHT : compactHeight,
    };
}
