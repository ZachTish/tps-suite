/*
 * TPS Notebook Navigator - provider-row context-menu event ownership.
 */

import { EMPTY_LIST_MENU_TYPE, type MenuConfig } from './menuTypes';

const PROVIDER_ROW_SELECTOR = '.nn-provider-row';
const PROVIDER_ROW_ACTION_SELECTOR = '.nn-provider-row[data-provider-context-menu="true"]';

type ContextMenuEventControls = Pick<MouseEvent, 'preventDefault' | 'stopPropagation'>;
type ClosestTarget = Pick<Element, 'closest'>;

export type ProviderRowContextMenuRoute = 'continue' | 'defer-to-provider' | 'consumed';

/**
 * Routes provider-row events before the list pane builds its empty-area menu.
 * Action-capable rows must remain unconsumed so React's delegated handler can
 * build the provider menu at the root. Rows without actions are consumed here.
 */
export function routeProviderRowContextMenu(
    event: ContextMenuEventControls,
    menuType: MenuConfig['type'],
    targetElement: ClosestTarget | null
): ProviderRowContextMenuRoute {
    if (menuType !== EMPTY_LIST_MENU_TYPE || !targetElement) {
        return 'continue';
    }
    if (targetElement.closest(PROVIDER_ROW_ACTION_SELECTOR)) {
        return 'defer-to-provider';
    }
    if (!targetElement.closest(PROVIDER_ROW_SELECTOR)) {
        return 'continue';
    }

    event.preventDefault();
    event.stopPropagation();
    return 'consumed';
}

/**
 * Prevents transient provider rows from inheriting the list pane's empty-area menu.
 * Browsers route both pointer right-clicks and native mobile long-presses through the
 * same `contextmenu` handler, so consuming the event here protects both paths.
 */
export function consumeProviderRowEmptyListContextMenu(
    event: ContextMenuEventControls,
    menuType: MenuConfig['type'],
    targetElement: ClosestTarget | null
): boolean {
    return routeProviderRowContextMenu(event, menuType, targetElement) === 'consumed';
}
