import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { Virtualizer } from '@tanstack/react-virtual';
import { App, TFile } from 'obsidian';
import { ItemType, ListPaneItemType } from '../../src/types';
import type { ListPaneItem } from '../../src/types/virtualization';
import { createDefaultFileData, type FileData, type IndexedDBStorage } from '../../src/storage/IndexedDBStorage';
import { estimateFileRowHeight, getListPaneMeasurements } from '../../src/utils/listPaneMeasurements';
import { createHiddenTagVisibility } from '../../src/utils/tagPrefixMatcher';
import { resolveListFileRowHeightInputs, type ListFileRowSizingConfig } from '../../src/hooks/useListPaneScroll';
import { createTestTFile } from '../utils/createTestTFile';
import { useStorageVaultSync, type PendingFileFlushBuffer } from '../../src/context/storage/useStorageVaultSync';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import * as fileNameUtils from '../../src/utils/fileNameUtils';

vi.mock('react', async importOriginal => ({ ...(await importOriginal<typeof import('react')>()), useEffect: vi.fn() }));

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

function createFile(path: string): TFile {
    const file = createTestTFile(path);
    file.stat.mtime = 100;
    return file;
}

function currentRecord(file: TFile, changes: Partial<FileData> = {}): FileData {
    return {
        ...createDefaultFileData({ path: file.path, mtime: file.stat.mtime }),
        markdownPipelineMtime: file.stat.mtime,
        properties: [],
        featureImageStatus: 'none',
        featureImageKey: '',
        ...changes
    };
}

function sizingConfig(changes: Partial<ListFileRowSizingConfig> = {}): ListFileRowSizingConfig {
    return {
        heights: getListPaneMeasurements(false),
        titleRows: 2,
        previewRows: 2,
        showDate: false,
        showPreview: false,
        showImage: true,
        compactPaddingTotal: 18,
        isCompactMode: false,
        tagsBaseEnabled: false,
        frontmatterPropertyRowsPossible: false,
        propertyRowsPossible: false,
        showTextCountProperty: false,
        showWordCountProperty: false,
        showCharacterCountProperty: false,
        showFileProperties: false,
        showPropertiesOnSeparateRows: false,
        showFilePropertiesInCompactMode: false,
        characterCountSpaces: 'include',
        showParentFolder: false,
        showTaskProgress: false,
        hideTaskProgressWhenComplete: false,
        selectionType: ItemType.FOLDER,
        selectedType: null,
        includeDescendantNotes: false,
        selectedTagToHide: null,
        selectedPropertyValueNodeIdToHide: null,
        hiddenTagVisibility: createHiddenTagVisibility([], false),
        visiblePropertyKeys: new Set(),
        themeMode: 'light',
        ...changes
    };
}

function fixture(files: TFile[], frontmatter: Record<string, unknown> = {}) {
    const app = new App();
    const getFileCache = vi.fn(() => ({ frontmatter }));
    app.metadataCache.getFileCache = getFileCache;
    const records = new Map(files.map(file => [file.path, currentRecord(file)]));
    const getFile = vi.fn((path: string) => records.get(path) ?? null);
    const db = { getFile } as unknown as IndexedDBStorage;
    const config = sizingConfig();
    const items: ListPaneItem[] = files.map(file => ({ type: ListPaneItemType.FILE, key: file.path, data: file, hasTags: false }));
    const inputs = (index: number) =>
        resolveListFileRowHeightInputs({ app, db, hasPreview: () => false, file: files[index], item: items[index], config });
    const estimate = (index: number, titleHeight?: number) => estimateFileRowHeight(inputs(index), config, titleHeight);
    const virtualizer = new Virtualizer<HTMLDivElement, Element>({
        count: files.length,
        getItemKey: index => files[index].path,
        getScrollElement: () => null,
        initialRect: { width: 400, height: 600 },
        estimateSize: index => estimate(index),
        scrollToFn: () => undefined,
        observeElementRect: () => undefined,
        observeElementOffset: () => undefined
    });
    return { app, records, getFile, getFileCache, config, inputs, estimate, virtualizer };
}

describe('drawing work during virtual row estimates', () => {
    it.each(['excalidraw-plugin', 'tldraw-file'])('observes a same-mtime %s metadata event before buffered reindexing', key => {
        vi.useFakeTimers();
        const file = createFile('Notes/Note.md');
        const f = fixture([file]);
        const callbacks = new Map<string, (...args: unknown[]) => void>();
        Object.assign(f.app.metadataCache, {
            on: (event: string, callback: (...args: unknown[]) => void) => {
                callbacks.set(event, callback);
                return { event };
            },
            offref: () => undefined
        });
        Object.assign(f.app.vault, { on: () => ({}), offref: () => undefined });
        const metadataBuffer: PendingFileFlushBuffer = { files: new Map(), timerId: null, isProcessing: false };
        let cleanup: (() => void) | undefined;
        vi.mocked(useEffect).mockImplementation(effect => {
            cleanup = effect() || undefined;
        });
        const settings = structuredClone(DEFAULT_SETTINGS);
        const rebuild = vi.fn() as unknown as NonNullable<Parameters<typeof useStorageVaultSync>[0]['rebuildFileCacheRef']['current']>;
        useStorageVaultSync({
            app: f.app,
            api: null,
            settings,
            latestSettingsRef: { current: settings },
            stoppedRef: { current: false },
            isFirstLoadRef: { current: false },
            isIndexedDBReady: true,
            hasBuiltInitialCacheRef: { current: true },
            setIsStorageReady: () => undefined,
            isStorageReadyRef: { current: true },
            contentRegistryRef: { current: null },
            pendingSyncTimeoutIdRef: { current: null },
            pendingRenameDataRef: { current: new Map() },
            modifyFlushBufferRef: { current: { files: new Map(), timerId: null, isProcessing: false } },
            metadataChangeFlushBufferRef: { current: metadataBuffer },
            renameFlushBufferRef: { current: { moves: [], timerId: null } },
            buildFileCacheFnRef: { current: null },
            rebuildFileCacheRef: { current: rebuild },
            activeVaultEventRefsRef: { current: null },
            activeMetadataEventRefRef: { current: null },
            rebuildTagTree: () => new Map(),
            scheduleTagTreeRebuild: () => undefined,
            rebuildPropertyTree: () => new Map(),
            schedulePropertyTreeRebuild: () => undefined,
            cancelTreeRebuildDebouncer: () => undefined,
            startCacheRebuildNotice: () => undefined,
            getIndexableFiles: () => [file],
            getVisibleMarkdownFiles: () => [file],
            queueMetadataContentWhenReady: () => undefined,
            queueAllMarkdownForWordCountActivation: () => undefined,
            queueIndexableFilesForContentGeneration: files => ({ markdownFiles: files }),
            queueIndexableFilesNeedingContentGeneration: () => undefined,
            disposeMetadataWaitDisposers: () => undefined
        });
        try {
            expect(f.inputs(0).showFeatureImageArea).toBe(false);
            f.getFileCache.mockReturnValue({ frontmatter: { [key]: true } });
            callbacks.get('changed')?.(file);
            expect(metadataBuffer.files.get(file.path)).toBe(file);
            expect(metadataBuffer.timerId).not.toBeNull();
            // The real queue has received the event but its 100ms flush has not run. Existing
            // indexed properties/mtime are still unchanged; classification must use live metadata.
            expect(f.records.get(file.path)?.properties).toEqual([]);
            expect(f.records.get(file.path)?.markdownPipelineMtime).toBe(file.stat.mtime);
            expect(f.inputs(0).showFeatureImageArea).toBe(true);
        } finally {
            cleanup?.();
        }
    });

    it('skips provider flag parsing for 1000 ordinary notes while preserving live metadata and measured geometry', () => {
        const files = Array.from({ length: 1000 }, (_, index) => createFile(`Notes/Note ${index}.md`));
        const ordinary = fixture(files);
        // An explicit false flag exercises the full provider classifier without changing geometry.
        const reference = fixture(files, { 'excalidraw-plugin': false });
        const flagChecks = vi.spyOn(fileNameUtils, 'hasExcalidrawFrontmatterFlagValue');
        const measureSequence = (f: ReturnType<typeof fixture>) => {
            const geometry = [{ total: f.virtualizer.getTotalSize(), row: { ...f.virtualizer.measurementsCache[0] } }];
            for (let step = 0; step < 12; step++) {
                const index = step * 50;
                for (const titleRows of [1, 2]) {
                    f.virtualizer.resizeItem(index, f.estimate(index, f.config.heights.titleLineHeight * titleRows));
                    geometry.push({ total: f.virtualizer.getTotalSize(), row: { ...f.virtualizer.measurementsCache[index] } });
                }
            }
            return geometry;
        };
        const actual = measureSequence(ordinary);
        expect(flagChecks).not.toHaveBeenCalled();
        const expected = measureSequence(reference);
        expect(flagChecks.mock.calls.length).toBeGreaterThan(10000);
        expect(actual).toEqual(expected);
        // Current metadata remains authoritative even though the provider loop is unnecessary.
        expect(ordinary.getFileCache).toHaveBeenCalledTimes(reference.getFileCache.mock.calls.length);
        expect(ordinary.getFileCache.mock.calls.length).toBeGreaterThan(10000);
        const reads = ordinary.getFile.mock.calls.length;
        ordinary.virtualizer.resizeItem(0, ordinary.virtualizer.measurementsCache[0].size);
        ordinary.virtualizer.getTotalSize();
        expect(ordinary.getFile).toHaveBeenCalledTimes(reads);
    });

    it.each([
        { name: 'stale file generation', changes: { markdownPipelineMtime: 99 } },
        { name: 'metadata regeneration at unchanged mtime', changes: { markdownPipelineMtime: 0 } },
        { name: 'unavailable property snapshot', changes: { properties: null } },
        { name: 'body-detected drawing awaiting metadata', changes: { featureImageKey: 'd:tldraw:Notes/Note.md' } }
    ])('keeps live metadata inspection for $name', ({ changes }) => {
        const file = createFile('Notes/Note.md');
        const f = fixture([file], { 'tldraw-file': true });
        f.records.set(file.path, currentRecord(file, changes));
        expect(f.inputs(0).showFeatureImageArea).toBe(true);
        expect(f.getFileCache).toHaveBeenCalledOnce();
    });

    it('keeps the live metadata path before the file is indexed', () => {
        const file = createFile('Notes/Note.md');
        const f = fixture([file], { 'tldraw-file': true });
        f.records.clear();
        expect(f.inputs(0).showFeatureImageArea).toBe(true);
        expect(f.getFileCache).toHaveBeenCalledOnce();
    });

    it.each(['excalidraw-plugin', 'tldraw-file'])('does not infer %s flag truthiness from flattened property values', key => {
        const file = createFile('Notes/Note.md');
        for (const value of [null, '', [], {}, false, 0, 'false', 'parsed', true]) {
            const f = fixture([file], { [key]: value });
            // Empty/unsupported values retain the key in the property index. Its flattened
            // representation must never become a second source of flag truthiness rules.
            f.records.set(file.path, currentRecord(file, { properties: [{ fieldKey: key, value: '' }] }));
            const expected = value !== null && value !== '' && value !== false && value !== 0 && value !== 'false';
            expect(f.inputs(0).showFeatureImageArea).toBe(expected);
            expect(f.getFileCache).toHaveBeenCalledOnce();
        }
    });

    it('keeps excluded drawings and their missing companion-image layout', () => {
        const file = createFile('Notes/Drawing.md');
        const f = fixture([file], { 'excalidraw-plugin': 'parsed' });
        f.records.set(
            file.path,
            currentRecord(file, { properties: [{ fieldKey: 'excalidraw-plugin', value: 'parsed' }], featureImageKey: '' })
        );
        expect(f.inputs(0).showFeatureImageArea).toBe(true);
        expect(f.inputs(0).showExtensionBadgeThumbnail).toBe(true);
        const image = createFile('Notes/Drawing.dark.png');
        f.app.vault.getAbstractFileByPath = path => (path === image.path ? image : null);
        f.config.themeMode = 'dark';
        expect(f.inputs(0).showExtensionBadgeThumbnail).toBe(false);
    });

    it.each(['Sketch.excalidraw.md', 'Sketch.excalidraw', 'Sketch.tldr'])(
        'keeps filename-based drawing detection for %s after a rename',
        name => {
            const file = createFile('Notes/Ordinary.md');
            const f = fixture([file]);
            expect(f.inputs(0).showFeatureImageArea).toBe(false);
            const record = f.records.get(file.path)!;
            Object.assign(file, createFile(`Notes/${name}`));
            f.records.set(file.path, record);
            expect(f.inputs(0).showFeatureImageArea).toBe(true);
        }
    );

    it('recomputes geometry from current metadata on content/settings invalidation', () => {
        const file = createFile('Notes/Note.md');
        const f = fixture([file]);
        const ordinaryHeight = f.virtualizer.getTotalSize();
        expect(f.getFileCache).toHaveBeenCalledOnce();
        file.stat.mtime++;
        f.getFileCache.mockReturnValue({ frontmatter: { 'tldraw-file': true } });
        f.virtualizer.measure();
        expect(f.virtualizer.getTotalSize()).toBeGreaterThan(ordinaryHeight);
        expect(f.getFileCache).toHaveBeenCalledTimes(2);

        f.records.set(file.path, currentRecord(file));
        f.getFileCache.mockReturnValue({ frontmatter: {} });
        f.virtualizer.measure();
        expect(f.virtualizer.getTotalSize()).toBe(ordinaryHeight);
        expect(f.getFileCache).toHaveBeenCalledTimes(3);
        f.config.showDate = true;
        f.virtualizer.measure();
        expect(f.virtualizer.getTotalSize()).toBeGreaterThan(ordinaryHeight);
        expect(f.getFileCache).toHaveBeenCalledTimes(4);
    });
});
