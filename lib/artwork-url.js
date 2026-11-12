// URLs originate from other desktop apps; validate before fetching artwork.
// Remote loads are HTTPS only, without redirects, custom ports, localhost or IPs.
export function artUriKind(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 2048)
        return null;

    if (/^file:\/\/\/[^\r\n]+$/i.test(value))
        return 'local';

    const match = value.match(/^https:\/\/([a-z0-9.-]+)(?:[/?#]|$)/i);
    if (!match)
        return null;

    const host = match[1].toLowerCase();
    if (!host.includes('.') || host.includes('..') ||
        host.startsWith('.') || host.endsWith('.') ||
        host.split('.').some(p => p.startsWith('-') || p.endsWith('-')) ||
        /^[0-9.]+$/.test(host) ||
        /\.(local|localhost|internal|lan|home|test|invalid|example|onion)$/.test(host))
        return null;

    return 'remote';
}
