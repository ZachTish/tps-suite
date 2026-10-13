import { useEditingStableList } from './useEditingStableList';
/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * useListPaneData - Manages file list data for the ListPane component
 *
 * This hook handles:
 * - File collection from folders and tags
 * - Sorting and grouping files by date
 * - Separating pinned and unpinned files
 * - Building list items with headers and spacers
 * - Listening to vault changes and updating the file list
 * - Creating efficient lookup maps for file access
 */

import { useCallback, useMemo, useState } from 'react';
import { TFile, TFolder } from 'obsidian';
import { strings } from '../i18n';
import { useServices } from '../context/ServicesContext';
import { useFileCache } from '../context/StorageContext';
import { useLocalDayKey } from './useLocalDayKey';
import { DateUtils } from '../utils/dateUtils';
import { nestPropertyListItems } from '../utils/nestedPropertyGroups';
import { ItemType, ListPaneItemType } from '../types';
import type { VisibilityPreferences } from '../types';
import type { ListPaneItem } from '../types/virtualization';
import { createFrontmatterPropertyExclusionMatcher } from '../utils/fileFilters';
import {
    parseFilterSearchTokens,
    filterSearchHasActiveCriteria,
    filterSearchNeedsPropertyLookup,
    filterSearchNeedsTagLookup
} from '../utils/filterSearch';
import {
    getPropertyGroupingGranularity,
    getPropertyGroupingKey,
    type ListNoteGroupingOption,
    type NotebookNavigatorSettings
} from '../settings/types';
import type { FilterSearchTokens } from '../utils/filterSearch';
import type { SearchResultMeta } from '../types/search';
import type { ActiveProfileState } from '../context/SettingsContext';
import type { SearchProvider } from '../types/search';
import type { PropertySelectionNodeId } from '../utils/propertyTree';
import type { TpsNavigatorTypeId } from '../types/navigatorTypes';
import { getFilesForNavigationSelection, getVisibleFileTypeFiles } from '../utils/selectionUtils';
import { sortNavigationFiles } from '../utils/fileFinder';
import {
    getListSortOverrideForSelection,
    isManualSortPropertyKey,
    isPropertySortOption,
    resolveListSort,
    resolveSourceBackedTypeListSort
} from '../utils/sortUtils';
import { resolvePropertyGroupingDirection } from '../utils/listGrouping';
import { buildListGroupCollapseKey } from '../utils/listGroupCollapse';
import { applyManualSortMarkdownOrder, getManualSortGroupHeaderPropertyKey } from '../utils/manualSort';
import { getPropertyFieldsFromPropertyKeys } from '../utils/vaultProfiles';
import {
    buildHiddenFileState,
    filterListPaneFiles,
    resolveAppliedListSearchState,
    useOmnisearchListResult,
    useSearchableNames
} from './listPaneData/searchPipeline';
import {
    buildFileIndexMap,
    buildFilePathToIndexMap,
    buildListGroupItemCountData,
    buildListItems,
    buildOrderedFiles,
    type ListPaneConfig
} from './listPaneData/listItems';
import { useListPaneRefresh } from './listPaneData/useListPaneRefresh';
import { useProviderRows } from './useProviderRows';
import { navigatorRowProviderRegistry } from '../services/rows/defaultRegistry';
import type { NavigatorRowProviderSelection, NavigatorRowScope } from '../services/rows/types';
import { filterTpsNavigatorTypesSnapshot, isTpsNavigatorGcmLineTypeId, isTpsNavigatorStructuralTypeId } from '../types/navigatorTypes';
import { showNotice } from '../utils/noticeUtils';
import { buildTypeProviderRows } from '../services/rows/typeProviderRows';
import {
    collectListProviderScopeVisibleFilePaths,
    collectTypeScopeVisibleFilePaths,
    resolveNavigatorRowScope
} from '../services/rows/providerScope';
import { useNavigatorTypes } from './useNavigatorTypes';
import { useNavigatorTypeRows } from './useNavigatorTypeRows';
import {
    collectFileBackedTypeFiles,
    composeTypeListItems,
    getSelectedTypeSearchSourceScope,
    resolveMixedStructuralTypeCollections,
    resolveTypeListMode
} from './listPaneData/typeListItems';
import {
    buildStandaloneStructuralTypePresentation,
    getEffectiveStandaloneStructuralTypeGrouping
} from './listPaneData/standaloneTypePresentation';
import { isTpsNavigatorLineTypeId } from '../types/navigatorTypes';
import {
    fileMatchesStructuralTypeSearch,
    getStructuralLineTypeSourceSearchTokens,
    getStructuralTypeSourceSearchTokens,
    isMixedStructuralSearchActive,
    shouldUseGlobalTypeSearch
} from './listPaneData/structuralTypeSearch';
import { createHiddenTagVisibility, normalizeTagPathValue } from '../utils/tagPrefixMatcher';

const EMPTY_SEARCH_META = new Map<string, SearchResultMeta>();
const EMPTY_HIDDEN_FILE_STATE = new Map<string, boolean>();
const EMPTY_CUSTOM_GROUP_HEADER_FILE_PATHS: ReadonlySet<string> = new Set();
const NO_ROW_PROVIDERS: NavigatorRowProviderSelection = Object.freeze({ enabledProviderIds: Object.freeze([]) });

/**
 * Parameters for the useListPaneData hook
 */
interface UseListPaneDataParams {
    /** The type of selection (folder, tag, or property) */
    selectionType: ItemType | null;
    /** The currently selected folder, if any */
    selectedFolder: TFolder | null;
    /** The currently selected tag, if any */
    selectedTag: string | null;
    /** The currently selected property key/value, if any */
    selectedProperty: PropertySelectionNodeId | null;
    /** The currently selected TPS type collection, if any. */
    selectedType: TpsNavigatorTypeId | null;
    /** Plugin settings */
    settings: NotebookNavigatorSettings;
    /** Active profile-derived values */
    activeProfile: ActiveProfileState;
    /** Effective grouping for the current list selection */
    groupBy: ListNoteGroupingOption;
    multiValueGrouping: import('./useListPaneAppearance').MultiValueGrouping;
    noValueGroupPosition: import('./useListPaneAppearance').NoValueGroupPosition;
    /** Effective tag visibility for the current list selection */
    showFileTags: boolean;
    /** Effective date visibility for the current list selection */
    showFileDate: boolean;
    /** Whether the pinned section is expanded in the current context */
    pinnedGroupExpanded: boolean;
    /** Collapsed list group keys for the current vault */
    collapsedListGroups: ReadonlySet<string>;
    /** Active search provider to use for filtering */
    searchProvider: SearchProvider;
    /** Optional search query to filter files */
    searchQuery?: string;
    /** Pre-parsed search tokens matching the debounced query */
    searchTokens?: FilterSearchTokens;
    /** Visibility preferences that control descendant notes and hidden items */
    visibility: VisibilityPreferences;
    /** Optional markdown path order applied before list items are built */
    propertySortOrderOverride?: readonly string[] | null;
    /** Optional provider-backed rows. Omit to keep the upstream file-only list. */
    rowProviderSelection?: NavigatorRowProviderSelection;
}

/**
 * Return value of the useListPaneData hook
 */
interface UseListPaneDataResult {
    /** List items including headers, files, and spacers for rendering */
    listItems: ListPaneItem[];
    /** Ordered array of files (without headers) for multi-selection */
    orderedFiles: TFile[];
    /** Map from file path to index within orderedFiles array */
    orderedFileIndexMap: Map<string, number>;
    /** Map from file path to list item index for O(1) lookups */
    filePathToIndex: Map<string, number>;
    /** Map from file path to position in files array for multi-selection */
    fileIndexMap: Map<string, number>;
    /** Raw array of files before grouping */
    files: TFile[];
    /** Hidden-state lookup for files shown through the hidden-items override */
    hiddenFileState: ReadonlyMap<string, boolean>;
    /** Search metadata keyed by file path (populated when using Omnisearch) */
    searchMeta: Map<string, SearchResultMeta>;
    /** Query that actually produced the current rendered rows. */
    appliedSearchQuery: string;
    /** Provider that actually produced the current rendered rows. */
    effectiveSearchProvider: SearchProvider;
    /** Local day key in YYYY-MM-DD format */
    localDayKey: string;
    /** Whether internal Filter Search is currently mixing structural rows into this result scope. */
    mixedStructuralSearchActive: boolean;
    /** Structured invalid-query state for visible fail-closed feedback. */
    invalidSearchReason: FilterSearchTokens['invalidReason'];
}

/**
 * Hook that manages file list data for the ListPane component.
 * Handles file collection, sorting, grouping, and vault change monitoring.
 *
 * @param params - Configuration parameters
 * @returns File list data and lookup maps
 */
export function useListPaneData({
    selectionType,
    selectedFolder,
    selectedTag,
    selectedProperty,
    selectedType,
    settings,
    activeProfile,
    groupBy,
    multiValueGrouping,
    noValueGroupPosition,
    showFileTags,
    showFileDate,
    pinnedGroupExpanded,
    collapsedListGroups,
    searchProvider,
    searchQuery,
    searchTokens,
    visibility,
    propertySortOrderOverride,
    rowProviderSelection = NO_ROW_PROVIDERS
}: UseListPaneDataParams): UseListPaneDataResult {
    const { app, plugin, tagTreeService, propertyTreeService, commandQueue, omnisearchService } = useServices();
    const { getFileTimestamps, getDB, getFileDisplayName, gcmPresentationRevision } = useFileCache();
    const { includeDescendantNotes, showHiddenItems } = visibility;
    const dayKey = useLocalDayKey();

    const [updateKey, setUpdateKey] = useState(0);
    const typeListMode = useMemo(() => resolveTypeListMode(selectionType, selectedType), [selectedType, selectionType]);
    const { isTypeSelection, isFileBackedTypeSelection, isLineBackedTypeSelection, isProviderOwnedTypeSelection } = typeListMode;
    const trimmedQuery = searchQuery?.trim() ?? '';
    const hasSearchQuery = trimmedQuery.length > 0;
    const isVaultRootAggregate = false;
    const rawTypeSnapshot = useNavigatorTypes(plugin.api);
    const selectedRawTypeSnapshot = rawTypeSnapshot;
    // File types never register or activate sub-file collections.
    const activateTypeRecord = useCallback(async () => ({ ok: false, reason: 'invalid-record' }) as const, []);
    const setTypeTaskCheckbox = useCallback(async () => ({ ok: false, reason: 'invalid-record' }) as const, []);
    const addTypeTaskContextMenuItems = useCallback(() => false, []);
    const visibleTypeFiles = useMemo(() => {
        void updateKey;
        if (!settings.tpsFileTypesNavigationEnabled || (!isTypeSelection && !hasSearchQuery && !isVaultRootAggregate)) {
            return [];
        }
        return getVisibleFileTypeFiles(settings, showHiddenItems, app);
    }, [app, hasSearchQuery, isTypeSelection, isVaultRootAggregate, settings, showHiddenItems, updateKey]);
    const visibleTypeSourcePaths = useMemo(() => new Set(visibleTypeFiles.map(file => file.path)), [visibleTypeFiles]);
    const typeSnapshot = useMemo(
        () => filterTpsNavigatorTypesSnapshot(selectedRawTypeSnapshot, visibleTypeSourcePaths),
        [selectedRawTypeSnapshot, visibleTypeSourcePaths]
    );

    const allowedTypeSourcePaths = useMemo(() => Object.freeze([...visibleTypeSourcePaths]), [visibleTypeSourcePaths]);
    const providerOwnedTypeRowsResult = useNavigatorTypeRows({
        api: plugin.api,
        selectedType: settings.tpsFileTypesNavigationEnabled && isTypeSelection ? selectedType : null,
        searchQuery: trimmedQuery,
        allowedVaultFilePaths: allowedTypeSourcePaths,
        catalogRevision: typeSnapshot.revision
    });
    const providerOwnedTypeRows = useMemo(() => {
        if (providerOwnedTypeRowsResult.status === 'loading') {
            return [
                {
                    providerId: 'tps/type-provider-status',
                    id: `loading:${selectedType ?? 'unknown'}`,
                    kind: 'tps/type-provider-status',
                    label: 'Loading items…',
                    sourcePath: 'Types'
                }
            ];
        }
        if (providerOwnedTypeRowsResult.status === 'error') {
            return [
                {
                    providerId: 'tps/type-provider-status',
                    id: `error:${selectedType ?? 'unknown'}`,
                    kind: 'tps/type-provider-status',
                    label: 'Could not load items from this Type provider.',
                    sourcePath: 'Types'
                }
            ];
        }
        return providerOwnedTypeRowsResult.rows;
    }, [providerOwnedTypeRowsResult, selectedType]);
    const parsedSearchTokens = useMemo(
        () =>
            hasSearchQuery
                ? parseFilterSearchTokens(trimmedQuery, {
                      typesNavigationEnabled: settings.tpsFileTypesNavigationEnabled,
                      referenceDate: DateUtils.parseLocalDayKey(dayKey) ?? undefined
                  })
                : null,
        [dayKey, hasSearchQuery, settings.tpsFileTypesNavigationEnabled, trimmedQuery]
    );
    const hasTypeSearchFacets =
        parsedSearchTokens !== null && (parsedSearchTokens.typeTokens.length > 0 || parsedSearchTokens.excludeTypeTokens.length > 0);
    const isOmnisearchAvailable = omnisearchService?.isAvailable() ?? false;
    const useOmnisearch =
        !isTypeSelection && !hasTypeSearchFacets && searchProvider === 'omnisearch' && isOmnisearchAvailable && hasSearchQuery;
    const useGlobalTypeSearch = shouldUseGlobalTypeSearch({
        enabled: settings.tpsFileTypesNavigationEnabled,
        isTypeSelection,
        selectedType,
        hasSearchQuery,
        useOmnisearch,
        hasExplicitTypeFacets: hasTypeSearchFacets
    });
    const mixedStructuralSearchActive = isMixedStructuralSearchActive({
        enabled: settings.tpsFileTypesNavigationEnabled,
        isTypeSelection,
        useGlobalTypeSearch,
        useOmnisearch,
        hasSearchQuery,
        hasParsedSearchTokens: parsedSearchTokens !== null
    });
    const activeFilterSearchTokens = useMemo(() => {
        if (!parsedSearchTokens || useOmnisearch) {
            return null;
        }

        if (!filterSearchHasActiveCriteria(parsedSearchTokens)) {
            return null;
        }

        return parsedSearchTokens;
    }, [parsedSearchTokens, useOmnisearch]);
    const hasTaskSearchFilters =
        activeFilterSearchTokens !== null &&
        (activeFilterSearchTokens.requireUnfinishedTasks || activeFilterSearchTokens.excludeUnfinishedTasks);
    const hasPropertySearchFilters = activeFilterSearchTokens !== null && filterSearchNeedsPropertyLookup(activeFilterSearchTokens);
    const hasTagSearchFilters = activeFilterSearchTokens !== null && filterSearchNeedsTagLookup(activeFilterSearchTokens);
    const hasDateSearchFilters =
        activeFilterSearchTokens !== null &&
        (activeFilterSearchTokens.dateRanges.length > 0 || activeFilterSearchTokens.excludeDateRanges.length > 0);
    // Folder path passed to Omnisearch as a path:"..." filter. The filter matches the
    // whole subtree, so with descendant notes hidden, subfolder matches still occupy
    // Omnisearch's ranked top-50 slots before the list is filtered to direct children.
    // The scope is applied anyway because the subtree pool is a subset of the vault-wide
    // pool, so scoping never ranks out a direct child that an unscoped search would keep.
    const omnisearchPathScope = useMemo(() => {
        if (selectionType !== ItemType.FOLDER || !selectedFolder) {
            return undefined;
        }
        if (selectedFolder.path === '/') {
            return undefined;
        }
        return selectedFolder.path;
    }, [selectionType, selectedFolder]);
    const { hiddenFolders, descendantExcludedFolders, hiddenFileProperties, hiddenFileNames, hiddenTags, hiddenFileTags, fileVisibility } =
        activeProfile;
    const hiddenFilePropertyMatcher = useMemo(
        () => createFrontmatterPropertyExclusionMatcher(hiddenFileProperties),
        [hiddenFileProperties]
    );
    const selectedFolderPath = selectionType === ItemType.FOLDER ? (selectedFolder?.path ?? null) : null;
    const selectedSortOverride = getListSortOverrideForSelection(
        settings,
        selectionType,
        selectedFolder,
        selectedTag,
        selectedProperty,
        selectedType
    );
    const selectedFolderGroupSortOrder = settings.folderTreeSortOverrides?.[selectedFolderPath ?? '/'] ?? settings.folderSortOrder;
    const listConfig = useMemo<ListPaneConfig>(
        () => ({
            pinnedNotes: settings.pinnedNotes,
            filterPinnedByFolder: settings.filterPinnedByFolder,
            pinnedGroupExpanded,
            showFileTags,
            showFolderGroupPaths: settings.showFolderGroupPaths,
            showCurrentFolderFilesAtBottom: settings.showCurrentFolderFilesAtBottom,
            groupBy,
            multiValueGrouping,
            noValueGroupPosition,
            folderGroupSortOrder: selectedFolderGroupSortOrder
        }),
        [
            settings.filterPinnedByFolder,
            selectedFolderGroupSortOrder,
            groupBy,
            multiValueGrouping,
            noValueGroupPosition,
            pinnedGroupExpanded,
            settings.pinnedNotes,
            settings.showCurrentFolderFilesAtBottom,
            settings.showFolderGroupPaths,
            showFileTags
        ]
    );

    const sortSpec = useMemo(
        () =>
            isLineBackedTypeSelection
                ? resolveSourceBackedTypeListSort(settings, selectedSortOverride)
                : resolveListSort(settings, selectedSortOverride),
        [isLineBackedTypeSelection, settings, selectedSortOverride]
    );
    const sortOption = sortSpec.option;
    // Generated presentation only participates in non-manual property ordering
    // and grouping. Icon/color preparation must not rescan the selection, rebuild
    // text-search names, or invalidate every virtual row's measurement.
    const propertySortPresentationRevision =
        isPropertySortOption(sortOption) && sortSpec.propertyKey.trim() && !isManualSortPropertyKey(settings, sortSpec.propertyKey)
            ? gcmPresentationRevision
            : 0;
    const propertyGroupingKey = getPropertyGroupingKey(groupBy);
    const propertyGroupPresentationRevision =
        propertyGroupingKey !== null && !isManualSortPropertyKey(settings, propertyGroupingKey) ? gcmPresentationRevision : 0;
    const activePropertyFields = useMemo(() => getPropertyFieldsFromPropertyKeys(activeProfile.propertyKeys), [activeProfile.propertyKeys]);

    const selectionBaseFiles = useMemo(() => {
        void propertySortPresentationRevision;
        if (isTypeSelection) {
            return visibleTypeFiles;
        }
        return getFilesForNavigationSelection(
            {
                selectionType,
                selectedFolder,
                selectedTag,
                selectedProperty
            },
            settings,
            visibility,
            app,
            tagTreeService,
            propertyTreeService
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps -- updateKey refreshes storage data while getFilesForNavigationSelection is static.
    }, [
        selectionType,
        isTypeSelection,
        visibleTypeFiles,
        selectedFolder,
        selectedTag,
        selectedProperty,
        activeProfile.profile.id,
        activeProfile.hiddenFolders,
        descendantExcludedFolders,
        activeProfile.hiddenFileProperties,
        activeProfile.hiddenFileNames,
        activeProfile.hiddenTags,
        activeProfile.hiddenFileTags,
        activeProfile.fileVisibility,
        settings.enableFolderNotes,
        settings.hideFolderNoteInList,
        settings.hideDrawingPreviewImages,
        settings.folderNoteNamePattern,
        settings.useFrontmatterMetadata,
        settings.frontmatterNameField,
        settings.frontmatterCreatedField,
        settings.frontmatterModifiedField,
        settings.frontmatterDateFormat,
        settings.filterPinnedByFolder,
        settings.pinnedNotes,
        settings.defaultFolderSort,
        settings.defaultFolderSortPropertyKey,
        settings.propertySortKey,
        settings.manualSortPropertyKey,
        settings.propertySortSecondary,
        activePropertyFields,
        settings.showProperties,
        selectedSortOverride,
        sortSpec,
        // The callback identity changes when GCM's optional native-record API is replaced.
        // Re-run the file finder so title sorting follows the same live names as visible rows.
        getFileDisplayName,
        propertySortPresentationRevision,
        propertyTreeService,
        includeDescendantNotes,
        showHiddenItems,
        app,
        tagTreeService,
        updateKey
    ]);

    const baseFiles = useMemo(() => {
        void propertySortPresentationRevision;
        if (isFileBackedTypeSelection && selectedType && !useGlobalTypeSearch) {
            const files = collectFileBackedTypeFiles(app, visibleTypeFiles, selectedType);
            sortNavigationFiles(files, settings, app, sortSpec, getFileDisplayName);
            return files;
        }
        if (isTypeSelection && !useGlobalTypeSearch) {
            return [];
        }
        if (!parsedSearchTokens || !hasSearchQuery) {
            return selectionBaseFiles;
        }
        return selectionBaseFiles.filter(file => fileMatchesStructuralTypeSearch(app, file, parsedSearchTokens));
    }, [
        app,
        getFileDisplayName,
        propertySortPresentationRevision,
        hasSearchQuery,
        isFileBackedTypeSelection,
        isTypeSelection,
        parsedSearchTokens,
        selectedType,
        selectionBaseFiles,
        settings,
        sortSpec,
        useGlobalTypeSearch,
        visibleTypeFiles
    ]);

    const basePathSet = useMemo(() => new Set(baseFiles.map(file => file.path)), [baseFiles]);
    const omnisearchResult = useOmnisearchListResult({
        basePathSet,
        omnisearchPathScope,
        omnisearchService,
        trimmedQuery,
        useOmnisearch
    });
    const appliedSearchState = resolveAppliedListSearchState({
        trimmedQuery,
        useOmnisearch,
        omnisearchResult
    });
    const searchableNames = useSearchableNames({ app, baseFiles, getFileDisplayName, searchTokens: parsedSearchTokens, useOmnisearch });
    const filterSettings = useMemo(() => ({ alphabeticalDateMode: settings.alphabeticalDateMode }), [settings.alphabeticalDateMode]);

    const structuralSourceSearchTokens = useMemo(
        () => (parsedSearchTokens ? getStructuralTypeSourceSearchTokens(parsedSearchTokens) : null),
        [parsedSearchTokens]
    );
    const structuralSourceFilterResult = useMemo(() => {
        const structuralBaseFiles = isTypeSelection ? visibleTypeFiles : selectionBaseFiles;
        if (!hasSearchQuery || !structuralSourceSearchTokens || !filterSearchHasActiveCriteria(structuralSourceSearchTokens)) {
            return structuralBaseFiles;
        }
        return filterListPaneFiles({
            app,
            baseFiles: structuralBaseFiles,
            getDB,
            getFileTimestamps,
            omnisearchResult: null,
            searchTokens: structuralSourceSearchTokens,
            searchableNames: new Map(),
            settings: filterSettings,
            sortOption,
            trimmedQuery,
            useOmnisearch: false
        }).files;
    }, [
        app,
        filterSettings,
        getDB,
        getFileTimestamps,
        hasSearchQuery,
        isTypeSelection,
        selectionBaseFiles,
        sortOption,
        structuralSourceSearchTokens,
        trimmedQuery,
        visibleTypeFiles
    ]);
    const structuralSourcePathSet = useMemo(
        () => new Set(structuralSourceFilterResult.map(file => file.path)),
        [structuralSourceFilterResult]
    );
    const structuralLineSourceSearchTokens = useMemo(
        () => (parsedSearchTokens ? getStructuralLineTypeSourceSearchTokens(parsedSearchTokens) : null),
        [parsedSearchTokens]
    );
    const structuralLineSourceFilterResult = useMemo(() => {
        const structuralBaseFiles = isTypeSelection ? visibleTypeFiles : selectionBaseFiles;
        if (!hasSearchQuery || !structuralLineSourceSearchTokens || !filterSearchHasActiveCriteria(structuralLineSourceSearchTokens)) {
            return structuralBaseFiles;
        }
        return filterListPaneFiles({
            app,
            baseFiles: structuralBaseFiles,
            getDB,
            getFileTimestamps,
            omnisearchResult: null,
            searchTokens: structuralLineSourceSearchTokens,
            searchableNames: new Map(),
            settings: filterSettings,
            sortOption,
            trimmedQuery,
            useOmnisearch: false
        }).files;
    }, [
        app,
        filterSettings,
        getDB,
        getFileTimestamps,
        hasSearchQuery,
        isTypeSelection,
        selectionBaseFiles,
        sortOption,
        structuralLineSourceSearchTokens,
        trimmedQuery,
        visibleTypeFiles
    ]);
    const structuralLineSourcePathSet = useMemo(
        () => new Set(structuralLineSourceFilterResult.map(file => file.path)),
        [structuralLineSourceFilterResult]
    );

    const filterResult = useMemo(() => {
        return filterListPaneFiles({
            app,
            baseFiles,
            getDB,
            getFileTimestamps,
            omnisearchResult,
            searchTokens: parsedSearchTokens ?? undefined,
            searchableNames,
            settings: filterSettings,
            sortOption,
            trimmedQuery,
            useOmnisearch
        });
    }, [
        app,
        baseFiles,
        getDB,
        getFileTimestamps,
        filterSettings,
        omnisearchResult,
        parsedSearchTokens,
        searchableNames,
        sortOption,
        trimmedQuery,
        useOmnisearch
    ]);
    const filteredFiles = filterResult.files;

    const files = useMemo(() => {
        if (!propertySortOrderOverride || propertySortOrderOverride.length === 0) {
            return filteredFiles;
        }

        return applyManualSortMarkdownOrder(filteredFiles, propertySortOrderOverride);
    }, [filteredFiles, propertySortOrderOverride]);
    // Group totals depend on whether search is empty, not on its text, so typing another character
    // reuses the same unfiltered ordering instead of rebuilding it for every debounced query.
    const groupCountFiles = useMemo(() => {
        if (!hasSearchQuery || !settings.showGroupHeaderItemCounts) {
            return null;
        }
        if (!propertySortOrderOverride || propertySortOrderOverride.length === 0) {
            return baseFiles;
        }

        return applyManualSortMarkdownOrder(baseFiles, propertySortOrderOverride);
    }, [baseFiles, hasSearchQuery, propertySortOrderOverride, settings.showGroupHeaderItemCounts]);

    const hiddenFileState = useMemo(() => {
        return buildHiddenFileState({
            app,
            files,
            getDB,
            hiddenFileNames,
            hiddenFilePropertyMatcher,
            hiddenFileTags,
            hiddenFolders,
            hideDrawingPreviewImages: settings.hideDrawingPreviewImages,
            showHiddenItems
        });
    }, [
        files,
        getDB,
        hiddenFolders,
        hiddenFilePropertyMatcher,
        hiddenFileNames,
        hiddenFileTags,
        settings.hideDrawingPreviewImages,
        showHiddenItems,
        app
    ]);

    const searchMetaMap = useMemo(() => {
        if (useOmnisearch && omnisearchResult) {
            return omnisearchResult.meta;
        }
        return EMPTY_SEARCH_META;
    }, [useOmnisearch, omnisearchResult]);
    const isManualSortActive = useMemo(
        () => isManualSortPropertyKey({ manualSortPropertyKey: settings.manualSortPropertyKey }, sortSpec.propertyKey),
        [settings.manualSortPropertyKey, sortSpec.propertyKey]
    );
    const manualSortGroupHeaderPropertyKey = getManualSortGroupHeaderPropertyKey(settings);
    const shouldRefreshOnCustomGroupHeaderMetadataChange = groupBy === 'custom' && manualSortGroupHeaderPropertyKey !== null;
    const groupItemCountData = useMemo(() => {
        void propertyGroupPresentationRevision;
        if (!groupCountFiles) {
            return undefined;
        }

        return buildListGroupItemCountData({
            app,
            dayKey,
            fileVisibility,
            files: groupCountFiles,
            getDB,
            getFileTimestamps,
            hiddenFileState: EMPTY_HIDDEN_FILE_STATE,
            hiddenTags,
            listConfig,
            collapsedListGroups,
            searchMetaMap: EMPTY_SEARCH_META,
            selectedFolder,
            selectedTag,
            selectedProperty,
            selectedType,
            selectionType,
            showHiddenItems,
            sortOption,
            propertySortKey: sortSpec.propertyKey,
            isManualSortActive,
            manualSortPropertyKey: settings.manualSortPropertyKey,
            manualSortGroupHeaderPropertyKey
        });
    }, [
        app,
        collapsedListGroups,
        dayKey,
        fileVisibility,
        getDB,
        getFileTimestamps,
        groupCountFiles,
        propertyGroupPresentationRevision,
        hiddenTags,
        isManualSortActive,
        listConfig,
        manualSortGroupHeaderPropertyKey,
        settings.manualSortPropertyKey,
        selectedFolder,
        selectedProperty,
        selectedType,
        selectedTag,
        selectionType,
        showHiddenItems,
        sortOption,
        sortSpec.propertyKey
    ]);
    // Header owners with no current search match are absent from listItems, so retain the count
    // snapshot owners to invalidate cached boundaries when their metadata changes.
    const cachedCustomGroupHeaderFilePaths = useMemo<ReadonlySet<string>>(() => {
        if (!groupItemCountData) {
            return EMPTY_CUSTOM_GROUP_HEADER_FILE_PATHS;
        }

        const filePaths = new Set<string>();
        groupItemCountData.manualSortGroupHeaderFileByMemberPath.forEach(headerFile => {
            filePaths.add(headerFile.path);
        });
        return filePaths;
    }, [groupItemCountData]);

    const coreListItems = useMemo(() => {
        void propertyGroupPresentationRevision;
        return buildListItems({
            app,
            dayKey,
            fileVisibility,
            files,
            getDB,
            getFileTimestamps,
            hiddenFileState,
            hiddenTags,
            listConfig,
            collapsedListGroups,
            matchedAliases: filterResult.matchedAliases,
            matchedProperties: filterResult.matchedProperties,
            searchMetaMap,
            selectedFolder,
            selectedTag,
            selectedProperty,
            selectedType,
            selectionType,
            showHiddenItems,
            sortOption,
            propertySortKey: sortSpec.propertyKey,
            isManualSortActive,
            manualSortPropertyKey: settings.manualSortPropertyKey,
            manualSortGroupHeaderPropertyKey,
            wordCountTargetProperty: settings.wordCountTargetProperty,
            groupItemCountData
        });
    }, [
        app,
        dayKey,
        fileVisibility,
        files,
        propertyGroupPresentationRevision,
        getDB,
        getFileTimestamps,
        hiddenFileState,
        hiddenTags,
        listConfig,
        collapsedListGroups,
        filterResult.matchedAliases,
        filterResult.matchedProperties,
        selectedFolder,
        selectedTag,
        selectedProperty,
        selectedType,
        selectionType,
        searchMetaMap,
        showHiddenItems,
        sortOption,
        sortSpec.propertyKey,
        isManualSortActive,
        settings.manualSortPropertyKey,
        manualSortGroupHeaderPropertyKey,
        settings.wordCountTargetProperty,
        groupItemCountData
    ]);

    const gcmTypeRows = useMemo(() => {
        if (!isTypeSelection || !selectedType || isProviderOwnedTypeSelection || isFileBackedTypeSelection) {
            return [];
        }
        return buildTypeProviderRows({
            snapshot: typeSnapshot,
            selectedType,
            searchQuery: trimmedQuery,
            searchTokens: parsedSearchTokens ?? undefined,
            // typeSnapshot already carries the authoritative visibility filter used by
            // the navigation count. Reapplying a separately memoized path set here can
            // transiently turn a populated Type into an empty list. Search facets still
            // need their narrower owning-note scope.
            allowedSourcePaths: getSelectedTypeSearchSourceScope(
                hasSearchQuery,
                isTpsNavigatorGcmLineTypeId(selectedType) ? structuralLineSourcePathSet : structuralSourcePathSet
            ),
            getNoteProperties: sourcePath => {
                const file = app.vault.getFileByPath(sourcePath);
                return file ? app.metadataCache.getFileCache(file)?.frontmatter : undefined;
            },
            linePropertyInheritance: isTpsNavigatorStructuralTypeId(selectedType)
                ? settings.typeAppearances?.[selectedType]?.linePropertyInheritance
                : undefined,
            activate: activateTypeRecord,
            setTaskCheckbox: setTypeTaskCheckbox,
            addTaskContextMenuItems: addTypeTaskContextMenuItems,
            onActivationFailure: (record, result) => {
                console.warn('[TPS Notebook Navigator] Type record activation failed', {
                    typeId: selectedType,
                    recordId: record.id,
                    reason: result.reason
                });
                showNotice('Could not open this item at its current location.', { variant: 'warning' });
            }
        });
    }, [
        activateTypeRecord,
        addTypeTaskContextMenuItems,
        app.metadataCache,
        app.vault,
        isProviderOwnedTypeSelection,
        isFileBackedTypeSelection,
        isTypeSelection,
        hasSearchQuery,
        selectedType,
        setTypeTaskCheckbox,
        parsedSearchTokens,
        structuralLineSourcePathSet,
        structuralSourcePathSet,
        settings.typeAppearances,
        trimmedQuery,
        typeSnapshot
    ]);
    const typeRows = isProviderOwnedTypeSelection ? providerOwnedTypeRows : gcmTypeRows;
    const presentedTypeListItems = useMemo(() => {
        if (!isLineBackedTypeSelection || !isTpsNavigatorLineTypeId(selectedType)) {
            return undefined;
        }
        const effectiveStandaloneGroupBy = getEffectiveStandaloneStructuralTypeGrouping(selectedType, groupBy, mixedStructuralSearchActive);
        return buildStandaloneStructuralTypePresentation({
            rows: typeRows,
            selectedType,
            sort: sortSpec,
            groupBy: effectiveStandaloneGroupBy,
            dayKey,
            collapsedListGroups,
            resolveFile: sourcePath => app.vault.getFileByPath(sourcePath),
            getFrontmatter: file => app.metadataCache.getFileCache(file)?.frontmatter ?? null,
            getFileTimestamps,
            noValueLabel: strings.listPane.propertyGroupNoValue,
            linePropertyInheritance: settings.typeAppearances?.[selectedType]?.linePropertyInheritance,
            multiValueGrouping,
            noValueGroupPosition
        });
    }, [
        app.metadataCache,
        app.vault,
        collapsedListGroups,
        dayKey,
        groupBy,
        multiValueGrouping,
        noValueGroupPosition,
        getFileTimestamps,
        isLineBackedTypeSelection,
        mixedStructuralSearchActive,
        selectedType,
        settings.typeAppearances,
        sortSpec,
        typeRows
    ]);
    const providerScope = useMemo<NavigatorRowScope>(() => {
        return resolveNavigatorRowScope(rowProviderSelection, () => {
            let visibleFilePaths: string[];
            if (isTypeSelection && !isFileBackedTypeSelection) {
                visibleFilePaths = collectTypeScopeVisibleFilePaths(typeRows, visibleTypeSourcePaths);
            } else {
                const providerRowsOwnGrouping = groupBy === 'tags' || getPropertyGroupingKey(groupBy) !== null;
                visibleFilePaths = collectListProviderScopeVisibleFilePaths(coreListItems, providerRowsOwnGrouping);
            }

            return {
                visibleFilePaths,
                selectionType,
                selectedFolderPath: selectionType === ItemType.FOLDER ? (selectedFolder?.path ?? null) : null,
                selectedTag: selectionType === ItemType.TAG ? selectedTag : null,
                selectedProperty: selectionType === ItemType.PROPERTY ? selectedProperty : null,
                selectedType: isTypeSelection ? selectedType : null
            };
        });
    }, [
        coreListItems,
        groupBy,
        isFileBackedTypeSelection,
        isTypeSelection,
        selectedFolder,
        selectedProperty,
        selectedTag,
        selectedType,
        selectionType,
        rowProviderSelection,
        typeRows,
        visibleTypeSourcePaths
    ]);
    const providerRows = useProviderRows({
        app,
        registry: navigatorRowProviderRegistry,
        scope: providerScope,
        selection: rowProviderSelection
    });
    const structuralTypeGroups = useMemo(() => {
        if (!mixedStructuralSearchActive && !isVaultRootAggregate) {
            return [];
        }

        const descriptorLabelById = new Map(typeSnapshot.descriptors.map(descriptor => [descriptor.id, descriptor.label] as const));
        const typeIds = resolveMixedStructuralTypeCollections(isVaultRootAggregate, parsedSearchTokens);
        return typeIds.flatMap(typeId => {
            const rows = buildTypeProviderRows({
                snapshot: typeSnapshot,
                selectedType: typeId,
                searchQuery: trimmedQuery,
                searchTokens: parsedSearchTokens ?? undefined,
                allowedSourcePaths: isTpsNavigatorGcmLineTypeId(typeId) ? structuralLineSourcePathSet : structuralSourcePathSet,
                getNoteProperties: sourcePath => {
                    const file = app.vault.getFileByPath(sourcePath);
                    return file ? app.metadataCache.getFileCache(file)?.frontmatter : undefined;
                },
                linePropertyInheritance: settings.typeAppearances?.[typeId]?.linePropertyInheritance,
                includeUnavailableStatus: false,
                activate: activateTypeRecord,
                setTaskCheckbox: setTypeTaskCheckbox,
                addTaskContextMenuItems: addTypeTaskContextMenuItems,
                onActivationFailure: (record, result) => {
                    console.warn('[TPS Notebook Navigator] Type search result activation failed', {
                        typeId,
                        recordId: record.id,
                        reason: result.reason
                    });
                    showNotice('Could not open this item at its current location.', { variant: 'warning' });
                }
            });
            return rows.length === 0
                ? []
                : [
                      {
                          typeId,
                          label: descriptorLabelById.get(typeId) ?? typeId,
                          rows,
                          presentedItems: buildStandaloneStructuralTypePresentation({
                              rows,
                              selectedType: typeId,
                              sort: sortSpec,
                              groupBy,
                              dayKey,
                              collapsedListGroups,
                              resolveFile: sourcePath => app.vault.getFileByPath(sourcePath),
                              getFrontmatter: file => app.metadataCache.getFileCache(file)?.frontmatter ?? null,
                              getFileTimestamps,
                              noValueLabel: strings.listPane.propertyGroupNoValue,
                              linePropertyInheritance: settings.typeAppearances?.[typeId]?.linePropertyInheritance
                          })
                      }
                  ];
        });
    }, [
        app.metadataCache,
        app.vault,
        activateTypeRecord,
        addTypeTaskContextMenuItems,
        collapsedListGroups,
        dayKey,
        getFileTimestamps,
        groupBy,
        isVaultRootAggregate,
        mixedStructuralSearchActive,
        parsedSearchTokens,
        setTypeTaskCheckbox,
        settings.typeAppearances,
        sortSpec,
        structuralLineSourcePathSet,
        structuralSourcePathSet,
        trimmedQuery,
        typeSnapshot
    ]);
    const liveListItems = useMemo(() => {
        if (parsedSearchTokens?.invalidReason) {
            return [];
        }
        const assembled = composeTypeListItems({
            mode: typeListMode,
            coreListItems,
            typeRows,
            providerRows,
            presentedTypeListItems,
            searchTypeGroups: structuralTypeGroups,
            globalTypeSearch: useGlobalTypeSearch,
            providerPropertyGrouping: (() => {
                const propertyKey = getPropertyGroupingKey(groupBy);
                const getCollapseKey = (groupId: string) =>
                    buildListGroupCollapseKey({
                        selectionType,
                        selectedFolderPath: selectedFolder?.path ?? null,
                        selectedTag,
                        selectedProperty,
                        selectedType,
                        groupingMode: groupBy,
                        groupId
                    });
                const sharedGrouping = {
                    noValuePosition: noValueGroupPosition,
                    multiValueGrouping,
                    getCollapseKey,
                    isCollapsed: (collapseKey: string) => collapsedListGroups.has(collapseKey)
                };
                if (groupBy === 'tags') {
                    const tagVisibility = createHiddenTagVisibility(hiddenTags, showHiddenItems);
                    return {
                        ...sharedGrouping,
                        propertyKey: 'tags',
                        noValueLabel: strings.common.untagged,
                        valueGroupIdPrefix: 'tags-value:',
                        noValueGroupId: 'tags-no-value',
                        formatLabel: (label: string) => label.replace(/^#/, ''),
                        isLabelVisible: (label: string) => {
                            const normalized = normalizeTagPathValue(label);
                            return normalized.length > 0 && tagVisibility.isTagVisible(normalized);
                        },
                        getLabelKey: (label: string) => normalizeTagPathValue(label),
                        compareLabelKeys: (left: string, right: string) => left.localeCompare(right),
                        direction: 'asc' as const
                    };
                }
                const propertyGroupingDirection = resolvePropertyGroupingDirection(groupBy, sortSpec.option);
                const propertyGroupingGranularity = getPropertyGroupingGranularity(groupBy) ?? 'value';
                return propertyKey
                    ? {
                          ...sharedGrouping,
                          propertyKey,
                          noValueLabel: strings.listPane.propertyGroupNoValue,
                          valueGroupIdPrefix: `property-${propertyGroupingGranularity}:`,
                          noValueGroupId: 'property-none',
                          granularity: propertyGroupingGranularity,
                          direction: propertyGroupingDirection
                      }
                    : undefined;
            })()
        });
        return getPropertyGroupingGranularity(groupBy) === 'path'
            ? nestPropertyListItems(assembled, collapsedListGroups, resolvePropertyGroupingDirection(groupBy, sortSpec.option))
            : assembled;
    }, [
        collapsedListGroups,
        coreListItems,
        groupBy,
        hiddenTags,
        multiValueGrouping,
        noValueGroupPosition,
        parsedSearchTokens,
        presentedTypeListItems,
        selectedFolder,
        selectedProperty,
        selectedTag,
        selectedType,
        selectionType,
        showHiddenItems,
        sortSpec.option,
        structuralTypeGroups,
        typeListMode,
        typeRows,
        useGlobalTypeSearch,
        providerRows
    ]);

    const editingContext = useMemo(
        () => ({
            selectionType,
            selectedFolder,
            selectedTag,
            selectedProperty,
            selectedType,
            searchQuery,
            settings,
            activeProfile,
            groupBy,
            collapsedListGroups,
            pinnedGroupExpanded,
            showHiddenItems,
            includeDescendantNotes,
            propertySortOrderOverride
        }),
        [
            selectionType,
            selectedFolder,
            selectedTag,
            selectedProperty,
            selectedType,
            searchQuery,
            settings,
            activeProfile,
            groupBy,
            collapsedListGroups,
            pinnedGroupExpanded,
            showHiddenItems,
            includeDescendantNotes,
            propertySortOrderOverride
        ]
    );
    const listItems = useEditingStableList(app, liveListItems, editingContext);

    const filePathToIndex = useMemo(() => {
        return buildFilePathToIndexMap(listItems);
    }, [listItems]);

    const fileIndexMap = useMemo(() => {
        return buildFileIndexMap(files);
    }, [files]);

    const { orderedFiles, orderedFileIndexMap } = useMemo<{
        orderedFiles: TFile[];
        orderedFileIndexMap: Map<string, number>;
    }>(() => {
        return buildOrderedFiles(listItems);
    }, [listItems]);
    const customGroupHeaderState = useMemo(() => {
        const filePaths = new Set<string>();
        let hasWordCountGroupHeaders = false;

        listItems.forEach(item => {
            if (item.type !== ListPaneItemType.HEADER || item.headerKind !== 'manual-sort-custom') {
                return;
            }

            if (item.manualSortHeaderFilePath) {
                filePaths.add(item.manualSortHeaderFilePath);
            }

            if (item.manualSortHeaderShowsWordCount === true) {
                hasWordCountGroupHeaders = true;
            }
        });

        return { filePaths, hasWordCountGroupHeaders };
    }, [listItems]);

    const refreshBasePathSet = useMemo(() => {
        if (isLineBackedTypeSelection || hasSearchQuery) {
            return new Set((isTypeSelection ? visibleTypeFiles : selectionBaseFiles).map(file => file.path));
        }
        return basePathSet;
    }, [basePathSet, hasSearchQuery, isLineBackedTypeSelection, isTypeSelection, selectionBaseFiles, visibleTypeFiles]);

    useListPaneRefresh({
        app,
        basePathSet: refreshBasePathSet,
        cachedCustomGroupHeaderFilePaths,
        commandQueue,
        customGroupHeaderFilePaths: customGroupHeaderState.filePaths,
        dayKey,
        files,
        getDB,
        groupBy,
        hasDateSearchFilters,
        hasManualSortWordCountGroupHeaders: customGroupHeaderState.hasWordCountGroupHeaders,
        hasPropertySearchFilters,
        hasTagSearchFilters,
        hasTaskSearchFilters,
        hiddenFilePropertyMatcher,
        hiddenFileTags,
        includeDescendantNotes,
        isStructuralTypeSelection: selectionType === ItemType.TYPE && isTpsNavigatorStructuralTypeId(selectedType),
        manualSortGroupHeaderPropertyKey,
        onRefresh: () => setUpdateKey(current => current + 1),
        propertyTreeService,
        tagTreeService,
        selectedFolder,
        selectedProperty,
        selectedTag,
        selectionType,
        settings,
        shouldRefreshOnCustomGroupHeaderMetadataChange,
        showFileDate,
        showHiddenItems,
        sortOption,
        propertySortKey: sortSpec.propertyKey,
        propertySortSecondary: sortSpec.propertySortSecondary
    });

    return {
        listItems,
        orderedFiles,
        orderedFileIndexMap,
        filePathToIndex,
        fileIndexMap,
        files,
        hiddenFileState,
        searchMeta: searchMetaMap,
        appliedSearchQuery: appliedSearchState.query,
        effectiveSearchProvider: appliedSearchState.provider,
        localDayKey: dayKey,
        mixedStructuralSearchActive,
        invalidSearchReason: useOmnisearch ? null : (parsedSearchTokens?.invalidReason ?? null)
    };
}
