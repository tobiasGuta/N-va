import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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
        ];

        const behavior = new Adw.PreferencesGroup({
            title: 'Live activities',
            description: 'Choose what can temporarily take over the Dynamic Island.',
        });
        page.add(behavior);
        toggles.push(
            [behavior, 'show-notifications', 'Notifications', 'Show new notification titles briefly'],
            [behavior, 'show-volume', 'Volume', 'Show a volume indicator on system volume changes'],
            [behavior, 'show-brightness', 'Brightness', 'Show compatible laptop screen brightness changes'],
            [behavior, 'show-recording', 'Screen recording', 'Show GNOME’s built-in screencast status'],
            [behavior, 'show-downloads', 'Downloads', 'Watch the default Downloads folder for activity'],
            [behavior, 'show-timer', 'Timer', 'Enable countdown timers in the calendar']
        );
        for (const [group, key, title, subtitle] of toggles) {
            const row = new Adw.SwitchRow({title, subtitle});
            group.add(row);
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        }

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
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        }

        const color = new Adw.EntryRow({
            title: 'Accent color (#RRGGBB)',
            text: settings.get_string('accent-color'),
        });
        appearance.add(color);
        // Keep invalid text out of the live stylesheet.
        color.connect('changed', () => {
            if (/^#[0-9a-fA-F]{6}$/.test(color.text))
                settings.set_string('accent-color', color.text);
        });
    }
}
