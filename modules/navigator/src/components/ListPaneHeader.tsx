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

import React, { useEffect, useMemo } from 'react';
import { Platform, type TFile, type TFolder } from 'obsidian';
import { useSelectionState, useSelectionDispatch, type SelectionDispatch } from '../context/SelectionContext';
import { useCommandQueue, useServices } from '../context/ServicesContext';
import { useSettingsState } from '../context/SettingsContext';
import { useUXPreferences } from '../context/UXPreferencesContext';
import { useUIState, useUIDispatch } from '../context/UIStateContext';
import { useFileCache } from '../context/StorageContext';
import { strings } from '../i18n';
import { getIconService, useIconServiceVersion } from '../services/icons';
import { ServiceIcon } from './ServiceIcon';
import { NavigationNoteLink, type NavigationNoteActivationEvent } from './NavigationNoteLink';
import { useListActions } from '../hooks/useListActions';
import type { BreadcrumbSegment } from '../hooks/useListPaneTitle';
import type { RevealFileOptions } from '../hooks/useNavigatorReveal';
import { useSelectedFolderFileVersion } from '../hooks/useSelectedFolderFileVersion';
import { useTagNoteIndex } from '../hooks/useTagNoteIndex';
import { ItemType } from '../types';
import { getFolderNote, openFolderNoteFile, revealFolderNoteInNavigator } from '../utils/folderNotes';
import { resolveFolderNoteClickOpenContext } from '../utils/keyboardOpenContext';
import { usesMobileChrome } from '../utils/paneLayout';
import { normalizeTagPath } from '../utils/tagUtils';
import { runAsyncAction } from '../utils/async';
import { findTagNode } from '../utils/tagTree';
import { getTagNote, resolveTagNoteFromIndex } from '../utils/tagNotes';
import { openTagNoteFile, revealTagNoteInNavigator } from '../utils/tagNoteNavigation';
import { isAggregateNavigationSelection, resolveSelectionIncludeDescendants } from '../utils/descendantVisibility';
import { resolveUXIcon } from '../utils/uxIcons';
import type { ManualSortNewFilePlacementContext } from '../utils/manualSort';
import {
    shouldShowListCreateButton,
    supportsListSortAndGroupingForSelection,
    supportsNativeListPresentationForSelection,
    isVaultRootResourceScope
} from './listPane/typeModeRuntime';

interface ListPaneHeaderProps {
    onHeaderClick?: () => void;
    isSearchActive?: boolean;
    onSearchToggle?: () => void;
    onManualSortStart?: (propertyKey: string) => void;
    getManualSortNewFileContext?: () => ManualSortNewFilePlacementContext | null;
    canToggleGroupExpansion: boolean;
    shouldCollapseGroups: boolean;
    onToggleGroupExpansion: () => boolean;
    mixedStructuralSearchActive?: boolean;
    creationSearchQuery?: string;
    creationSearchSupported?: boolean;
    actionsDisabled?: boolean;
    desktopTitle: string;
    breadcrumbSegments: BreadcrumbSegment[];
    iconName: string;
    showIcon: boolean;
    onResetSearchForNavigation: () => void;
    onRevealFileInActualFolder: (file: TFile, options?: RevealFileOptions) => boolean;
}

interface ListPaneBreadcrumbNavigationEnvironment {
    getFolderByPath: (path: string) => TFolder | null;
    selectionDispatch: SelectionDispatch;
    onResetSearchForNavigation: () => void;
}

export function activateListPaneBreadcrumb(segment: BreadcrumbSegment, environment: ListPaneBreadcrumbNavigationEnvironment): boolean {
    if (segment.isLast || segment.targetType === 'none' || !segment.targetPath) {
        return false;
    }

    if (segment.targetType === 'folder') {
        const targetFolder = environment.getFolderByPath(segment.targetPath);
        if (!targetFolder) {
            return false;
        }
        environment.onResetSearchForNavigation();
        environment.selectionDispatch({ type: 'SET_SELECTED_FOLDER', folder: targetFolder });
        return true;
    }

    if (segment.targetType === 'tag') {
        const tag = normalizeTagPath(segment.targetPath);
        if (!tag) {
            return false;
        }
        environment.onResetSearchForNavigation();
        environment.selectionDispatch({ type: 'SET_SELECTED_TAG', tag });
        return true;
    }

    if (segment.targetType === 'property') {
        environment.onResetSearchForNavigation();
        environment.selectionDispatch({ type: 'SET_SELECTED_PROPERTY', nodeId: segment.targetPath });
        return true;
    }

    return false;
}

export const ListPaneHeader = React.memo(function ListPaneHeader({
    onHeaderClick,
    isSearchActive,
    onSearchToggle,
    onManualSortStart,
    getManualSortNewFileContext,
    canToggleGroupExpansion,
    shouldCollapseGroups,
    onToggleGroupExpansion,
    mixedStructuralSearchActive = false,
    creationSearchQuery = '',
    creationSearchSupported = true,
    actionsDisabled = false,
    desktopTitle,
    breadcrumbSegments,
    iconName,
    showIcon,
    onResetSearchForNavigation,
    onRevealFileInActualFolder
}: ListPaneHeaderProps) {
    const iconRef = React.useRef<HTMLSpanElement | null>(null);
    const { app, plugin } = useServices();
    const commandQueue = useCommandQueue();
    const settings = useSettingsState();
    const uxPreferences = useUXPreferences();
    const selectionState = useSelectionState();
    const includeDescendantNotes = resolveSelectionIncludeDescendants(settings, selectionState, uxPreferences.includeDescendantNotes);
    const selectionDispatch = useSelectionDispatch();
    const { fileData } = useFileCache();
    const uiState = useUIState();
    const uiDispatch = useUIDispatch();
    const listPaneTitlePreference = settings.listPaneTitle ?? 'header';
    const iconVersion = useIconServiceVersion();
    const listToolbarVisibility = settings.toolbarVisibility.list;
    const showRevealButton = listToolbarVisibility.reveal;
    // Mobile chrome (simplified header, actions in the tab bar) applies to phones only.
    // Tablets render the desktop header in both pane layouts so the toolbars stay at the
    // top when switching between single and dual pane.
    const useMobileChrome = usesMobileChrome();

    // Use the shared actions hook
    const {
        handleNewFile,
        canCreateNewFile,
        newItemLabel,
        newItemTooltip,
        newItemIcon,
        hasActiveCreationSearch,
        handleRevealFile,
        canRevealFile,
        handleAppearanceMenu,
        handleSortMenu,
        handleToggleDescendants,
        descendantsTooltip,
        getSortIcon,
        hasAppearanceOrSortSelection,
        hasCustomSortOrGroup,
        hasCustomAppearance
    } = useListActions({
        onManualSortStart,
        getManualSortNewFileContext,
        trackRevealFileAvailability: !useMobileChrome && showRevealButton,
        mixedStructuralSearchActive,
        creationSearchQuery,
        creationSearchSupported,
        onRevealFileInActualFolder,
        onResetSearchForNavigation
    });
    const showBackButton = listToolbarVisibility.back && uiState.singlePane;
    const isTypeSelection = selectionState.selectionType === ItemType.TYPE && Boolean(selectionState.selectedType);
    const supportsNativeListPresentation = supportsNativeListPresentationForSelection(
        selectionState.selectionType,
        selectionState.selectedType
    );
    const supportsListSortAndGrouping = supportsListSortAndGroupingForSelection(selectionState.selectionType, selectionState.selectedType);
    const showSearchButton = listToolbarVisibility.search;
    const showDescendantsButton =
        !isTypeSelection &&
        !isVaultRootResourceScope(selectionState.selectionType, selectionState.selectedFolder?.path) &&
        !isAggregateNavigationSelection(selectionState) &&
        listToolbarVisibility.descendants;
    const showGroupExpansionButton = supportsListSortAndGrouping && listToolbarVisibility.groupExpansion;
    const showSortButton = supportsListSortAndGrouping && listToolbarVisibility.sort;
    const showAppearanceButton = supportsNativeListPresentation && listToolbarVisibility.appearance;
    const showNewNoteButton = shouldShowListCreateButton(
        selectionState.selectionType,
        canCreateNewFile,
        listToolbarVisibility.newNote,
        hasActiveCreationSearch
    );
    const showEffectiveRevealButton = !isTypeSelection && showRevealButton;
    const hasNavigationSelection = Boolean(
        selectionState.selectedFolder || selectionState.selectedTag || selectionState.selectedProperty || selectionState.selectedType
    );

    const shouldRenderBreadcrumbSegments = useMobileChrome;
    const shouldShowHeaderTitle = !useMobileChrome && listPaneTitlePreference === 'header';
    const shouldShowHeaderIcon = shouldShowHeaderTitle && showIcon;
    const shouldRenderDesktopHeader =
        showBackButton ||
        shouldShowHeaderTitle ||
        showSearchButton ||
        showEffectiveRevealButton ||
        showDescendantsButton ||
        showGroupExpansionButton ||
        showSortButton ||
        showAppearanceButton ||
        showNewNoteButton;

    const backIconId = useMemo(() => {
        return Platform.isAndroidApp ? 'arrow-left' : 'chevron-left';
    }, []);

    const sortIconId = useMemo(() => {
        return getSortIcon();
    }, [getSortIcon]);

    // Folder note interactions only apply when a folder is the active selection.
    const selectedFolder = selectionState.selectionType === ItemType.FOLDER ? selectionState.selectedFolder : null;
    // Folder note lookup is only needed when the title/breadcrumb is rendered.
    const shouldResolveSelectedFolderNote = shouldRenderBreadcrumbSegments || shouldShowHeaderTitle;
    // Tracks direct child file changes so folder note lookup recalculates when names move.
    const selectedFolderFileVersion = useSelectedFolderFileVersion(
        app.vault,
        selectedFolder,
        settings.enableFolderNotes && settings.enableFolderNoteLinks && shouldResolveSelectedFolderNote,
        { metadataCache: app.metadataCache }
    );
    // Resolves the selected folder's note file with current folder note settings.
    const selectedFolderNote = useMemo(() => {
        void selectedFolderFileVersion;

        if (!selectedFolder || !settings.enableFolderNotes || !settings.enableFolderNoteLinks || !shouldResolveSelectedFolderNote) {
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
        shouldResolveSelectedFolderNote,
        selectedFolderFileVersion
    ]);
    const selectedTag = selectionState.selectionType === ItemType.TAG ? selectionState.selectedTag : null;
    const selectedTagNode = selectedTag ? findTagNode(fileData.tagTree, selectedTag) : null;
    const selectedTagDisplayPath = selectedTagNode?.displayPath ?? selectedTag;
    const tagNoteIndex = useTagNoteIndex(
        app,
        Boolean(selectedTag && settings.enableFolderNotes && settings.enableFolderNoteLinks && shouldResolveSelectedFolderNote)
    );
    const selectedTagNote = useMemo(() => {
        if (!selectedTag || !selectedTagDisplayPath || !tagNoteIndex) {
            return null;
        }

        return resolveTagNoteFromIndex(tagNoteIndex, selectedTag, selectedTagDisplayPath).file;
    }, [selectedTag, selectedTagDisplayPath, tagNoteIndex]);

    const handleSelectedFolderNoteClick = React.useCallback(
        (event: NavigationNoteActivationEvent) => {
            if (!selectedFolder || !selectedFolderNote) {
                return;
            }

            // Prevents header click handlers from also running.
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

    const handleSelectedFolderNoteMouseDown = React.useCallback(
        (event: React.MouseEvent<HTMLSpanElement>) => {
            if (event.button !== 1 || !selectedFolder || !selectedFolderNote) {
                return;
            }

            // Middle-click opens in a new tab and suppresses default browser behavior.
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

    const handleSelectedTagNoteClick = React.useCallback(
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

    const handleSelectedTagNoteMouseDown = React.useCallback(
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

    const selectedNavigationNote = selectedFolderNote ?? selectedTagNote;
    const handleSelectedNavigationNoteClick = selectedFolderNote ? handleSelectedFolderNoteClick : handleSelectedTagNoteClick;
    const handleSelectedNavigationNoteMouseDown = selectedFolderNote ? handleSelectedFolderNoteMouseDown : handleSelectedTagNoteMouseDown;

    const breadcrumbContent = useMemo((): React.ReactNode => {
        if (!shouldRenderBreadcrumbSegments) {
            if (!selectedNavigationNote) {
                return desktopTitle;
            }

            // Desktop header title becomes clickable when a folder note exists.
            return (
                <NavigationNoteLink
                    className="nn-pane-header-folder-note"
                    onActivate={handleSelectedNavigationNoteClick}
                    onMouseDown={handleSelectedNavigationNoteMouseDown}
                >
                    {desktopTitle}
                </NavigationNoteLink>
            );
        }

        const parts: React.ReactNode[] = [];
        breadcrumbSegments.forEach((segment, index) => {
            const key = `${segment.label}-${index}`;
            // The last breadcrumb segment maps to the active selection.
            const isCurrentNavigationNoteSegment = segment.isLast && Boolean(selectedNavigationNote);

            if (segment.isLast || segment.targetType === 'none' || !segment.targetPath) {
                parts.push(
                    isCurrentNavigationNoteSegment ? (
                        <NavigationNoteLink
                            key={key}
                            className="nn-path-current nn-pane-header-folder-note"
                            onActivate={handleSelectedNavigationNoteClick}
                            onMouseDown={handleSelectedNavigationNoteMouseDown}
                        >
                            {segment.label}
                        </NavigationNoteLink>
                    ) : (
                        <span key={key} className="nn-path-current">
                            {segment.label}
                        </span>
                    )
                );
            } else {
                const handleClick = (e: React.MouseEvent) => {
                    e.stopPropagation();
                    activateListPaneBreadcrumb(segment, {
                        getFolderByPath: path => app.vault.getFolderByPath(path),
                        selectionDispatch,
                        onResetSearchForNavigation
                    });
                };

                parts.push(
                    <span key={key} className="nn-path-segment" onClick={handleClick}>
                        {segment.label}
                    </span>
                );
            }

            if (!segment.isLast) {
                parts.push(
                    <span key={`${key}-separator`} className="nn-path-separator">
                        {' / '}
                    </span>
                );
            }
        });

        return parts;
    }, [
        app.vault,
        breadcrumbSegments,
        desktopTitle,
        selectionDispatch,
        onResetSearchForNavigation,
        shouldRenderBreadcrumbSegments,
        selectedNavigationNote,
        handleSelectedNavigationNoteClick,
        handleSelectedNavigationNoteMouseDown
    ]);

    const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
    const [showFade, setShowFade] = React.useState(false);

    // Renders the header icon when icon name or version changes
    useEffect(() => {
        if (!shouldShowHeaderIcon || !iconRef.current) {
            return;
        }

        const iconService = getIconService();
        iconService.renderIcon(iconRef.current, iconName);
    }, [iconName, iconVersion, shouldShowHeaderIcon]);

    // Auto-scroll to end when selection changes
    useEffect(() => {
        if (!useMobileChrome) {
            setShowFade(false);
            return;
        }
        if (!scrollContainerRef.current) {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTo({
                    left: scrollContainerRef.current.scrollWidth,
                    behavior: 'instant'
                });
            }
        }, 0);

        return () => window.clearTimeout(timeoutId);
    }, [selectionState.selectedFolder, selectionState.selectedTag, selectionState.selectedProperty, useMobileChrome]);

    // Updates fade gradient visibility based on scroll position
    const handleScroll = React.useCallback(() => {
        if (!useMobileChrome) {
            return;
        }
        if (scrollContainerRef.current) {
            setShowFade(scrollContainerRef.current.scrollLeft > 0);
        }
    }, [useMobileChrome]);

    if (useMobileChrome) {
        // Simplified header with back button and breadcrumb path - actions live in the tab bar.
        // Phones are always single pane, so the back button always has a navigation view to
        // return to.
        return (
            <div className="nn-pane-header nn-pane-header-simple" onClick={onHeaderClick}>
                <div className="nn-mobile-header nn-mobile-header-no-icon">
                    <button
                        className="nn-icon-button nn-back-button"
                        aria-label={strings.paneHeader.mobileBackToNavigation}
                        data-pane-toggle="navigation"
                        onClick={e => {
                            e.stopPropagation();
                            uiDispatch({ type: 'ACTIVATE_PANE', target: 'navigation' });
                        }}
                        tabIndex={-1}
                    >
                        <ServiceIcon iconId={backIconId} aria-hidden={true} />
                    </button>
                    {showFade && <div className="nn-breadcrumb-fade" />}
                    <div ref={scrollContainerRef} className="nn-breadcrumb-scroll" onScroll={handleScroll}>
                        <span className="nn-mobile-title">{breadcrumbContent}</span>
                    </div>
                </div>
            </div>
        );
    }

    if (!shouldRenderDesktopHeader) {
        return null;
    }

    return (
        <div className="nn-pane-header">
            <div className="nn-header-actions nn-header-actions--space-between">
                {showBackButton ? (
                    <button
                        className="nn-icon-button"
                        data-pane-toggle="navigation"
                        onClick={() => {
                            uiDispatch({ type: 'ACTIVATE_PANE', target: 'navigation' });
                        }}
                        aria-label={strings.paneHeader.showFolders}
                        tabIndex={-1}
                    >
                        <ServiceIcon iconId={backIconId} aria-hidden={true} />
                    </button>
                ) : null}
                <span className="nn-pane-header-title">
                    {shouldShowHeaderIcon && <span ref={iconRef} className="nn-pane-header-icon" />}
                    {shouldShowHeaderTitle && <span className="nn-pane-header-text">{breadcrumbContent}</span>}
                </span>
                <div className="nn-header-actions">
                    {showSearchButton ? (
                        <button
                            className={`nn-icon-button ${isSearchActive ? 'nn-icon-button-active' : ''}`}
                            aria-label={strings.paneHeader.search}
                            onClick={onSearchToggle}
                            disabled={actionsDisabled || !hasNavigationSelection}
                            tabIndex={-1}
                        >
                            <ServiceIcon iconId={resolveUXIcon(settings.interfaceIcons, 'list-search')} />
                        </button>
                    ) : null}
                    {showEffectiveRevealButton ? (
                        <button
                            className="nn-icon-button"
                            aria-label={strings.commands.revealFile}
                            onClick={() => {
                                runAsyncAction(() => handleRevealFile());
                            }}
                            disabled={actionsDisabled || !canRevealFile}
                            tabIndex={-1}
                        >
                            <ServiceIcon iconId={resolveUXIcon(settings.interfaceIcons, 'list-reveal-file')} />
                        </button>
                    ) : null}
                    {showDescendantsButton ? (
                        <button
                            className={`nn-icon-button ${includeDescendantNotes ? 'nn-icon-button-active' : ''}`}
                            aria-label={descendantsTooltip}
                            onClick={handleToggleDescendants}
                            disabled={actionsDisabled || !hasNavigationSelection}
                            tabIndex={-1}
                        >
                            <ServiceIcon iconId={resolveUXIcon(settings.interfaceIcons, 'list-descendants')} />
                        </button>
                    ) : null}
                    {showGroupExpansionButton ? (
                        <button
                            className="nn-icon-button"
                            aria-label={
                                shouldCollapseGroups ? strings.paneHeader.collapseAllListGroups : strings.paneHeader.expandAllListGroups
                            }
                            onClick={() => {
                                onToggleGroupExpansion();
                            }}
                            disabled={actionsDisabled || !canToggleGroupExpansion}
                            tabIndex={-1}
                        >
                            <ServiceIcon
                                iconId={resolveUXIcon(
                                    settings.interfaceIcons,
                                    shouldCollapseGroups ? 'list-collapse-all' : 'list-expand-all'
                                )}
                            />
                        </button>
                    ) : null}
                    {showSortButton ? (
                        <button
                            className={`nn-icon-button ${hasCustomSortOrGroup ? 'nn-icon-button-active' : ''}`}
                            aria-label={strings.paneHeader.changeSortAndGroup}
                            onClick={handleSortMenu}
                            disabled={actionsDisabled || !hasAppearanceOrSortSelection}
                            tabIndex={-1}
                        >
                            <ServiceIcon iconId={sortIconId} />
                        </button>
                    ) : null}
                    {showAppearanceButton ? (
                        <button
                            className={`nn-icon-button ${hasCustomAppearance ? 'nn-icon-button-active' : ''}`}
                            aria-label={
                                hasCustomAppearance ? strings.paneHeader.changeAppearanceCustomized : strings.paneHeader.changeAppearance
                            }
                            aria-haspopup="menu"
                            onClick={handleAppearanceMenu}
                            disabled={actionsDisabled || !hasAppearanceOrSortSelection}
                            tabIndex={-1}
                        >
                            <ServiceIcon iconId={resolveUXIcon(settings.interfaceIcons, 'list-appearance')} />
                        </button>
                    ) : null}
                    {showNewNoteButton ? (
                        <button
                            className="nn-icon-button"
                            aria-label={newItemLabel}
                            title={newItemTooltip}
                            onClick={event => {
                                const origin = { anchorEl: event.currentTarget, event: event.nativeEvent };
                                runAsyncAction(() => handleNewFile(origin));
                            }}
                            disabled={actionsDisabled || !canCreateNewFile}
                            tabIndex={-1}
                        >
                            <ServiceIcon iconId={newItemIcon} />
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
});
