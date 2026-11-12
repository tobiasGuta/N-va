import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {MprisService} from './lib/mpris.js';
import {getIslandGeometry} from './lib/geometry.js';

const COMPACT_WIDTH = 166;
const COMPACT_HEIGHT = 32;
const COLLAPSE_DELAY_MS = 650;

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
        this._expanded = false;
        this._pinned = false;
        this._playerState = null;
        this._collapseSource = 0;
        this._revealSource = 0;
        this._monitorChangedId = 0;
        this._panelAllocationId = 0;

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
        // GNOME panel height can change with themes, scaling or extensions.
        this._panelAllocationId = Main.panel.connect(
            'allocation-changed', () => this._position(false)
        );
        this._position(false);

        this._media = new MprisService(player => this._showPlayer(player));
        this._media.start();
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
        compactContent.add_child(icon(
            'audio-x-generic-symbolic', 'nova-compact-icon', 13, '#baff80'
        ));
        this._compactText = label('NOVA', 'nova-compact-title');
        this._compactText.style = 'font-size: 11px; font-weight: 700; color: #f8fafc;';
        this._compactText.x_expand = true;
        compactContent.add_child(this._compactText);
        compactContent.add_child(new St.Bin({
            style_class: 'nova-status-dot',
            style: 'background-color: #baff80; border-radius: 4px;',
            width: 5,
            height: 5,
            y_align: Clutter.ActorAlign.CENTER,
        }));

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
        this._compactView.set_accessible_name('Keep Nova open');
        this._compactView.connect('clicked', () => {
            this._pinned = true;
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

        const header = new St.BoxLayout({
            orientation: Clutter.Orientation.HORIZONTAL,
            style_class: 'nova-header',
            style: 'spacing: 11px;',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        const artwork = new St.Bin({
            style_class: 'nova-artwork',
            style: 'background-color: #202a25; border-radius: 11px;',
            width: 46,
            height: 46,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        artwork.set_child(icon(
            'audio-x-generic-symbolic', 'nova-artwork-icon', 23, '#baff80'
        ));
        header.add_child(artwork);

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

        const close = new St.Button({
            style_class: 'nova-close',
            style: 'background-color: #1a1c20; border-radius: 13px;',
            width: 25,
            height: 25,
            can_focus: true,
            reactive: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
            child: icon('window-close-symbolic', 'nova-close-icon', 12, '#c8cbd0'),
        });
        close.set_accessible_name('Close Nova');
        close.connect('clicked', () => {
            this._pinned = false;
            this._setExpanded(false);
        });
        this._pinButton = new St.Button({
            style_class: 'nova-pin',
            style: 'background-color: #1a1c20; border-radius: 11px; ' +
                'color: #b9bec7; font-size: 9px; font-weight: 700;',
            width: 31,
            height: 25,
            can_focus: true,
            reactive: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.START,
            child: label('PIN', 'nova-pin-label'),
        });
        this._pinButton.set_accessible_name('Keep Nova expanded');
        this._pinButton.connect('clicked', () => {
            this._pinned = !this._pinned;
            this._pinButton.set_style(this._pinned
                ? 'background-color: #baff80; border-radius: 11px; ' +
                    'color: #111315; font-size: 9px; font-weight: 700;'
                : 'background-color: #1a1c20; border-radius: 11px; ' +
                    'color: #b9bec7; font-size: 9px; font-weight: 700;');
            this._pinButton.set_accessible_name(this._pinned
                ? 'Unpin Nova' : 'Keep Nova expanded');
            if (this._pinned)
                this._cancelCollapse();
            else if (!this._island.hover)
                this._scheduleCollapse();
        });
        header.add_child(this._pinButton);
        header.add_child(close);
        this._expandedView.add_child(header);

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
        this._expandedView.add_child(footer);

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
        const playing = player?.status === 'Playing';
        const title = player?.title ?? 'Nothing playing';
        const artist = player?.artist ?? 'Start a music player';

        this._compactText.text = player ?
            clipped(title, 17) : 'NOVA';
        this._title.text = clipped(title, 32);
        this._artist.text = clipped(artist, 39);
        this._playPause.set_child(icon(
            playing ? 'media-playback-pause-symbolic' :
                'media-playback-start-symbolic',
            'nova-control-icon', 15, '#111315'
        ));
        this._playPause.set_accessible_name(playing ? 'Pause' : 'Play');
        this._badge.text = !player ? 'NO MEDIA' :
            playing ? 'NOW PLAYING' : 'PAUSED';

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
            button.opacity = button.reactive ? 255 : 95;
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
                            duration: 155,
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
        const {x, y, width, height} =
            getIslandGeometry(panel, monitor, this._expanded);

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
        this._cancelCollapse();
        this._cancelReveal();
        this._media?.destroy();
        this._media = null;

        if (this._monitorChangedId) {
            Main.layoutManager.disconnect(this._monitorChangedId);
            this._monitorChangedId = 0;
        }
        if (this._panelAllocationId) {
            Main.panel.disconnect(this._panelAllocationId);
            this._panelAllocationId = 0;
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
        this._badge = null;
        this._pinButton = null;
        this._pinned = false;
        this._playerState = null;
    }
}
