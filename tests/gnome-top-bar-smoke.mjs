import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

const UUID = 'nova@tobiasguta.github.io';
const KEEP_VISIBLE = 'keep-visible-when-panel-hidden';

function check(condition, message) {
    if (!condition)
        throw new Error(message);
}

function canPick(actor) {
    const [x, y] = actor.get_transformed_position();
    const [width, height] = actor.get_transformed_size();
    return actor.mapped && actor.contains(global.stage.get_actor_at_pos(
        Clutter.PickMode.REACTIVE, x + width / 2, y + height / 2
    ));
}

async function checkPanelSlide(panelBox, targetY, island) {
    const startY = panelBox.y;
    const islandY = island.y;
    const center = island.x + island.width / 2;
    const height = island.height;
    const samples = [];
    const id = panelBox.connect('notify::y', () => {
        samples.push({
            panelY: panelBox.y,
            stable: island.mapped && island.y === islandY &&
                island.x + island.width / 2 === center && island.height === height,
        });
    });
    await panelBox.easeAsync({y: targetY, duration: 350, mode: Clutter.AnimationMode.EASE_OUT_QUAD});
    panelBox.disconnect(id);
    const animated = samples.some(({panelY}) =>
        panelY > Math.min(startY, targetY) && panelY < Math.max(startY, targetY));
    check(animated, 'Panel slide did not produce an intermediate frame');
    check(samples.every(({stable}) => stable), 'Nova moved, resized or disappeared during panel slide');
}

export async function run() {
    const layout = Main.layoutManager;
    const panelBox = layout.panelBox;
    const manager = Main.extensionManager;
    const clock = Main.panel.statusArea.dateMenu.container;

    Main.overview.hide();
    manager.disableExtension(UUID);
    await Scripting.sleep(500);
    const originalPanelStyle = Main.panel.get_style() ?? '';
    const originalClockVisibility = clock.visible;

    manager.enableExtension(UUID);
    await Scripting.sleep(250);
    const nova = manager.lookup(UUID).stateObj;
    const island = nova._island;
    const settings = nova.getSettings();
    const monitor = layout.primaryMonitor;
    const normalY = island.y;
    check(settings.get_boolean(KEEP_VISIBLE), 'Expected independent placement by default');
    check(island.get_parent() === layout.uiGroup, 'Nova needs its own chrome actor');
    check(!clock.visible && originalClockVisibility, 'Nova should replace the visible native clock');
    check(canPick(island), 'Compact Nova is inaccessible with the panel shown');
    const fitsPanel = normalY > monitor.y && normalY + island.height <= monitor.y + panelBox.height;
    const centered = island.x === Math.round(monitor.x + (monitor.width - island.width) / 2);
    check(fitsPanel && centered, 'Compact Nova is outside its usual position');

    // Re-register after Nova as Hide Top Bar does. An opaque panel would
    // otherwise cover the compact island and steal clicks when revealed.
    layout.removeChrome(panelBox);
    layout.addChrome(panelBox, {affectsStruts: false, trackFullscreen: true});
    await Scripting.sleep(100);
    const children = layout.uiGroup.get_children();
    const abovePanel = children.indexOf(panelBox) < children.indexOf(island);
    const belowPopups = children.indexOf(island) < children.indexOf(global.top_window_group);
    check(abovePanel && belowPopups, 'Chrome restacking must place Nova above the panel and below client popups');
    check(canPick(island), 'Re-registered panel blocks Nova input');

    const shownY = panelBox.y;
    await checkPanelSlide(panelBox, shownY - panelBox.height, island);
    panelBox.hide();
    await Scripting.sleep(100);
    check(!Main.panel.mapped && canPick(island), 'Nova must stay interactive with the panel unmapped');

    const originalHeight = Main.panel.height;
    Main.panel.set_height(originalHeight + 12);
    await Scripting.sleep(100);
    check(island.y > normalY, 'Nova should account for a taller panel while it is hidden');
    Main.panel.set_height(-1);
    await Scripting.sleep(100);

    nova._setExpanded(true);
    await Scripting.sleep(400);
    check(island.y === normalY && island.height > panelBox.height &&
        canPick(nova._calendarPin), 'Expanded calendar controls must remain accessible below the panel');

    settings.set_boolean(KEEP_VISIBLE, false);
    await Scripting.sleep(100);
    check(island.y === normalY - panelBox.height, 'Disabling the setting should use panel-relative coordinates');
    settings.set_boolean(KEEP_VISIBLE, true);
    await Scripting.sleep(100);
    check(island.y === normalY && canPick(nova._calendarPin), 'Live toggle should restore expanded Nova');

    panelBox.show();
    await checkPanelSlide(panelBox, shownY, island);
    nova._setExpanded(false);
    await Scripting.sleep(400);
    check(island.y === normalY && canPick(island), 'Compact Nova should remain interactive after reveal');

    await Scripting.createTestWindow({redraws: true});
    await Scripting.waitTestWindows();
    await Scripting.sleep(250);
    const windows = global.get_window_actors().map(actor => actor.meta_window);
    const window = windows.find(win => win.get_monitor() === monitor.index && win.get_frame_rect().width > 0);
    check(window, 'Could not find a mapped test window on the primary monitor. Found ' +
        windows.map(win => `${win.get_wm_class()} (${win.get_frame_rect().width}px)`).join(', '));
    Main.activateWindow(window);
    await Scripting.sleep(250);
    window.make_fullscreen();
    window.raise();
    await Scripting.sleep(500);
    const frame = window.get_frame_rect();
    check(window.fullscreen && monitor.inFullscreen && !island.visible,
        `Expected Nova to hide in fullscreen (window: ${window.fullscreen}, ` +
        `monitor: ${monitor.inFullscreen}, overview: ${Main.overview.visible}, ` +
        `windows: ${global.window_group.visible}, Nova: ${island.visible}, ` +
        `frame: ${frame.width}x${frame.height}+${frame.x}+${frame.y})`);
    Main.overview.show();
    await Scripting.sleep(500);
    check(island.mapped && island.y === normalY, 'Nova should return at the same position in overview');
    Main.overview.hide();
    await Scripting.sleep(500);
    check(!island.visible, 'Nova should hide when returning to the fullscreen app');
    window.unmake_fullscreen();
    await Scripting.sleep(500);
    check(island.mapped && island.y === normalY, 'Nova should return after leaving fullscreen');
    await Scripting.destroyTestWindows();

    layout.removeChrome(panelBox);
    layout.addChrome(panelBox, {affectsStruts: true, trackFullscreen: true});
    check(nova._restackLaterId, 'Panel re-registration should schedule a restack');
    manager.disableExtension(UUID);
    await Scripting.sleep(150);
    check(!layout.uiGroup.get_children().includes(island) && !nova._island &&
        !nova._restackLaterId, 'Disable should remove chrome and pending restacks');
    check((Main.panel.get_style() ?? '') === originalPanelStyle &&
        clock.visible === originalClockVisibility, 'Disable should restore the native panel style and clock');

    layout.removeChrome(panelBox);
    layout.addChrome(panelBox, {affectsStruts: true, trackFullscreen: true});
    check(!nova._restackLaterId, 'Panel re-registration should leave a disabled Nova alone');
    manager.enableExtension(UUID);
    await Scripting.sleep(250);
    check(nova._island !== island && canPick(nova._island), 'Re-enable should create interactive chrome');
    manager.disableExtension(UUID);
    await Scripting.sleep(150);
    print('Nova top bar smoke test passed');
}
