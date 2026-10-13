/* TPS Notebook Navigator - header label sorting and persistence ownership. */

import { Menu, type MenuItem } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '../../src/i18n';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { TagSortOrder, TypeNavigationSortOrder } from '../../src/settings/types';
import { NavigationSectionId } from '../../src/types';
import { addNavigationLabelSortMenu } from '../../src/utils/contextMenu/navigationLabelSortMenu';
import { showNavigationSectionContextMenu } from '../../src/utils/contextMenu/navigationSectionMenuBuilder';

interface CapturedItem {
    title: string;
    checked: boolean;
    disabled: boolean;
    submenu?: Menu;
    click?: () => unknown;
}

interface CapturedMenu {
    items: (CapturedItem | null)[];
    hide: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
}

let menus: WeakMap<Menu, CapturedMenu>;

function capture(menu: Menu): CapturedMenu {
    let state = menus.get(menu);
    if (!state) {
        state = { items: [], hide: vi.fn(), show: vi.fn() };
        menus.set(menu, state);
    }
    return state;
}

beforeEach(() => {
    menus = new WeakMap();
    Object.assign(Menu.prototype, {
        addItem(this: Menu, configure: (item: MenuItem) => void) {
            const item = {
                title: '',
                checked: false,
                disabled: false,
                submenu: undefined as Menu | undefined,
                click: undefined as (() => unknown) | undefined,
                setTitle(title: string) {
                    this.title = title;
                    return this;
                },
                setIcon() {
                    return this;
                },
                setChecked(checked: boolean) {
                    this.checked = checked;
                    return this;
                },
                setDisabled(disabled: boolean) {
                    this.disabled = disabled;
                    return this;
                },
                setWarning() {
                    return this;
                },
                onClick(handler: () => unknown) {
                    this.click = handler;
                    return this;
                },
                setSubmenu() {
                    this.submenu ??= new Menu();
                    return this.submenu;
                }
            };
            configure(item as unknown as MenuItem);
            capture(this).items.push(item);
            return this;
        },
        addSeparator(this: Menu) {
            capture(this).items.push(null);
            return this;
        },
        hide(this: Menu) {
            capture(this).hide();
            return this;
        },
        showAtMouseEvent(this: Menu, event: MouseEvent) {
            capture(this).show(event);
            return this;
        }
    });
});

afterEach(() => {
    for (const key of ['addItem', 'addSeparator', 'hide', 'showAtMouseEvent']) {
        delete (Menu.prototype as unknown as Record<string, unknown>)[key];
    }
    vi.restoreAllMocks();
});

function createPlugin(local = false) {
    const vault = {
        read: vi.fn(),
        cachedRead: vi.fn(),
        getFiles: vi.fn(),
        getMarkdownFiles: vi.fn(),
        create: vi.fn(),
        modify: vi.fn(),
        process: vi.fn(),
        rename: vi.fn()
    };
    const plugin = {
        settings: structuredClone(DEFAULT_SETTINGS),
        app: { vault },
        getPropertySortOrder: vi.fn(() => plugin.settings.propertySortOrder),
        isLocal: vi.fn(() => local),
        saveSettingsAndUpdate: vi.fn(async () => undefined),
        setPropertySortOrder: vi.fn((order: TagSortOrder) => {
            if (plugin.settings.propertySortOrder === order) return;
            plugin.settings.propertySortOrder = order;
            // Model the existing preference owner: synced settings save,
            // while local settings only update their local mirror/event.
            if (!plugin.isLocal()) void plugin.saveSettingsAndUpdate();
        })
    };
    return { plugin, vault };
}

function createHeader(sectionId: NavigationSectionId, plugin = createPlugin().plugin) {
    const menu = new Menu();
    const onReorderNavigation = vi.fn();
    const added = addNavigationLabelSortMenu({ menu, sectionId, plugin: plugin as never, onReorderNavigation });
    const root = capture(menu).items[0];
    const submenu = root?.submenu;
    return { menu, root, submenu, added, onReorderNavigation, plugin };
}

function menuItems(menu: Menu | undefined): CapturedItem[] {
    if (!menu) throw new Error('Expected a native submenu');
    return capture(menu).items.filter((item): item is CapturedItem => item !== null);
}

async function clickChoice(menu: Menu | undefined, title: string): Promise<void> {
    const item = menuItems(menu).find(candidate => candidate.title === title);
    if (!item?.click) throw new Error(`Missing menu choice: ${title}`);
    item.click();
    // Obsidian's onClick returns synchronously; runAsyncAction owns drainage.
    await Promise.resolve();
    await Promise.resolve();
}

const labels = strings.settings.items.propertySortOrder.options;
const typeChoices: [TypeNavigationSortOrder, string][] = [
    ['catalog', 'Default order'],
    ['alpha-asc', labels.alphaAsc],
    ['alpha-desc', labels.alphaDesc],
    ['count-desc', `${labels.frequency} (${labels.highToLow})`],
    ['count-asc', `${labels.frequency} (${labels.lowToHigh})`]
];
const propertyChoices: [TagSortOrder, string][] = [
    ['alpha-asc', labels.alphaAsc],
    ['alpha-desc', labels.alphaDesc],
    ['frequency-desc', `${labels.frequency} (${labels.highToLow})`],
    ['frequency-asc', `${labels.frequency} (${labels.lowToHigh})`]
];

describe('navigation section label sorting', () => {
    it.each([NavigationSectionId.FOLDERS, NavigationSectionId.TAGS, NavigationSectionId.RECENT, NavigationSectionId.SHORTCUTS])(
        'does not add or persist label controls for %s',
        sectionId => {
            const { plugin } = createPlugin();
            const result = createHeader(sectionId, plugin);
            expect(result.added).toBe(false);
            expect(capture(result.menu).items).toEqual([]);
            expect(plugin.saveSettingsAndUpdate).not.toHaveBeenCalled();
            expect(plugin.setPropertySortOrder).not.toHaveBeenCalled();
        }
    );

    it.each(typeChoices)('marks current File types mode %s and presents every mode', (order, title) => {
        const { plugin } = createPlugin();
        plugin.settings.typeNavigationSortOrder = order;
        const result = createHeader(NavigationSectionId.TYPES, plugin);
        expect(result.added).toBe(true);
        expect(result.root?.title).toBe(strings.paneHeader.changeChildSortOrder);
        expect(menuItems(result.submenu).map(item => item.title)).toEqual([
            ...typeChoices.map(choice => choice[1]),
            strings.paneHeader.reorderRootFolders
        ]);
        expect(
            menuItems(result.submenu)
                .filter(item => item.checked)
                .map(item => item.title)
        ).toEqual([title]);
        const entries = capture(result.submenu!).items;
        expect(entries[entries.length - 2]).toBeNull();
    });

    it.each(propertyChoices)('marks current Properties mode %s without a manual root override', (order, title) => {
        const { plugin } = createPlugin();
        plugin.settings.propertySortOrder = order;
        const result = createHeader(NavigationSectionId.PROPERTIES, plugin);
        expect(menuItems(result.submenu).map(item => item.title)).toEqual([
            ...propertyChoices.map(choice => choice[1]),
            strings.paneHeader.reorderRootFolders
        ]);
        expect(
            menuItems(result.submenu)
                .filter(item => item.checked)
                .map(item => item.title)
        ).toEqual([title]);
    });

    it.each([NavigationSectionId.TYPES, NavigationSectionId.PROPERTIES])(
        'shows manual state for %s and opens the existing editor without changing settings',
        async sectionId => {
            const { plugin } = createPlugin();
            plugin.settings.typeNavigationSortOrder = 'manual';
            plugin.settings.rootTypeOrder = ['file:base', 'file:markdown'];
            plugin.settings.rootPropertyOrder = ['status', 'kind'];
            const before = structuredClone(plugin.settings);
            const result = createHeader(sectionId, plugin);
            expect(
                menuItems(result.submenu)
                    .filter(item => item.checked)
                    .map(item => item.title)
            ).toEqual([strings.paneHeader.reorderRootFolders]);
            await clickChoice(result.submenu, strings.paneHeader.reorderRootFolders);
            expect(capture(result.menu).hide).toHaveBeenCalledOnce();
            expect(result.onReorderNavigation).toHaveBeenCalledOnce();
            expect(plugin.settings).toEqual(before);
            expect(plugin.saveSettingsAndUpdate).not.toHaveBeenCalled();
            expect(plugin.setPropertySortOrder).not.toHaveBeenCalled();
        }
    );

    it.each(typeChoices)('sets File types %s once and preserves stored/manual and unrelated preferences', async (order, title) => {
        const { plugin, vault } = createPlugin();
        plugin.settings.typeNavigationSortOrder = 'manual';
        plugin.settings.rootTypeOrder = ['file:base', 'file:markdown'];
        const before = structuredClone(plugin.settings);
        const result = createHeader(NavigationSectionId.TYPES, plugin);
        await clickChoice(result.submenu, title);
        expect(plugin.settings).toEqual({ ...before, typeNavigationSortOrder: order });
        expect(plugin.saveSettingsAndUpdate).toHaveBeenCalledOnce();
        expect(plugin.setPropertySortOrder).not.toHaveBeenCalled();
        expect(capture(result.menu).hide).toHaveBeenCalledOnce();
        Object.values(vault).forEach(operation => expect(operation).not.toHaveBeenCalled());
        await clickChoice(result.submenu, title);
        expect(plugin.saveSettingsAndUpdate).toHaveBeenCalledOnce();
    });

    it.each(propertyChoices)('sets Properties %s through the preference owner with one synced save', async (order, title) => {
        const { plugin, vault } = createPlugin();
        plugin.settings.propertySortOrder = order === 'alpha-asc' ? 'alpha-desc' : 'alpha-asc';
        plugin.settings.rootPropertyOrder = ['status', 'kind'];
        const before = structuredClone(plugin.settings);
        const result = createHeader(NavigationSectionId.PROPERTIES, plugin);
        await clickChoice(result.submenu, title);
        expect(plugin.settings).toEqual({ ...before, propertySortOrder: order, rootPropertyOrder: [] });
        expect(plugin.setPropertySortOrder).toHaveBeenCalledExactlyOnceWith(order);
        expect(plugin.saveSettingsAndUpdate).toHaveBeenCalledOnce();
        expect(capture(result.menu).hide).toHaveBeenCalledOnce();
        Object.values(vault).forEach(operation => expect(operation).not.toHaveBeenCalled());
        await clickChoice(result.submenu, title);
        expect(plugin.setPropertySortOrder).toHaveBeenCalledOnce();
        expect(plugin.saveSettingsAndUpdate).toHaveBeenCalledOnce();
    });

    it.each([false, true])('persists clearing a manual root when property mode is unchanged (local=%s)', async local => {
        const { plugin } = createPlugin(local);
        plugin.settings.propertySortOrder = 'alpha-asc';
        plugin.settings.rootPropertyOrder = ['kind', 'status'];
        const result = createHeader(NavigationSectionId.PROPERTIES, plugin);
        await clickChoice(result.submenu, labels.alphaAsc);
        expect(plugin.settings.rootPropertyOrder).toEqual([]);
        expect(plugin.setPropertySortOrder).toHaveBeenCalledExactlyOnceWith('alpha-asc');
        expect(plugin.saveSettingsAndUpdate).toHaveBeenCalledOnce();
    });

    it('persists clearing a manual root once when the changed preference is local', async () => {
        const { plugin } = createPlugin(true);
        plugin.settings.rootPropertyOrder = ['status', 'kind'];
        const result = createHeader(NavigationSectionId.PROPERTIES, plugin);
        await clickChoice(result.submenu, labels.alphaDesc);
        expect(plugin.settings.propertySortOrder).toBe('alpha-desc');
        expect(plugin.settings.rootPropertyOrder).toEqual([]);
        expect(plugin.setPropertySortOrder).toHaveBeenCalledExactlyOnceWith('alpha-desc');
        expect(plugin.saveSettingsAndUpdate).toHaveBeenCalledOnce();
    });

    it('leaves a changed local preference without a manual root to the existing local owner', async () => {
        const { plugin } = createPlugin(true);
        const result = createHeader(NavigationSectionId.PROPERTIES, plugin);
        await clickChoice(result.submenu, labels.alphaDesc);
        expect(plugin.settings.propertySortOrder).toBe('alpha-desc');
        expect(plugin.setPropertySortOrder).toHaveBeenCalledExactlyOnceWith('alpha-desc');
        expect(plugin.saveSettingsAndUpdate).not.toHaveBeenCalled();
    });

    it.each([NavigationSectionId.TYPES, NavigationSectionId.PROPERTIES])(
        'does no settings work for the current automatic mode (%s)',
        async sectionId => {
            const { plugin } = createPlugin();
            const result = createHeader(sectionId, plugin);
            await clickChoice(result.submenu, sectionId === NavigationSectionId.TYPES ? 'Default order' : labels.alphaAsc);
            expect(plugin.setPropertySortOrder).not.toHaveBeenCalled();
            expect(plugin.saveSettingsAndUpdate).not.toHaveBeenCalled();
            expect(capture(result.menu).hide).toHaveBeenCalledOnce();
        }
    );

    it('uses current settings when a stale File types menu choice is clicked', async () => {
        const { plugin } = createPlugin();
        const result = createHeader(NavigationSectionId.TYPES, plugin);
        plugin.settings = { ...plugin.settings, typeNavigationSortOrder: 'alpha-desc', rootTypeOrder: ['file:base'] };
        await clickChoice(result.submenu, 'Default order');
        expect(plugin.settings.typeNavigationSortOrder).toBe('catalog');
        expect(plugin.settings.rootTypeOrder).toEqual(['file:base']);
        expect(plugin.saveSettingsAndUpdate).toHaveBeenCalledOnce();
    });

    it('clears a manual Properties override added after the menu opened', async () => {
        const { plugin } = createPlugin();
        const result = createHeader(NavigationSectionId.PROPERTIES, plugin);
        plugin.settings = { ...plugin.settings, rootPropertyOrder: ['status', 'kind'] };
        await clickChoice(result.submenu, labels.alphaAsc);
        expect(plugin.settings.rootPropertyOrder).toEqual([]);
        expect(plugin.saveSettingsAndUpdate).toHaveBeenCalledOnce();
    });

    it('does not reset a concurrent Properties preference that already reached the clicked mode', async () => {
        const { plugin } = createPlugin();
        const result = createHeader(NavigationSectionId.PROPERTIES, plugin);
        plugin.settings = { ...plugin.settings, propertySortOrder: 'alpha-desc' };
        await clickChoice(result.submenu, labels.alphaDesc);
        expect(plugin.settings.propertySortOrder).toBe('alpha-desc');
        expect(plugin.setPropertySortOrder).not.toHaveBeenCalled();
        expect(plugin.saveSettingsAndUpdate).not.toHaveBeenCalled();
    });

    it('bounds a repeated menu burst to no vault reads, writes, or inventory', async () => {
        const { plugin, vault } = createPlugin();
        for (let index = 0; index < 50; index += 1) {
            const section = index % 2 === 0 ? NavigationSectionId.TYPES : NavigationSectionId.PROPERTIES;
            const result = createHeader(section, plugin);
            await clickChoice(result.submenu, labels.alphaAsc);
        }
        Object.values(vault).forEach(operation => expect(operation).not.toHaveBeenCalled());
        expect(plugin.saveSettingsAndUpdate).toHaveBeenCalledOnce();
        expect(plugin.setPropertySortOrder).not.toHaveBeenCalled();
    });

    it('wires the File types header to the native menu and existing reorder callback', async () => {
        const { plugin } = createPlugin();
        const event = { nativeEvent: {} as MouseEvent, preventDefault: vi.fn(), stopPropagation: vi.fn() };
        const onReorderNavigation = vi.fn();
        const shown = vi.spyOn(Menu.prototype, 'showAtMouseEvent');
        showNavigationSectionContextMenu({
            app: plugin.app as never,
            event: event as never,
            sectionId: NavigationSectionId.TYPES,
            allowSeparator: false,
            metadataService: {} as never,
            settings: plugin.settings,
            plugin: plugin as never,
            pinToggleLabel: 'Pin',
            isShortcutsPinned: false,
            onToggleShortcutsPin: vi.fn(),
            onConfigurePropertyKeys: vi.fn(),
            onReorderNavigation,
            shortcutActions: {
                shortcutsCount: 0,
                tagShortcutKeysByPath: new Map(),
                propertyShortcutKeysByNodeId: new Map(),
                addTagShortcut: vi.fn(),
                addPropertyShortcut: vi.fn(),
                removeShortcut: vi.fn(),
                clearShortcuts: vi.fn()
            }
        });
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopPropagation).toHaveBeenCalledOnce();
        expect(shown).toHaveBeenCalledExactlyOnceWith(event.nativeEvent);
        const root = capture(shown.mock.instances[0]).items[0];
        expect(root?.title).toBe(strings.paneHeader.changeChildSortOrder);
        await clickChoice(root?.submenu, strings.paneHeader.reorderRootFolders);
        expect(onReorderNavigation).toHaveBeenCalledOnce();
    });
});
