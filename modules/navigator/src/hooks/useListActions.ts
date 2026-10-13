import { legacyNewNoteTabPreference, type NotePresentationOrigin } from '../utils/tpsNoteOpening';
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Menu, TFolder, type App, type TFile } from 'obsidian';
import { useSelectionState, useSelectionDispatch } from '../context/SelectionContext';
import { useServices, useFileSystemOps, useMetadataService } from '../context/ServicesContext';
import { useSettingsState, useSettingsUpdate } from '../context/SettingsContext';
import { useUXPreferences } from '../context/UXPreferencesContext';
import { strings } from '../i18n';
import { ConfirmModal } from '../modals/ConfirmModal';
import {
    createPropertyGroupingOption,
    getPropertyGroupingGranularity,
    getPropertyGroupingKey,
    getPropertyGroupingOrder,
    getPropertyGroupingSource,
    normalizePropertyGroupingSourceForMenu
} from '../settings/types';
import type { ListNoteGroupingOption, ListSortOverrideValue, NotebookNavigatorSettings, PropertyGroupingOrder } from '../settings/types';
import { ALL_TAGS_TAG_ID, ItemType, PROPERTIES_ROOT_VIRTUAL_FOLDER_ID, TAGGED_TAG_ID, UNTAGGED_TAG_ID } from '../types';
import {
    areListSortOverridesEqual,
    buildSortOption,
    cloneListSortOverride,
    createListSortOverride,
    getAvailablePropertySortKeys,
    getListSortFieldIconId,
    getListSortToolbarIconId,
    getListSortOverrideForSelection,
    getManualSortPropertyKey,
    getSortDirection,
    getSortDirectionForFieldChange,
    getSortField,
    getSortIcon as getSortIconName,
    isManualSortPropertyKey,
    isDateSortOption,
    resolveListSort,
    resolveListSortOverrideForDefault,
    resolveSourceBackedTypeListSort,
    type SortDirection,
    type SortField
} from '../utils/sortUtils';
import { showListPaneAppearanceMenu } from '../components/ListPaneAppearanceMenu';
import {
    supportsDayPropertyGroupingForSelection,
    supportsLinePropertyGroupingSourceForSelection
} from '../components/listPane/typeModeRuntime';
import {
    isLinePropertyInheritance,
    resolveLinePropertyInheritance,
    resolveMultiValueGrouping,
    resolveNoValueGroupPosition
} from './useListPaneAppearance';
import type { FolderAppearance, LinePropertyInheritance, MultiValueGrouping, NoValueGroupPosition } from './useListPaneAppearance';
import {
    areStoredListPaneAppearanceFieldsEqual,
    getStoredListPaneAppearanceFields,
    hasStoredListPaneAppearanceOverride,
    mergeListPaneAppearanceAndGrouping
} from '../settings/listPaneAppearance';
import type { ListPaneAppearance } from '../settings/listPaneAppearance';
import { getFilesForFolder } from '../utils/fileFinder';
import { runAsyncAction } from '../utils/async';
import {
    getDescendantVisibilityTarget,
    isAggregateNavigationSelection,
    resolveSelectionIncludeDescendants,
    setSelectionIncludeDescendants
} from '../utils/descendantVisibility';
import { FILE_VISIBILITY } from '../utils/fileTypeUtils';
import {
    getManualSortBaselineSettings,
    getCachedManualSortPropertyState,
    getLocalizedManualSortWriteFailureMessage,
    hasCachedManualSortProperty,
    isValidManualSortPropertyKey,
    orderManualSortFiles,
    removeManualSortProperty,
    writeManualSortOrder,
    type ManualSortNewFilePlacementContext
} from '../utils/manualSort';
import { resolveIconForMenu, resolveUXIcon, resolveUXIconForMenu } from '../utils/uxIcons';
import { buildPropertyKeyNodeId, parsePropertyNodeId } from '../utils/propertyTree';
import type { IPropertyTreeProvider } from '../interfaces/IPropertyTreeProvider';
import { getFilesForNavigationSelection, getVisibleVaultFiles } from '../utils/selectionUtils';
import { findVaultProfileById } from '../utils/vaultProfiles';
import { casefold, ensureRecord, sanitizeRecord } from '../utils/recordUtils';
import {
    areListGroupingOptionsEqual,
    areListGroupingOptionsSameKind,
    getAvailablePropertyGroupKeys,
    resolveEffectiveListGroupingForSort,
    resolveListGrouping,
    resolveListGroupingOverrideForDefault
} from '../utils/listGrouping';
import { getErrorMessage } from '../utils/errorUtils';
import { showNotice } from '../utils/noticeUtils';
import { registerActiveFileWorkspaceListeners } from '../utils/workspaceActiveFileEvents';
import {
    TPS_NAVIGATOR_TYPE_IDS,
    isTpsNavigatorFileTypeId,
    isTpsNavigatorLineTypeId,
    isTpsNavigatorStructuralTypeId
} from '../types/navigatorTypes';
import { collectFileBackedTypeFiles } from './listPaneData/typeListItems';
import {
    createTpsNavigatorFileResource,
    getTpsFileResourceCreationActionLabel,
    isTpsNavigatorCreatableFileTypeId
} from '../services/types/fileResourceCreation';
import { resolveNavigationSearchCreation, resolveSearchResourceCreation } from '../services/types/searchResourceCreation';
import { getInternalPlugin } from '../utils/typeGuards';
import type { RevealFileOptions } from './useNavigatorReveal';
import { createNoteForNavigationTarget } from '../services/navigationNoteCreation';
import { revealFileFromListUserAction } from '../utils/listPaneReveal';

type SelectionSortTarget =
    | { type: typeof ItemType.FOLDER; key: string }
    | { type: typeof ItemType.TAG; key: string }
    | { type: typeof ItemType.PROPERTY; key: string }
    | { type: typeof ItemType.TYPE; key: string };

type DescendantApplyStats = {
    descendantCount: number;
    savedDescendantCount: number;
    matchingSavedDescendantCount: number;
    changedSavedDescendantCount: number;
    missingSavedDescendantCount: number;
    affectedCount: number;
    disabled: boolean;
};

type ManualSortPropertyStats = {
    markdownCount: number;
    validRankCount: number;
    invalidPropertyCount: number;
};

interface UseListActionsOptions {
    onManualSortStart?: (propertyKey: string) => void;
    getManualSortNewFileContext?: () => ManualSortNewFilePlacementContext | null;
    trackRevealFileAvailability?: boolean;
    mixedStructuralSearchActive?: boolean;
    creationSearchQuery?: string;
    creationSearchSupported?: boolean;
    onRevealFileInActualFolder?: (file: TFile, options?: RevealFileOptions) => boolean;
    onResetSearchForNavigation?: () => void;
}

const BIDI_ISOLATE_START = '\u2068'; // First Strong Isolate
const BIDI_ISOLATE_END = '\u2069'; // Pop Directional Isolate

function isolateBidiText(value: string): string {
    // Keeps user-authored LTR property keys from reordering quotes and punctuation inside RTL labels.
    return `${BIDI_ISOLATE_START}${value}${BIDI_ISOLATE_END}`;
}

function countMarkdownFilesWithManualSortProperty(app: App, files: readonly TFile[], propertyKey: string): number {
    return files.reduce((count, file) => {
        if (file.extension !== 'md') {
            return count;
        }
        return hasCachedManualSortProperty(app, file, propertyKey) ? count + 1 : count;
    }, 0);
}

function getManualSortPropertyStats(app: App, files: readonly TFile[], propertyKey: string): ManualSortPropertyStats {
    return files.reduce<ManualSortPropertyStats>(
        (stats, file) => {
            if (file.extension !== 'md') {
                return stats;
            }

            stats.markdownCount += 1;
            const manualSortProperty = getCachedManualSortPropertyState(app, file, propertyKey);
            if (!manualSortProperty.hasProperty) {
                return stats;
            }

            if (manualSortProperty.rank === null) {
                stats.invalidPropertyCount += 1;
            } else {
                stats.validRankCount += 1;
            }
            return stats;
        },
        {
            markdownCount: 0,
            validRankCount: 0,
            invalidPropertyCount: 0
        }
    );
}

function samePropertySortKey(left: string, right: string): boolean {
    return casefold(left) === casefold(right);
}

function getSortOverridesForTarget(
    settings: NotebookNavigatorSettings,
    target: SelectionSortTarget
): Record<string, ListSortOverrideValue> {
    if (target.type === ItemType.FOLDER) {
        return sanitizeRecord(ensureRecord(settings.folderSortOverrides));
    }
    if (target.type === ItemType.TAG) {
        return sanitizeRecord(ensureRecord(settings.tagSortOverrides));
    }
    if (target.type === ItemType.PROPERTY) {
        return sanitizeRecord(ensureRecord(settings.propertySortOverrides));
    }
    return sanitizeRecord(ensureRecord(settings.typeSortOverrides));
}

function setSortOverridesForTarget(
    settings: NotebookNavigatorSettings,
    target: SelectionSortTarget,
    sortOverrides: Record<string, ListSortOverrideValue>
): void {
    if (target.type === ItemType.FOLDER) {
        settings.folderSortOverrides = sortOverrides;
        return;
    }
    if (target.type === ItemType.TAG) {
        settings.tagSortOverrides = sortOverrides;
        return;
    }
    if (target.type === ItemType.PROPERTY) {
        settings.propertySortOverrides = sortOverrides;
        return;
    }
    settings.typeSortOverrides = sortOverrides;
}

function getAppearancesForTarget(settings: NotebookNavigatorSettings, target: SelectionSortTarget): Record<string, FolderAppearance> {
    if (target.type === ItemType.FOLDER) {
        return sanitizeRecord(ensureRecord(settings.folderAppearances));
    }
    if (target.type === ItemType.TAG) {
        return sanitizeRecord(ensureRecord(settings.tagAppearances));
    }
    if (target.type === ItemType.PROPERTY) {
        return sanitizeRecord(ensureRecord(settings.propertyAppearances));
    }
    return sanitizeRecord(ensureRecord(settings.typeAppearances));
}

function setAppearancesForTarget(
    settings: NotebookNavigatorSettings,
    target: SelectionSortTarget,
    appearances: Record<string, FolderAppearance>
): void {
    if (target.type === ItemType.FOLDER) {
        settings.folderAppearances = appearances;
        return;
    }
    if (target.type === ItemType.TAG) {
        settings.tagAppearances = appearances;
        return;
    }
    if (target.type === ItemType.PROPERTY) {
        settings.propertyAppearances = appearances;
        return;
    }
    settings.typeAppearances = appearances;
}

function getStoredTpsTypeAppearanceFields(appearance: FolderAppearance | undefined): Pick<FolderAppearance, 'linePropertyInheritance'> {
    const fields: Pick<FolderAppearance, 'linePropertyInheritance'> = {};
    if (isLinePropertyInheritance(appearance?.linePropertyInheritance)) {
        fields.linePropertyInheritance = appearance.linePropertyInheritance;
    }
    return fields;
}

/** Keeps Type-only source-property behavior while the shared upstream helper replaces grouping. */
function mergeAppearanceAndGroupingForTarget(
    appearance: FolderAppearance | undefined,
    target: SelectionSortTarget,
    groupBy: ListNoteGroupingOption | undefined
): FolderAppearance | null {
    const standardAppearance = mergeListPaneAppearanceAndGrouping(getStoredListPaneAppearanceFields(appearance), groupBy);
    if (target.type !== ItemType.TYPE) {
        return standardAppearance;
    }

    const typeFields = getStoredTpsTypeAppearanceFields(appearance);
    if (!standardAppearance && Object.keys(typeFields).length === 0) {
        return null;
    }

    return { ...typeFields, ...(standardAppearance ?? {}) };
}

function setSortOverrideForTarget(
    settings: NotebookNavigatorSettings,
    target: SelectionSortTarget,
    sortOverride: ListSortOverrideValue
): void {
    const sortOverrides = getSortOverridesForTarget(settings, target);
    sortOverrides[target.key] = cloneListSortOverride(sortOverride);
    setSortOverridesForTarget(settings, target, sortOverrides);
}

function collectFolderDescendantPaths(folder: TFolder): string[] {
    const paths: string[] = [];
    const stack: TFolder[] = [];

    folder.children.forEach(child => {
        if (child instanceof TFolder) {
            stack.push(child);
        }
    });

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            continue;
        }

        paths.push(current.path);
        current.children.forEach(child => {
            if (child instanceof TFolder) {
                stack.push(child);
            }
        });
    }

    return paths;
}

function countFolderDescendants(folder: TFolder): number {
    let count = 0;
    const stack: TFolder[] = [];

    folder.children.forEach(child => {
        if (child instanceof TFolder) {
            stack.push(child);
        }
    });

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            continue;
        }

        count += 1;
        current.children.forEach(child => {
            if (child instanceof TFolder) {
                stack.push(child);
            }
        });
    }

    return count;
}

function isFolderDescendantSettingKey(selectedFolderPath: string, candidatePath: string): boolean {
    if (candidatePath === selectedFolderPath) {
        return false;
    }

    // Root uses "/" while child folder paths never start with "//", so every non-root key is a descendant.
    if (selectedFolderPath === '/') {
        return candidatePath !== '/';
    }

    return candidatePath.startsWith(`${selectedFolderPath}/`);
}

function isTagDescendantSettingKey(selectedTagPath: string, candidatePath: string): boolean {
    if (candidatePath === selectedTagPath) {
        return false;
    }

    if (selectedTagPath === UNTAGGED_TAG_ID) {
        return false;
    }

    // The "all tagged" virtual node does not live inside the tag hierarchy.
    // For settings-only scans, treat every real stored tag key as part of its descendant scope.
    if (selectedTagPath === ALL_TAGS_TAG_ID || selectedTagPath === TAGGED_TAG_ID) {
        return candidatePath !== ALL_TAGS_TAG_ID && candidatePath !== TAGGED_TAG_ID && candidatePath !== UNTAGGED_TAG_ID;
    }

    return candidatePath.startsWith(`${selectedTagPath}/`);
}

export function isPropertyDescendantSettingKey(
    selectedNodeId: string,
    candidateNodeId: string,
    propertyTreeService: IPropertyTreeProvider | null
): boolean {
    if (candidateNodeId === selectedNodeId) {
        return false;
    }

    if (selectedNodeId === PROPERTIES_ROOT_VIRTUAL_FOLDER_ID) {
        return candidateNodeId !== PROPERTIES_ROOT_VIRTUAL_FOLDER_ID;
    }

    // The indexed tree distinguishes hierarchy from literal slashes in links and URLs.
    if (propertyTreeService?.findNode(selectedNodeId)) {
        return propertyTreeService.collectDescendantNodeIds(selectedNodeId).has(candidateNodeId);
    }

    const selectedNode = parsePropertyNodeId(selectedNodeId);
    const candidateNode = parsePropertyNodeId(candidateNodeId);
    if (!selectedNode || !candidateNode || selectedNode.key !== candidateNode.key) {
        return false;
    }

    if (!selectedNode.valuePath) {
        return candidateNode.valuePath !== null;
    }

    if (!candidateNode.valuePath) {
        return false;
    }

    return candidateNode.valuePath.startsWith(`${selectedNode.valuePath}/`);
}

function buildDescendantApplyStats<T>({
    descendantCount,
    descendantEntries,
    hasCurrentOverride,
    matchesCurrentOverride
}: {
    descendantCount: number;
    descendantEntries: readonly T[];
    hasCurrentOverride: boolean;
    matchesCurrentOverride: (entry: T) => boolean;
}): DescendantApplyStats {
    const savedDescendantCount = descendantEntries.length;

    if (!hasCurrentOverride) {
        return {
            descendantCount,
            savedDescendantCount,
            matchingSavedDescendantCount: 0,
            changedSavedDescendantCount: savedDescendantCount,
            missingSavedDescendantCount: 0,
            affectedCount: savedDescendantCount,
            disabled: descendantCount === 0 || savedDescendantCount === 0
        };
    }

    const matchingSavedDescendantCount = descendantEntries.filter(matchesCurrentOverride).length;
    const changedSavedDescendantCount = savedDescendantCount - matchingSavedDescendantCount;
    const missingSavedDescendantCount = Math.max(descendantCount - savedDescendantCount, 0);

    // `changedSavedDescendantCount` is the confirmation-modal count: existing saved
    // descendant overrides that will be overwritten. `affectedCount` also includes
    // live descendants that do not have a saved override yet and will receive one.
    return {
        descendantCount,
        savedDescendantCount,
        matchingSavedDescendantCount,
        changedSavedDescendantCount,
        missingSavedDescendantCount,
        affectedCount: changedSavedDescendantCount + missingSavedDescendantCount,
        disabled: descendantCount === 0 || (savedDescendantCount === descendantCount && matchingSavedDescendantCount === descendantCount)
    };
}

function getGroupingIcon(option: ListNoteGroupingOption): string {
    if (getPropertyGroupingGranularity(option) === 'day') {
        return 'lucide-calendar-days';
    }
    if (getPropertyGroupingSource(option) === 'line') {
        return 'lucide-list-tree';
    }
    switch (option) {
        case 'none':
            return 'lucide-x';
        case 'custom':
            return 'lucide-heading';
        case 'date':
            return 'lucide-calendar';
        case 'folder':
            return 'lucide-folder';
        case 'tags':
            return 'lucide-tags';
        default:
            return 'lucide-heading';
    }
}

function collectAllPropertyNodeIds(propertyTreeService: NonNullable<ReturnType<typeof useServices>['propertyTreeService']>): string[] {
    const nodeIds: string[] = [];
    const visited = new Set<string>();

    const collectIds = (nodeId: string) => {
        if (visited.has(nodeId)) {
            return;
        }
        visited.add(nodeId);
        nodeIds.push(nodeId);

        const node = propertyTreeService.findNode(nodeId);
        if (!node) {
            return;
        }

        node.children.forEach(child => {
            collectIds(child.id);
        });
    };

    propertyTreeService.getPropertyTree().forEach(node => {
        collectIds(node.id);
    });

    return nodeIds;
}

/**
 * Custom hook that provides shared actions for list pane toolbars.
 * Used by both ListPaneHeader (desktop) and ListToolbar (mobile) to avoid code duplication.
 *
 * @returns Object containing action handlers and computed values for list pane operations
 */
export function useListActions({
    onManualSortStart,
    getManualSortNewFileContext,
    trackRevealFileAvailability = false,
    mixedStructuralSearchActive = false,
    creationSearchQuery = '',
    creationSearchSupported = true,
    onRevealFileInActualFolder,
    onResetSearchForNavigation
}: UseListActionsOptions = {}) {
    const { app, plugin, tagTreeService, propertyTreeService } = useServices();
    const settings = useSettingsState();
    const vaultProfileId = settings.vaultProfile;
    const vaultProfiles = settings.vaultProfiles;
    const uxPreferences = useUXPreferences();
    const defaultIncludeDescendantNotes = uxPreferences.includeDescendantNotes;
    const showHiddenItems = uxPreferences.showHiddenItems;
    const updateSettings = useSettingsUpdate();
    const selectionState = useSelectionState();
    const includeDescendantNotes = resolveSelectionIncludeDescendants(settings, selectionState, defaultIncludeDescendantNotes);
    const selectionDispatch = useSelectionDispatch();
    const fileSystemOps = useFileSystemOps();
    const metadataService = useMetadataService();
    const hasFolderSelection = selectionState.selectionType === ItemType.FOLDER && Boolean(selectionState.selectedFolder);
    const hasTagSelection = selectionState.selectionType === ItemType.TAG && Boolean(selectionState.selectedTag);
    const hasCreatableTagSelection =
        hasTagSelection &&
        selectionState.selectedTag !== ALL_TAGS_TAG_ID &&
        selectionState.selectedTag !== TAGGED_TAG_ID &&
        selectionState.selectedTag !== UNTAGGED_TAG_ID;
    const hasPropertySelection = selectionState.selectionType === ItemType.PROPERTY && Boolean(selectionState.selectedProperty);
    const hasFileBackedTypeSelection =
        selectionState.selectionType === ItemType.TYPE && isTpsNavigatorFileTypeId(selectionState.selectedType);
    const hasLineBackedTypeSelection =
        selectionState.selectionType === ItemType.TYPE && isTpsNavigatorLineTypeId(selectionState.selectedType);
    const canChooseLinePropertySource = supportsLinePropertyGroupingSourceForSelection(
        selectionState.selectionType,
        selectionState.selectedType,
        mixedStructuralSearchActive
    );
    const canChooseDayPropertyGrouping = supportsDayPropertyGroupingForSelection(
        selectionState.selectionType,
        selectionState.selectedType,
        mixedStructuralSearchActive
    );
    const hasCreatableFileTypeSelection =
        selectionState.selectionType === ItemType.TYPE &&
        isTpsNavigatorCreatableFileTypeId(selectionState.selectedType) &&
        (selectionState.selectedType !== TPS_NAVIGATOR_TYPE_IDS.BASES || Boolean(getInternalPlugin(app, 'bases')?.enabled));
    const activeCreationSearchQuery = creationSearchQuery.trim();
    const searchCreationResolution = useMemo(
        () =>
            activeCreationSearchQuery
                ? creationSearchSupported
                    ? resolveSearchResourceCreation(activeCreationSearchQuery)
                    : { ok: false as const, reason: 'New item unavailable: this search provider cannot guarantee a matching item.' }
                : null,
        [activeCreationSearchQuery, creationSearchSupported]
    );
    const searchCreationPlan = searchCreationResolution?.ok ? searchCreationResolution : null;
    const navigationCreationTarget = useMemo(
        () => (creationSearchSupported ? resolveNavigationSearchCreation(activeCreationSearchQuery) : null),
        [activeCreationSearchQuery, creationSearchSupported]
    );
    const canCreateFromSearch = Boolean(
        searchCreationPlan &&
        (searchCreationPlan.typeId !== TPS_NAVIGATOR_TYPE_IDS.BASES || Boolean(getInternalPlugin(app, 'bases')?.enabled))
    );
    const hasCreatablePropertySelection = hasPropertySelection && selectionState.selectedProperty !== PROPERTIES_ROOT_VIRTUAL_FOLDER_ID;
    const hasAppearanceOrSortSelection =
        hasFolderSelection || hasTagSelection || hasPropertySelection || hasFileBackedTypeSelection || hasLineBackedTypeSelection;

    const openDefaultListSettings = useCallback(() => {
        plugin.openSettings();
    }, [plugin]);

    const openDefaultListAppearanceSettings = useCallback(() => {
        plugin.openSettings();
    }, [plugin]);
    const canCreateNewFile = activeCreationSearchQuery
        ? canCreateFromSearch || Boolean(navigationCreationTarget)
        : selectionState.selectionType === ItemType.TYPE
          ? hasCreatableFileTypeSelection
          : Boolean(selectionState.selectedFolder) || hasCreatableTagSelection || hasCreatablePropertySelection;
    const effectiveCreationType = searchCreationPlan?.typeId ?? selectionState.selectedType;
    const typeCreationLabel = getTpsFileResourceCreationActionLabel(effectiveCreationType);
    const newItemLabel = navigationCreationTarget
        ? strings.paneHeader.newNote
        : searchCreationPlan
          ? (typeCreationLabel?.replace(/^New /u, 'New matching ') ?? 'New matching item')
          : activeCreationSearchQuery && searchCreationResolution && !searchCreationResolution.ok
            ? searchCreationResolution.reason
            : hasCreatableFileTypeSelection
              ? (typeCreationLabel ?? strings.paneHeader.newNote)
              : strings.paneHeader.newNote;
    const newItemTooltip = newItemLabel;
    const newItemIcon =
        effectiveCreationType === TPS_NAVIGATOR_TYPE_IDS.BASES
            ? 'lucide-database'
            : effectiveCreationType === TPS_NAVIGATOR_TYPE_IDS.CANVAS
              ? 'lucide-layout-grid'
              : resolveUXIcon(settings.interfaceIcons, 'list-new-note');
    const getRevealableActiveFile = useCallback((): TFile | null => {
        const activeFile = app.workspace.getActiveFile();
        return activeFile?.parent ? activeFile : null;
    }, [app.workspace]);
    const [canRevealFile, setCanRevealFile] = useState(() => (trackRevealFileAvailability ? Boolean(getRevealableActiveFile()) : false));

    const getSelectionSortTarget = useCallback((): SelectionSortTarget | null => {
        if (selectionState.selectionType === ItemType.FOLDER && selectionState.selectedFolder) {
            return { type: ItemType.FOLDER, key: selectionState.selectedFolder.path };
        }
        if (selectionState.selectionType === ItemType.TAG && selectionState.selectedTag) {
            return { type: ItemType.TAG, key: selectionState.selectedTag };
        }
        if (selectionState.selectionType === ItemType.PROPERTY && selectionState.selectedProperty) {
            return { type: ItemType.PROPERTY, key: selectionState.selectedProperty };
        }
        if (selectionState.selectionType === ItemType.TYPE && isTpsNavigatorStructuralTypeId(selectionState.selectedType)) {
            return { type: ItemType.TYPE, key: selectionState.selectedType };
        }
        return null;
    }, [
        selectionState.selectionType,
        selectionState.selectedFolder,
        selectionState.selectedTag,
        selectionState.selectedProperty,
        selectionState.selectedType
    ]);

    const handleNewFile = useCallback(
        async (presentationOrigin?: NotePresentationOrigin) => {
            try {
                const originArgs: [NotePresentationOrigin] | [] = presentationOrigin ? [presentationOrigin] : [];
                const selectedType = selectionState.selectedType;
                const fileCreationType =
                    searchCreationPlan && isTpsNavigatorCreatableFileTypeId(searchCreationPlan.typeId)
                        ? searchCreationPlan.typeId
                        : hasCreatableFileTypeSelection && isTpsNavigatorCreatableFileTypeId(selectedType)
                          ? selectedType
                          : null;
                if (fileCreationType) {
                    const createdFile = await createTpsNavigatorFileResource(fileCreationType, app.vault.getRoot(), fileSystemOps);
                    if (createdFile) {
                        selectionDispatch({ type: 'SET_SELECTED_FILE', file: createdFile });
                    }
                    return;
                }

                if (navigationCreationTarget) {
                    const newTab = legacyNewNoteTabPreference(app, settings.createNewNotesInNewTab);
                    const sourcePath = selectionState.selectedFile?.path ?? app.workspace.getActiveFile()?.path ?? '';
                    await createNoteForNavigationTarget(
                        app,
                        fileSystemOps,
                        navigationCreationTarget,
                        sourcePath,
                        newTab,
                        undefined,
                        ...originArgs
                    );
                    return;
                }
                if (activeCreationSearchQuery) {
                    return;
                }
                if (selectionState.selectionType === ItemType.TYPE) {
                    return;
                }

                const manualSortContext = getManualSortNewFileContext?.() ?? null;
                if (selectionState.selectedFolder) {
                    await fileSystemOps.createNewFile(
                        selectionState.selectedFolder,
                        legacyNewNoteTabPreference(app, settings.createNewNotesInNewTab),
                        manualSortContext,
                        ...originArgs
                    );
                    return;
                }

                if (hasCreatableTagSelection && selectionState.selectedTag) {
                    const sourcePath = selectionState.selectedFile?.path ?? app.workspace.getActiveFile()?.path ?? '';
                    await fileSystemOps.createNewFileForTag(
                        selectionState.selectedTag,
                        sourcePath,
                        legacyNewNoteTabPreference(app, settings.createNewNotesInNewTab),
                        manualSortContext,
                        ...originArgs
                    );
                    return;
                }

                if (hasCreatablePropertySelection && selectionState.selectedProperty) {
                    const sourcePath = selectionState.selectedFile?.path ?? app.workspace.getActiveFile()?.path ?? '';
                    await fileSystemOps.createNewFileForProperty(
                        selectionState.selectedProperty,
                        sourcePath,
                        legacyNewNoteTabPreference(app, settings.createNewNotesInNewTab),
                        manualSortContext,
                        ...originArgs
                    );
                }
            } catch {
                // Error is handled by FileSystemOperations with user notification
            }
        },
        [
            selectionState.selectedFolder,
            selectionState.selectedTag,
            selectionState.selectedProperty,
            selectionState.selectedFile,
            selectionState.selectedType,
            selectionState.selectionType,
            hasCreatableTagSelection,
            hasCreatablePropertySelection,
            hasCreatableFileTypeSelection,
            activeCreationSearchQuery,
            searchCreationPlan,
            navigationCreationTarget,
            settings.createNewNotesInNewTab,
            getManualSortNewFileContext,
            fileSystemOps,
            app,
            selectionDispatch
        ]
    );

    const handleRevealFile = useCallback(async () => {
        const activeFile = getRevealableActiveFile();
        if (!activeFile) {
            return;
        }

        if (onRevealFileInActualFolder && onResetSearchForNavigation) {
            return revealFileFromListUserAction({
                file: activeFile,
                revealFileInActualFolder: onRevealFileInActualFolder,
                onResetSearchForNavigation
            });
        }

        await plugin.revealFileInActualFolder(activeFile, { showHiddenFileNotice: true });
    }, [getRevealableActiveFile, onResetSearchForNavigation, onRevealFileInActualFolder, plugin]);

    const getSelectionSortOverride = useCallback((): ListSortOverrideValue | undefined => {
        return getListSortOverrideForSelection(
            settings,
            selectionState.selectionType,
            selectionState.selectedFolder,
            selectionState.selectedTag,
            selectionState.selectedProperty,
            selectionState.selectedType
        );
    }, [
        selectionState.selectionType,
        selectionState.selectedFolder,
        selectionState.selectedTag,
        selectionState.selectedProperty,
        selectionState.selectedType,
        settings
    ]);

    const getSelectionAppearanceOverride = useCallback((): ListPaneAppearance | undefined => {
        if (selectionState.selectionType === ItemType.FOLDER && selectionState.selectedFolder) {
            return settings.folderAppearances?.[selectionState.selectedFolder.path];
        }
        if (selectionState.selectionType === ItemType.TAG && selectionState.selectedTag) {
            return settings.tagAppearances?.[selectionState.selectedTag];
        }
        if (selectionState.selectionType === ItemType.PROPERTY && selectionState.selectedProperty) {
            return settings.propertyAppearances?.[selectionState.selectedProperty];
        }
        if (selectionState.selectionType === ItemType.TYPE && isTpsNavigatorStructuralTypeId(selectionState.selectedType)) {
            return settings.typeAppearances?.[selectionState.selectedType];
        }
        return undefined;
    }, [
        selectionState.selectionType,
        selectionState.selectedFolder,
        selectionState.selectedTag,
        selectionState.selectedProperty,
        selectionState.selectedType,
        settings.folderAppearances,
        settings.tagAppearances,
        settings.propertyAppearances,
        settings.typeAppearances
    ]);

    const getSelectionDescendantKeys = useCallback((): string[] => {
        // Bulk apply should use the live tree when the user confirms the action so
        // descendants without stored settings still receive the propagated override.
        if (selectionState.selectionType === ItemType.FOLDER && selectionState.selectedFolder) {
            return collectFolderDescendantPaths(selectionState.selectedFolder);
        }

        if (selectionState.selectionType === ItemType.TAG && selectionState.selectedTag) {
            if (selectionState.selectedTag === ALL_TAGS_TAG_ID || selectionState.selectedTag === TAGGED_TAG_ID) {
                return Array.from(tagTreeService?.getAllTagPaths() ?? []);
            }
            return Array.from(tagTreeService?.collectDescendantTagPaths(selectionState.selectedTag) ?? []);
        }

        if (selectionState.selectionType === ItemType.PROPERTY && selectionState.selectedProperty && propertyTreeService) {
            if (selectionState.selectedProperty === PROPERTIES_ROOT_VIRTUAL_FOLDER_ID) {
                return collectAllPropertyNodeIds(propertyTreeService);
            }
            return Array.from(propertyTreeService.collectDescendantNodeIds(selectionState.selectedProperty));
        }

        return [];
    }, [
        propertyTreeService,
        selectionState.selectionType,
        selectionState.selectedFolder,
        selectionState.selectedTag,
        selectionState.selectedProperty,
        tagTreeService
    ]);

    const isSelectionDescendantSettingKey = useCallback(
        (candidateKey: string): boolean => {
            if (selectionState.selectionType === ItemType.FOLDER && selectionState.selectedFolder) {
                return isFolderDescendantSettingKey(selectionState.selectedFolder.path, candidateKey);
            }

            if (selectionState.selectionType === ItemType.TAG && selectionState.selectedTag) {
                return isTagDescendantSettingKey(selectionState.selectedTag, candidateKey);
            }

            if (selectionState.selectionType === ItemType.PROPERTY && selectionState.selectedProperty) {
                return isPropertyDescendantSettingKey(selectionState.selectedProperty, candidateKey, propertyTreeService);
            }

            return false;
        },
        [
            selectionState.selectionType,
            selectionState.selectedFolder,
            selectionState.selectedTag,
            selectionState.selectedProperty,
            propertyTreeService
        ]
    );

    const getSelectionDescendantLabel = useCallback((): string => {
        if (selectionState.selectionType === ItemType.FOLDER) {
            return strings.paneHeader.subfolders;
        }
        if (selectionState.selectionType === ItemType.TAG) {
            return strings.paneHeader.subtags;
        }
        if (selectionState.selectionType === ItemType.PROPERTY) {
            if (selectionState.selectedProperty === PROPERTIES_ROOT_VIRTUAL_FOLDER_ID) {
                return strings.paneHeader.descendants;
            }
            return strings.paneHeader.childValues;
        }
        return strings.paneHeader.descendants;
    }, [selectionState.selectedProperty, selectionState.selectionType]);

    const selectionSortTarget = useMemo(() => getSelectionSortTarget(), [getSelectionSortTarget]);
    const selectionSortOverride = useMemo(() => getSelectionSortOverride(), [getSelectionSortOverride]);
    const selectionSortSpec = useMemo(
        () =>
            hasLineBackedTypeSelection
                ? resolveSourceBackedTypeListSort(settings, selectionSortOverride)
                : resolveListSort(settings, selectionSortOverride),
        [hasLineBackedTypeSelection, settings, selectionSortOverride]
    );
    const isSelectionManualSortActive = !hasLineBackedTypeSelection && isManualSortPropertyKey(settings, selectionSortSpec.propertyKey);
    const resolvePropertySortIcon = useCallback(
        (propertyKey: string): string | null => {
            const normalizedPropertyKey = casefold(propertyKey);
            if (!normalizedPropertyKey) {
                return null;
            }

            return metadataService.getPropertyIcon(buildPropertyKeyNodeId(normalizedPropertyKey)) ?? null;
        },
        [metadataService]
    );
    const getSortIcon = useCallback(() => {
        const sortIconId = getListSortToolbarIconId(settings, selectionSortOverride);
        if (isManualSortPropertyKey(settings, selectionSortSpec.propertyKey)) {
            return 'list-ordered';
        }
        if (sortIconId === 'list-sort-property') {
            const propertyIcon = resolvePropertySortIcon(selectionSortSpec.propertyKey);
            if (propertyIcon) {
                return propertyIcon;
            }
        }

        return resolveUXIcon(settings.interfaceIcons, sortIconId);
    }, [resolvePropertySortIcon, selectionSortOverride, selectionSortSpec.propertyKey, settings]);
    const selectionAppearanceOverride = useMemo(() => getSelectionAppearanceOverride(), [getSelectionAppearanceOverride]);
    const selectionAppearanceFields = useMemo(
        () => getStoredListPaneAppearanceFields(selectionAppearanceOverride),
        [selectionAppearanceOverride]
    );
    const hasSelectionAppearanceOverride = selectionAppearanceFields !== null;
    const groupingInfo = useMemo(
        () =>
            resolveListGrouping({
                settings,
                selectionType: selectionState.selectionType,
                folderPath: selectionState.selectedFolder ? selectionState.selectedFolder.path : null,
                tag: selectionState.selectedTag ?? null,
                propertyNodeId: selectionState.selectedProperty ?? null,
                typeId: selectionState.selectedType
            }),
        [
            settings,
            selectionState.selectedFolder,
            selectionState.selectedProperty,
            selectionState.selectedTag,
            selectionState.selectedType,
            selectionState.selectionType
        ]
    );
    const selectionGroupOverride = groupingInfo.normalizedOverride;
    const hasSelectionGroupOverride = groupingInfo.hasCustomOverride;
    const preserveAggregateGrouping = isAggregateNavigationSelection(selectionState);
    const effectiveSelectionGroupOverride =
        selectionGroupOverride === undefined
            ? undefined
            : resolveEffectiveListGroupingForSort({
                  groupBy: selectionGroupOverride,
                  sortOption: selectionSortSpec.option,
                  selectionType: selectionState.selectionType,
                  isManualSortActive: isSelectionManualSortActive,
                  preserveGroupingDuringManualSort: preserveAggregateGrouping
              });
    const selectionDescendantLabel = useMemo(() => getSelectionDescendantLabel(), [getSelectionDescendantLabel]);
    const [folderTreeVersion, setFolderTreeVersion] = useState(0);
    const [tagTreeVersion, setTagTreeVersion] = useState(0);
    const [propertyTreeVersion, setPropertyTreeVersion] = useState(0);

    useEffect(() => {
        const bumpFolderTreeVersion = (file: unknown) => {
            if (file instanceof TFolder) {
                setFolderTreeVersion(current => current + 1);
            }
        };

        const createRef = app.vault.on('create', bumpFolderTreeVersion);
        const deleteRef = app.vault.on('delete', bumpFolderTreeVersion);
        const renameRef = app.vault.on('rename', file => {
            bumpFolderTreeVersion(file);
        });

        return () => {
            app.vault.offref(createRef);
            app.vault.offref(deleteRef);
            app.vault.offref(renameRef);
        };
    }, [app.vault]);

    useEffect(() => {
        if (!tagTreeService) {
            return;
        }

        return tagTreeService.addTreeUpdateListener(() => {
            setTagTreeVersion(current => current + 1);
        });
    }, [tagTreeService]);

    useEffect(() => {
        if (!propertyTreeService) {
            return;
        }

        return propertyTreeService.addTreeUpdateListener(() => {
            setPropertyTreeVersion(current => current + 1);
        });
    }, [propertyTreeService]);

    useEffect(() => {
        if (!trackRevealFileAvailability) {
            setCanRevealFile(false);
            return;
        }

        const updateCanRevealFile = () => {
            setCanRevealFile(Boolean(getRevealableActiveFile()));
        };

        updateCanRevealFile();

        return registerActiveFileWorkspaceListeners({
            workspace: app.workspace,
            onChange: updateCanRevealFile
        });
    }, [app.workspace, getRevealableActiveFile, trackRevealFileAvailability]);

    // The descendant action follows a strict two-phase contract.
    // Phase 1 is menu construction: decide enabled/disabled from descendantCount plus
    // the saved settings record only. The menu must be disabled only when clicking it
    // would be a guaranteed no-op:
    // - there are no descendants
    // - the selected node is default and there are no saved descendant overrides
    // - the selected node has a saved override and every descendant already has that
    //   same saved override
    // Phase 2 uses the live tree to write or clear settings for every real descendant.
    // Sort and group confirms only when existing overrides change. Appearance always
    // confirms because creating new overrides can visibly change many descendants.
    const selectionDescendantCount = useMemo(() => {
        // These version counters exist only to invalidate the cached descendantCount
        // when folder/tag/property tree structure changes without changing the current selection id.
        void folderTreeVersion;
        void tagTreeVersion;
        void propertyTreeVersion;

        if (selectionState.selectionType === ItemType.FOLDER && selectionState.selectedFolder) {
            return countFolderDescendants(selectionState.selectedFolder);
        }

        if (selectionState.selectionType === ItemType.TAG && selectionState.selectedTag) {
            if (selectionState.selectedTag === ALL_TAGS_TAG_ID || selectionState.selectedTag === TAGGED_TAG_ID) {
                return tagTreeService?.getAllTagPaths().length ?? 0;
            }

            return tagTreeService?.collectDescendantTagPaths(selectionState.selectedTag).size ?? 0;
        }

        if (selectionState.selectionType === ItemType.PROPERTY && selectionState.selectedProperty && propertyTreeService) {
            if (selectionState.selectedProperty === PROPERTIES_ROOT_VIRTUAL_FOLDER_ID) {
                return collectAllPropertyNodeIds(propertyTreeService).length;
            }

            return propertyTreeService.collectDescendantNodeIds(selectionState.selectedProperty).size;
        }

        return 0;
    }, [
        folderTreeVersion,
        propertyTreeService,
        propertyTreeVersion,
        selectionState.selectedFolder,
        selectionState.selectedProperty,
        selectionState.selectedTag,
        selectionState.selectionType,
        tagTreeService,
        tagTreeVersion
    ]);
    // Keep the action available for selections that conceptually own descendants.
    // The actual disabled state is derived later from descendantCount plus saved settings.
    const canApplyToDescendants =
        !isAggregateNavigationSelection(selectionState) &&
        (hasFolderSelection || (hasTagSelection && selectionState.selectedTag !== UNTAGGED_TAG_ID) || hasPropertySelection);

    const removeSelectionSortOverride = useCallback(async () => {
        const target = getSelectionSortTarget();
        if (!target) {
            return;
        }
        if (target.type === ItemType.FOLDER) {
            await metadataService.removeFolderSortOverride(target.key);
            return;
        }
        if (target.type === ItemType.TAG) {
            await metadataService.removeTagSortOverride(target.key);
            return;
        }
        if (target.type === ItemType.PROPERTY) {
            await metadataService.removePropertySortOverride(target.key);
            return;
        }
        await updateSettings(current => {
            const overrides = getSortOverridesForTarget(current, target);
            delete overrides[target.key];
            setSortOverridesForTarget(current, target, overrides);
        });
    }, [getSelectionSortTarget, metadataService, updateSettings]);

    const setSelectionSortOverride = useCallback(
        async (sortOverride: ListSortOverrideValue) => {
            const target = getSelectionSortTarget();
            if (!target) {
                return;
            }
            if (target.type === ItemType.FOLDER) {
                await metadataService.setFolderSortOverride(target.key, sortOverride);
                return;
            }
            if (target.type === ItemType.TAG) {
                await metadataService.setTagSortOverride(target.key, sortOverride);
                return;
            }
            if (target.type === ItemType.PROPERTY) {
                await metadataService.setPropertySortOverride(target.key, sortOverride);
                return;
            }
            await updateSettings(current => {
                setSortOverrideForTarget(current, target, sortOverride);
            });
        },
        [getSelectionSortTarget, metadataService, updateSettings]
    );

    const setSelectionGroupOverride = useCallback(
        async (groupBy: ListNoteGroupingOption | undefined) => {
            const target = getSelectionSortTarget();
            if (!target) {
                return;
            }

            await updateSettings(current => {
                const next = getAppearancesForTarget(current, target);
                const currentAppearance = next[target.key];
                const normalizedAppearance = mergeAppearanceAndGroupingForTarget(currentAppearance, target, groupBy);

                if (normalizedAppearance) {
                    next[target.key] = normalizedAppearance;
                } else {
                    delete next[target.key];
                }

                setAppearancesForTarget(current, target, next);
            });
        },
        [getSelectionSortTarget, updateSettings]
    );

    const setMultiValueGrouping = useCallback(
        async (mode: MultiValueGrouping) => {
            const target = getSelectionSortTarget();
            if (!target) return;
            await updateSettings(current => {
                const next = getAppearancesForTarget(current, target);
                next[target.key] = { ...(next[target.key] ?? {}), multiValueGrouping: mode };
                setAppearancesForTarget(current, target, next);
            });
        },
        [getSelectionSortTarget, updateSettings]
    );

    const setNoValueGroupPosition = useCallback(
        async (position: NoValueGroupPosition) => {
            const target = getSelectionSortTarget();
            if (!target) return;
            await updateSettings(current => {
                const next = getAppearancesForTarget(current, target);
                next[target.key] = { ...(next[target.key] ?? {}), noValueGroupPosition: position };
                setAppearancesForTarget(current, target, next);
            });
        },
        [getSelectionSortTarget, updateSettings]
    );

    const setLinePropertyInheritance = useCallback(
        (inheritance: LinePropertyInheritance): void => {
            if (selectionState.selectionType !== ItemType.TYPE || !isTpsNavigatorStructuralTypeId(selectionState.selectedType)) {
                return;
            }
            const typeId = selectionState.selectedType;
            runAsyncAction(async () => {
                await updateSettings(current => {
                    const appearances = sanitizeRecord(ensureRecord(current.typeAppearances));
                    const existing = appearances[typeId] ?? {};
                    appearances[typeId] = { ...existing, linePropertyInheritance: inheritance };
                    current.typeAppearances = appearances;
                });
                app.workspace.requestSaveLayout();
            });
        },
        [app.workspace, selectionState.selectedType, selectionState.selectionType, updateSettings]
    );

    const openManualSortConfirm = useCallback(
        (propertyKey: string, affectedCount: number, onConfirm: () => Promise<void>) => {
            new ConfirmModal(
                app,
                strings.modals.manualSortConfirm.propertySortTitle,
                strings.modals.manualSortConfirm.propertySortMessage(propertyKey, affectedCount),
                onConfirm,
                strings.modals.manualSortConfirm.propertySortConfirmButton
            ).open();
        },
        [app]
    );

    const getManualSortInitialFiles = useCallback(
        (target: SelectionSortTarget, sortOverride?: ListSortOverrideValue): TFile[] => {
            const baselineSettings = getManualSortBaselineSettings(settings);
            if (sortOverride !== undefined) {
                setSortOverrideForTarget(baselineSettings, target, sortOverride);
            }

            if (target.type === ItemType.TYPE && isTpsNavigatorFileTypeId(selectionState.selectedType)) {
                return orderManualSortFiles(
                    collectFileBackedTypeFiles(
                        app,
                        getVisibleVaultFiles(baselineSettings, showHiddenItems, app),
                        selectionState.selectedType
                    )
                );
            }

            return orderManualSortFiles(
                getFilesForNavigationSelection(
                    {
                        selectionType: selectionState.selectionType,
                        selectedFolder: selectionState.selectedFolder,
                        selectedTag: selectionState.selectedTag,
                        selectedProperty: selectionState.selectedProperty,
                        selectedType: selectionState.selectedType
                    },
                    baselineSettings,
                    { includeDescendantNotes, showHiddenItems },
                    app,
                    tagTreeService,
                    propertyTreeService
                )
            );
        },
        [
            app,
            includeDescendantNotes,
            propertyTreeService,
            selectionState.selectedFolder,
            selectionState.selectedProperty,
            selectionState.selectedTag,
            selectionState.selectedType,
            selectionState.selectionType,
            settings,
            showHiddenItems,
            tagTreeService
        ]
    );

    const getManualSortPropertyRemovalFiles = useCallback((): TFile[] => {
        const baselineSettings = getManualSortBaselineSettings(settings);

        if (selectionState.selectionType === ItemType.TYPE && isTpsNavigatorFileTypeId(selectionState.selectedType)) {
            return collectFileBackedTypeFiles(
                app,
                getVisibleVaultFiles(baselineSettings, showHiddenItems, app),
                selectionState.selectedType
            );
        }

        return getFilesForNavigationSelection(
            {
                selectionType: selectionState.selectionType,
                selectedFolder: selectionState.selectedFolder,
                selectedTag: selectionState.selectedTag,
                selectedProperty: selectionState.selectedProperty,
                selectedType: selectionState.selectedType
            },
            baselineSettings,
            { includeDescendantNotes, showHiddenItems },
            app,
            tagTreeService,
            propertyTreeService,
            { orderResults: false }
        );
    }, [
        app,
        includeDescendantNotes,
        propertyTreeService,
        selectionState.selectedFolder,
        selectionState.selectedProperty,
        selectionState.selectedTag,
        selectionState.selectedType,
        selectionState.selectionType,
        settings,
        showHiddenItems,
        tagTreeService
    ]);

    const applyManualSortForProperty = useCallback(
        async (propertyKey: string, target: SelectionSortTarget) => {
            await updateSettings(current => {
                setSortOverrideForTarget(current, target, createListSortOverride('property-asc', propertyKey));

                const appearances = getAppearancesForTarget(current, target);
                // Manual sort is incompatible with property grouping, but preserves shared appearance
                // fields and TPS Type-only line-property inheritance.
                const normalizedAppearance = mergeAppearanceAndGroupingForTarget(appearances[target.key], target, undefined);

                if (normalizedAppearance) {
                    appearances[target.key] = normalizedAppearance;
                } else {
                    delete appearances[target.key];
                }

                setAppearancesForTarget(current, target, appearances);
            });

            app.workspace.requestSaveLayout();
        },
        [app.workspace, updateSettings]
    );

    const writeInitialManualSortOrder = useCallback(
        async (files: readonly TFile[], propertyKey: string): Promise<boolean> => {
            try {
                const result = await writeManualSortOrder(app, files, propertyKey);
                if (result.failed > 0) {
                    showNotice(
                        strings.dragDrop.errors.failedToSetProperty.replace('{error}', getLocalizedManualSortWriteFailureMessage(result)),
                        { variant: 'warning' }
                    );
                    return false;
                }
                return true;
            } catch (error) {
                showNotice(
                    strings.dragDrop.errors.failedToSetProperty.replace('{error}', getErrorMessage(error, strings.common.unknownError)),
                    { variant: 'warning' }
                );
                return false;
            }
        },
        [app]
    );

    const removeManualSortPropertyFromFiles = useCallback(
        async (files: readonly TFile[], propertyKey: string): Promise<void> => {
            try {
                const result = await removeManualSortProperty(app, files, propertyKey);
                if (result.updated > 0) {
                    const message =
                        result.updated === 1
                            ? strings.fileSystem.notifications.manualSortPropertyRemovedFromNote
                            : strings.fileSystem.notifications.manualSortPropertyRemovedFromNotes.replace(
                                  '{count}',
                                  result.updated.toString()
                              );
                    showNotice(message, { variant: 'success' });
                }
                if (result.failed > 0) {
                    showNotice(
                        strings.dragDrop.errors.failedToSetProperty.replace('{error}', getLocalizedManualSortWriteFailureMessage(result)),
                        { variant: 'warning' }
                    );
                }
            } catch (error) {
                showNotice(
                    strings.dragDrop.errors.failedToSetProperty.replace('{error}', getErrorMessage(error, strings.common.unknownError)),
                    { variant: 'warning' }
                );
            }
        },
        [app]
    );

    const promptRemoveManualSortProperty = useCallback(
        (propertyKey: string, files: readonly TFile[], affectedCount: number) => {
            if (!isValidManualSortPropertyKey(propertyKey) || affectedCount === 0) {
                return;
            }

            new ConfirmModal(
                app,
                strings.modals.manualSortConfirm.removePropertyTitle,
                strings.modals.manualSortConfirm.removePropertyMessage(propertyKey, affectedCount),
                async () => {
                    await removeManualSortPropertyFromFiles(files, propertyKey);
                },
                strings.modals.manualSortConfirm.removePropertyConfirmButton
            ).open();
        },
        [app, removeManualSortPropertyFromFiles]
    );

    const applyManualSortMode = useCallback(async () => {
        const normalizedPropertyKey = getManualSortPropertyKey(settings);
        const target = getSelectionSortTarget();
        if (!target || !isValidManualSortPropertyKey(normalizedPropertyKey)) {
            return;
        }

        const currentSortSpec = resolveListSort(settings, selectionSortOverride);
        const isCurrentManualSort = isManualSortPropertyKey(settings, currentSortSpec.propertyKey);
        const initialFiles = getManualSortInitialFiles(target, selectionSortOverride);
        const propertyStats = getManualSortPropertyStats(app, initialFiles, normalizedPropertyKey);
        const allMarkdownFilesHaveValidManualSortRanks =
            propertyStats.markdownCount > 0 && propertyStats.validRankCount === propertyStats.markdownCount;
        const hasInvalidManualSortProperty = propertyStats.invalidPropertyCount > 0;
        const shouldInitializeManualSort = !isCurrentManualSort && propertyStats.markdownCount > 0 && propertyStats.validRankCount === 0;
        const shouldConfirmManualSort =
            !isCurrentManualSort &&
            !allMarkdownFilesHaveValidManualSortRanks &&
            (hasInvalidManualSortProperty || settings.confirmBeforeManualSort);
        const applyManualSort = async () => {
            if (shouldInitializeManualSort) {
                const didWriteInitialOrder = await writeInitialManualSortOrder(initialFiles, normalizedPropertyKey);
                if (!didWriteInitialOrder) {
                    return;
                }
            }

            await applyManualSortForProperty(normalizedPropertyKey, target);
        };

        if (shouldConfirmManualSort) {
            openManualSortConfirm(normalizedPropertyKey, propertyStats.markdownCount, applyManualSort);
            return;
        }

        await applyManualSort();
    }, [
        app,
        applyManualSortForProperty,
        getManualSortInitialFiles,
        getSelectionSortTarget,
        openManualSortConfirm,
        selectionSortOverride,
        settings,
        writeInitialManualSortOrder
    ]);

    const getDescendantSortAndGroupChangeStats = useCallback((): DescendantApplyStats => {
        const target = selectionSortTarget;
        if (!target) {
            return buildDescendantApplyStats({
                descendantCount: 0,
                descendantEntries: [],
                hasCurrentOverride: false,
                matchesCurrentOverride: () => false
            });
        }

        const sortOverrides =
            target.type === ItemType.FOLDER
                ? settings.folderSortOverrides
                : target.type === ItemType.TAG
                  ? settings.tagSortOverrides
                  : settings.propertySortOverrides;
        const appearances =
            target.type === ItemType.FOLDER
                ? settings.folderAppearances
                : target.type === ItemType.TAG
                  ? settings.tagAppearances
                  : settings.propertyAppearances;

        const sortEntries = Object.entries(sortOverrides ?? {}).filter(([key]) => isSelectionDescendantSettingKey(key));
        const groupEntries = Object.entries(appearances ?? {}).filter(
            ([key, descendantAppearance]) => isSelectionDescendantSettingKey(key) && descendantAppearance.groupBy !== undefined
        );
        const sortByKey = new Map(sortEntries);
        const groupByKey = new Map(groupEntries.map(([key, appearance]) => [key, appearance.groupBy]));
        const savedKeys = new Set([...sortByKey.keys(), ...groupByKey.keys()]);
        // One descendant can have both sort and group changes; confirmation counts each key once.
        const changedSavedKeys = new Set<string>();
        const missingRequiredKeys = new Set<string>();
        const matchingSavedKeys = new Set<string>();
        const hasCurrentSortOverride = selectionSortOverride !== undefined;
        const hasCurrentGroupOverride = effectiveSelectionGroupOverride !== undefined;

        savedKeys.forEach(key => {
            let changed = false;
            let missingRequired = false;

            if (hasCurrentSortOverride) {
                if (!sortByKey.has(key)) {
                    missingRequired = true;
                } else if (!areListSortOverridesEqual(sortByKey.get(key), selectionSortOverride)) {
                    changed = true;
                }
            } else if (sortByKey.has(key)) {
                changed = true;
            }

            if (effectiveSelectionGroupOverride !== undefined) {
                const savedGroupBy = groupByKey.get(key);
                if (savedGroupBy === undefined) {
                    missingRequired = true;
                } else if (!areListGroupingOptionsEqual(savedGroupBy, effectiveSelectionGroupOverride)) {
                    changed = true;
                }
            } else if (groupByKey.has(key)) {
                changed = true;
            }

            if (changed) {
                changedSavedKeys.add(key);
            }
            if (missingRequired) {
                missingRequiredKeys.add(key);
            }
            if (!changed && !missingRequired) {
                matchingSavedKeys.add(key);
            }
        });

        const missingUnsavedDescendantCount =
            hasCurrentSortOverride || hasCurrentGroupOverride ? Math.max(selectionDescendantCount - savedKeys.size, 0) : 0;
        const missingSavedDescendantCount = missingRequiredKeys.size + missingUnsavedDescendantCount;
        const affectedSavedKeys = new Set([...changedSavedKeys, ...missingRequiredKeys]);
        const affectedCount = affectedSavedKeys.size + missingUnsavedDescendantCount;

        return {
            descendantCount: selectionDescendantCount,
            savedDescendantCount: savedKeys.size,
            matchingSavedDescendantCount: matchingSavedKeys.size,
            changedSavedDescendantCount: changedSavedKeys.size,
            missingSavedDescendantCount,
            affectedCount,
            disabled: selectionDescendantCount === 0 || affectedCount === 0
        };
    }, [
        isSelectionDescendantSettingKey,
        selectionDescendantCount,
        effectiveSelectionGroupOverride,
        selectionSortOverride,
        selectionSortTarget,
        settings.folderAppearances,
        settings.folderSortOverrides,
        settings.propertyAppearances,
        settings.propertySortOverrides,
        settings.tagAppearances,
        settings.tagSortOverrides
    ]);

    const applySortAndGroupToDescendants = useCallback(async () => {
        const target = selectionSortTarget;
        if (!target) {
            return;
        }

        const selectionDescendantKeys = getSelectionDescendantKeys();
        if (selectionDescendantKeys.length === 0) {
            return;
        }

        await updateSettings(current => {
            const sortOverrides =
                target.type === ItemType.FOLDER
                    ? sanitizeRecord(ensureRecord(current.folderSortOverrides))
                    : target.type === ItemType.TAG
                      ? sanitizeRecord(ensureRecord(current.tagSortOverrides))
                      : sanitizeRecord(ensureRecord(current.propertySortOverrides));
            selectionDescendantKeys.forEach(key => {
                if (selectionSortOverride !== undefined) {
                    sortOverrides[key] = cloneListSortOverride(selectionSortOverride);
                    return;
                }
                delete sortOverrides[key];
            });

            if (target.type === ItemType.FOLDER) {
                current.folderSortOverrides = sortOverrides;
            } else if (target.type === ItemType.TAG) {
                current.tagSortOverrides = sortOverrides;
            } else {
                current.propertySortOverrides = sortOverrides;
            }

            const appearances =
                target.type === ItemType.FOLDER
                    ? sanitizeRecord(ensureRecord(current.folderAppearances))
                    : target.type === ItemType.TAG
                      ? sanitizeRecord(ensureRecord(current.tagAppearances))
                      : sanitizeRecord(ensureRecord(current.propertyAppearances));
            selectionDescendantKeys.forEach(key => {
                const normalizedAppearance = mergeListPaneAppearanceAndGrouping(
                    getStoredListPaneAppearanceFields(appearances[key]),
                    effectiveSelectionGroupOverride
                );
                if (normalizedAppearance) {
                    appearances[key] = normalizedAppearance;
                    return;
                }
                delete appearances[key];
            });

            if (target.type === ItemType.FOLDER) {
                current.folderAppearances = appearances;
                return;
            }
            if (target.type === ItemType.TAG) {
                current.tagAppearances = appearances;
                return;
            }
            current.propertyAppearances = appearances;
        });
        app.workspace.requestSaveLayout();
    }, [app, effectiveSelectionGroupOverride, getSelectionDescendantKeys, selectionSortOverride, selectionSortTarget, updateSettings]);

    const promptApplySortAndGroupToDescendants = useCallback(() => {
        const target = selectionSortTarget;
        if (!target) {
            return;
        }

        // Keep the prompt path on the same fast path as the menu: cached descendantCount
        // plus saved settings only. The only live tree walk happens inside applySortAndGroupToDescendants.
        const stats = getDescendantSortAndGroupChangeStats();

        if (stats.disabled) {
            return;
        }

        if (stats.changedSavedDescendantCount === 0) {
            // Only new descendant overrides will be created here. There is nothing to
            // overwrite or delete, so skip the confirmation modal and apply directly.
            runAsyncAction(async () => {
                await applySortAndGroupToDescendants();
            });
            return;
        }

        const title = strings.modals.bulkApply.applySortAndGroupTitle(selectionDescendantLabel);
        // The modal count reports only existing descendant overrides that will be
        // deleted or overwritten. Missing descendants that receive new overrides
        // are intentionally excluded from this number.
        const message = strings.modals.bulkApply.affectedCountMessage(stats.changedSavedDescendantCount);

        new ConfirmModal(
            app,
            title,
            message,
            async () => {
                await applySortAndGroupToDescendants();
            },
            strings.modals.bulkApply.applyButton,
            { confirmButtonClass: 'mod-cta' }
        ).open();
    }, [app, applySortAndGroupToDescendants, getDescendantSortAndGroupChangeStats, selectionDescendantLabel, selectionSortTarget]);

    const getDescendantAppearanceChangeStats = useCallback(
        (liveDescendantKeys?: readonly string[]) => {
            const target = selectionSortTarget;
            if (!target) {
                return buildDescendantApplyStats({
                    descendantCount: 0,
                    descendantEntries: [],
                    hasCurrentOverride: false,
                    matchesCurrentOverride: () => false
                });
            }

            const appearances =
                target.type === ItemType.FOLDER
                    ? settings.folderAppearances
                    : target.type === ItemType.TAG
                      ? settings.tagAppearances
                      : settings.propertyAppearances;

            const liveDescendantKeySet = liveDescendantKeys ? new Set(liveDescendantKeys) : null;
            const descendantEntries = Object.entries(appearances ?? {}).filter(([key, descendantAppearance]) => {
                const isDescendant = liveDescendantKeySet ? liveDescendantKeySet.has(key) : isSelectionDescendantSettingKey(key);
                return isDescendant && hasStoredListPaneAppearanceOverride(descendantAppearance);
            });

            return buildDescendantApplyStats({
                descendantCount: liveDescendantKeySet?.size ?? selectionDescendantCount,
                descendantEntries,
                hasCurrentOverride: hasSelectionAppearanceOverride,
                matchesCurrentOverride: ([, descendantAppearance]) =>
                    hasSelectionAppearanceOverride &&
                    selectionAppearanceOverride !== undefined &&
                    areStoredListPaneAppearanceFieldsEqual(descendantAppearance, selectionAppearanceOverride)
            });
        },
        [
            hasSelectionAppearanceOverride,
            isSelectionDescendantSettingKey,
            selectionAppearanceOverride,
            selectionDescendantCount,
            selectionSortTarget,
            settings.folderAppearances,
            settings.propertyAppearances,
            settings.tagAppearances
        ]
    );

    const applyAppearanceToDescendants = useCallback(async () => {
        const target = selectionSortTarget;
        if (!target) {
            return;
        }

        const selectionDescendantKeys = getSelectionDescendantKeys();
        if (selectionDescendantKeys.length === 0) {
            return;
        }

        await updateSettings(current => {
            const next = sanitizeRecord(
                ensureRecord(
                    target.type === ItemType.FOLDER
                        ? current.folderAppearances
                        : target.type === ItemType.TAG
                          ? current.tagAppearances
                          : current.propertyAppearances
                )
            );
            selectionDescendantKeys.forEach(key => {
                const normalizedAppearance = mergeListPaneAppearanceAndGrouping(
                    hasSelectionAppearanceOverride ? selectionAppearanceFields : null,
                    next[key]?.groupBy
                );
                if (normalizedAppearance) {
                    next[key] = normalizedAppearance;
                    return;
                }
                delete next[key];
            });

            if (target.type === ItemType.FOLDER) {
                current.folderAppearances = next;
            } else if (target.type === ItemType.TAG) {
                current.tagAppearances = next;
            } else {
                current.propertyAppearances = next;
            }
        });
        app.workspace.requestSaveLayout();
    }, [app, getSelectionDescendantKeys, hasSelectionAppearanceOverride, selectionAppearanceFields, selectionSortTarget, updateSettings]);

    const promptApplyAppearanceToDescendants = useCallback(() => {
        const target = selectionSortTarget;
        if (!target) {
            return;
        }

        // Menu enablement uses cached tree counts, while the confirmation promises concrete
        // counts and therefore intersects saved overrides with descendants that currently exist.
        const stats = getDescendantAppearanceChangeStats(getSelectionDescendantKeys());

        if (stats.disabled) {
            return;
        }

        // Every bulk appearance change is confirmed because creating overrides can visibly change many
        // descendants even when none of them has a saved customization yet.
        const title = hasSelectionAppearanceOverride
            ? strings.modals.bulkApply.applyAppearanceTitle(selectionDescendantLabel)
            : strings.modals.bulkApply.resetAppearanceTitle(selectionDescendantLabel);
        const message = hasSelectionAppearanceOverride
            ? strings.modals.bulkApply.applyAppearanceMessage(stats.affectedCount, stats.changedSavedDescendantCount)
            : strings.modals.bulkApply.resetAppearanceMessage(stats.affectedCount);

        new ConfirmModal(
            app,
            title,
            message,
            async () => {
                await applyAppearanceToDescendants();
            },
            strings.modals.bulkApply.applyButton,
            { confirmButtonClass: 'mod-cta' }
        ).open();
    }, [
        app,
        applyAppearanceToDescendants,
        getDescendantAppearanceChangeStats,
        getSelectionDescendantKeys,
        hasSelectionAppearanceOverride,
        selectionDescendantLabel,
        selectionSortTarget
    ]);

    const handleAppearanceMenu = useCallback(
        (event: React.MouseEvent) => {
            if (!hasAppearanceOrSortSelection) {
                return;
            }

            showListPaneAppearanceMenu({
                event: event.nativeEvent,
                settings,
                selectedFolder: selectionState.selectedFolder,
                selectedTag: selectionState.selectedTag,
                selectedProperty: selectionState.selectedProperty,
                selectedType: selectionState.selectedType,
                selectionType: selectionState.selectionType,
                updateSettings,
                descendantAction: canApplyToDescendants
                    ? {
                          menuTitle: hasSelectionAppearanceOverride
                              ? strings.paneHeader.applyAppearanceToDescendants(selectionDescendantLabel)
                              : strings.paneHeader.resetAppearanceInDescendants(selectionDescendantLabel),
                          onApply: promptApplyAppearanceToDescendants,
                          disabled: getDescendantAppearanceChangeStats().disabled
                      }
                    : undefined,
                defaultSettingsAction: {
                    menuTitle: strings.folderAppearance.openPluginSettings,
                    onOpen: openDefaultListAppearanceSettings
                }
            });
        },
        [
            canApplyToDescendants,
            getDescendantAppearanceChangeStats,
            hasAppearanceOrSortSelection,
            hasSelectionAppearanceOverride,
            openDefaultListAppearanceSettings,
            promptApplyAppearanceToDescendants,
            selectionDescendantLabel,
            settings,
            selectionState.selectedFolder,
            selectionState.selectedTag,
            selectionState.selectedProperty,
            selectionState.selectedType,
            selectionState.selectionType,
            updateSettings
        ]
    );

    const handleSortMenu = useCallback(
        (event: React.MouseEvent) => {
            if (!hasAppearanceOrSortSelection) {
                return;
            }

            const menu = new Menu();
            const currentSortSpec = hasLineBackedTypeSelection
                ? resolveSourceBackedTypeListSort(settings, selectionSortOverride)
                : resolveListSort(settings, selectionSortOverride);
            const defaultSortSpec = hasLineBackedTypeSelection ? resolveSourceBackedTypeListSort(settings) : resolveListSort(settings);
            const currentSort = currentSortSpec.option;
            const currentDirection = getSortDirection(currentSort);
            const currentField = getSortField(currentSort);
            const defaultDirection = getSortDirection(defaultSortSpec.option);
            const defaultField = getSortField(defaultSortSpec.option);
            const manualSortPropertyKey = getManualSortPropertyKey(settings);
            const propertySortKeys = getAvailablePropertySortKeys(settings);
            const supportsManualSort = !hasLineBackedTypeSelection;
            const hasManualSortPropertyKey = supportsManualSort && isValidManualSortPropertyKey(manualSortPropertyKey);
            const manualSortPropertyFiles = hasManualSortPropertyKey && selectionSortTarget ? getManualSortPropertyRemovalFiles() : [];
            const manualSortPropertyCount = hasManualSortPropertyKey
                ? countMarkdownFilesWithManualSortProperty(app, manualSortPropertyFiles, manualSortPropertyKey)
                : 0;
            const isPropertySortActive = currentField === 'property';
            const isManualSortActive =
                supportsManualSort && isPropertySortActive && isManualSortPropertyKey(settings, currentSortSpec.propertyKey);
            const sortFieldLabels: Record<SortField, string> = {
                modified: strings.settings.items.defaultSortOrder.fields.dateEdited,
                created: strings.settings.items.defaultSortOrder.fields.dateCreated,
                title: strings.settings.items.defaultSortOrder.fields.title,
                filename: strings.settings.items.defaultSortOrder.fields.fileName,
                property: strings.settings.items.defaultSortOrder.fields.property
            };
            const sortDirectionLabels: Record<SortDirection, string> = {
                asc: strings.settings.items.defaultSortOrder.directions.asc,
                desc: strings.settings.items.defaultSortOrder.directions.desc
            };
            const getSortFieldLabel = (field: SortField, propertyKey?: string): string => {
                if (field === 'property') {
                    const trimmedPropertyKey = propertyKey?.trim();
                    return trimmedPropertyKey
                        ? `${sortFieldLabels.property} \u2018${isolateBidiText(trimmedPropertyKey)}\u2019`
                        : sortFieldLabels.property;
                }

                return sortFieldLabels[field];
            };
            const withDefaultSuffix = (label: string, isDefault: boolean): string =>
                isDefault ? `${label} ${strings.folderAppearance.defaultSuffix}` : label;
            const getSortFieldMenuIcon = (field: SortField, propertyKey?: string): string => {
                if (field === 'property') {
                    const propertyMenuIcon = resolveIconForMenu(resolvePropertySortIcon(propertyKey ?? ''));
                    if (propertyMenuIcon) {
                        return propertyMenuIcon;
                    }
                }

                return resolveUXIconForMenu(settings.interfaceIcons, getListSortFieldIconId(field));
            };
            const defaultSortOverride = createListSortOverride(defaultSortSpec.option, defaultSortSpec.propertyKey);
            // Field and direction share one persisted value, so an override is removed only when
            // the complete selection matches the default. Comparing either component alone would
            // also reset the other component when its default-marked entry is clicked.
            const applySort = (field: SortField, direction: SortDirection, propertyKey?: string) => {
                const option = buildSortOption(field, direction);
                const selectedSort = createListSortOverride(option, propertyKey);
                const nextOverride = resolveListSortOverrideForDefault(selectedSort, defaultSortOverride);
                runAsyncAction(async () => {
                    if (nextOverride === undefined) {
                        await removeSelectionSortOverride();
                    } else {
                        await setSelectionSortOverride(nextOverride);
                    }
                    app.workspace.requestSaveLayout();
                });
            };
            // Field changes start dates with newest first and text/property fields in ascending
            // order. The direction entries below remain available as explicit overrides.
            const applySortField = (field: SortField, propertyKey?: string) => {
                applySort(field, getSortDirectionForFieldChange(field), propertyKey);
            };
            const hasSelectionSortOverride = selectionSortOverride !== undefined;
            const isViewUsingDefaults = !hasSelectionSortOverride && !hasSelectionGroupOverride;

            menu.addItem(item => {
                item.setTitle(strings.folderAppearance.sortBy).setIcon('lucide-arrow-up-down').setDisabled(true);
            });

            (['modified', 'created', 'title', 'filename'] as const).forEach(field => {
                const isDefaultField = defaultField === field;
                const isCurrentField = currentField === field;
                menu.addItem(item => {
                    item.setTitle(withDefaultSuffix(getSortFieldLabel(field), isDefaultField))
                        .setIcon(getSortFieldMenuIcon(field))
                        .setChecked(isCurrentField)
                        .onClick(() => {
                            if (isCurrentField) {
                                return;
                            }
                            applySortField(field);
                        });
                });
            });

            propertySortKeys.forEach(propertyKey => {
                const isDefaultField = defaultField === 'property' && samePropertySortKey(defaultSortSpec.propertyKey, propertyKey);
                const isCurrentField = currentField === 'property' && samePropertySortKey(currentSortSpec.propertyKey, propertyKey);
                menu.addItem(item => {
                    item.setTitle(withDefaultSuffix(getSortFieldLabel('property', propertyKey), isDefaultField))
                        .setIcon(getSortFieldMenuIcon('property', propertyKey))
                        .setChecked(isCurrentField)
                        .onClick(() => {
                            if (isCurrentField) {
                                return;
                            }
                            applySortField('property', propertyKey);
                        });
                });
            });

            // Without configured property keys the property sort entries above render nothing, so a
            // disabled placeholder keeps the feature visible, matching the disabled manual sort entry.
            if (propertySortKeys.length === 0) {
                menu.addItem(item => {
                    item.setTitle(getSortFieldLabel('property')).setIcon(getSortFieldMenuIcon('property')).setDisabled(true);
                });
            }

            menu.addSeparator();

            (['asc', 'desc'] as const).forEach(direction => {
                const isDefaultDirection = defaultDirection === direction;
                menu.addItem(item => {
                    const option = buildSortOption(currentField, direction);
                    item.setTitle(withDefaultSuffix(sortDirectionLabels[direction], isDefaultDirection))
                        .setIcon(getSortIconName(option))
                        .setDisabled(isManualSortActive)
                        .setChecked(currentDirection === direction)
                        .onClick(() => {
                            if (isManualSortActive) {
                                return;
                            }
                            applySort(currentField, direction, currentField === 'property' ? currentSortSpec.propertyKey : undefined);
                        });
                });
            });

            if (supportsManualSort) {
                menu.addSeparator();

                // The manual sort toggle and its actions sit in their own separated cluster after the
                // direction entries because those entries apply to the sort fields but not to manual sort.
                // Manual sort never carries a default marker: reconciliation prevents the default sort
                // from resolving to the manual-sort property, so this entry always stores an override.
                menu.addItem(item => {
                    item.setTitle(strings.paneHeader.manualSort)
                        .setIcon('lucide-list-ordered')
                        .setDisabled(!hasManualSortPropertyKey)
                        .setChecked(isManualSortActive)
                        .onClick(() => {
                            if (!hasManualSortPropertyKey) {
                                return;
                            }
                            runAsyncAction(applyManualSortMode);
                        });
                });

                menu.addItem(item => {
                    item.setTitle(strings.paneHeader.editSortOrder)
                        .setIcon('lucide-list-ordered')
                        .setDisabled(!isManualSortActive || !onManualSortStart)
                        .onClick(() => {
                            if (!isManualSortActive || !onManualSortStart) {
                                return;
                            }
                            onManualSortStart(currentSortSpec.propertyKey);
                        });
                });

                menu.addItem(item => {
                    item.setTitle(strings.paneHeader.removeSortProperty)
                        .setIcon('lucide-eraser')
                        .setDisabled(manualSortPropertyCount === 0)
                        .onClick(() => {
                            if (manualSortPropertyCount === 0) {
                                return;
                            }
                            promptRemoveManualSortProperty(manualSortPropertyKey, manualSortPropertyFiles, manualSortPropertyCount);
                        });
                });
            }

            menu.addSeparator();

            menu.addItem(item => {
                item.setTitle(strings.folderAppearance.groupBy).setIcon('lucide-layers').setDisabled(true);
            });

            const effectiveCurrentGroup = resolveEffectiveListGroupingForSort({
                groupBy: groupingInfo.effectiveGrouping,
                sortOption: currentSort,
                selectionType: selectionState.selectionType,
                isManualSortActive,
                preserveGroupingDuringManualSort: preserveAggregateGrouping
            });
            const effectiveMenuGroup = normalizePropertyGroupingSourceForMenu(effectiveCurrentGroup, canChooseLinePropertySource);
            const isGroupOptionDisabled = (option: ListNoteGroupingOption): boolean =>
                isManualSortActive || (option === 'date' && !isDateSortOption(currentSort));
            // Group property and order share one persisted value, matching the composite handling
            // above for sort field and direction.
            const applyGrouping = (option: ListNoteGroupingOption) => {
                const nextOverride = resolveListGroupingOverrideForDefault(option, groupingInfo.defaultGrouping);
                runAsyncAction(async () => {
                    await setSelectionGroupOverride(nextOverride);
                    app.workspace.requestSaveLayout();
                });
            };
            const addGroupOptionItem = (option: ListNoteGroupingOption, title: string, icon: string, isDisabled: boolean): void => {
                // Same-kind comparison marks the default property entry even when only the current
                // order differs; persistence still compares the complete grouping value.
                const isDefaultGroupKind = areListGroupingOptionsSameKind(option, groupingInfo.defaultGrouping);
                menu.addItem(item => {
                    // Same-kind comparison keeps a property entry checked when only its group order direction differs.
                    item.setTitle(`    ${withDefaultSuffix(title, isDefaultGroupKind)}`)
                        .setIcon(icon)
                        .setDisabled(isDisabled)
                        .setChecked(areListGroupingOptionsSameKind(effectiveMenuGroup, option))
                        .onClick(() => {
                            if (isDisabled) {
                                return;
                            }
                            applyGrouping(option);
                        });
                });
            };

            // None keeps the sorted list flat, while Custom and Date annotate it with headers.
            (['none', 'custom', 'date'] as const).forEach(option => {
                addGroupOptionItem(
                    option,
                    strings.settings.items.defaultGrouping.options[option],
                    getGroupingIcon(option),
                    isGroupOptionDisabled(option)
                );
            });

            if (hasFolderSelection) {
                addGroupOptionItem(
                    'folder',
                    strings.settings.items.defaultGrouping.options.folder,
                    getGroupingIcon('folder'),
                    isGroupOptionDisabled('folder')
                );
            }

            if (!hasLineBackedTypeSelection) {
                addGroupOptionItem('tags', strings.tagList.tags, getGroupingIcon('tags'), isManualSortActive && !preserveAggregateGrouping);
            }

            // The configured grouping properties provide the grouping choices, mirroring the sort field list above.
            // Switching the grouping property keeps the current group order, matching Obsidian Bases.
            const effectiveGroupPropertyKey = getPropertyGroupingKey(effectiveMenuGroup);
            const effectiveGroupOrder = getPropertyGroupingOrder(effectiveMenuGroup) ?? 'follow';
            const propertyValueGranularity = getPropertyGroupingGranularity(effectiveMenuGroup) === 'path' ? 'path' : 'value';
            const defaultNewPropertySource = canChooseLinePropertySource ? 'line' : 'note';
            const selectedPropertyKey =
                hasPropertySelection && selectionState.selectedProperty
                    ? (parsePropertyNodeId(selectionState.selectedProperty)?.key ?? null)
                    : null;
            const propertyGroupKeys = getAvailablePropertyGroupKeys(settings);
            if (selectedPropertyKey && !propertyGroupKeys.some(propertyKey => casefold(propertyKey) === casefold(selectedPropertyKey))) {
                propertyGroupKeys.push(selectedPropertyKey);
            }
            propertyGroupKeys.forEach(propertyKey => {
                addGroupOptionItem(
                    createPropertyGroupingOption(propertyKey, effectiveGroupOrder, propertyValueGranularity, defaultNewPropertySource),
                    getSortFieldLabel('property', propertyKey),
                    getSortFieldMenuIcon('property', propertyKey),
                    isManualSortActive && !preserveAggregateGrouping
                );
                if (canChooseDayPropertyGrouping) {
                    addGroupOptionItem(
                        createPropertyGroupingOption(propertyKey, effectiveGroupOrder, 'day', defaultNewPropertySource),
                        `${getSortFieldLabel('property', propertyKey)} · ${strings.settings.items.defaultGrouping.options.date}`,
                        'lucide-calendar-days',
                        isManualSortActive && !preserveAggregateGrouping
                    );
                }
            });

            // Without configured property keys the property grouping entries above render nothing, so a
            // disabled placeholder keeps the feature visible, matching the disabled manual sort entry.
            if (propertyGroupKeys.length === 0) {
                menu.addItem(item => {
                    item.setTitle(`    ${getSortFieldLabel('property')}`)
                        .setIcon(getSortFieldMenuIcon('property'))
                        .setDisabled(true);
                });
            }

            // Group order applies only to property grouping; date and folder groups keep their fixed order.
            if (effectiveGroupPropertyKey !== null) {
                const effectiveGroupGranularity = getPropertyGroupingGranularity(effectiveMenuGroup) ?? 'value';
                const effectiveGroupSource = getPropertyGroupingSource(effectiveMenuGroup) ?? defaultNewPropertySource;
                if (effectiveGroupGranularity !== 'day' && !hasLineBackedTypeSelection) {
                    menu.addSeparator();
                    menu.addItem(item => item.setTitle('Property values').setIcon('lucide-list-tree').setDisabled(true));
                    (
                        [
                            ['value', 'Flat values'],
                            ['path', 'Nested values']
                        ] as const
                    ).forEach(([granularity, label]) => {
                        menu.addItem(item => {
                            item.setTitle(`    ${label}`)
                                .setChecked(effectiveGroupGranularity === granularity)
                                .onClick(() => {
                                    if (effectiveGroupGranularity === granularity) return;
                                    applyGrouping(
                                        createPropertyGroupingOption(
                                            effectiveGroupPropertyKey,
                                            effectiveGroupOrder,
                                            granularity,
                                            effectiveGroupSource
                                        )
                                    );
                                });
                        });
                    });
                }
                menu.addSeparator();
                // The default marker follows the default grouping's order independent of its
                // property key, matching how the sort menu marks its default direction.
                const defaultGroupOrder = getPropertyGroupingOrder(groupingInfo.defaultGrouping);
                const groupOrderLabels: Record<PropertyGroupingOrder, string> = {
                    follow: strings.settings.items.defaultGroupingDirection.options.follow,
                    asc: sortDirectionLabels.asc,
                    desc: sortDirectionLabels.desc
                };
                const groupOrderIcons: Record<PropertyGroupingOrder, string> = {
                    follow: 'lucide-arrow-up-down',
                    asc: 'lucide-sort-asc',
                    desc: 'lucide-sort-desc'
                };
                (['follow', 'asc', 'desc'] as const).forEach(order => {
                    const orderOption = createPropertyGroupingOption(
                        effectiveGroupPropertyKey,
                        order,
                        effectiveGroupGranularity,
                        effectiveGroupSource
                    );
                    const isDefaultOrder = defaultGroupOrder === order;
                    menu.addItem(item => {
                        item.setTitle(`    ${withDefaultSuffix(groupOrderLabels[order], isDefaultOrder)}`)
                            .setIcon(groupOrderIcons[order])
                            .setChecked(effectiveGroupOrder === order)
                            .onClick(() => {
                                // Re-clicking the checked order keeps the current grouping property and order unchanged.
                                if (effectiveGroupOrder === order) {
                                    return;
                                }
                                applyGrouping(orderOption);
                            });
                    });
                });
            }

            // Property and tag grouping can both fan one note into multiple groups and
            // both retain a distinct bucket for notes without a visible value.
            if (effectiveGroupPropertyKey !== null || effectiveMenuGroup === 'tags') {
                menu.addSeparator();
                menu.addItem(item => item.setTitle('Multi-value grouping').setIcon('lucide-layers-3').setDisabled(true));
                const currentMultiValueGrouping = resolveMultiValueGrouping(
                    selectionState.selectionType === ItemType.FOLDER
                        ? settings.folderAppearances?.[selectionState.selectedFolder?.path ?? '']?.multiValueGrouping
                        : selectionState.selectionType === ItemType.TAG
                          ? settings.tagAppearances?.[selectionState.selectedTag ?? '']?.multiValueGrouping
                          : selectionState.selectionType === ItemType.PROPERTY
                            ? settings.propertyAppearances?.[selectionState.selectedProperty ?? '']?.multiValueGrouping
                            : selectionState.selectedType && isTpsNavigatorStructuralTypeId(selectionState.selectedType)
                              ? settings.typeAppearances?.[selectionState.selectedType]?.multiValueGrouping
                              : undefined
                );
                (
                    [
                        ['separate', 'Show an instance in each group'],
                        ['combine', 'Combine values into one group']
                    ] as const
                ).forEach(([mode, title]) => {
                    menu.addItem(item =>
                        item
                            .setTitle(`    ${title}`)
                            .setChecked(currentMultiValueGrouping === mode)
                            .onClick(() => {
                                runAsyncAction(async () => {
                                    await setMultiValueGrouping(mode);
                                    app.workspace.requestSaveLayout();
                                });
                            })
                    );
                });
                menu.addSeparator();
                menu.addItem(item =>
                    item.setTitle('No value group position').setIcon('lucide-align-vertical-space-around').setDisabled(true)
                );
                const selectedNoValueGroupPosition =
                    selectionState.selectionType === ItemType.FOLDER
                        ? settings.folderAppearances?.[selectionState.selectedFolder?.path ?? '']?.noValueGroupPosition
                        : selectionState.selectionType === ItemType.TAG
                          ? settings.tagAppearances?.[selectionState.selectedTag ?? '']?.noValueGroupPosition
                          : selectionState.selectionType === ItemType.PROPERTY
                            ? settings.propertyAppearances?.[selectionState.selectedProperty ?? '']?.noValueGroupPosition
                            : selectionState.selectedType && isTpsNavigatorStructuralTypeId(selectionState.selectedType)
                              ? settings.typeAppearances?.[selectionState.selectedType]?.noValueGroupPosition
                              : undefined;
                const currentNoValueGroupPosition =
                    selectedNoValueGroupPosition !== undefined
                        ? resolveNoValueGroupPosition(selectedNoValueGroupPosition)
                        : isAggregateNavigationSelection(selectionState)
                          ? settings.showCurrentFolderFilesAtBottom
                              ? 'bottom'
                              : 'top'
                          : resolveNoValueGroupPosition(undefined);
                (['top', 'bottom'] as const).forEach(position => {
                    menu.addItem(item =>
                        item
                            .setTitle(`    ${position === 'top' ? 'Top' : 'Bottom'}`)
                            .setChecked(currentNoValueGroupPosition === position)
                            .onClick(() => {
                                runAsyncAction(async () => {
                                    await setNoValueGroupPosition(position);
                                    app.workspace.requestSaveLayout();
                                });
                            })
                    );
                });
            }

            if (hasLineBackedTypeSelection) {
                const linePropertyInheritance = resolveLinePropertyInheritance(
                    selectionState.selectedType && isTpsNavigatorStructuralTypeId(selectionState.selectedType)
                        ? settings.typeAppearances?.[selectionState.selectedType]?.linePropertyInheritance
                        : undefined
                );
                menu.addSeparator();
                menu.addItem(item => {
                    item.setTitle('Property inheritance (sort and group)').setIcon('lucide-git-merge').setDisabled(true);
                });
                (
                    [
                        ['none', 'Do not inherit note properties'],
                        ['note-first', 'Inherit and prioritize note properties'],
                        ['line-first', 'Inherit note properties but prioritize line properties'],
                        ['combine', 'Inherit and combine properties']
                    ] as const
                ).forEach(([inheritance, title]) => {
                    menu.addItem(item => {
                        item.setTitle(`    ${title}`)
                            .setIcon(
                                inheritance === 'none'
                                    ? 'lucide-list-filter'
                                    : inheritance === 'combine'
                                      ? 'lucide-merge'
                                      : inheritance === 'note-first'
                                        ? 'lucide-file-text'
                                        : 'lucide-list-tree'
                            )
                            .setChecked(linePropertyInheritance === inheritance)
                            .onClick(() => setLinePropertyInheritance(inheritance));
                    });
                });
            }

            if (canApplyToDescendants) {
                menu.addSeparator();
                menu.addItem(item => {
                    const descendantStats = getDescendantSortAndGroupChangeStats();
                    item.setTitle(strings.paneHeader.applySortAndGroupToDescendants(selectionDescendantLabel))
                        .setIcon('lucide-squares-unite')
                        .setDisabled(descendantStats.disabled)
                        .onClick(() => {
                            promptApplySortAndGroupToDescendants();
                        });
                });
            }

            menu.addSeparator();
            menu.addItem(item => {
                item.setTitle(strings.paneHeader.resetViewToDefaults)
                    .setIcon('lucide-rotate-ccw')
                    .setDisabled(isViewUsingDefaults)
                    .onClick(() => {
                        if (isViewUsingDefaults) {
                            return;
                        }

                        runAsyncAction(async () => {
                            if (hasSelectionSortOverride) {
                                await removeSelectionSortOverride();
                            }
                            if (hasSelectionGroupOverride) {
                                await setSelectionGroupOverride(undefined);
                            }
                            app.workspace.requestSaveLayout();
                        });
                    });
            });
            menu.addSeparator();
            menu.addItem(item => {
                item.setTitle(strings.settings.changeDefaultSettings)
                    .setIcon('lucide-settings')
                    .onClick(() => {
                        openDefaultListSettings();
                    });
            });

            menu.showAtMouseEvent(event.nativeEvent);
        },
        [
            canApplyToDescendants,
            canChooseDayPropertyGrouping,
            canChooseLinePropertySource,
            hasAppearanceOrSortSelection,
            hasFolderSelection,
            hasLineBackedTypeSelection,
            hasPropertySelection,
            hasSelectionGroupOverride,
            app,
            applyManualSortMode,
            getDescendantSortAndGroupChangeStats,
            getManualSortPropertyRemovalFiles,
            groupingInfo.defaultGrouping,
            groupingInfo.effectiveGrouping,
            openDefaultListSettings,
            promptApplySortAndGroupToDescendants,
            promptRemoveManualSortProperty,
            preserveAggregateGrouping,
            removeSelectionSortOverride,
            resolvePropertySortIcon,
            selectionDescendantLabel,
            selectionSortTarget,
            selectionSortOverride,
            selectionState,
            setSelectionGroupOverride,
            setMultiValueGrouping,
            setNoValueGroupPosition,
            setLinePropertyInheritance,
            setSelectionSortOverride,
            settings,
            onManualSortStart
        ]
    );

    /**
     * Toggles the display of notes from descendants.
     * When enabling descendants, automatically selects the active file if it's within the current folder/tag hierarchy.
     */
    const handleToggleDescendants = useCallback(() => {
        if (!getDescendantVisibilityTarget(selectionState)) {
            return;
        }
        const wasShowingDescendants = includeDescendantNotes;
        const activeFile = app.workspace.getActiveFile();
        const next = !wasShowingDescendants;

        runAsyncAction(async () => {
            await updateSettings(current => {
                setSelectionIncludeDescendants(current, selectionState, next);
            });

            // When enabling descendants, retain an active file that becomes part of this folder's list.
            if (next && selectionState.selectedFolder && !selectionState.selectedFile && activeFile) {
                const filesInFolder = getFilesForFolder(
                    selectionState.selectedFolder,
                    settings,
                    { includeDescendantNotes: true, showHiddenItems },
                    app
                );

                if (filesInFolder.some(f => f.path === activeFile.path)) {
                    selectionDispatch({ type: 'SET_SELECTED_FILE', file: activeFile });
                }
            }
        });
    }, [updateSettings, includeDescendantNotes, showHiddenItems, selectionState, app, selectionDispatch, settings]);

    const hasCustomSortOrGroup = selectionSortOverride !== undefined || hasSelectionGroupOverride;

    const hasMeaningfulOverrides = (appearance: ListPaneAppearance | undefined) => hasStoredListPaneAppearanceOverride(appearance);

    // Check if folder, tag, or property has custom appearance settings
    const hasCustomAppearance =
        (hasFolderSelection &&
            selectionState.selectedFolder &&
            hasMeaningfulOverrides(settings.folderAppearances?.[selectionState.selectedFolder.path])) ||
        (hasTagSelection && selectionState.selectedTag && hasMeaningfulOverrides(settings.tagAppearances?.[selectionState.selectedTag])) ||
        (hasPropertySelection &&
            selectionState.selectedProperty &&
            hasMeaningfulOverrides(settings.propertyAppearances?.[selectionState.selectedProperty])) ||
        (hasFileBackedTypeSelection &&
            isTpsNavigatorFileTypeId(selectionState.selectedType) &&
            hasMeaningfulOverrides(settings.typeAppearances?.[selectionState.selectedType]));

    const activeFileVisibility = useMemo(() => {
        return findVaultProfileById(vaultProfiles, vaultProfileId).fileVisibility;
    }, [vaultProfileId, vaultProfiles]);

    const descendantsTooltip = useMemo(() => {
        const showNotes = activeFileVisibility === FILE_VISIBILITY.DOCUMENTS;

        if (selectionState.selectionType === ItemType.TAG) {
            return showNotes ? strings.paneHeader.showNotesFromDescendants : strings.paneHeader.showFilesFromDescendants;
        }

        if (selectionState.selectionType === ItemType.PROPERTY) {
            return showNotes ? strings.paneHeader.showNotesFromDescendants : strings.paneHeader.showFilesFromDescendants;
        }

        if (selectionState.selectionType === ItemType.FOLDER) {
            return showNotes ? strings.paneHeader.showNotesFromSubfolders : strings.paneHeader.showFilesFromSubfolders;
        }

        return showNotes ? strings.paneHeader.showNotesFromSubfolders : strings.paneHeader.showFilesFromSubfolders;
    }, [activeFileVisibility, selectionState.selectionType]);

    return {
        handleNewFile,
        canCreateNewFile,
        newItemLabel,
        newItemTooltip,
        newItemIcon,
        hasActiveCreationSearch: Boolean(activeCreationSearchQuery),
        handleRevealFile,
        canRevealFile,
        handleAppearanceMenu,
        handleSortMenu,
        handleToggleDescendants,
        getSortIcon,
        hasAppearanceOrSortSelection,
        hasCustomSortOrGroup,
        hasCustomAppearance,
        descendantsTooltip
    };
}
