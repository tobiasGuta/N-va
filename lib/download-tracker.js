import {isPartialDownload} from './activity-utils.js';

// Pure observer fed by asynchronous snapshots of the Downloads directory.
// It never guesses percentages or assumes a disappeared .part means success.
const TEMP_SUFFIX = /\.(?:crdownload|part|download)$/i;
const RETRY_WINDOW_MS = 12000;
const COMPLETE_COOLDOWN_MS = 12000;
const UPDATE_INTERVAL_MS = 5000;
const STABLE_FINAL_MS = 3200;

function clean(name) {
    return name.replace(TEMP_SUFFIX, '');
}

function validRegular(info) {
    return info && Number.isFinite(info.size) && info.size >= 0;
}

export class DownloadTracker {
    constructor() {
        this._previous = null;
        this._partials = new Map();
        this._waiting = new Map();
        this._finals = new Map();
        this._recent = new Map();
    }

    observe(files, now) {
        const current = new Map([...files].filter(([name, info]) =>
            typeof name === 'string' && validRegular(info)));
        const events = [];

        if (this._previous === null) {
            this._previous = current;
            for (const [name, info] of current) {
                if (isPartialDownload(name)) {
                    this._partials.set(name, {
                        name: clean(name), lastSize: info.size,
                        notified: now, candidates: new Set(),
                    });
                }
            }
            return events; // Existing files are not new downloads.
        }

        for (const [name, time] of this._recent) {
            if (now - time >= COMPLETE_COOLDOWN_MS)
                this._recent.delete(name);
        }

        const changedFinals = new Set();
        for (const [name, info] of current) {
            if (isPartialDownload(name))
                continue;
            const old = this._previous.get(name);
            if (!old || old.size !== info.size)
                changedFinals.add(name);
        }

        // Discover partial files first, so same-scan final placeholders
        // cannot be reported as completed before the transfer ends.
        for (const [name, info] of current) {
            if (!isPartialDownload(name))
                continue;
            const active = this._partials.get(name);
            if (!active) {
                this._partials.set(name, {
                    name: clean(name), lastSize: info.size,
                    notified: now, candidates: new Set(changedFinals),
                });
                this._recent.delete(clean(name));
                events.push({type: 'started', name: clean(name), bytes: info.size});
                continue;
            }
            for (const candidate of changedFinals)
                active.candidates.add(candidate);
            if (active.lastSize !== info.size) {
                active.lastSize = info.size;
                if (now - active.notified >= UPDATE_INTERVAL_MS) {
                    active.notified = now;
                    events.push({type: 'progress', name: active.name, bytes: info.size});
                }
            }
        }

        for (const [name, state] of this._partials) {
            if (current.has(name))
                continue;
            this._partials.delete(name);
            this._waiting.set(name, {
                ...state, since: now,
            });
        }

        // Completion requires a real final file and no active partial.
        for (const [partialName, state] of this._waiting) {
            const expected = state.name;
            const choices = [...state.candidates].filter(name =>
                current.has(name) && !isPartialDownload(name));
            let finished = current.has(expected) ? expected : null;
            if (!finished && choices.length === 1)
                [finished] = choices;

            if (finished && ![...this._partials.values()].some(partial =>
                partial.name === finished)) {
                if (!this._recent.has(finished)) {
                    events.push({type: 'complete', name: finished});
                    this._recent.set(finished, now);
                }
                this._waiting.delete(partialName);
                this._finals.delete(finished);
            } else if (now - state.since >= RETRY_WINDOW_MS) {
                this._waiting.delete(partialName);
            }
        }

        // Direct-to-final downloads lack a .part. Show "Saving" immediately
        // and "Saved" only after the size has stayed stable for 3+ seconds.
        for (const [name, info] of current) {
            if (isPartialDownload(name) || this._recent.has(name))
                continue;
            const old = this._previous.get(name);
            const relatedPartial = [...this._partials.values()].some(
                state => state.name === name || state.candidates.has(name));
            const relatedWaiting = [...this._waiting.values()].some(
                state => state.name === name || state.candidates.has(name));
            if (relatedPartial || relatedWaiting) {
                this._finals.delete(name);
                continue;
            }
            if (!old) {
                this._finals.set(name, {
                    since: now, lastChanged: now, size: info.size,
                });
                events.push({type: 'saving', name, bytes: info.size});
                continue;
            }
            const state = this._finals.get(name);
            if (!state)
                continue;
            if (state.size !== info.size) {
                state.size = info.size;
                state.lastChanged = now;
            } else if (now - state.since >= STABLE_FINAL_MS &&
                now - state.lastChanged >= STABLE_FINAL_MS &&
                info.size > 0) {
                events.push({type: 'saved', name});
                this._recent.set(name, now);
                this._finals.delete(name);
            }
        }

        for (const name of this._finals.keys()) {
            if (!current.has(name))
                this._finals.delete(name);
        }
        this._previous = current;
        return events;
    }
}
