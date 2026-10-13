import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { App, TFolder, type TFile } from 'obsidian';
import type { ActiveProfileState } from '../../../src/context/SettingsContext';
import type { ListNoteGroupingOption, NotebookNavigatorSettings } from '../../../src/settings/types';
import type { ListPaneItem } from '../../../src/types/virtualization';
import type { FileData } from '../../../src/storage/IndexedDBStorage';

interface HookSlot {
    value?: unknown;
    dependencies?: readonly unknown[];
    cleanup?: () => void;
}
interface HookRun {
    slots: HookSlot[];
    cursor: number;
    dirty: boolean;
    pending: Array<() => void>;
}
const harness = vi.hoisted(() => ({
    active: null as HookRun | null,
    context: null as ReturnType<typeof useFileCache> | null,
    settings: null as NotebookNavigatorSettings | null,
    profile: null as ActiveProfileState | null,
    services: null as Record<string, unknown> | null,
    refresh: () => {},
    projectionListeners: new Set<() => void>(),
    lifecycleListeners: new Set<() => void>(),
    candidates: vi.fn(),
    inspect: vi.fn(),
    emptyRows: [],
    emptyTypes: { availability: 'unavailable', descriptors: [], recordsByType: new Map(), revision: 0 },
    noop: () => {},
    empty: () => [],
    db: { getFile: vi.fn<(_path: string) => FileData | null>(() => null), hasPreview: () => false }
}));

// Run the real provider and list hook with React dependency/state/effect
// semantics. Storage/index startup is outside this invalidation regression.
vi.mock('react', async original => {
    const react = await original<typeof import('react')>();
    const slot = () => {
        const run = harness.active!;
        const index = run.cursor++;
        return { run, value: run.slots[index] ?? (run.slots[index] = {}) };
    };
    const changed = (slot: HookSlot, deps: readonly unknown[]) =>
        !slot.dependencies || deps.length !== slot.dependencies.length || deps.some((dep, i) => !Object.is(dep, slot.dependencies![i]));
    const memo = (fn: () => unknown, deps: readonly unknown[]) => {
        const { value } = slot();
        if (changed(value, deps)) {
            value.value = fn();
            value.dependencies = deps;
        }
        return value.value;
    };
    return {
        ...react,
        useMemo: memo,
        useCallback: (fn: unknown, deps: readonly unknown[]) => memo(() => fn, deps),
        useRef: (value: unknown) => memo(() => ({ current: value }), []),
        useContext: () => harness.context,
        useState(initial: unknown) {
            const { run, value } = slot();
            if (!('value' in value)) value.value = typeof initial === 'function' ? (initial as () => unknown)() : initial;
            return [
                value.value,
                (next: unknown) => {
                    const resolved = typeof next === 'function' ? (next as (old: unknown) => unknown)(value.value) : next;
                    if (!Object.is(resolved, value.value)) {
                        value.value = resolved;
                        run.dirty = true;
                    }
                }
            ];
        },
        useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
            const { run, value } = slot();
            if (!changed(value, deps)) return;
            value.dependencies = deps;
            run.pending.push(() => {
                value.cleanup?.();
                value.cleanup = effect() || undefined;
            });
        }
    };
});
vi.mock('../../../src/context/SettingsContext', () => ({
    useSettingsState: () => harness.settings,
    useActiveProfile: () => harness.profile
}));
vi.mock('../../../src/context/ServicesContext', () => ({ useServices: () => harness.services }));
vi.mock('../../../src/context/UXPreferencesContext', () => ({ useUXPreferences: () => ({ showHiddenItems: false }) }));
vi.mock('../../../src/storage/fileOperations', () => ({ getDBInstance: () => harness.db, getDBInstanceOrNull: () => harness.db }));
vi.mock('../../../src/context/storage/useIndexedDBReady', () => ({ useIndexedDBReady: () => false }));
vi.mock('../../../src/context/storage/useCacheRebuildNotice', () => ({
    useCacheRebuildNotice: () => ({ clearCacheRebuildNotice: harness.noop, startCacheRebuildNotice: harness.noop })
}));
vi.mock('../../../src/context/storage/useStorageFileQueries', () => ({
    useStorageFileQueries: () => ({ getVisibleMarkdownFiles: harness.empty, getIndexableFiles: harness.empty })
}));
vi.mock('../../../src/context/storage/useTreeRebuildScheduler', () => ({
    useTreeRebuildScheduler: () => ({
        tagTreeRebuildFnRef: {},
        propertyTreeRebuildFnRef: {},
        scheduleTreeRebuild: harness.noop,
        cancelTreeRebuildDebouncer: harness.noop
    })
}));
vi.mock('../../../src/context/storage/useTagTreeSync', () => ({
    useTagTreeSync: () => ({ rebuildTagTree: harness.noop, scheduleTagTreeRebuild: harness.noop })
}));
vi.mock('../../../src/context/storage/usePropertyTreeSync', () => ({
    usePropertyTreeSync: () => ({ rebuildPropertyTree: harness.noop, schedulePropertyTreeRebuild: harness.noop })
}));
vi.mock('../../../src/context/storage/useMetadataCacheQueue', () => ({
    useMetadataCacheQueue: () => ({ queueMetadataContentWhenReady: harness.noop, disposeMetadataWaitDisposers: harness.noop })
}));
vi.mock('../../../src/context/storage/useStorageContentQueue', () => ({
    useStorageContentQueue: () => ({
        queueIndexableFilesForContentGeneration: harness.noop,
        queueIndexableFilesNeedingContentGeneration: harness.noop
    })
}));
vi.mock('../../../src/context/storage/useStorageCacheRebuild', () => ({ useStorageCacheRebuild: () => ({ rebuildCache: harness.noop }) }));
vi.mock('../../../src/context/storage/useStorageSettingsSync', () => ({
    useStorageSettingsSync: () => ({ resetPendingSettingsChanges: harness.noop })
}));
vi.mock('../../../src/context/storage/useInitializeContentProviderRegistry', () => ({
    useInitializeContentProviderRegistry: harness.noop
}));
vi.mock('../../../src/context/storage/useStorageVaultSync', () => ({ useStorageVaultSync: harness.noop }));
vi.mock('../../../src/utils/markdownPipelineContentTypes', () => ({
    hasMarkdownWordCountConsumer: () => false,
    rescanMarkdownWordCountConsumers: harness.noop,
    subscribeInitialMarkdownWordCountConsumerResolution: harness.noop
}));
vi.mock('../../../src/integrations/gcm/gcmNativeRecordDisplayName', () => ({
    getFileDisplayNameWithGcmNativeFallback: (...args: unknown[]): unknown => harness.inspect(...args),
    subscribeGcmNativeRecordApiLifecycle: (_app: unknown, fn: () => void) => {
        harness.lifecycleListeners.add(fn);
        return () => harness.lifecycleListeners.delete(fn);
    }
}));
vi.mock('../../../src/integrations/gcm/gcmNotebookNavigatorPresentation', async original => ({
    ...(await original<typeof import('../../../src/integrations/gcm/gcmNotebookNavigatorPresentation')>()),
    subscribeGcmNotebookNavigatorPresentation: (_app: unknown, fn: () => void) => {
        harness.projectionListeners.add(fn);
        return () => harness.projectionListeners.delete(fn);
    }
}));
vi.mock('../../../src/utils/selectionUtils', async original => ({
    ...(await original<typeof import('../../../src/utils/selectionUtils')>()),
    getFilesForNavigationSelection: (...args: unknown[]): unknown => harness.candidates(...args)
}));
vi.mock('../../../src/hooks/useLocalDayKey', () => ({ useLocalDayKey: () => '2026-09-27' }));
vi.mock('../../../src/hooks/useNavigatorTypes', () => ({ useNavigatorTypes: () => harness.emptyTypes }));
vi.mock('../../../src/hooks/useNavigatorTypeRows', () => ({ useNavigatorTypeRows: () => ({ status: 'idle', rows: harness.emptyRows }) }));
vi.mock('../../../src/hooks/useProviderRows', () => ({ useProviderRows: () => harness.emptyRows }));
vi.mock('../../../src/hooks/useEditingStableList', () => ({ useEditingStableList: (_app: unknown, items: ListPaneItem[]) => items }));
vi.mock('../../../src/hooks/listPaneData/useListPaneRefresh', () => ({
    useListPaneRefresh: ({ onRefresh }: { onRefresh: () => void }) => {
        harness.refresh = onRefresh;
    }
}));

import { StorageProvider, useFileCache } from '../../../src/context/StorageContext';
import { useListPaneData } from '../../../src/hooks/useListPaneData';
import { DEFAULT_SETTINGS } from '../../../src/settings/defaultSettings';
import { ItemType, ListPaneItemType } from '../../../src/types';
import { createTestTFile } from '../../utils/createTestTFile';
import { getActiveVaultProfile } from '../../../src/utils/vaultProfiles';
import { sortNavigationFiles } from '../../../src/utils/fileFinder';
import { resolveListSort } from '../../../src/utils/sortUtils';
import { getGcmNotebookNavigatorAppearanceValue } from '../../../src/integrations/gcm/gcmNotebookNavigatorPresentation';
import { clearFrontmatterMetadataCacheSignature, markFrontmatterMetadataCacheCurrent } from '../../../src/utils/frontmatterMetadataCache';

function createRun(): HookRun {
    return { slots: [], cursor: 0, dirty: false, pending: [] };
}
function render<T>(run: HookRun, callback: () => T): T {
    let value!: T;
    for (let pass = 0; pass < 8; pass++) {
        harness.active = run;
        run.cursor = 0;
        run.dirty = false;
        run.pending = [];
        value = callback();
        run.pending.forEach(effect => effect());
        if (!run.dirty) return value;
    }
    throw Error('Unstable hook render');
}
const runs: HookRun[] = [];
beforeEach(() => {
    runs.splice(0).forEach(run => run.slots.forEach(slot => slot.cleanup?.()));
    harness.candidates.mockReset();
    harness.inspect.mockReset();
    harness.projectionListeners.clear();
    harness.lifecycleListeners.clear();
    harness.db.getFile.mockReset().mockReturnValue(null);
    clearFrontmatterMetadataCacheSignature();
});

function fixture(query = '', count = 1000) {
    const app = new App();
    const files = Array.from({ length: count }, (_, index) => createTestTFile(`Notes/${index}.md`));
    const metadata = new Map(files.map((file, index) => [file.path, { title: `Title ${index}`, aliases: [`Alias ${index}`] }]));
    const projections = new Map<string, Record<string, string>>();
    const gcm = {
        api: {
            notebookNavigatorPresentation: {
                version: 1,
                get: (file: TFile | string) => {
                    const path = typeof file === 'string' ? file : file.path;
                    const values = projections.get(path);
                    return values ? { filePath: path, values } : null;
                },
                ensure: async () => {},
                getRevision: () => 0,
                onChanged: () => harness.noop
            }
        }
    };
    Reflect.set(app, 'plugins', {
        enabledPlugins: new Set(['tps-global-context-menu']),
        getPlugin: () => gcm,
        plugins: { 'tps-global-context-menu': gcm }
    });
    const listeners = new Set<(file: TFile, data: string, cache: unknown) => void>();
    Reflect.set(app.metadataCache, 'getFileCache', (file: TFile) => ({ frontmatter: metadata.get(file.path) }));
    Reflect.set(app.metadataCache, 'on', (_name: string, listener: (file: TFile, data: string, cache: unknown) => void) => {
        listeners.add(listener);
        return listener;
    });
    Reflect.set(app.metadataCache, 'offref', (listener: (file: TFile, data: string, cache: unknown) => void) => listeners.delete(listener));
    let settings = {
        ...DEFAULT_SETTINGS,
        tpsDataArchitectureMode: 'native-records',
        useFrontmatterMetadata: false,
        tpsFileTypesNavigationEnabled: false,
        defaultFolderSort: 'modified-desc'
    } as NotebookNavigatorSettings;
    const profile = getActiveVaultProfile(settings);
    const activeProfile: ActiveProfileState = { ...profile, profile, navigationBanner: null };
    harness.settings = settings;
    harness.profile = activeProfile;
    harness.services = { app, plugin: { api: null }, tagTreeService: null, propertyTreeService: null };
    harness.candidates.mockImplementation((_selection: unknown, liveSettings: NotebookNavigatorSettings) => {
        const candidates = [...files];
        sortNavigationFiles(candidates, liveSettings, app, resolveListSort(liveSettings));
        return candidates;
    });
    harness.inspect.mockImplementation((_app: App, file: TFile) => metadata.get(file.path)?.title ?? file.basename);
    const provider = createRun(),
        list = createRun();
    runs.push(provider, list);
    const params = {
        selectionType: ItemType.FOLDER,
        selectedFolder: new TFolder('/'),
        selectedTag: null,
        selectedProperty: null,
        selectedType: null,
        activeProfile,
        groupBy: 'date' as ListNoteGroupingOption,
        multiValueGrouping: 'combine' as const,
        noValueGroupPosition: 'bottom' as const,
        showFileTags: false,
        showFileDate: false,
        pinnedGroupExpanded: true,
        collapsedListGroups: new Set<string>(),
        searchProvider: 'internal' as const,
        searchQuery: query,
        visibility: { includeDescendantNotes: true, showHiddenItems: false }
    };
    function run() {
        const element = render(provider, () => StorageProvider({ app, api: null, children: null })) as ReactElement<{
            value: ReturnType<typeof useFileCache>;
        }>;
        harness.context = element.props.value;
        return render(list, () => useListPaneData({ ...params, settings }));
    }
    function publish() {
        harness.projectionListeners.forEach(fn => fn());
        return run();
    }
    return {
        app,
        files,
        projections,
        run,
        publish,
        params,
        context: () => harness.context as ReturnType<typeof useFileCache>,
        setSettings(patch: Partial<NotebookNavigatorSettings>) {
            settings = { ...settings, ...patch };
            harness.settings = settings;
        },
        updateTitle(index: number, title: string) {
            const frontmatter = { title, aliases: [`Alias ${index}`] };
            metadata.set(files[index].path, frontmatter);
            listeners.forEach(fn => fn(files[index], '', { frontmatter }));
        }
    };
}

describe('GCM appearance invalidation does not rebuild unrelated list data', () => {
    it('keeps fresh event names through list refreshes while same-mtime persisted metadata is stale', () => {
        const f = fixture('Fresh', 1);
        f.setSettings({ useFrontmatterMetadata: true, frontmatterNameField: 'title' });
        const file = f.files[0];
        const mtime = file.stat.mtime;
        harness.db.getFile.mockReturnValue({
            path: file.path,
            metadataMtime: mtime,
            metadata: { name: 'Stale indexed name' }
        } as FileData);
        markFrontmatterMetadataCacheCurrent(harness.settings!);
        harness.inspect.mockImplementation((_app: App, file: TFile, metadata?: { fn?: string }) => metadata?.fn ?? file.basename);

        expect(f.run().files).toEqual([]);
        expect(f.context().getFileDisplayName(file)).toBe('Stale indexed name');
        f.updateTitle(0, 'Fresh event name');
        expect(file.stat.mtime).toBe(mtime);
        expect(f.run().files).toEqual([file]);
        harness.refresh();
        expect(f.run().files).toEqual([file]);
        expect(f.context().getFileDisplayName(file)).toBe('Stale indexed name');
        expect(f.context().getFileDisplayName(file, { frontmatter: { title: 'Fresh event name' } })).toBe('Fresh event name');
        expect(f.context().getFileDisplayName(file, {})).toBe(file.basename);
        const attachment = createTestTFile('Notes/attachment.pdf');
        expect(f.context().getFileDisplayName(attachment, { frontmatter: { title: 'Unrelated metadata' } })).toBe('attachment');
    });

    it.each(['', 'Title', '#work'])(
        'retains candidates and name lookup work through 20 scrolling-like appearance batches for %s',
        query => {
            const f = fixture(query);
            const initial = f.run(),
                getter = f.context().getFileDisplayName;
            const inspections = harness.inspect.mock.calls.length;
            expect(harness.candidates).toHaveBeenCalledTimes(1);
            let stableItems = true;
            for (let batch = 0; batch < 20; batch++) {
                const next = f.publish();
                stableItems &&= next.listItems === initial.listItems;
            }
            expect(harness.candidates).toHaveBeenCalledTimes(1);
            expect(harness.inspect).toHaveBeenCalledTimes(inspections);
            expect(stableItems).toBe(true);
            expect(f.context().getFileDisplayName).toBe(getter);
        }
    );

    it('still updates changed titles, lifecycle names, settings and owning list refresh events', () => {
        const f = fixture('Replacement');
        expect(f.run().files).toHaveLength(0);
        expect(harness.inspect).toHaveBeenCalledTimes(1000);
        f.updateTitle(4, 'Replacement');
        expect(f.run().files).toEqual([f.files[4]]);
        expect(harness.inspect).toHaveBeenCalledTimes(1001);
        expect(harness.candidates).toHaveBeenCalledTimes(1);
        harness.lifecycleListeners.forEach(fn => fn());
        f.run();
        expect(harness.candidates).toHaveBeenCalledTimes(2);
        f.setSettings({ frontmatterNameField: 'name' });
        f.run();
        expect(harness.candidates).toHaveBeenCalledTimes(3);
        harness.refresh();
        f.run();
        expect(harness.candidates).toHaveBeenCalledTimes(4);
    });

    it('publishes appearance revisions while retaining names and date-grouped list identity', () => {
        const f = fixture('', 2);
        f.projections.set(f.files[0].path, { icon: 'file', color: '#123456' });
        const initial = f.run(),
            revision = f.context().gcmPresentationRevision;
        expect(getGcmNotebookNavigatorAppearanceValue(f.app, f.files[0], 'icon')).toBe('file');
        f.projections.set(f.files[0].path, { icon: 'check', color: '#abcdef' });
        expect(f.publish().listItems).toBe(initial.listItems);
        expect(f.context().gcmPresentationRevision).toBe(revision + 1);
        expect(getGcmNotebookNavigatorAppearanceValue(f.app, f.files[0], 'icon')).toBe('check');
        expect(getGcmNotebookNavigatorAppearanceValue(f.app, f.files[0], 'color')).toBe('#abcdef');
    });

    it('refreshes generated property sorting when values change', () => {
        const f = fixture('', 2);
        f.setSettings({ propertySortKey: 'priority', defaultFolderSort: 'property-asc', defaultFolderSortPropertyKey: 'priority' });
        f.projections.set(f.files[0].path, { priority: 'b' });
        f.projections.set(f.files[1].path, { priority: 'a' });
        expect(f.run().files).toEqual([f.files[1], f.files[0]]);
        f.projections.set(f.files[0].path, { priority: '0' });
        expect(f.publish().files).toEqual([f.files[0], f.files[1]]);
        expect(harness.candidates).toHaveBeenCalledTimes(2);
    });

    it('refreshes generated property groups and search group counts without rebuilding text names', () => {
        const f = fixture('Title', 2);
        f.params.groupBy = 'property:status';
        f.setSettings({ showGroupHeaderItemCounts: true });
        f.projections.set(f.files[0].path, { status: 'Open' });
        f.projections.set(f.files[1].path, { status: 'Closed' });
        const headers = (items: ListPaneItem[]) => items.filter(item => item.type === ListPaneItemType.HEADER).map(item => item.data);
        expect(headers(f.run().listItems)).toEqual(['Closed', 'Open']);
        const inspections = harness.inspect.mock.calls.length;
        f.projections.set(f.files[0].path, { status: 'Closed' });
        const updated = f.publish();
        expect(headers(updated.listItems)).toEqual(['Closed']);
        expect(updated.listItems.find(item => item.type === ListPaneItemType.HEADER)?.groupTotalItemCount).toBe(2);
        expect(harness.candidates).toHaveBeenCalledTimes(1);
        expect(harness.inspect).toHaveBeenCalledTimes(inspections);
    });

    it('does not rescan for generated values when manual property sorting/grouping rejects them', () => {
        const f = fixture('', 2);
        f.setSettings({
            propertySortKey: 'manual_rank',
            defaultFolderSort: 'property-asc',
            defaultFolderSortPropertyKey: 'manual_rank',
            manualSortPropertyKey: 'manual_rank'
        });
        f.params.groupBy = 'property:manual_rank';
        const initial = f.run();
        f.projections.set(f.files[0].path, { manual_rank: '999' });
        expect(f.publish().listItems).toBe(initial.listItems);
        expect(harness.candidates).toHaveBeenCalledTimes(1);
    });
});
