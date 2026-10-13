import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import type { CachedMetadata } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import { ItemType, PROPERTIES_ROOT_VIRTUAL_FOLDER_ID } from '../../src/types';
import type { PropertyTreeNode, TagTreeNode } from '../../src/types/storage';
import type { NavigationPaneSourceState } from '../../src/hooks/navigationPane/data/useNavigationPaneSourceState';
import {
    useNavigationPaneTreeSections,
    type UseNavigationPaneTreeSectionsParams
} from '../../src/hooks/navigationPane/data/useNavigationPaneTreeSections';
import { useNavigationNoteCounts } from '../../src/hooks/navigationPane/data/useNavigationNoteCounts';
import { useFileItemPillDecorationState } from '../../src/hooks/useFileItemPillDecorationState';
import { createHiddenTagVisibility } from '../../src/utils/tagPrefixMatcher';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';
import type { NavigationRainbowState } from '../../src/hooks/useNavigationRainbowState';
import { getActiveNavRainbowSettings } from '../../src/utils/vaultProfiles';

interface HookSlot {
    value?: unknown;
    dependencies?: readonly unknown[];
    cleanup?: () => void;
}
interface HookRun {
    slots: HookSlot[];
    cursor: number;
    pending: Array<() => void>;
}
const hooks = vi.hoisted(() => ({ active: null as HookRun | null, settings: null as NotebookNavigatorSettings | null }));

// Execute the real tree/count/pill hooks and file finder across renders. Preserve
// memo/ref/effect identity; the Obsidian inventory/metadata and DOM are synthetic.
vi.mock('react', async original => {
    const react = await original<typeof import('react')>();
    const slot = () => {
        const run = hooks.active!;
        const index = run.cursor++;
        return { run, value: run.slots[index] ?? (run.slots[index] = {}) };
    };
    const changed = (value: HookSlot, dependencies: readonly unknown[]) =>
        !value.dependencies ||
        dependencies.length !== value.dependencies.length ||
        dependencies.some((dependency, index) => !Object.is(dependency, value.dependencies![index]));
    const memo = (factory: () => unknown, dependencies: readonly unknown[]) => {
        const { value } = slot();
        if (changed(value, dependencies)) {
            value.value = factory();
            value.dependencies = dependencies;
        }
        return value.value;
    };
    return {
        ...react,
        useMemo: memo,
        useRef: (initial: unknown) => memo(() => ({ current: initial }), []),
        useEffect(effect: () => void | (() => void), dependencies: readonly unknown[]) {
            const { run, value } = slot();
            if (!changed(value, dependencies)) return;
            value.dependencies = dependencies;
            run.pending.push(() => {
                value.cleanup?.();
                value.cleanup = effect() || undefined;
            });
        }
    };
});
vi.mock('../../src/context/SettingsContext', () => ({ useSettingsState: () => hooks.settings }));
vi.mock('../../src/storage/fileOperations', () => ({ getDBInstanceOrNull: () => null }));

const runs: HookRun[] = [];
afterEach(() => {
    runs.splice(0).forEach(run => run.slots.forEach(slot => slot.cleanup?.()));
    hooks.active = null;
    hooks.settings = null;
    vi.restoreAllMocks();
});

function createFixture(size = 1_000) {
    const app = new App();
    const inventory = new Map<string, TFile>();
    const metadata = new Map<string, CachedMetadata>();
    for (let index = 0; index < size; index += 1) {
        const file = new TFile(`Notes/${index}.md`);
        inventory.set(file.path, file);
        metadata.set(file.path, { frontmatter: {} });
    }
    const getFiles = vi.fn(() => [...inventory.values()]);
    const getFileCache = vi.fn((file: TFile) => metadata.get(file.path) ?? null);
    Object.assign(app.vault, { getFiles });
    Object.assign(app.metadataCache, { getFileCache });
    const settings: NotebookNavigatorSettings = {
        ...DEFAULT_SETTINGS,
        showTags: false,
        showProperties: true,
        showAllPropertiesFolder: true,
        showNoteCount: true,
        scopeTagsToCurrentContext: false,
        scopePropertiesToCurrentContext: false,
        hideDrawingPreviewImages: false,
        vaultProfiles: DEFAULT_SETTINGS.vaultProfiles.map(profile => ({
            ...profile,
            hiddenFolders: [],
            hiddenFileTags: [],
            hiddenFileProperties: [],
            hiddenFileNames: []
        }))
    };
    const hiddenTagVisibility = createHiddenTagVisibility([], false);
    const tagTree = new Map<string, TagTreeNode>();
    const sourceState: NavigationPaneSourceState = {
        effectiveFrontmatterExclusions: [],
        hiddenFolders: [],
        descendantExcludedFolders: [],
        hiddenTags: [],
        hiddenFileProperties: [],
        hiddenFileNames: [],
        hiddenFileTags: [],
        fileVisibility: settings.vaultProfiles[0].fileVisibility,
        navigationBannerPath: null,
        folderCountFileNameMatcher: null,
        hiddenFilePropertyMatcher: { hasCriteria: false, matches: () => false },
        rootFolders: [],
        rootLevelFolders: [],
        rootFolderOrderMap: new Map(),
        missingRootFolderPaths: [],
        tagTree,
        propertyTree: new Map(),
        untaggedCount: size,
        visibleTaggedCount: 0,
        hiddenTagMatcher: hiddenTagVisibility.matcher,
        hiddenMatcherHasRules: false,
        visibleTagTree: tagTree,
        hasRootPropertyShortcut: false,
        tagComparator: undefined,
        hiddenRootTagNodes: new Map(),
        tagTreeForOrdering: tagTree,
        rootTagOrderMap: new Map(),
        missingRootTagPaths: [],
        propertyKeyComparator: (a, b) => a.name.localeCompare(b.name),
        rootPropertyOrderMap: new Map(),
        missingRootPropertyKeys: [],
        visiblePropertyNavigationKeySet: new Set(),
        metadataDecorationVersion: 0,
        metadataVisibilityVersion: 0,
        tagDataVersion: 0,
        propertyDataVersion: 0,
        getFolderSortName: folder => folder.name,
        folderExclusionByFolderNote: undefined,
        recentNotesHiddenFileMatcher: () => false,
        fileChangeVersion: 0,
        folderChangeVersion: 0
    };
    const params: UseNavigationPaneTreeSectionsParams = {
        app,
        settings,
        isVisible: true,
        expansionState: {
            expandedFolders: new Set(),
            expandedTags: new Set(),
            expandedProperties: new Set(),
            expandedVirtualFolders: new Set()
        },
        showHiddenItems: false,
        includeDescendantNotes: true,
        sourceState,
        selectionScope: { selectionType: ItemType.FOLDER, selectedFolder: null },
        tagTreeService: null,
        propertyTreeService: null
    };
    const navRainbow = getActiveNavRainbowSettings(settings);
    const navRainbowState: NavigationRainbowState = {
        navRainbow: {
            ...navRainbow,
            mode: 'foreground',
            tags: { ...navRainbow.tags, scope: 'child' },
            properties: { ...navRainbow.properties, scope: 'child' }
        },
        navRainbowPalettes: {
            folder: null,
            tag: ['#111111', '#777777', '#eeeeee'],
            property: ['#222222', '#888888', '#ffffff'],
            shortcut: null,
            recent: null
        }
    };
    const run: HookRun = { slots: [], cursor: 0, pending: [] };
    runs.push(run);
    const render = () => {
        run.cursor = 0;
        hooks.active = run;
        hooks.settings = params.settings;
        const trees = useNavigationPaneTreeSections(params);
        const pills = useFileItemPillDecorationState({
            sourceState: params.sourceState,
            treeSections: trees,
            includeDescendantNotes: params.includeDescendantNotes,
            navRainbowState
        });
        const state = params.sourceState;
        const counts = useNavigationNoteCounts({
            app,
            isVisible: params.isVisible,
            settings: params.settings,
            propertiesSectionActive: trees.propertiesSectionActive,
            itemsWithMetadata: trees.propertyItems,
            includeDescendantNotes: params.includeDescendantNotes,
            visibleTaggedCount: state.visibleTaggedCount,
            untaggedCount: state.untaggedCount,
            renderPropertyTree: trees.renderPropertyTree,
            propertyCollectionCount: trees.propertyCollectionCount,
            effectiveFrontmatterExclusions: state.effectiveFrontmatterExclusions,
            hiddenFolders: state.hiddenFolders,
            descendantExcludedFolders: state.descendantExcludedFolders,
            hiddenFileTags: state.hiddenFileTags,
            showHiddenItems: params.showHiddenItems,
            folderCountFileNameMatcher: state.folderCountFileNameMatcher,
            fileVisibility: state.fileVisibility,
            folderChangeVersion: state.folderChangeVersion,
            vaultChangeVersion: state.fileChangeVersion,
            metadataVisibilityVersion: state.metadataVisibilityVersion,
            tagDataVersion: state.tagDataVersion
        });
        run.pending.splice(0).forEach(effect => effect());
        hooks.active = null;
        return { trees, pills, counts };
    };
    const clearCounts = () => {
        getFiles.mockClear();
        getFileCache.mockClear();
    };
    const updateSource = () => {
        params.sourceState = { ...params.sourceState, fileChangeVersion: params.sourceState.fileChangeVersion + 1 };
    };
    return { params, render, inventory, metadata, getFiles, getFileCache, clearCounts, updateSource };
}

function propertyNode(key: string, name: string, valuePath: string | null = null, children: PropertyTreeNode[] = []): PropertyTreeNode {
    const id = valuePath === null ? buildPropertyKeyNodeId(key) : buildPropertyValueNodeId(key, valuePath);
    return {
        id,
        kind: valuePath === null ? 'key' : 'value',
        key,
        valuePath,
        name,
        displayPath: name,
        children: new Map(children.map(child => [child.id, child])),
        notesWithValue: new Set(['Notes/0.md'])
    };
}

describe('navigation property count consumers', () => {
    it.each(['hidden', 'properties-disabled', 'counts-disabled', 'no-root-or-shortcut'] as const)(
        'does no aggregate inventory or metadata work when %s across 20 source updates',
        mode => {
            const fixture = createFixture();
            fixture.params.settings.vaultProfiles = fixture.params.settings.vaultProfiles.map(profile => ({
                ...profile,
                hiddenFileProperties: ['archived=true']
            }));
            if (mode === 'hidden') fixture.params.isVisible = false;
            if (mode === 'properties-disabled') fixture.params.settings.showProperties = false;
            if (mode === 'counts-disabled') fixture.params.settings.showNoteCount = false;
            if (mode === 'no-root-or-shortcut') fixture.params.settings.showAllPropertiesFolder = false;
            for (let index = 0; index < 20; index += 1) {
                fixture.updateSource();
                fixture.render();
            }
            expect({ inventory: fixture.getFiles.mock.calls.length, metadata: fixture.getFileCache.mock.calls.length }).toEqual({
                inventory: 0,
                metadata: 0
            });
        }
    );

    it.each([false, true])('keeps hidden aggregate work at zero (root shortcut only: %s)', shortcutOnly => {
        const fixture = createFixture();
        fixture.params.isVisible = false;
        fixture.params.settings.showAllPropertiesFolder = !shortcutOnly;
        fixture.params.sourceState.hasRootPropertyShortcut = shortcutOnly;
        fixture.render();
        expect(fixture.getFiles).not.toHaveBeenCalled();
        expect(fixture.getFileCache).not.toHaveBeenCalled();
        fixture.params.isVisible = true;
        expect(fixture.render().counts.propertyCounts.get(PROPERTIES_ROOT_VIRTUAL_FOLDER_ID)?.total).toBe(1_000);
        expect(fixture.getFiles).toHaveBeenCalledTimes(1);
    });

    it('retains the last visible counts while hidden and reads current additions/deletions on reveal', () => {
        const fixture = createFixture();
        const original = fixture.render().counts.propertyCounts;
        fixture.params.isVisible = false;
        fixture.clearCounts();
        fixture.inventory.delete('Notes/0.md');
        fixture.inventory.delete('Notes/1.md');
        const added = new TFile('Notes/new.md');
        fixture.inventory.set(added.path, added);
        fixture.metadata.set(added.path, { frontmatter: {} });
        fixture.updateSource();
        expect(fixture.render().counts.propertyCounts).toBe(original);
        expect(fixture.getFiles).not.toHaveBeenCalled();
        fixture.params.isVisible = true;
        expect(fixture.render().counts.propertyCounts.get(PROPERTIES_ROOT_VIRTUAL_FOLDER_ID)?.total).toBe(999);
        expect(fixture.getFiles).toHaveBeenCalledTimes(1);
    });

    it('rechecks inventory on reveal even without another source change', () => {
        const fixture = createFixture();
        fixture.params.isVisible = false;
        fixture.render();
        fixture.clearCounts();
        fixture.inventory.delete('Notes/0.md');
        fixture.params.isVisible = true;
        expect(fixture.render().counts.propertyCounts.get(PROPERTIES_ROOT_VIRTUAL_FOLDER_ID)?.total).toBe(999);
        expect(fixture.getFiles).toHaveBeenCalledTimes(1);
    });

    it('uses current folder/frontmatter/tag filters and deletion after returning to navigation', () => {
        const fixture = createFixture(5);
        expect(fixture.render().counts.propertyCounts.get(PROPERTIES_ROOT_VIRTUAL_FOLDER_ID)?.total).toBe(5);
        fixture.params.isVisible = false;
        fixture.clearCounts();
        fixture.inventory.delete('Notes/0.md');
        fixture.metadata.set('Notes/1.md', { frontmatter: { archived: true } });
        fixture.metadata.set('Notes/2.md', {
            frontmatter: {},
            tags: [{ tag: '#private', position: { start: { line: 0, col: 0, offset: 0 }, end: { line: 0, col: 0, offset: 0 } } }]
        });
        const hiddenFile = new TFile('Excluded/hidden.md');
        fixture.inventory.set(hiddenFile.path, hiddenFile);
        fixture.metadata.set(hiddenFile.path, { frontmatter: {} });
        fixture.params.settings = {
            ...fixture.params.settings,
            vaultProfiles: fixture.params.settings.vaultProfiles.map(profile => ({
                ...profile,
                hiddenFolders: ['Excluded'],
                hiddenFileProperties: ['archived=true'],
                hiddenFileTags: ['private']
            }))
        };
        fixture.updateSource();
        fixture.render();
        expect(fixture.getFiles).not.toHaveBeenCalled();
        expect(fixture.getFileCache).not.toHaveBeenCalled();
        fixture.params.isVisible = true;
        expect(fixture.render().counts.propertyCounts.get(PROPERTIES_ROOT_VIRTUAL_FOLDER_ID)?.total).toBe(2);
        expect(fixture.getFiles).toHaveBeenCalledTimes(1);
        fixture.params.showHiddenItems = true;
        expect(fixture.render().counts.propertyCounts.get(PROPERTIES_ROOT_VIRTUAL_FOLDER_ID)?.total).toBe(5);
        expect(fixture.getFiles).toHaveBeenCalledTimes(2);
    });

    it.each(['showProperties', 'showNoteCount'] as const)('catches up when %s is enabled without a vault event', setting => {
        const fixture = createFixture();
        fixture.params.settings[setting] = false;
        fixture.render();
        fixture.inventory.delete('Notes/0.md');
        fixture.params.settings = { ...fixture.params.settings, [setting]: true };
        expect(fixture.render().counts.propertyCounts.get(PROPERTIES_ROOT_VIRTUAL_FOLDER_ID)?.total).toBe(999);
        expect(fixture.getFiles).toHaveBeenCalledTimes(1);
    });

    it('keeps memoized tree, pill and count identity on unchanged renders', () => {
        const fixture = createFixture();
        const original = fixture.render();
        fixture.clearCounts();
        for (let index = 0; index < 20; index += 1) {
            const next = fixture.render();
            expect(next.trees.renderPropertyTree).toBe(original.trees.renderPropertyTree);
            expect(next.trees.propertyItems).toBe(original.trees.propertyItems);
            expect(next.pills).toBe(original.pills);
            expect(next.counts.propertyCounts).toBe(original.counts.propertyCounts);
        }
        expect(fixture.getFiles).not.toHaveBeenCalled();
        expect(fixture.getFileCache).not.toHaveBeenCalled();
    });

    it.each([false, true])('preserves nested tree ordering and file-pill colors while hidden (root shortcut only: %s)', shortcutOnly => {
        const fixture = createFixture();
        fixture.params.settings.showTags = true;
        fixture.params.settings.showAllPropertiesFolder = !shortcutOnly;
        fixture.params.sourceState.hasRootPropertyShortcut = shortcutOnly;
        const later = propertyNode('status', 'Later', 'open/later');
        const closed = propertyNode('status', 'Closed', 'closed');
        const open = propertyNode('status', 'Open', 'open', [later]);
        const status = propertyNode('status', 'Status', null, [closed, open]);
        const project = propertyNode('project', 'Project');
        const propertyTree = new Map([
            ['status', status],
            ['project', project]
        ]);
        const tagChild: TagTreeNode = {
            name: 'Child',
            path: 'alpha/child',
            displayPath: 'alpha/child',
            children: new Map(),
            notesWithTag: new Set(['Notes/0.md'])
        };
        const tagRoot: TagTreeNode = {
            name: 'alpha',
            path: 'alpha',
            displayPath: 'alpha',
            children: new Map([['alpha/child', tagChild]]),
            notesWithTag: new Set()
        };
        const tagTree = new Map([['alpha', tagRoot]]);
        fixture.params.settings.propertyTreeSortOverrides = { [status.id]: 'alpha-desc' };
        fixture.params.sourceState = {
            ...fixture.params.sourceState,
            propertyTree,
            visiblePropertyNavigationKeySet: new Set(['status', 'project']),
            rootPropertyOrderMap: new Map([
                ['project', 0],
                ['status', 1]
            ]),
            tagTree,
            visibleTagTree: tagTree,
            tagTreeForOrdering: tagTree
        };
        fixture.params.expansionState.expandedProperties.add(status.id);
        fixture.params.expansionState.expandedProperties.add(open.id);
        fixture.params.expansionState.expandedVirtualFolders.add(PROPERTIES_ROOT_VIRTUAL_FOLDER_ID);
        fixture.params.isVisible = false;
        const hidden = fixture.render();
        expect(fixture.getFiles).not.toHaveBeenCalled();
        fixture.params.isVisible = true;
        const visible = fixture.render();
        const rowKeys = [
            ...(!shortcutOnly ? [PROPERTIES_ROOT_VIRTUAL_FOLDER_ID] : []),
            project.id,
            status.id,
            open.id,
            later.id,
            closed.id
        ];
        expect(hidden.trees.resolvedRootPropertyKeys).toEqual(['project', 'status']);
        expect(hidden.trees.propertyItems.map(row => row.key)).toEqual(rowKeys);
        expect(visible.trees.propertyItems.map(row => row.key)).toEqual(rowKeys);
        expect(hidden.trees.renderPropertyTree).toBe(visible.trees.renderPropertyTree);
        expect(hidden.trees.renderTagTree).toBe(visible.trees.renderTagTree);
        expect(hidden.pills).toBe(visible.pills);
        expect(hidden.pills.tagRainbowColors.colorsByPath.has(tagChild.path)).toBe(true);
        expect(hidden.pills.propertyRainbowColors.colorsByNodeId.has(later.id)).toBe(true);
        expect(visible.counts.propertyCounts.get(PROPERTIES_ROOT_VIRTUAL_FOLDER_ID)?.total).toBe(1_000);
    });
});
