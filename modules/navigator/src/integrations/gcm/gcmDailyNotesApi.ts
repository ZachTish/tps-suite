/*
 * TPS Notebook Navigator - optional GCM Daily Notes adapter.
 *
 * Core Daily Notes mode treats this API as authoritative when it is present.
 * Keeping the adapter structural avoids a source/runtime dependency on GCM.
 */

import { TFile, type App } from 'obsidian';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../constants/tpsIdentity';

export interface GcmDailyNotesApi {
    readonly version: number;
    findForIsoDate(isoDate: string): TFile | null;
    dateForFile?(file: Pick<TFile, 'path' | 'basename'>): string | null;
    pathForIsoDate(isoDate: string): string | null;
    ensureForIsoDate(isoDate: string, options?: GcmDailyNoteEnsureOptions): Promise<TFile | null>;
}

export interface GcmDailyNoteEnsureOptions {
    /**
     * GCM Daily Notes v4 validates this target again at its final mutation
     * boundary. Older providers remain callable only when no constraint is
     * required.
     */
    expectedPath?: string | null;
}

export type GcmDailyNotesResolution =
    | { status: 'absent'; api: null }
    | { status: 'blocked'; api: null; reason: 'provider-not-ready' }
    | { status: 'ready'; api: GcmDailyNotesApi };

interface PluginManagerLike {
    enabledPlugins?: { has(pluginId: string): boolean } | string[];
    getPlugin?(pluginId: string): unknown;
    plugins?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function isExplicitlyDisabled(manager: PluginManagerLike, pluginId: string): boolean {
    const enabled = manager.enabledPlugins;
    if (!enabled) {
        return false;
    }
    if (Array.isArray(enabled)) {
        return !enabled.includes(pluginId);
    }
    return !enabled.has(pluginId);
}

/**
 * Resolves GCM's complete Daily Notes v2-or-newer capability without conflating an
 * enabled-but-starting provider with an absent provider. Only the latter may
 * use Notebook Navigator's standalone Core Daily Notes fallback.
 */
export function resolveGcmDailyNotesApi(app: App): GcmDailyNotesResolution {
    const manager = (app as App & { plugins?: PluginManagerLike }).plugins;
    if (!manager || isExplicitlyDisabled(manager, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID)) {
        return { status: 'absent', api: null };
    }

    let plugin: unknown = null;
    try {
        plugin = manager.getPlugin?.(TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID) ?? manager.plugins?.[TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID] ?? null;
    } catch {
        return { status: 'blocked', api: null, reason: 'provider-not-ready' };
    }

    if (!isRecord(plugin)) {
        const enabled = manager.enabledPlugins;
        const explicitlyEnabled = Array.isArray(enabled)
            ? enabled.includes(TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID)
            : enabled?.has(TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID) === true;
        return explicitlyEnabled ? { status: 'blocked', api: null, reason: 'provider-not-ready' } : { status: 'absent', api: null };
    }
    if (!isRecord(plugin.api) || !isRecord(plugin.api.dailyNotes)) {
        return { status: 'blocked', api: null, reason: 'provider-not-ready' };
    }

    const dailyNotes = plugin.api.dailyNotes;
    const findForIsoDate = dailyNotes.findForIsoDate;
    const dateForFile = dailyNotes.dateForFile;
    const pathForIsoDate = dailyNotes.pathForIsoDate;
    const ensureForIsoDate = dailyNotes.ensureForIsoDate;
    if (
        typeof dailyNotes.version !== 'number' ||
        dailyNotes.version < 2 ||
        typeof findForIsoDate !== 'function' ||
        typeof pathForIsoDate !== 'function' ||
        typeof ensureForIsoDate !== 'function'
    ) {
        return { status: 'blocked', api: null, reason: 'provider-not-ready' };
    }
    const dailyNotesVersion = dailyNotes.version;

    return {
        status: 'ready',
        api: {
            version: dailyNotesVersion,
            findForIsoDate: (isoDate: string) => {
                const result: unknown = findForIsoDate.call(dailyNotes, isoDate);
                return result instanceof TFile ? result : null;
            },
            ...(dailyNotesVersion >= 3 && typeof dateForFile === 'function'
                ? {
                      dateForFile: (file: Pick<TFile, 'path' | 'basename'>) => {
                          const result: unknown = dateForFile.call(dailyNotes, file);
                          return typeof result === 'string' && result.trim() ? result.trim() : null;
                      }
                  }
                : {}),
            pathForIsoDate: (isoDate: string) => {
                const result: unknown = pathForIsoDate.call(dailyNotes, isoDate);
                return typeof result === 'string' && result.trim() ? result : null;
            },
            ensureForIsoDate: async (isoDate: string, options?: GcmDailyNoteEnsureOptions) => {
                const result: unknown =
                    dailyNotesVersion >= 4 && options
                        ? await ensureForIsoDate.call(dailyNotes, isoDate, options)
                        : await ensureForIsoDate.call(dailyNotes, isoDate);
                return result instanceof TFile ? result : null;
            }
        }
    };
}
