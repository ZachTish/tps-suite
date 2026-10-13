import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import type { CachedMetadata } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { ALL_TAGS_TAG_ID, TAGGED_TAG_ID, UNTAGGED_TAG_ID } from '../../src/types';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import type { UseNavigationNoteCountsParams } from '../../src/hooks/navigationPane/data/useNavigationNoteCounts';
import { useNavigationNoteCounts } from '../../src/hooks/navigationPane/data/useNavigationNoteCounts';

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
const hooks = vi.hoisted(() => ({ active: null as HookRun | null }));

// Run the real count hook and file finder across renders, retaining React memo/ref/effect
// semantics. The Obsidian inventory/metadata facade is synthetic; DOM and paint are outside this check.
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

const runs: HookRun[] = [];
afterEach(() => {
    for (const run of runs.splice(0)) run.slots.forEach(slot => slot.cleanup?.());
    hooks.active = null;
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
        showTags: true,
        showNoteCount: true,
        showUntagged: true,
        hideDrawingPreviewImages: false,
        vaultProfiles: DEFAULT_SETTINGS.vaultProfiles.map(profile => ({
            ...profile,
            hiddenFolders: [],
            hiddenFileTags: [],
            hiddenFileProperties: [],
            hiddenFileNames: []
        }))
    };
    const params: UseNavigationNoteCountsParams = {
        app,
        isVisible: true,
        settings,
        propertiesSectionActive: false,
        itemsWithMetadata: [],
        includeDescendantNotes: true,
        visibleTaggedCount: 10,
        untaggedCount: size - 10,
        renderPropertyTree: new Map(),
        propertyCollectionCount: undefined,
        effectiveFrontmatterExclusions: [],
        hiddenFolders: [],
        descendantExcludedFolders: [],
        hiddenFileTags: [],
        showHiddenItems: false,
        folderCountFileNameMatcher: null,
        fileVisibility: settings.vaultProfiles[0].fileVisibility,
        folderChangeVersion: 0,
        vaultChangeVersion: 0,
        metadataVisibilityVersion: 0,
        tagDataVersion: 0
    };
    const run: HookRun = { slots: [], cursor: 0, pending: [] };
    runs.push(run);
    const render = () => {
        run.cursor = 0;
        hooks.active = run;
        const result = useNavigationNoteCounts(params);
        for (const effect of run.pending.splice(0)) effect();
        hooks.active = null;
        return result;
    };
    const clearCounts = () => {
        getFiles.mockClear();
        getFileCache.mockClear();
    };
    const updateVersions = () => {
        params.folderChangeVersion += 1;
        params.vaultChangeVersion += 1;
        params.metadataVisibilityVersion += 1;
        params.tagDataVersion += 1;
    };
    return { params, render, inventory, metadata, getFiles, getFileCache, clearCounts, updateVersions };
}

describe('navigation count consumers', () => {
    it.each(['hidden', 'tags-disabled', 'counts-disabled'] as const)(
        'performs zero inventory and metadata work when %s across 20 version bursts',
        mode => {
            const fixture = createFixture();
            fixture.params.settings.vaultProfiles = fixture.params.settings.vaultProfiles.map(profile => ({
                ...profile,
                hiddenFileProperties: ['hidden=true']
            }));
            if (mode === 'hidden') fixture.params.isVisible = false;
            if (mode === 'tags-disabled') fixture.params.settings.showTags = false;
            if (mode === 'counts-disabled') fixture.params.settings.showNoteCount = false;
            for (let index = 0; index < 20; index += 1) {
                fixture.updateVersions();
                expect(fixture.render().tagCounts.size).toBe(0);
            }
            expect({
                inventory: fixture.getFiles.mock.calls.length,
                metadata: fixture.getFileCache.mock.calls.length
            }).toEqual({ inventory: 0, metadata: 0 });
        }
    );

    it('retains the last visible counts while hidden and catches up after deletion on reveal', () => {
        const fixture = createFixture();
        const original = fixture.render().tagCounts;
        expect(original.get(ALL_TAGS_TAG_ID)?.total).toBe(1_000);
        fixture.params.isVisible = false;
        fixture.clearCounts();
        fixture.inventory.delete('Notes/0.md');
        fixture.inventory.delete('Notes/1.md');
        fixture.updateVersions();
        expect(fixture.render().tagCounts).toBe(original);
        expect(fixture.getFiles).not.toHaveBeenCalled();
        fixture.params.isVisible = true;
        expect(fixture.render().tagCounts.get(ALL_TAGS_TAG_ID)?.total).toBe(998);
        expect(fixture.getFiles).toHaveBeenCalledTimes(1);
    });

    it.each(['showTags', 'showNoteCount'] as const)('catches up when %s is enabled without a new vault event', key => {
        const fixture = createFixture();
        fixture.params.settings[key] = false;
        fixture.render();
        fixture.inventory.delete('Notes/0.md');
        fixture.updateVersions();
        fixture.render();
        expect(fixture.getFiles).not.toHaveBeenCalled();
        fixture.params.settings = { ...fixture.params.settings, [key]: true };
        expect(fixture.render().tagCounts.get(ALL_TAGS_TAG_ID)?.total).toBe(999);
        expect(fixture.getFiles).toHaveBeenCalledTimes(1);
    });

    it('reuses the existing visible count memo for ordinary unchanged renders', () => {
        const fixture = createFixture();
        const original = fixture.render().tagCounts;
        fixture.clearCounts();
        for (let index = 0; index < 20; index += 1) expect(fixture.render().tagCounts).toBe(original);
        expect(fixture.getFiles).not.toHaveBeenCalled();
        expect(fixture.getFileCache).not.toHaveBeenCalled();
    });

    it('keeps aggregate Tags, tagged and untagged count semantics on the visible pane', () => {
        const fixture = createFixture();
        const result = fixture.render().tagCounts;
        expect(result.get(ALL_TAGS_TAG_ID)).toEqual({ current: 1_000, descendants: 0, total: 1_000 });
        expect(result.get(TAGGED_TAG_ID)).toEqual({ current: 10, descendants: 0, total: 10 });
        expect(result.get(UNTAGGED_TAG_ID)).toEqual({ current: 990, descendants: 0, total: 990 });
        fixture.params.includeDescendantNotes = false;
        expect(fixture.render().tagCounts.get(TAGGED_TAG_ID)?.total).toBe(0);
        expect(fixture.render().tagCounts.get(ALL_TAGS_TAG_ID)?.total).toBe(1_000);
        expect(fixture.getFiles).toHaveBeenCalledTimes(1);
    });

    it('reads current folder and frontmatter visibility rules after returning to navigation', () => {
        const fixture = createFixture(4);
        expect(fixture.render().tagCounts.get(ALL_TAGS_TAG_ID)?.total).toBe(4);
        fixture.params.isVisible = false;
        fixture.clearCounts();
        const file = new TFile('Excluded/hidden.md');
        fixture.inventory.set(file.path, file);
        fixture.metadata.set('Notes/0.md', { frontmatter: { archived: true } });
        fixture.params.settings = {
            ...fixture.params.settings,
            vaultProfiles: fixture.params.settings.vaultProfiles.map(profile => ({
                ...profile,
                hiddenFolders: ['Excluded'],
                hiddenFileProperties: ['archived=true']
            }))
        };
        fixture.updateVersions();
        fixture.render();
        expect(fixture.getFiles).not.toHaveBeenCalled();
        expect(fixture.getFileCache).not.toHaveBeenCalled();
        fixture.params.isVisible = true;
        expect(fixture.render().tagCounts.get(ALL_TAGS_TAG_ID)?.total).toBe(3);
        expect(fixture.getFiles).toHaveBeenCalledTimes(1);
        fixture.params.showHiddenItems = true;
        expect(fixture.render().tagCounts.get(ALL_TAGS_TAG_ID)?.total).toBe(5);
    });

    it('catches up on nested hidden-file tag changes made while the pane is hidden', () => {
        const fixture = createFixture(4);
        fixture.params.settings = {
            ...fixture.params.settings,
            vaultProfiles: fixture.params.settings.vaultProfiles.map(profile => ({ ...profile, hiddenFileTags: ['private'] }))
        };
        fixture.params.hiddenFileTags = ['private'];
        expect(fixture.render().tagCounts.get(ALL_TAGS_TAG_ID)?.total).toBe(4);
        fixture.params.isVisible = false;
        fixture.clearCounts();
        fixture.metadata.set('Notes/0.md', { frontmatter: { tags: ['private/work'] } });
        fixture.updateVersions();
        fixture.render();
        expect(fixture.getFiles).not.toHaveBeenCalled();
        expect(fixture.getFileCache).not.toHaveBeenCalled();
        fixture.params.isVisible = true;
        expect(fixture.render().tagCounts.get(ALL_TAGS_TAG_ID)?.total).toBe(3);
        fixture.metadata.set('Notes/0.md', { frontmatter: { tags: ['public'] } });
        fixture.updateVersions();
        expect(fixture.render().tagCounts.get(ALL_TAGS_TAG_ID)?.total).toBe(4);
    });

    it('continues consuming live creation and deletion versions while the pane is visible', () => {
        const fixture = createFixture(4);
        expect(fixture.render().tagCounts.get(ALL_TAGS_TAG_ID)?.total).toBe(4);
        fixture.clearCounts();
        const file = new TFile('Notes/added.md');
        fixture.inventory.set(file.path, file);
        fixture.updateVersions();
        expect(fixture.render().tagCounts.get(ALL_TAGS_TAG_ID)?.total).toBe(5);
        fixture.inventory.delete('Notes/1.md');
        fixture.updateVersions();
        expect(fixture.render().tagCounts.get(ALL_TAGS_TAG_ID)?.total).toBe(4);
        expect(fixture.getFiles).toHaveBeenCalledTimes(2);
    });
});
