/* TPS Notebook Navigator - section label ordering through existing preferences. */

import type { Menu } from 'obsidian';
import type NotebookNavigatorPlugin from '../../main';
import { strings } from '../../i18n';
import type { TagSortOrder, TypeNavigationSortOrder } from '../../settings/types';
import { NavigationSectionId } from '../../types';
import { setSubmenuOnClick, tryCreateSubmenu } from './menuAsyncHelpers';

interface NavigationLabelSortMenuParams {
    menu: Menu;
    sectionId: NavigationSectionId;
    plugin: NotebookNavigatorPlugin;
    onReorderNavigation: () => void;
}

/** Only arranges navigation labels; membership and note-list sorting keep their existing owners. */
export function addNavigationLabelSortMenu({ menu, sectionId, plugin, onReorderNavigation }: NavigationLabelSortMenuParams): boolean {
    const isFileTypes = sectionId === NavigationSectionId.TYPES;
    if (!isFileTypes && sectionId !== NavigationSectionId.PROPERTIES) {
        return false;
    }

    const labels = strings.settings.items.propertySortOrder.options;
    const currentOrder = isFileTypes ? plugin.settings.typeNavigationSortOrder : plugin.getPropertySortOrder();
    const hasManualOrder = isFileTypes ? currentOrder === 'manual' : plugin.settings.rootPropertyOrder.length > 0;

    menu.addItem(item => {
        item.setTitle(strings.paneHeader.changeChildSortOrder).setIcon('lucide-list-filter');
        const submenu = tryCreateSubmenu(item);
        if (!submenu) {
            item.setDisabled(true);
            return;
        }

        const addTypeChoice = (order: TypeNavigationSortOrder, title: string) => {
            submenu.addItem(choice => {
                setSubmenuOnClick(menu, choice.setTitle(title).setChecked(currentOrder === order), async () => {
                    if (plugin.settings.typeNavigationSortOrder === order) return;
                    plugin.settings.typeNavigationSortOrder = order;
                    await plugin.saveSettingsAndUpdate();
                });
            });
        };
        const addPropertyChoice = (order: TagSortOrder, title: string) => {
            submenu.addItem(choice => {
                setSubmenuOnClick(menu, choice.setTitle(title).setChecked(!hasManualOrder && currentOrder === order), async () => {
                    const hadManualOrder = plugin.settings.rootPropertyOrder.length > 0;
                    const orderChanged = plugin.getPropertySortOrder() !== order;
                    if (!hadManualOrder && !orderChanged) return;

                    // An explicit automatic choice supersedes the root's manual order.
                    // Keep the existing local/synced preference writer authoritative.
                    if (hadManualOrder) plugin.settings.rootPropertyOrder = [];
                    plugin.setPropertySortOrder(order);
                    if (hadManualOrder && (!orderChanged || plugin.isLocal('propertySortOrder'))) {
                        await plugin.saveSettingsAndUpdate();
                    }
                });
            });
        };

        if (isFileTypes) {
            addTypeChoice('catalog', 'Default order');
            addTypeChoice('alpha-asc', labels.alphaAsc);
            addTypeChoice('alpha-desc', labels.alphaDesc);
            addTypeChoice('count-desc', `${labels.frequency} (${labels.highToLow})`);
            addTypeChoice('count-asc', `${labels.frequency} (${labels.lowToHigh})`);
        } else {
            addPropertyChoice('alpha-asc', labels.alphaAsc);
            addPropertyChoice('alpha-desc', labels.alphaDesc);
            addPropertyChoice('frequency-desc', `${labels.frequency} (${labels.highToLow})`);
            addPropertyChoice('frequency-asc', `${labels.frequency} (${labels.lowToHigh})`);
        }

        submenu.addSeparator();
        submenu.addItem(choice => {
            setSubmenuOnClick(
                menu,
                choice.setTitle(strings.paneHeader.reorderRootFolders).setIcon('lucide-arrow-up-down').setChecked(hasManualOrder),
                onReorderNavigation
            );
        });
    });
    return true;
}
