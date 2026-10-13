import { legacyNewNoteTabPreference, presentCreatedNote } from '../tpsNoteOpening';
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

import { MenuItem, TFile } from 'obsidian';
import { TagMenuBuilderParams } from './menuTypes';
import { strings } from '../../i18n';
import { cleanupTagPatterns, createHiddenTagMatcher, matchesHiddenTagPattern } from '../tagPrefixMatcher';
import { ItemType } from '../../types';
import { normalizeTagPath } from '../tagUtils';
import { setAsyncOnClick, setSubmenuOnClick, tryCreateSubmenu } from './menuAsyncHelpers';
import { addShortcutRenameMenuItem } from './shortcutRenameMenuItem';
import { addStyleMenu } from './styleMenuBuilder';
import { resolveUXIcon, resolveUXIconForMenu } from '../uxIcons';
import { getVirtualTagCollection, isVirtualTagCollectionId } from '../virtualTagCollections';
import { getActiveHiddenTags, getActiveVaultProfile } from '../vaultProfiles';
import { resolveDisplayTagPath } from '../../services/tagOperations/TagOperationUtils';
import { INTERNAL_NOTEBOOK_NAVIGATOR_API } from '../../api/NotebookNavigatorAPI';
import { selectContextMenuTarget } from './contextMenuSelection';
import { resolveTagNote } from '../tagNotes';
import { openTagNoteFile, revealTagNoteInNavigator } from '../tagNoteNavigation';
import { resolveFolderNoteDefaultOpenContext } from '../keyboardOpenContext';
import { showNotice } from '../noticeUtils';

/**
 * Builds the context menu for a tag
 */
export function buildTagMenu(params: TagMenuBuilderParams): void {
    const { tagPath, menu, services, settings, state, dispatchers, options } = params;
    const { app, metadataService, plugin, fileSystemOps, isMobile } = services;
    const { selectionState } = state;
    const { selectionDispatch, uiDispatch } = dispatchers;

    // Show tag name on mobile
    if (isMobile) {
        menu.addItem((item: MenuItem) => {
            const label = isVirtualTagCollectionId(tagPath) ? getVirtualTagCollection(tagPath).getLabel() : `#${tagPath}`;
            item.setTitle(label).setIsLabel(true);
        });
        menu.addSeparator();
    }

    // Add rename/delete options only for real tags (not virtual aggregations)
    const isVirtualTag = isVirtualTagCollectionId(tagPath);

    const ensureTagSelected = (): boolean => {
        return selectContextMenuTarget({
            isSelected: selectionState.selectionType === ItemType.TAG && selectionState.selectedTag === tagPath,
            onResetSearchForNavigation: options?.onResetSearchForNavigation,
            onSelect: () => selectionDispatch({ type: 'SET_SELECTED_TAG', tag: tagPath })
        });
    };

    const handleFileCreation = (file: TFile | null | undefined) => {
        if (!file) {
            return;
        }

        selectionDispatch({ type: 'SET_SELECTED_FILE', file });
        uiDispatch({ type: 'ACTIVATE_PANE', target: 'files' });
    };

    const displayTagPath = isVirtualTag ? tagPath : resolveDisplayTagPath(tagPath, services.tagTreeService);
    const initialTagNoteResolution = !isVirtualTag && settings.enableFolderNotes ? resolveTagNote(app, tagPath, displayTagPath) : null;

    const revealAndOpenTagNote = async (tagNote: TFile): Promise<void> => {
        const normalizedTagPath = normalizeTagPath(tagPath) ?? tagPath;
        revealTagNoteInNavigator(selectionDispatch, tagNote, normalizedTagPath);
        uiDispatch({ type: 'ACTIVATE_PANE', target: 'files' });
        await openTagNoteFile({
            app,
            commandQueue: services.commandQueue,
            tagNote,
            context: resolveFolderNoteDefaultOpenContext(settings.folderNoteOpenLocation),
            openInRightSidebar: note => plugin.openFolderNoteInRightSidebar(note)
        });
    };

    const showTagNoteCreationWarning = (reason: string): void => {
        showNotice(strings.fileSystem.errors.createFile.replace('{error}', reason), { variant: 'warning' });
    };

    if (!isVirtualTag) {
        menu.addItem((item: MenuItem) => {
            setAsyncOnClick(item.setTitle(strings.contextMenu.folder.newNote).setIcon('lucide-pen-box'), async () => {
                const selectionChanged = ensureTagSelected();
                const sourcePath = selectionState.selectedFile?.path ?? app.workspace.getActiveFile()?.path ?? '';
                const normalizedTagPath = normalizeTagPath(tagPath);
                const manualSortContext = normalizedTagPath
                    ? await fileSystemOps.getManualSortNewFileContextForTarget('tag', normalizedTagPath, {
                          waitForSelectionUpdate: selectionChanged
                      })
                    : null;
                const createdFile = await fileSystemOps.createNewFileForTag(
                    tagPath,
                    sourcePath,
                    legacyNewNoteTabPreference(app, settings.createNewNotesInNewTab),
                    manualSortContext
                );
                handleFileCreation(createdFile);
            });
        });

        if (settings.enableFolderNotes && initialTagNoteResolution?.status !== 'found') {
            menu.addItem((item: MenuItem) => {
                setAsyncOnClick(item.setTitle(strings.contextMenu.tag.createTagNote).setIcon('lucide-file-tag'), async () => {
                    ensureTagSelected();

                    // Metadata can change while a native menu is open. Re-resolve before creating
                    // so stale menus never create a duplicate or choose between ambiguous notes.
                    const currentDisplayTagPath = resolveDisplayTagPath(tagPath, services.tagTreeService);
                    const currentResolution = resolveTagNote(app, tagPath, currentDisplayTagPath);
                    if (currentResolution.status === 'found' && currentResolution.file) {
                        await revealAndOpenTagNote(currentResolution.file);
                        return;
                    }
                    if (currentResolution.status === 'ambiguous') {
                        const noteName = currentResolution.basename ? `${currentResolution.basename}.md` : currentDisplayTagPath;
                        showTagNoteCreationWarning(
                            `multiple notes named "${noteName}" use #${currentDisplayTagPath}; rename or retag duplicates first`
                        );
                        return;
                    }
                    if (currentResolution.status === 'invalid') {
                        showNotice(strings.modals.tagOperation.invalidTagName, { variant: 'warning' });
                        return;
                    }

                    const sourcePath = selectionState.selectedFile?.path ?? app.workspace.getActiveFile()?.path ?? '';
                    const result = await fileSystemOps.createTagNote(tagPath, sourcePath, { openAfterCreate: false });
                    if (result.status === 'created') {
                        if (!(await presentCreatedNote(app, result.file, false, false))) await revealAndOpenTagNote(result.file);
                        return;
                    }
                    if (result.status === 'invalid') {
                        showNotice(strings.modals.tagOperation.invalidTagName, { variant: 'warning' });
                        return;
                    }
                    if (result.status === 'conflict') {
                        const conflictName = result.path ?? `${currentResolution.basename ?? currentDisplayTagPath}.md`;
                        showNotice(strings.dragDrop.errors.itemAlreadyExists.replace('{name}', conflictName), { variant: 'warning' });
                        return;
                    }

                    const failedPath = result.path ? ` at "${result.path}"` : '';
                    showTagNoteCreationWarning(`the tag note could not be created${failedPath}`);
                });
            });
        }
        menu.addSeparator();
    }

    const openAppearanceModal = async (initialTab: 'icon' | 'color' | 'background'): Promise<void> => {
        const { AppearanceModal } = await import('../../modals/AppearanceModal');
        const modal = new AppearanceModal(app, {
            title: `#${tagPath}`,
            metadataService,
            initialTab,
            defaultIcon: settings.showTagIcons ? resolveUXIcon(settings.interfaceIcons, 'nav-tag') : null,
            icon: settings.showTagIcons
                ? {
                      initial: metadataService.getTagIcon(tagPath) ?? null,
                      apply: async iconId => {
                          if (iconId === null) {
                              await metadataService.removeTagIcon(tagPath);
                              return;
                          }

                          await metadataService.setTagIcon(tagPath, iconId);
                      }
                  }
                : undefined,
            color: {
                initial: metadataService.getTagColor(tagPath) ?? null,
                apply: async color => {
                    if (color === null) {
                        await metadataService.removeTagColor(tagPath);
                        return;
                    }

                    await metadataService.setTagColor(tagPath, color);
                }
            },
            background: {
                initial: metadataService.getTagBackgroundColor(tagPath) ?? null,
                apply: async color => {
                    if (color === null) {
                        await metadataService.removeTagBackgroundColor(tagPath);
                        return;
                    }

                    await metadataService.setTagBackgroundColor(tagPath, color);
                }
            }
        });
        modal.open();
    };

    if (settings.showTagIcons) {
        menu.addItem((item: MenuItem) => {
            setAsyncOnClick(item.setTitle(strings.contextMenu.tag.changeIcon).setIcon('lucide-image'), () => {
                return openAppearanceModal('icon');
            });
        });
    }

    menu.addItem((item: MenuItem) => {
        setAsyncOnClick(item.setTitle(strings.contextMenu.tag.changeColor).setIcon('lucide-palette'), () => {
            return openAppearanceModal('color');
        });
    });

    menu.addItem((item: MenuItem) => {
        setAsyncOnClick(item.setTitle(strings.contextMenu.tag.changeBackground).setIcon('lucide-paint-bucket'), () => {
            return openAppearanceModal('background');
        });
    });

    // These include inherited values; direct settings entries are used to decide which "remove" actions to show.
    const tagIcon = metadataService.getTagIcon(tagPath);
    const tagColorData = metadataService.getTagColorData(tagPath);
    const tagColor = tagColorData.color;
    const tagBackgroundColor = tagColorData.background;
    const normalizedTagPath = normalizeTagPath(tagPath);
    const directTagColor = normalizedTagPath ? settings.tagColors?.[normalizedTagPath] : undefined;
    const directTagBackground = normalizedTagPath ? settings.tagBackgroundColors?.[normalizedTagPath] : undefined;

    const hasRemovableIcon = Boolean(tagIcon);
    const hasRemovableColor = Boolean(directTagColor);
    const hasRemovableBackground = Boolean(directTagBackground);

    addStyleMenu({
        menu,
        styleData: {
            icon: tagIcon,
            color: tagColor,
            background: tagBackgroundColor
        },
        hasIcon: settings.showTagIcons,
        hasColor: true,
        hasBackground: true,
        applyStyle: async clipboard => {
            const { icon, color, background } = clipboard;
            const actions: Promise<void>[] = [];

            if (icon) {
                actions.push(metadataService.setTagIcon(tagPath, icon));
            }
            if (color) {
                actions.push(metadataService.setTagColor(tagPath, color));
            }
            if (background) {
                actions.push(metadataService.setTagBackgroundColor(tagPath, background));
            }

            await Promise.all(actions);
        },
        removeIcon: hasRemovableIcon ? async () => metadataService.removeTagIcon(tagPath) : undefined,
        removeColor: hasRemovableColor ? async () => metadataService.removeTagColor(tagPath) : undefined,
        removeBackground: hasRemovableBackground ? async () => metadataService.removeTagBackgroundColor(tagPath) : undefined
    });

    // Child tag sort order
    if (typeof MenuItem.prototype.setSubmenu === 'function') {
        menu.addSeparator();

        menu.addItem((item: MenuItem) => {
            const currentOverride = metadataService.getTagChildSortOrderOverride(tagPath);
            const effectiveOrder = currentOverride ?? settings.tagSortOrder;
            const sortIcon = currentOverride
                ? effectiveOrder.endsWith('-desc')
                    ? 'lucide-sort-desc'
                    : 'lucide-sort-asc'
                : 'lucide-sliders-horizontal';

            const sortOrderSubmenu = tryCreateSubmenu(item);
            if (!sortOrderSubmenu) {
                item.setTitle(strings.paneHeader.changeChildSortOrder).setIcon(sortIcon).setDisabled(true);
                return;
            }

            const globalDefaultLabel = (() => {
                switch (settings.tagSortOrder) {
                    case 'alpha-desc':
                        return strings.settings.items.tagSortOrder.options.alphaDesc;
                    case 'frequency-asc':
                        return strings.settings.items.tagSortOrder.options.lowToHigh;
                    case 'frequency-desc':
                        return strings.settings.items.tagSortOrder.options.highToLow;
                    case 'alpha-asc':
                    default:
                        return strings.settings.items.tagSortOrder.options.alphaAsc;
                }
            })();

            item.setTitle(strings.paneHeader.changeChildSortOrder).setIcon(sortIcon);

            sortOrderSubmenu.addItem(subItem => {
                subItem.setTitle(`${strings.folderAppearance.defaultLabel} (${globalDefaultLabel})`).setChecked(!currentOverride);
                setSubmenuOnClick(menu, subItem, async () => {
                    await metadataService.removeTagChildSortOrderOverride(tagPath);
                    app.workspace.requestSaveLayout();
                });
            });

            sortOrderSubmenu.addSeparator();

            sortOrderSubmenu.addItem(subItem => {
                subItem.setTitle(strings.settings.items.tagSortOrder.options.alphaAsc).setChecked(currentOverride === 'alpha-asc');
                setSubmenuOnClick(menu, subItem, async () => {
                    await metadataService.setTagChildSortOrderOverride(tagPath, 'alpha-asc');
                    app.workspace.requestSaveLayout();
                });
            });

            sortOrderSubmenu.addItem(subItem => {
                subItem.setTitle(strings.settings.items.tagSortOrder.options.alphaDesc).setChecked(currentOverride === 'alpha-desc');
                setSubmenuOnClick(menu, subItem, async () => {
                    await metadataService.setTagChildSortOrderOverride(tagPath, 'alpha-desc');
                    app.workspace.requestSaveLayout();
                });
            });
        });
    }

    const disableNavigationSeparatorActions = Boolean(options?.disableNavigationSeparatorActions);
    const shouldAddShortcutSectionSeparator = Boolean(services.shortcuts) || !disableNavigationSeparatorActions;
    if (shouldAddShortcutSectionSeparator) {
        menu.addSeparator();
    }

    // Add to shortcuts / Remove from shortcuts
    if (services.shortcuts) {
        const { tagShortcutKeysByPath, addTagShortcut, removeShortcut, renameShortcut, shortcutMap } = services.shortcuts;
        const normalizedShortcutPath = normalizeTagPath(tagPath);
        const existingShortcutKey = normalizedShortcutPath ? tagShortcutKeysByPath.get(normalizedShortcutPath) : undefined;

        if (existingShortcutKey) {
            const existingShortcut = shortcutMap.get(existingShortcutKey);
            const defaultLabel = isVirtualTagCollectionId(tagPath)
                ? getVirtualTagCollection(tagPath).getLabel()
                : resolveDisplayTagPath(tagPath, services.tagTreeService);

            addShortcutRenameMenuItem({
                app,
                menu,
                shortcutKey: existingShortcutKey,
                defaultLabel,
                existingShortcut,
                title: strings.shortcuts.rename,
                placeholder: strings.searchInput.shortcutNamePlaceholder,
                renameShortcut
            });
        }

        menu.addItem((item: MenuItem) => {
            if (existingShortcutKey) {
                setAsyncOnClick(
                    item
                        .setTitle(strings.shortcuts.remove)
                        .setIcon(resolveUXIconForMenu(settings.interfaceIcons, 'nav-shortcuts', 'lucide-star-off')),
                    async () => {
                        await removeShortcut(existingShortcutKey);
                    }
                );
            } else {
                setAsyncOnClick(
                    item
                        .setTitle(strings.shortcuts.add)
                        .setIcon(resolveUXIconForMenu(settings.interfaceIcons, 'nav-shortcuts', 'lucide-star')),
                    async () => {
                        await addTagShortcut(tagPath);
                    }
                );
            }
        });
    }

    if (!disableNavigationSeparatorActions) {
        const tagSeparatorTarget = { type: 'tag', path: tagPath } as const;
        const hasSeparator = metadataService.hasNavigationSeparator(tagSeparatorTarget);

        menu.addItem((item: MenuItem) => {
            const title = hasSeparator ? strings.contextMenu.navigation.removeSeparator : strings.contextMenu.navigation.addSeparator;
            setAsyncOnClick(item.setTitle(title).setIcon('lucide-separator-horizontal'), async () => {
                if (hasSeparator) {
                    await metadataService.removeNavigationSeparator(tagSeparatorTarget);
                    return;
                }
                await metadataService.addNavigationSeparator(tagSeparatorTarget);
            });
        });
    }

    const canHideTag = !isVirtualTag;
    const activeProfile = getActiveVaultProfile(plugin.settings);
    const hiddenTags = getActiveHiddenTags(plugin.settings);
    const hasTrailingTagActions = canHideTag || !isVirtualTag;
    const addedMenuExtensions =
        services.plugin.api?.[INTERNAL_NOTEBOOK_NAVIGATOR_API].menus.applyTagMenuExtensions({ menu, tag: normalizedTagPath ?? tagPath }) ??
        0;
    if (addedMenuExtensions > 0 && hasTrailingTagActions) {
        menu.addSeparator();
    }

    if (canHideTag || !isVirtualTag) {
        if (addedMenuExtensions === 0) {
            menu.addSeparator();
        }

        if (canHideTag) {
            const hiddenMatcher = createHiddenTagMatcher(hiddenTags);
            const hasHiddenRules =
                hiddenMatcher.pathPatterns.length > 0 ||
                hiddenMatcher.prefixes.length > 0 ||
                hiddenMatcher.startsWithNames.length > 0 ||
                hiddenMatcher.endsWithNames.length > 0;
            const tagName = tagPath.split('/').pop() ?? tagPath;
            const isHidden = hasHiddenRules && matchesHiddenTagPattern(tagPath, tagName, hiddenMatcher);

            const normalizedTagPath = normalizeTagPath(tagPath);
            const hasDirectHiddenEntry =
                normalizedTagPath !== null &&
                hiddenTags.some(pattern => {
                    const normalizedPattern = normalizeTagPath(pattern);
                    return normalizedPattern !== null && !normalizedPattern.includes('*') && normalizedPattern === normalizedTagPath;
                });

            if (!isHidden) {
                menu.addItem((item: MenuItem) => {
                    setAsyncOnClick(item.setTitle(strings.contextMenu.tag.hideTag).setIcon('lucide-eye-off'), async () => {
                        const cleanedHiddenTags = cleanupTagPatterns(hiddenTags, tagPath);

                        activeProfile.hiddenTags = cleanedHiddenTags;
                        await plugin.saveSettingsAndUpdate();
                    });
                });
            } else if (hasDirectHiddenEntry && normalizedTagPath) {
                menu.addItem((item: MenuItem) => {
                    setAsyncOnClick(item.setTitle(strings.contextMenu.tag.showTag).setIcon('lucide-eye'), async () => {
                        activeProfile.hiddenTags = hiddenTags.filter(pattern => {
                            const normalizedPattern = normalizeTagPath(pattern);
                            return !(normalizedPattern && !normalizedPattern.includes('*') && normalizedPattern === normalizedTagPath);
                        });

                        await plugin.saveSettingsAndUpdate();
                    });
                });
            }
        }

        if (!isVirtualTag) {
            menu.addItem((item: MenuItem) => {
                setAsyncOnClick(item.setTitle(strings.modals.tagOperation.confirmRename).setIcon('lucide-pencil'), async () => {
                    await services.tagOperations.promptRenameTag(tagPath);
                });
            });

            menu.addItem((item: MenuItem) => {
                setAsyncOnClick(
                    item.setTitle(strings.modals.tagOperation.confirmDelete).setIcon('lucide-trash').setWarning(true),
                    async () => {
                        await services.tagOperations.promptDeleteTag(tagPath);
                    }
                );
            });
        }
    }
}
