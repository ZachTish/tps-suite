import type { TFolder } from 'obsidian';

import type { NotebookNavigatorSettings } from '../settings/types';
import { ALL_TAGS_TAG_ID, ItemType, type NavigationItemType } from '../types';
import { parsePropertyNodeId, type PropertySelectionNodeId } from './propertyTree';
import { ensureRecord, sanitizeRecord } from './recordUtils';

export interface DescendantVisibilitySelection {
    selectionType: NavigationItemType | null | undefined;
    selectedFolder?: TFolder | null;
    selectedFolderPath?: string | null;
    selectedTag?: string | null;
    selectedProperty?: PropertySelectionNodeId | null;
}

interface DescendantVisibilityTarget {
    recordKey: 'folderAppearances' | 'tagAppearances' | 'propertyAppearances';
    key: string;
}

/** Aggregate navigation rows define a complete scope, so descendants do not alter their results. */
export function isAggregateNavigationSelection(selection: DescendantVisibilitySelection): boolean {
    if (selection.selectionType === ItemType.TAG) {
        return selection.selectedTag === ALL_TAGS_TAG_ID;
    }

    if (selection.selectionType === ItemType.PROPERTY && selection.selectedProperty) {
        return parsePropertyNodeId(selection.selectedProperty)?.valuePath === null;
    }

    return false;
}

/** Resolves the persisted appearance record that owns one list scope's descendant preference. */
export function getDescendantVisibilityTarget(selection: DescendantVisibilitySelection): DescendantVisibilityTarget | null {
    if (isAggregateNavigationSelection(selection)) {
        return null;
    }

    if (selection.selectionType === ItemType.FOLDER) {
        const path = selection.selectedFolder?.path ?? selection.selectedFolderPath ?? null;
        return path ? { recordKey: 'folderAppearances', key: path } : null;
    }
    if (selection.selectionType === ItemType.TAG && selection.selectedTag) {
        return { recordKey: 'tagAppearances', key: selection.selectedTag };
    }
    if (selection.selectionType === ItemType.PROPERTY && selection.selectedProperty) {
        return { recordKey: 'propertyAppearances', key: selection.selectedProperty };
    }
    return null;
}

/** Uses an explicit list-scope choice when present, otherwise the user's global default. */
export function resolveSelectionIncludeDescendants(
    settings: NotebookNavigatorSettings,
    selection: DescendantVisibilitySelection,
    defaultIncludeDescendants: boolean
): boolean {
    const target = getDescendantVisibilityTarget(selection);
    if (!target) {
        return defaultIncludeDescendants;
    }

    const override = settings[target.recordKey]?.[target.key]?.includeDescendants;
    return typeof override === 'boolean' ? override : defaultIncludeDescendants;
}

/** Stores one scope's choice without changing the descendant default used by other views. */
export function setSelectionIncludeDescendants(
    settings: NotebookNavigatorSettings,
    selection: DescendantVisibilitySelection,
    includeDescendants: boolean
): boolean {
    const target = getDescendantVisibilityTarget(selection);
    if (!target) {
        return false;
    }

    const appearances = sanitizeRecord(ensureRecord(settings[target.recordKey]));
    appearances[target.key] = {
        ...(appearances[target.key] ?? {}),
        includeDescendants: Boolean(includeDescendants)
    };
    settings[target.recordKey] = appearances;
    return true;
}
