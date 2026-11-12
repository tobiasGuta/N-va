import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {MprisService} from './lib/mpris.js';
import {ArtworkLoader} from './lib/artwork.js';
import {waveFrame} from './lib/waveform.js';
import {getIslandGeometry} from './lib/geometry.js';
import {ActivityMonitor} from './lib/activity-monitor.js';
import {percentage, remainingSeconds, durationLabel} from './lib/activity-utils.js';
import {activeMode, compactClock, fullClock, longDate, monthCells, monthLabel, weekdayLabels} from './lib/clock.js';

const COMPACT_WIDTH = 166;
const COMPACT_HEIGHT = 32;
const COLLAPSE_DELAY_MS = 650;
const WAVE_INTERVAL_MS = 180;

function icon(name, styleClass = 'nova-icon', size = 15, color = '#f7f7f8') {
    return new St.Icon({
        icon_name: name,
        style_class: styleClass,
        icon_size: size,
        style: `color: ${color};`,
        y_align: Clutter.ActorAlign.CENTER,
    });
}

function label(text, styleClass) {
    return new St.Label({
        text,
        style_class: styleClass,
        y_align: Clutter.ActorAlign.CENTER,
    });
}

function controlButton(iconName, accessibleName, callback, primary = false) {
    const button = new St.Button({
        style_class: primary ? 'nova-control nova-play-control' : 'nova-control',
        style: primary
            ? 'background-color: #baff80; color: #111315; border-radius: 17px;'
            : 'background-color: transparent; color: #e5e7eb; border-radius: 17px;',
        width: 30,
        height: 30,
        x_align: Clutter.ActorAlign.CENTER,
        y_align: Clutter.ActorAlign.CENTER,
        can_focus: true,
        reactive: true,
        track_hover: true,
        child: icon(iconName, 'nova-control-icon', 15,
            primary ? '#111315' : '#e5e7eb'),
    });
    button.set_accessible_name(accessibleName);
    button.connect('clicked', callback);
    return button;
}

function clipped(text, max) {
    const characters = Array.from(text);
    return characters.length > max ?
        characters.slice(0, max - 1).join('') + '…' : text;
}

export default class NovaExtension extends Extension {
    enable() {
        // Roll back partially applied shell changes when enable fails.
        try {
            this._enable();
        } catch (error) {
            try {
                this.disable();
            } catch (cleanupError) {
                console.warn('Nova: enable cleanup failed: ' + cleanupError.message);
            }
            throw error;
        }
    }

    _enable() {
        this._expanded = false;
        this._pinned = false;
        this._playerState = null;
        this._collapseSource = 0;
        this._revealSource = 0;
        this._monitorChangedId = 0;
        this._clockSource = 0;
        this._monthOffset = 0;
        this._lastDayKey = null;
        this._displayMode = 'clock';
        this._oldPanelStyle = null;
        this._artUrl = null;
        this._artGeneration = 0;
        this._waveSource = 0;
        this._waveStep = 0;
        this._artLoader = null;
        this._lastGicon = null;
        this._timerTarget = 0;
        this._timerLength = 0;
        this._activityTickSource = 0;
        this._activityExpireSource = 0;
        this._transient = null;
        this._recording = false;
        this._recordingStart = 0;
        this._presentedMode = 'clock';
        this._panelCustomized = false;
        this._activities = null;
        this._settingsChangedId = 0;
        this._settings = this.getSettings();

        this._buildUi();
        Main.layoutManager.addChrome(this._island, {
            affectsStruts: false,
            trackFullscreen: true,
        });

        // The native clock remains intact and returns when Nova is disabled.
        this._clockActor = Main.panel.statusArea.dateMenu?.container ?? null;
        this._clockWasVisible = this._clockActor?.visible ?? null;
        this._clockActor?.hide();

        // We change only the paint, never hide/remove the real panel.
        this._syncPanelStyle();
        this._settingsChangedId = this._settings.connect(
            'changed', (_settings, key) => this._onSettingChanged(key)
        );

        this._monitorChangedId = Main.layoutManager.connect(
            'monitors-changed', () => this._position(false)
        );
        // Panel is a GJS class, not a Clutter actor with an
        // 'allocation-changed' signal. Reposition on monitor and mode changes.
        this._position(false);

        this._artLoader = new ArtworkLoader();
        this._media = new MprisService(player => this._showPlayer(player));
        this._media.start();

        this._tickClock();
        this._clockSource = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 15, () => {
                this._tickClock();
                return GLib.SOURCE_CONTINUE;
            }
        );
        this._activityTickSource = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, 1, () => {
                this._tickActivities();
                return GLib.SOURCE_CONTINUE;
            }
        );
        this._activities = new ActivityMonitor(
            this._settings,
            activity => this._showPreview(activity),
            recording => this._recordingChanged(recording)
        );
        this._activities.start();
        this._applyAppearance();
    }

    _buildUi() {
        this._island = new St.Widget({
            name: 'novaIsland',
            style_class: 'nova-island',
            // Critical surfaces are styled inline as well as in stylesheet.css.
            // This keeps Nova a distinct black capsule with custom Shell themes.
            style: 'background-color: #050608; color: #f8fafc; ' +
                'border: 1px solid rgba(255,255,255,0.12); ' +
                'border-radius: 21px;',
            reactive: true,
            track_hover: true,
            can_focus: true,
            clip_to_allocation: true,
            layout_manager: new Clutter.BinLayout(),
            width: COMPACT_WIDTH,
            height: COMPACT_HEIGHT,
        });

        const compactContent = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'nova-compact-row',
            style: 'spacing: 8px;',
            x_expand: true,
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._compactArt = new St.Bin({
            width: 16,
            height: 16,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._compactArt.set_child(icon(
            'preferences-system-time-symbolic', 'nova-compact-icon', 13, '#baff80'
        ));
        compactContent.add_child(this._compactArt);
        this._compactText = label('NOVA', 'nova-compact-title');
        this._compactText.style = 'font-size: 11px; font-weight: 700; color: #f8fafc;';
        this._compactText.x_expand = true;
        compactContent.add_child(this._compactText);
        this._statusDot = new St.Bin({
            style_class: 'nova-status-dot',
            style: 'background-color: #baff80; border-radius: 4px;',
            width: 5,
            height: 5,
            visible: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        compactContent.add_child(this._statusDot);
        this._wave = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style: 'spacing: 2px;',
            y_align: Clutter.ActorAlign.CENTER,
            width: 25,
            height: 16,
            visible: false,
        });
        this._waveBars = [];
        for (let index = 0; index < 4; index++) {
            const bar = new St.Widget({
                width: 3,
                height: 4,
                y_align: Clutter.ActorAlign.CENTER,
                style: 'background-color: #baff80; border-radius: 2px;',
            });
            this._wave.add_child(bar);
            this._waveBars.push(bar);
        }
        compactContent.add_child(this._wave);

        this._compactView = new St.Button({
            style_class: 'nova-compact',
            style: 'background-color: transparent; padding: 0 12px;',
            child: compactContent,
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
        });
        this._compactView.set_accessible_name('Open Nova calendar');
        this._compactView.connect('clicked', () => {
            this._setPinned(true);
            this._setExpanded(true);
        });

        this._expandedView = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'nova-expanded',
            style: 'padding: 13px 14px 11px; spacing: 11px;',
            x_expand: true,
            y_expand: true,
            x_align: Clutter.ActorAlign.FILL,
            y_align: Clutter.ActorAlign.FILL,
            visible: false,
        });

        this._musicView = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'nova-music',
            style: 'spacing: 11px;',
            x_expand: true,
            y_expand: true,
            visible: false,
        });

        const header = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'nova-header',
            style: 'spacing: 11px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._artwork = new St.Bin({
            style_class: 'nova-artwork',
            style: 'background-color: #202a25; border-radius: 11px;',
            width: 46,
            height: 46,
            clip_to_allocation: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._artwork.set_child(icon(
            'audio-x-generic-symbolic', 'nova-artwork-icon', 23, '#baff80'
        ));
        header.add_child(this._artwork);

        const texts = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'nova-track-texts',
            style: 'spacing: 3px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._title = label('Nothing playing', 'nova-track-title');
        this._title.style = 'font-size: 12px; font-weight: 700; color: #f8fafc;';
        this._artist = label('Start a music player', 'nova-track-artist');
        this._artist.style = 'font-size: 10px; color: #a6abb4;';
        texts.add_child(this._title);
        texts.add_child(this._artist);
        header.add_child(texts);

        this._pinButton = this._makePinButton();
        header.add_child(this._pinButton);
        header.add_child(this._makeCloseButton());
        this._musicView.add_child(header);

        const footer = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'nova-footer',
            style: 'spacing: 6px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._badge = label('READY', 'nova-footer-label');
        this._badge.style = 'font-size: 9px; font-weight: 700; color: #baff80;';
        footer.add_child(this._badge);
        // Matching decorative wave in the expanded player.
        this._waveExpanded = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style: 'spacing: 2px;',
            width: 25,
            height: 16,
            y_align: Clutter.ActorAlign.CENTER,
        });
        for (let index = 0; index < 4; index++) {
            const bar = new St.Widget({
                width: 3,
                height: 4,
                y_align: Clutter.ActorAlign.CENTER,
                style: 'background-color: #baff80; border-radius: 2px;',
            });
            this._waveExpanded.add_child(bar);
            this._waveBars.push(bar);
        }
        footer.add_child(this._waveExpanded);

        const controls = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'nova-controls',
            style: 'spacing: 9px;',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });
        this._previous = controlButton(
            'media-skip-backward-symbolic', 'Previous track',
            () => this._media?.control('previous')
        );
        this._playPause = controlButton(
            'media-playback-start-symbolic', 'Play or pause',
            () => this._media?.control('toggle'), true
        );
        this._next = controlButton(
            'media-skip-forward-symbolic', 'Next track',
            () => this._media?.control('next')
        );
        controls.add_child(this._previous);
        controls.add_child(this._playPause);
        controls.add_child(this._next);
        footer.add_child(controls);
        this._musicView.add_child(footer);
        this._expandedView.add_child(this._musicView);
        this._calendarView = this._buildCalendar();
        this._expandedView.add_child(this._calendarView);
        this._activityView = this._buildActivityView();
        this._expandedView.add_child(this._activityView);

        this._island.add_child(this._compactView);
        this._island.add_child(this._expandedView);

        this._island.connect('notify::hover', () => {
            if (this._island.hover) {
                this._cancelCollapse();
                this._setExpanded(true);
            } else if (!this._pinned) {
                this._scheduleCollapse();
            }
        });

        this._showPlayer(null);
    }

    _showPlayer(player) {
        this._playerState = player;
        const playing = activeMode(player) === 'music';
        this._displayMode = playing ? 'music' : 'clock';

        if (playing) {
            this._title.text = clipped(player.title, 32);
            this._artist.text = clipped(player.artist, 39);
            this._badge.text = 'NOW PLAYING';
        }
        this._updateArt(playing ? player?.artUrl : null);
        if (playing)
            this._startWave();
        else
            this._stopWave();

        this._playPause.set_child(icon(
            'media-playback-pause-symbolic', 'nova-control-icon', 15, '#111315'
        ));
        this._playPause.set_accessible_name('Pause');
        this._previous.reactive = player?.canPrevious ?? false;
        this._previous.can_focus = this._previous.reactive;
        this._playPause.reactive = player?.canToggle ?? false;
        this._playPause.can_focus = this._playPause.reactive;
        this._next.reactive = player?.canNext ?? false;
        this._next.can_focus = this._next.reactive;
        for (const button of [this._previous, this._playPause, this._next])
            button.opacity = button.reactive ? 255 : 95;

        this._refreshPresentation(true);
    }

    _animationTime() {
        return this._settings?.get_int('animation-duration') ?? 240;
    }

    _accentColor() {
        const chosen = this._settings?.get_string('accent-color') ?? '#baff80';
        return /^#[0-9a-fA-F]{6}$/.test(chosen) ? chosen : '#baff80';
    }

    _applyAppearance() {
        const accent = this._accentColor();
        for (const bar of this._waveBars ?? [])
            bar.style = `background-color: ${accent}; border-radius: 2px;`;
        if (this._badge)
            this._badge.style = `font-size: 9px; font-weight: 700; color: ${accent};`;
        if (this._statusDot)
            this._statusDot.style = `background-color: ${accent}; border-radius: 4px;`;
        if (this._playPause)
            this._playPause.style = `background-color: ${accent}; border-radius: 17px;`;
        if (this._activityBarFill)
            this._activityBarFill.style = `background-color: ${accent}; border-radius: 3px;`;
        if (this._pinned)
            this._setPinned(true);
    }

    _syncPanelStyle() {
        if (!Main.panel || !this._settings)
            return;
        const enabled = this._settings.get_boolean('floating-panel');
        if (enabled && !this._panelCustomized) {
            this._oldPanelStyle = Main.panel.get_style();
            Main.panel.add_style_class_name('nova-floating-panel');
            Main.panel.set_style(
                (this._oldPanelStyle ?? '') +
                ' background-color: transparent; border: none; box-shadow: none;'
            );
            this._panelCustomized = true;
        } else if (!enabled) {
            this._restorePanelStyle();
        }
    }

    _restorePanelStyle() {
        if (!this._panelCustomized)
            return;
        Main.panel.remove_style_class_name('nova-floating-panel');
        Main.panel.set_style(this._oldPanelStyle ?? '');
        this._panelCustomized = false;
        this._oldPanelStyle = null;
    }

    _onSettingChanged(key) {
        if (!this._island)
            return;
        if (key === 'floating-panel')
            this._syncPanelStyle();
        else if (key === 'compact-width' || key === 'expanded-width')
            this._position(false);
        else if (key === 'accent-color')
            this._applyAppearance();
        else if (key === 'show-timer' && !this._settings.get_boolean(key)) {
            this._timerTarget = 0;
            this._refreshPresentation(true);
        } else if (key.startsWith('show-')) {
            this._refreshPresentation(true);
        }
        if (this._timerRow)
            this._timerRow.visible = this._settings.get_boolean('show-timer');
    }

    _currentActivity() {
        if (this._transient)
            return this._transient;
        if (this._recording && this._settings?.get_boolean('show-recording')) {
            const seconds = Math.floor(
                (GLib.get_monotonic_time() - this._recordingStart) / 1000000
            );
            return {
                kind: 'recording',
                icon: 'media-record-symbolic',
                title: 'Recording screen',
                detail: durationLabel(seconds),
            };
        }
        if (this._timerTarget && this._settings?.get_boolean('show-timer')) {
            const seconds = remainingSeconds(
                this._timerTarget, GLib.get_monotonic_time()
            );
            return {
                kind: 'timer',
                icon: 'alarm-symbolic',
                title: 'Timer',
                detail: durationLabel(seconds),
                percent: percentage(
                    this._timerLength - seconds, 0, this._timerLength
                ),
            };
        }
        return null;
    }

    _refreshPresentation(animate = false) {
        if (!this._island)
            return;
        const activity = this._currentActivity();
        const playing = this._displayMode === 'music';
        const next = activity ? 'activity' : this._displayMode;
        const changed = this._presentedMode !== next;
        this._presentedMode = next;

        this._musicView.visible = !activity && playing;
        this._calendarView.visible = !activity && !playing;
        this._activityView.visible = Boolean(activity);
        this._wave.visible = !activity && playing;
        this._statusDot.visible = false;

        if (activity) {
            this._compactText.text = clipped(
                activity.kind === 'timer' ? `Timer ${activity.detail}`
                    : activity.kind === 'recording' ? `REC ${activity.detail}`
                    : activity.percent !== undefined
                        ? `${activity.title} ${activity.detail}`
                        : activity.title, 18
            );
            this._compactArt.set_child(icon(
                activity.icon ?? 'dialog-information-symbolic',
                'nova-activity-compact-icon', 13, this._accentColor()
            ));
            this._activityTitle.text = clipped(activity.title ?? '', 33);
            this._activityDetail.text = clipped(activity.detail ?? '', 43);
            this._activityIcon.set_child(icon(
                activity.icon ?? 'dialog-information-symbolic',
                'nova-activity-icon', 24, this._accentColor()
            ));
            this._activityStop.visible = activity.kind === 'timer';
            const hasPercent = Number.isFinite(activity.percent);
            this._activityProgress.visible = hasPercent;
            if (hasPercent)
                this._activityBarFill.width = Math.round(
                    Math.max(0, Math.min(100, activity.percent)) * 2.25
                );
        } else {
            this._compactText.text = playing
                ? clipped(this._playerState?.title ?? '', 17)
                : compactClock(new Date());
            this._renderArtwork(this._lastGicon);
        }
        this._compactView.set_accessible_name(activity
            ? 'Open Nova live activity' : playing
                ? 'Open Nova music controls' : 'Open Nova calendar');

        if (changed) {
            if (this._expanded) {
                this._position(animate);
                const visible = activity ? this._activityView :
                    playing ? this._musicView : this._calendarView;
                visible.remove_all_transitions();
                visible.opacity = this._reduceMotion() ? 255 : 0;
                if (!this._reduceMotion()) {
                    visible.ease({
                        opacity: 255,
                        duration: this._animationTime(),
                        mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                    });
                }
            } else if (animate && !this._reduceMotion()) {
                this._compactView.remove_all_transitions();
                this._compactView.opacity = 100;
                this._compactView.ease({
                    opacity: 255,
                    duration: this._animationTime(),
                    mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                });
            }
        }
    }

    _showPreview(activity) {
        if (!this._island)
            return;
        this._transient = activity;
        if (this._activityExpireSource)
            GLib.Source.remove(this._activityExpireSource);
        this._activityExpireSource = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, activity.duration ?? 3000, () => {
                this._activityExpireSource = 0;
                this._transient = null;
                if (!this._island)
                    return GLib.SOURCE_REMOVE;
                this._refreshPresentation(true);
                if (!this._pinned && !this._island.hover &&
                    !this._recording && !this._timerTarget)
                    this._setExpanded(false);
                return GLib.SOURCE_REMOVE;
            }
        );
        this._refreshPresentation(true);
        if (!this._expanded)
            this._setExpanded(true);
    }

    _recordingChanged(recording) {
        this._recording = recording;
        if (recording)
            this._recordingStart = GLib.get_monotonic_time();
        this._refreshPresentation(true);
        if (recording && this._settings?.get_boolean('show-recording'))
            this._setExpanded(true);
    }

    _startTimer(minutes) {
        if (!this._settings?.get_boolean('show-timer'))
            return;
        this._timerLength = minutes * 60;
        this._timerTarget = GLib.get_monotonic_time() +
            this._timerLength * 1000000;
        this._transient = null;
        if (this._activityExpireSource) {
            GLib.Source.remove(this._activityExpireSource);
            this._activityExpireSource = 0;
        }
        this._refreshPresentation(true);
        this._setExpanded(true);
    }

    _stopTimer() {
        this._timerTarget = 0;
        this._timerLength = 0;
        this._refreshPresentation(true);
        if (!this._pinned && !this._island?.hover)
            this._scheduleCollapse();
    }

    _tickActivities() {
        if (!this._island)
            return;
        if (this._timerTarget &&
            remainingSeconds(this._timerTarget, GLib.get_monotonic_time()) === 0) {
            this._timerTarget = 0;
            this._timerLength = 0;
            this._showPreview({
                kind: 'timer-done', icon: 'alarm-symbolic',
                title: 'Timer finished', detail: 'Time is up', duration: 4500,
            });
        }
        if (this._currentActivity())
            this._refreshPresentation(false);
    }

    _buildActivityView() {
        const view = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style: 'spacing: 10px;',
            x_expand: true,
            y_expand: true,
            visible: false,
        });

        const header = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style: 'spacing: 11px;',
            x_expand: true,
        });
        this._activityIcon = new St.Bin({
            style: 'background-color: #202a25; border-radius: 11px;',
            width: 45, height: 45,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._activityIcon.set_child(icon(
            'dialog-information-symbolic', 'nova-activity-icon', 23, '#baff80'
        ));
        header.add_child(this._activityIcon);

        const texts = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style: 'spacing: 4px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._activityTitle = label('', 'nova-activity-title');
        this._activityTitle.style = 'color: #f8fafc; font-size: 12px; font-weight: 700;';
        this._activityDetail = label('', 'nova-activity-detail');
        this._activityDetail.style = 'color: #a6abb4; font-size: 10px;';
        texts.add_child(this._activityTitle);
        texts.add_child(this._activityDetail);
        header.add_child(texts);
        this._activityPin = this._makePinButton();
        header.add_child(this._activityPin);
        header.add_child(this._makeCloseButton());
        view.add_child(header);

        const footer = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style: 'spacing: 9px;',
            x_expand: true,
        });
        this._activityProgress = new St.Bin({
            style: 'background-color: #30333b; border-radius: 3px;',
            width: 225, height: 6,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._activityBarFill = new St.Widget({
            style: 'background-color: #baff80; border-radius: 3px;',
            width: 0, height: 6,
        });
        this._activityProgress.set_child(this._activityBarFill);
        footer.add_child(this._activityProgress);
        this._activityStop = new St.Button({
            style: 'background-color: #26292e; border-radius: 11px;',
            width: 48, height: 26, reactive: true, can_focus: true,
            child: label('STOP', 'nova-timer-stop'),
        });
        this._activityStop.set_accessible_name('Stop timer');
        this._activityStop.connect('clicked', () => this._stopTimer());
        footer.add_child(this._activityStop);
        view.add_child(footer);
        return view;
    }

    _reduceMotion() {
        return Boolean(St.ReducedMotion &&
            St.Settings.get().reducedMotion === St.ReducedMotion.REDUCE);
    }

    _renderArtwork(gicon = null) {
        this._lastGicon = gicon;
        if (!this._artwork || !this._compactArt)
            return;
        const picture = (size, fallback) => gicon
            ? new St.Icon({
                gicon,
                icon_size: size,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            })
            : icon(fallback, 'nova-art-fallback',
                size < 20 ? 13 : 23, '#baff80');

        this._artwork.set_child(picture(44, 'audio-x-generic-symbolic'));
        const fallback = this._displayMode === 'music'
            ? 'audio-x-generic-symbolic' : 'preferences-system-time-symbolic';
        this._compactArt.set_child(picture(15, fallback));
    }

    _updateArt(url) {
        const artUrl = typeof url === 'string' && url.length <= 2048
            ? url : null;
        if (this._artUrl === artUrl)
            return;

        this._artUrl = artUrl;
        const generation = ++this._artGeneration;
        this._renderArtwork();
        if (!artUrl || !this._artLoader)
            return;

        void this._artLoader.load(artUrl).then(gicon => {
            if (!this._island || generation !== this._artGeneration ||
                this._displayMode !== 'music' || !gicon)
                return;
            this._renderArtwork(gicon);
        }).catch(error => {
            if (this._island)
                console.debug('Nova: cover unavailable: ' + error.message);
        });
    }

    _startWave() {
        if (this._waveSource || this._reduceMotion())
            return;
        this._waveStep = 0;
        this._waveSource = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, WAVE_INTERVAL_MS, () => {
                if (!this._island || this._displayMode !== 'music') {
                    this._waveSource = 0;
                    return GLib.SOURCE_REMOVE;
                }
                const frame = waveFrame(this._waveStep);
                for (const [index, bar] of this._waveBars.entries()) {
                    bar.ease({
                        height: frame[index % frame.length],
                        duration: WAVE_INTERVAL_MS - 28,
                        mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                    });
                }
                this._waveStep++;
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    _stopWave() {
        if (this._waveSource) {
            GLib.Source.remove(this._waveSource);
            this._waveSource = 0;
        }
        for (const bar of this._waveBars ?? []) {
            bar.remove_all_transitions();
            bar.height = 4;
        }
    }

    _tickClock() {
        if (!this._calendarTime)
            return;

        const now = new Date();
        this._calendarTime.text = fullClock(now);
        this._calendarDate.text = longDate(now);
        if (this._displayMode === 'clock' && !this._currentActivity())
            this._compactText.text = compactClock(now);

        if (this._lastDayKey !== now.toDateString()) {
            this._lastDayKey = now.toDateString();
            this._populateCalendar();
        }
    }

    _setPinned(pinned) {
        this._pinned = pinned;
        for (const button of [this._pinButton, this._calendarPin, this._activityPin]) {
            if (!button)
                continue;
            button.style = pinned
                ? 'background-color: #baff80; color: #111315; border-radius: 11px;'
                : 'background-color: #1a1c20; color: #b9bec7; border-radius: 11px;';
            button.set_accessible_name(
                pinned ? 'Unpin Nova' : 'Keep Nova expanded'
            );
            const child = button.get_child();
            if (child)
                child.style = pinned ? 'color: #111315;' : 'color: #c5cbd5;';
        }

        if (pinned)
            this._cancelCollapse();
        else if (this._island && !this._island.hover)
            this._scheduleCollapse();
    }

    _makePinButton() {
        const button = new St.Button({
            style_class: 'nova-pin',
            style: 'background-color: #1a1c20; color: #b9bec7; border-radius: 11px;',
            width: 31,
            height: 25,
            reactive: true,
            can_focus: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            child: icon('view-pin-symbolic', 'nova-pin-icon', 13, '#c5cbd5'),
        });
        button.set_accessible_name('Keep Nova expanded');
        button.connect('clicked', () => this._setPinned(!this._pinned));
        return button;
    }

    _makeCloseButton() {
        const button = new St.Button({
            style_class: 'nova-close',
            style: 'background-color: #1a1c20; border-radius: 13px;',
            width: 25,
            height: 25,
            reactive: true,
            can_focus: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            child: icon('window-close-symbolic', 'nova-close-icon', 12, '#c8cbd0'),
        });
        button.set_accessible_name('Collapse Nova');
        button.connect('clicked', () => {
            this._setPinned(false);
            this._setExpanded(false);
        });
        return button;
    }

    _buildCalendar() {
        const view = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'nova-calendar',
            style: 'spacing: 7px;',
            x_expand: true,
            y_expand: true,
            visible: false,
        });

        const top = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style: 'spacing: 8px;',
            x_expand: true,
        });
        const clockIcon = new St.Bin({
            style: 'background-color: #202a25; border-radius: 11px;',
            width: 41,
            height: 41,
            y_align: Clutter.ActorAlign.CENTER,
            child: icon('preferences-system-time-symbolic', 'nova-clock-icon',
                21, '#baff80'),
        });
        top.add_child(clockIcon);

        const clockInfo = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style: 'spacing: 2px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._calendarTime = label('--:--', 'nova-clock-time');
        this._calendarTime.style =
            'font-size: 17px; font-weight: 700; color: #f8fafc;';
        this._calendarDate = label('', 'nova-clock-date');
        this._calendarDate.style = 'font-size: 10px; color: #a6abb4;';
        clockInfo.add_child(this._calendarTime);
        clockInfo.add_child(this._calendarDate);
        top.add_child(clockInfo);

        this._calendarPin = this._makePinButton();
        top.add_child(this._calendarPin);
        top.add_child(this._makeCloseButton());
        view.add_child(top);

        const navigation = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style: 'spacing: 5px;',
            x_expand: true,
        });
        this._monthTitle = label('', 'nova-month-title');
        this._monthTitle.style = 'font-size: 12px; font-weight: 700; color: #f8fafc;';
        this._monthTitle.x_expand = true;
        navigation.add_child(this._monthTitle);

        navigation.add_child(controlButton(
            'go-previous-symbolic', 'Previous month', () => {
                this._monthOffset--;
                this._populateCalendar();
            }
        ));
        navigation.add_child(controlButton(
            'go-next-symbolic', 'Next month', () => {
                this._monthOffset++;
                this._populateCalendar();
            }
        ));
        view.add_child(navigation);

        const dayNames = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style: 'spacing: 3px;',
        });
        for (const day of weekdayLabels()) {
            const dayLabel = label(day, 'nova-weekday');
            dayLabel.width = 38;
            dayLabel.style = 'font-size: 9px; color: #858b95;';
            dayNames.add_child(dayLabel);
        }
        view.add_child(dayNames);

        this._dayButtons = [];
        for (let row = 0; row < 6; row++) {
            const week = new St.BoxLayout({
                orientation: Clutter.Orientation.HORIZONTAL,
                style: 'spacing: 3px;',
            });
            for (let column = 0; column < 7; column++) {
                const dayButton = new St.Button({
                    style_class: 'nova-day',
                    style: 'background-color: transparent; border-radius: 11px;',
                    width: 38,
                    height: 24,
                    reactive: false,
                    child: label('', 'nova-day-number'),
                });
                week.add_child(dayButton);
                this._dayButtons.push(dayButton);
            }
            view.add_child(week);
        }

        this._timerRow = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style: 'spacing: 6px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const caption = label('TIMER', 'nova-timer-label');
        caption.style = 'font-size: 9px; font-weight: 700; color: #a6abb4;';
        caption.x_expand = true;
        this._timerRow.add_child(caption);
        for (const minutes of [5, 15, 25]) {
            const button = new St.Button({
                style: 'background-color: #202326; border-radius: 10px;',
                width: 49,
                height: 25,
                can_focus: true,
                reactive: true,
                child: label(`${minutes}m`, 'nova-timer-preset'),
            });
            button.set_accessible_name(`Start ${minutes} minute timer`);
            button.connect('clicked', () => this._startTimer(minutes));
            this._timerRow.add_child(button);
        }
        view.add_child(this._timerRow);

        this._populateCalendar();
        return view;
    }

    _populateCalendar() {
        if (!this._dayButtons)
            return;
        const today = new Date();
        const month = new Date(
            today.getFullYear(), today.getMonth() + this._monthOffset, 1
        );
        this._monthTitle.text = monthLabel(month);
        for (const [index, cell] of monthCells(month, today).entries()) {
            const button = this._dayButtons[index];
            button.get_child().text = String(cell.day);
            button.style = cell.isToday
                ? 'background-color: #baff80; color: #101315; border-radius: 11px;'
                : cell.inMonth
                    ? 'background-color: transparent; color: #f8fafc; border-radius: 11px;'
                    : 'background-color: transparent; color: #666c76; border-radius: 11px;';
        }
    }

    _setExpanded(expanded) {
        if (!this._island || this._expanded === expanded)
            return;

        this._cancelReveal();
        this._expanded = expanded;
        this._compactView.visible = !expanded;
        this._expandedView.visible = expanded;

        if (expanded) {
            this._cancelCollapse();
            // Reveal the contents after the black capsule starts expanding.
            // The island itself stays visible throughout the transition.
            this._expandedView.opacity = 0;
            this._revealSource = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, 95, () => {
                    this._revealSource = 0;
                    if (this._island && this._expanded) {
                        this._expandedView.ease({
                            opacity: 255,
                            duration: Math.max(80, Math.round(this._animationTime() * 0.65)),
                            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
                        });
                    }
                    return GLib.SOURCE_REMOVE;
                }
            );
        } else {
            this._expandedView.remove_all_transitions();
            this._expandedView.opacity = 0;
        }

        this._position(true);
    }

    _cancelReveal() {
        if (!this._revealSource)
            return;
        GLib.Source.remove(this._revealSource);
        this._revealSource = 0;
    }

    _position(animate) {
        if (!this._island)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        // The compact island must fit *inside* the GNOME top panel rather
        // than overflowing into the active window below it. Expanded mode
        // uses the same top-center anchor and grows down from there.
        const [panelX, panelY] = Main.panel.get_transformed_position();
        const panel = {
            x: Number.isFinite(panelX) ? panelX : monitor.x,
            y: Number.isFinite(panelY) ? panelY : monitor.y,
            width: Main.panel.get_width() || monitor.width,
            height: Main.panel.get_height() ||
                Main.layoutManager.panelBox?.height || COMPACT_HEIGHT + 6,
        };
        const {x, y, width, height} = getIslandGeometry(
            panel, monitor, this._expanded,
            this._currentActivity() ? 'activity' : this._displayMode, {
                compactWidth: this._settings?.get_int('compact-width') ?? 166,
                expandedWidth: this._settings?.get_int('expanded-width') ?? 328,
            }
        );

        this._island.remove_all_transitions();

        if (!animate || this._reduceMotion()) {
            this._island.set_position(x, y);
            this._island.set_size(width, height);
            return;
        }

        this._island.ease({
            x,
            y,
            width,
            height,
            duration: this._animationTime(),
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
    }

    _scheduleCollapse() {
        this._cancelCollapse();
        this._collapseSource = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, COLLAPSE_DELAY_MS, () => {
                this._collapseSource = 0;
                if (this._island && !this._island.hover && !this._pinned)
                    this._setExpanded(false);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _cancelCollapse() {
        if (!this._collapseSource)
            return;

        GLib.Source.remove(this._collapseSource);
        this._collapseSource = 0;
    }

    disable() {
        // Everything attached to GNOME Shell must be cleaned up synchronously.
        if (this._clockSource) {
            GLib.Source.remove(this._clockSource);
            this._clockSource = 0;
        }
        if (this._activityExpireSource) {
            GLib.Source.remove(this._activityExpireSource);
            this._activityExpireSource = 0;
        }
        if (this._activityTickSource) {
            GLib.Source.remove(this._activityTickSource);
            this._activityTickSource = 0;
        }
        this._activities?.destroy();
        this._activities = null;
        this._cancelCollapse();
        this._cancelReveal();
        this._stopWave();
        ++this._artGeneration;
        this._artLoader?.destroy();
        this._artLoader = null;
        this._media?.destroy();
        this._media = null;

        if (this._monitorChangedId) {
            Main.layoutManager.disconnect(this._monitorChangedId);
            this._monitorChangedId = 0;
        }

        if (this._settingsChangedId && this._settings) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        this._restorePanelStyle();

        if (this._clockActor && this._clockWasVisible !== null)
            this._clockActor.visible = this._clockWasVisible;
        this._clockActor = null;
        this._clockWasVisible = null;

        if (this._island) {
            this._island.remove_all_transitions();
            Main.layoutManager.removeChrome(this._island);
            this._island.destroy();
            this._island = null;
        }

        this._compactView = null;
        this._expandedView = null;
        this._musicView = null;
        this._calendarView = null;
        this._calendarPin = null;
        this._dayButtons = null;
        this._calendarTime = null;
        this._calendarDate = null;
        this._compactText = null;
        this._compactArt = null;
        this._artwork = null;
        this._wave = null;
        this._waveExpanded = null;
        this._waveBars = null;
        this._statusDot = null;
        this._activityView = null;
        this._activityPin = null;
        this._activityTitle = null;
        this._activityDetail = null;
        this._activityIcon = null;
        this._activityStop = null;
        this._activityProgress = null;
        this._activityBarFill = null;
        this._timerRow = null;
        this._settings = null;
        this._badge = null;
        this._pinButton = null;
        this._lastGicon = null;
        this._transient = null;
        this._pinned = false;
        this._playerState = null;
    }
}
