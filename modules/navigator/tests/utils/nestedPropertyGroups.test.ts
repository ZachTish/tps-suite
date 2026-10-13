import { App, TFile, TFolder } from 'obsidian';
import { describe, expect, it } from 'vitest';
import {
    buildListGroupItemCountData,
    buildListItems,
    buildOrderedFiles,
    findCollapsedListGroupRevealTarget,
    resolveListGroupExpansionToggleState,
    type ListPaneConfig
} from '../../src/hooks/listPaneData/listItems';
import { buildStandaloneStructuralTypePresentation } from '../../src/hooks/listPaneData/standaloneTypePresentation';
import { mergeProviderRowsIntoList, type ProviderPropertyGrouping } from '../../src/services/rows/providerListItems';
import type { NavigatorProvidedRow } from '../../src/services/rows/types';
import { ItemType, ListPaneItemType } from '../../src/types';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';
import type { ListPaneItem } from '../../src/types/virtualization';
import type { IndexedDBStorage } from '../../src/storage/IndexedDBStorage';
import { FILE_VISIBILITY } from '../../src/utils/fileTypeUtils';
import { buildListGroupCollapseKey, buildListGroupCollapseKeyPrefix } from '../../src/utils/listGroupCollapse';
import { nestPropertyListItems } from '../../src/utils/nestedPropertyGroups';
import { createTestTFile } from '../utils/createTestTFile';

const groupBy = 'property-path:kind' as const;

function fixture(values: Record<string, unknown>) {
    const app = new App();
    const root = new TFolder();
    root.path = '/';
    root.name = '';
    const files = Object.keys(values).map(path => {
        const file = createTestTFile(path);
        file.parent = root;
        return file;
    });
    app.metadataCache.getFileCache = file => ({ frontmatter: { kind: values[file.path] } });
    const config: ListPaneConfig = {
        filterPinnedByFolder: true,
        folderGroupSortOrder: 'alpha-asc',
        groupBy,
        pinnedGroupExpanded: true,
        pinnedNotes: {},
        showCurrentFolderFilesAtBottom: false,
        showFolderGroupPaths: false,
        showFileTags: false,
        multiValueGrouping: 'separate',
        noValueGroupPosition: 'bottom'
    };
    const args = {
        app,
        files,
        dayKey: '2026-10-10',
        fileVisibility: FILE_VISIBILITY.SUPPORTED,
        getDB: () => ({ getFile: () => null }) as unknown as IndexedDBStorage,
        getFileTimestamps: () => ({ created: 1, modified: 1 }),
        hiddenFileState: new Map<string, boolean>(),
        hiddenTags: [],
        listConfig: config,
        searchMetaMap: new Map(),
        selectedFolder: root,
        selectionType: ItemType.FOLDER,
        showHiddenItems: false,
        sortOption: 'title-asc' as const
    };
    return {
        ...args,
        build: (
            overrides: Partial<typeof args> & {
                collapsedListGroups?: ReadonlySet<string>;
                groupItemCountData?: ReturnType<typeof buildListGroupItemCountData>;
            } = {}
        ) => buildListItems({ ...args, ...overrides })
    };
}

function collapseKey(bucket: string): string {
    return buildListGroupCollapseKey({
        selectionType: ItemType.FOLDER,
        selectedFolderPath: '/',
        selectedTag: null,
        selectedProperty: null,
        groupingMode: groupBy,
        groupId: `property-path:${bucket}`
    });
}

function header(items: ListPaneItem[], path: string): ListPaneItem {
    const value = items.find(item => item.type === ListPaneItemType.HEADER && item.groupPath === path);
    expect(value).toBeDefined();
    return value!;
}

function provider(id: string, kind: unknown, sourcePath = 'A.md'): NavigatorProvidedRow {
    return { providerId: 'tps/example', id, kind: 'example', label: id, sourcePath, properties: { kind } };
}

function grouping(collapsedGroups = new Set<string>()): ProviderPropertyGrouping {
    return {
        propertyKey: 'kind',
        noValueLabel: 'No value',
        noValuePosition: 'bottom',
        valueGroupIdPrefix: 'property-path:',
        noValueGroupId: 'property-none',
        granularity: 'path',
        getCollapseKey: id =>
            buildListGroupCollapseKey({
                selectionType: ItemType.FOLDER,
                selectedFolderPath: '/',
                selectedTag: null,
                selectedProperty: null,
                groupingMode: groupBy,
                groupId: id
            }),
        isCollapsed: key => collapsedGroups.has(key)
    };
}

describe('nested property list composition', () => {
    it('aligns precomputed click indices with visible unique file order after a synthetic ancestor collapses', () => {
        const data = fixture({ 'A.md': ['alpha/one'], 'B.md': ['beta/two'], 'C.md': ['beta', 'beta/two'] });
        const collapsed = new Set([collapseKey('alpha')]);
        const flat = data.build({ collapsedListGroups: collapsed });
        const originalIndices = flat.filter(item => item.type === ListPaneItemType.FILE).map(item => item.fileIndex);
        const nested = nestPropertyListItems(flat, collapsed, 'asc');
        const { orderedFileIndexMap } = buildOrderedFiles(nested);
        nested.forEach(item => {
            if (item.type === ListPaneItemType.FILE && item.data instanceof TFile) {
                expect(item.fileIndex).toBe(orderedFileIndexMap.get(item.data.path));
            }
        });
        expect(orderedFileIndexMap).toEqual(
            new Map([
                ['C.md', 0],
                ['B.md', 1]
            ])
        );
        expect(flat.filter(item => item.type === ListPaneItemType.FILE).map(item => item.fileIndex)).toEqual(originalIndices);
    });
    it('keeps direct parent files and deduplicates native descendants across multiple values', () => {
        const data = fixture({
            'A.md': ['transaction/financial', 'transaction/financial/investment'],
            'B.md': ['transaction'],
            'C.md': ['transaction/financial/investment']
        });
        const nested = nestPropertyListItems(data.build(), new Set(), 'asc');
        expect(
            nested.filter(item => item.type === ListPaneItemType.HEADER).map(item => [item.groupPath, item.groupDepth, item.groupItemCount])
        ).toEqual([
            ['transaction', 0, 3],
            ['transaction/financial', 1, 2],
            ['transaction/financial/investment', 2, 2]
        ]);
        expect(new Set(header(nested, 'transaction').groupFilePaths)).toEqual(new Set(['A.md', 'B.md', 'C.md']));
        const parentIndex = nested.indexOf(header(nested, 'transaction'));
        const directFile = nested[parentIndex + 1].data;
        expect(directFile).toBeInstanceOf(TFile);
        if (!(directFile instanceof TFile)) throw new Error('Expected direct parent note');
        expect(directFile.path).toBe('B.md');
        expect(nested.filter(item => item.type === ListPaneItemType.FILE)).toHaveLength(4);
    });

    it('collapses ancestors and reuses existing reveal and bulk expansion through descendants', () => {
        const data = fixture({ 'A.md': ['transaction/financial/investment'], 'B.md': ['transaction/financial'] });
        const collapsed = new Set([collapseKey('transaction'), collapseKey('transaction/financial')]);
        const first = nestPropertyListItems(data.build({ collapsedListGroups: collapsed }), collapsed, 'asc');
        expect(first.filter(item => item.type === ListPaneItemType.HEADER)).toHaveLength(1);
        expect(first.some(item => item.type === ListPaneItemType.FILE)).toBe(false);
        expect(findCollapsedListGroupRevealTarget(first, 'A.md', true)).toEqual({
            type: 'list-group',
            collapseKey: collapseKey('transaction')
        });
        const prefix = buildListGroupCollapseKeyPrefix({
            selectionType: ItemType.FOLDER,
            selectedFolderPath: '/',
            selectedTag: null,
            selectedProperty: null,
            groupingMode: groupBy
        });
        expect(resolveListGroupExpansionToggleState(first, true, collapsed, prefix).collapseKeys).toEqual(Array.from(collapsed));
        collapsed.delete(collapseKey('transaction'));
        const second = nestPropertyListItems(data.build({ collapsedListGroups: collapsed }), collapsed, 'asc');
        expect(findCollapsedListGroupRevealTarget(second, 'A.md', true)).toEqual({
            type: 'list-group',
            collapseKey: collapseKey('transaction/financial')
        });
    });

    it('deduplicates multi-value provider identities without losing native or source-attached rows', () => {
        const data = fixture({ 'A.md': ['transaction/financial'], 'B.md': ['transaction/financial/investment'] });
        const rows: NavigatorProvidedRow[] = [
            provider('valued', ['transaction/financial', 'transaction/financial/investment']),
            { providerId: 'tps/example', id: 'attached', kind: 'example', label: 'attached', sourcePath: 'A.md' }
        ];
        const nested = nestPropertyListItems(mergeProviderRowsIntoList(data.build(), rows, grouping()), new Set(), 'asc');
        expect(header(nested, 'transaction').groupItemCount).toBe(4);
        expect(header(nested, 'transaction/financial').groupItemCount).toBe(4);
        expect(header(nested, 'transaction/financial/investment').groupItemCount).toBe(2);
        expect(header(nested, 'transaction').groupRowKeys).toHaveLength(2);
        expect(header(nested, 'transaction').groupFilePaths).toEqual(['A.md', 'B.md']);
    });

    it('counts provider-only collapsed descendants and preserves no-value groups and rows', () => {
        const data = fixture({ 'Empty.md': [], 'Literal.md': ['No value'] });
        const collapsed = new Set([collapseKey('transaction')]);
        const nested = nestPropertyListItems(
            mergeProviderRowsIntoList(
                data.build(),
                [provider('nested', ['transaction/financial/investment']), provider('empty', [])],
                grouping(collapsed)
            ),
            collapsed,
            'asc'
        );
        expect(header(nested, 'transaction')).toMatchObject({ groupItemCount: 1, groupFilePaths: [], isCollapsed: true });
        expect(
            nested.some(item => item.type === ListPaneItemType.PROVIDER_ROW && (item.data as NavigatorProvidedRow).id === 'nested')
        ).toBe(false);
        expect(header(nested, 'No value').groupItemCount).toBe(1);
        expect(nested.find(item => item.key === 'header-property-none')).toMatchObject({ groupItemCount: 2, data: 'None' });
        expect(nested.some(item => item.type === ListPaneItemType.PROVIDER_ROW && (item.data as NavigatorProvidedRow).id === 'empty')).toBe(
            true
        );
    });

    it('aggregates native search totals once per descendant note and suppresses incomplete provider totals', () => {
        const data = fixture({
            'A.md': ['transaction/financial', 'transaction/financial/investment'],
            'B.md': ['transaction/financial/investment'],
            'C.md': ['transaction']
        });
        const totals = buildListGroupItemCountData(data);
        const native = data.build({ files: [data.files[0]], groupItemCountData: totals });
        const nested = nestPropertyListItems(native, new Set(), 'asc');
        expect(header(nested, 'transaction')).toMatchObject({ groupItemCount: 1, groupTotalItemCount: 3 });
        expect(header(nested, 'transaction').groupTotalFilePaths).toEqual(expect.arrayContaining(['A.md', 'B.md', 'C.md']));
        expect(header(nested, 'transaction/financial')).toMatchObject({ groupItemCount: 1, groupTotalItemCount: 2 });
        const withProvider = nestPropertyListItems(
            mergeProviderRowsIntoList(native, [provider('one', ['transaction/financial'])], grouping()),
            new Set(),
            'asc'
        );
        expect(header(withProvider, 'transaction').groupItemCount).toBe(2);
        expect(header(withProvider, 'transaction').groupTotalItemCount).toBeUndefined();
        expect(header(withProvider, 'transaction/financial').groupTotalItemCount).toBeUndefined();
    });

    it('counts standalone structural rows independently of their shared source file', () => {
        const source = createTestTFile('Daily.md');
        const rows = [
            provider('one', ['transaction/financial'], source.path),
            provider('two', ['transaction/financial/investment'], source.path)
        ];
        const flat = buildStandaloneStructuralTypePresentation({
            rows,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            sort: { option: 'title-asc', propertyKey: '', propertySortSecondary: 'title' },
            groupBy: 'line-property-path:kind',
            dayKey: '2026-10-10',
            resolveFile: () => source,
            getFrontmatter: () => ({}),
            getFileTimestamps: () => ({ created: 1, modified: 1 }),
            noValueLabel: 'No value'
        });
        const nested = nestPropertyListItems(flat, new Set(), 'asc');
        expect(header(nested, 'transaction').groupItemCount).toBe(2);
        expect(header(nested, 'transaction').groupFilePaths).toEqual([source.path]);
        expect(header(nested, 'transaction').groupNativeFilePaths).toEqual([]);
        expect(nested.filter(item => item.type === ListPaneItemType.PROVIDER_ROW)).toHaveLength(2);
    });

    it('keeps combined values, note links, URLs and ambiguous slash values atomic', () => {
        const data = fixture({
            'Combined.md': ['entity/physical', 'entity/general'],
            'Link.md': ['[[Folder/Note]]'],
            'URL.md': ['https://example.com/path'],
            'Ambiguous.md': ['entity//physical']
        });
        const flat = data.build({ listConfig: { ...data.listConfig, multiValueGrouping: 'combine' } });
        const nested = nestPropertyListItems(flat, new Set(), 'asc');
        expect(nested.filter(item => item.type === ListPaneItemType.HEADER)).toHaveLength(4);
        expect(nested.filter(item => item.type === ListPaneItemType.HEADER).every(item => item.groupDepth === 0)).toBe(true);
        expect(
            nested.filter(item => item.type === ListPaneItemType.FILE).map(item => (item.data instanceof TFile ? item.data.path : ''))
        ).toEqual(
            expect.arrayContaining(
                Object.keys({
                    'Combined.md': 1,
                    'Link.md': 1,
                    'URL.md': 1,
                    'Ambiguous.md': 1
                })
            )
        );
        expect(nested.filter(item => item.type === ListPaneItemType.HEADER).map(item => item.key)).toEqual(
            expect.arrayContaining(flat.filter(item => item.type === ListPaneItemType.HEADER).map(item => item.key))
        );
    });

    it('orders siblings independently in descending mode without changing file order inside a bucket', () => {
        const data = fixture({ 'A.md': ['transaction/food'], 'B.md': ['transaction/financial'], 'C.md': ['entity/physical'] });
        const nested = nestPropertyListItems(data.build(), new Set(), 'desc');
        expect(nested.filter(item => item.type === ListPaneItemType.HEADER).map(item => item.groupPath)).toEqual([
            'transaction',
            'transaction/food',
            'transaction/financial',
            'entity',
            'entity/physical'
        ]);
        expect(
            nested.filter(item => item.type === ListPaneItemType.FILE).map(item => (item.data instanceof TFile ? item.data.path : ''))
        ).toEqual(['A.md', 'B.md', 'C.md']);
    });
});
