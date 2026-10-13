import {
    getPropertyNote,
    usePropertyNoteIndex,
    resolvePropertyNoteFromIndex,
    openPropertyNoteFile,
    revealPropertyNoteInNavigator
} from '../utils/propertyNotes';
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

import React, { useCallback, useMemo } from 'react';
import { useSelectionDispatch, useSelectionState } from '../context/SelectionContext';
import { useCommandQueue, useServices } from '../context/ServicesContext';
import { useSettingsState } from '../context/SettingsContext';
import { useFileCache } from '../context/StorageContext';
import { useSelectedFolderFileVersion } from '../hooks/useSelectedFolderFileVersion';
import { useTagNoteIndex } from '../hooks/useTagNoteIndex';
import { ItemType } from '../types';
import { runAsyncAction } from '../utils/async';
import { getFolderNote, openFolderNoteFile, revealFolderNoteInNavigator } from '../utils/folderNotes';
import { resolveFolderNoteClickOpenContext } from '../utils/keyboardOpenContext';
import { findTagNode } from '../utils/tagTree';
import { getTagNote, resolveTagNoteFromIndex } from '../utils/tagNotes';
import { openTagNoteFile, revealTagNoteInNavigator } from '../utils/tagNoteNavigation';
import { NavigationNoteLink, type NavigationNoteActivationEvent } from './NavigationNoteLink';

interface ListPaneTitleAreaProps {
    desktopTitle: string;
}

export const ListPaneTitleArea = React.memo(function ListPaneTitleArea({ desktopTitle }: ListPaneTitleAreaProps) {
    const { app, plugin } = useServices();
    const commandQueue = useCommandQueue();
    const settings = useSettingsState();
    const selectionState = useSelectionState();
    const selectionDispatch = useSelectionDispatch();
    const { fileData } = useFileCache();

    // Folder note interactions only apply when a folder is selected.
    const selectedFolder = selectionState.selectionType === ItemType.FOLDER ? selectionState.selectedFolder : null;
    // Recomputes folder note lookup when files in the selected folder change.
    const selectedFolderFileVersion = useSelectedFolderFileVersion(
        app.vault,
        selectedFolder,
        settings.enableFolderNotes && settings.enableFolderNoteLinks,
        { metadataCache: app.metadataCache }
    );
    // Resolves the note file that represents the selected folder.
    const selectedFolderNote = useMemo(() => {
        void selectedFolderFileVersion;

        if (!selectedFolder || !settings.enableFolderNotes || !settings.enableFolderNoteLinks) {
            return null;
        }

        return getFolderNote(
            selectedFolder,
            {
                enableFolderNotes: settings.enableFolderNotes,
                folderNoteNamePattern: settings.folderNoteNamePattern
            },
            app.metadataCache
        );
    }, [
        app.metadataCache,
        selectedFolder,
        settings.enableFolderNotes,
        settings.enableFolderNoteLinks,
        settings.folderNoteNamePattern,
        selectedFolderFileVersion
    ]);
    const selectedTag = selectionState.selectionType === ItemType.TAG ? selectionState.selectedTag : null;
    const selectedTagNode = selectedTag ? findTagNode(fileData.tagTree, selectedTag) : null;
    const selectedTagDisplayPath = selectedTagNode?.displayPath ?? selectedTag;
    const tagNoteIndex = useTagNoteIndex(app, Boolean(selectedTag && settings.enableFolderNotes && settings.enableFolderNoteLinks));
    const selectedTagNote = useMemo(() => {
        if (!selectedTag || !selectedTagDisplayPath || !tagNoteIndex) {
            return null;
        }

        return resolveTagNoteFromIndex(tagNoteIndex, selectedTag, selectedTagDisplayPath).file;
    }, [selectedTag, selectedTagDisplayPath, tagNoteIndex]);

    const selectedProperty = selectionState.selectionType === ItemType.PROPERTY ? selectionState.selectedProperty : null;
    const propertyNoteIndex = usePropertyNoteIndex(
        app,
        Boolean(selectedProperty && settings.enableFolderNotes && settings.enableFolderNoteLinks)
    );
    const selectedPropertyNote =
        selectedProperty && propertyNoteIndex ? resolvePropertyNoteFromIndex(propertyNoteIndex, selectedProperty) : null;

    const handleFolderNoteClick = useCallback(
        (event: NavigationNoteActivationEvent) => {
            if (!selectedFolder || !selectedFolderNote) {
                return;
            }

            // Prevents parent title-area click handlers from running.
            event.stopPropagation();

            const openContext = resolveFolderNoteClickOpenContext(event, settings.folderNoteOpenLocation, settings.multiSelectModifier);
            revealFolderNoteInNavigator(selectionDispatch, selectedFolderNote);

            runAsyncAction(() =>
                openFolderNoteFile({
                    app,
                    commandQueue,
                    folder: selectedFolder,
                    folderNote: selectedFolderNote,
                    context: openContext,
                    openInRightSidebar: folderNote => plugin.openFolderNoteInRightSidebar(folderNote)
                })
            );
        },
        [
            selectedFolder,
            selectedFolderNote,
            settings.folderNoteOpenLocation,
            settings.multiSelectModifier,
            app,
            commandQueue,
            plugin,
            selectionDispatch
        ]
    );

    const handleFolderNoteMouseDown = useCallback(
        (event: React.MouseEvent<HTMLSpanElement>) => {
            if (event.button !== 1 || !selectedFolder || !selectedFolderNote) {
                return;
            }

            // Middle-click always opens folder notes in a new tab.
            event.preventDefault();
            event.stopPropagation();
            revealFolderNoteInNavigator(selectionDispatch, selectedFolderNote);

            runAsyncAction(() =>
                openFolderNoteFile({
                    app,
                    commandQueue,
                    folder: selectedFolder,
                    folderNote: selectedFolderNote,
                    context: 'tab'
                })
            );
        },
        [selectedFolder, selectedFolderNote, app, commandQueue, selectionDispatch]
    );

    const handleTagNoteClick = useCallback(
        (event: NavigationNoteActivationEvent) => {
            if (!selectedTag || !selectedTagDisplayPath) {
                return;
            }
            const currentTagNote = getTagNote(app, selectedTag, selectedTagDisplayPath);
            if (!currentTagNote) {
                return;
            }

            event.stopPropagation();
            const openContext = resolveFolderNoteClickOpenContext(event, settings.folderNoteOpenLocation, settings.multiSelectModifier);
            revealTagNoteInNavigator(selectionDispatch, currentTagNote, selectedTag);
            runAsyncAction(() =>
                openTagNoteFile({
                    app,
                    commandQueue,
                    tagNote: currentTagNote,
                    context: openContext,
                    openInRightSidebar: tagNote => plugin.openFolderNoteInRightSidebar(tagNote)
                })
            );
        },
        [
            app,
            commandQueue,
            plugin,
            selectedTag,
            selectedTagDisplayPath,
            selectionDispatch,
            settings.folderNoteOpenLocation,
            settings.multiSelectModifier
        ]
    );

    const handleTagNoteMouseDown = useCallback(
        (event: React.MouseEvent<HTMLSpanElement>) => {
            if (event.button !== 1 || !selectedTag || !selectedTagDisplayPath) {
                return;
            }
            const currentTagNote = getTagNote(app, selectedTag, selectedTagDisplayPath);
            if (!currentTagNote) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            revealTagNoteInNavigator(selectionDispatch, currentTagNote, selectedTag);
            runAsyncAction(() => openTagNoteFile({ app, commandQueue, tagNote: currentTagNote, context: 'tab' }));
        },
        [app, commandQueue, selectedTag, selectedTagDisplayPath, selectionDispatch]
    );

    const handlePropertyNoteClick = useCallback(
        (event: NavigationNoteActivationEvent) => {
            if (!selectedProperty) {
                return;
            }
            const currentPropertyNote = getPropertyNote(app, selectedProperty);
            if (!currentPropertyNote) {
                return;
            }

            event.stopPropagation();
            const openContext = resolveFolderNoteClickOpenContext(event, settings.folderNoteOpenLocation, settings.multiSelectModifier);
            revealPropertyNoteInNavigator(selectionDispatch, currentPropertyNote, selectedProperty);
            runAsyncAction(() =>
                openPropertyNoteFile({
                    app,
                    commandQueue,
                    propertyNote: currentPropertyNote,
                    context: openContext,
                    openInRightSidebar: propertyNote => plugin.openFolderNoteInRightSidebar(propertyNote)
                })
            );
        },
        [app, commandQueue, plugin, selectedProperty, selectionDispatch, settings.folderNoteOpenLocation, settings.multiSelectModifier]
    );

    const handlePropertyNoteMouseDown = useCallback(
        (event: React.MouseEvent<HTMLSpanElement>) => {
            if (event.button !== 1 || !selectedProperty) {
                return;
            }
            const currentPropertyNote = getPropertyNote(app, selectedProperty);
            if (!currentPropertyNote) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            revealPropertyNoteInNavigator(selectionDispatch, currentPropertyNote, selectedProperty);
            runAsyncAction(() => openPropertyNoteFile({ app, commandQueue, propertyNote: currentPropertyNote, context: 'tab' }));
        },
        [app, commandQueue, selectedProperty, selectionDispatch]
    );

    const selectedNavigationNote = selectedFolderNote ?? selectedTagNote ?? selectedPropertyNote;
    const handleNavigationNoteClick = selectedFolderNote
        ? handleFolderNoteClick
        : selectedTagNote
          ? handleTagNoteClick
          : handlePropertyNoteClick;
    const handleNavigationNoteMouseDown = selectedFolderNote
        ? handleFolderNoteMouseDown
        : selectedTagNote
          ? handleTagNoteMouseDown
          : handlePropertyNoteMouseDown;

    return (
        <div className="nn-list-title-area">
            <div className="nn-list-title-content">
                <span className="nn-list-title-text">
                    {selectedNavigationNote ? (
                        <NavigationNoteLink
                            className="nn-list-title-label nn-list-title-label--folder-note"
                            onActivate={handleNavigationNoteClick}
                            onMouseDown={handleNavigationNoteMouseDown}
                        >
                            {desktopTitle}
                        </NavigationNoteLink>
                    ) : (
                        <span className="nn-list-title-label">{desktopTitle}</span>
                    )}
                </span>
            </div>
        </div>
    );
});
