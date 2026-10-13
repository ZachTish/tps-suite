/*
 * TPS Notebook Navigator - isolated Type collection menu construction.
 */

import type React from 'react';
import { Menu } from 'obsidian';
import { INTERNAL_NOTEBOOK_NAVIGATOR_API } from '../../api/NotebookNavigatorAPI';
import type NotebookNavigatorPlugin from '../../main';
import type { TpsNavigatorTypeId } from '../../types/navigatorTypes';

interface ShowTypeCollectionContextMenuParams {
    event: React.MouseEvent<HTMLDivElement>;
    plugin: NotebookNavigatorPlugin;
    typeId: TpsNavigatorTypeId;
}

/** Shows registered actions for a current Type collection without ever opening an empty menu. */
export function showTypeCollectionContextMenu({ event, plugin, typeId }: ShowTypeCollectionContextMenuParams): boolean {
    const api = plugin.api;
    if (!api) {
        return false;
    }

    const descriptor = api.types.getSnapshot().descriptors.find(candidate => candidate.id === typeId);
    if (!descriptor) {
        return false;
    }

    const menu = new Menu();
    const addedItems = api[INTERNAL_NOTEBOOK_NAVIGATOR_API].menus.applyTypeMenuExtensions({
        menu,
        typeId,
        descriptor
    });
    if (addedItems === 0) {
        return false;
    }

    event.preventDefault();
    event.stopPropagation();
    menu.showAtMouseEvent(event.nativeEvent);
    return true;
}
