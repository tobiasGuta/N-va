import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {MprisService} from './lib/mpris.js';

const COMPACT_WIDTH = 166;
const COMPACT_HEIGHT = 32;
const EXPANDED_WIDTH = 320;
const EXPANDED_HEIGHT = 116;
const TOP_MARGIN = 4;
const COLLAPSE_DELAY_MS = 650;

function icon(name, styleClass = 'nova-icon') {
    return new St.Icon({
        icon_name: name,
        style_class: styleClass,
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

function controlButton(iconName, accessibleName, callback, styleClass = 'nova-control') {
    const button = new St.Button({
        style_class: styleClass,
        can_focus: true,
        reactive: true,
        track_hover: true,
        child: icon(iconName),
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
        this._expanded = false;
        this._playerState = null;
        this._collapseSource = 0;
        this._monitorChangedId = 0;

        this._buildUi();
        Main.layoutManager.addChrome(this._island, {
            affectsStruts: false,
            trackFullscreen: true,
        });

        // The native clock remains intact and returns when Nova is disabled.
        this._clockActor = Main.panel.statusArea.dateMenu?.container ?? null;
        this._clockWasVisible = this._clockActor?.visible ?? null;
        this._clockActor?.hide();

        this._monitorChangedId = Main.layoutManager.connect(
            'monitors-changed', () => this._position(false)
        );
        this._position(false);

        this._media = new MprisService(player => this._showPlayer(player));
        this._media.start();
    }

    _buildUi() {
        this._island = new St.Widget({
            name: 'novaIsland',
            style_class: 'nova-island',
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
            x_expand: true,
            y_expand: true,
        });
        compactContent.add_child(icon('audio-x-generic-symbolic', 'nova-compact-icon'));
        this._compactText = label('NOVA', 'nova-compact-title');
        compactContent.add_child(this._compactText);
        compactContent.add_child(new St.Bin({
            style_class: 'nova-status-dot',
            y_align: Clutter.ActorAlign.CENTER,
        }));

        this._compactView = new St.Button({
            style_class: 'nova-compact',
            child: compactContent,
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: true,
            y_expand: true,
        });
        this._compactView.set_accessible_name('Expand Nova');
        this._compactView.connect('clicked', () => this._setExpanded(true));

        this._expandedView = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'nova-expanded',
            x_expand: true,
            y_expand: true,
            visible: false,
        });

        const header = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'nova-header',
            x_expand: true,
        });

        const artwork = new St.Bin({
            style_class: 'nova-artwork',
            y_align: Clutter.ActorAlign.CENTER,
        });
        artwork.set_child(icon('audio-x-generic-symbolic', 'nova-artwork-icon'));
        header.add_child(artwork);

        const texts = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            style_class: 'nova-track-texts',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._title = label('Nothing playing', 'nova-track-title');
        this._artist = label('Start a music player', 'nova-track-artist');
        texts.add_child(this._title);
        texts.add_child(this._artist);
        header.add_child(texts);

        header.add_child(controlButton(
            'window-close-symbolic', 'Collapse Nova',
            () => this._setExpanded(false), 'nova-close'
        ));
        this._expandedView.add_child(header);

        const footer = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'nova-footer',
            x_expand: true,
        });
        const badge = label('NOW PLAYING', 'nova-footer-label');
        footer.add_child(badge);

        const controls = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'nova-controls',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });
        this._previous = controlButton(
            'media-skip-backward-symbolic', 'Previous track',
            () => this._media?.control('previous')
        );
        this._playPause = controlButton(
            'media-playback-start-symbolic', 'Play or pause',
            () => this._media?.control('toggle'), 'nova-control nova-play-control'
        );
        this._next = controlButton(
            'media-skip-forward-symbolic', 'Next track',
            () => this._media?.control('next')
        );
        controls.add_child(this._previous);
        controls.add_child(this._playPause);
        controls.add_child(this._next);
        footer.add_child(controls);
        this._expandedView.add_child(footer);

        this._island.add_child(this._compactView);
        this._island.add_child(this._expandedView);

        this._island.connect('notify::hover', () => {
            if (this._island.hover) {
                this._cancelCollapse();
                this._setExpanded(true);
            } else {
                this._scheduleCollapse();
            }
        });

        this._showPlayer(null);
    }

    _showPlayer(player) {
        this._playerState = player;
        const playing = player?.status === 'Playing';
        const title = player?.title ?? 'Nothing playing';
        const artist = player?.artist ?? 'Start a music player';

        this._compactText.text = player ?
            clipped(title, 17) : 'NOVA';
        this._title.text = clipped(title, 32);
        this._artist.text = clipped(artist, 39);
        this._playPause.set_child(icon(
            playing ? 'media-playback-pause-symbolic' :
                'media-playback-start-symbolic'
        ));
        this._playPause.set_accessible_name(playing ? 'Pause' : 'Play');

        this._previous.reactive = player?.canPrevious ?? false;
        this._previous.can_focus = this._previous.reactive;
        this._playPause.reactive = player?.canToggle ?? false;
        this._playPause.can_focus = this._playPause.reactive;
        this._next.reactive = player?.canNext ?? false;
        this._next.can_focus = this._next.reactive;

        for (const button of [this._previous, this._playPause, this._next]) {
            if (button.reactive)
                button.remove_style_pseudo_class('disabled');
            else
                button.add_style_pseudo_class('disabled');
        }
    }

    _setExpanded(expanded) {
        if (!this._island || this._expanded === expanded)
            return;

        this._expanded = expanded;
        this._compactView.visible = !expanded;
        this._expandedView.visible = expanded;

        if (expanded)
            this._cancelCollapse();

        this._position(true);
    }

    _position(animate) {
        if (!this._island)
            return;

        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return;

        const width = Math.min(
            this._expanded ? EXPANDED_WIDTH : COMPACT_WIDTH,
            Math.max(120, monitor.width - 24)
        );
        const height = this._expanded ? EXPANDED_HEIGHT : COMPACT_HEIGHT;
        const x = Math.round(monitor.x + (monitor.width - width) / 2);
        const y = monitor.y + TOP_MARGIN;

        this._island.remove_all_transitions();

        // GNOME 51 exposes reduced-motion support; older versions don't.
        const reducedMotion = St.ReducedMotion &&
            St.Settings.get().reducedMotion === St.ReducedMotion.REDUCE;
        if (!animate || reducedMotion) {
            this._island.set_position(x, y);
            this._island.set_size(width, height);
            return;
        }

        this._island.ease({
            x,
            y,
            width,
            height,
            duration: 240,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
        });
    }

    _scheduleCollapse() {
        this._cancelCollapse();
        this._collapseSource = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, COLLAPSE_DELAY_MS, () => {
                this._collapseSource = 0;
                if (this._island && !this._island.hover)
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
        this._cancelCollapse();
        this._media?.destroy();
        this._media = null;

        if (this._monitorChangedId) {
            Main.layoutManager.disconnect(this._monitorChangedId);
            this._monitorChangedId = 0;
        }

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
        this._playerState = null;
    }
}
