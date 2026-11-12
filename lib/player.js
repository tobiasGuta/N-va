// Pure functions used by Nova and its Node.js test suite.
// Inputs are values already unpacked from MPRIS D-Bus variants.
const MAX_TITLE = 72;
const MAX_ARTIST = 96;

function asText(value, fallback = '') {
    return typeof value === 'string' && value.trim() ?
        value.trim() : fallback;
}

function shorten(value, limit) {
    return Array.from(value).slice(0, limit).join('');
}

export function normalizePlayer(name, properties = {}) {
    const metadata = properties.Metadata ?? {};
    const artists = metadata['xesam:artist'];
    const artist = Array.isArray(artists) ?
        artists.filter(value => typeof value === 'string').join(', ') : '';
    const status = ['Playing', 'Paused', 'Stopped'].includes(properties.PlaybackStatus) ?
        properties.PlaybackStatus : 'Stopped';
    const canControl = properties.CanControl !== false;

    return {
        name,
        title: shorten(asText(metadata['xesam:title'], 'Unknown track'), MAX_TITLE),
        artist: shorten(asText(artist, 'Unknown artist'), MAX_ARTIST),
        status,
        canToggle: canControl && properties.CanPause !== false,
        canNext: canControl && properties.CanGoNext === true,
        canPrevious: canControl && properties.CanGoPrevious === true,
    };
}

// Playing media wins; otherwise prefer the last selected player for stability.
export function choosePlayer(players, preferredName = null) {
    if (!players.length)
        return null;

    const rank = player => player.status === 'Playing' ? 2 :
        player.status === 'Paused' ? 1 : 0;

    return [...players].sort((a, b) => {
        const byStatus = rank(b) - rank(a);
        if (byStatus !== 0)
            return byStatus;
        if (a.name === preferredName)
            return -1;
        if (b.name === preferredName)
            return 1;
        return a.name.localeCompare(b.name);
    })[0];
}
