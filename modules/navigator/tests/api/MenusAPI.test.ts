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

import { describe, expect, it, vi } from 'vitest';
import { MenusAPI, type FileMenuExtension, type RowMenuExtension, type TypeMenuExtension } from '../../src/api/modules/MenusAPI';
import { TFolder } from 'obsidian';
import type { Menu, MenuItem } from 'obsidian';
import type { NavigatorRowMenuTarget, NavigatorTypeDescriptor } from '../../src/api/types';
import { createTestTFile } from '../utils/createTestTFile';

type MenuStub = {
    addItem: (cb: (item: MenuItem) => void) => void;
    addSeparator: () => void;
};

function createMenuStub(): {
    menu: MenuStub;
    item: MenuItem;
    addItem: ReturnType<typeof vi.fn>;
    addSeparator: ReturnType<typeof vi.fn>;
} {
    const item = {} as MenuItem;
    const addItem = vi.fn((cb: (item: MenuItem) => void) => cb(item));
    const addSeparator = vi.fn(() => undefined);
    return { menu: { addItem, addSeparator }, item, addItem, addSeparator };
}

function createRowMenuTarget(overrides: Partial<NavigatorRowMenuTarget> = {}): NavigatorRowMenuTarget {
    const file = createTestTFile('Inbox/Tasks.md');
    return {
        providerId: 'example/tasks',
        rowId: 'task-one',
        kind: 'example/task',
        label: 'Review navigator',
        file,
        sourcePath: file.path,
        sourceLineNumber: 7,
        typeId: 'structural:task',
        checkbox: { checked: false, marker: ' ' },
        ...overrides
    };
}

describe('MenusAPI', () => {
    it('registers and applies file menu extensions with an item count', () => {
        const menusAPI = new MenusAPI();
        const file = createTestTFile('Note.md');
        const { menu, addItem } = createMenuStub();

        const dispose = menusAPI.registerFileMenu(({ addItem: addMenuItem, selection }) => {
            expect(selection.mode).toBe('single');
            expect(Object.isFrozen(selection)).toBe(true);
            expect(Object.isFrozen(selection.files)).toBe(true);

            addMenuItem(() => undefined);
            addMenuItem(() => undefined);
        });

        const added = menusAPI.applyFileMenuExtensions({
            menu: menu as unknown as Menu,
            file,
            selection: { mode: 'single', files: [file] }
        });

        expect(added).toBe(2);
        expect(addItem).toHaveBeenCalledTimes(2);

        dispose();

        const addedAfterDispose = menusAPI.applyFileMenuExtensions({
            menu: menu as unknown as Menu,
            file,
            selection: { mode: 'single', files: [file] }
        });

        expect(addedAfterDispose).toBe(0);
    });

    it('runs a public menu item initializer immediately with the exact native item', () => {
        const menusAPI = new MenusAPI();
        const file = createTestTFile('Note.md');
        const { menu, item } = createMenuStub();
        let capturedItem: MenuItem | undefined;

        menusAPI.registerFileMenu(({ addItem }) => {
            addItem(candidate => {
                capturedItem = candidate;
            });
            expect(capturedItem).toBe(item);
        });

        expect(
            menusAPI.applyFileMenuExtensions({
                menu: menu as unknown as Menu,
                file,
                selection: { mode: 'single', files: [file] }
            })
        ).toBe(1);
        expect(capturedItem).toBe(item);
    });

    it('keeps duplicate callback registrations independently disposable', () => {
        const menusAPI = new MenusAPI();
        const file = createTestTFile('Note.md');
        const { menu, addItem } = createMenuStub();
        const extension: FileMenuExtension = ({ addItem: addMenuItem }) => addMenuItem(() => undefined);
        const disposeFirst = menusAPI.registerFileMenu(extension);
        const disposeSecond = menusAPI.registerFileMenu(extension);
        const apply = () =>
            menusAPI.applyFileMenuExtensions({
                menu: menu as unknown as Menu,
                file,
                selection: { mode: 'single', files: [file] }
            });

        expect(apply()).toBe(2);
        disposeFirst();
        disposeFirst();
        expect(apply()).toBe(1);
        disposeSecond();
        expect(apply()).toBe(0);
        expect(addItem).toHaveBeenCalledTimes(3);
    });

    it('isolates file menu extension failures', () => {
        const menusAPI = new MenusAPI();
        const file = createTestTFile('Note.md');
        const { menu } = createMenuStub();

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        menusAPI.registerFileMenu(() => {
            throw new Error('boom');
        });
        menusAPI.registerFileMenu(({ addItem }) => {
            addItem(() => undefined);
        });

        expect(() => {
            const added = menusAPI.applyFileMenuExtensions({
                menu: menu as unknown as Menu,
                file,
                selection: { mode: 'single', files: [file] }
            });
            expect(added).toBe(1);
        }).not.toThrow();

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('isolates folder menu extension failures', () => {
        const menusAPI = new MenusAPI();
        const folder = new TFolder();
        folder.path = 'Folder';
        const { menu } = createMenuStub();

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        menusAPI.registerFolderMenu(({ addItem }) => {
            addItem(() => {
                throw new Error('item error');
            });
        });

        expect(() => {
            const added = menusAPI.applyFolderMenuExtensions({
                menu: menu as unknown as Menu,
                folder
            });
            expect(added).toBe(0);
        }).not.toThrow();

        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('registers and applies tag and property menu extensions with item counts', () => {
        const menusAPI = new MenusAPI();
        const { menu, addItem } = createMenuStub();

        const disposeTag = menusAPI.registerTagMenu(({ addItem: addMenuItem, tag }) => {
            expect(tag).toBe('work');
            addMenuItem(() => undefined);
        });
        const disposeProperty = menusAPI.registerPropertyMenu(({ addItem: addMenuItem, nodeId }) => {
            expect(nodeId).toBe('key:status');
            addMenuItem(() => undefined);
        });

        expect(
            menusAPI.applyTagMenuExtensions({
                menu: menu as unknown as Menu,
                tag: 'work'
            })
        ).toBe(1);

        expect(
            menusAPI.applyPropertyMenuExtensions({
                menu: menu as unknown as Menu,
                nodeId: 'key:status'
            })
        ).toBe(1);

        expect(addItem).toHaveBeenCalledTimes(2);

        disposeTag();
        disposeProperty();
    });

    it('registers and applies Type menu extensions with an exact immutable descriptor', () => {
        const menusAPI = new MenusAPI();
        const { menu, addItem } = createMenuStub();
        const descriptor = {
            id: 'provider:example%2Fentities:projects',
            label: 'Projects',
            icon: 'lucide-folder-kanban',
            category: 'structure',
            providerId: 'example/entities',
            providerCollectionId: 'projects'
        } satisfies NavigatorTypeDescriptor;

        const dispose = menusAPI.registerTypeMenu(context => {
            expect(Object.isFrozen(context)).toBe(true);
            expect(context.typeId).toBe(descriptor.id);
            expect(context.descriptor).toEqual(descriptor);
            expect(context.descriptor).not.toBe(descriptor);
            expect(Object.isFrozen(context.descriptor)).toBe(true);

            context.addItem(() => undefined);
            context.addItem(() => undefined);
        });

        expect(
            menusAPI.applyTypeMenuExtensions({
                menu: menu as unknown as Menu,
                typeId: descriptor.id,
                descriptor
            })
        ).toBe(2);
        expect(addItem).toHaveBeenCalledTimes(2);

        dispose();
        dispose();
        expect(
            menusAPI.applyTypeMenuExtensions({
                menu: menu as unknown as Menu,
                typeId: descriptor.id,
                descriptor
            })
        ).toBe(0);
    });

    it('fails a Type menu closed when a builder throws after committing a partial item', () => {
        const menusAPI = new MenusAPI();
        const { menu, addItem } = createMenuStub();
        const descriptor = {
            id: 'file:drawing',
            label: 'Drawings',
            icon: 'lucide-pencil-ruler',
            category: 'structure'
        } satisfies NavigatorTypeDescriptor;
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        menusAPI.registerTypeMenu(({ addItem: addMenuItem }) => {
            addMenuItem(() => undefined);
            throw new Error('Type menu failed');
        });
        menusAPI.registerTypeMenu(({ addItem: addMenuItem }) => addMenuItem(() => undefined));

        expect(
            menusAPI.applyTypeMenuExtensions({
                menu: menu as unknown as Menu,
                typeId: descriptor.id,
                descriptor
            })
        ).toBe(0);
        expect(addItem).toHaveBeenCalledTimes(2);
        expect(consoleSpy).toHaveBeenCalledOnce();

        consoleSpy.mockRestore();
    });

    it('isolates a Type builder that throws before adding anything', () => {
        const menusAPI = new MenusAPI();
        const { menu, addItem } = createMenuStub();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        menusAPI.registerTypeMenu(() => {
            throw new Error('Type menu failed before adding an item');
        });
        menusAPI.registerTypeMenu(({ addItem: addMenuItem }) => addMenuItem(() => undefined));

        expect(
            menusAPI.applyTypeMenuExtensions({
                menu: menu as unknown as Menu,
                typeId: 'file:drawing',
                descriptor: {
                    id: 'file:drawing',
                    label: 'Drawings',
                    icon: 'lucide-pencil-ruler',
                    category: 'structure'
                }
            })
        ).toBe(1);
        expect(addItem).toHaveBeenCalledOnce();
        expect(consoleSpy).toHaveBeenCalledOnce();

        consoleSpy.mockRestore();
    });

    it('fails a Type menu closed when a builder returns a Promise after committing an item', () => {
        const menusAPI = new MenusAPI();
        const { menu, addItem } = createMenuStub();
        const descriptor = {
            id: 'file:drawing',
            label: 'Drawings',
            icon: 'lucide-pencil-ruler',
            category: 'structure'
        } satisfies NavigatorTypeDescriptor;
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- exercises the runtime guard for JavaScript consumers.
        const promiseReturningExtension: TypeMenuExtension = ({ addItem: addMenuItem }) => {
            addMenuItem(() => undefined);
            return Promise.resolve();
        };
        menusAPI.registerTypeMenu(promiseReturningExtension);
        menusAPI.registerTypeMenu(({ addItem: addMenuItem }) => addMenuItem(() => undefined));

        expect(
            menusAPI.applyTypeMenuExtensions({
                menu: menu as unknown as Menu,
                typeId: descriptor.id,
                descriptor
            })
        ).toBe(0);
        expect(addItem).toHaveBeenCalledTimes(2);
        expect(consoleSpy).toHaveBeenCalledOnce();

        consoleSpy.mockRestore();
    });

    it('fails a mixed Type menu closed when any item initializer throws', () => {
        const menusAPI = new MenusAPI();
        const { menu, addItem } = createMenuStub();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        menusAPI.registerTypeMenu(({ addItem: addMenuItem }) => {
            addMenuItem(() => {
                throw new Error('item failed');
            });
            addMenuItem(() => undefined);
        });

        expect(
            menusAPI.applyTypeMenuExtensions({
                menu: menu as unknown as Menu,
                typeId: 'file:drawing',
                descriptor: {
                    id: 'file:drawing',
                    label: 'Drawings',
                    icon: 'lucide-pencil-ruler',
                    category: 'structure'
                }
            })
        ).toBe(0);
        expect(addItem).toHaveBeenCalledTimes(2);
        expect(consoleSpy).toHaveBeenCalledOnce();

        consoleSpy.mockRestore();
    });

    it('fails a mixed Type menu closed and observes a rejected asynchronous item initializer', async () => {
        const menusAPI = new MenusAPI();
        const { menu, addItem } = createMenuStub();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const rejection = new Error('async item failed');
        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- exercises the runtime guard for JavaScript consumers.
        const asyncInitializer: (item: MenuItem) => void = () => Promise.reject(rejection);

        menusAPI.registerTypeMenu(({ addItem: addMenuItem }) => {
            addMenuItem(asyncInitializer);
            addMenuItem(() => undefined);
        });

        expect(
            menusAPI.applyTypeMenuExtensions({
                menu: menu as unknown as Menu,
                typeId: 'file:drawing',
                descriptor: {
                    id: 'file:drawing',
                    label: 'Drawings',
                    icon: 'lucide-pencil-ruler',
                    category: 'structure'
                }
            })
        ).toBe(0);
        expect(addItem).toHaveBeenCalledTimes(2);
        await Promise.resolve();
        expect(consoleSpy).toHaveBeenCalledWith(
            'Notebook Navigator type menu extension item returned a Promise. Item initializers must be synchronous; do async work in onClick handlers.'
        );
        expect(consoleSpy).toHaveBeenCalledWith('Notebook Navigator type asynchronous menu extension item failed', rejection);

        consoleSpy.mockRestore();
    });

    it('registers filtered row actions with immutable current targets and reactive disposal', () => {
        const menusAPI = new MenusAPI();
        const listener = vi.fn();
        const unsubscribe = menusAPI.subscribeRowMenuExtensions(listener);
        const supports = vi.fn((target: NavigatorRowMenuTarget) => target.kind === 'example/task');
        const addItem = vi.fn();
        const addSeparator = vi.fn();
        let captured: Parameters<Parameters<MenusAPI['registerRowMenu']>[0]>[0] | undefined;

        const dispose = menusAPI.registerRowMenu(
            context => {
                captured = context;
                context.addItem(() => undefined);
                context.addSeparator();
            },
            { supports }
        );
        const target = createRowMenuTarget();

        expect(menusAPI.getRowMenuRevision()).toBe(1);
        expect(listener).toHaveBeenCalledOnce();
        expect(menusAPI.hasRowMenuExtensions(target)).toBe(true);
        expect(menusAPI.applyRowMenuExtensions({ target, addItem, addSeparator })).toBe(true);

        expect(addItem).toHaveBeenCalledOnce();
        expect(addSeparator).toHaveBeenCalledOnce();
        expect(captured).toBeDefined();
        expect(Object.isFrozen(captured)).toBe(true);
        expect(captured?.target).not.toBe(target);
        expect(Object.isFrozen(captured?.target)).toBe(true);
        expect(Object.isFrozen(captured?.target.checkbox)).toBe(true);
        expect(captured?.target).toMatchObject({
            providerId: 'example/tasks',
            rowId: 'task-one',
            kind: 'example/task',
            sourcePath: 'Inbox/Tasks.md',
            sourceLineNumber: 7,
            typeId: 'structural:task',
            checkbox: { checked: false, marker: ' ' }
        });
        expect(supports.mock.calls.every(([candidate]) => Object.isFrozen(candidate))).toBe(true);

        dispose();
        dispose();
        expect(menusAPI.getRowMenuRevision()).toBe(2);
        expect(listener).toHaveBeenCalledTimes(2);
        expect(menusAPI.hasRowMenuExtensions(target)).toBe(false);
        unsubscribe();
    });

    it('isolates row supports, builders, rejected promises, and delayed additions', async () => {
        const menusAPI = new MenusAPI();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const addItem = vi.fn();
        const addSeparator = vi.fn();
        const target = createRowMenuTarget();

        menusAPI.registerRowMenu(() => {
            throw new Error('builder failed');
        });
        menusAPI.registerRowMenu(() => undefined, {
            supports: () => {
                throw new Error('supports failed');
            }
        });
        const promiseReturningExtension = ((context: Parameters<RowMenuExtension>[0]) =>
            Promise.resolve().then(() => {
                context.addItem(() => undefined);
                context.addSeparator();
                throw new Error('async failed');
            })) as unknown as RowMenuExtension;
        menusAPI.registerRowMenu(promiseReturningExtension);
        menusAPI.registerRowMenu(context => context.addItem(() => undefined), { supports: () => false });
        menusAPI.registerRowMenu(context => context.addItem(() => undefined), { supports: () => true });

        expect(menusAPI.hasRowMenuExtensions(target)).toBe(true);
        expect(menusAPI.applyRowMenuExtensions({ target, addItem, addSeparator })).toBe(false);
        expect(addItem).toHaveBeenCalledOnce();

        await Promise.resolve();
        await Promise.resolve();
        expect(addItem).toHaveBeenCalledOnce();
        expect(addSeparator).not.toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith('Notebook Navigator row menu extension supports check failed', expect.any(Error));
        expect(consoleSpy).toHaveBeenCalledWith('Notebook Navigator row menu extension failed', expect.any(Error));
        expect(consoleSpy).toHaveBeenCalledWith(
            'Notebook Navigator row menu extension returned a Promise. Add menu entries synchronously and do async work in onClick handlers.'
        );
        expect(consoleSpy).toHaveBeenCalledWith(
            'Notebook Navigator row menu extension attempted to add menu items asynchronously. Add menu items synchronously and do async work in onClick handlers.'
        );
        expect(consoleSpy).toHaveBeenCalledWith(
            'Notebook Navigator row menu extension attempted to add a separator asynchronously. Add menu entries synchronously.'
        );

        consoleSpy.mockRestore();
    });

    it('treats Promise-returning row filters as unsupported and observes rejected filters', async () => {
        const menusAPI = new MenusAPI();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const addItem = vi.fn();
        const addSeparator = vi.fn();
        const target = createRowMenuTarget();
        const callback = vi.fn();
        const resolvedSupports = (async () => true) as unknown as (candidate: NavigatorRowMenuTarget) => boolean;
        const rejectedSupports = (async () => {
            throw new Error('async supports failed');
        }) as unknown as (candidate: NavigatorRowMenuTarget) => boolean;

        menusAPI.registerRowMenu(callback, { supports: resolvedSupports });
        menusAPI.registerRowMenu(callback, { supports: rejectedSupports });

        expect(menusAPI.hasRowMenuExtensions(target)).toBe(false);
        menusAPI.applyRowMenuExtensions({ target, addItem, addSeparator });
        expect(callback).not.toHaveBeenCalled();
        expect(addItem).not.toHaveBeenCalled();
        expect(addSeparator).not.toHaveBeenCalled();

        await Promise.resolve();
        await Promise.resolve();
        expect(consoleSpy).toHaveBeenCalledWith(
            'Notebook Navigator row menu extension supports returned a Promise. Filters must be synchronous and side-effect-free.'
        );
        expect(consoleSpy).toHaveBeenCalledWith('Notebook Navigator row menu extension supports check failed', expect.any(Error));

        consoleSpy.mockRestore();
    });

    it('validates row registration inputs and isolates registration listeners', () => {
        const menusAPI = new MenusAPI();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        menusAPI.subscribeRowMenuExtensions(() => {
            throw new Error('listener failed');
        });

        expect(() => menusAPI.registerRowMenu(null as never)).toThrow(/must be a function/u);
        expect(() => menusAPI.registerRowMenu(() => undefined, null as never)).toThrow(/must be a record/u);
        expect(() => menusAPI.registerRowMenu(() => undefined, { supports: true } as never)).toThrow(/supports must be a function/u);
        expect(() => menusAPI.registerRowMenu(() => undefined)).not.toThrow();
        expect(consoleSpy).toHaveBeenCalledWith('Notebook Navigator row menu extension listener failed', expect.any(Error));

        consoleSpy.mockRestore();
    });

    it('preserves already-committed native-menu items while observing a rejected builder', async () => {
        const menusAPI = new MenusAPI();
        const file = createTestTFile('Note.md');
        const { menu, addItem } = createMenuStub();

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const rejection = new Error('async builder failed');

        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- exercises the runtime guard for JavaScript consumers.
        const promiseReturningExtension: FileMenuExtension = ({ addItem: addMenuItem }) => {
            addMenuItem(() => undefined);
            return Promise.reject(rejection);
        };
        menusAPI.registerFileMenu(promiseReturningExtension);
        menusAPI.registerFileMenu(({ addItem: addMenuItem }) => addMenuItem(() => undefined));

        const added = menusAPI.applyFileMenuExtensions({
            menu: menu as unknown as Menu,
            file,
            selection: { mode: 'single', files: [file] }
        });

        expect(added).toBe(2);
        expect(addItem).toHaveBeenCalledTimes(2);
        await Promise.resolve();
        expect(consoleSpy).toHaveBeenCalledWith(
            'Notebook Navigator file menu extension returned a Promise. Add menu items synchronously and do async work in onClick handlers.'
        );
        expect(consoleSpy).toHaveBeenCalledWith('Notebook Navigator file menu extension failed', rejection);
        consoleSpy.mockRestore();
    });

    it('counts an already-committed asynchronous native-menu item while observing its rejection', async () => {
        const menusAPI = new MenusAPI();
        const file = createTestTFile('Note.md');
        const { menu, addItem } = createMenuStub();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const rejection = new Error('async item failed');
        // eslint-disable-next-line @typescript-eslint/no-misused-promises -- exercises the runtime guard for JavaScript consumers.
        const asyncInitializer: (item: MenuItem) => void = () => Promise.reject(rejection);

        menusAPI.registerFileMenu(({ addItem: addMenuItem }) => addMenuItem(asyncInitializer));

        expect(
            menusAPI.applyFileMenuExtensions({
                menu: menu as unknown as Menu,
                file,
                selection: { mode: 'single', files: [file] }
            })
        ).toBe(1);
        expect(addItem).toHaveBeenCalledOnce();
        await Promise.resolve();
        expect(consoleSpy).toHaveBeenCalledWith(
            'Notebook Navigator file menu extension item returned a Promise. Item initializers must be synchronous; do async work in onClick handlers.'
        );
        expect(consoleSpy).toHaveBeenCalledWith('Notebook Navigator file asynchronous menu extension item failed', rejection);

        consoleSpy.mockRestore();
    });

    it('ignores menu items added after synchronous construction has ended', () => {
        const menusAPI = new MenusAPI();
        const file = createTestTFile('Note.md');
        const { menu, addItem } = createMenuStub();
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        let delayedAddItem: ((cb: (item: MenuItem) => void) => void) | undefined;

        menusAPI.registerFileMenu(context => {
            delayedAddItem = context.addItem;
        });
        expect(
            menusAPI.applyFileMenuExtensions({
                menu: menu as unknown as Menu,
                file,
                selection: { mode: 'single', files: [file] }
            })
        ).toBe(0);

        delayedAddItem?.(() => undefined);
        expect(addItem).not.toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledWith(
            'Notebook Navigator file menu extension attempted to add menu items asynchronously. Add menu items synchronously and do async work in onClick handlers.'
        );

        consoleSpy.mockRestore();
    });
});
