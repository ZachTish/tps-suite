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

import React from 'react';
import { Root, createRoot } from 'react-dom/client';
import { ItemView, WorkspaceLeaf, TFile, Platform, TFolder } from 'obsidian';
import { NotebookNavigatorContainer } from '../components/NotebookNavigatorContainer';
import type { NotebookNavigatorHandle } from '../components/NotebookNavigatorComponent';
import type { RevealFileOptions, NavigateToFolderOptions } from '../hooks/useNavigatorReveal';
import type { NavigateToPropertyOptions } from '../utils/propertyNavigation';
import type { NavigateToTagOptions } from '../utils/tagNavigation';
import type { NavigateToTypeOptions } from '../utils/typeNavigation';
import type {
    NavigatorListPresentationUpdate,
    NavigatorListSearchUpdate,
    NavigatorListSnapshot,
    NavigatorRowFocusTarget
} from '../api/types';
import { ExpansionProvider } from '../context/ExpansionContext';
import { SelectionProvider } from '../context/SelectionContext';
import { ServicesProvider } from '../context/ServicesContext';
import { SettingsProvider } from '../context/SettingsContext';
import { StorageProvider } from '../context/StorageContext';
import { UIStateProvider } from '../context/UIStateContext';
import { ShortcutsProvider } from '../context/ShortcutsContext';
import { RecentDataProvider } from '../context/RecentDataContext';
import { InternalDragSessionProvider } from '../context/InternalDragContext';
import { TooltipProvider } from '../context/TooltipContext';
import type NotebookNavigatorPlugin from '../main';
import { NOTEBOOK_NAVIGATOR_ICON_ID } from '../constants/notebookNavigatorIcon';
import { NOTEBOOK_NAVIGATOR_VIEW } from '../types';
import { UXPreferencesProvider } from '../context/UXPreferencesContext';
import {
    applyAndroidFontCompensation,
    clearAndroidFontCompensation,
    propagateAndroidFontCompensationToMobileRoot
} from '../utils/androidFontScale';
import { ensureNotebookNavigatorSvgFilters } from '../utils/svgFilters';
import {
    TPS_NOTEBOOK_NAVIGATOR_ANDROID_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_DISPLAY_NAME,
    TPS_NOTEBOOK_NAVIGATOR_IOS_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_IOS_FLOATING_TOOLBARS_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_MOBILE_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_REACT_ID_PREFIX,
    TPS_NOTEBOOK_NAVIGATOR_ROOT_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_VISIBLE_EVENT
} from '../constants/tpsIdentity';
import { dispatchNavigatorViewportChange } from '../utils/navigatorViewEvents';

export const IOS_FLOATING_TOOLBARS_CLASS = TPS_NOTEBOOK_NAVIGATOR_IOS_FLOATING_TOOLBARS_CLASS;

let viewInstanceCounter = 0;

export function setupNotebookNavigatorViewContainer(container: HTMLElement, options?: { useFloatingToolbars?: boolean }): void {
    container.empty();
    container.classList.add(TPS_NOTEBOOK_NAVIGATOR_ROOT_CLASS);

    if (Platform.isMobile) {
        container.classList.add(TPS_NOTEBOOK_NAVIGATOR_MOBILE_CLASS);

        if (Platform.isAndroidApp) {
            container.classList.add(TPS_NOTEBOOK_NAVIGATOR_ANDROID_CLASS);
            applyAndroidFontCompensation(container);
        } else if (Platform.isIosApp) {
            container.classList.add(TPS_NOTEBOOK_NAVIGATOR_IOS_CLASS);

            if (options?.useFloatingToolbars ?? true) {
                container.classList.add(IOS_FLOATING_TOOLBARS_CLASS);
            }
        }
    }

    ensureNotebookNavigatorSvgFilters();
}

export function teardownNotebookNavigatorViewContainer(container: HTMLElement): void {
    clearAndroidFontCompensation(container);
    container.classList.remove(TPS_NOTEBOOK_NAVIGATOR_ROOT_CLASS);
    container.classList.remove(TPS_NOTEBOOK_NAVIGATOR_MOBILE_CLASS);
    container.classList.remove(TPS_NOTEBOOK_NAVIGATOR_ANDROID_CLASS);
    container.classList.remove(TPS_NOTEBOOK_NAVIGATOR_IOS_CLASS);
    container.classList.remove(IOS_FLOATING_TOOLBARS_CLASS);
    container.empty();
}

/**
 * Custom Obsidian view that hosts the React-based Notebook Navigator interface
 * Manages the lifecycle of the React application and provides integration between
 * Obsidian's view system and the React component tree
 */
export class NotebookNavigatorView extends ItemView {
    private componentHandle: NotebookNavigatorHandle | null = null;
    plugin: NotebookNavigatorPlugin;
    private root: Root | null = null;
    private readonly settingsUpdateListenerId: string;
    private viewContainer: HTMLElement | null = null;
    private readonly readyWaiters = new Set<(ready: boolean) => void>();
    private wasMobileContainerVisible = false;

    /**
     * Creates a new NotebookNavigatorView instance
     * @param leaf - The workspace leaf that contains this view
     * @param plugin - The plugin instance for accessing settings and methods
     */
    constructor(leaf: WorkspaceLeaf, plugin: NotebookNavigatorPlugin) {
        super(leaf);
        this.plugin = plugin;
        viewInstanceCounter += 1;
        this.settingsUpdateListenerId = `${NOTEBOOK_NAVIGATOR_VIEW}-view-${viewInstanceCounter}`;
    }

    private readonly setComponentHandle = (handle: NotebookNavigatorHandle | null): void => {
        this.componentHandle = handle;
        if (handle) {
            this.resolveReadyWaiters(true);
        }
    };

    private resolveReadyWaiters(ready: boolean): void {
        if (this.readyWaiters.size === 0) {
            return;
        }

        for (const resolve of this.readyWaiters) {
            resolve(ready);
        }
        this.readyWaiters.clear();
    }

    private updatePlatformClasses(): void {
        const container = this.viewContainer;
        if (!container) {
            return;
        }

        const shouldUseFloatingToolbars = Platform.isIosApp && this.plugin.settings.useFloatingToolbars;
        container.classList.toggle(IOS_FLOATING_TOOLBARS_CLASS, shouldUseFloatingToolbars);
    }

    /**
     * Returns the unique identifier for this view type
     * @returns The view type constant used by Obsidian to manage this view
     */
    getViewType() {
        return NOTEBOOK_NAVIGATOR_VIEW;
    }

    /**
     * Returns the display text shown in the view header
     * @returns The human-readable name of this view
     */
    getDisplayText() {
        return TPS_NOTEBOOK_NAVIGATOR_DISPLAY_NAME;
    }

    /**
     * Returns the icon identifier for this view
     * @returns The Obsidian icon name to display in tabs and headers
     */
    getIcon() {
        return NOTEBOOK_NAVIGATOR_ICON_ID;
    }

    /**
     * Called when the view is opened/created
     * Initializes the React application within the Obsidian view container
     * Sets up the component hierarchy with necessary context providers
     */
    async onOpen() {
        const container = this.containerEl.children[1];
        if (!container.instanceOf(HTMLElement)) {
            return;
        }
        this.componentHandle = null;
        this.viewContainer = container;
        this.wasMobileContainerVisible = false;
        setupNotebookNavigatorViewContainer(container, {
            useFloatingToolbars: this.plugin.settings.useFloatingToolbars
        });

        this.plugin.registerSettingsUpdateListener(this.settingsUpdateListenerId, () => {
            this.updatePlatformClasses();
        });
        this.updatePlatformClasses();

        this.root = createRoot(container, { identifierPrefix: TPS_NOTEBOOK_NAVIGATOR_REACT_ID_PREFIX });
        this.root.render(
            <React.StrictMode>
                <SettingsProvider plugin={this.plugin}>
                    <UXPreferencesProvider plugin={this.plugin}>
                        <RecentDataProvider plugin={this.plugin}>
                            <ServicesProvider plugin={this.plugin}>
                                <ShortcutsProvider>
                                    <StorageProvider app={this.plugin.app} api={this.plugin.api}>
                                        <ExpansionProvider>
                                            <SelectionProvider
                                                app={this.plugin.app}
                                                api={this.plugin.api}
                                                tagTreeService={this.plugin.tagTreeService}
                                                propertyTreeService={this.plugin.propertyTreeService}
                                                // Wrap bound methods in arrow functions to maintain proper this context and satisfy eslint @typescript-eslint/unbound-method
                                                onFileRename={(listenerId, callback) =>
                                                    this.plugin.registerFileRenameListener(listenerId, callback)
                                                }
                                                onFileRenameUnsubscribe={listenerId => this.plugin.unregisterFileRenameListener(listenerId)}
                                            >
                                                <UIStateProvider>
                                                    <InternalDragSessionProvider>
                                                        <TooltipProvider>
                                                            <NotebookNavigatorContainer ref={this.setComponentHandle} />
                                                        </TooltipProvider>
                                                    </InternalDragSessionProvider>
                                                </UIStateProvider>
                                            </SelectionProvider>
                                        </ExpansionProvider>
                                    </StorageProvider>
                                </ShortcutsProvider>
                            </ServicesProvider>
                        </RecentDataProvider>
                    </UXPreferencesProvider>
                </SettingsProvider>
            </React.StrictMode>
        );

        // Propagate font compensation to the mobile root element after React renders.
        // Uses multiple timing strategies since React render timing varies on Android.
        if (Platform.isAndroidApp) {
            // Attempts to find and apply compensation to the mobile root element
            const applyToMobileRoot = () => {
                const mobileRoot = container.querySelector('.nn-split-container.nn-mobile');
                if (!(mobileRoot instanceof HTMLElement)) {
                    return false;
                }
                propagateAndroidFontCompensationToMobileRoot(container);
                return true;
            };

            const attemptPropagation = () => {
                if (applyToMobileRoot()) {
                    return true;
                }
                return false;
            };

            // If mobile root doesn't exist yet, wait for React to render it
            if (!attemptPropagation()) {
                // Watch for DOM changes in case React renders asynchronously
                const observer = new MutationObserver(() => {
                    if (attemptPropagation()) {
                        observer.disconnect();
                    }
                });
                observer.observe(container, { childList: true, subtree: true });
                // Try after next paint in case React batches synchronously
                window.requestAnimationFrame(() => {
                    if (attemptPropagation()) {
                        observer.disconnect();
                    }
                });
                // Fallback timeouts at 100ms, 200ms, and 500ms for slow renders
                window.setTimeout(() => {
                    if (attemptPropagation()) {
                        observer.disconnect();
                        return;
                    }
                    window.setTimeout(() => {
                        if (attemptPropagation()) {
                            observer.disconnect();
                            return;
                        }
                        window.setTimeout(() => {
                            attemptPropagation();
                            observer.disconnect();
                        }, 500);
                    }, 200);
                }, 100);
                // Ensure observer is cleaned up after max wait time
                window.setTimeout(() => observer.disconnect(), 500);
            }
        }
    }

    /**
     * Called when the view is closed/destroyed
     * Properly unmounts the React application to prevent memory leaks
     * Cleans up any view-specific classes and resources
     */
    async onClose() {
        // Unmount the React app when the view is closed to prevent memory leaks
        const container = this.containerEl.children[1];
        if (!container.instanceOf(HTMLElement)) {
            return;
        }
        this.plugin.unregisterSettingsUpdateListener(this.settingsUpdateListenerId);
        this.viewContainer = null;
        this.wasMobileContainerVisible = false;
        this.root?.unmount();
        teardownNotebookNavigatorViewContainer(container);
        this.componentHandle = null;
        this.resolveReadyWaiters(false);
        this.root = null;
    }

    async whenReady(): Promise<boolean> {
        if (this.componentHandle) {
            return true;
        }

        if (!this.root) {
            return false;
        }

        return new Promise(resolve => {
            this.readyWaiters.add(resolve);
        });
    }

    /**
     * Stops all background content processing (providers) within this view's React tree
     */
    stopContentProcessing() {
        this.componentHandle?.stopContentProcessing();
    }

    /**
     * Triggers a complete cache rebuild through the component hierarchy.
     * Clears and rebuilds all cached data from the current vault state.
     */
    async rebuildCache(): Promise<void> {
        // Delegate to the main component which handles the actual rebuild
        const handle = this.componentHandle;
        if (!handle) {
            throw new Error('Navigator not ready');
        }
        await handle.rebuildCache();
    }

    /**
     * Navigates to a file by revealing it in its actual parent folder.
     * Returns false when the file cannot be revealed in navigator context,
     * including hidden files while hidden items are off.
     */
    navigateToFile(file: TFile, options?: RevealFileOptions) {
        return this.componentHandle?.navigateToFile(file, options) ?? false;
    }

    /**
     * Navigates directly to the provided folder path
     */
    navigateToFolder(folder: TFolder | string, options?: NavigateToFolderOptions) {
        return this.componentHandle?.navigateToFolder(folder, options) ?? false;
    }

    /**
     * Navigates directly to the provided tag path
     */
    navigateToTag(tagPath: string, options?: NavigateToTagOptions) {
        return this.componentHandle?.navigateToTag(tagPath, options) ?? null;
    }

    /**
     * Navigates directly to the provided property node id
     */
    navigateToProperty(propertyNodeId: string, options?: NavigateToPropertyOptions) {
        return this.componentHandle?.navigateToProperty(propertyNodeId, options) ?? null;
    }

    /**
     * Navigates directly to a TPS Type collection id.
     */
    navigateToType(typeId: string, options?: NavigateToTypeOptions) {
        return this.componentHandle?.navigateToType(typeId, options) ?? null;
    }

    /** Focuses one exact row only when it is currently rendered in this view. */
    focusRow(target: NavigatorRowFocusTarget): boolean {
        return this.componentHandle?.focusRow(target) ?? false;
    }

    /** Returns a pull-based immutable snapshot of this view's composed list. */
    getListSnapshot(): NavigatorListSnapshot | null {
        return this.componentHandle?.getListSnapshot() ?? null;
    }

    /** Applies a guarded search update without changing navigation scope. */
    async setListSearch(update: NavigatorListSearchUpdate | null): Promise<boolean> {
        return (await this.componentHandle?.setListSearch(update)) ?? false;
    }

    /** Applies one atomic per-scope presentation update. */
    async setListPresentation(update: NavigatorListPresentationUpdate): Promise<boolean> {
        return (await this.componentHandle?.setListPresentation(update)) ?? false;
    }

    /** Toggles descendant inclusion for this view's current folder, tag, or property scope. */
    async toggleDescendants(): Promise<boolean> {
        return (await this.componentHandle?.toggleDescendants()) ?? false;
    }

    /**
     * Reveals a file while attempting to preserve the current navigation context
     */
    revealFileInNearestFolder(file: TFile, options?: RevealFileOptions) {
        this.componentHandle?.revealFileInNearestFolder(file, options);
    }

    /**
     * Moves focus to the visible pane without forcing a view switch
     */
    focusVisiblePane() {
        this.componentHandle?.focusVisiblePane();
    }

    /**
     * Moves focus to the navigation pane explicitly
     */
    focusNavigationPane() {
        this.componentHandle?.focusNavigationPane();
    }

    isDualPaneAutoFallbackActive(): boolean {
        return this.componentHandle?.isDualPaneAutoFallbackActive() ?? false;
    }

    /**
     * Deletes selected files.
     */
    deleteSelectedFiles() {
        this.componentHandle?.deleteSelectedFiles();
    }

    /**
     * Merges selected Markdown notes.
     */
    async mergeSelectedFiles(): Promise<void> {
        await this.componentHandle?.mergeSelectedFiles();
    }

    /**
     * Creates a new note in the currently selected folder
     */
    async createNoteInSelectedFolder(openInNewTab = false): Promise<void> {
        await this.componentHandle?.createNoteInSelectedFolder(openInNewTab);
    }

    /**
     * Creates a new note from a template in the currently selected folder
     */
    async createNoteFromTemplateInSelectedFolder(): Promise<void> {
        await this.componentHandle?.createNoteFromTemplateInSelectedFolder();
    }

    /**
     * Moves selected files to another folder using the folder suggest modal
     */
    async moveSelectedFiles(): Promise<void> {
        await this.componentHandle?.moveSelectedFiles();
    }

    /**
     * Moves to the previous folder, tag, or property in list-pane history
     */
    async navigateBack(): Promise<boolean> {
        return (await this.componentHandle?.navigateBack()) ?? false;
    }

    /**
     * Moves to the next folder, tag, or property in list-pane history
     */
    async navigateForward(): Promise<boolean> {
        return (await this.componentHandle?.navigateForward()) ?? false;
    }

    /**
     * Selects the next file in the current navigator view
     */
    async selectNextFileInCurrentView(): Promise<boolean> {
        return (await this.componentHandle?.selectNextFile()) ?? false;
    }

    /**
     * Selects the previous file in the current navigator view
     */
    async selectPreviousFileInCurrentView(): Promise<boolean> {
        return (await this.componentHandle?.selectPreviousFile()) ?? false;
    }

    /**
     * Adds the current navigator selection or active file to shortcuts
     */
    async addShortcutForCurrentSelection(): Promise<void> {
        await this.componentHandle?.addShortcutForCurrentSelection();
    }

    /**
     * Opens the shortcut at the given 1-based position in the shortcuts list.
     */
    async openShortcutByNumber(shortcutNumber: number): Promise<boolean> {
        return (await this.componentHandle?.openShortcutByNumber(shortcutNumber)) ?? false;
    }

    /**
     * Navigate to a folder by showing the folder suggest modal
     */
    async navigateToFolderWithModal(): Promise<void> {
        this.componentHandle?.navigateToFolderWithModal();
    }

    /**
     * Navigate to a tag by showing the tag suggest modal
     */
    async navigateToTagWithModal(): Promise<void> {
        this.componentHandle?.navigateToTagWithModal();
    }

    /**
     * Navigate to a property by showing the property suggest modal
     */
    async navigateToPropertyWithModal(): Promise<void> {
        this.componentHandle?.navigateToPropertyWithModal();
    }

    /**
     * Sets the list pane search query to a date token.
     */
    addDateFilterToSearch(dateToken: string): void {
        this.componentHandle?.addDateFilterToSearch(dateToken);
    }

    /**
     * Add a tag to the currently selected files
     */
    async addTagToSelectedFiles(): Promise<void> {
        await this.componentHandle?.addTagToSelectedFiles();
    }

    /**
     * Set a property on the currently selected files
     */
    async setPropertyOnSelectedFiles(): Promise<void> {
        await this.componentHandle?.setPropertyOnSelectedFiles();
    }

    /**
     * Remove a tag from the currently selected files
     */
    async removeTagFromSelectedFiles(): Promise<void> {
        await this.componentHandle?.removeTagFromSelectedFiles();
    }

    /**
     * Remove all tags from the currently selected files
     */
    async removeAllTagsFromSelectedFiles(): Promise<void> {
        await this.componentHandle?.removeAllTagsFromSelectedFiles();
    }

    /**
     * Toggle search in the file list
     */
    toggleSearch(): void {
        this.componentHandle?.toggleSearch();
    }

    /**
     * Open or focus search with descendant files included for the current scope.
     */
    searchWithDescendants(): void {
        this.componentHandle?.searchWithDescendants();
    }

    /**
     * Trigger collapse/expand all
     */
    triggerCollapse(): void {
        this.componentHandle?.triggerCollapse();
    }

    /**
     * Trigger list-pane group header collapse/expand
     */
    triggerListGroupCollapse(): boolean {
        return this.componentHandle?.triggerListGroupCollapse() ?? false;
    }

    /**
     * Trigger collapse/expand for the selected navigation item
     */
    triggerSelectedItemCollapse(): boolean {
        return this.componentHandle?.triggerSelectedItemCollapse() ?? false;
    }

    /**
     * Called when view is resized
     * Triggered when the view dimensions change, including:
     * - Mobile drawer animations (swipe to show/hide)
     * - Desktop pane resizing
     * - Window size changes
     *
     * Every platform forwards this authoritative ItemView lifecycle signal to the list
     * virtualizer. ResizeObserver delivery alone is not reliable when Chromium restores a
     * background leaf or Obsidian finishes a workspace layout transition.
     *
     * Mobile visibility detection:
     * On mobile, when the plugin drawer is hidden (display: none), dimensions are 0x0.
     * When the drawer becomes visible again, dimensions become > 0.
     * We use this as a visibility lifecycle event (similar to iOS/Android's viewDidAppear)
     * to trigger auto-scroll to the selected file, ensuring users see their current file
     * when returning to the navigator after it was hidden.
     *
     * This solves the issue where users:
     * 1. Have the navigator open with a file selected
     * 2. Swipe away to edit files in the editor
     * 3. Open different files while navigator is hidden
     * 4. Swipe back to the navigator
     * 5. Expect to see the currently active file (but without this, the virtualizer wouldn't scroll at all
     *    because the file selection changed while the component was hidden/display:none)
     */
    onResize() {
        const rect = this.containerEl.getBoundingClientRect();
        dispatchNavigatorViewportChange(this.containerEl);

        if (!Platform.isMobile) return;

        const isVisible = rect.width > 0 && rect.height > 0;

        if (!isVisible) {
            this.wasMobileContainerVisible = false;
            return;
        }

        if (!this.wasMobileContainerVisible) {
            this.wasMobileContainerVisible = true;
            window.dispatchEvent(new CustomEvent(TPS_NOTEBOOK_NAVIGATOR_VISIBLE_EVENT));
        }
    }
}
