import { App, TFile, TFolder } from 'obsidian';
import { describe, expect, it } from 'vitest';
import {
    collectFileBackedTypeFiles,
    composeTypeListItems,
    getSelectedTypeSearchSourceScope,
    resolveMixedStructuralTypeCollections,
    resolveTypeListSnapshot,
    resolveTypeListMode
} from '../../../src/hooks/listPaneData/typeListItems';
import { buildListItems, type ListPaneConfig } from '../../../src/hooks/listPaneData/listItems';
import { buildSearchableNameData, filterListPaneFiles } from '../../../src/hooks/listPaneData/searchPipeline';
import { DEFAULT_SETTINGS } from '../../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../../src/settings/types';
import type { IndexedDBStorage } from '../../../src/storage/IndexedDBStorage';
import type { NavigatorProvidedRow } from '../../../src/services/rows/types';
import { ItemType, ListPaneItemType, PINNED_SECTION_HEADER_KEY } from '../../../src/types';
import {
    createTpsNavigatorProviderTypeId,
    TPS_NAVIGATOR_TYPE_IDS,
    type TpsNavigatorFileTypeId,
    type TpsNavigatorLineTypeId
} from '../../../src/types/navigatorTypes';
import type { ListPaneItem } from '../../../src/types/virtualization';
import { FILE_VISIBILITY } from '../../../src/utils/fileTypeUtils';
import { parseFilterSearchTokens } from '../../../src/utils/filterSearch';
import { getNavigatorPinContext, getVisibleVaultFiles } from '../../../src/utils/selectionUtils';
import { createTestTFile } from '../../utils/createTestTFile';

const FILE_TYPE_CASES: readonly [TpsNavigatorFileTypeId, string][] = [
    [TPS_NAVIGATOR_TYPE_IDS.NOTES, 'Notes/Overview.md'],
    [TPS_NAVIGATOR_TYPE_IDS.BASES, 'Data/Projects.base'],
    [TPS_NAVIGATOR_TYPE_IDS.CANVAS, 'Boards/Roadmap.canvas'],
    [TPS_NAVIGATOR_TYPE_IDS.DRAWINGS, 'Drawings/Flow.excalidraw.md'],
    [TPS_NAVIGATOR_TYPE_IDS.PDFS, 'Documents/Guide.pdf'],
    [TPS_NAVIGATOR_TYPE_IDS.IMAGES, 'Images/Diagram.png'],
    [TPS_NAVIGATOR_TYPE_IDS.AUDIO, 'Audio/Interview.mp3'],
    [TPS_NAVIGATOR_TYPE_IDS.VIDEO, 'Video/Demo.mp4']
];

const LINE_TYPE_IDS: readonly TpsNavigatorLineTypeId[] = [
    TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
    TPS_NAVIGATOR_TYPE_IDS.BULLETS,
    TPS_NAVIGATOR_TYPE_IDS.HEADINGS,
    TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS,
    TPS_NAVIGATOR_TYPE_IDS.CALLOUTS,
    TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES,
    TPS_NAVIGATOR_TYPE_IDS.TABLES,
    TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS
];

describe('selected Type source scope', () => {
    it('does not reapply a stale allowlist when the visible Type snapshot is already populated', () => {
        const staleEmptyScope = new Set<string>();

        expect(getSelectedTypeSearchSourceScope(false, staleEmptyScope)).toBeUndefined();
        expect(getSelectedTypeSearchSourceScope(true, staleEmptyScope)).toBe(staleEmptyScope);
    });
});

describe('vault-root mixed resources', () => {
    it('includes every fixed structural collection without requiring a search query', () => {
        expect(resolveMixedStructuralTypeCollections(true, null)).toEqual(LINE_TYPE_IDS);
        expect(resolveMixedStructuralTypeCollections(false, null)).toEqual([]);
        expect(resolveMixedStructuralTypeCollections(false, parseFilterSearchTokens('type:structural:task'))).toEqual([
            TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES
        ]);
    });
});

function createDb(): IndexedDBStorage {
    return { getFile: () => null } as IndexedDBStorage;
}

function createListConfig(): ListPaneConfig {
    return {
        filterPinnedByFolder: false,
        folderGroupSortOrder: 'alpha-asc',
        groupBy: 'date',
        pinnedGroupExpanded: true,
        pinnedNotes: {},
        showCurrentFolderFilesAtBottom: false,
        showFolderGroupPaths: true,
        showFileTags: false,
        showTags: false
    };
}

function createSupportedVisibilitySettings(): NotebookNavigatorSettings {
    const profile = DEFAULT_SETTINGS.vaultProfiles[0];
    return {
        ...DEFAULT_SETTINGS,
        vaultProfile: profile.id,
        vaultProfiles: [
            {
                ...profile,
                fileVisibility: FILE_VISIBILITY.SUPPORTED,
                hiddenFolders: [],
                hiddenTags: [],
                hiddenFileNames: [],
                hiddenFileTags: [],
                hiddenFileProperties: []
            }
        ]
    };
}

function setRootFiles(app: App, files: TFile[]): void {
    const root = app.vault.getRoot() as TFolder & { children: TFile[] };
    root.children = files;
    files.forEach(file => Reflect.set(file, 'parent', root));
}

describe('Type list routing', () => {
    it('uses the direct built-in snapshot for built-in selections and the aggregate snapshot for provider Types', () => {
        const builtinSnapshot = { revision: 1 } as never;
        const aggregateSnapshot = { revision: 2 } as never;

        expect(
            resolveTypeListSnapshot(
                resolveTypeListMode(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES),
                builtinSnapshot,
                aggregateSnapshot
            )
        ).toBe(builtinSnapshot);
        const providerTypeId = createTpsNavigatorProviderTypeId('example/provider', 'inbox');
        expect(providerTypeId).not.toBeNull();
        expect(resolveTypeListSnapshot(resolveTypeListMode(ItemType.TYPE, providerTypeId), builtinSnapshot, aggregateSnapshot)).toBe(
            aggregateSnapshot
        );
    });

    it.each(FILE_TYPE_CASES)('collects only visible files in %s', (typeId, matchingPath) => {
        const app = new App();
        const matching = createTestTFile(matchingPath);
        const other = createTestTFile('Archives/Ignored.zip');
        const excludedMatching = createTestTFile(`Hidden/${matching.name}`);

        const mode = resolveTypeListMode(ItemType.TYPE, typeId);
        const files = collectFileBackedTypeFiles(app, [matching, other], typeId);

        expect(mode).toEqual({
            isTypeSelection: true,
            isFileBackedTypeSelection: true,
            isLineBackedTypeSelection: false,
            isProviderOwnedTypeSelection: false
        });
        expect(files).toEqual([matching]);
        expect(files).not.toContain(excludedMatching);
    });

    it('keeps uppercase supported extensions visible before applying file-backed Type buckets', () => {
        const app = new App();
        Reflect.set(app, 'viewRegistry', {
            typeByExtension: {
                EXCALIDRAW: 'excalidraw',
                PNG: 'image',
                MP3: 'audio',
                MP4: 'video'
            }
        });
        const files = [
            createTestTFile('Notes/Overview.MD'),
            createTestTFile('Data/Projects.BASE'),
            createTestTFile('Boards/Roadmap.CANVAS'),
            createTestTFile('Drawings/Flow.EXCALIDRAW'),
            createTestTFile('Documents/Guide.PDF'),
            createTestTFile('Images/Diagram.PNG'),
            createTestTFile('Audio/Interview.MP3'),
            createTestTFile('Video/Demo.MP4')
        ];
        setRootFiles(app, files);

        const visibleFiles = getVisibleVaultFiles(createSupportedVisibilitySettings(), false, app);

        expect(visibleFiles).toEqual(files);
        expect(FILE_TYPE_CASES.map(([typeId]) => collectFileBackedTypeFiles(app, visibleFiles, typeId).map(file => file.path))).toEqual(
            files.map(file => [file.path])
        );
    });

    it('keeps searched and grouped Base results as native file items', () => {
        const app = new App();
        const roadmap = createTestTFile('Data/Roadmap.base');
        const archive = createTestTFile('Data/Archive.base');
        const note = createTestTFile('Notes/Roadmap.md');
        const mode = resolveTypeListMode(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.BASES);
        const baseFiles = collectFileBackedTypeFiles(app, [archive, note, roadmap], TPS_NAVIGATOR_TYPE_IDS.BASES);
        const searchableNames = new Map(baseFiles.map(file => [file.path, buildSearchableNameData(file.basename, {})] as const));
        const filtered = filterListPaneFiles({
            app,
            baseFiles,
            getDB: createDb,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            omnisearchResult: null,
            searchableNames,
            settings: { alphabeticalDateMode: 'modified' },
            sortOption: 'modified-desc',
            trimmedQuery: 'roadmap',
            useOmnisearch: false
        });
        const coreListItems = buildListItems({
            app,
            dayKey: '2026-08-01',
            fileVisibility: FILE_VISIBILITY.ALL,
            files: filtered.files,
            getDB: createDb,
            getFileTimestamps: () => ({ created: Date.UTC(2026, 7, 1), modified: Date.UTC(2026, 7, 1) }),
            hiddenFileState: new Map(),
            hiddenTags: [],
            listConfig: createListConfig(),
            matchedAliases: filtered.matchedAliases,
            matchedProperties: filtered.matchedProperties,
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectedTag: null,
            selectedProperty: null,
            selectionType: ItemType.TYPE,
            showHiddenItems: false,
            sortOption: 'modified-desc'
        });

        const items = composeTypeListItems({ mode, coreListItems, typeRows: [], providerRows: [] });
        const fileItems = items.filter(item => item.type === ListPaneItemType.FILE);

        expect(filtered.files).toEqual([roadmap]);
        expect(items).toBe(coreListItems);
        expect(items.some(item => item.type === ListPaneItemType.HEADER)).toBe(true);
        expect(fileItems).toHaveLength(1);
        expect(fileItems[0].data).toBe(roadmap);
        expect(items.some(item => item.type === ListPaneItemType.PROVIDER_ROW)).toBe(false);
    });

    it('uses the file-action pin context for file-backed Types without leaking tag or property pins', () => {
        const app = new App();
        const folderPinned = createTestTFile('Data/Folder pinned.base');
        const tagPinned = createTestTFile('Data/Tag pinned.base');
        const propertyPinned = createTestTFile('Data/Property pinned.base');
        const files = [folderPinned, tagPinned, propertyPinned];
        const coreListItems = buildListItems({
            app,
            dayKey: '2026-08-01',
            fileVisibility: FILE_VISIBILITY.ALL,
            files,
            getDB: createDb,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            hiddenFileState: new Map(),
            hiddenTags: [],
            listConfig: {
                ...createListConfig(),
                groupBy: 'custom',
                pinnedNotes: {
                    [folderPinned.path]: { folder: true, tag: false, property: false },
                    [tagPinned.path]: { folder: false, tag: true, property: false },
                    [propertyPinned.path]: { folder: false, tag: false, property: true }
                }
            },
            searchMetaMap: new Map(),
            selectedFolder: null,
            selectedTag: null,
            selectedProperty: null,
            selectionType: ItemType.TYPE,
            showHiddenItems: false,
            sortOption: 'modified-desc'
        });

        const fileItems = coreListItems.flatMap(item => {
            if (item.type !== ListPaneItemType.FILE || !(item.data instanceof TFile)) {
                return [];
            }
            return [{ path: item.data.path, isPinned: item.isPinned === true }];
        });

        expect(getNavigatorPinContext(ItemType.TYPE)).toBe(ItemType.FOLDER);
        expect(coreListItems.find(item => item.key === PINNED_SECTION_HEADER_KEY)?.groupFilePaths).toEqual([folderPinned.path]);
        expect(fileItems).toEqual([
            { path: folderPinned.path, isPinned: true },
            { path: tagPinned.path, isPinned: false },
            { path: propertyPinned.path, isPinned: false }
        ]);
    });

    it.each(LINE_TYPE_IDS)('keeps source-backed %s results as standalone provider rows', typeId => {
        const app = new App();
        const nativeFile = createTestTFile('Tasks/Today.md');
        const coreListItems: ListPaneItem[] = [
            { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top-spacer' },
            { type: ListPaneItemType.FILE, data: nativeFile, key: nativeFile.path, fileIndex: 0 },
            { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom-spacer' }
        ];
        const exactLineRow: NavigatorProvidedRow = {
            providerId: 'tps/entity-types',
            id: `${typeId}:Tasks/Today.md:4`,
            kind: `tps/entity-type/${typeId}`,
            label: 'Exact line',
            sourcePath: nativeFile.path,
            sourceLineNumber: 3
        };
        const mode = resolveTypeListMode(ItemType.TYPE, typeId);

        const items = composeTypeListItems({ mode, coreListItems, typeRows: [exactLineRow], providerRows: [] });

        expect(mode).toEqual({
            isTypeSelection: true,
            isFileBackedTypeSelection: false,
            isLineBackedTypeSelection: true,
            isProviderOwnedTypeSelection: false
        });
        expect(collectFileBackedTypeFiles(app, [nativeFile], typeId)).toEqual([]);
        expect(items.map(item => item.type)).toEqual([
            ListPaneItemType.TOP_SPACER,
            ListPaneItemType.PROVIDER_ROW,
            ListPaneItemType.BOTTOM_SPACER
        ]);
        expect(items[1].data).toBe(exactLineRow);
        expect(items.some(item => item.type === ListPaneItemType.FILE)).toBe(false);
    });

    it.each([TPS_NAVIGATOR_TYPE_IDS.NOTES, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES] as const)(
        'composes native files and all seven structural sections during global search from %s',
        selectedType => {
            const nativeFile = createTestTFile('Notes/Shopping.md');
            const coreListItems: ListPaneItem[] = [
                { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top-spacer' },
                { type: ListPaneItemType.FILE, data: nativeFile, key: nativeFile.path, fileIndex: 0 },
                { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom-spacer' }
            ];
            const groups = LINE_TYPE_IDS.map((typeId, index) => ({
                typeId,
                label: `Type ${index + 1}`,
                rows: [
                    {
                        providerId: 'tps/entity-types',
                        id: `${typeId}:${index}`,
                        kind: `tps/entity-type/${typeId}`,
                        label: `Match ${index + 1}`,
                        sourcePath: nativeFile.path,
                        sourceLineNumber: index
                    }
                ] satisfies NavigatorProvidedRow[]
            }));

            const items = composeTypeListItems({
                mode: resolveTypeListMode(ItemType.TYPE, selectedType),
                coreListItems,
                typeRows: [],
                providerRows: [],
                searchTypeGroups: groups,
                globalTypeSearch: true
            });

            expect(items.filter(item => item.type === ListPaneItemType.FILE).map(item => item.data)).toEqual([nativeFile]);
            expect(items.filter(item => item.type === ListPaneItemType.HEADER).map(item => item.data)).toEqual(
                groups.map(group => group.label)
            );
            expect(items.filter(item => item.type === ListPaneItemType.PROVIDER_ROW).map(item => item.providerTypeId)).toEqual(
                LINE_TYPE_IDS
            );
        }
    );

    it('preserves source-row sorting and Note-vs-Line property groups during a global Type search', () => {
        const mode = resolveTypeListMode(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES);
        const later: NavigatorProvidedRow = {
            providerId: 'tps/entity-types',
            id: 'later',
            kind: 'tps/entity-type/task',
            label: 'Later',
            sourcePath: 'Tasks/Today.md',
            sourceLineNumber: 8,
            properties: { scheduled: '2026-08-04 09:00:00' }
        };
        const earlier: NavigatorProvidedRow = {
            ...later,
            id: 'earlier',
            label: 'Earlier',
            sourceLineNumber: 2,
            properties: { scheduled: '2026-08-03 18:00:00' }
        };
        const coreListItems: ListPaneItem[] = [
            { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top-spacer' },
            { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom-spacer' }
        ];
        const presentedItems: ListPaneItem[] = [
            { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top-spacer' },
            {
                type: ListPaneItemType.HEADER,
                data: '2026-08-03',
                key: 'standalone-type-header:line-property-day:2026-08-03',
                headerKind: 'property'
            },
            {
                type: ListPaneItemType.PROVIDER_ROW,
                data: earlier,
                key: `provider:${earlier.providerId}:${earlier.id}`,
                providerTypeId: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES
            },
            {
                type: ListPaneItemType.HEADER,
                data: '2026-08-04',
                key: 'standalone-type-header:line-property-day:2026-08-04',
                headerKind: 'property'
            },
            {
                type: ListPaneItemType.PROVIDER_ROW,
                data: later,
                key: `provider:${later.providerId}:${later.id}`,
                providerTypeId: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES
            },
            { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom-spacer' }
        ];

        const items = composeTypeListItems({
            mode,
            coreListItems,
            typeRows: [later, earlier],
            providerRows: [],
            globalTypeSearch: true,
            searchTypeGroups: [
                {
                    typeId: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
                    label: 'Checkboxes',
                    rows: [later, earlier],
                    presentedItems
                }
            ]
        });

        expect(items.filter(item => item.type === ListPaneItemType.HEADER).map(item => item.data)).toEqual([
            'Checkboxes',
            '2026-08-03',
            '2026-08-04'
        ]);
        expect(
            items.filter(item => item.type === ListPaneItemType.PROVIDER_ROW).map(item => (item.data as NavigatorProvidedRow).id)
        ).toEqual(['earlier', 'later']);
        expect(items.filter(item => item.type === ListPaneItemType.PROVIDER_ROW).map(item => item.providerTypeId)).toEqual([
            TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES
        ]);
        expect(items.map(item => item.key)).toEqual(expect.arrayContaining([expect.stringContaining('search-type:structural:task:')]));
    });

    it('keeps external Type collections in standalone provider mode', () => {
        const providerTypeId = createTpsNavigatorProviderTypeId('example/entities', 'contexts')!;

        expect(resolveTypeListMode(ItemType.TYPE, providerTypeId)).toEqual({
            isTypeSelection: true,
            isFileBackedTypeSelection: false,
            isLineBackedTypeSelection: false,
            isProviderOwnedTypeSelection: true
        });
        expect(resolveTypeListMode(ItemType.FOLDER, TPS_NAVIGATOR_TYPE_IDS.NOTES)).toEqual({
            isTypeSelection: false,
            isFileBackedTypeSelection: false,
            isLineBackedTypeSelection: false,
            isProviderOwnedTypeSelection: false
        });
    });
});
