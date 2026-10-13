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

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type RefObject,
    type SetStateAction
} from 'react';
import type { App } from 'obsidian';
import { useSelectionDispatch, useSelectionState } from '../context/SelectionContext';
import { useServices } from '../context/ServicesContext';
import { useSettingsState } from '../context/SettingsContext';
import { useShortcuts } from '../context/ShortcutsContext';
import { useUIDispatch } from '../context/UIStateContext';
import { useUXPreferenceActions, useUXPreferences } from '../context/UXPreferencesContext';
import { useLocalDayKey } from './useLocalDayKey';
import { strings } from '../i18n';
import type { IPropertyTreeProvider } from '../interfaces/IPropertyTreeProvider';
import type { ITagTreeProvider } from '../interfaces/ITagTreeProvider';
import { InputModal } from '../modals/InputModal';
import { ALL_TAGS_TAG_ID, ItemType, PROPERTIES_ROOT_VIRTUAL_FOLDER_ID, TAGGED_TAG_ID, UNTAGGED_TAG_ID } from '../types';
import { TIMEOUTS } from '../types/obsidian-extended';
import {
    ShortcutStartType,
    isShortcutStartFolder,
    isShortcutStartProperty,
    isShortcutStartTag,
    type SearchShortcut,
    type ShortcutStartTarget
} from '../types/shortcuts';
import { EMPTY_SEARCH_NAV_FILTER_STATE, type SearchNavFilterState, type SearchProvider } from '../types/search';
import { focusElementPreventScroll } from '../utils/domUtils';
import {
    buildSearchNavFilterState,
    parseFilterSearchTokens,
    updateFilterQueryWithDateToken,
    updateFilterQueryWithProperty,
    updateFilterQueryWithTag,
    updateFilterQueryWithType,
    updateFilterQueryWithTypeSelection,
    type InclusionOperator,
    type PropertySearchToken,
    type ParseFilterSearchOptions
} from '../utils/filterSearch';
import { showNotice } from '../utils/noticeUtils';
import { supportsKeyboardInteractions } from '../utils/paneLayout';
import { normalizeOptionalVaultFolderPath } from '../utils/pathUtils';
import { normalizePropertyNodeId, parsePropertyNodeId } from '../utils/propertyTree';
import { resolveFolderShortcutTarget } from '../utils/shortcutPathResolver';
import { normalizeTagPath } from '../utils/tagUtils';
import { getVirtualTagCollection, isVirtualTagCollectionId } from '../utils/virtualTagCollections';
import type { FilterSearchTokens } from '../utils/filterSearch';
import { resolveSelectionIncludeDescendants } from '../utils/descendantVisibility';
import { DateUtils } from '../utils/dateUtils';
import type { NavigateToFolderOptions, RevealPropertyOptions, RevealTagOptions } from './useNavigatorReveal';
import type { EnsureSelectionOptions, EnsureSelectionResult } from './useListPaneSelectionCoordinator';
import type { NavigatorListSearchUpdate } from '../api/types';
import type { TpsNavigatorTypeId } from '../types/navigatorTypes';

interface ExecuteSearchShortcutParams {
    searchShortcut: SearchShortcut;
}

export interface SearchQueryUpdateOptions {
    focusSearch?: boolean;
    propertyMatchMode?: PropertySearchToken['matchMode'];
}

type SearchTruthSelection = Pick<ReturnType<typeof useSelectionState>, 'selectionType' | 'selectedTag' | 'selectedType'> & {
    selectedProperty: string | null;
};

/** Materializes the visible navigation selection before another facet is added. */
export function includeNavigationSelectionInSearchQuery(
    query: string,
    selection: SearchTruthSelection,
    typesNavigationEnabled = true,
    includeDescendants = false,
    propertyTreeProvider?: Pick<IPropertyTreeProvider, 'findNode'> | null
): string {
    const tokens = parseFilterSearchTokens(query, { typesNavigationEnabled });
    if (selection.selectionType === ItemType.TAG && selection.selectedTag) {
        if (selection.selectedTag === ALL_TAGS_TAG_ID) {
            return query.trim();
        }
        if (selection.selectedTag === TAGGED_TAG_ID) {
            return tokens.requireTagged || /(?:^|\s)#(?:\s|$)/u.test(query) ? query.trim() : `${query.trim()} #`.trim();
        }
        if (selection.selectedTag === UNTAGGED_TAG_ID) {
            return tokens.excludeTagged || /(?:^|\s)-#(?:\s|$)/u.test(query) ? query.trim() : `${query.trim()} -#`.trim();
        }
        const normalizedTag = normalizeTagPath(selection.selectedTag);
        if (!normalizedTag) return query.trim();
        return tokens.includedTagTokens.includes(normalizedTag)
            ? query.trim()
            : updateFilterQueryWithTag(query, normalizedTag, 'AND').query;
    }
    if (selection.selectionType === ItemType.PROPERTY && selection.selectedProperty !== PROPERTIES_ROOT_VIRTUAL_FOLDER_ID) {
        const property = selection.selectedProperty ? parsePropertyNodeId(selection.selectedProperty) : null;
        if (!property) return query.trim();
        const searchValue = property.valuePath;
        const selectedNode = selection.selectedProperty ? propertyTreeProvider?.findNode(selection.selectedProperty) : null;
        const matchMode = searchValue === null ? undefined : includeDescendants && selectedNode?.children.size ? 'subtree' : 'exact';
        const alreadyIncluded = tokens.propertyTokens.some(
            token => token.key === property.key && token.value === searchValue && token.matchMode === matchMode
        );
        return alreadyIncluded ? query.trim() : updateFilterQueryWithProperty(query, property.key, searchValue, 'AND', matchMode).query;
    }
    if (typesNavigationEnabled && selection.selectionType === ItemType.TYPE && selection.selectedType) {
        return tokens.typeTokens.includes(selection.selectedType)
            ? query.trim()
            : updateFilterQueryWithType(query, selection.selectedType).query;
    }
    return query.trim();
}

/**
 * A selected navigation tag already constrains the source-file scope. Keeping it out of a Type
 * query is important for exact-line Types, whose explicit `#tag` filters intentionally match
 * row-local tags rather than tags on the owning note.
 */
export function getTypeFacetQueryWithNavigationSelection(
    query: string,
    selection: SearchTruthSelection,
    typesNavigationEnabled = true
): string {
    return selection.selectionType === ItemType.TAG
        ? query.trim()
        : includeNavigationSelectionInSearchQuery(query, selection, typesNavigationEnabled);
}

/** Makes the query shown when Search opens fully describe the active navigation scope. */
export function getSearchActivationQuery(
    query: string,
    selection: SearchTruthSelection,
    typesNavigationEnabled = true,
    includeDescendants = false,
    propertyTreeProvider?: Pick<IPropertyTreeProvider, 'findNode'> | null
): string {
    return includeNavigationSelectionInSearchQuery(query, selection, typesNavigationEnabled, includeDescendants, propertyTreeProvider);
}

/** null means the list is already rooted; an empty query means an aggregate tree root. */
export function getNavigationSearchQuery(
    selection: SearchTruthSelection & { selectedFolder?: { path: string } | null },
    includeDescendants: boolean,
    typesNavigationEnabled = true,
    propertyTreeProvider?: Pick<IPropertyTreeProvider, 'findNode'> | null
): string | null {
    if (selection.selectionType === ItemType.FOLDER) {
        const path = selection.selectedFolder?.path;
        if (!path || path === '/') return null;
        // Keep the prefix outside quotes so paths containing spaces remain folder filters.
        return `folder:${JSON.stringify(`/${path}${includeDescendants ? '/**' : ''}`)}`;
    }
    return getSearchActivationQuery('', selection, typesNavigationEnabled, includeDescendants, propertyTreeProvider);
}

interface UseListPaneSearchParams {
    rootContainerRef: RefObject<HTMLDivElement | null>;
    onSearchTokensChange?: (state: SearchNavFilterState) => void;
    onNavigateToFolder: (folderPath: string, options?: NavigateToFolderOptions) => boolean;
    onRevealTag: (tagPath: string, options?: RevealTagOptions) => boolean;
    onRevealProperty: (propertyNodeId: string, options?: RevealPropertyOptions) => boolean;
    ensureSelectionForCurrentFilterRef: RefObject<((options?: EnsureSelectionOptions) => EnsureSelectionResult) | null>;
}

export interface UseListPaneSearchResult {
    isSearchActive: boolean;
    searchProvider: SearchProvider;
    searchQuery: string;
    debouncedSearchQuery: string;
    debouncedSearchTokens: FilterSearchTokens;
    searchHighlightTerms: readonly string[] | undefined;
    shouldFocusSearch: boolean;
    activeSearchShortcut: SearchShortcut | null;
    isSavingSearchShortcut: boolean;
    suppressSearchTopScrollRef: { current: boolean };
    setSearchQuery: Dispatch<SetStateAction<string>>;
    setShouldFocusSearch: Dispatch<SetStateAction<boolean>>;
    resetSearchForNavigation: () => void;
    handleSearchToggle: () => void;
    closeSearch: () => void;
    focusSearchComplete: () => void;
    handleSaveSearchShortcut: () => void;
    handleRemoveSearchShortcut: () => Promise<void>;
    modifySearchWithTag: (tag: string, operator: InclusionOperator, options?: SearchQueryUpdateOptions) => void;
    modifySearchWithProperty: (key: string, value: string | null, operator: InclusionOperator, options?: SearchQueryUpdateOptions) => void;
    modifySearchWithType: (typeId: TpsNavigatorTypeId, options?: SearchQueryUpdateOptions) => void;
    modifySearchWithDateToken: (dateToken: string, options?: SearchQueryUpdateOptions) => void;
    toggleSearch: () => void;
    executeSearchShortcut: (params: ExecuteSearchShortcutParams) => Promise<void>;
    setPublicSearch: (update: NavigatorListSearchUpdate | null) => boolean;
}

function formatSearchShortcutFolderLabel(folderPath: string): string {
    if (folderPath === '/' || folderPath.startsWith('/')) {
        return folderPath;
    }

    return `/${folderPath}`;
}

function formatSearchShortcutTagLabel(tagPath: string): string {
    if (isVirtualTagCollectionId(tagPath)) {
        return getVirtualTagCollection(tagPath).getLabel();
    }

    if (tagPath.startsWith('#')) {
        return tagPath;
    }

    return `#${tagPath}`;
}

function formatSearchShortcutPropertyLabel(nodeId: string): string {
    if (nodeId === PROPERTIES_ROOT_VIRTUAL_FOLDER_ID) {
        return strings.navigationPane.properties;
    }

    const parsed = parsePropertyNodeId(nodeId);
    if (!parsed) {
        return nodeId;
    }

    if (parsed.valuePath) {
        return parsed.valuePath;
    }

    return parsed.key;
}

function formatSearchShortcutStartTargetPath(startTarget: ShortcutStartTarget): string {
    switch (startTarget.type) {
        case ShortcutStartType.FOLDER:
            return formatSearchShortcutFolderLabel(startTarget.path);
        case ShortcutStartType.TAG:
            return formatSearchShortcutTagLabel(startTarget.tagPath);
        case ShortcutStartType.PROPERTY:
            return formatSearchShortcutPropertyLabel(startTarget.nodeId);
    }
}

export function resolveSearchShortcutStartFolderPath(app: App, startTarget: ShortcutStartTarget): string | null {
    if (!isShortcutStartFolder(startTarget)) {
        return null;
    }

    const normalizedStartFolder = normalizeOptionalVaultFolderPath(startTarget.path);
    if (!normalizedStartFolder) {
        return null;
    }

    return resolveFolderShortcutTarget(app, normalizedStartFolder)?.path ?? null;
}

interface SearchShortcutStartTargetLookup {
    tagTreeService: Pick<ITagTreeProvider, 'findTagNode'> | null;
    propertyTreeService: Pick<IPropertyTreeProvider, 'findNode'> | null;
}

/**
 * Resolves a saved search's start location without mutating navigation state.
 * Exact tag and property nodes are required so a stale child target never falls
 * back to an unrelated current scope or a broader ancestor collection.
 */
export function resolveSearchShortcutStartTarget(
    app: App,
    startTarget: ShortcutStartTarget,
    lookup: SearchShortcutStartTargetLookup
): ShortcutStartTarget | null {
    if (isShortcutStartFolder(startTarget)) {
        const path = resolveSearchShortcutStartFolderPath(app, startTarget);
        return path ? { type: ShortcutStartType.FOLDER, path } : null;
    }

    if (isShortcutStartTag(startTarget)) {
        const normalizedTagPath = normalizeTagPath(startTarget.tagPath);
        if (!normalizedTagPath) {
            return null;
        }
        if (normalizedTagPath === ALL_TAGS_TAG_ID || normalizedTagPath === TAGGED_TAG_ID || normalizedTagPath === UNTAGGED_TAG_ID) {
            return { type: ShortcutStartType.TAG, tagPath: normalizedTagPath };
        }

        const tagNode = lookup.tagTreeService?.findTagNode(normalizedTagPath) ?? null;
        return tagNode ? { type: ShortcutStartType.TAG, tagPath: tagNode.path } : null;
    }

    if (!isShortcutStartProperty(startTarget)) {
        return null;
    }
    if (startTarget.nodeId === PROPERTIES_ROOT_VIRTUAL_FOLDER_ID) {
        return { type: ShortcutStartType.PROPERTY, nodeId: PROPERTIES_ROOT_VIRTUAL_FOLDER_ID };
    }

    const normalizedNodeId = normalizePropertyNodeId(startTarget.nodeId);
    if (!normalizedNodeId) {
        return null;
    }

    const propertyNode = lookup.propertyTreeService?.findNode(normalizedNodeId) ?? null;
    return propertyNode ? { type: ShortcutStartType.PROPERTY, nodeId: propertyNode.id } : null;
}

function reportUnavailableSearchShortcutStartTarget(searchShortcut: SearchShortcut): void {
    console.warn('[TPS Notebook Navigator search shortcut] Saved start target unavailable', {
        name: searchShortcut.name,
        targetType: searchShortcut.startTarget?.type
    });
    showNotice(`Search shortcut "${searchShortcut.name}" was not run because its saved start location is no longer available.`, {
        variant: 'warning'
    });
}

/** Invalid Filter Search syntax must not be persisted as a shortcut that can only fail closed. */
export function canSaveSearchShortcutQuery(query: string, provider: SearchProvider, options: ParseFilterSearchOptions = {}): boolean {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
        return false;
    }

    return provider === 'omnisearch' || parseFilterSearchTokens(normalizedQuery, options).invalidReason === null;
}

export function useListPaneSearch({
    rootContainerRef,
    onSearchTokensChange,
    onNavigateToFolder,
    ensureSelectionForCurrentFilterRef
}: UseListPaneSearchParams): UseListPaneSearchResult {
    const { app, plugin, propertyTreeService, tagTreeService } = useServices();
    const settings = useSettingsState();
    const selectionState = useSelectionState();
    const selectionDispatch = useSelectionDispatch();
    const shortcuts = useShortcuts();
    const uiDispatch = useUIDispatch();
    const uxPreferences = useUXPreferences();
    const { setSearchActive } = useUXPreferenceActions();
    const { addSearchShortcut, removeSearchShortcut, searchShortcutsByName } = shortcuts;
    const searchShortcuts = useMemo(() => Array.from(searchShortcutsByName.values()), [searchShortcutsByName]);

    const isSearchActive = uxPreferences.searchActive;
    const searchProvider: SearchProvider = settings.searchProvider ?? 'internal';
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [shouldFocusSearch, setShouldFocusSearch] = useState(false);
    const [isSavingSearchShortcut, setIsSavingSearchShortcut] = useState(false);
    const suppressSearchTopScrollRef = useRef(false);
    const navigationSearchQuery = getNavigationSearchQuery(
        selectionState,
        resolveSelectionIncludeDescendants(settings, selectionState, uxPreferences.includeDescendantNotes),
        settings.tpsFileTypesNavigationEnabled,
        propertyTreeService
    );
    useLayoutEffect(() => {
        if (navigationSearchQuery === null) return;
        // Consume navigation at the search boundary: the visible query owns filtering,
        // while the list, creation context and public snapshot all remain at the root.
        plugin.setSearchProvider('internal');
        setSearchQuery(navigationSearchQuery);
        setDebouncedSearchQuery(navigationSearchQuery);
        setSearchActive(navigationSearchQuery.length > 0);
        setShouldFocusSearch(false);
        selectionDispatch({
            type: 'SET_SELECTED_FOLDER',
            folder: app.vault.getRoot(),
            autoSelectedFile: selectionState.selectedFile,
            historyBehavior: 'skip'
        });
    }, [app, navigationSearchQuery, plugin, selectionDispatch, selectionState.selectedFile, setSearchActive]);

    const dayKey = useLocalDayKey();
    const searchReferenceDate = useMemo(() => DateUtils.parseLocalDayKey(dayKey) ?? undefined, [dayKey]);

    const debouncedSearchTokens = useMemo(
        () =>
            parseFilterSearchTokens(isSearchActive ? debouncedSearchQuery : '', {
                typesNavigationEnabled: settings.tpsFileTypesNavigationEnabled,
                referenceDate: searchReferenceDate
            }),
        [debouncedSearchQuery, isSearchActive, searchReferenceDate, settings.tpsFileTypesNavigationEnabled]
    );
    // Name highlighting uses parsed folded name tokens instead of the raw query so quoted literal
    // terms (for example `".F"`) highlight without their quotes and filter tokens such as
    // `folder:...` never leak into name highlights. Tokens are parsed from the immediate query,
    // not the debounced one, so highlights keep tracking while the user types.
    const searchHighlightTerms = useMemo(() => {
        if (!isSearchActive) {
            return undefined;
        }

        const tokens = parseFilterSearchTokens(searchQuery, {
            typesNavigationEnabled: settings.tpsFileTypesNavigationEnabled,
            referenceDate: searchReferenceDate
        });
        if (tokens.mode === 'tag' || tokens.nameTokens.length === 0) {
            return undefined;
        }

        return tokens.nameTokens;
    }, [isSearchActive, searchQuery, searchReferenceDate, settings.tpsFileTypesNavigationEnabled]);

    const activeSearchShortcut = useMemo(() => {
        const normalizedQuery = searchQuery.trim();
        if (!normalizedQuery) {
            return null;
        }

        const normalizedProvider = searchProvider ?? 'internal';
        let firstMatch: SearchShortcut | null = null;

        for (const saved of searchShortcuts) {
            if (saved.query !== normalizedQuery) {
                continue;
            }

            if (!firstMatch) {
                firstMatch = saved;
            }

            const savedProvider = saved.provider ?? 'internal';
            if (savedProvider === normalizedProvider) {
                return saved;
            }
        }

        return firstMatch;
    }, [searchProvider, searchQuery, searchShortcuts]);

    useEffect(() => {
        if (!isSearchActive && searchQuery) {
            setSearchQuery('');
        }
    }, [isSearchActive, searchQuery]);

    useEffect(() => {
        // Clearing is a complete action, so restore the full list without the typing delay.
        if (!isSearchActive || searchQuery.length === 0) {
            if (debouncedSearchQuery) {
                setDebouncedSearchQuery('');
            }
            return;
        }

        if (debouncedSearchQuery === searchQuery) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, TIMEOUTS.DEBOUNCE_KEYBOARD);

        return () => {
            window.clearTimeout(timeoutId);
        };
    }, [debouncedSearchQuery, isSearchActive, searchQuery]);

    useEffect(() => {
        if (!onSearchTokensChange) {
            return;
        }

        const nextState = searchQuery.trim()
            ? buildSearchNavFilterState(searchQuery, {
                  typesNavigationEnabled: settings.tpsFileTypesNavigationEnabled,
                  referenceDate: searchReferenceDate
              })
            : EMPTY_SEARCH_NAV_FILTER_STATE;
        onSearchTokensChange(nextState);
    }, [onSearchTokensChange, searchQuery, searchReferenceDate, settings.tpsFileTypesNavigationEnabled]);

    const activeSearchShortcutStartTarget = useMemo<ShortcutStartTarget | undefined>(() => {
        if (selectionState.selectionType === 'folder' && selectionState.selectedFolder) {
            return {
                type: ShortcutStartType.FOLDER,
                path: selectionState.selectedFolder.path
            };
        }

        if (selectionState.selectionType === 'tag' && selectionState.selectedTag) {
            return {
                type: ShortcutStartType.TAG,
                tagPath: selectionState.selectedTag
            };
        }

        if (selectionState.selectionType === 'property' && selectionState.selectedProperty) {
            return {
                type: ShortcutStartType.PROPERTY,
                nodeId: selectionState.selectedProperty
            };
        }

        return undefined;
    }, [selectionState.selectedFolder, selectionState.selectedProperty, selectionState.selectedTag, selectionState.selectionType]);

    const activeSearchShortcutStartTargetLabel = useMemo(() => {
        if (!activeSearchShortcutStartTarget) {
            return null;
        }

        return strings.searchInput.shortcutStartIn.replace('{path}', formatSearchShortcutStartTargetPath(activeSearchShortcutStartTarget));
    }, [activeSearchShortcutStartTarget]);

    const activateSearch = useCallback(
        (target: 'search' | 'files' | null = 'search') => {
            if (!isSearchActive) {
                setSearchActive(true);
            }

            if (target) {
                uiDispatch({ type: 'ACTIVATE_PANE', target });
            }
        },
        [isSearchActive, setSearchActive, uiDispatch]
    );

    const closeSearch = useCallback(() => {
        setSearchActive(false);
        uiDispatch({ type: 'ACTIVATE_PANE', target: 'files' });
    }, [setSearchActive, uiDispatch]);

    const resetSearchForNavigation = useCallback(() => {
        setShouldFocusSearch(false);
        setSearchQuery('');
        setDebouncedSearchQuery('');
        setSearchActive(false);
    }, [setSearchActive]);

    const setPublicSearch = useCallback(
        (update: NavigatorListSearchUpdate | null): boolean => {
            if (update === null || update.active === false) {
                setShouldFocusSearch(false);
                setSearchQuery('');
                setDebouncedSearchQuery('');
                if (isSearchActive) {
                    setSearchActive(false);
                }
                uiDispatch({ type: 'ACTIVATE_PANE', target: 'files' });
                return true;
            }

            if (update.provider !== undefined && update.provider !== searchProvider) {
                plugin.setSearchProvider(update.provider);
            }

            if (update.query !== undefined) {
                // Public writes are applied immediately so the next pulled snapshot reflects
                // the requested rows without waiting for the keyboard debounce interval.
                setSearchQuery(update.query);
                setDebouncedSearchQuery(update.query);
            }

            const shouldActivate = update.active === true || update.query !== undefined || update.focus === true;
            if (shouldActivate) {
                activateSearch(update.focus === true ? 'search' : null);
            }
            setShouldFocusSearch(update.focus === true);
            return true;
        },
        [activateSearch, isSearchActive, plugin, searchProvider, setSearchActive, uiDispatch]
    );

    const handleSaveSearchShortcut = useCallback(() => {
        const normalizedQuery = searchQuery.trim();
        if (
            isSavingSearchShortcut ||
            !canSaveSearchShortcutQuery(normalizedQuery, searchProvider, {
                typesNavigationEnabled: settings.tpsFileTypesNavigationEnabled,
                referenceDate: searchReferenceDate
            })
        ) {
            return;
        }

        const startTarget = activeSearchShortcutStartTarget;
        const startTargetLabel = activeSearchShortcutStartTargetLabel;
        let modal: InputModal | null = null;

        modal = new InputModal(
            app,
            strings.searchInput.shortcutModalTitle,
            strings.searchInput.shortcutNamePlaceholder,
            async (rawName, context) => {
                const trimmedName = rawName.trim();
                if (trimmedName.length === 0) {
                    showNotice(strings.shortcuts.emptySearchName, { variant: 'warning' });
                    return;
                }

                setIsSavingSearchShortcut(true);
                try {
                    const saveStartTarget = context?.checkboxValue ? startTarget : undefined;
                    const success = await addSearchShortcut({
                        name: trimmedName,
                        query: normalizedQuery,
                        provider: searchProvider,
                        startTarget: saveStartTarget
                    });
                    if (success) {
                        modal?.close();
                    }
                } finally {
                    setIsSavingSearchShortcut(false);
                }
            },
            normalizedQuery,
            {
                closeOnSubmit: false,
                checkbox: startTargetLabel
                    ? {
                          label: startTargetLabel,
                          defaultChecked: false
                      }
                    : undefined
            }
        );

        modal.open();
    }, [
        activeSearchShortcutStartTarget,
        activeSearchShortcutStartTargetLabel,
        addSearchShortcut,
        app,
        isSavingSearchShortcut,
        searchProvider,
        searchQuery,
        searchReferenceDate,
        settings.tpsFileTypesNavigationEnabled
    ]);

    const handleRemoveSearchShortcut = useCallback(async () => {
        if (!activeSearchShortcut || isSavingSearchShortcut) {
            return;
        }

        setIsSavingSearchShortcut(true);
        try {
            await removeSearchShortcut(activeSearchShortcut.name);
        } finally {
            setIsSavingSearchShortcut(false);
        }
    }, [activeSearchShortcut, isSavingSearchShortcut, removeSearchShortcut]);

    const updateSearchQuery = useCallback(
        (mutate: (query: string) => string, options?: SearchQueryUpdateOptions) => {
            const shouldFocusSearch = options?.focusSearch !== false;
            if (shouldFocusSearch) {
                setShouldFocusSearch(true);
            }
            activateSearch(shouldFocusSearch ? 'search' : null);

            let nextQueryValue: string | null = null;
            setSearchQuery(previousQuery => {
                const updatedQuery = mutate(previousQuery);
                nextQueryValue = updatedQuery;
                return updatedQuery;
            });

            if (nextQueryValue !== null) {
                setDebouncedSearchQuery(nextQueryValue);
            }
        },
        [activateSearch]
    );

    const openSearchWithNavigationSelection = useCallback(() => {
        updateSearchQuery(query =>
            getSearchActivationQuery(
                query,
                selectionState,
                settings.tpsFileTypesNavigationEnabled,
                resolveSelectionIncludeDescendants(settings, selectionState, uxPreferences.includeDescendantNotes),
                propertyTreeService
            )
        );
    }, [propertyTreeService, selectionState, settings, updateSearchQuery, uxPreferences.includeDescendantNotes]);

    const handleSearchToggle = useCallback(() => {
        if (!isSearchActive) {
            openSearchWithNavigationSelection();
            return;
        }

        closeSearch();
    }, [closeSearch, isSearchActive, openSearchWithNavigationSelection]);

    const modifySearchWithTag = useCallback(
        (tag: string, operator: InclusionOperator, options?: SearchQueryUpdateOptions) => {
            const normalizedTag = normalizeTagPath(tag);
            if (!normalizedTag || normalizedTag === ALL_TAGS_TAG_ID || normalizedTag === UNTAGGED_TAG_ID) {
                return;
            }

            updateSearchQuery(
                query =>
                    updateFilterQueryWithTag(
                        includeNavigationSelectionInSearchQuery(
                            query,
                            selectionState,
                            settings.tpsFileTypesNavigationEnabled,
                            resolveSelectionIncludeDescendants(settings, selectionState, uxPreferences.includeDescendantNotes),
                            propertyTreeService
                        ),
                        normalizedTag,
                        operator
                    ).query,
                options
            );
        },
        [propertyTreeService, selectionState, settings, updateSearchQuery, uxPreferences.includeDescendantNotes]
    );

    const modifySearchWithProperty = useCallback(
        (key: string, value: string | null, operator: InclusionOperator, options?: SearchQueryUpdateOptions) => {
            const normalizedKey = key.trim();
            if (!normalizedKey) {
                return;
            }

            updateSearchQuery(
                query =>
                    updateFilterQueryWithProperty(
                        includeNavigationSelectionInSearchQuery(
                            query,
                            selectionState,
                            settings.tpsFileTypesNavigationEnabled,
                            resolveSelectionIncludeDescendants(settings, selectionState, uxPreferences.includeDescendantNotes),
                            propertyTreeService
                        ),
                        normalizedKey,
                        value,
                        operator,
                        options?.propertyMatchMode
                    ).query,
                options
            );
        },
        [propertyTreeService, selectionState, settings, updateSearchQuery, uxPreferences.includeDescendantNotes]
    );

    const modifySearchWithType = useCallback(
        (typeId: TpsNavigatorTypeId, options?: SearchQueryUpdateOptions) => {
            if (!settings.tpsFileTypesNavigationEnabled) {
                return;
            }
            if (searchProvider !== 'internal') {
                plugin.setSearchProvider('internal');
            }

            updateSearchQuery(query => {
                const queryWithVisibleSelection = getTypeFacetQueryWithNavigationSelection(
                    query,
                    selectionState,
                    settings.tpsFileTypesNavigationEnabled
                );
                const selectedType = selectionState.selectionType === ItemType.TYPE ? selectionState.selectedType : null;
                return updateFilterQueryWithTypeSelection(queryWithVisibleSelection, typeId, selectedType).query;
            }, options);
        },
        [plugin, searchProvider, selectionState, settings.tpsFileTypesNavigationEnabled, updateSearchQuery]
    );

    const modifySearchWithDateToken = useCallback(
        (dateToken: string, options?: SearchQueryUpdateOptions) => {
            const normalizedToken = dateToken.trim();
            if (!normalizedToken) {
                return;
            }

            if (searchProvider !== 'internal') {
                plugin.setSearchProvider('internal');
            }

            updateSearchQuery(
                query =>
                    updateFilterQueryWithDateToken(
                        includeNavigationSelectionInSearchQuery(
                            query,
                            selectionState,
                            settings.tpsFileTypesNavigationEnabled,
                            resolveSelectionIncludeDescendants(settings, selectionState, uxPreferences.includeDescendantNotes),
                            propertyTreeService
                        ),
                        normalizedToken
                    ).query,
                options
            );
        },
        [plugin, propertyTreeService, searchProvider, selectionState, settings, updateSearchQuery, uxPreferences.includeDescendantNotes]
    );

    const waitForNextFrame = useCallback(() => {
        return new Promise<void>(resolve => {
            window.requestAnimationFrame(() => resolve());
        });
    }, []);

    const waitForSinglePaneTransition = useCallback(async () => {
        const container = rootContainerRef.current;
        if (!container) {
            return;
        }

        // Dual pane switches views without a sliding transition and never gets the
        // show-files class, so waiting would always run until the full deadline.
        if (!container.classList.contains('nn-single-pane')) {
            return;
        }

        const transitionDurationMs = settings.paneTransitionDuration;
        const deadline = performance.now() + transitionDurationMs + 20;
        while (performance.now() < deadline && container.isConnected && !container.classList.contains('show-files')) {
            await new Promise(requestAnimationFrame);
        }
    }, [rootContainerRef, settings.paneTransitionDuration]);

    const focusListScroller = useCallback(() => {
        const scope = rootContainerRef.current ?? activeDocument;
        const listPaneScroller = scope.querySelector('.nn-list-pane-scroller');
        if (listPaneScroller instanceof HTMLElement) {
            focusElementPreventScroll(listPaneScroller);
        }
    }, [rootContainerRef]);

    const focusSearchInput = useCallback(() => {
        window.setTimeout(() => {
            const scope = rootContainerRef.current ?? activeDocument;
            const searchInput = scope.querySelector('.nn-search-input');
            if (searchInput instanceof HTMLInputElement) {
                searchInput.focus();
                uiDispatch({ type: 'ACTIVATE_PANE', target: 'search' });
            }
        }, 0);
    }, [rootContainerRef, uiDispatch]);

    const toggleSearch = useCallback(() => {
        if (isSearchActive) {
            focusSearchInput();
            return;
        }

        openSearchWithNavigationSelection();
    }, [focusSearchInput, isSearchActive, openSearchWithNavigationSelection]);

    const executeSearchShortcut = useCallback(
        async ({ searchShortcut }: ExecuteSearchShortcutParams) => {
            const normalizedQuery = searchShortcut.query.trim();
            const targetProvider = searchShortcut.provider ?? 'internal';
            const startTarget = searchShortcut.startTarget;

            const resolvedStartTarget = startTarget
                ? resolveSearchShortcutStartTarget(app, startTarget, { propertyTreeService, tagTreeService })
                : null;
            if (startTarget && !resolvedStartTarget) {
                reportUnavailableSearchShortcutStartTarget(searchShortcut);
                return;
            }

            const startSelection = resolvedStartTarget
                ? {
                      selectionType: resolvedStartTarget.type,
                      selectedFolder: isShortcutStartFolder(resolvedStartTarget)
                          ? app.vault.getFolderByPath(resolvedStartTarget.path)
                          : null,
                      selectedTag: isShortcutStartTag(resolvedStartTarget) ? resolvedStartTarget.tagPath : null,
                      selectedProperty: isShortcutStartProperty(resolvedStartTarget) ? resolvedStartTarget.nodeId : null,
                      selectedType: null
                  }
                : null;
            const startQuery = startSelection
                ? getNavigationSearchQuery(
                      startSelection,
                      resolveSelectionIncludeDescendants(
                          settings,
                          {
                              selectionType: startSelection.selectionType,
                              selectedFolder: startSelection.selectedFolder,
                              selectedTag: startSelection.selectedTag,
                              selectedProperty:
                                  startSelection.selectedProperty === PROPERTIES_ROOT_VIRTUAL_FOLDER_ID
                                      ? PROPERTIES_ROOT_VIRTUAL_FOLDER_ID
                                      : normalizePropertyNodeId(startSelection.selectedProperty ?? '')
                          },
                          uxPreferences.includeDescendantNotes
                      ),
                      settings.tpsFileTypesNavigationEnabled,
                      propertyTreeService
                  )
                : null;
            const visibleQuery = [startQuery, normalizedQuery].filter(Boolean).join(' ');
            if (!onNavigateToFolder('/', { source: 'shortcut', suppressAutoSelect: true, skipScroll: true, skipFocus: true })) return;
            plugin.setSearchProvider(startQuery ? 'internal' : targetProvider);

            uiDispatch({ type: 'ACTIVATE_PANE', target: 'files' });

            // The sliding view transition only exists in single pane. Dual pane switches
            // instantly, so suppressing the post-search scroll there would swallow the
            // first legitimate scroll to top after filtering.
            if (rootContainerRef.current?.classList.contains('nn-single-pane')) {
                suppressSearchTopScrollRef.current = true;
                await waitForSinglePaneTransition();
            }

            if (!isSearchActive) {
                setSearchActive(true);
            }

            setShouldFocusSearch(false);
            setSearchQuery(visibleQuery);
            setDebouncedSearchQuery(visibleQuery);

            await waitForNextFrame();
            await waitForNextFrame();

            if (supportsKeyboardInteractions()) {
                ensureSelectionForCurrentFilterRef.current?.({ openInEditor: false, clearIfEmpty: true, selectFallback: true });
            }

            focusListScroller();
        },
        [
            app,
            ensureSelectionForCurrentFilterRef,
            focusListScroller,
            isSearchActive,
            onNavigateToFolder,
            plugin,
            propertyTreeService,
            rootContainerRef,
            setSearchActive,
            settings,
            uxPreferences.includeDescendantNotes,
            tagTreeService,
            uiDispatch,
            waitForSinglePaneTransition,
            waitForNextFrame
        ]
    );

    return {
        isSearchActive,
        searchProvider,
        searchQuery,
        debouncedSearchQuery,
        debouncedSearchTokens,
        searchHighlightTerms,
        shouldFocusSearch,
        activeSearchShortcut,
        isSavingSearchShortcut,
        suppressSearchTopScrollRef,
        setSearchQuery,
        setShouldFocusSearch,
        resetSearchForNavigation,
        handleSearchToggle,
        closeSearch,
        focusSearchComplete: () => setShouldFocusSearch(false),
        handleSaveSearchShortcut,
        handleRemoveSearchShortcut,
        modifySearchWithTag,
        modifySearchWithProperty,
        modifySearchWithType,
        modifySearchWithDateToken,
        toggleSearch,
        executeSearchShortcut,
        setPublicSearch
    };
}
