/*
 * TPS Notebook Navigator - isolated provider-row context-menu construction.
 */

import type { Menu, MenuItem, TFile } from 'obsidian';
import type { NavigatorRowMenuExtensionContext, NavigatorRowMenuTarget } from '../../api/types';
import type { NavigatorProvidedRow } from '../../services/rows/types';
import { isPromiseLike } from '../async';

type ProviderRowMenu = Pick<Menu, 'addItem' | 'addSeparator' | 'showAtMouseEvent' | 'showAtPosition'>;
type ProviderRowMenuExtensionAppender = (controls: Pick<NavigatorRowMenuExtensionContext, 'addItem' | 'addSeparator'>) => boolean | void;

function warn(message: string, row: NavigatorProvidedRow, error?: unknown): void {
    console.warn(`[TPS Notebook Navigator] ${message}`, {
        providerId: row.providerId,
        rowId: row.id,
        ...(error === undefined ? {} : { error })
    });
}

/** Creates the immutable, host-validated target exposed to row-menu integrations. */
export function createNavigatorRowMenuTarget(
    row: NavigatorProvidedRow,
    file: TFile,
    typeId: string | null,
    checkboxState?: NavigatorRowMenuTarget['checkbox']
): NavigatorRowMenuTarget | null {
    if (file.path !== row.sourcePath) {
        return null;
    }

    const sourceCheckbox =
        checkboxState === undefined
            ? row.indicator
                ? { checked: row.indicator.checked, ...(row.indicator.marker === undefined ? {} : { marker: row.indicator.marker }) }
                : null
            : checkboxState;
    const checkbox = sourceCheckbox ? Object.freeze({ ...sourceCheckbox }) : null;
    return Object.freeze({
        providerId: row.providerId,
        rowId: row.id,
        kind: row.kind,
        label: row.label,
        file,
        sourcePath: row.sourcePath,
        ...(row.sourceLineNumber === undefined ? {} : { sourceLineNumber: row.sourceLineNumber }),
        typeId,
        checkbox
    });
}

/**
 * Builds a provider-owned menu synchronously and returns the number of items
 * successfully handed to Obsidian. A provider never receives the Menu itself.
 */
export function buildProviderRowContextMenu(
    menu: Pick<Menu, 'addItem' | 'addSeparator'>,
    row: NavigatorProvidedRow,
    appendExtensions?: ProviderRowMenuExtensionAppender
): number {
    const builder = row.contextMenu;
    if (!builder && !appendExtensions) {
        return 0;
    }

    let isBuilding = true;
    let addedItems = 0;
    let separatorPending = false;
    let menuInvalid = false;
    const addItem = (configure: (item: MenuItem) => void): void => {
        if (!isBuilding) {
            warn('Provider row context-menu builder attempted to add items asynchronously.', row);
            return;
        }
        if (typeof configure !== 'function') {
            warn('Provider row context-menu builder supplied an invalid item callback.', row);
            return;
        }

        if (separatorPending && addedItems > 0) {
            try {
                menu.addSeparator();
            } catch (error) {
                menuInvalid = true;
                warn('Provider row context-menu addSeparator failed.', row, error);
                return;
            } finally {
                separatorPending = false;
            }
        }

        let configured = false;
        let initializerFailed = false;
        let initializerError: unknown;
        try {
            menu.addItem(item => {
                try {
                    const result: unknown = configure(item);
                    if (isPromiseLike(result)) {
                        const error = new Error(
                            'Provider row context-menu item returned a Promise; item initializers must be synchronous.'
                        );
                        initializerFailed = true;
                        initializerError = error;
                        void Promise.resolve(result).catch(asyncError => {
                            warn('Provider row asynchronous context-menu item failed.', row, asyncError);
                        });
                        throw error;
                    }
                    configured = true;
                } catch (error) {
                    initializerFailed = true;
                    initializerError = error;
                    throw error;
                }
            });
        } catch (error) {
            menuInvalid = true;
            warn(
                initializerFailed ? 'Provider row context-menu item failed.' : 'Provider row context-menu addItem failed.',
                row,
                initializerFailed ? initializerError : error
            );
            return;
        }

        if (initializerFailed || !configured) {
            menuInvalid = true;
            warn(
                initializerFailed
                    ? 'Provider row context-menu item failed.'
                    : 'Provider row context-menu host did not initialize the requested item.',
                row,
                initializerError
            );
            return;
        }
        addedItems += 1;
    };
    const addSeparator = (): void => {
        if (!isBuilding) {
            warn('Provider row context-menu builder attempted to add a separator asynchronously.', row);
            return;
        }
        if (addedItems > 0) {
            separatorPending = true;
        }
    };
    const identity = {
        providerId: row.providerId,
        rowId: row.id,
        kind: row.kind,
        sourcePath: row.sourcePath,
        ...(row.sourceLineNumber === undefined ? {} : { sourceLineNumber: row.sourceLineNumber }),
        addItem,
        addSeparator
    };
    const context = Object.freeze(identity);

    if (builder) {
        try {
            const result: unknown = builder(context);
            if (isPromiseLike(result)) {
                menuInvalid = true;
                warn('Provider row context-menu builder returned a Promise; menu builders must be synchronous.', row);
                void Promise.resolve(result).catch(error => {
                    warn('Provider row asynchronous context-menu builder failed.', row, error);
                });
            }
        } catch (error) {
            warn('Provider row context-menu builder failed.', row, error);
        }
    }

    if (appendExtensions) {
        try {
            const result: unknown = appendExtensions({ addItem, addSeparator });
            if (result === false) {
                menuInvalid = true;
            } else if (isPromiseLike(result)) {
                menuInvalid = true;
                warn('Provider row menu extension host returned a Promise; menu builders must be synchronous.', row);
                void Promise.resolve(result).catch(error => {
                    warn('Provider row asynchronous menu extension host failed.', row, error);
                });
            }
        } catch (error) {
            warn('Provider row menu extension host failed.', row, error);
        }
    }

    isBuilding = false;
    return menuInvalid ? 0 : addedItems;
}

/** Shows a non-empty provider menu at a desktop right-click or native mobile long-press event. */
export function showProviderRowContextMenuAtMouseEvent(
    menu: ProviderRowMenu,
    row: NavigatorProvidedRow,
    event: MouseEvent,
    appendExtensions?: ProviderRowMenuExtensionAppender
): boolean {
    if (buildProviderRowContextMenu(menu, row, appendExtensions) === 0) {
        return false;
    }
    menu.showAtMouseEvent(event);
    return true;
}

/** Shows a non-empty provider menu beside the accessible More actions button. */
export function showProviderRowContextMenuAtPosition(
    menu: ProviderRowMenu,
    row: NavigatorProvidedRow,
    position: { x: number; y: number },
    appendExtensions?: ProviderRowMenuExtensionAppender
): boolean {
    if (buildProviderRowContextMenu(menu, row, appendExtensions) === 0) {
        return false;
    }
    menu.showAtPosition(position);
    return true;
}
