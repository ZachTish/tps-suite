import { describe, expect, it, vi } from 'vitest';
import { App, type TFile } from 'obsidian';
import { TPS_GCM_API_CHANGED_EVENT, TPS_GCM_API_REQUEST_EVENT, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../src/constants/tpsIdentity';
import {
    getGcmNotebookNavigatorAppearanceValue,
    getGcmNotebookNavigatorPresentation,
    getGcmNotebookNavigatorPresentationValue,
    subscribeGcmNotebookNavigatorPresentation
} from '../../src/integrations/gcm/gcmNotebookNavigatorPresentation';
import type { GcmNotebookNavigatorPresentationApiLike } from '../../src/integrations/gcm/gcmTaskApi';
import { sortNavigationFiles } from '../../src/utils/fileFinder';
import { buildListItems, type ListPaneConfig } from '../../src/hooks/listPaneData/listItems';
import { buildSearchableNameData, filterListPaneFiles } from '../../src/hooks/listPaneData/searchPipeline';
import { parseFilterSearchTokens } from '../../src/utils/filterSearch';
import { buildPropertyTreeFromDatabase, buildPropertyValueNodeId } from '../../src/utils/propertyTree';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import type { IndexedDBStorage } from '../../src/storage/IndexedDBStorage';
import { FILE_VISIBILITY } from '../../src/utils/fileTypeUtils';
import { ItemType, ListPaneItemType } from '../../src/types';
import { createTestTFile } from '../utils/createTestTFile';

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

interface TestPresentationApi extends GcmNotebookNavigatorPresentationApiLike {
    emit(): void;
    disposed: ReturnType<typeof vi.fn>;
}

function createPresentationApi(
    getProjection: GcmNotebookNavigatorPresentationApiLike['get'],
    ensureBatch: (files: readonly (TFile | string)[]) => Promise<void> = async () => undefined
): TestPresentationApi {
    let revision = 0;
    const listeners = new Set<(revision: number) => void>();
    const disposed = vi.fn();
    return {
        version: 1,
        ensure: vi.fn(async references => {
            const requested = Array.isArray(references) ? references : [references];
            await ensureBatch(requested);
        }),
        get: vi.fn(getProjection),
        getRevision: () => revision,
        onChanged: listener => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
                disposed();
            };
        },
        emit: () => {
            revision += 1;
            listeners.forEach(listener => listener(revision));
        },
        disposed
    };
}

function installGcm(app: App, api: unknown, enabled = true): void {
    const plugin = { api: { notebookNavigatorPresentation: api } };
    (app as App & { plugins: unknown }).plugins = {
        enabledPlugins: new Set(enabled ? [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID] : []),
        getPlugin: () => plugin,
        plugins: { [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]: plugin }
    };
}

function createApp(files: readonly TFile[], api: unknown): { app: App; workspace: EventBus } {
    const app = new App();
    const workspace = new EventBus();
    const filesByPath = new Map(files.map(file => [file.path, file]));
    Reflect.set(app, 'workspace', workspace);
    Reflect.set(app.vault, 'getFileByPath', (path: string) => filesByPath.get(path) ?? null);
    installGcm(app, api);
    return { app, workspace };
}

describe('GCM Notebook Navigator transient presentation adapter', () => {
    it('batches unprepared files through ensure and publishes only validated transient values', async () => {
        const first = createTestTFile('Notes/First.md');
        const second = createTestTFile('Notes/Second.md');
        const projections = new Map<string, { filePath: string; values: Record<string, string> }>();
        const ensureCalls: Array<Array<TFile | string>> = [];
        let api: TestPresentationApi;
        api = createPresentationApi(
            file => projections.get(typeof file === 'string' ? file : file.path),
            async files => {
                ensureCalls.push([...files]);
                files.forEach(file => {
                    const path = typeof file === 'string' ? file : file.path;
                    const basename = typeof file === 'string' ? (path.split('/').pop() ?? path).replace(/\.md$/u, '') : file.basename;
                    projections.set(path, { filePath: path, values: { Status: `generated:${basename}` } });
                });
                api.emit();
            }
        );
        const { app, workspace } = createApp([first, second], api);
        const onChange = vi.fn();
        const unsubscribe = subscribeGcmNotebookNavigatorPresentation(app, onChange);

        expect(workspace.triggered.map(event => event.name)).toEqual([TPS_GCM_API_REQUEST_EVENT]);
        expect(onChange).toHaveBeenCalledOnce();
        expect(getGcmNotebookNavigatorPresentationValue(app, first, 'status')).toBeUndefined();
        expect(getGcmNotebookNavigatorPresentationValue(app, second.path, 'STATUS')).toBeUndefined();

        await vi.waitFor(() => {
            expect(ensureCalls).toHaveLength(1);
            expect(getGcmNotebookNavigatorPresentationValue(app, first, 'status')).toBe('generated:First');
            expect(getGcmNotebookNavigatorPresentationValue(app, second, 'status')).toBe('generated:Second');
        });
        expect(ensureCalls[0]).toEqual([first, second.path]);

        const projection = getGcmNotebookNavigatorPresentation(app, first);
        expect(projection).toEqual({ filePath: first.path, values: { Status: 'generated:First' } });
        expect(projection?.values).not.toBe(projections.get(first.path)?.values);
        expect(Object.isFrozen(projection?.values)).toBe(true);
        expect(onChange.mock.calls.length).toBeGreaterThan(1);

        projections.delete(first.path);
        api.emit();
        expect(getGcmNotebookNavigatorPresentationValue(app, first, 'status')).toBe('generated:First');
        await vi.waitFor(() => {
            expect(ensureCalls).toHaveLength(2);
            expect(getGcmNotebookNavigatorPresentationValue(app, first, 'status')).toBe('generated:First');
        });
        expect(ensureCalls[1]).toEqual([first]);

        unsubscribe();
        expect(api.disposed).toHaveBeenCalledOnce();
    });

    it('rebinds on GCM replacement and unload while ignoring stale provider callbacks', () => {
        const file = createTestTFile('Notes/Task.md');
        const firstApi = createPresentationApi(() => ({ filePath: file.path, values: { status: 'first' } }));
        const { app, workspace } = createApp([file], firstApi);
        const onChange = vi.fn();
        const unsubscribe = subscribeGcmNotebookNavigatorPresentation(app, onChange);
        const initialCalls = onChange.mock.calls.length;

        const replacementApi = createPresentationApi(() => ({ filePath: file.path, values: { status: 'second' } }));
        installGcm(app, replacementApi);
        workspace.trigger(TPS_GCM_API_CHANGED_EVENT, { available: true });
        expect(firstApi.disposed).toHaveBeenCalledOnce();
        expect(getGcmNotebookNavigatorPresentationValue(app, file, 'status')).toBe('second');

        firstApi.emit();
        expect(onChange).toHaveBeenCalledTimes(initialCalls + 1);
        replacementApi.emit();
        expect(onChange).toHaveBeenCalledTimes(initialCalls + 2);

        installGcm(app, replacementApi, false);
        workspace.trigger(TPS_GCM_API_CHANGED_EVENT, { available: false });
        expect(replacementApi.disposed).toHaveBeenCalledOnce();
        expect(getGcmNotebookNavigatorPresentationValue(app, file, 'status')).toBeUndefined();

        unsubscribe();
    });

    it('fails closed for incompatible APIs and malformed, mismatched, or throwing projections', () => {
        const file = createTestTFile('Notes/Task.md');
        const cases: unknown[] = [
            { ...createPresentationApi(() => ({ filePath: file.path, values: { status: 'value' } })), version: 2 },
            createPresentationApi(() => ({ filePath: 'Notes/Other.md', values: { status: 'value' } })),
            createPresentationApi(() => ({ filePath: file.path, values: { status: 42 } }) as never),
            createPresentationApi(
                () =>
                    Object.defineProperty({ filePath: file.path }, 'values', {
                        get: () => {
                            throw new Error('Synthetic values getter failure');
                        }
                    }) as never
            ),
            createPresentationApi(() => {
                throw new Error('Synthetic provider failure');
            })
        ];

        cases.forEach(api => {
            const { app } = createApp([file], api);
            expect(getGcmNotebookNavigatorPresentationValue(app, file, 'status')).toBeUndefined();
        });
    });
});

describe('GCM presentation consumers', () => {
    function createListConfig(groupBy: ListPaneConfig['groupBy']): ListPaneConfig {
        return {
            filterPinnedByFolder: true,
            folderGroupSortOrder: DEFAULT_SETTINGS.folderSortOrder,
            groupBy,
            pinnedGroupExpanded: true,
            pinnedNotes: {},
            showCurrentFolderFilesAtBottom: false,
            showFolderGroupPaths: false,
            showFileTags: false
        };
    }

    it('uses authored values before generated sort/group fallbacks and excludes the manual-sort key', () => {
        const authored = createTestTFile('Notes/Alpha.md');
        const generated = createTestTFile('Notes/Zulu.md');
        const frontmatterByPath: Record<string, Record<string, unknown>> = {
            [authored.path]: { priority: 'z', status: 'Authored' },
            [generated.path]: {}
        };
        const api = createPresentationApi(file => {
            const path = typeof file === 'string' ? file : file.path;
            return {
                filePath: path,
                values:
                    path === authored.path
                        ? { priority: 'a', status: 'Generated override', manual_rank: 'z' }
                        : { priority: 'b', status: 'Generated', manual_rank: 'a' }
            };
        });
        const { app } = createApp([authored, generated], api);
        app.metadataCache.getFileCache = file => ({ frontmatter: frontmatterByPath[file.path] });
        const settings: NotebookNavigatorSettings = {
            ...structuredClone(DEFAULT_SETTINGS),
            manualSortPropertyKey: 'manual_rank'
        };

        const propertySorted = [authored, generated];
        sortNavigationFiles(propertySorted, settings, app, {
            option: 'property-asc',
            propertyKey: 'priority',
            propertySortSecondary: 'filename'
        });
        expect(propertySorted).toEqual([generated, authored]);

        const manualKeySorted = [generated, authored];
        sortNavigationFiles(manualKeySorted, settings, app, {
            option: 'property-asc',
            propertyKey: 'manual_rank',
            propertySortSecondary: 'filename'
        });
        expect(manualKeySorted).toEqual([authored, generated]);

        const records = new Map([authored, generated].map(file => [file.path, { properties: null, tags: null }] as const));
        const db = {
            getFile: (path: string) => records.get(path) ?? null,
            forEachFile: (callback: (path: string, data: { properties: null; tags: null }) => void) => {
                records.forEach((data, path) => callback(path, data));
            }
        } as unknown as IndexedDBStorage;
        const commonListArgs = {
            app,
            dayKey: '2026-08-31',
            fileVisibility: FILE_VISIBILITY.DOCUMENTS,
            files: [authored, generated],
            getDB: () => db,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            hiddenFileState: new Map<string, boolean>(),
            hiddenTags: [],
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectionType: ItemType.FOLDER,
            showHiddenItems: false,
            sortOption: 'title-asc' as const
        };

        const statusItems = buildListItems({
            ...commonListArgs,
            listConfig: createListConfig('property:status'),
            manualSortPropertyKey: settings.manualSortPropertyKey
        });
        expect(statusItems.filter(item => item.type === ListPaneItemType.HEADER).map(item => item.data)).toEqual(['Authored', 'Generated']);

        const manualItems = buildListItems({
            ...commonListArgs,
            listConfig: createListConfig('property:manual_rank'),
            manualSortPropertyKey: settings.manualSortPropertyKey
        });
        expect(manualItems.filter(item => item.type === ListPaneItemType.HEADER).map(item => item.data)).toEqual(['None']);

        expect(frontmatterByPath).toEqual({
            [authored.path]: { priority: 'z', status: 'Authored' },
            [generated.path]: {}
        });
        expect([...records.values()]).toEqual([
            { properties: null, tags: null },
            { properties: null, tags: null }
        ]);
    });

    it('keeps authored property navigation while excluding generated values from its tree and Filter Search', () => {
        const file = createTestTFile('Notes/Generated.md');
        const api = createPresentationApi(candidate => ({
            filePath: typeof candidate === 'string' ? candidate : candidate.path,
            values: { status: 'Generated' }
        }));
        const { app } = createApp([file], api);
        app.metadataCache.getFileCache = () => ({ frontmatter: {} });
        const fileData = {
            properties: [{ fieldKey: 'Status', value: 'Authored', valueKind: 'string' as const }],
            tags: null
        };
        const db = {
            getFile: () => fileData,
            forEachFile: (callback: (path: string, data: typeof fileData) => void) => callback(file.path, fileData)
        } as unknown as IndexedDBStorage;

        // A presentation read does not promote the generated field into either source of truth.
        expect(getGcmNotebookNavigatorPresentationValue(app, file, 'status')).toBe('Generated');
        const propertyTree = buildPropertyTreeFromDatabase(db, { includedPropertyKeys: new Set(['status']) });
        const statusNode = propertyTree.get('status');
        expect(statusNode?.children.has(buildPropertyValueNodeId('status', 'authored'))).toBe(true);
        expect(statusNode?.children.has(buildPropertyValueNodeId('status', 'generated'))).toBe(false);

        const query = '.status=generated';
        const result = filterListPaneFiles({
            app,
            baseFiles: [file],
            getDB: () => db,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            omnisearchResult: null,
            searchTokens: parseFilterSearchTokens(query),
            searchableNames: new Map([[file.path, buildSearchableNameData('Generated', {})]]),
            settings: { alphabeticalDateMode: 'modified' },
            sortOption: 'alphabetical-asc',
            trimmedQuery: query,
            useOmnisearch: false
        });
        expect(result.files).toEqual([]);
        expect(fileData.properties).toEqual([{ fieldKey: 'Status', value: 'Authored', valueKind: 'string' }]);
    });
});

describe('appearance refresh stability', () => {
    it('retains consistent appearance and ordering during pending refresh', async () => {
        const file = createTestTFile('Notes/Icon.md');
        let value: { filePath: string; values: Record<string, string> } | null | undefined = {
            filePath: file.path,
            values: { icon: 'star' }
        };
        let finish: () => void = () => {};
        const api = createPresentationApi(
            () => value,
            () =>
                new Promise<void>(resolve => {
                    finish = resolve;
                })
        );
        const { app } = createApp([file], api);
        const stop = subscribeGcmNotebookNavigatorPresentation(app, () => {});
        expect(getGcmNotebookNavigatorAppearanceValue(app, file, 'icon')).toBe('star');
        value = undefined;
        api.emit();
        expect(getGcmNotebookNavigatorAppearanceValue(app, file, 'icon')).toBe('star');
        expect(getGcmNotebookNavigatorPresentationValue(app, file, 'icon')).toBe('star');
        await Promise.resolve();
        for (let i = 0; i < 10; i++) getGcmNotebookNavigatorAppearanceValue(app, file, 'icon');
        await Promise.resolve();
        expect(Reflect.get(api, 'ensure')).toHaveBeenCalledTimes(1);
        value = { filePath: file.path, values: { icon: 'check' } };
        finish();
        await Promise.resolve();
        expect(getGcmNotebookNavigatorAppearanceValue(app, file, 'icon')).toBe('check');
        value = null;
        api.emit();
        expect(getGcmNotebookNavigatorAppearanceValue(app, file, 'icon')).toBeUndefined();
        stop();
    });

    it('retains appearance through a long refresh and clears it on provider removal', async () => {
        vi.useFakeTimers();
        try {
            const file = createTestTFile('Notes/Icon.md');
            let value: { filePath: string; values: Record<string, string> } | undefined = { filePath: file.path, values: { color: 'red' } };
            const api = createPresentationApi(
                () => value,
                () => new Promise<void>(() => {})
            );
            const { app, workspace } = createApp([file], api);
            const stop = subscribeGcmNotebookNavigatorPresentation(app, () => {});
            expect(getGcmNotebookNavigatorAppearanceValue(app, file, 'color')).toBe('red');
            value = undefined;
            api.emit();
            expect(getGcmNotebookNavigatorAppearanceValue(app, file, 'color')).toBe('red');
            await vi.advanceTimersByTimeAsync(30000);
            expect(getGcmNotebookNavigatorAppearanceValue(app, file, 'color')).toBe('red');
            value = { filePath: file.path, values: { color: 'blue' } };
            expect(getGcmNotebookNavigatorAppearanceValue(app, file, 'color')).toBe('blue');
            installGcm(app, null, false);
            workspace.trigger(TPS_GCM_API_CHANGED_EVENT, {});
            expect(getGcmNotebookNavigatorAppearanceValue(app, file, 'color')).toBeUndefined();
            stop();
        } finally {
            vi.useRealTimers();
        }
    });
});

it('does not drive a render/ensure loop when a bounded provider attempt leaves a file unprepared', async () => {
    const file = createTestTFile('Notes/Pending.md');
    const api = createPresentationApi(() => undefined);
    const { app } = createApp([file], api);
    let renders = 0;
    const stop = subscribeGcmNotebookNavigatorPresentation(app, () => {
        renders++;
        if (renders < 10) getGcmNotebookNavigatorAppearanceValue(app, file, 'icon');
    });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(renders).toBe(1);
    expect(Reflect.get(api, 'ensure')).toHaveBeenCalledTimes(1);
    stop();
});

it('keeps property sort order through startup invalidation bursts and adopts completed values', async () => {
    const alpha = createTestTFile('Notes/Alpha.md');
    const beta = createTestTFile('Notes/Beta.md');
    let pending = false;
    let updated = false;
    const api = createPresentationApi(file => {
        if (pending) return undefined;
        const path = typeof file === 'string' ? file : file.path;
        return { filePath: path, values: { priority: path === alpha.path ? '2' : updated ? '3' : '1', icon: 'star' } };
    });
    const { app } = createApp([alpha, beta], api);
    app.metadataCache.getFileCache = () => ({ frontmatter: {} });
    const settings = structuredClone(DEFAULT_SETTINGS);
    const sort = () => {
        const files = [alpha, beta];
        sortNavigationFiles(files, settings, app, { option: 'property-asc', propertyKey: 'priority', propertySortSecondary: 'filename' });
        return files.map(file => file.path);
    };
    const stop = subscribeGcmNotebookNavigatorPresentation(app, () => {});
    expect(sort()).toEqual([beta.path, alpha.path]);
    pending = true;
    for (let i = 0; i < 40; i++) {
        api.emit();
        expect(sort()).toEqual([beta.path, alpha.path]);
        expect(getGcmNotebookNavigatorAppearanceValue(app, alpha, 'icon')).toBe('star');
        await Promise.resolve();
    }
    pending = false;
    updated = true;
    api.emit();
    expect(sort()).toEqual([alpha.path, beta.path]);
    stop();
});
