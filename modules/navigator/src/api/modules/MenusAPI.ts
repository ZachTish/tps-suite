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

import { Menu, MenuItem, TFile, TFolder } from 'obsidian';
import type {
    FileMenuExtensionContext,
    FolderMenuExtensionContext,
    TagMenuExtensionContext,
    PropertyMenuExtensionContext,
    TypeMenuExtensionContext,
    NavigatorRowMenuExtensionContext,
    NavigatorRowMenuExtensionOptions,
    NavigatorRowMenuTarget,
    NavigatorTypeDescriptor,
    FileMenuSelectionMode
} from '../types';
import { isPromiseLike } from '../../utils/async';

export type MenuExtensionDispose = () => void;

export type {
    FileMenuExtensionContext,
    FolderMenuExtensionContext,
    TagMenuExtensionContext,
    PropertyMenuExtensionContext,
    TypeMenuExtensionContext,
    NavigatorRowMenuExtensionContext,
    NavigatorRowMenuExtensionOptions,
    NavigatorRowMenuTarget,
    FileMenuSelectionMode
};

export type FileMenuExtension = (context: FileMenuExtensionContext) => void;
export type FolderMenuExtension = (context: FolderMenuExtensionContext) => void;
export type TagMenuExtension = (context: TagMenuExtensionContext) => void;
export type PropertyMenuExtension = (context: PropertyMenuExtensionContext) => void;
export type TypeMenuExtension = (context: TypeMenuExtensionContext) => void;
export type RowMenuExtension = (context: NavigatorRowMenuExtensionContext) => void;

type FileMenuExtensionApplyContext = {
    menu: Menu;
    file: TFile;
    selection: {
        mode: FileMenuSelectionMode;
        files: readonly TFile[];
    };
};

type FolderMenuExtensionApplyContext = {
    menu: Menu;
    folder: TFolder;
};

type TagMenuExtensionApplyContext = {
    menu: Menu;
    tag: string;
};

type PropertyMenuExtensionApplyContext = {
    menu: Menu;
    nodeId: string;
};

type TypeMenuExtensionApplyContext = {
    menu: Menu;
    typeId: string;
    descriptor: NavigatorTypeDescriptor;
};

type RowMenuExtensionApplyContext = {
    target: NavigatorRowMenuTarget;
    addItem: (cb: (item: MenuItem) => void) => void;
    addSeparator: () => void;
};

interface RowMenuExtensionRegistration {
    readonly callback: RowMenuExtension;
    readonly supports?: (target: NavigatorRowMenuTarget) => boolean;
}

type MenuExtensionContextBase = {
    addItem: (cb: (item: MenuItem) => void) => void;
};

interface MenuExtensionApplyResult {
    addedItems: number;
    valid: boolean;
}

interface MenuExtensionRegistration<TCallback> {
    readonly callback: TCallback;
}

/**
 * Menu extension API - Allow other plugins to add items to Notebook Navigator context menus.
 */
export class MenusAPI {
    private fileMenuExtensions = new Set<MenuExtensionRegistration<FileMenuExtension>>();
    private folderMenuExtensions = new Set<MenuExtensionRegistration<FolderMenuExtension>>();
    private tagMenuExtensions = new Set<MenuExtensionRegistration<TagMenuExtension>>();
    private propertyMenuExtensions = new Set<MenuExtensionRegistration<PropertyMenuExtension>>();
    private typeMenuExtensions = new Set<MenuExtensionRegistration<TypeMenuExtension>>();
    private rowMenuExtensions = new Set<RowMenuExtensionRegistration>();
    private rowMenuListeners = new Set<() => void>();
    private rowMenuRevision = 0;

    registerFileMenu(callback: FileMenuExtension): MenuExtensionDispose {
        return this.registerExtension(this.fileMenuExtensions, callback);
    }

    registerFolderMenu(callback: FolderMenuExtension): MenuExtensionDispose {
        return this.registerExtension(this.folderMenuExtensions, callback);
    }

    registerTagMenu(callback: TagMenuExtension): MenuExtensionDispose {
        return this.registerExtension(this.tagMenuExtensions, callback);
    }

    registerPropertyMenu(callback: PropertyMenuExtension): MenuExtensionDispose {
        return this.registerExtension(this.propertyMenuExtensions, callback);
    }

    registerTypeMenu(callback: TypeMenuExtension): MenuExtensionDispose {
        return this.registerExtension(this.typeMenuExtensions, callback);
    }

    registerRowMenu(callback: RowMenuExtension, options: NavigatorRowMenuExtensionOptions = {}): MenuExtensionDispose {
        if (typeof callback !== 'function') {
            throw new Error('Navigator row menu extension must be a function.');
        }
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new Error('Navigator row menu extension options must be a record.');
        }
        if (options.supports !== undefined && typeof options.supports !== 'function') {
            throw new Error('Navigator row menu extension supports must be a function.');
        }

        const registration: RowMenuExtensionRegistration = Object.freeze({
            callback,
            ...(options.supports ? { supports: options.supports } : {})
        });
        this.rowMenuExtensions.add(registration);
        this.publishRowMenuChange();

        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            if (this.rowMenuExtensions.delete(registration)) {
                this.publishRowMenuChange();
            }
        };
    }

    private registerExtension<T>(extensions: Set<MenuExtensionRegistration<T>>, callback: T): MenuExtensionDispose {
        const registration = Object.freeze({ callback });
        extensions.add(registration);
        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            extensions.delete(registration);
        };
    }

    private applyExtensions<TContext extends MenuExtensionContextBase>(
        extensions: ReadonlySet<MenuExtensionRegistration<(context: TContext) => void>>,
        menu: Menu,
        errorPrefix: string,
        buildContext: (addItem: (cb: (item: MenuItem) => void) => void) => TContext
    ): MenuExtensionApplyResult {
        if (extensions.size === 0) {
            return { addedItems: 0, valid: true };
        }

        let addedItems = 0;
        let isBuildingMenu = true;
        let menuValid = true;

        const addItem = (cb: (item: MenuItem) => void) => {
            if (!isBuildingMenu) {
                console.error(
                    `Notebook Navigator ${errorPrefix} menu extension attempted to add menu items asynchronously. Add menu items synchronously and do async work in onClick handlers.`
                );
                return;
            }
            if (typeof cb !== 'function') {
                menuValid = false;
                console.error(`Notebook Navigator ${errorPrefix} menu extension supplied an invalid item callback.`);
                return;
            }

            let configured = false;
            let initializerFailed = false;
            try {
                menu.addItem(item => {
                    try {
                        const result: unknown = cb(item);
                        configured = true;
                        if (isPromiseLike(result)) {
                            menuValid = false;
                            console.error(
                                `Notebook Navigator ${errorPrefix} menu extension item returned a Promise. Item initializers must be synchronous; do async work in onClick handlers.`
                            );
                            void Promise.resolve(result).catch(error => {
                                console.error(`Notebook Navigator ${errorPrefix} asynchronous menu extension item failed`, error);
                            });
                        }
                    } catch (error) {
                        initializerFailed = true;
                        menuValid = false;
                        console.error(`Notebook Navigator ${errorPrefix} menu extension item failed`, error);
                    }
                });
            } catch (error) {
                menuValid = false;
                console.error(`Notebook Navigator ${errorPrefix} menu extension addItem failed`, error);
                return;
            }

            if (configured) {
                addedItems += 1;
            } else if (!initializerFailed) {
                menuValid = false;
                console.error(`Notebook Navigator ${errorPrefix} menu extension host did not initialize the requested item.`);
            }
        };

        const extensionContext = buildContext(addItem);
        for (const { callback: extension } of Array.from(extensions)) {
            const addedBeforeExtension = addedItems;
            try {
                const result: unknown = extension(extensionContext);
                if (isPromiseLike(result)) {
                    menuValid = false;
                    console.error(
                        `Notebook Navigator ${errorPrefix} menu extension returned a Promise. Add menu items synchronously and do async work in onClick handlers.`
                    );
                    void Promise.resolve(result).catch(error => {
                        console.error(`Notebook Navigator ${errorPrefix} menu extension failed`, error);
                    });
                }
            } catch (error) {
                if (addedItems > addedBeforeExtension) {
                    menuValid = false;
                }
                console.error(`Notebook Navigator ${errorPrefix} menu extension failed`, error);
            }
        }

        isBuildingMenu = false;
        return { addedItems, valid: menuValid };
    }

    /**
     * Calls registered file menu extensions and returns number of items added.
     * @internal
     */
    applyFileMenuExtensions(context: FileMenuExtensionApplyContext): number {
        const { menu, file, selection } = context;
        const frozenSelection = Object.freeze({
            mode: selection.mode,
            files: Object.freeze([...selection.files])
        });

        return this.applyExtensions<FileMenuExtensionContext>(this.fileMenuExtensions, menu, 'file', addItem => ({
            addItem,
            file,
            selection: frozenSelection
        })).addedItems;
    }

    /**
     * Calls registered folder menu extensions and returns number of items added.
     * @internal
     */
    applyFolderMenuExtensions(context: FolderMenuExtensionApplyContext): number {
        const { menu, folder } = context;
        return this.applyExtensions<FolderMenuExtensionContext>(this.folderMenuExtensions, menu, 'folder', addItem => ({
            addItem,
            folder
        })).addedItems;
    }

    /**
     * Calls registered tag menu extensions and returns number of items added.
     * @internal
     */
    applyTagMenuExtensions(context: TagMenuExtensionApplyContext): number {
        const { menu, tag } = context;
        return this.applyExtensions<TagMenuExtensionContext>(this.tagMenuExtensions, menu, 'tag', addItem => ({
            addItem,
            tag
        })).addedItems;
    }

    /**
     * Calls registered property menu extensions and returns number of items added.
     * @internal
     */
    applyPropertyMenuExtensions(context: PropertyMenuExtensionApplyContext): number {
        const { menu, nodeId } = context;
        return this.applyExtensions<PropertyMenuExtensionContext>(this.propertyMenuExtensions, menu, 'property', addItem => ({
            addItem,
            nodeId
        })).addedItems;
    }

    /**
     * Calls registered Type collection menu extensions and returns number of items added.
     * @internal
     */
    applyTypeMenuExtensions(context: TypeMenuExtensionApplyContext): number {
        const { menu, typeId, descriptor } = context;
        const frozenDescriptor = Object.freeze({ ...descriptor });
        const result = this.applyExtensions<TypeMenuExtensionContext>(this.typeMenuExtensions, menu, 'type', addItem =>
            Object.freeze({
                addItem,
                typeId,
                descriptor: frozenDescriptor
            })
        );
        return result.valid ? result.addedItems : 0;
    }

    /** @internal Monotonic snapshot used to refresh row action affordances. */
    getRowMenuRevision(): number {
        return this.rowMenuRevision;
    }

    /** @internal Subscribe to row-menu registration changes. */
    subscribeRowMenuExtensions(listener: () => void): () => void {
        this.rowMenuListeners.add(listener);
        return () => this.rowMenuListeners.delete(listener);
    }

    /** @internal Whether at least one current registration supports this row. */
    hasRowMenuExtensions(target: NavigatorRowMenuTarget): boolean {
        return this.getMatchingRowMenuExtensions(this.freezeRowMenuTarget(target)).length > 0;
    }

    /**
     * Builds registered row actions through the same restricted item/separator
     * facade used by row owners. The host menu is never exposed.
     * @internal
     */
    applyRowMenuExtensions({ target, addItem, addSeparator }: RowMenuExtensionApplyContext): boolean {
        const frozenTarget = this.freezeRowMenuTarget(target);
        const registrations = this.getMatchingRowMenuExtensions(frozenTarget);
        if (registrations.length === 0) {
            return true;
        }

        let isBuildingMenu = true;
        let menuValid = true;
        const guardedAddItem = (cb: (item: MenuItem) => void) => {
            if (!isBuildingMenu) {
                console.error(
                    'Notebook Navigator row menu extension attempted to add menu items asynchronously. Add menu items synchronously and do async work in onClick handlers.'
                );
                return;
            }
            addItem(cb);
        };
        const guardedAddSeparator = () => {
            if (!isBuildingMenu) {
                console.error(
                    'Notebook Navigator row menu extension attempted to add a separator asynchronously. Add menu entries synchronously.'
                );
                return;
            }
            addSeparator();
        };
        const extensionContext = Object.freeze({
            addItem: guardedAddItem,
            addSeparator: guardedAddSeparator,
            target: frozenTarget
        });

        for (const registration of registrations) {
            try {
                const result: unknown = registration.callback(extensionContext);
                if (isPromiseLike(result)) {
                    menuValid = false;
                    console.error(
                        'Notebook Navigator row menu extension returned a Promise. Add menu entries synchronously and do async work in onClick handlers.'
                    );
                    void Promise.resolve(result).catch(error => {
                        console.error('Notebook Navigator row menu extension failed', error);
                    });
                }
            } catch (error) {
                console.error('Notebook Navigator row menu extension failed', error);
            }
        }

        isBuildingMenu = false;
        return menuValid;
    }

    private getMatchingRowMenuExtensions(target: NavigatorRowMenuTarget): RowMenuExtensionRegistration[] {
        const matches: RowMenuExtensionRegistration[] = [];
        for (const registration of this.rowMenuExtensions) {
            if (!registration.supports) {
                matches.push(registration);
                continue;
            }
            try {
                const result: unknown = registration.supports(target);
                if (isPromiseLike(result)) {
                    console.error(
                        'Notebook Navigator row menu extension supports returned a Promise. Filters must be synchronous and side-effect-free.'
                    );
                    void Promise.resolve(result).catch(error => {
                        console.error('Notebook Navigator row menu extension supports check failed', error);
                    });
                    continue;
                }
                if (result === true) {
                    matches.push(registration);
                }
            } catch (error) {
                console.error('Notebook Navigator row menu extension supports check failed', error);
            }
        }
        return matches;
    }

    private freezeRowMenuTarget(target: NavigatorRowMenuTarget): NavigatorRowMenuTarget {
        const checkbox = target.checkbox ? Object.freeze({ ...target.checkbox }) : null;
        return Object.freeze({ ...target, checkbox });
    }

    private publishRowMenuChange(): void {
        this.rowMenuRevision += 1;
        for (const listener of this.rowMenuListeners) {
            try {
                listener();
            } catch (error) {
                console.error('Notebook Navigator row menu extension listener failed', error);
            }
        }
    }
}
