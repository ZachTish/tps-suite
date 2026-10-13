import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, TFile, TFolder } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import type { ActiveProfileState } from '../../src/context/SettingsContext';
import type { StorageFileData } from '../../src/context/storage/storageFileData';
import type { FolderNavigationSourceState } from '../../src/hooks/useFolderNavigationSourceState';
import {
    useNavigationPaneSourceState,
    type UseNavigationPaneSourceStateParams
} from '../../src/hooks/navigationPane/data/useNavigationPaneSourceState';
import { useNavigationPaneTreeSections } from '../../src/hooks/navigationPane/data/useNavigationPaneTreeSections';
import { useNavigationNoteCounts } from '../../src/hooks/navigationPane/data/useNavigationNoteCounts';
import { createDefaultFileData, type FileData, type PropertyItem } from '../../src/storage/indexeddb/fileData';
import { buildPropertyKeyNodeId, buildPropertyTreeFromFilePaths } from '../../src/utils/propertyTree';
import { ItemType, NavigationPaneItemType } from '../../src/types';
import type { NavigationSelectionScope } from '../../src/utils/selectionUtils';

interface Slot {
    value?: unknown;
    dependencies?: readonly unknown[];
}
interface Run {
    slots: Slot[];
    cursor: number;
}
const state = vi.hoisted(() => ({
    run: null as Run | null,
    db: null as { getFile: (path: string) => FileData | null } | null,
    updateSettings: vi.fn()
}));

// Execute the actual source/tree/count owners. Stable memo/ref slots model repeat
// renders; vault APIs and the already-indexed property evidence are synthetic.
vi.mock('react', async original => {
    const react = await original<typeof import('react')>();
    const memo = (factory: () => unknown, dependencies: readonly unknown[]) => {
        const run = state.run!;
        const index = run.cursor++;
        const slot = run.slots[index] ?? (run.slots[index] = {});
        if (!slot.dependencies || dependencies.some((value, offset) => !Object.is(value, slot.dependencies![offset]))) {
            slot.value = factory();
            slot.dependencies = dependencies;
        }
        return slot.value;
    };
    return { ...react, useMemo: memo, useRef: (initial: unknown) => memo(() => ({ current: initial }), []), useEffect: () => {} };
});
vi.mock('../../src/context/SettingsContext', () => ({ useSettingsUpdate: () => state.updateSettings }));
vi.mock('../../src/storage/fileOperations', () => ({ getDBInstanceOrNull: () => state.db }));

afterEach(() => {
    state.run = null;
    state.db = null;
    state.updateSettings.mockClear();
    vi.restoreAllMocks();
});

function fixture(order: NotebookNavigatorSettings['propertySortOrder'] = 'frequency-desc') {
    const app = new App();
    const rows = new Map<string, FileData>();
    const files: TFile[] = [];
    const add = (path: string, properties: PropertyItem[]) => {
        rows.set(path, { ...createDefaultFileData({ path, mtime: 1 }), properties });
        files.push(new TFile(path));
    };
    for (let index = 0; index < 277; index += 1) {
        const properties: PropertyItem[] = [];
        if (index < 271) properties.push({ fieldKey: 'kind', value: 'transaction/financial', valueKind: 'string' });
        if (index < 28) properties.push({ fieldKey: 'status', value: 'active', valueKind: 'string' });
        if (index < 13) {
            properties.push({ fieldKey: 'tags', value: 'first', valueKind: 'string' });
            properties.push({ fieldKey: 'tags', value: 'second', valueKind: 'string' });
        }
        if (index < 5) properties.push({ fieldKey: 'parents', value: '[[Parent]]', valueKind: 'string' });
        if (index < 3) properties.push({ fieldKey: 'timeEstimate', value: '60', valueKind: 'number' });
        if (index < 2) properties.push({ fieldKey: 'empty', value: '', valueKind: 'string' });
        if (index < 1) properties.push({ fieldKey: 'pullrequesturl', value: 'https://example.com/pr', valueKind: 'string' });
        add(`Notes/${index}.md`, properties);
    }
    const getFile = vi.fn((path: string) => rows.get(path) ?? null);
    const db = { getFile };
    const tree = buildPropertyTreeFromFilePaths(db, rows.keys());
    getFile.mockClear();
    const inventory = vi.fn(() => files);
    const read = vi.fn();
    const cachedRead = vi.fn();
    const process = vi.fn();
    Object.assign(app.vault, { getFiles: inventory, getMarkdownFiles: inventory, read, cachedRead, process });
    const profile = {
        ...DEFAULT_SETTINGS.vaultProfiles[0],
        propertyKeys: [...tree.keys()].map(key => ({ key, showInNavigation: true, showInList: false, showInFileMenu: true }))
    };
    const settings: NotebookNavigatorSettings = {
        ...DEFAULT_SETTINGS,
        propertySortOrder: order,
        rootPropertyOrder: [],
        showTags: false,
        showProperties: true,
        showAllPropertiesFolder: false,
        showNoteCount: true,
        scopePropertiesToCurrentContext: false,
        vaultProfiles: [profile]
    };
    const activeProfile: ActiveProfileState = {
        profile,
        hiddenFolders: [],
        descendantExcludedFolders: [],
        hiddenFileProperties: [],
        hiddenFileNames: [],
        hiddenTags: [],
        hiddenFileTags: [],
        fileVisibility: profile.fileVisibility,
        propertyKeys: profile.propertyKeys,
        navigationBanner: null
    };
    const folderSource: FolderNavigationSourceState = {
        hiddenFolders: [],
        rootFolders: [],
        rootLevelFolders: [],
        rootFolderOrderMap: new Map(),
        missingRootFolderPaths: [],
        fileChangeVersion: 0,
        folderChangeVersion: 0,
        folderDisplayVersion: 0,
        metadataDecorationVersion: 0,
        metadataVisibilityVersion: 0,
        tagDataVersion: 0,
        propertyDataVersion: 0,
        getFolderSortName: folder => folder.name,
        folderExclusionByFolderNote: undefined,
        isFolderExcluded: () => false
    };
    const fileData: StorageFileData = {
        propertyTree: tree,
        tagTree: new Map(),
        tagged: 0,
        untagged: files.length,
        hiddenRootTags: new Map()
    };
    const run: Run = { slots: [], cursor: 0 };
    const hydratedShortcuts: UseNavigationPaneSourceStateParams['hydratedShortcuts'] = [];
    const expansionState = {
        expandedFolders: new Set<string>(),
        expandedTags: new Set<string>(),
        expandedProperties: new Set<string>(),
        expandedVirtualFolders: new Set<string>()
    };
    const inputs = {
        isVisible: true,
        showHiddenItems: false,
        includeDescendantNotes: true,
        selectionScope: { selectionType: ItemType.FOLDER, selectedFolder: null } as NavigationSelectionScope
    };
    const render = () => {
        state.run = run;
        state.db = db;
        run.cursor = 0;
        const source = useNavigationPaneSourceState({
            app,
            settings,
            activeProfile,
            folderNavigationSource: folderSource,
            fileData,
            hydratedShortcuts,
            showHiddenItems: inputs.showHiddenItems,
            includeDescendantNotes: inputs.includeDescendantNotes
        });
        const trees = useNavigationPaneTreeSections({
            app,
            settings,
            sourceState: source,
            ...inputs,
            expansionState,
            tagTreeService: null,
            propertyTreeService: null
        });
        const counts = useNavigationNoteCounts({
            app,
            settings,
            isVisible: inputs.isVisible,
            propertiesSectionActive: trees.propertiesSectionActive,
            itemsWithMetadata: trees.propertyItems,
            includeDescendantNotes: inputs.includeDescendantNotes,
            visibleTaggedCount: 0,
            untaggedCount: files.length,
            renderPropertyTree: trees.renderPropertyTree,
            propertyCollectionCount: undefined,
            effectiveFrontmatterExclusions: [],
            hiddenFolders: [],
            descendantExcludedFolders: [],
            hiddenFileTags: [],
            showHiddenItems: inputs.showHiddenItems,
            folderCountFileNameMatcher: null,
            fileVisibility: profile.fileVisibility,
            folderChangeVersion: folderSource.folderChangeVersion,
            vaultChangeVersion: folderSource.fileChangeVersion,
            metadataVisibilityVersion: folderSource.metadataVisibilityVersion,
            tagDataVersion: 0
        });
        const keys = trees.propertyItems.filter(item => item.type === NavigationPaneItemType.PROPERTY_KEY);
        return {
            keys: keys.map(item => item.data.key),
            frequencies: keys.map(item => counts.propertyCounts.get(item.data.id)?.current),
            source,
            trees,
            counts
        };
    };
    return { settings, activeProfile, inputs, folderSource, fileData, rows, files, render, inventory, getFile, read, cachedRead, process };
}

describe('property frequency uses the counts displayed on navigation labels', () => {
    it.each([true, false])('orders all key members high to low with descendants %s', includeDescendantNotes => {
        const f = fixture();
        f.inputs.includeDescendantNotes = includeDescendantNotes;
        expect(f.render()).toMatchObject({
            keys: ['kind', 'status', 'tags', 'parents', 'timeestimate', 'empty', 'pullrequesturl'],
            frequencies: [271, 28, 13, 5, 3, 2, 1]
        });
    });

    it('orders low to high without counting two list values as two notes', () => {
        expect(fixture('frequency-asc').render()).toMatchObject({
            keys: ['pullrequesturl', 'empty', 'timeestimate', 'parents', 'tags', 'status', 'kind'],
            frequencies: [1, 2, 3, 5, 13, 28, 271]
        });
    });

    it.each(['alpha-asc', 'alpha-desc'] as const)('preserves %s ordering', order => {
        const alphabetic = ['empty', 'kind', 'parents', 'pullrequesturl', 'status', 'tags', 'timeestimate'];
        expect(fixture(order).render().keys).toEqual(order === 'alpha-desc' ? alphabetic.reverse() : alphabetic);
    });

    it('retains explicit manual root ordering ahead of the automatic preference', () => {
        const f = fixture();
        f.settings.rootPropertyOrder = ['pullrequesturl', 'empty', 'timeestimate', 'parents', 'tags', 'status', 'kind'];
        expect(f.render().keys).toEqual(f.settings.rootPropertyOrder);
    });

    it('uses the scoped indexed tree memberships rather than the global frequencies', () => {
        const f = fixture();
        f.settings.scopePropertiesToCurrentContext = true;
        const scoped = ['first', 'second', 'third'].map(name => new TFile(`Scoped/${name}.md`));
        const folder = new TFolder();
        Reflect.set(folder, 'path', 'Scoped');
        Reflect.set(folder, 'children', scoped);
        scoped.forEach((file, index) => {
            Reflect.set(file, 'parent', folder);
            const fieldKey = index < 2 ? 'kind' : 'status';
            f.rows.set(file.path, {
                ...createDefaultFileData({ path: file.path, mtime: 1 }),
                properties: [{ fieldKey, value: 'open', valueKind: 'string' }]
            });
        });
        f.inputs.selectionScope = { selectionType: ItemType.FOLDER, selectedFolder: folder };
        expect(f.render()).toMatchObject({ keys: ['kind', 'status'], frequencies: [2, 1] });
        expect(f.getFile).toHaveBeenCalledTimes(3);
        expect(f.inventory).not.toHaveBeenCalled();
    });

    it.each(['frequency-asc', 'frequency-desc'] as const)('places an indexed zero-count key correctly for %s', order => {
        const f = fixture(order);
        f.fileData.propertyTree.set('location', {
            id: buildPropertyKeyNodeId('location'),
            kind: 'key',
            key: 'location',
            valuePath: null,
            name: 'location',
            displayPath: 'location',
            children: new Map(),
            notesWithValue: new Set()
        });
        f.activeProfile.propertyKeys.push({ key: 'location', showInNavigation: true, showInList: false, showInFileMenu: true });
        const result = f.render();
        const position = order === 'frequency-asc' ? 0 : result.keys.length - 1;
        expect(result.keys[position]).toBe('location');
        expect(result.frequencies[position]).toBe(0);
    });

    it('keeps frequency ordering available while the pane or displayed counters are hidden', () => {
        const f = fixture();
        const original = f.render();
        f.inputs.isVisible = false;
        expect(f.render().keys).toEqual(original.keys);
        f.settings.showNoteCount = false;
        expect(f.render().keys).toEqual(original.keys);
        for (const operation of [f.inventory, f.getFile, f.read, f.cachedRead, f.process]) expect(operation).not.toHaveBeenCalled();
    });

    it('uses changed indexed membership and has no source reads, writes or inventories across bursts', () => {
        const f = fixture();
        const original = f.render();
        for (let index = 0; index < 20; index += 1) {
            const unchanged = f.render();
            expect(unchanged.keys).toEqual(original.keys);
            expect(unchanged.source.propertyKeyComparator).toBe(original.source.propertyKeyComparator);
        }
        for (let index = 0; index < 50; index += 1) {
            f.folderSource.fileChangeVersion += 1;
            expect(f.render().keys).toEqual(original.keys);
        }
        const status = f.fileData.propertyTree.get('status')!;
        f.fileData.propertyTree = new Map(f.fileData.propertyTree);
        f.fileData.propertyTree.set('status', {
            ...status,
            notesWithValue: new Set([...status.notesWithValue, ...Array.from({ length: 300 }, (_, index) => `New/${index}.md`)])
        });
        expect(f.render().keys[0]).toBe('status');
        for (const operation of [f.inventory, f.getFile, f.read, f.cachedRead, f.process]) expect(operation).not.toHaveBeenCalled();
        expect(state.updateSettings).not.toHaveBeenCalled();
    });
});
