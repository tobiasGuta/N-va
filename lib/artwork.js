import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import {artUriKind} from './artwork-url.js';

const MAX_ART_BYTES = 2 * 1024 * 1024;
const CHUNK_BYTES = 32768;
const CACHE_ENTRIES = 10;

// Artwork stays in memory only. No subprocesses or disk cache.
export class ArtworkLoader {
    constructor() {
        this._session = new Soup.Session({timeout: 8});
        this._cancellable = new Gio.Cancellable();
        this._cache = new Map();
        this._pending = new Map();
        this._destroyed = false;
    }

    load(url) {
        const kind = artUriKind(url);
        if (this._destroyed || !kind)
            return Promise.resolve(null);

        if (kind === 'local') {
            return Promise.resolve(new Gio.FileIcon({
                file: Gio.File.new_for_uri(url),
            }));
        }

        if (this._cache.has(url))
            return Promise.resolve(this._cache.get(url));
        if (this._pending.has(url))
            return this._pending.get(url);

        const task = this._download(url).then(gicon => {
            if (!this._destroyed && gicon) {
                this._cache.set(url, gicon);
                if (this._cache.size > CACHE_ENTRIES)
                    this._cache.delete(this._cache.keys().next().value);
            }
            return gicon;
        }).catch(() => null).finally(() => this._pending.delete(url));
        this._pending.set(url, task);
        return task;
    }

    _download(url) {
        return new Promise(resolve => {
            let message;
            try {
                message = Soup.Message.new('GET', url);
                if (!message)
                    return resolve(null);
                message.set_flags(Soup.MessageFlags.NO_REDIRECT);
            } catch (_error) {
                return resolve(null);
            }

            this._session.send_async(
                message, GLib.PRIORITY_DEFAULT, this._cancellable,
                (_session, result) => {
                    let stream;
                    try {
                        stream = this._session.send_finish(result);
                        if (message.status_code !== 200)
                            return resolve(null);

                        const headers = message.get_response_headers();
                        const type = headers.get_one('Content-Type');
                        const length = Number(headers.get_one('Content-Length'));
                        if ((type && !/^image\/(png|jpeg|jpg|webp|gif)(?:[; ]|$)/i.test(type)) ||
                            (Number.isFinite(length) && length > MAX_ART_BYTES))
                            return resolve(null);
                    } catch (_error) {
                        return resolve(null);
                    }

                    const chunks = [];
                    let total = 0;
                    const next = () => stream.read_bytes_async(
                        CHUNK_BYTES, GLib.PRIORITY_DEFAULT, this._cancellable,
                        (_stream, readResult) => {
                            try {
                                const data = stream.read_bytes_finish(readResult).get_data();
                                if (data.length === 0) {
                                    if (total === 0)
                                        return resolve(null);
                                    const merged = new Uint8Array(total);
                                    let offset = 0;
                                    for (const chunk of chunks) {
                                        merged.set(chunk, offset);
                                        offset += chunk.length;
                                    }
                                    return resolve(Gio.BytesIcon.new(GLib.Bytes.new(merged)));
                                }
                                total += data.length;
                                if (total > MAX_ART_BYTES)
                                    return resolve(null);
                                chunks.push(data);
                                next();
                            } catch (_error) {
                                resolve(null);
                            }
                        }
                    );
                    next();
                }
            );
        });
    }

    destroy() {
        this._destroyed = true;
        this._cancellable.cancel();
        this._session.abort();
        this._cache.clear();
        this._pending.clear();
    }
}
