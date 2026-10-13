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

import React, { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Menu, TFile } from 'obsidian';
import type { NotebookNavigatorSettings } from '../../settings/types';
import type { ExpansionAction } from '../../context/ExpansionContext';
import type { SelectionAction, SelectionState } from '../../context/SelectionContext';
import type { UIAction } from '../../context/UIStateContext';
import { strings } from '../../i18n';
import { runAsyncAction } from '../../utils/async';
import { resolveUXIconForMenu } from '../../utils/uxIcons';
import {
    buildFileMenu,
    buildFolderMenu,
    buildPropertyMenu,
    buildTagMenu,
    type MenuDispatchers,
    type MenuServices,
    type MenuState
} from '../../utils/contextMenu';
import { addShortcutRenameMenuItem } from '../../utils/contextMenu/shortcutRenameMenuItem';
import type { ShortcutContextMenuTarget } from './navigationPaneShortcutTypes';
import type { RevealFileOptions } from '../useNavigatorReveal';
import { getTagNote } from '../../utils/tagNotes';

interface ExpansionStateLike {
    expandedFolders: Set<string>;
    expandedTags: Set<string>;
    expandedProperties: Set<string>;
}

interface UseNavigationPaneShortcutMenusProps {
    settings: NotebookNavigatorSettings;
    menuServices: MenuServices;
    selectionStateRef: MutableRefObject<SelectionState>;
    expansionState: ExpansionStateLike;
    selectionDispatch: Dispatch<SelectionAction>;
    expansionDispatch: Dispatch<ExpansionAction>;
    uiDispatch: Dispatch<UIAction>;
    removeShortcut: (key: string) => Promise<boolean>;
    renameShortcut: (key: string, alias: string, defaultLabel?: string) => Promise<boolean>;
    onRevealFileInActualFolder: (file: TFile, options?: RevealFileOptions) => boolean;
    onResetSearchForNavigation: () => void;
    setIsShortcutContextMenuOpen: Dispatch<SetStateAction<boolean>>;
}

export function useNavigationPaneShortcutMenus({
    settings,
    menuServices,
    selectionStateRef,
    expansionState,
    selectionDispatch,
    expansionDispatch,
    uiDispatch,
    removeShortcut,
    renameShortcut,
    onRevealFileInActualFolder,
    onResetSearchForNavigation,
    setIsShortcutContextMenuOpen
}: UseNavigationPaneShortcutMenusProps) {
    const handleShortcutContextMenu = useCallback(
        (event: React.MouseEvent<HTMLDivElement>, target: ShortcutContextMenuTarget) => {
            if (!settings.showShortcuts) {
                return;
            }

            const targetElement = event.target;
            if (targetElement instanceof HTMLElement && targetElement.closest('.nn-drag-handle')) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const menu = new Menu();
            menu.onHide(() => {
                setIsShortcutContextMenuOpen(false);
            });
            setIsShortcutContextMenuOpen(true);

            if (target.type === 'search') {
                addShortcutRenameMenuItem({
                    app: menuServices.app,
                    menu,
                    shortcutKey: target.key,
                    defaultLabel: target.searchShortcut.name,
                    existingShortcut: target.searchShortcut,
                    title: strings.shortcuts.rename,
                    placeholder: strings.searchInput.shortcutNamePlaceholder,
                    renameShortcut,
                    closeOnSubmit: false
                });

                menu.addItem(item => {
                    item.setTitle(strings.shortcuts.remove)
                        .setIcon(resolveUXIconForMenu(settings.interfaceIcons, 'nav-shortcuts', 'lucide-star-off'))
                        .onClick(() => {
                            runAsyncAction(() => removeShortcut(target.key));
                        });
                });
                menu.showAtMouseEvent(event.nativeEvent);
                return;
            }

            if (target.type === 'missing') {
                menu.addItem(item => {
                    item.setTitle(strings.shortcuts.remove)
                        .setIcon(resolveUXIconForMenu(settings.interfaceIcons, 'nav-shortcuts', 'lucide-star-off'))
                        .onClick(() => {
                            runAsyncAction(() => removeShortcut(target.key));
                        });
                });
                menu.showAtMouseEvent(event.nativeEvent);
                return;
            }

            const state: MenuState = {
                selectionState: selectionStateRef.current,
                expandedFolders: expansionState.expandedFolders,
                expandedTags: expansionState.expandedTags,
                expandedProperties: expansionState.expandedProperties
            };
            const dispatchers: MenuDispatchers = {
                selectionDispatch,
                expansionDispatch,
                uiDispatch
            };

            const tagNote =
                target.type === 'tag' &&
                settings.enableFolderNotes &&
                settings.enableFolderNoteLinks &&
                targetElement instanceof HTMLElement &&
                targetElement.closest('.nn-navitem-name')
                    ? getTagNote(menuServices.app, target.tagPath)
                    : null;

            if (tagNote) {
                buildFileMenu({
                    file: tagNote,
                    menu,
                    services: menuServices,
                    settings,
                    state,
                    dispatchers,
                    options: { onRevealFileInActualFolder, onResetSearchForNavigation }
                });
            } else if (target.type === 'folder') {
                buildFolderMenu({
                    folder: target.folder,
                    menu,
                    services: menuServices,
                    settings,
                    state,
                    dispatchers,
                    options: { disableNavigationSeparatorActions: true, onResetSearchForNavigation }
                });
            } else if (target.type === 'note') {
                buildFileMenu({
                    file: target.file,
                    menu,
                    services: menuServices,
                    settings,
                    state,
                    dispatchers,
                    options: { onRevealFileInActualFolder, onResetSearchForNavigation }
                });

                if (target.file.extension !== 'md') {
                    menu.addSeparator();
                    menu.addItem(item => {
                        item.setTitle(strings.shortcuts.remove)
                            .setIcon(resolveUXIconForMenu(settings.interfaceIcons, 'nav-shortcuts', 'lucide-star-off'))
                            .onClick(() => {
                                runAsyncAction(() => removeShortcut(target.key));
                            });
                    });
                }
            } else if (target.type === 'tag') {
                buildTagMenu({
                    tagPath: target.tagPath,
                    menu,
                    services: menuServices,
                    settings,
                    state,
                    dispatchers,
                    options: { disableNavigationSeparatorActions: true, onResetSearchForNavigation }
                });
            } else if (target.type === 'property') {
                buildPropertyMenu({
                    propertyNodeId: target.propertyNodeId,
                    menu,
                    services: menuServices,
                    settings,
                    state,
                    dispatchers,
                    options: { disableNavigationSeparatorActions: true, onResetSearchForNavigation }
                });
            }

            menu.showAtMouseEvent(event.nativeEvent);
        },
        [
            expansionDispatch,
            expansionState.expandedFolders,
            expansionState.expandedProperties,
            expansionState.expandedTags,
            menuServices,
            removeShortcut,
            renameShortcut,
            onResetSearchForNavigation,
            onRevealFileInActualFolder,
            selectionDispatch,
            selectionStateRef,
            setIsShortcutContextMenuOpen,
            settings,
            uiDispatch
        ]
    );

    const handleRecentFileContextMenu = useCallback(
        (event: React.MouseEvent<HTMLDivElement>, file: TFile) => {
            event.preventDefault();
            event.stopPropagation();

            const menu = new Menu();
            const state: MenuState = {
                selectionState: selectionStateRef.current,
                expandedFolders: expansionState.expandedFolders,
                expandedTags: expansionState.expandedTags,
                expandedProperties: expansionState.expandedProperties
            };
            const dispatchers: MenuDispatchers = {
                selectionDispatch,
                expansionDispatch,
                uiDispatch
            };

            buildFileMenu({
                file,
                menu,
                services: menuServices,
                settings,
                state,
                dispatchers,
                options: { onRevealFileInActualFolder, onResetSearchForNavigation }
            });

            menu.showAtMouseEvent(event.nativeEvent);
        },
        [
            expansionDispatch,
            expansionState.expandedFolders,
            expansionState.expandedProperties,
            expansionState.expandedTags,
            menuServices,
            onResetSearchForNavigation,
            onRevealFileInActualFolder,
            selectionDispatch,
            selectionStateRef,
            settings,
            uiDispatch
        ]
    );

    return {
        handleShortcutContextMenu,
        handleRecentFileContextMenu
    };
}
