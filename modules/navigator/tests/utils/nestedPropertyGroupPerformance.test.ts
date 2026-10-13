import { describe, expect, it, vi } from 'vitest';
import { App, type TFile } from 'obsidian';
import { buildListItems, type ListPaneConfig } from '../../src/hooks/listPaneData/listItems';
import { nestPropertyListItems } from '../../src/utils/nestedPropertyGroups';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { FILE_VISIBILITY } from '../../src/utils/fileTypeUtils';
import { ItemType, ListPaneItemType } from '../../src/types';
import type { IndexedDBStorage } from '../../src/storage/IndexedDBStorage';
import { createTestTFile } from './createTestTFile';

describe('nested property presentation operation counts', () => {
    it('uses the same one metadata lookup per note as flat grouping and no source work for hierarchy/collapse bursts', () => {
        const app = new App();
        const files = Array.from({ length: 4049 }, (_, index) => createTestTFile(`QA/${index}.md`));
        const metadata = new Map(
            files.map((file, index) => [file.path, { frontmatter: { kind: [`transaction/financial/group${index % 8}`] } }])
        );
        const getFileCache = vi.fn((file: TFile) => metadata.get(file.path) ?? null);
        app.metadataCache.getFileCache = getFileCache;
        const read = vi.fn(async () => '');
        const cachedRead = vi.fn(async () => '');
        const modify = vi.fn(async () => {});
        const getMarkdownFiles = vi.fn(() => files);
        app.vault.read = read;
        app.vault.cachedRead = cachedRead;
        app.vault.modify = modify;
        app.vault.getMarkdownFiles = getMarkdownFiles;
        const listConfig: ListPaneConfig = {
            filterPinnedByFolder: false,
            folderGroupSortOrder: 'alpha-asc',
            groupBy: 'property:kind',
            pinnedGroupExpanded: true,
            pinnedNotes: {},
            showCurrentFolderFilesAtBottom: false,
            showFolderGroupPaths: false,
            showFileTags: false
        };
        const args = {
            app,
            files,
            listConfig,
            dayKey: '2026-10-10',
            fileVisibility: FILE_VISIBILITY.DOCUMENTS,
            getDB: () => ({ getFile: () => null }) as unknown as IndexedDBStorage,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            hiddenFileState: new Map<string, boolean>(),
            hiddenTags: [],
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectionType: ItemType.FOLDER,
            showHiddenItems: false,
            sortOption: DEFAULT_SETTINGS.defaultFolderSort
        };
        const flat = buildListItems(args);
        expect(getFileCache).toHaveBeenCalledTimes(4049);
        expect(nestPropertyListItems(flat, new Set(), 'asc')).toBe(flat);
        getFileCache.mockClear();
        const pathGroups = buildListItems({ ...args, listConfig: { ...listConfig, groupBy: 'property-path:kind' } });
        expect(getFileCache).toHaveBeenCalledTimes(4049);
        const nested = nestPropertyListItems(pathGroups, new Set(), 'asc');
        const root = nested.find(item => item.type === ListPaneItemType.HEADER && item.data === 'transaction');
        expect(root?.groupItemCount).toBe(4049);
        expect(nested.filter(item => item.type === ListPaneItemType.FILE)).toHaveLength(4049);
        for (let iteration = 0; iteration < 100; iteration++) {
            const items = nestPropertyListItems(pathGroups, new Set(root?.collapseKey ? [root.collapseKey] : []), 'asc');
            expect(items.filter(item => item.type === ListPaneItemType.FILE)).toHaveLength(0);
        }
        // The extra presentation pass never resolves sources, inspects metadata again, or inventories the vault.
        expect(getFileCache).toHaveBeenCalledTimes(4049);
        expect(read).not.toHaveBeenCalled();
        expect(cachedRead).not.toHaveBeenCalled();
        expect(modify).not.toHaveBeenCalled();
        expect(getMarkdownFiles).not.toHaveBeenCalled();
    });
});
