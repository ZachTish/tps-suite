/* TPS Notebook Navigator - provider-row context-menu contract tests. */

import type { Menu, MenuItem } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NavigatorRowContextMenuContext } from '../../src/api/types';
import { MenusAPI } from '../../src/api/modules/MenusAPI';
import type { NavigatorProvidedRow } from '../../src/services/rows/types';
import {
    buildProviderRowContextMenu,
    createNavigatorRowMenuTarget,
    showProviderRowContextMenuAtMouseEvent,
    showProviderRowContextMenuAtPosition
} from '../../src/utils/contextMenu/providerRowContextMenu';
import { createTestTFile } from '../utils/createTestTFile';

interface MenuHarness {
    menu: Menu;
    addItem: ReturnType<typeof vi.fn>;
    addSeparator: ReturnType<typeof vi.fn>;
    showAtMouseEvent: ReturnType<typeof vi.fn>;
    showAtPosition: ReturnType<typeof vi.fn>;
    item: MenuItem;
}

function createMenuHarness(options: { failAddItem?: boolean } = {}): MenuHarness {
    const item = {} as MenuItem;
    const menu = {} as Menu;
    const addItem = vi.fn((configure: (menuItem: MenuItem) => void) => {
        if (options.failAddItem) {
            throw new Error('menu rejected item');
        }
        configure(item);
        return menu;
    });
    const addSeparator = vi.fn(() => menu);
    const showAtMouseEvent = vi.fn(() => menu);
    const showAtPosition = vi.fn(() => menu);
    Object.assign(menu, { addItem, addSeparator, showAtMouseEvent, showAtPosition });
    return { menu, addItem, addSeparator, showAtMouseEvent, showAtPosition, item };
}

function row(overrides: Partial<NavigatorProvidedRow> = {}): NavigatorProvidedRow {
    return {
        providerId: 'example/tasks',
        id: 'one',
        kind: 'example/task',
        label: 'Review navigator',
        sourcePath: 'Inbox/Tasks.md',
        ...overrides
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('provider row context menus', () => {
    it('creates an immutable exact-file extension target with Type and checkbox state', () => {
        const file = createTestTFile('Inbox/Tasks.md');
        const providedRow = row({
            sourceLineNumber: 7,
            indicator: { type: 'checkbox', checked: false, marker: '/' }
        });

        const target = createNavigatorRowMenuTarget(providedRow, file, 'kind:Task');

        expect(target).toMatchObject({
            providerId: 'example/tasks',
            rowId: 'one',
            kind: 'example/task',
            label: 'Review navigator',
            file,
            sourcePath: 'Inbox/Tasks.md',
            sourceLineNumber: 7,
            typeId: 'kind:Task',
            checkbox: { checked: false, marker: '/' }
        });
        expect(Object.isFrozen(target)).toBe(true);
        expect(Object.isFrozen(target?.checkbox)).toBe(true);
        expect(createNavigatorRowMenuTarget(providedRow, createTestTFile('Moved.md'), null)).toBeNull();

        const optimisticTarget = createNavigatorRowMenuTarget(providedRow, file, 'kind:Task', { checked: true });
        expect(optimisticTarget?.checkbox).toEqual({ checked: true });
        expect(Object.isFrozen(optimisticTarget?.checkbox)).toBe(true);
    });

    it('exposes one exact frozen identity and applies synchronous menu items', () => {
        const harness = createMenuHarness();
        const configure = vi.fn();
        let captured: NavigatorRowContextMenuContext | undefined;
        const providedRow = row({
            sourceLineNumber: 7,
            contextMenu: context => {
                captured = context;
                context.addItem(configure);
            }
        });

        expect(buildProviderRowContextMenu(harness.menu, providedRow)).toBe(1);
        expect(captured).toBeDefined();
        expect(Object.isFrozen(captured)).toBe(true);
        expect(captured).toMatchObject({
            providerId: 'example/tasks',
            rowId: 'one',
            kind: 'example/task',
            sourcePath: 'Inbox/Tasks.md',
            sourceLineNumber: 7
        });
        expect(captured?.addItem).toBeTypeOf('function');
        expect(Object.keys(captured ?? {}).sort()).toEqual(
            ['addItem', 'addSeparator', 'kind', 'providerId', 'rowId', 'sourceLineNumber', 'sourcePath'].sort()
        );
        expect(configure).toHaveBeenCalledOnce();
        expect(configure).toHaveBeenCalledWith(harness.item);
    });

    it('runs the native MenuItem initializer synchronously at addItem time', () => {
        const harness = createMenuHarness();
        let captured: MenuItem | undefined;

        expect(
            buildProviderRowContextMenu(
                harness.menu,
                row({
                    contextMenu: context => {
                        context.addItem(item => {
                            captured = item;
                        });
                        expect(captured).toBe(harness.item);
                    }
                })
            )
        ).toBe(1);
    });

    it('preserves item and separator order without exposing the host Menu', () => {
        const calls: string[] = [];
        const harness = createMenuHarness();
        harness.addItem.mockImplementation((configure: (menuItem: MenuItem) => void) => {
            calls.push('item');
            configure(harness.item);
            return harness.menu;
        });
        harness.addSeparator.mockImplementation(() => {
            calls.push('separator');
            return harness.menu;
        });
        const providedRow = row({
            contextMenu: context => {
                context.addItem(() => undefined);
                context.addSeparator();
                context.addItem(() => undefined);
            }
        });

        expect(buildProviderRowContextMenu(harness.menu, providedRow)).toBe(2);
        expect(calls).toEqual(['item', 'separator', 'item']);
    });

    it('appends integration-owned actions after row-owner actions through one guarded facade', () => {
        const calls: string[] = [];
        const harness = createMenuHarness();
        harness.addItem.mockImplementation((configure: (menuItem: MenuItem) => void) => {
            configure(harness.item);
            return harness.menu;
        });
        const providedRow = row({
            contextMenu: context => {
                context.addItem(() => calls.push('owner'));
            }
        });

        expect(
            buildProviderRowContextMenu(harness.menu, providedRow, controls => {
                controls.addItem(() => calls.push('integration'));
            })
        ).toBe(2);
        expect(calls).toEqual(['owner', 'integration']);
    });

    it('keeps integration actions when the row owner fails and supports extension-only entry points', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const builderHarness = createMenuHarness();
        const pointerHarness = createMenuHarness();
        const buttonHarness = createMenuHarness();
        const appendIntegration = (controls: { addItem: (configure: (item: MenuItem) => void) => void }) => {
            controls.addItem(() => undefined);
        };

        expect(
            buildProviderRowContextMenu(
                builderHarness.menu,
                row({
                    contextMenu: () => {
                        throw new Error('owner failed');
                    }
                }),
                appendIntegration
            )
        ).toBe(1);
        expect(showProviderRowContextMenuAtMouseEvent(pointerHarness.menu, row(), {} as MouseEvent, appendIntegration)).toBe(true);
        expect(showProviderRowContextMenuAtPosition(buttonHarness.menu, row(), { x: 10, y: 20 }, appendIntegration)).toBe(true);
        expect(pointerHarness.showAtMouseEvent).toHaveBeenCalledOnce();
        expect(buttonHarness.showAtPosition).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith(
            '[TPS Notebook Navigator] Provider row context-menu builder failed.',
            expect.objectContaining({ providerId: 'example/tasks', rowId: 'one' })
        );
    });

    it('fails the whole attempted menu closed when an item initializer fails', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const leadingHarness = createMenuHarness();
        const trailingHarness = createMenuHarness();
        const failedItem = (context: Pick<NavigatorRowContextMenuContext, 'addItem'>) => {
            context.addItem(() => {
                throw new Error('item failed');
            });
        };

        expect(
            showProviderRowContextMenuAtMouseEvent(
                leadingHarness.menu,
                row({
                    contextMenu: context => {
                        failedItem(context);
                        context.addSeparator();
                    }
                }),
                {} as MouseEvent,
                controls => controls.addItem(() => undefined)
            )
        ).toBe(false);
        expect(leadingHarness.addItem).toHaveBeenCalledTimes(2);
        expect(leadingHarness.addSeparator).not.toHaveBeenCalled();
        expect(leadingHarness.showAtMouseEvent).not.toHaveBeenCalled();

        expect(
            buildProviderRowContextMenu(
                trailingHarness.menu,
                row({
                    contextMenu: context => {
                        context.addItem(() => undefined);
                        context.addSeparator();
                    }
                }),
                controls => failedItem(controls)
            )
        ).toBe(0);
        expect(trailingHarness.addItem).toHaveBeenCalledTimes(2);
        expect(trailingHarness.addSeparator).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('records and replays nested submenu configuration once', () => {
        const harness = createMenuHarness();
        const submenu = {} as Menu;
        const submenuItem = {} as MenuItem;
        const setTitle = vi.fn(() => harness.item);
        const setSubmenu = vi.fn(() => submenu);
        let onClickHandler: (() => void) | undefined;
        const onClick = vi.fn((handler: () => void) => {
            onClickHandler = handler;
            return harness.item;
        });
        const setNestedTitle = vi.fn(() => submenuItem);
        const submenuAddItem = vi.fn((configure: (item: MenuItem) => void) => {
            configure(submenuItem);
            return submenu;
        });
        Object.assign(harness.item, { setTitle, setSubmenu, onClick });
        Object.assign(submenuItem, { setTitle: setNestedTitle });
        Object.assign(submenu, { addItem: submenuAddItem, addSeparator: vi.fn(() => submenu) });

        expect(
            buildProviderRowContextMenu(
                harness.menu,
                row({
                    contextMenu: context => {
                        context.addItem(item => {
                            item.setTitle('Parent');
                            const childMenu = (
                                item as unknown as {
                                    setSubmenu(): { addItem(callback: (child: MenuItem) => void): unknown };
                                }
                            ).setSubmenu();
                            childMenu.addItem((child: MenuItem) => {
                                child.setTitle('Child');
                            });
                            item.onClick(() => item.setTitle('Updated'));
                        });
                    }
                })
            )
        ).toBe(1);
        expect(setTitle).toHaveBeenCalledOnce();
        expect(setTitle).toHaveBeenCalledWith('Parent');
        expect(setSubmenu).toHaveBeenCalledOnce();
        expect(submenuAddItem).toHaveBeenCalledOnce();
        expect(setNestedTitle).toHaveBeenCalledWith('Child');
        expect(onClick).toHaveBeenCalledOnce();
        onClickHandler?.();
        expect(setTitle).toHaveBeenLastCalledWith('Updated');
    });

    it('drops separator-only, leading, trailing, and duplicate separator entries', () => {
        const harness = createMenuHarness();
        const separatorOnly = row({ contextMenu: context => context.addSeparator() });
        expect(showProviderRowContextMenuAtPosition(harness.menu, separatorOnly, { x: 1, y: 2 })).toBe(false);
        expect(harness.addSeparator).not.toHaveBeenCalled();
        expect(harness.showAtPosition).not.toHaveBeenCalled();

        const normalized = row({
            contextMenu: context => {
                context.addSeparator();
                context.addItem(() => undefined);
                context.addSeparator();
                context.addSeparator();
                context.addItem(() => undefined);
                context.addSeparator();
            }
        });
        expect(buildProviderRowContextMenu(harness.menu, normalized)).toBe(2);
        expect(harness.addItem).toHaveBeenCalledTimes(2);
        expect(harness.addSeparator).toHaveBeenCalledOnce();
    });

    it('omits the optional source line instead of inventing one', () => {
        const harness = createMenuHarness();
        let captured: NavigatorRowContextMenuContext | undefined;

        buildProviderRowContextMenu(
            harness.menu,
            row({
                contextMenu: context => {
                    captured = context;
                }
            })
        );

        expect(captured).toBeDefined();
        expect(Object.prototype.hasOwnProperty.call(captured, 'sourceLineNumber')).toBe(false);
    });

    it('does not show an empty menu for either contextmenu or More actions entry points', () => {
        const pointerHarness = createMenuHarness();
        const buttonHarness = createMenuHarness();
        const providedRow = row({ contextMenu: () => undefined });

        expect(showProviderRowContextMenuAtMouseEvent(pointerHarness.menu, providedRow, {} as MouseEvent)).toBe(false);
        expect(showProviderRowContextMenuAtPosition(buttonHarness.menu, providedRow, { x: 10, y: 20 })).toBe(false);
        expect(pointerHarness.showAtMouseEvent).not.toHaveBeenCalled();
        expect(buttonHarness.showAtPosition).not.toHaveBeenCalled();
    });

    it('shows populated menus at the native contextmenu event and accessible button position', () => {
        const pointerHarness = createMenuHarness();
        const buttonHarness = createMenuHarness();
        const nativeContextMenuEvent = {} as MouseEvent;
        const providedRow = row({
            contextMenu: context => {
                context.addItem(() => undefined);
            }
        });

        expect(showProviderRowContextMenuAtMouseEvent(pointerHarness.menu, providedRow, nativeContextMenuEvent)).toBe(true);
        expect(showProviderRowContextMenuAtPosition(buttonHarness.menu, providedRow, { x: 10, y: 20 })).toBe(true);
        expect(pointerHarness.showAtMouseEvent).toHaveBeenCalledWith(nativeContextMenuEvent);
        expect(buttonHarness.showAtPosition).toHaveBeenCalledWith({ x: 10, y: 20 });
    });

    it('isolates throwing builders and menu hosts without opening a menu', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const builderHarness = createMenuHarness();
        const hostHarness = createMenuHarness({ failAddItem: true });

        expect(
            showProviderRowContextMenuAtMouseEvent(
                builderHarness.menu,
                row({
                    contextMenu: () => {
                        throw new Error('builder failed');
                    }
                }),
                {} as MouseEvent
            )
        ).toBe(false);
        expect(
            showProviderRowContextMenuAtPosition(
                hostHarness.menu,
                row({
                    contextMenu: context => {
                        context.addItem(() => undefined);
                    }
                }),
                { x: 1, y: 2 }
            )
        ).toBe(false);
        expect(builderHarness.showAtMouseEvent).not.toHaveBeenCalled();
        expect(hostHarness.showAtPosition).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(2);
    });

    it('rejects Promise-returning builders and ignores delayed additions', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const harness = createMenuHarness();
        const configure = vi.fn();
        const asynchronousBuilder = (context: NavigatorRowContextMenuContext): unknown =>
            Promise.resolve().then(() => {
                context.addItem(configure);
            });
        const providedRow = row({
            contextMenu: asynchronousBuilder
        });

        expect(showProviderRowContextMenuAtMouseEvent(harness.menu, providedRow, {} as MouseEvent)).toBe(false);
        await Promise.resolve();
        expect(harness.addItem).not.toHaveBeenCalled();
        expect(harness.showAtMouseEvent).not.toHaveBeenCalled();
        expect(configure).not.toHaveBeenCalled();
        const firstWarning: unknown = warn.mock.calls[0]?.[0];
        const secondWarning: unknown = warn.mock.calls[1]?.[0];
        expect(firstWarning).toBe(
            '[TPS Notebook Navigator] Provider row context-menu builder returned a Promise; menu builders must be synchronous.'
        );
        expect(secondWarning).toBe('[TPS Notebook Navigator] Provider row context-menu builder attempted to add items asynchronously.');
    });

    it('fails Promise-returning builders closed even when they add an item before awaiting', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const ownerHarness = createMenuHarness();
        const extensionHarness = createMenuHarness();
        const asynchronousOwner = ((context: NavigatorRowContextMenuContext) => {
            context.addItem(() => undefined);
            return Promise.resolve();
        }) as unknown as NonNullable<NavigatorProvidedRow['contextMenu']>;
        type ExtensionAppender = NonNullable<Parameters<typeof showProviderRowContextMenuAtPosition>[3]>;
        const extensionError = new Error('extension rejected');
        const asynchronousExtension = ((controls: Parameters<ExtensionAppender>[0]) => {
            controls.addItem(() => undefined);
            return Promise.reject(extensionError);
        }) as unknown as ExtensionAppender;

        expect(showProviderRowContextMenuAtMouseEvent(ownerHarness.menu, row({ contextMenu: asynchronousOwner }), {} as MouseEvent)).toBe(
            false
        );
        expect(ownerHarness.addItem).toHaveBeenCalledOnce();
        expect(ownerHarness.showAtMouseEvent).not.toHaveBeenCalled();

        expect(showProviderRowContextMenuAtPosition(extensionHarness.menu, row(), { x: 1, y: 2 }, asynchronousExtension)).toBe(false);
        expect(extensionHarness.addItem).toHaveBeenCalledOnce();
        expect(extensionHarness.showAtPosition).not.toHaveBeenCalled();

        await Promise.resolve();
        expect(warn).toHaveBeenCalledWith(
            '[TPS Notebook Navigator] Provider row asynchronous menu extension host failed.',
            expect.objectContaining({ providerId: 'example/tasks', rowId: 'one', error: extensionError })
        );
    });

    it('fails registered Promise-returning extensions closed through the real menu host path', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const resolvedHarness = createMenuHarness();
        const rejectedHarness = createMenuHarness();
        const file = createTestTFile('Inbox/Tasks.md');
        const target = createNavigatorRowMenuTarget(row(), file, 'builtin:checkboxes');
        expect(target).not.toBeNull();
        if (!target) {
            throw new Error('Expected a current row-menu target.');
        }

        type RegisteredExtension = Parameters<MenusAPI['registerRowMenu']>[0];
        const resolvedMenus = new MenusAPI();
        const resolvedExtension = ((context: Parameters<RegisteredExtension>[0]) => {
            context.addItem(() => undefined);
            return Promise.resolve();
        }) as unknown as RegisteredExtension;
        resolvedMenus.registerRowMenu(resolvedExtension);

        expect(
            showProviderRowContextMenuAtMouseEvent(resolvedHarness.menu, row(), {} as MouseEvent, controls =>
                resolvedMenus.applyRowMenuExtensions({ target, ...controls })
            )
        ).toBe(false);
        expect(resolvedHarness.addItem).toHaveBeenCalledOnce();
        expect(resolvedHarness.showAtMouseEvent).not.toHaveBeenCalled();

        const rejection = new Error('registered extension rejected');
        const rejectedMenus = new MenusAPI();
        const rejectedExtension = ((context: Parameters<RegisteredExtension>[0]) => {
            context.addItem(() => undefined);
            return Promise.reject(rejection);
        }) as unknown as RegisteredExtension;
        rejectedMenus.registerRowMenu(rejectedExtension);

        expect(
            showProviderRowContextMenuAtPosition(rejectedHarness.menu, row(), { x: 1, y: 2 }, controls =>
                rejectedMenus.applyRowMenuExtensions({ target, ...controls })
            )
        ).toBe(false);
        expect(rejectedHarness.addItem).toHaveBeenCalledOnce();
        expect(rejectedHarness.showAtPosition).not.toHaveBeenCalled();

        await Promise.resolve();
        expect(error).toHaveBeenCalledWith('Notebook Navigator row menu extension failed', rejection);
    });

    it('isolates a provider item callback and does not show its otherwise blank menu', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const harness = createMenuHarness();

        expect(
            showProviderRowContextMenuAtMouseEvent(
                harness.menu,
                row({
                    contextMenu: context => {
                        context.addItem(() => {
                            throw new Error('item failed');
                        });
                    }
                }),
                {} as MouseEvent
            )
        ).toBe(false);
        expect(harness.showAtMouseEvent).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledOnce();
    });

    it('fails Promise-returning item initializers closed and observes later rejection', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const resolvedHarness = createMenuHarness();
        const rejectedHarness = createMenuHarness();
        const resolvedInitializer = (() => Promise.resolve()) as unknown as (item: MenuItem) => void;
        const initializerError = new Error('async item failed');
        const rejectedInitializer = (() => Promise.reject(initializerError)) as unknown as (item: MenuItem) => void;

        expect(
            showProviderRowContextMenuAtMouseEvent(
                resolvedHarness.menu,
                row({
                    contextMenu: context => {
                        context.addItem(resolvedInitializer);
                    }
                }),
                {} as MouseEvent
            )
        ).toBe(false);
        expect(resolvedHarness.showAtMouseEvent).not.toHaveBeenCalled();

        expect(
            showProviderRowContextMenuAtPosition(rejectedHarness.menu, row(), { x: 1, y: 2 }, controls => {
                controls.addItem(rejectedInitializer);
            })
        ).toBe(false);
        expect(rejectedHarness.showAtPosition).not.toHaveBeenCalled();

        await Promise.resolve();
        expect(warn).toHaveBeenCalledWith(
            '[TPS Notebook Navigator] Provider row asynchronous context-menu item failed.',
            expect.objectContaining({ providerId: 'example/tasks', rowId: 'one', error: initializerError })
        );
    });
});
