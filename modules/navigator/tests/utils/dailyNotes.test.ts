import { App, TFile } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createDailyNote,
    getConfiguredDailyNoteSettings,
    getConfiguredDailyNoteTemplatePath,
    getDailyNoteFile,
    getDailyNoteSettings,
    type DailyNoteSettings
} from '../../src/utils/dailyNotes';
import { resetMomentApiCacheForTests, type MomentApi, type MomentInstance } from '../../src/utils/moment';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../src/constants/tpsIdentity';
import { TEMPLATER_PLUGIN_ID } from '../../src/constants/pluginIds';

const SETTINGS: DailyNoteSettings = {
    folder: '',
    format: 'YYYY-MM-DD',
    template: 'Templates/Daily'
};
const INCOMPLETE_TEMPLATE_MARKER = '<!-- tps-daily-note-template-incomplete:v1 -->';

function createDate(formatted: Readonly<Record<string, string>> = {}): MomentInstance {
    const value = {
        format: vi.fn((format: string) => formatted[format] ?? '2026-08-03'),
        year: vi.fn(() => 2026),
        month: vi.fn(() => 7),
        date: vi.fn(() => 3),
        clone: vi.fn(() => value),
        add: vi.fn(() => value),
        subtract: vi.fn(() => value),
        set: vi.fn(() => value),
        get: vi.fn(() => 0)
    } as unknown as MomentInstance;
    return value;
}

function installMomentApi(): void {
    const now = {
        format: vi.fn((format: string) => (format === 'HH:mm' ? '12:34' : format)),
        get: vi.fn(() => 0)
    } as unknown as MomentInstance;
    const momentApi = (() => now) as MomentApi;
    momentApi.locales = () => ['en'];
    momentApi.locale = () => 'en';
    momentApi.fn = {};
    momentApi.utc = () => ({});
    vi.stubGlobal('window', { moment: momentApi });
    resetMomentApiCacheForTests();
}

function registerGcmDailyNotes(app: App, dailyNotes: Record<string, unknown>): void {
    const existingPlugins = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins ?? {};
    Object.assign(app, {
        plugins: {
            enabledPlugins: new Set([TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]),
            plugins: {
                ...existingPlugins,
                [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]: { api: { dailyNotes } }
            }
        }
    });
}

function registerGcmTemplates(app: App, templates: Record<string, unknown>): void {
    const appWithPlugins = app as unknown as { plugins?: { enabledPlugins?: Set<string>; plugins?: Record<string, unknown> } };
    const existingPlugins = appWithPlugins.plugins?.plugins ?? {};
    const existingGcm = existingPlugins[TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID] as { api?: Record<string, unknown> } | undefined;
    Object.assign(app, {
        plugins: {
            enabledPlugins: new Set(appWithPlugins.plugins?.enabledPlugins ?? []),
            plugins: {
                ...existingPlugins,
                [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]: {
                    ...existingGcm,
                    api: { ...(existingGcm?.api ?? {}), templates }
                }
            }
        }
    });
}

function registerTemplater(app: App, templater: Record<string, unknown>, settings: Record<string, unknown> = {}): void {
    const appWithPlugins = app as unknown as { plugins?: { enabledPlugins?: Set<string>; plugins?: Record<string, unknown> } };
    Object.assign(app, {
        plugins: {
            enabledPlugins: new Set([...(appWithPlugins.plugins?.enabledPlugins ?? []), TEMPLATER_PLUGIN_ID]),
            plugins: {
                ...(appWithPlugins.plugins?.plugins ?? {}),
                [TEMPLATER_PLUGIN_ID]: { templater, settings }
            }
        }
    });
}

function registerCoreDailyNotes(app: App, settings: DailyNoteSettings, enabled = true): void {
    Object.assign(app, {
        internalPlugins: {
            getPluginById: vi.fn(() => ({
                enabled,
                instance: { options: settings }
            }))
        }
    });
    if (settings.folder === '' && settings.format === 'YYYY-MM-DD' && settings.template === '') {
        Object.assign(app.vault, { configDir: ['.ob', 'sidian'].join('') });
        Object.assign(app.vault.adapter, { read: vi.fn(async () => JSON.stringify(settings)) });
    }
}

function createGcmDailyNotes(overrides: Readonly<Record<string, unknown>> = {}) {
    return {
        version: 2,
        findForIsoDate: vi.fn(() => null),
        pathForIsoDate: vi.fn(() => '2026-08-03.md'),
        ensureForIsoDate: vi.fn(async () => null),
        ...overrides
    };
}

describe('daily note template safety', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        resetMomentApiCacheForTests();
    });
    it('delegates Core-mode resolution to GCM Daily Notes v2', () => {
        const app = new App();
        const canonical = new TFile('Journal/2026-08-03.md');
        const findForIsoDate = vi.fn(() => canonical);
        const dailyNotes = createGcmDailyNotes({ findForIsoDate });
        registerGcmDailyNotes(app, dailyNotes);

        expect(getDailyNoteFile(app, createDate(), SETTINGS)).toBe(canonical);
        expect(findForIsoDate).toHaveBeenCalledWith('2026-08-03');
    });

    it('accepts a structurally compatible future GCM Daily Notes version', () => {
        const app = new App();
        const canonical = new TFile('Journal/2026-08-03.md');
        const findForIsoDate = vi.fn(() => canonical);
        registerGcmDailyNotes(app, createGcmDailyNotes({ version: 5, findForIsoDate }));

        expect(getDailyNoteFile(app, createDate(), SETTINGS)).toBe(canonical);
        expect(findForIsoDate).toHaveBeenCalledWith('2026-08-03');
    });

    it('uses locale-invariant ASCII ISO dates for the GCM contract', async () => {
        const app = new App();
        const localizedDate = createDate({ 'YYYY-MM-DD': '٢٠٢٦-٠٨-٠٣' });
        const canonical = new TFile('Journal/2026-08-03.md');
        const findForIsoDate = vi.fn(() => canonical);
        const ensureForIsoDate = vi.fn(async () => canonical);
        registerGcmDailyNotes(app, createGcmDailyNotes({ findForIsoDate, ensureForIsoDate }));

        expect(getDailyNoteFile(app, localizedDate, SETTINGS)).toBe(canonical);
        await expect(createDailyNote(app, localizedDate)).resolves.toBe(canonical);
        expect(findForIsoDate).toHaveBeenCalledWith('2026-08-03');
        expect(ensureForIsoDate).toHaveBeenCalledWith('2026-08-03');
    });

    it('keeps GCM Daily Note lookup synchronous when a malformed provider returns a Promise', () => {
        const app = new App();
        const canonical = new TFile('Journal/2026-08-03.md');
        registerGcmDailyNotes(app, createGcmDailyNotes({ findForIsoDate: vi.fn(async () => canonical) }));

        expect(getDailyNoteFile(app, createDate(), SETTINGS)).toBeNull();
    });

    it('treats a GCM resolution null as authoritative instead of accepting a local lookalike', () => {
        const app = new App();
        const localLookalike = new TFile('2026-08-03.md');
        const localLookup = vi.fn(() => localLookalike);
        Object.assign(app.vault, { getAbstractFileByPath: localLookup });
        registerGcmDailyNotes(app, createGcmDailyNotes());

        expect(getDailyNoteFile(app, createDate(), SETTINGS)).toBeNull();
        expect(localLookup).not.toHaveBeenCalled();
    });

    it('fails lookup closed while an enabled GCM provider is still starting', () => {
        const app = new App();
        const localLookalike = new TFile('2026-08-03.md');
        const localLookup = vi.fn(() => localLookalike);
        Object.assign(app.vault, { getAbstractFileByPath: localLookup });
        Object.assign(app, {
            plugins: {
                enabledPlugins: new Set([TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]),
                plugins: { [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]: {} }
            }
        });

        expect(getDailyNoteFile(app, createDate(), SETTINGS)).toBeNull();
        expect(localLookup).not.toHaveBeenCalled();
    });

    it('delegates creation to GCM and does not fall back when GCM returns null', async () => {
        const app = new App();
        const ensureForIsoDate = vi.fn(async () => null);
        const create = vi.fn();
        Object.assign(app.vault, { create });
        registerGcmDailyNotes(app, createGcmDailyNotes({ ensureForIsoDate }));

        await expect(createDailyNote(app, createDate())).resolves.toBeNull();
        expect(ensureForIsoDate).toHaveBeenCalledWith('2026-08-03');
        expect(create).not.toHaveBeenCalled();
    });

    it('keeps unconstrained creation compatible with GCM Daily Notes v3', async () => {
        const app = new App();
        const created = new TFile('Journal/2026-08-03.md');
        const ensureForIsoDate = vi.fn(async () => created);
        registerGcmDailyNotes(app, createGcmDailyNotes({ version: 3, ensureForIsoDate }));

        await expect(createDailyNote(app, createDate())).resolves.toBe(created);
        expect(ensureForIsoDate).toHaveBeenCalledWith('2026-08-03');
    });

    it('binds a confirmed target to GCM Daily Notes v4 across a provider settings race', async () => {
        const app = new App();
        const expectedPath = 'Journal/2026-08-03.md';
        let currentPath = expectedPath;
        const ensureForIsoDate = vi.fn(async (_isoDate: string, options?: { expectedPath?: string }) => {
            // Simulate Core changing after Navigator showed/confirmed path A
            // but before GCM reaches its authoritative mutation boundary.
            currentPath = 'Changed/2026-08-03.md';
            return options?.expectedPath === currentPath ? new TFile(currentPath) : null;
        });
        const create = vi.fn();
        registerCoreDailyNotes(app, SETTINGS);
        Object.assign(app.vault, { create });
        registerGcmDailyNotes(
            app,
            createGcmDailyNotes({
                version: 4,
                pathForIsoDate: vi.fn(() => currentPath),
                ensureForIsoDate
            })
        );

        await expect(createDailyNote(app, createDate(), { expectedSettings: SETTINGS, expectedPath })).resolves.toBeNull();
        expect(ensureForIsoDate).toHaveBeenCalledWith('2026-08-03', { expectedPath });
        expect(create).not.toHaveBeenCalled();
    });

    it('fails a constrained confirmation closed with a pre-v4 GCM provider', async () => {
        const app = new App();
        const ensureForIsoDate = vi.fn(async () => new TFile('Journal/2026-08-03.md'));
        registerCoreDailyNotes(app, SETTINGS);
        registerGcmDailyNotes(app, createGcmDailyNotes({ version: 3, ensureForIsoDate }));

        await expect(
            createDailyNote(app, createDate(), {
                expectedSettings: SETTINGS,
                expectedPath: 'Journal/2026-08-03.md'
            })
        ).resolves.toBeNull();
        expect(ensureForIsoDate).not.toHaveBeenCalled();
    });

    it('fails a confirmed GCM creation closed when its preflight path was not supplied', async () => {
        const app = new App();
        const ensureForIsoDate = vi.fn(async () => new TFile('Journal/2026-08-03.md'));
        registerCoreDailyNotes(app, SETTINGS);
        registerGcmDailyNotes(app, createGcmDailyNotes({ version: 4, ensureForIsoDate }));

        await expect(createDailyNote(app, createDate(), { expectedSettings: SETTINGS })).resolves.toBeNull();
        expect(ensureForIsoDate).not.toHaveBeenCalled();
    });

    it('does not create through the standalone path while enabled GCM is still starting', async () => {
        const app = new App();
        const create = vi.fn();
        Object.assign(app.vault, { create });
        Object.assign(app, {
            plugins: {
                enabledPlugins: new Set([TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]),
                plugins: { [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]: { api: {} } }
            }
        });

        await expect(createDailyNote(app, createDate())).resolves.toBeNull();
        expect(create).not.toHaveBeenCalled();
    });

    it('returns the GCM-created Daily Note only after the authoritative ensure settles', async () => {
        const app = new App();
        const created = new TFile('Journal/2026-08-03.md');
        const ensureForIsoDate = vi.fn(async () => created);
        const create = vi.fn();
        Object.assign(app.vault, { create });
        registerGcmDailyNotes(app, createGcmDailyNotes({ ensureForIsoDate }));

        await expect(createDailyNote(app, createDate())).resolves.toBe(created);
        expect(create).not.toHaveBeenCalled();
    });

    it('recovers a saved template while Core Daily Notes still exposes incomplete startup options', async () => {
        const app = new App();
        Object.assign(app, {
            internalPlugins: {
                getPluginById: vi.fn(() => ({
                    enabled: true,
                    instance: { options: { folder: '', format: 'YYYY-MM-DD' } }
                }))
            }
        });
        Object.assign(app.vault.adapter, {
            read: vi.fn(async () => JSON.stringify({ folder: 'Persisted/Daily', format: 'YYYY/YYYYMMDD', template: 'Templates/Daily' }))
        });
        Object.assign(app.vault, { configDir: ['.ob', 'sidian'].join('') });

        await expect(getConfiguredDailyNoteTemplatePath(app)).resolves.toBe('Templates/Daily');
        await expect(getConfiguredDailyNoteSettings(app)).resolves.toEqual({
            folder: 'Persisted/Daily',
            format: 'YYYY/YYYYMMDD',
            template: 'Templates/Daily'
        });
    });

    it('fails sync lookup closed until a slow exact-default startup snapshot is coherently cached', async () => {
        const nowSpy = vi.spyOn(Date, 'now');
        let now = 1_800_000_000_000;
        nowSpy.mockImplementation(() => now);
        try {
            const app = new App();
            const unrelatedRoot = new TFile('2026-08-03.md');
            const canonical = new TFile('Journal/2026/08/03.md');
            const lookup = vi.fn((path: string) =>
                path === canonical.path ? canonical : path === unrelatedRoot.path ? unrelatedRoot : null
            );
            registerCoreDailyNotes(app, { folder: '', format: 'YYYY-MM-DD', template: '' });
            Object.assign(app.vault, {
                configDir: ['.ob', 'sidian'].join(''),
                getAbstractFileByPath: lookup
            });
            Object.assign(app.vault.adapter, {
                read: vi.fn(async () => JSON.stringify({ folder: 'Journal', format: 'YYYY/MM/DD', template: '' }))
            });

            expect(getDailyNoteSettings(app)).toBeNull();
            expect(lookup).not.toHaveBeenCalled();
            now += 60_000;

            await expect(getConfiguredDailyNoteSettings(app)).resolves.toEqual({
                folder: 'Journal',
                format: 'YYYY/MM/DD',
                template: ''
            });
            const cached = getDailyNoteSettings(app);
            expect(cached).toEqual({ folder: 'Journal', format: 'YYYY/MM/DD', template: '' });
            expect(getDailyNoteFile(app, createDate({ 'YYYY/MM/DD': '2026/08/03' }), cached!)).toBe(canonical);
            expect(lookup).toHaveBeenCalledWith('Journal/2026/08/03.md');
            expect(lookup).not.toHaveBeenCalledWith('2026-08-03.md');
        } finally {
            nowSpy.mockRestore();
        }
    });

    it('does not inherit stale Daily Notes settings when the Core plugin is disabled', async () => {
        const app = new App();
        Object.assign(app, {
            internalPlugins: {
                getPluginById: vi.fn(() => ({
                    enabled: false,
                    instance: { options: { template: '' } }
                }))
            }
        });
        const read = vi.fn(async () => JSON.stringify({ template: 'Templates/Stale' }));
        Object.assign(app.vault.adapter, { read });

        await expect(getConfiguredDailyNoteTemplatePath(app)).resolves.toBeNull();
        expect(read).not.toHaveBeenCalled();
    });

    it('creates with the persisted folder that owns a recovered startup template', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile('Persisted/Daily/2026-08-03.md');
        const create = vi.fn(async () => created);
        Object.assign(app, {
            internalPlugins: {
                getPluginById: vi.fn(() => ({
                    enabled: true,
                    instance: { options: { folder: '', format: 'YYYY-MM-DD' } }
                }))
            }
        });
        Object.assign(app.vault, {
            configDir: ['.ob', 'sidian'].join(''),
            create,
            createFolder: vi.fn(async () => undefined),
            cachedRead: vi.fn(async () => '# Daily template\n')
        });
        Object.assign(app.vault.adapter, {
            read: vi.fn(async () => JSON.stringify({ folder: 'Persisted/Daily', format: 'YYYY-MM-DD', template: 'Templates/Daily' }))
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });

        await expect(createDailyNote(app, createDate())).resolves.toBe(created);
        expect(create).toHaveBeenCalledWith('Persisted/Daily/2026-08-03.md', '# Daily template\n');
    });

    it('uses a coherent persisted folder and format when startup runtime options are incomplete and the template is blank', async () => {
        const app = new App();
        const created = new TFile('Journal/2026/08/03.md');
        const create = vi.fn(async () => created);
        Object.assign(app, {
            internalPlugins: {
                getPluginById: vi.fn(() => ({
                    enabled: true,
                    instance: { options: { folder: '', format: 'YYYY-MM-DD' } }
                }))
            }
        });
        Object.assign(app.vault, {
            configDir: ['.ob', 'sidian'].join(''),
            create,
            createFolder: vi.fn(async () => undefined)
        });
        Object.assign(app.vault.adapter, {
            read: vi.fn(async () => JSON.stringify({ folder: 'Journal', format: 'YYYY/MM/DD', template: '' }))
        });

        await expect(createDailyNote(app, createDate({ 'YYYY-MM-DD': '2026-08-03', 'YYYY/MM/DD': '2026/08/03' }))).resolves.toBe(created);
        expect(create).toHaveBeenCalledWith('Journal/2026/08/03.md', '');
    });

    it('fails closed when incomplete startup options have no coherent persisted snapshot', async () => {
        const app = new App();
        const create = vi.fn();
        Object.assign(app, {
            internalPlugins: {
                getPluginById: vi.fn(() => ({
                    enabled: true,
                    instance: { options: { folder: 'Journal', format: 'YYYY/MM/DD' } }
                }))
            }
        });
        Object.assign(app.vault, { configDir: ['.ob', 'sidian'].join(''), create });
        Object.assign(app.vault.adapter, {
            read: vi.fn(async () => {
                throw new Error('Core settings are not readable yet');
            })
        });

        await expect(getConfiguredDailyNoteSettings(app)).resolves.toBeNull();
        await expect(createDailyNote(app, createDate())).resolves.toBeNull();
        expect(create).not.toHaveBeenCalled();
    });

    it('keeps a live transition to complete blank/default runtime settings authoritative over stale disk settings', async () => {
        const app = new App();
        const created = new TFile('2026-08-03.md');
        const create = vi.fn(async () => created);
        const cachedRead = vi.fn();
        const runtimeSettings = { folder: 'Current', format: 'YYYY-MM-DD', template: 'Templates/Current' };
        registerCoreDailyNotes(app, runtimeSettings);
        Object.assign(app.vault, {
            configDir: ['.ob', 'sidian'].join(''),
            create,
            createFolder: vi.fn(async () => undefined),
            cachedRead
        });
        const persistedRead = vi.fn(async () => JSON.stringify({ folder: 'Old', format: 'YYYY/MM/DD', template: 'Templates/Old' }));
        Object.assign(app.vault.adapter, { read: persistedRead });

        await expect(getConfiguredDailyNoteSettings(app)).resolves.toEqual(runtimeSettings);
        Object.assign(runtimeSettings, { folder: '', format: 'YYYY-MM-DD', template: '' });
        await expect(createDailyNote(app, createDate())).resolves.toBe(created);
        expect(create).toHaveBeenCalledWith('2026-08-03.md', '');
        expect(cachedRead).not.toHaveBeenCalled();
        expect(persistedRead).not.toHaveBeenCalled();
    });

    it('uses the latest Core folder, format, and template instead of a stale caller snapshot', async () => {
        const app = new App();
        const template = new TFile('Templates/Current.md');
        const created = new TFile('Journal/2026/08/03.md');
        const create = vi.fn(async () => created);
        Object.assign(app, {
            internalPlugins: {
                getPluginById: vi.fn(() => ({
                    enabled: true,
                    instance: {
                        options: { folder: 'Journal', format: 'YYYY/MM/DD', template: 'Templates/Current' }
                    }
                }))
            }
        });
        Object.assign(app.vault, {
            create,
            createFolder: vi.fn(async () => undefined),
            cachedRead: vi.fn(async () => '# Current Daily Note\n')
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });

        await expect(createDailyNote(app, createDate({ 'YYYY-MM-DD': '2026-08-03', 'YYYY/MM/DD': '2026/08/03' }))).resolves.toBe(created);
        expect(create).toHaveBeenCalledWith('Journal/2026/08/03.md', '# Current Daily Note\n');
    });

    it('fails closed when Core settings change after a confirmation snapshot', async () => {
        const app = new App();
        const create = vi.fn();
        registerCoreDailyNotes(app, { folder: 'Current', format: 'YYYY/MM/DD', template: '' });
        Object.assign(app.vault, { create });

        await expect(
            createDailyNote(app, createDate(), {
                expectedSettings: { folder: 'Old', format: 'YYYY-MM-DD', template: '' }
            })
        ).resolves.toBeNull();
        expect(create).not.toHaveBeenCalled();
    });

    it('fails closed when Core is disabled after a confirmation snapshot', async () => {
        const app = new App();
        const create = vi.fn();
        registerCoreDailyNotes(app, SETTINGS, false);
        Object.assign(app.vault, { create });

        await expect(createDailyNote(app, createDate(), { expectedSettings: SETTINGS })).resolves.toBeNull();
        expect(create).not.toHaveBeenCalled();
    });

    it('preserves standalone confirmed creation when the approved path still matches Core', async () => {
        const app = new App();
        const settings: DailyNoteSettings = { folder: 'Journal', format: 'YYYY-MM-DD', template: '' };
        const created = new TFile('Journal/2026-08-03.md');
        const create = vi.fn(async () => created);
        registerCoreDailyNotes(app, settings);
        Object.assign(app.vault, {
            create,
            createFolder: vi.fn(async () => undefined)
        });

        await expect(
            createDailyNote(app, createDate(), {
                expectedSettings: settings,
                expectedPath: 'Journal/2026-08-03.md'
            })
        ).resolves.toBe(created);
        expect(create).toHaveBeenCalledWith('Journal/2026-08-03.md', '');
    });

    it('fails standalone creation closed when the approved path no longer matches Core', async () => {
        const app = new App();
        const settings: DailyNoteSettings = { folder: 'Journal', format: 'YYYY-MM-DD', template: '' };
        const create = vi.fn();
        registerCoreDailyNotes(app, settings);
        Object.assign(app.vault, { create });

        await expect(
            createDailyNote(app, createDate(), {
                expectedSettings: settings,
                expectedPath: 'Old/2026-08-03.md'
            })
        ).resolves.toBeNull();
        expect(create).not.toHaveBeenCalled();
    });

    it('serializes one ISO date and revalidates Core settings after a delayed template read', async () => {
        const app = new App();
        const template = new TFile('Templates/Old.md');
        let currentSettings: DailyNoteSettings = {
            folder: 'Old',
            format: 'YYYY-MM-DD',
            template: 'Templates/Old'
        };
        let finishTemplateRead: ((contents: string) => void) | null = null;
        const delayedTemplate = new Promise<string>(resolve => {
            finishTemplateRead = resolve;
        });
        const cachedRead = vi.fn(() => delayedTemplate);
        const create = vi.fn();
        Object.assign(app, {
            internalPlugins: {
                getPluginById: vi.fn(() => ({
                    enabled: true,
                    instance: { options: currentSettings }
                }))
            }
        });
        Object.assign(app.vault, {
            create,
            createFolder: vi.fn(async () => undefined),
            cachedRead
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });

        const first = createDailyNote(app, createDate());
        await vi.waitFor(() => expect(cachedRead).toHaveBeenCalledTimes(1));
        currentSettings = { folder: 'New', format: 'YYYY-MM-DD', template: '' };
        const second = createDailyNote(app, createDate());
        finishTemplateRead?.('# Old template\n');

        await expect(Promise.all([first, second])).resolves.toEqual([null, null]);
        expect(create).not.toHaveBeenCalled();
        expect(cachedRead).toHaveBeenCalledTimes(1);
    });

    it('fails closed when a configured template cannot be resolved', async () => {
        const app = new App();
        const create = vi.fn();
        Object.assign(app.vault, { create });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => null) });

        registerCoreDailyNotes(app, SETTINGS);
        await expect(createDailyNote(app, createDate())).resolves.toBeNull();
        expect(create).not.toHaveBeenCalled();
    });

    it('reads and inserts a configured template before returning the created daily note', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile('2026-08-03.md');
        const create = vi.fn(async () => created);
        const cachedRead = vi.fn(async (file: TFile) => (file.path === template.path ? '# Daily template\n' : ''));
        Object.assign(app.vault, { create, cachedRead });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });

        registerCoreDailyNotes(app, SETTINGS);
        await expect(createDailyNote(app, createDate())).resolves.toBe(created);
        expect(cachedRead).toHaveBeenCalledWith(template);
        expect(create).toHaveBeenCalledWith('2026-08-03.md', '# Daily template\n');
    });

    it('still creates from a readable template when optional fold-state loading fails', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile('2026-08-03.md');
        const create = vi.fn(async () => created);
        Object.assign(app.vault, { create, cachedRead: vi.fn(async () => '# Daily template\n') });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
        Object.assign(app, {
            foldManager: {
                load: vi.fn(() => {
                    throw new Error('fold store unavailable');
                }),
                save: vi.fn()
            }
        });

        registerCoreDailyNotes(app, SETTINGS);
        await expect(createDailyNote(app, createDate())).resolves.toBe(created);
        expect(create).toHaveBeenCalledWith('2026-08-03.md', '# Daily template\n');
    });

    it('creates a blank daily note when no template is configured', async () => {
        const app = new App();
        const created = new TFile('2026-08-03.md');
        const create = vi.fn(async () => created);
        const cachedRead = vi.fn();
        Object.assign(app.vault, { create, cachedRead });

        registerCoreDailyNotes(app, { ...SETTINGS, template: '' });
        await expect(createDailyNote(app, createDate())).resolves.toBe(created);
        expect(cachedRead).not.toHaveBeenCalled();
        expect(create).toHaveBeenCalledWith('2026-08-03.md', '');
    });

    it('leaves a mature exact Daily Note with literal Templater text byte-stable', async () => {
        const app = new App();
        const existing = new TFile('2026-08-03.md');
        const overwriteFileCommands = vi.fn(async () => undefined);
        const create = vi.fn();
        const modify = vi.fn();
        const read = vi.fn(async () => 'Example: <% this is documentation, not a pending template %>\n');
        Object.assign(app.vault, {
            getAbstractFileByPath: vi.fn(() => existing),
            create,
            modify,
            read
        });
        registerTemplater(app, { overwrite_file_commands: overwriteFileCommands });

        registerCoreDailyNotes(app, { ...SETTINGS, template: '' });
        await expect(createDailyNote(app, createDate())).resolves.toBe(existing);
        expect(overwriteFileCommands).not.toHaveBeenCalled();
        expect(read).toHaveBeenCalledWith(existing);
        expect(create).not.toHaveBeenCalled();
        expect(modify).not.toHaveBeenCalled();
    });

    it('settles a just-created exact file only when it still matches the configured raw template', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const existing = new TFile('2026-08-03.md');
        existing.stat = { ctime: Date.now(), mtime: Date.now() };
        let content = 'title: <% tp.date.now("YYYY-MM-DD") %>\n';
        const overwriteFileCommands = vi.fn(async () => {
            content = 'title: 2026-08-03\n';
        });
        const create = vi.fn();
        Object.assign(app.vault, {
            getAbstractFileByPath: vi.fn(() => existing),
            create,
            cachedRead: vi.fn(async () => 'title: <% tp.date.now("YYYY-MM-DD") %>\n'),
            read: vi.fn(async () => content),
            modify: vi.fn(async () => undefined)
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
        Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: false })) });
        registerTemplater(app, { overwrite_file_commands: overwriteFileCommands });
        registerCoreDailyNotes(app, SETTINGS);

        await expect(createDailyNote(app, createDate())).resolves.toBe(existing);
        expect(overwriteFileCommands).toHaveBeenCalledTimes(1);
        expect(create).not.toHaveBeenCalled();
    });

    it('passively awaits a pre-existing file that Templater already marks pending', async () => {
        vi.useFakeTimers();
        try {
            const app = new App();
            const template = new TFile('Templates/Daily.md');
            const existing = new TFile('2026-08-03.md');
            const pendingFiles = new Set([existing.path]);
            let content = '<% tp.date.now() %>\n';
            const overwriteFileCommands = vi.fn(async () => {
                content = '2026-08-03\n';
            });
            Object.assign(app.vault, {
                getAbstractFileByPath: vi.fn(() => existing),
                create: vi.fn(),
                cachedRead: vi.fn(async () => '<% tp.date.now() %>\n'),
                read: vi.fn(async () => content),
                modify: vi.fn(async () => undefined)
            });
            Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
            Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: true })) });
            registerTemplater(
                app,
                { overwrite_file_commands: overwriteFileCommands, files_with_pending_templates: pendingFiles },
                { trigger_on_file_creation: true }
            );
            registerCoreDailyNotes(app, SETTINGS);
            window.setTimeout(() => {
                void overwriteFileCommands(existing, false).then(() => pendingFiles.delete(existing.path));
            }, 300);

            const creation = createDailyNote(app, createDate());
            await vi.advanceTimersByTimeAsync(450);

            await expect(creation).resolves.toBe(existing);
            expect(overwriteFileCommands).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('awaits one explicit Templater pass when the device auto-create hook is off', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile('2026-08-03.md');
        let finishTemplater: (() => void) | null = null;
        const templaterFinished = new Promise<void>(resolve => {
            finishTemplater = resolve;
        });
        let content = '<% tp.date.now() %>\n';
        const overwriteFileCommands = vi.fn(async () => {
            await templaterFinished;
            content = '2026-08-03\n';
        });
        const create = vi.fn(async () => created);
        Object.assign(app.vault, {
            create,
            cachedRead: vi.fn(async () => '<% tp.date.now() %>\n'),
            read: vi.fn(async () => content),
            modify: vi.fn(async () => undefined)
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
        Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: false })) });
        registerTemplater(app, { overwrite_file_commands: overwriteFileCommands });

        let settled = false;
        registerCoreDailyNotes(app, SETTINGS);
        const pending = createDailyNote(app, createDate()).then(value => {
            settled = true;
            return value;
        });
        await vi.waitFor(() => expect(overwriteFileCommands).toHaveBeenCalledTimes(1));
        expect(settled).toBe(false);
        finishTemplater?.();

        await expect(pending).resolves.toBe(created);
        expect(overwriteFileCommands).toHaveBeenCalledWith(created, false);
        expect(create).toHaveBeenCalledWith('2026-08-03.md', '<% tp.date.now() %>\n');
    });

    it('renders Core variables before Templater and preserves literal Core tokens emitted by Templater', async () => {
        installMomentApi();
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile('2026-08-03.md');
        let content = '';
        const overwriteFileCommands = vi.fn(async () => {
            expect(content).toBe('scheduled: 2026-08-03\n<% tp.user.render() %>\n');
            content = 'Templater documentation: {{date}}\n';
        });
        const create = vi.fn(async (_path: string, initialContents: string) => {
            content = initialContents;
            return created;
        });
        const modify = vi.fn(async () => undefined);
        Object.assign(app.vault, {
            create,
            cachedRead: vi.fn(async () => 'scheduled: {{date}}\n<% tp.user.render() %>\n'),
            read: vi.fn(async () => content),
            modify
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
        Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: false })) });
        registerTemplater(app, { overwrite_file_commands: overwriteFileCommands });
        registerCoreDailyNotes(app, SETTINGS);

        await expect(createDailyNote(app, createDate())).resolves.toBe(created);
        expect(content).toBe('Templater documentation: {{date}}\n');
        expect(overwriteFileCommands).toHaveBeenCalledTimes(1);
        expect(modify).not.toHaveBeenCalled();
    });

    it('removes only the shared template marker before and after Daily Note Templater execution', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile('2026-08-03.md');
        let content = '---\ntags: [template, keep]\n---\n<% tp.user.render() %>\n#template\n';
        const prepareInstanceSource = vi.fn((source: string) => source.replace('template, ', ''));
        const overwriteFileCommands = vi.fn(async () => {
            content = content.replace('tags: [keep]', 'tags: [template, keep]').replace('<% tp.user.render() %>', 'Rendered');
        });
        Object.assign(app.vault, {
            create: vi.fn(async (_path: string, initialContents: string) => {
                content = initialContents;
                return created;
            }),
            cachedRead: vi.fn(async () => content),
            read: vi.fn(async () => content),
            process: vi.fn(async (_file: TFile, processor: (source: string) => string) => {
                content = processor(content);
                return content;
            }),
            modify: vi.fn(async () => undefined)
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
        Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: false })) });
        registerGcmTemplates(app, {
            version: 1,
            getMode: () => 'tag',
            matches: () => false,
            prepareInstanceSource
        });
        registerTemplater(app, { overwrite_file_commands: overwriteFileCommands });
        registerCoreDailyNotes(app, SETTINGS);

        await expect(createDailyNote(app, createDate())).resolves.toBe(created);
        expect(content).toBe('---\ntags: [keep]\n---\nRendered\n#template\n');
        expect(prepareInstanceSource).toHaveBeenCalledTimes(2);
    });

    it('waits for the device auto-create hook without executing Templater twice', async () => {
        vi.useFakeTimers();
        try {
            const app = new App();
            const template = new TFile('Templates/Daily.md');
            const created = new TFile('2026-08-03.md');
            const pendingFiles = new Set<string>();
            let content = '<% tp.date.now() %>\n';
            const overwriteFileCommands = vi.fn(async () => {
                content = '2026-08-03\n';
            });
            const create = vi.fn(async (path: string) => {
                pendingFiles.add(path);
                window.setTimeout(() => {
                    void overwriteFileCommands(created, false).then(() => pendingFiles.delete(path));
                }, 300);
                return created;
            });
            Object.assign(app.vault, {
                create,
                cachedRead: vi.fn(async () => '<% tp.date.now() %>\n'),
                read: vi.fn(async () => content),
                modify: vi.fn(async () => undefined)
            });
            Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
            Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: true })) });
            registerTemplater(
                app,
                { overwrite_file_commands: overwriteFileCommands, files_with_pending_templates: pendingFiles },
                { trigger_on_file_creation: true }
            );
            registerCoreDailyNotes(app, SETTINGS);

            const creation = createDailyNote(app, createDate());
            await vi.advanceTimersByTimeAsync(450);

            await expect(creation).resolves.toBe(created);
            expect(overwriteFileCommands).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('anchors the auto-hook grace period to completion of a slow vault create', async () => {
        vi.useFakeTimers();
        try {
            const app = new App();
            const template = new TFile('Templates/Daily.md');
            const created = new TFile('2026-08-03.md');
            const pendingFiles = new Set<string>();
            let content = '<% tp.date.now() %>\n';
            const overwriteFileCommands = vi.fn(async () => {
                content = '2026-08-03\n';
            });
            const create = vi.fn(
                (path: string) =>
                    new Promise<TFile>(resolve => {
                        window.setTimeout(() => {
                            window.setTimeout(() => {
                                pendingFiles.add(path);
                                void overwriteFileCommands(created, false).then(() => pendingFiles.delete(path));
                            }, 300);
                            resolve(created);
                        }, 1_000);
                    })
            );
            Object.assign(app.vault, {
                create,
                cachedRead: vi.fn(async () => '<% tp.date.now() %>\n'),
                read: vi.fn(async () => content),
                modify: vi.fn(async () => undefined)
            });
            Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
            Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: true })) });
            registerTemplater(
                app,
                { overwrite_file_commands: overwriteFileCommands, files_with_pending_templates: pendingFiles },
                { trigger_on_file_creation: true }
            );
            registerCoreDailyNotes(app, SETTINGS);

            let settled = false;
            const creation = createDailyNote(app, createDate()).then(file => {
                settled = true;
                return file;
            });
            await vi.advanceTimersByTimeAsync(1_200);
            expect(settled).toBe(false);
            await vi.advanceTimersByTimeAsync(300);

            await expect(creation).resolves.toBe(created);
            expect(overwriteFileCommands).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it.each([
        {
            name: 'template-folder substring',
            format: '[MyTemplatesDaily-]YYYY-MM-DD',
            path: 'MyTemplatesDaily-2026-08-03.md',
            templaterSettings: { templates_folder: 'Templates' }
        },
        {
            name: 'ignored-folder prefix',
            format: '[Dailyish-]YYYY-MM-DD',
            path: 'Dailyish-2026-08-03.md',
            templaterSettings: { ignore_folders_on_creation: ['Daily'] }
        }
    ])('mirrors Templater auto-hook exclusion for a $name lookalike path', async ({ format, path, templaterSettings }) => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile(path);
        let content = '<% tp.date.now() %>\n';
        const overwriteFileCommands = vi.fn(async () => {
            content = '2026-08-03\n';
        });
        const create = vi.fn(async () => created);
        Object.assign(app.vault, {
            create,
            cachedRead: vi.fn(async () => '<% tp.date.now() %>\n'),
            read: vi.fn(async () => content),
            modify: vi.fn(async () => undefined)
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
        Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: true })) });
        registerTemplater(
            app,
            { overwrite_file_commands: overwriteFileCommands },
            { trigger_on_file_creation: true, ...templaterSettings }
        );
        registerCoreDailyNotes(app, { folder: '', format, template: SETTINGS.template });

        await expect(createDailyNote(app, createDate({ [format]: path.replace(/\.md$/u, '') }))).resolves.toBe(created);
        expect(overwriteFileCommands).toHaveBeenCalledTimes(1);
    });

    it('fails closed when the manual Templater API disappears after exact-path creation', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile('2026-08-03.md');
        const overwriteFileCommands = vi.fn(async () => undefined);
        const create = vi.fn(async () => {
            const manager = (app as App & { plugins: { plugins: Record<string, unknown> } }).plugins;
            manager.plugins = {};
            return created;
        });
        Object.assign(app.vault, {
            create,
            cachedRead: vi.fn(async () => '<% tp.date.now() %>\n'),
            read: vi.fn(async () => '<% tp.date.now() %>\n'),
            modify: vi.fn(async () => undefined)
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
        Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: false })) });
        registerTemplater(app, { overwrite_file_commands: overwriteFileCommands });
        registerCoreDailyNotes(app, SETTINGS);

        await expect(createDailyNote(app, createDate())).resolves.toBeNull();
        expect(overwriteFileCommands).not.toHaveBeenCalled();
    });

    it('awaits an auto folder-template hook for a fresh empty Core Daily Note', async () => {
        vi.useFakeTimers();
        try {
            const app = new App();
            const created = new TFile('2026-08-03.md');
            const pendingFiles = new Set<string>();
            let content = '';
            const overwriteFileCommands = vi.fn(async () => {
                content = '# Applied folder template\n';
            });
            const create = vi.fn(async (path: string) => {
                pendingFiles.add(path);
                window.setTimeout(() => {
                    void overwriteFileCommands(created, false).then(() => pendingFiles.delete(path));
                }, 300);
                return created;
            });
            Object.assign(app.vault, {
                create,
                read: vi.fn(async () => content),
                modify: vi.fn(async () => undefined)
            });
            Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: true })) });
            registerTemplater(
                app,
                { overwrite_file_commands: overwriteFileCommands, files_with_pending_templates: pendingFiles },
                {
                    trigger_on_file_creation: true,
                    folder_templates: [{ folder: '/', template: 'Templates/Daily' }]
                }
            );
            registerCoreDailyNotes(app, { ...SETTINGS, template: '' });

            let settled = false;
            const creation = createDailyNote(app, createDate()).then(file => {
                settled = true;
                return file;
            });
            await vi.advanceTimersByTimeAsync(250);
            expect(settled).toBe(false);
            await vi.advanceTimersByTimeAsync(200);

            await expect(creation).resolves.toBe(created);
            expect(content).toBe('# Applied folder template\n');
            expect(overwriteFileCommands).toHaveBeenCalledTimes(1);
            expect(create).toHaveBeenCalledWith('2026-08-03.md', '');
        } finally {
            vi.useRealTimers();
        }
    });

    it('awaits a recent empty exact file before the delayed auto hook marks it pending', async () => {
        vi.useFakeTimers();
        try {
            const app = new App();
            const existing = new TFile('2026-08-03.md');
            existing.stat = { ctime: Date.now(), mtime: Date.now() };
            const pendingFiles = new Set<string>();
            let content = '';
            const overwriteFileCommands = vi.fn(async () => {
                content = '# Delayed folder template\n';
            });
            const create = vi.fn();
            Object.assign(app.vault, {
                getAbstractFileByPath: vi.fn(() => existing),
                create,
                read: vi.fn(async () => content),
                modify: vi.fn(async () => undefined)
            });
            Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: true })) });
            registerTemplater(
                app,
                { overwrite_file_commands: overwriteFileCommands, files_with_pending_templates: pendingFiles },
                {
                    trigger_on_file_creation: true,
                    file_regex_templates: [{ regex: '^2026-', template: 'Templates/Daily' }]
                }
            );
            registerCoreDailyNotes(app, { ...SETTINGS, template: '' });
            window.setTimeout(() => {
                pendingFiles.add(existing.path);
                void overwriteFileCommands(existing, false).then(() => pendingFiles.delete(existing.path));
            }, 300);

            const creation = createDailyNote(app, createDate());
            await vi.advanceTimersByTimeAsync(450);

            await expect(creation).resolves.toBe(existing);
            expect(content).toBe('# Delayed folder template\n');
            expect(overwriteFileCommands).toHaveBeenCalledTimes(1);
            expect(create).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('never retries a single Templater pass when output retains delimiters', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile('2026-08-03.md');
        let content = '<% tp.user.example() %>\n';
        const overwriteFileCommands = vi.fn(async () => {
            content = 'Literal example: <% retained on purpose %>\n';
        });
        Object.assign(app.vault, {
            create: vi.fn(async () => created),
            cachedRead: vi.fn(async () => '<% tp.user.example() %>\n'),
            read: vi.fn(async () => content),
            modify: vi.fn(async () => undefined)
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
        Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: false })) });
        registerTemplater(app, { overwrite_file_commands: overwriteFileCommands });
        registerCoreDailyNotes(app, SETTINGS);

        await expect(createDailyNote(app, createDate())).resolves.toBe(created);
        expect(overwriteFileCommands).toHaveBeenCalledTimes(1);
    });

    it('fails a silent auto-hook parse error when the prepared template bytes never change', async () => {
        vi.useFakeTimers();
        try {
            const app = new App();
            const template = new TFile('Templates/Daily.md');
            const created = new TFile('2026-08-03.md');
            const pendingFiles = new Set<string>();
            let currentFile: TFile | null = null;
            let content = '<% tp.user.missing() %>\n';
            const overwriteFileCommands = vi.fn(async () => undefined);
            const create = vi.fn(async (path: string) => {
                currentFile = created;
                pendingFiles.add(path);
                window.setTimeout(() => {
                    void overwriteFileCommands(created, false).then(() => pendingFiles.delete(path));
                }, 300);
                return created;
            });
            const process = vi.fn(async (_file: TFile, update: (contents: string) => string) => {
                content = update(content);
                return content;
            });
            Object.assign(app.vault, {
                getAbstractFileByPath: vi.fn(() => currentFile),
                create,
                cachedRead: vi.fn(async () => content),
                read: vi.fn(async () => content),
                modify: vi.fn(async () => undefined),
                process
            });
            Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
            Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: true })) });
            registerTemplater(
                app,
                { overwrite_file_commands: overwriteFileCommands, files_with_pending_templates: pendingFiles },
                { trigger_on_file_creation: true }
            );
            registerCoreDailyNotes(app, SETTINGS);

            const creation = createDailyNote(app, createDate());
            await vi.advanceTimersByTimeAsync(450);

            await expect(creation).resolves.toBeNull();
            expect(overwriteFileCommands).toHaveBeenCalledTimes(1);
            expect(process).toHaveBeenCalledTimes(1);
            expect(content.trimEnd()).toBe(`<% tp.user.missing() %>\n${INCOMPLETE_TEMPLATE_MARKER}`);
        } finally {
            vi.useRealTimers();
        }
    });

    it('appends durable failure evidence without breaking YAML and detects it after reload', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile('2026-08-03.md');
        let currentFile: TFile | null = null;
        let content = '---\nkind: dailynote\n---\n<% tp.user.missing() %>\n';
        const overwriteFileCommands = vi.fn(async () => undefined);
        const create = vi.fn(async () => {
            currentFile = created;
            return created;
        });
        const process = vi.fn(async (_file: TFile, update: (contents: string) => string) => {
            content = update(content);
            return content;
        });
        Object.assign(app.vault, {
            getAbstractFileByPath: vi.fn(() => currentFile),
            create,
            cachedRead: vi.fn(async () => '---\nkind: dailynote\n---\n<% tp.user.missing() %>\n'),
            read: vi.fn(async () => content),
            modify: vi.fn(async () => undefined),
            process
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
        Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: false })) });
        registerTemplater(app, { overwrite_file_commands: overwriteFileCommands });
        registerCoreDailyNotes(app, SETTINGS);

        await expect(createDailyNote(app, createDate())).resolves.toBeNull();
        expect(content.startsWith('---\nkind: dailynote\n---\n')).toBe(true);
        expect(content.trimEnd().endsWith(INCOMPLETE_TEMPLATE_MARKER)).toBe(true);
        content += '# Bytes appended by a later sync\n';

        const reloadedApp = new App();
        const reloadedCreate = vi.fn();
        const reloadedOverwrite = vi.fn();
        Object.assign(reloadedApp.vault, {
            getAbstractFileByPath: vi.fn(() => created),
            create: reloadedCreate,
            read: vi.fn(async () => content)
        });
        Object.assign(reloadedApp, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: false })) });
        registerTemplater(reloadedApp, { overwrite_file_commands: reloadedOverwrite });
        registerCoreDailyNotes(reloadedApp, SETTINGS);

        await expect(createDailyNote(reloadedApp, createDate())).resolves.toBeNull();
        expect(reloadedCreate).not.toHaveBeenCalled();
        expect(reloadedOverwrite).not.toHaveBeenCalled();
    });

    it('does not append a failure marker over a concurrent user edit', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const created = new TFile('2026-08-03.md');
        let currentFile: TFile | null = null;
        let content = '<% tp.user.partial() %>\n';
        const overwriteFileCommands = vi.fn(async () => {
            content = '# Partial output\n';
            throw new Error('Templater failed after writing partial output');
        });
        const create = vi.fn(async () => {
            currentFile = created;
            return created;
        });
        const process = vi.fn(async (_file: TFile, update: (contents: string) => string) => {
            content = '# Concurrent user edit\n';
            content = update(content);
            return content;
        });
        Object.assign(app.vault, {
            getAbstractFileByPath: vi.fn(() => currentFile),
            create,
            cachedRead: vi.fn(async () => '<% tp.user.partial() %>\n'),
            read: vi.fn(async () => content),
            modify: vi.fn(async () => undefined),
            process
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
        Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: false })) });
        registerTemplater(app, { overwrite_file_commands: overwriteFileCommands });
        registerCoreDailyNotes(app, SETTINGS);

        await expect(createDailyNote(app, createDate())).resolves.toBeNull();
        expect(content).toBe('# Concurrent user edit\n');
        expect(content).not.toContain(INCOMPLETE_TEMPLATE_MARKER);
        await expect(createDailyNote(app, createDate())).resolves.toBe(created);
        expect(create).toHaveBeenCalledTimes(1);
    });

    it('deduplicates concurrent standalone creation for the exact Core path', async () => {
        const app = new App();
        const created = new TFile('2026-08-03.md');
        let finishCreate: ((file: TFile) => void) | null = null;
        const createdLater = new Promise<TFile>(resolve => {
            finishCreate = resolve;
        });
        const create = vi.fn(() => createdLater);
        Object.assign(app.vault, { create });
        registerCoreDailyNotes(app, { ...SETTINGS, template: '' });

        const first = createDailyNote(app, createDate());
        const second = createDailyNote(app, createDate());
        await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1));
        finishCreate?.(created);

        await expect(Promise.all([first, second])).resolves.toEqual([created, created]);
        expect(create).toHaveBeenCalledTimes(1);
    });

    it('keeps an ordinary owner result while a constrained joiner independently rejects the wrong path', async () => {
        const app = new App();
        const ordinaryFile = new TFile('Changed/2026-08-03.md');
        let finishEnsure: ((file: TFile | null) => void) | null = null;
        const pendingEnsure = new Promise<TFile | null>(resolve => {
            finishEnsure = resolve;
        });
        const ensureForIsoDate = vi.fn(() => pendingEnsure);
        registerCoreDailyNotes(app, SETTINGS);
        registerGcmDailyNotes(app, createGcmDailyNotes({ version: 4, ensureForIsoDate }));

        const ordinary = createDailyNote(app, createDate());
        const constrained = createDailyNote(app, createDate(), {
            expectedSettings: SETTINGS,
            expectedPath: 'Journal/2026-08-03.md'
        });
        finishEnsure?.(ordinaryFile);

        await expect(Promise.all([ordinary, constrained])).resolves.toEqual([ordinaryFile, null]);
        expect(ensureForIsoDate).toHaveBeenCalledTimes(1);
        expect(ensureForIsoDate).toHaveBeenCalledWith('2026-08-03');
    });

    it('lets an ordinary joiner retry after a constrained owner declines', async () => {
        const app = new App();
        const ordinaryFile = new TFile('Changed/2026-08-03.md');
        let finishConstrainedEnsure: ((file: TFile | null) => void) | null = null;
        const constrainedEnsure = new Promise<TFile | null>(resolve => {
            finishConstrainedEnsure = resolve;
        });
        let invocation = 0;
        const ensureForIsoDate = vi.fn(async () => {
            invocation += 1;
            return invocation === 1 ? await constrainedEnsure : ordinaryFile;
        });
        registerCoreDailyNotes(app, SETTINGS);
        registerGcmDailyNotes(app, createGcmDailyNotes({ version: 4, ensureForIsoDate }));

        const constrained = createDailyNote(app, createDate(), {
            expectedSettings: SETTINGS,
            expectedPath: 'Journal/2026-08-03.md'
        });
        const ordinary = createDailyNote(app, createDate());
        await vi.waitFor(() => expect(ensureForIsoDate).toHaveBeenCalledTimes(1));
        finishConstrainedEnsure?.(null);

        await expect(Promise.all([constrained, ordinary])).resolves.toEqual([null, ordinaryFile]);
        expect(ensureForIsoDate).toHaveBeenCalledTimes(2);
        expect(ensureForIsoDate).toHaveBeenNthCalledWith(1, '2026-08-03', {
            expectedPath: 'Journal/2026-08-03.md'
        });
        expect(ensureForIsoDate).toHaveBeenNthCalledWith(2, '2026-08-03');
    });

    it('keeps one ISO owner when GCM becomes ready during standalone provider resolution', async () => {
        const app = new App();
        const standalone = new TFile('2026-08-03.md');
        const gcmCreated = new TFile('GCM/2026-08-03.md');
        const create = vi.fn(async () => standalone);
        const ensureForIsoDate = vi.fn(async () => gcmCreated);
        Object.assign(app.vault, { create });
        registerCoreDailyNotes(app, { ...SETTINGS, template: '' });

        const first = createDailyNote(app, createDate());
        registerGcmDailyNotes(app, createGcmDailyNotes({ ensureForIsoDate }));
        const second = createDailyNote(app, createDate());

        await expect(Promise.all([first, second])).resolves.toEqual([standalone, standalone]);
        expect(create).toHaveBeenCalledTimes(1);
        expect(ensureForIsoDate).not.toHaveBeenCalled();
    });

    it('returns the exact-path winner when another creator wins the vault collision', async () => {
        const app = new App();
        const winner = new TFile('2026-08-03.md');
        let winnerVisible = false;
        const create = vi.fn(async () => {
            winnerVisible = true;
            throw new Error('File already exists');
        });
        Object.assign(app.vault, {
            getAbstractFileByPath: vi.fn(() => (winnerVisible ? winner : null)),
            create,
            read: vi.fn(async () => '')
        });
        registerCoreDailyNotes(app, { ...SETTINGS, template: '' });

        await expect(createDailyNote(app, createDate())).resolves.toBe(winner);
        expect(create).toHaveBeenCalledTimes(1);
    });

    it('settles a raw external winner that appears while the configured template is being prepared', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const winner = new TFile('2026-08-03.md');
        winner.stat = { ctime: Date.now(), mtime: Date.now() };
        const templateContent = '---\ntags: [template, keep]\n---\n<% tp.date.now() %>\n#template\n';
        let content = templateContent;
        const prepareInstanceSource = vi.fn((source: string) => source.replace('template, ', ''));
        const overwriteFileCommands = vi.fn(async () => {
            content = content.replace('tags: [keep]', 'tags: [template, keep]').replace('<% tp.date.now() %>', '2026-08-03');
        });
        const create = vi.fn();
        const lookup = vi.fn().mockReturnValueOnce(null).mockReturnValueOnce(winner);
        Object.assign(app.vault, {
            getAbstractFileByPath: lookup,
            create,
            cachedRead: vi.fn(async () => templateContent),
            read: vi.fn(async () => content),
            modify: vi.fn(async (_file: TFile, next: string) => {
                content = next;
            }),
            process: vi.fn(async (_file: TFile, processor: (source: string) => string) => {
                content = processor(content);
                return content;
            })
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
        Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: false })) });
        registerGcmTemplates(app, {
            version: 1,
            getMode: () => 'tag',
            matches: () => false,
            prepareInstanceSource
        });
        registerTemplater(app, { overwrite_file_commands: overwriteFileCommands });
        registerCoreDailyNotes(app, SETTINGS);

        await expect(createDailyNote(app, createDate())).resolves.toBe(winner);
        expect(overwriteFileCommands).toHaveBeenCalledTimes(1);
        expect(prepareInstanceSource).toHaveBeenCalledTimes(3);
        expect(content).toBe('---\ntags: [keep]\n---\n2026-08-03\n#template\n');
        expect(create).not.toHaveBeenCalled();
    });

    it('fails closed when a colliding raw winner cannot finish Templater processing', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const winner = new TFile('2026-08-03.md');
        winner.stat = { ctime: Date.now(), mtime: Date.now() };
        let winnerVisible = false;
        const overwriteFileCommands = vi.fn(async () => {
            throw new Error('Templater failed');
        });
        const create = vi.fn(async () => {
            winnerVisible = true;
            throw new Error('File already exists');
        });
        Object.assign(app.vault, {
            getAbstractFileByPath: vi.fn(() => (winnerVisible ? winner : null)),
            create,
            cachedRead: vi.fn(async () => '<% tp.date.now() %>\n'),
            read: vi.fn(async () => '<% tp.date.now() %>\n'),
            modify: vi.fn(async () => undefined)
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });
        Object.assign(app, { loadLocalStorage: vi.fn(() => ({ trigger_on_file_creation: false })) });
        registerTemplater(app, { overwrite_file_commands: overwriteFileCommands });
        registerCoreDailyNotes(app, SETTINGS);

        await expect(createDailyNote(app, createDate())).resolves.toBeNull();
        expect(overwriteFileCommands).toHaveBeenCalledTimes(1);
    });

    it('fails before creating when a Templater template has no callable processor', async () => {
        const app = new App();
        const template = new TFile('Templates/Daily.md');
        const create = vi.fn();
        Object.assign(app.vault, {
            create,
            cachedRead: vi.fn(async () => '<% tp.date.now() %>\n')
        });
        Object.assign(app.metadataCache, { getFirstLinkpathDest: vi.fn(() => template) });

        registerCoreDailyNotes(app, SETTINGS);
        await expect(createDailyNote(app, createDate())).resolves.toBeNull();
        expect(create).not.toHaveBeenCalled();
    });
});
