import type { App, TFile } from 'obsidian';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../constants/tpsIdentity';
import { getPluginById, getRecordValue, isRecord } from './typeGuards';
import { showNotice } from './noticeUtils';

export interface NotePresentationOrigin {
    anchorEl: HTMLElement;
    event: MouseEvent;
}

export function getTpsNoteOpeningApi(app: App) {
    const plugin = getPluginById(app, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID);
    const api = isRecord(plugin) ? getRecordValue(plugin, 'api') : null;
    const ui = isRecord(api) ? getRecordValue(api, 'ui') : null;
    if (!isRecord(ui) || typeof ui.presentCreatedNote !== 'function') return null;
    const present = ui.presentCreatedNote;
    const openSettings = ui.openNoteOpeningSettings;
    return {
        present: async (file: TFile, openInNewTab: boolean, renameTitle: boolean, origin?: NotePresentationOrigin): Promise<boolean> =>
            (await present.call(ui, {
                filePath: file.path,
                sourcePluginId: 'tps-notebook-navigator',
                sourceLeaf: app.workspace.getMostRecentLeaf?.(),
                renameTitle,
                ...(origin?.anchorEl.isConnected ? { anchorEl: origin.anchorEl, event: origin.event } : {}),
                ...(openInNewTab ? { explicitDestination: 'tab' } : {})
            })) === true,
        openSettings:
            typeof openSettings === 'function'
                ? () => {
                      openSettings.call(ui);
                  }
                : null
    };
}

/** A stored Navigator preference applies only when the shared owner is unavailable. */
export function legacyNewNoteTabPreference(app: App, preference: boolean): boolean {
    return getTpsNoteOpeningApi(app) ? false : preference;
}

/** False means no shared handler. Never repeat an opening after a provider error. */
export async function presentCreatedNote(
    app: App,
    file: TFile,
    openInNewTab = false,
    renameTitle = true,
    origin?: NotePresentationOrigin
): Promise<boolean> {
    if (file.extension !== 'md') return false;
    const api = getTpsNoteOpeningApi(app);
    if (!api) return false;
    try {
        return (await api.present(file, openInNewTab, renameTitle, origin)) === true;
    } catch (error) {
        console.error('[TPS Notebook Navigator] Created note presentation failed', { path: file.path, error });
        showNotice('Note created, but it could not open. Open the note from Navigator.', { variant: 'warning' });
        return true;
    }
}
