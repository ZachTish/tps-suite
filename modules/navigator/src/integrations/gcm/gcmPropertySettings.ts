import type { App } from 'obsidian';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../constants/tpsIdentity';
import { getPluginById, getRecordValue, isRecord } from '../../utils/typeGuards';
import { showNotice } from '../../utils/noticeUtils';

/** False only when the shared settings route is unavailable. */
export function openGcmPropertySettings(app: App): boolean {
    const plugin = getPluginById(app, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID);
    const api = isRecord(plugin) ? getRecordValue(plugin, 'api') : null;
    const ui = isRecord(api) ? getRecordValue(api, 'ui') : null;
    if (!isRecord(ui) || typeof ui.openCustomPropertySettings !== 'function') return false;
    try {
        return ui.openCustomPropertySettings.call(ui) !== false;
    } catch (error) {
        console.error('[TPS Notebook Navigator] Custom property settings could not open', error);
        showNotice('Could not open GCM Custom properties. Open TPS Global Context Menu settings to try again.', { variant: 'warning' });
        return true;
    }
}
