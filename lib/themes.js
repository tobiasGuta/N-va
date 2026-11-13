// Shared by GNOME Shell and GTK preferences. No GUI dependencies here.
export const THEME_PRESETS = Object.freeze([
    {id: 'custom', name: 'Custom', background: '#050608', defaultAccent: '#baff80'},
    {id: 'mint', name: 'Mint', background: '#050907', defaultAccent: '#baff80'},
    {id: 'ocean', name: 'Ocean', background: '#060c15', defaultAccent: '#7cc9ff'},
    {id: 'violet', name: 'Violet', background: '#0c0814', defaultAccent: '#c6a3ff'},
    {id: 'sunset', name: 'Sunset', background: '#140b09', defaultAccent: '#ffb17b'},
]);

export function resolveTheme(id, customAccent) {
    const preset = THEME_PRESETS.find(item => item.id === id) ?? THEME_PRESETS[0];
    const accent = preset.id === 'custom' &&
        /^#[\da-f]{6}$/i.test(customAccent ?? '') ?
        customAccent : preset.defaultAccent;
    return {id: preset.id, background: preset.background, accent};
}

export const KEYBOARD_SHORTCUTS = Object.freeze([
    {id: 'off', name: 'Disabled', accelerator: ''},
    {id: 'super-shift-n', name: 'Super + Shift + N',
        accelerator: '<Super><Shift>n'},
    {id: 'super-alt-n', name: 'Super + Alt + N',
        accelerator: '<Super><Alt>n'},
]);

export function validShortcut(settingsValues) {
    const accelerator = Array.isArray(settingsValues) && settingsValues.length === 1 ?
        settingsValues[0] : '';
    return KEYBOARD_SHORTCUTS.some(choice => choice.accelerator === accelerator) ?
        accelerator : '';
}
