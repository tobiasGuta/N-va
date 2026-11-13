import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {DownloadTracker} from './download-tracker.js';
import {formatBytes, isPartialDownload, safeTitle} from './activity-utils.js';

const POLL_MS = 2400;
const EVENT_DEBOUNCE_MS = 65;
const SETTLE_RECHECK_MS = 700;
const PAGE_SIZE = 128;
const MAX_FILES = 4096;

// A folder monitor plus non-blocking Gio enumeration. Browser downloads
// may use temporary names, rename files, or write directly to a final path.
// Snapshots provide a fallback when file-monitor events are missed.
export class DownloadsMonitor {
    constructor(settings, onPreview) {
        this._settings = settings;
        this._onPreview = onPreview;
        this._tracker = new DownloadTracker();
        this._cancellable = new Gio.Cancellable();
        this._disposed = false;
        this._scanning = false;
        this._again = false;
        this._pollSource = 0;
        this._debounceSource = 0;
        this._settleSource = 0;
        this._monitor = null;
        this._monitorSignal = 0;
        const xdg = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD);
        this._directory = Gio.File.new_for_path(xdg ||
            GLib.build_filenamev([GLib.get_home_dir(), 'Downloads']));
    }

    start() {
        try {
            this._monitor = this._directory.monitor_directory(
                Gio.FileMonitorFlags.WATCH_MOVES, this._cancellable
            );
            this._monitorSignal = this._monitor.connect(
                'changed', (_monitor, file, otherFile, event) => {
                    if (this._disposed)
                        return;
                    if (event === Gio.FileMonitorEvent.RENAMED &&
                        file && otherFile &&
                        isPartialDownload(file.get_basename()) &&
                        !isPartialDownload(otherFile.get_basename())) {
                        // A browser's temp -> final rename is a strong
                        // completion signal: confirm the new file and
                        // notify without waiting for a whole-folder scan.
                        this._confirmRename(otherFile);
                    }
                    if (this._debounceSource)
                        return;
                    this._debounceSource = GLib.timeout_add(
                        GLib.PRIORITY_DEFAULT, EVENT_DEBOUNCE_MS, () => {
                            this._debounceSource = 0;
                            this._scan();
                            return GLib.SOURCE_REMOVE;
                        }
                    );
                }
            );
        } catch (error) {
            console.debug('Nova: Downloads folder event monitor unavailable: ' +
                error.message + ' (using async scans)');
        }
        // Scans are always asynchronous: never enumerate files synchronously
        // inside GNOME Shell. Polling also catches files the backend misses.
        this._pollSource = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, POLL_MS, () => {
                this._scan();
                return GLib.SOURCE_CONTINUE;
            }
        );
        this._scan(); // Baseline existing files; no initial popup.
    }

    _confirmRename(file) {
        file.query_info_async(
            'standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_DEFAULT, this._cancellable,
            (handle, result) => {
                if (this._disposed)
                    return;
                try {
                    const info = handle.query_info_finish(result);
                    if (info.get_file_type() !== Gio.FileType.REGULAR)
                        return;
                    const name = file.get_basename();
                    const event = this._tracker.confirmCompleted(
                        name, Math.floor(GLib.get_monotonic_time() / 1000)
                    );
                    if (event && this._settings.get_boolean('show-downloads'))
                        this._emit(event);
                } catch (_error) {
                    // A rename event can race a file disappearing; the
                    // periodic scanner remains the fallback.
                }
            }
        );
    }

    _queueSettleScan() {
        if (this._disposed || this._settleSource)
            return;
        this._settleSource = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, SETTLE_RECHECK_MS, () => {
                this._settleSource = 0;
                this._scan();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _scan() {
        if (this._disposed)
            return;
        if (this._scanning) {
            this._again = true;
            return;
        }
        this._scanning = true;
        this._directory.enumerate_children_async(
            'standard::name,standard::type,standard::size',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_DEFAULT, this._cancellable,
            (directory, result) => {
                let iter;
                try {
                    iter = directory.enumerate_children_finish(result);
                } catch (error) {
                    if (!this._disposed)
                        console.debug('Nova: Downloads scan unavailable: ' + error.message);
                    this._finishScan(null);
                    return;
                }
                const snapshot = new Map();
                const close = () => {
                    try {
                        iter.close_async(GLib.PRIORITY_DEFAULT, null,
                            (enumerator, closeResult) => {
                                try {
                                    enumerator.close_finish(closeResult);
                                } catch (_error) {}
                            });
                    } catch (_error) {
                        // Cancellation and directory removal during shutdown
                        // are expected; the next scan can establish a baseline.
                    }
                };
                const finish = complete => {
                    close();
                    this._finishScan(complete ? snapshot : null);
                };
                const next = () => {
                    iter.next_files_async(
                        PAGE_SIZE, GLib.PRIORITY_DEFAULT, this._cancellable,
                        (enumerator, nextResult) => {
                            let page;
                            try {
                                page = enumerator.next_files_finish(nextResult) ?? [];
                            } catch (_error) {
                                finish(false);
                                return;
                            }
                            for (const info of page) {
                                if (info.get_file_type() !== Gio.FileType.REGULAR)
                                    continue;
                                const name = info.get_name();
                                if (!name)
                                    continue;
                                snapshot.set(name, {size: Number(info.get_size())});
                            }
                            if (snapshot.size > MAX_FILES) {
                                // An incomplete snapshot can look like
                                // thousands of deletions; discard it.
                                finish(false);
                            } else if (page.length === PAGE_SIZE) {
                                next();
                            } else {
                                finish(true);
                            }
                        }
                    );
                };
                next();
            }
        );
    }

    _finishScan(snapshot) {
        this._scanning = false;
        if (this._disposed)
            return;
        if (snapshot) {
            const changes = this._tracker.observe(
                snapshot, Math.floor(GLib.get_monotonic_time() / 1000)
            );
            if (this._settings.get_boolean('show-downloads')) {
                for (const change of changes)
                    this._emit(change);
            }
            // A quick direct-to-final image can be created and closed
            // before a second filesystem event. Check it again shortly,
            // rather than waiting for the 2.4-second fallback poll.
            if (this._tracker.hasPendingFinals())
                this._queueSettleScan();
        }
        if (this._again) {
            this._again = false;
            this._scan();
        }
    }

    _emit(change) {
        const complete = change.type === 'complete';
        const saved = change.type === 'saved';
        const active = change.type === 'started' || change.type === 'progress';
        const title = complete ? 'Download complete' :
            saved ? 'Saved to Downloads' :
                active ? 'Downloading' : 'Saving to Downloads';
        const detail = safeTitle(change.name, 39) +
            (active && Number.isFinite(change.bytes)
                ? ' · ' + formatBytes(change.bytes) + ' received' : '');
        this._onPreview({
            kind: 'download',
            icon: complete || saved ? 'emblem-ok-symbolic'
                : 'folder-download-symbolic',
            title,
            detail,
            duration: complete || saved ? 4500 : 3200,
        });
    }

    destroy() {
        this._disposed = true;
        this._cancellable.cancel();
        if (this._pollSource)
            GLib.Source.remove(this._pollSource);
        if (this._debounceSource)
            GLib.Source.remove(this._debounceSource);
        if (this._settleSource)
            GLib.Source.remove(this._settleSource);
        this._pollSource = 0;
        this._debounceSource = 0;
        this._settleSource = 0;
        if (this._monitor) {
            if (this._monitorSignal) {
                try {
                    this._monitor.disconnect(this._monitorSignal);
                } catch (_error) {}
            }
            this._monitor.cancel();
            this._monitor = null;
        }
        this._onPreview = null;
    }
}
