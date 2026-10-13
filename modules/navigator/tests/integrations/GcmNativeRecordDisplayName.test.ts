import { describe, expect, it, vi } from 'vitest';
import { App, type TFile } from 'obsidian';
import { TPS_GCM_API_CHANGED_EVENT, TPS_GCM_API_REQUEST_EVENT, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../src/constants/tpsIdentity';
import {
    getFileDisplayNameWithGcmNativeFallback,
    resolveGcmNativeRecordDisplayName,
    subscribeGcmNativeRecordApiLifecycle
} from '../../src/integrations/gcm/gcmNativeRecordDisplayName';
import type { GcmNativeRecordsApiLike } from '../../src/integrations/gcm/gcmTaskApi';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import { collectFileBackedTypeFiles } from '../../src/hooks/listPaneData/typeListItems';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';
import { sortNavigationFiles } from '../../src/utils/fileFinder';
import { createTestTFile } from '../utils/createTestTFile';

function createSettings(overrides: Partial<NotebookNavigatorSettings> = {}): NotebookNavigatorSettings {
    return {
        ...DEFAULT_SETTINGS,
        tpsDataArchitectureMode: 'native-records',
        ...overrides
    };
}

function createNativeRecordsApi(
    options: {
        title?: string;
        mode?: 'legacy' | 'native-records';
        inspect?: GcmNativeRecordsApiLike['inspect'];
    } = {}
): GcmNativeRecordsApiLike {
    const title = options.title ?? 'Order carts';
    return {
        version: 3,
        getMode: vi.fn(() => options.mode ?? 'native-records'),
        inspect:
            options.inspect ??
            vi.fn(() => ({
                id: 'item_36424a52-d542-427c-bcd9-91c6fa296ce0',
                kind: 'task',
                schemaVersion: 1,
                frontmatter: { title }
            }))
    };
}

function installGcm(app: App, api: GcmNativeRecordsApiLike | Record<string, unknown>, enabled = true): void {
    const plugin = { api: { nativeRecords: api } };
    (app as App & { plugins: unknown }).plugins = {
        enabledPlugins: new Set(enabled ? [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID] : []),
        getPlugin: () => plugin,
        plugins: { [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]: plugin }
    };
}

function createApp(file: TFile, frontmatter: Record<string, unknown>, api = createNativeRecordsApi()): App {
    const app = new App();
    app.metadataCache.getFileCache = candidate => (candidate === file ? { frontmatter } : null);
    installGcm(app, api);
    return app;
}

describe('GCM native-record display names', () => {
    it('uses the API-verified canonical task title when no frontmatter display-name field is configured', () => {
        const file = createTestTFile('item_36424a52-d542-427c-bcd9-91c6fa296ce0.md');
        const frontmatter = { kind: 'task', title: 'Order carts' };
        const settings = createSettings();
        const app = createApp(file, frontmatter);

        expect(getFileDisplayNameWithGcmNativeFallback(app, file, undefined, settings)).toBe('Order carts');
        expect(frontmatter).toEqual({ kind: 'task', title: 'Order carts' });
        expect(settings.frontmatterNameField).toBe('');
        expect(file.path).toBe('item_36424a52-d542-427c-bcd9-91c6fa296ce0.md');
    });

    it('keeps an explicitly configured frontmatter display name above the native-record fallback', () => {
        const file = createTestTFile('item_36424a52-d542-427c-bcd9-91c6fa296ce0.md');
        const inspect = vi.fn(() => ({
            id: 'item_36424a52-d542-427c-bcd9-91c6fa296ce0',
            kind: 'task',
            schemaVersion: 1,
            frontmatter: { title: 'Order carts' }
        }));
        const api = createNativeRecordsApi({ inspect });
        const app = createApp(file, { kind: 'task', title: 'Order carts' }, api);
        const settings = createSettings({ useFrontmatterMetadata: true, frontmatterNameField: 'name' });

        expect(getFileDisplayNameWithGcmNativeFallback(app, file, { fn: 'My chosen label' }, settings)).toBe('My chosen label');
        expect(inspect).not.toHaveBeenCalled();

        expect(getFileDisplayNameWithGcmNativeFallback(app, file, { fn: '{{title}}' }, settings)).toBe('Order carts');
        expect(inspect).toHaveBeenCalledOnce();
    });

    it('unwraps only a strict whole wikilink and uses its alias or readable target', () => {
        const file = createTestTFile('calendar-w3c28h.md');

        const aliased = createApp(
            file,
            { kind: 'calendar-event' },
            createNativeRecordsApi({
                title: '[[2026-08-26 - Daily Standup for GCP App Support|Daily Standup for GCP App Support]]'
            })
        );
        expect(resolveGcmNativeRecordDisplayName(aliased, file)).toBe('Daily Standup for GCP App Support');

        const targetOnly = createApp(file, { kind: 'task' }, createNativeRecordsApi({ title: '[[Projects/Readable task.md]]' }));
        expect(resolveGcmNativeRecordDisplayName(targetOnly, file)).toBe('Readable task');

        const embedded = createApp(
            file,
            { kind: 'task' },
            createNativeRecordsApi({ title: 'Follow [[Projects/Readable task|Readable task]]' })
        );
        expect(resolveGcmNativeRecordDisplayName(embedded, file)).toBe('Follow [[Projects/Readable task|Readable task]]');

        const markdownLink = createApp(file, { kind: 'task' }, createNativeRecordsApi({ title: '[Readable task](https://example.com)' }));
        expect(resolveGcmNativeRecordDisplayName(markdownLink, file)).toBe('[Readable task](https://example.com)');
    });

    it.each([
        { case: 'escaped target pipe', title: String.raw`[[Tasks/Order\|carts.md]]`, expected: 'Order|carts' },
        {
            case: 'escaped alias pipe and backslash',
            title: String.raw`[[Tasks/Order carts.md|Server\\queue\|review]]`,
            expected: String.raw`Server\queue|review`
        },
        { case: 'escaped target hash', title: String.raw`[[Tasks/Order\#carts.md]]`, expected: 'Order#carts' },
        { case: 'escaped target caret', title: String.raw`[[Tasks/Order\^carts.md]]`, expected: 'Order^carts' },
        { case: 'escaped target bracket', title: String.raw`[[Tasks/Order\]carts.md]]`, expected: 'Order]carts' },
        {
            case: 'escaped backslash before escaped hash',
            title: String.raw`[[Tasks/Order\\\#carts.md]]`,
            expected: String.raw`Order\#carts`
        },
        { case: 'same-note heading', title: String.raw`[[#Quarterly \# review]]`, expected: 'Quarterly # review' },
        { case: 'same-note block', title: '[[^block-id]]', expected: 'block-id' },
        { case: 'file heading subpath', title: '[[Projects/Readable task.md#Quarterly review]]', expected: 'Readable task' },
        { case: 'file block subpath', title: '[[Projects/Readable task.md^block-id]]', expected: 'Readable task' }
    ])('respects $case syntax when unwrapping a whole wikilink', ({ title, expected }) => {
        const file = createTestTFile('item_opaque.md');
        const app = createApp(file, { kind: 'task' }, createNativeRecordsApi({ title }));

        expect(resolveGcmNativeRecordDisplayName(app, file)).toBe(expected);
    });

    it('keeps the raw canonical title when an escaped bracket consumes the apparent closing delimiter', () => {
        const file = createTestTFile('item_opaque.md');
        const title = String.raw`[[Tasks/Order\]]`;
        const app = createApp(file, { kind: 'task' }, createNativeRecordsApi({ title }));

        expect(resolveGcmNativeRecordDisplayName(app, file)).toBe(title);
    });

    it('rejects unresolved template output and fails closed for unverified or unavailable records', () => {
        const file = createTestTFile('item_opaque.md');
        const templateApp = createApp(file, { kind: 'task' }, createNativeRecordsApi({ title: '<% tp.file.title %>' }));
        expect(getFileDisplayNameWithGcmNativeFallback(templateApp, file, undefined, createSettings())).toBe('item_opaque');

        const ordinaryApi = createNativeRecordsApi({ inspect: vi.fn(() => null) });
        const ordinaryApp = createApp(file, { title: 'Ordinary note' }, ordinaryApi);
        expect(getFileDisplayNameWithGcmNativeFallback(ordinaryApp, file, undefined, createSettings())).toBe('item_opaque');

        const throwingApi = createNativeRecordsApi({
            inspect: vi.fn(() => {
                throw new Error('Synthetic inspection failure');
            })
        });
        const throwingApp = createApp(file, { kind: 'task' }, throwingApi);
        expect(getFileDisplayNameWithGcmNativeFallback(throwingApp, file, undefined, createSettings())).toBe('item_opaque');

        const legacyModeApp = createApp(file, { kind: 'task' }, createNativeRecordsApi({ mode: 'legacy' }));
        expect(getFileDisplayNameWithGcmNativeFallback(legacyModeApp, file, undefined, createSettings())).toBe('item_opaque');

        const oldApiApp = createApp(file, { kind: 'task' }, createNativeRecordsApi());
        installGcm(oldApiApp, { version: 1, getMode: vi.fn(), inspect: vi.fn() });
        expect(getFileDisplayNameWithGcmNativeFallback(oldApiApp, file, undefined, createSettings())).toBe('item_opaque');

        const disabledApp = createApp(file, { kind: 'task' }, createNativeRecordsApi());
        installGcm(disabledApp, createNativeRecordsApi(), false);
        expect(getFileDisplayNameWithGcmNativeFallback(disabledApp, file, undefined, createSettings())).toBe('item_opaque');

        const legacyNavigatorApp = createApp(file, { kind: 'task' }, createNativeRecordsApi());
        expect(
            getFileDisplayNameWithGcmNativeFallback(
                legacyNavigatorApp,
                file,
                undefined,
                createSettings({ tpsDataArchitectureMode: 'legacy' })
            )
        ).toBe('item_opaque');
    });

    it('sorts opaque record files by the same canonical titles shown in rows', () => {
        const first = createTestTFile('item_a.md');
        const second = createTestTFile('item_z.md');
        const frontmatterByPath = new Map([
            [first.path, { id: 'item_a', kind: 'task', title: 'Zulu' }],
            [second.path, { id: 'item_z', kind: 'task', title: 'Alpha' }]
        ]);
        const app = new App();
        app.metadataCache.getFileCache = file => ({ frontmatter: frontmatterByPath.get(file.path) });
        installGcm(app, {
            version: 3,
            getMode: () => 'native-records',
            inspect: (frontmatter: unknown) => {
                const record = frontmatter as { id: string; kind: string; title: string };
                return {
                    id: record.id,
                    kind: record.kind,
                    schemaVersion: 1,
                    frontmatter: { title: record.title }
                };
            }
        });

        const files = [first, second];
        sortNavigationFiles(files, createSettings(), app, {
            option: 'title-asc',
            propertyKey: '',
            propertySortSecondary: 'title'
        });

        expect(files.map(file => file.path)).toEqual([second.path, first.path]);
    });

    it('resorts a selected Notes Type when the live GCM display callback loads, is replaced, and unloads', () => {
        const first = createTestTFile('item_a.md');
        const second = createTestTFile('item_b.md');
        const third = createTestTFile('item_c.md');
        const visibleFiles = [first, second, third];
        const frontmatterByPath = new Map(
            visibleFiles.map(file => [file.path, { id: file.basename, kind: 'task', title: file.basename }] as const)
        );
        const app = new App();
        app.metadataCache.getFileCache = file => ({ frontmatter: frontmatterByPath.get(file.path) });
        const settings = createSettings({ useFrontmatterMetadata: false });
        const sortSpec = { option: 'title-asc' as const, propertyKey: '', propertySortSecondary: 'title' as const };
        const createMappedApi = (titles: Readonly<Record<string, string>>): GcmNativeRecordsApiLike => ({
            version: 3,
            getMode: () => 'native-records',
            inspect: (frontmatter: unknown) => {
                const record = frontmatter as { id: string; kind: string };
                const title = titles[record.id];
                return title ? { id: record.id, kind: record.kind, schemaVersion: 1, frontmatter: { title } } : null;
            }
        });
        const sortedSelectedNotes = (getLiveDisplayName: (file: TFile) => string): string[] => {
            const files = collectFileBackedTypeFiles(app, visibleFiles, TPS_NAVIGATOR_TYPE_IDS.NOTES);
            sortNavigationFiles(files, settings, app, sortSpec, getLiveDisplayName);
            return files.map(file => file.path);
        };
        const createLiveDisplayName = () => (file: TFile) => getFileDisplayNameWithGcmNativeFallback(app, file, undefined, settings);

        const loadedApi = createMappedApi({ item_a: 'Zulu', item_b: 'Alpha', item_c: 'Mike' });
        installGcm(app, loadedApi, false);
        expect(sortedSelectedNotes(createLiveDisplayName())).toEqual([first.path, second.path, third.path]);

        installGcm(app, loadedApi);
        expect(sortedSelectedNotes(createLiveDisplayName())).toEqual([second.path, third.path, first.path]);

        const replacementApi = createMappedApi({ item_a: 'Mike', item_b: 'Zulu', item_c: 'Alpha' });
        installGcm(app, replacementApi);
        expect(sortedSelectedNotes(createLiveDisplayName())).toEqual([third.path, first.path, second.path]);

        installGcm(app, replacementApi, false);
        expect(sortedSelectedNotes(createLiveDisplayName())).toEqual([first.path, second.path, third.path]);
    });
});

class EventBus {
    private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
    readonly triggered: Array<{ name: string; payload: unknown }> = [];

    on(name: string, callback: (payload: unknown) => void): { name: string; callback: (payload: unknown) => void } {
        const callbacks = this.listeners.get(name) ?? new Set();
        callbacks.add(callback);
        this.listeners.set(name, callbacks);
        return { name, callback };
    }

    offref(ref: { name: string; callback: (payload: unknown) => void }): void {
        this.listeners.get(ref.name)?.delete(ref.callback);
    }

    trigger(name: string, payload: unknown): void {
        this.triggered.push({ name, payload });
        this.listeners.get(name)?.forEach(callback => callback(payload));
    }
}

describe('GCM native-record display-name lifecycle', () => {
    it('requests current readiness and invalidates consumers on API availability or replacement', () => {
        const workspace = new EventBus();
        const app = { workspace } as unknown as App;
        const onChange = vi.fn();
        const unsubscribe = subscribeGcmNativeRecordApiLifecycle(app, onChange);

        expect(workspace.triggered.map(event => event.name)).toEqual([TPS_GCM_API_REQUEST_EVENT]);

        workspace.trigger(TPS_GCM_API_CHANGED_EVENT, { available: true, api: { nativeRecords: { version: 3 } } });
        workspace.trigger(TPS_GCM_API_CHANGED_EVENT, { available: true, api: { nativeRecords: { version: 4 } } });
        expect(onChange).toHaveBeenCalledTimes(2);

        unsubscribe();
        workspace.trigger(TPS_GCM_API_CHANGED_EVENT, { available: false });
        expect(onChange).toHaveBeenCalledTimes(2);
    });
});
