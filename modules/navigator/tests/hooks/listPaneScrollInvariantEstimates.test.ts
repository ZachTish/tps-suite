import { afterEach, describe, expect, it, vi } from 'vitest';
import { Virtualizer, type VirtualizerOptions } from '@tanstack/react-virtual';
import { App, TFolder } from 'obsidian';
import type { SelectionState } from '../../src/context/SelectionContext';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { ListPaneAppearanceSettings } from '../../src/settings/listPaneAppearance';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import { createDefaultFileData, type FileData, type IndexedDBStorage } from '../../src/storage/IndexedDBStorage';
import { ItemType, ListPaneItemType } from '../../src/types';
import type { ListPaneItem } from '../../src/types/virtualization';
import { createHiddenTagVisibility } from '../../src/utils/tagPrefixMatcher';
import * as measurements from '../../src/utils/listPaneMeasurements';
import { resolveListFileRowHeightInputs, useListPaneScroll } from '../../src/hooks/useListPaneScroll';
import { createTestTFile } from '../utils/createTestTFile';

const contexts = vi.hoisted(() => ({ services: {}, storage: {} }));
vi.mock('../../src/context/ServicesContext', () => ({ useServices: () => contexts.services }));
vi.mock('../../src/context/StorageContext', () => ({ useFileCache: () => contexts.storage }));
vi.mock('../../src/hooks/useThemeMode', () => ({ useThemeMode: () => 'light' }));
vi.mock('react', async importOriginal => ({
    ...(await importOriginal<typeof import('react')>()),
    useRef: <T>(current: T) => ({ current }),
    useMemo: <T>(factory: () => T) => factory(),
    useCallback: <T>(callback: T) => callback,
    useState: <T>(initial: T) => [initial, vi.fn()],
    useEffect: vi.fn(),
    useLayoutEffect: vi.fn()
}));
vi.mock('@tanstack/react-virtual', async importOriginal => {
    const original = await importOriginal<typeof import('@tanstack/react-virtual')>();
    return {
        ...original,
        useVirtualizer: (options: VirtualizerOptions<HTMLDivElement, HTMLElement>) =>
            new original.Virtualizer({
                ...options,
                initialRect: { width: 400, height: 600 },
                scrollToFn: () => undefined,
                observeElementOffset: () => undefined
            })
    };
});

afterEach(() => vi.restoreAllMocks());

interface FixtureOptions {
    count?: number;
    mobile?: boolean;
    path?: string;
    appearance?: Partial<ListPaneAppearanceSettings>;
    settings?: Partial<NotebookNavigatorSettings>;
    record?: Partial<FileData>;
    item?: Partial<ListPaneItem>;
    includeDescendantNotes?: boolean;
    selectionType?: SelectionState['selectionType'];
    metrics?: measurements.ListPaneMeasurements;
}

function fixture(options: FixtureOptions = {}) {
    const app = new App();
    const mobile = options.mobile ?? false;
    if (options.metrics) vi.spyOn(measurements, 'getListPaneMeasurements').mockReturnValue(options.metrics);
    const files = Array.from({ length: options.count ?? 1 }, (_, index) => {
        const file = createTestTFile(options.path ?? `Notes/Note ${index}.md`);
        file.parent = new TFolder(file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '/');
        return file;
    });
    const frontmatter = { current: {} as Record<string, unknown> };
    const getFileCache = vi.fn(() => ({ frontmatter: frontmatter.current }));
    app.metadataCache.getFileCache = getFileCache;
    const getAbstractFileByPath = vi.spyOn(app.vault, 'getAbstractFileByPath');
    const records = new Map(
        files.map(file => [
            file.path,
            {
                ...createDefaultFileData({ path: file.path, mtime: file.stat.mtime }),
                featureImageStatus: 'none' as const,
                properties: [],
                ...options.record
            }
        ])
    );
    const getFile = vi.fn((path: string) => records.get(path) ?? null);
    const db = { getFile } as unknown as IndexedDBStorage;
    const hasPreview = vi.fn(() => false);
    contexts.services = { app, isMobile: mobile };
    contexts.storage = { getDB: () => db, hasPreview, isStorageReady: true };
    const settings = { ...structuredClone(DEFAULT_SETTINGS), ...options.settings };
    const appearance: ListPaneAppearanceSettings = {
        mode: 'standard',
        titleRows: 2,
        previewRows: 2,
        showDate: false,
        showParentFolder: true,
        showPreview: false,
        showImage: true,
        showTags: false,
        showProperties: false,
        showTaskProgress: false,
        textCountDisplay: 'none',
        groupBy: 'none',
        multiValueGrouping: 'separate',
        noValueGroupPosition: 'bottom',
        ...options.appearance
    };
    const items: ListPaneItem[] = files.map(file => ({
        type: ListPaneItemType.FILE,
        key: file.path,
        data: file,
        parentFolder: '/',
        hasTags: false,
        ...options.item
    }));
    const root = new TFolder('/');
    const selection: SelectionState = {
        selectionType: options.selectionType ?? ItemType.FOLDER,
        selectedFolder: root,
        selectedTag: null,
        selectedProperty: null,
        selectedType: null,
        selectedFiles: new Set(),
        selectedRow: null,
        anchorIndex: null,
        lastMovementDirection: null,
        isRevealOperation: false,
        isFolderChangeWithAutoSelect: false,
        isKeyboardNavigation: false,
        isFolderNavigation: false,
        selectedFile: null,
        revealSource: null,
        navigationHistory: [],
        navigationHistoryIndex: 0
    };
    // Capture the real hook-derived sizing configuration, without replacing the
    // geometry calculation. Effects/DOM are mocked; estimate/measure callbacks
    // and TanStack's unmeasured-tail walk are the real implementation.
    let config: measurements.FileRowHeightConfig | undefined;
    const originalEstimate = measurements.estimateFileRowHeight;
    vi.spyOn(measurements, 'estimateFileRowHeight').mockImplementation((inputs, sizing, titleHeight) => {
        config = sizing;
        return originalEstimate(inputs, sizing, titleHeight);
    });
    const { rowVirtualizer } = useListPaneScroll({
        listItems: items,
        filePathToIndex: new Map(files.map((file, index) => [file.path, index])),
        selectedFile: null,
        selectedFolder: root,
        selectedTag: null,
        selectedProperty: null,
        settings,
        folderSettings: appearance,
        isVisible: true,
        selectionState: selection,
        selectionDispatch: vi.fn(),
        topSpacerHeight: 0,
        includeDescendantNotes: options.includeDescendantNotes ?? true,
        groupCollapseStateSignature: '',
        visiblePropertyKeys: new Set(['status']),
        visiblePropertyKeySignature: 'status',
        hiddenTagVisibility: createHiddenTagVisibility([], false)
    });
    const estimate = (index = 0) => rowVirtualizer.options.estimateSize(index);
    const reference = (index = 0, titleHeight?: number) => {
        if (!config) throw Error('Call the actual estimate callback before the reference');
        const inputs = resolveListFileRowHeightInputs({
            app,
            db,
            hasPreview,
            item: items[index],
            file: files[index],
            config: config as Parameters<typeof resolveListFileRowHeightInputs>[0]['config']
        });
        return originalEstimate(inputs, config, titleHeight);
    };
    const measure = (titleHeight: number, index = 0) =>
        rowVirtualizer.options.measureElement(
            { getAttribute: () => String(index), getBoundingClientRect: () => ({ height: titleHeight }) } as unknown as HTMLElement,
            undefined,
            rowVirtualizer
        );
    const clearCounts = () => {
        getFile.mockClear();
        getFileCache.mockClear();
        getAbstractFileByPath.mockClear();
        hasPreview.mockClear();
    };
    return {
        app,
        files,
        frontmatter,
        records,
        getFile,
        getFileCache,
        getAbstractFileByPath,
        hasPreview,
        rowVirtualizer,
        estimate,
        measure,
        reference,
        clearCounts
    };
}

describe('image-invariant unmeasured file estimates', () => {
    it('does zero metadata or record work across 1000 rows and repeated measured-tail rebuilds', () => {
        const f = fixture({ count: 1000 });
        f.estimate(); // Capture the actual hook configuration for the unchanged resolver.
        const referenceVirtualizer = new Virtualizer({
            ...f.rowVirtualizer.options,
            estimateSize: index => f.reference(index)
        });
        const exercise = (virtualizer: typeof f.rowVirtualizer) => {
            const snapshot = () => ({
                total: virtualizer.getTotalSize(),
                rows: virtualizer.measurementsCache.map(({ key, start, size, end }) => ({ key, start, size, end }))
            });
            const geometry = [snapshot()];
            for (const index of [0, 20, 200]) {
                virtualizer.resizeItem(index, 55);
                geometry.push(snapshot());
                virtualizer.resizeItem(index, 75);
                geometry.push(snapshot());
            }
            return geometry;
        };
        f.clearCounts();
        const expected = exercise(referenceVirtualizer);
        expect(f.getFileCache.mock.calls.length).toBe(6554);
        expect(f.getFile.mock.calls.length).toBe(6554);
        f.clearCounts();
        expect(exercise(f.rowVirtualizer)).toEqual(expected);
        expect(f.getFileCache.mock.calls.length).toBe(0);
        expect(f.getFile.mock.calls.length).toBe(0);
        expect(f.getAbstractFileByPath).not.toHaveBeenCalled();
        expect(f.hasPreview).not.toHaveBeenCalled();
    });

    it.each([false, true])('preserves image/drawing geometry on mobile=%s without inspecting it', mobile => {
        const f = fixture({ mobile });
        for (const frontmatter of [{}, { 'excalidraw-plugin': true }, { 'tldraw-file': true }]) {
            f.frontmatter.current = frontmatter;
            for (const featureImageStatus of ['unprocessed', 'none', 'has'] as const) {
                f.records.get(f.files[0].path)!.featureImageStatus = featureImageStatus;
                f.clearCounts();
                const actual = f.estimate();
                expect(f.getFileCache).not.toHaveBeenCalled();
                expect(f.getFile).not.toHaveBeenCalled();
                expect(actual).toBe(f.reference());
            }
        }
    });

    it.each([
        { name: 'fractional metrics', title: 18.25, metadata: 17.5, floor: 40.25, padding: 13.5 },
        { name: 'exact image floor', title: 20.5, metadata: 18.5, floor: 59.5, padding: 15.25 },
        { name: 'large text metrics', title: 39, metadata: 30, floor: 100, padding: 24 }
    ])('uses existing geometry with $name', ({ title, metadata, floor, padding }) => {
        const metrics = {
            ...measurements.getListPaneMeasurements(false),
            titleLineHeight: title,
            singleTextLineHeight: metadata,
            featureImageMinHeight: floor,
            basePadding: padding
        };
        const f = fixture({ metrics });
        for (const fm of [{}, { 'tldraw-file': true }, { 'excalidraw-plugin': true }]) {
            f.frontmatter.current = fm;
            f.clearCounts();
            const actual = f.estimate();
            expect(f.getFileCache).not.toHaveBeenCalled();
            expect(actual).toBe(f.reference());
        }
    });

    it('uses the date line without requiring a parent-folder line', () => {
        const f = fixture({ path: 'Root.md', appearance: { showDate: true, showParentFolder: false } });
        expect(f.estimate()).toBe(75);
        expect(f.getFileCache).not.toHaveBeenCalled();
        expect(f.getFile).not.toHaveBeenCalled();
    });

    it.each([ItemType.TAG, ItemType.PROPERTY])('retains the %s parent-line rule with descendants off', selectionType => {
        const f = fixture({ selectionType, includeDescendantNotes: false });
        expect(f.estimate()).toBe(75);
        expect(f.getFileCache).not.toHaveBeenCalled();
        expect(f.estimate()).toBe(f.reference());
    });

    it('does not inspect a present drawing companion image when it cannot change the estimate', () => {
        const f = fixture();
        const image = createTestTFile('Notes/Note 0.light.png');
        f.frontmatter.current = { 'excalidraw-plugin': true };
        f.getAbstractFileByPath.mockImplementation(path => (path === image.path ? image : null));
        const actual = f.estimate();
        expect(f.getFileCache).not.toHaveBeenCalled();
        expect(f.getAbstractFileByPath).not.toHaveBeenCalled();
        expect(actual).toBe(f.reference());
        expect(f.getAbstractFileByPath).toHaveBeenCalled();
    });

    it.each(['standard', 'compact'] as const)('preserves the existing disabled-image path in %s mode', mode => {
        const f = fixture({ appearance: { mode, showImage: false } });
        const actual = f.estimate();
        expect(f.getFileCache).not.toHaveBeenCalled();
        expect(f.getFile).not.toHaveBeenCalled();
        expect(actual).toBe(f.reference());
    });

    it.each([
        { name: 'one title row below the image floor', appearance: { titleRows: 1 } },
        { name: 'pinned file', item: { isPinned: true } },
        { name: 'no parent line', appearance: { showParentFolder: false } },
        { name: 'root-level note', path: 'Root.md' },
        { name: 'descendants off', includeDescendantNotes: false },
        { name: 'same parent folder', item: { parentFolder: 'Notes' } },
        { name: 'compact mode with images configured', appearance: { mode: 'compact' } },
        { name: 'preview enabled', appearance: { showPreview: true } },
        { name: 'tags enabled', appearance: { showTags: true }, item: { hasTags: true } },
        { name: 'property rows enabled', appearance: { showProperties: true } },
        { name: 'task progress enabled', appearance: { showTaskProgress: true } }
    ] satisfies (FixtureOptions & { name: string })[])('keeps live inspection for $name', options => {
        const f = fixture(options);
        for (const fm of [{}, { 'tldraw-file': true }]) {
            f.frontmatter.current = fm;
            f.clearCounts();
            const actual = f.estimate();
            expect(f.getFileCache).toHaveBeenCalledOnce();
            expect(actual).toBe(f.reference());
        }
    });

    it('keeps a higher custom image floor on the live path', () => {
        const f = fixture({ metrics: { ...measurements.getListPaneMeasurements(false), featureImageMinHeight: 60 } });
        expect(f.estimate()).toBe(75);
        expect(f.getFileCache).toHaveBeenCalledOnce();
        f.frontmatter.current = { 'tldraw-file': true };
        expect(f.estimate()).toBe(76);
    });

    it.each(['excalidraw-plugin', 'tldraw-file'])('keeps same-mtime %s changes live in measured titles', flag => {
        const f = fixture();
        expect(f.estimate()).toBe(75);
        f.clearCounts();
        expect(f.measure(20)).toBe(55);
        const mtime = f.files[0].stat.mtime;
        f.frontmatter.current = { [flag]: true };
        expect(f.estimate()).toBe(75);
        expect(f.measure(20)).toBe(58);
        f.frontmatter.current = {};
        expect(f.measure(20)).toBe(55);
        expect(f.files[0].stat.mtime).toBe(mtime);
        expect(f.getFileCache).toHaveBeenCalledTimes(3);
    });

    it('preserves non-file spacer estimates without record reads', () => {
        const f = fixture({ item: { type: ListPaneItemType.BOTTOM_SPACER } });
        expect(f.estimate()).toBe(measurements.getListPaneMeasurements(false).bottomSpacer);
        expect(f.getFile).not.toHaveBeenCalled();
        expect(f.getFileCache).not.toHaveBeenCalled();
    });
});
