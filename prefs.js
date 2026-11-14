import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import {THEME_PRESETS, KEYBOARD_SHORTCUTS, validShortcut} from './lib/themes.js';

export default class NovaPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window.search_enabled = true;

        const page = new Adw.PreferencesPage({
            title: 'Nova',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        const appearance = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'Changes apply immediately. Restart GNOME Shell if another extension overrides the panel.',
        });
        page.add(appearance);

        const toggles = [
            [appearance, 'floating-panel', 'Transparent top panel',
                'Keep system icons visible while removing the panel background'],
            [appearance, 'show-privacy-indicators', 'Privacy indicators',
                'Show camera, microphone, location, and screen sharing activity reported by GNOME'],
        ];

        const behavior = new Adw.PreferencesGroup({
            title: 'Live activities',
            description: 'Choose what can temporarily take over the Dynamic Island.',
        });
        page.add(behavior);
        toggles.push(
            [behavior, 'show-notifications', 'Show notifications in Nova',
                'Preview new GNOME notifications inside the island'],
            [behavior, 'replace-native-notifications', 'Nova-only notification banners',
                'Hide ordinary GNOME banners only when Nova previews them. Critical alerts stay native.'],
            [behavior, 'show-volume', 'Nova volume indicator',
                'Enable Nova’s volume overlay (GNOME may show its own OSD too)'],
            [behavior, 'replace-native-osd', 'Replace native volume/brightness OSD',
                'Show Nova in place of supported GNOME volume/brightness popups. Other overlays remain.'],
            [behavior, 'show-brightness', 'Brightness', 'Show compatible laptop screen brightness changes'],
            [behavior, 'show-recording', 'Screen recording', 'Show GNOME’s built-in screencast status'],
            [behavior, 'show-downloads', 'Downloads', 'Watch the default Downloads folder for activity'],
            [behavior, 'show-timer', 'Timer', 'Enable countdown timers in the calendar'],
            [behavior, 'show-media-visualizer', 'Animated music bars',
                'Disable the decorative animation to minimize CPU activity'],
            [behavior, 'developer-activities', 'Developer activity API',
                'Opt-in: accept short local D-Bus status cards from same-user apps']
        );
        for (const [group, key, title, subtitle] of toggles) {
            const row = new Adw.SwitchRow({title, subtitle});
            group.add(row);
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        }

        const presetRow = new Adw.ComboRow({
            title: 'Island theme',
            subtitle: 'Choose a color palette or keep your custom accent',
            model: Gtk.StringList.new(THEME_PRESETS.map(item => item.name)),
        });
        appearance.add(presetRow);
        presetRow.selected = Math.max(0, THEME_PRESETS.findIndex(
            item => item.id === settings.get_string('theme-preset')
        ));
        presetRow.connect('notify::selected', () => {
            const selected = THEME_PRESETS[presetRow.selected];
            if (selected && settings.get_string('theme-preset') !== selected.id)
                settings.set_string('theme-preset', selected.id);
        });
        settings.connect('changed::theme-preset', () => {
            const index = THEME_PRESETS.findIndex(
                item => item.id === settings.get_string('theme-preset')
            );
            if (index >= 0 && presetRow.selected !== index)
                presetRow.selected = index;
        });

        const shortcutRow = new Adw.ComboRow({
            title: 'Toggle Nova shortcut',
            subtitle: 'Optional shortcut; disabled by default to avoid conflicts',
            model: Gtk.StringList.new(KEYBOARD_SHORTCUTS.map(item => item.name)),
        });
        appearance.add(shortcutRow);
        const getShortcutIndex = () => Math.max(0, KEYBOARD_SHORTCUTS.findIndex(
            item => item.accelerator === validShortcut(settings.get_strv('toggle-shortcut'))
        ));
        shortcutRow.selected = getShortcutIndex();
        shortcutRow.connect('notify::selected', () => {
            const selected = KEYBOARD_SHORTCUTS[shortcutRow.selected];
            if (selected)
                settings.set_strv('toggle-shortcut',
                    selected.accelerator ? [selected.accelerator] : []);
        });
        settings.connect('changed::toggle-shortcut', () => {
            const index = getShortcutIndex();
            if (shortcutRow.selected !== index)
                shortcutRow.selected = index;
        });

        for (const [key, title, min, max] of [
            ['compact-width', 'Compact pill width', 132, 240],
            ['expanded-width', 'Expanded pill width', 300, 430],
            ['animation-duration', 'Animation time (ms)', 100, 500],
        ]) {
            const row = new Adw.SpinRow({
                title,
                adjustment: new Gtk.Adjustment({
                    lower: min,
                    upper: max,
                    step_increment: key === 'animation-duration' ? 10 : 2,
                    page_increment: 10,
                    value: settings.get_int(key),
                }),
                digits: 0,
            });
            appearance.add(row);
            row.connect('notify::value', () => {
                const next = Math.round(row.value);
                if (settings.get_int(key) !== next)
                    settings.set_int(key, next);
            });
            settings.connect(`changed::${key}`, () => {
                const next = settings.get_int(key);
                if (Math.round(row.value) !== next)
                    row.value = next;
            });
        }

        const color = new Adw.EntryRow({
            title: 'Accent color (#RRGGBB)',
            text: settings.get_string('accent-color'),
        });
        appearance.add(color);
        // Keep invalid text out of the live stylesheet.
        color.connect('changed', () => {
            if (/^#[0-9a-fA-F]{6}$/.test(color.text)) {
                settings.set_string('accent-color', color.text);
                // Editing the color intentionally returns to Custom mode.
                settings.set_string('theme-preset', 'custom');
            }
        });
    }
}
