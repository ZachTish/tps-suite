/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { useMemo } from 'react';
import { useSettingsState } from '../context/SettingsContext';
import { useNavigationSelection } from '../context/SelectionContext';
import {
    resolveListPaneAppearance,
    resolveMultiValueGrouping,
    resolveNoValueGroupPosition,
    type ListPaneAppearanceSettings
} from '../settings/listPaneAppearance';
import { ALL_TAGS_TAG_ID, ItemType } from '../types';
import { resolveNavigationSelectionDefaultGrouping } from '../utils/listGrouping';
import { parsePropertyNodeId } from '../utils/propertyTree';
import { isTpsNavigatorLineTypeId, isTpsNavigatorStructuralTypeId } from '../types/navigatorTypes';

export {
    getDefaultListMode,
    isLinePropertyInheritance,
    isMultiValueGrouping,
    isNoValueGroupPosition,
    resolveLinePropertyInheritance,
    resolveMultiValueGrouping,
    resolveNoValueGroupPosition
} from '../settings/listPaneAppearance';
export type {
    FolderAppearance,
    LinePropertyInheritance,
    ListPaneAppearanceSettings,
    MultiValueGrouping,
    NoValueGroupPosition,
    TagAppearance
} from '../settings/listPaneAppearance';

/** Resolves inherited per-selection appearance and TPS-only line grouping options. */
export function useListPaneAppearance(): ListPaneAppearanceSettings {
    const settings = useSettingsState();
    const { selectedFolder, selectedTag, selectedProperty, selectedType, selectionType } = useNavigationSelection();
    const selectedFolderPath = selectionType === ItemType.FOLDER ? (selectedFolder?.path ?? null) : null;
    const selectedTagPath = selectionType === ItemType.TAG ? selectedTag : null;
    const selectedPropertyNodeId = selectionType === ItemType.PROPERTY ? selectedProperty : null;
    const selectedStructuralTypeId = selectionType === ItemType.TYPE && isTpsNavigatorStructuralTypeId(selectedType) ? selectedType : null;
    const isSelectedLineType = isTpsNavigatorLineTypeId(selectedStructuralTypeId);
    const selectedAppearance =
        selectedFolderPath !== null
            ? settings.folderAppearances?.[selectedFolderPath]
            : selectedTagPath !== null
              ? settings.tagAppearances?.[selectedTagPath]
              : selectedPropertyNodeId !== null
                ? settings.propertyAppearances?.[selectedPropertyNodeId]
                : selectedStructuralTypeId !== null
                  ? settings.typeAppearances?.[selectedStructuralTypeId]
                  : undefined;
    return useMemo(() => {
        // Exact source-line rows keep their file-row presentation contract. Their stored appearance
        // still controls grouping, while mode and content toggles remain file-only.
        const presentationAppearance =
            isSelectedLineType && selectedAppearance ? { groupBy: selectedAppearance.groupBy } : selectedAppearance;
        const defaultGrouping = resolveNavigationSelectionDefaultGrouping({
            noteGrouping: settings.noteGrouping,
            selectionType,
            tag: selectedTagPath,
            propertyNodeId: selectedPropertyNodeId
        });
        const resolved = resolveListPaneAppearance({ settings, appearance: presentationAppearance, selectionType, defaultGrouping });
        const automaticAggregateGrouping =
            (selectionType === ItemType.TAG && selectedTagPath === ALL_TAGS_TAG_ID) ||
            (selectionType === ItemType.PROPERTY &&
                selectedPropertyNodeId !== null &&
                parsePropertyNodeId(selectedPropertyNodeId)?.valuePath === null);
        return {
            ...resolved,
            multiValueGrouping: resolveMultiValueGrouping(selectedAppearance?.multiValueGrouping),
            noValueGroupPosition:
                selectedAppearance?.noValueGroupPosition !== undefined
                    ? resolveNoValueGroupPosition(selectedAppearance.noValueGroupPosition)
                    : automaticAggregateGrouping
                      ? settings.showCurrentFolderFilesAtBottom
                          ? 'bottom'
                          : 'top'
                      : resolveNoValueGroupPosition(undefined)
        };
    }, [isSelectedLineType, selectedAppearance, selectedPropertyNodeId, selectedTagPath, selectionType, settings]);
}
