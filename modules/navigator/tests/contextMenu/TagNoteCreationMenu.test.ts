/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { TFile, type MenuItem } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strings } from '../../src/i18n';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { buildTagMenu } from '../../src/utils/contextMenu/tagMenuBuilder';
import type { TagNoteResolution, TagNoteResolutionStatus } from '../../src/utils/tagNotes';
import { createTestTFile } from '../utils/createTestTFile';

const mocks = vi.hoisted(() => ({
    resolveTagNote: vi.fn(),
    revealTagNoteInNavigator: vi.fn(),
    openTagNoteFile: vi.fn().mockResolvedValue(undefined),
    showNotice: vi.fn()
}));

vi.mock('../../src/utils/tagNotes', () => ({
    resolveTagNote: mocks.resolveTagNote
}));

vi.mock('../../src/utils/tagNoteNavigation', () => ({
    revealTagNoteInNavigator: mocks.revealTagNoteInNavigator,
    openTagNoteFile: mocks.openTagNoteFile
}));

vi.mock('../../src/utils/noticeUtils', () => ({
    showNotice: mocks.showNotice
}));

interface MenuItemStub {
    title: string;
    icon: string | null;
    click: (() => void) | null;
    setTitle(title: string): MenuItemStub;
    setIcon(icon: string): MenuItemStub;
    setWarning(warning: boolean): MenuItemStub;
    setDisabled(disabled: boolean): MenuItemStub;
    setChecked(checked: boolean): MenuItemStub;
    setIsLabel(isLabel: boolean): MenuItemStub;
    onClick(handler: () => void): MenuItemStub;
}

interface MenuHarness {
    menu: {
        addItem(callback: (item: MenuItem) => void): void;
        addSeparator(): void;
    };
    items: MenuItemStub[];
    find(title: string): MenuItemStub | undefined;
}

interface OpenTagNoteCall {
    tagNote: TFile;
    context: 'tab' | 'right-sidebar' | null;
    commandQueue: null;
    openInRightSidebar?: (file: TFile) => Promise<void>;
}

function createMenu(): MenuHarness {
    const items: MenuItemStub[] = [];
    return {
        menu: {
            addItem(callback): void {
                const item: MenuItemStub = {
                    title: '',
                    icon: null,
                    click: null,
                    setTitle(title): MenuItemStub {
                        this.title = title;
                        return this;
                    },
                    setIcon(icon): MenuItemStub {
                        this.icon = icon;
                        return this;
                    },
                    setWarning(): MenuItemStub {
                        return this;
                    },
                    setDisabled(): MenuItemStub {
                        return this;
                    },
                    setChecked(): MenuItemStub {
                        return this;
                    },
                    setIsLabel(): MenuItemStub {
                        return this;
                    },
                    onClick(handler): MenuItemStub {
                        this.click = handler;
                        return this;
                    }
                };
                callback(item as unknown as MenuItem);
                items.push(item);
            },
            addSeparator(): void {}
        },
        items,
        find: title => items.find(item => item.title === title)
    };
}

function createResolution(status: TagNoteResolutionStatus, file: TFile | null = null): TagNoteResolution {
    return {
        status,
        normalizedTagPath: 'projects/active',
        displayTagPath: 'Projects/Active',
        basename: 'Active',
        matches: file ? [file] : [],
        file
    };
}

function createHarness(options?: {
    openLocation?: 'current-tab' | 'new-tab' | 'right-sidebar';
    enableFolderNotes?: boolean;
    tagPath?: string;
}) {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.enableFolderNotes = options?.enableFolderNotes ?? true;
    settings.showTagIcons = false;
    settings.folderNoteOpenLocation = options?.openLocation ?? 'current-tab';

    const selectionDispatch = vi.fn();
    const uiDispatch = vi.fn();
    const createTagNote = vi.fn();
    const openFolderNoteInRightSidebar = vi.fn().mockResolvedValue(undefined);
    const menu = createMenu();
    const activeFile = createTestTFile('Journal/Today.md');
    const tagTreeService = {
        findTagNode: vi.fn(() => ({ displayPath: 'Projects/Active' }))
    };

    buildTagMenu({
        tagPath: options?.tagPath ?? 'projects/active',
        menu: menu.menu as never,
        settings,
        state: {
            selectionState: {
                selectionType: 'none',
                selectedTag: null,
                selectedFile: null
            },
            expandedFolders: new Set<string>(),
            expandedTags: new Set<string>(),
            expandedProperties: new Set<string>()
        } as never,
        dispatchers: {
            selectionDispatch,
            expansionDispatch: vi.fn(),
            uiDispatch
        },
        services: {
            app: {
                workspace: {
                    getActiveFile: vi.fn(() => activeFile),
                    requestSaveLayout: vi.fn()
                }
            } as never,
            plugin: {
                settings,
                openFolderNoteInRightSidebar,
                saveSettingsAndUpdate: vi.fn().mockResolvedValue(undefined)
            } as never,
            isMobile: false,
            fileSystemOps: {
                createTagNote,
                createNewFileForTag: vi.fn(),
                getManualSortNewFileContextForTarget: vi.fn().mockResolvedValue(null)
            } as never,
            metadataService: {
                getTagChildSortOrderOverride: vi.fn(() => undefined),
                getTagIcon: vi.fn(() => undefined),
                getTagColorData: vi.fn(() => ({ color: undefined, background: undefined })),
                hasNavigationSeparator: vi.fn(() => false)
            } as never,
            tagOperations: {} as never,
            propertyOperations: {} as never,
            tagTreeService: tagTreeService as never,
            propertyTreeService: null,
            commandQueue: null,
            shortcuts: null,
            visibility: { includeDescendantNotes: false, showHiddenItems: false }
        }
    });

    return {
        menu,
        settings,
        activeFile,
        selectionDispatch,
        uiDispatch,
        createTagNote,
        openFolderNoteInRightSidebar
    };
}

async function clickCreateTagNote(menu: MenuHarness): Promise<void> {
    const item = menu.find(strings.contextMenu.tag.createTagNote);
    expect(item).toBeDefined();
    item?.click?.();
    await Promise.resolve();
}

describe('tag note context-menu creation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.resolveTagNote.mockReturnValue(createResolution('missing'));
    });

    it('offers tag-note creation alongside ordinary note creation only when enabled and no unique tag note exists', () => {
        const missing = createHarness();
        expect(missing.menu.find(strings.contextMenu.folder.newNote)).toBeDefined();
        expect(missing.menu.find(strings.contextMenu.tag.createTagNote)).toBeDefined();

        mocks.resolveTagNote.mockReturnValue(createResolution('found', createTestTFile('Indexes/Active.md')));
        const found = createHarness();
        expect(found.menu.find(strings.contextMenu.folder.newNote)).toBeDefined();
        expect(found.menu.find(strings.contextMenu.tag.createTagNote)).toBeUndefined();

        mocks.resolveTagNote.mockReturnValue(createResolution('missing'));
        const disabled = createHarness({ enableFolderNotes: false });
        expect(disabled.menu.find(strings.contextMenu.tag.createTagNote)).toBeUndefined();

        const virtual = createHarness({ tagPath: '__all_tags__' });
        expect(virtual.menu.find(strings.contextMenu.tag.createTagNote)).toBeUndefined();
    });

    it('creates without auto-opening, reveals the file in its tag, focuses files, and opens in the configured destination', async () => {
        const createdFile = createTestTFile('Indexes/Active.md');
        const harness = createHarness({ openLocation: 'new-tab' });
        harness.createTagNote.mockResolvedValue({ status: 'created', file: createdFile, path: createdFile.path });

        await clickCreateTagNote(harness.menu);
        await vi.waitFor(() => expect(mocks.openTagNoteFile).toHaveBeenCalledOnce());

        expect(harness.createTagNote).toHaveBeenCalledWith('projects/active', harness.activeFile.path, {
            openAfterCreate: false
        });
        expect(mocks.revealTagNoteInNavigator).toHaveBeenCalledWith(harness.selectionDispatch, createdFile, 'projects/active');
        expect(harness.uiDispatch).toHaveBeenCalledWith({ type: 'ACTIVATE_PANE', target: 'files' });
        const openParams = mocks.openTagNoteFile.mock.calls[0]?.[0] as OpenTagNoteCall | undefined;
        expect(openParams).toMatchObject({ tagNote: createdFile, context: 'tab', commandQueue: null });
        expect(typeof openParams?.openInRightSidebar).toBe('function');
    });

    it('routes right-sidebar creation exactly once through the tag-note opener', async () => {
        const createdFile = createTestTFile('Indexes/Active.md');
        const harness = createHarness({ openLocation: 'right-sidebar' });
        harness.createTagNote.mockResolvedValue({ status: 'created', file: createdFile, path: createdFile.path });

        await clickCreateTagNote(harness.menu);
        await vi.waitFor(() => expect(mocks.openTagNoteFile).toHaveBeenCalledOnce());

        expect(harness.createTagNote).toHaveBeenCalledWith('projects/active', harness.activeFile.path, {
            openAfterCreate: false
        });
        const openParams = mocks.openTagNoteFile.mock.calls[0]?.[0] as OpenTagNoteCall | undefined;
        expect(openParams).toEqual(expect.objectContaining({ context: 'right-sidebar', tagNote: createdFile }));
        await openParams?.openInRightSidebar?.(createdFile);
        expect(harness.openFolderNoteInRightSidebar).toHaveBeenCalledOnce();
    });

    it('re-resolves a stale menu and opens a newly linked unique note instead of creating a duplicate', async () => {
        const linkedFile = createTestTFile('Indexes/Active.md');
        mocks.resolveTagNote.mockReturnValueOnce(createResolution('missing')).mockReturnValueOnce(createResolution('found', linkedFile));
        const harness = createHarness();

        await clickCreateTagNote(harness.menu);
        await vi.waitFor(() => expect(mocks.openTagNoteFile).toHaveBeenCalledOnce());

        expect(harness.createTagNote).not.toHaveBeenCalled();
        expect(mocks.revealTagNoteInNavigator).toHaveBeenCalledWith(harness.selectionDispatch, linkedFile, 'projects/active');
    });

    it('fails closed with a warning when re-resolution is ambiguous', async () => {
        mocks.resolveTagNote.mockReturnValueOnce(createResolution('missing')).mockReturnValueOnce({
            ...createResolution('ambiguous'),
            matches: [createTestTFile('One/Active.md'), createTestTFile('Two/Active.md')]
        });
        const harness = createHarness();

        await clickCreateTagNote(harness.menu);
        await vi.waitFor(() => expect(mocks.showNotice).toHaveBeenCalledOnce());

        expect(harness.createTagNote).not.toHaveBeenCalled();
        expect(mocks.openTagNoteFile).not.toHaveBeenCalled();
        expect(mocks.showNotice.mock.calls[0]?.[0]).toContain('multiple notes named "Active.md"');
        expect(mocks.showNotice.mock.calls[0]?.[1]).toEqual({ variant: 'warning' });
    });

    it.each([
        {
            result: { status: 'conflict', file: null, path: 'Indexes/Active.md' },
            expectedNotice: 'Indexes/Active.md'
        },
        {
            result: { status: 'failed', file: null, path: 'Indexes/Active.md' },
            expectedNotice: 'the tag note could not be created at "Indexes/Active.md"'
        }
    ])('warns clearly and does not reveal when creation returns $result.status', async ({ result, expectedNotice }) => {
        const harness = createHarness();
        harness.createTagNote.mockResolvedValue(result);

        await clickCreateTagNote(harness.menu);
        await vi.waitFor(() => expect(mocks.showNotice).toHaveBeenCalledOnce());

        expect(mocks.showNotice.mock.calls[0]?.[0]).toContain(expectedNotice);
        expect(mocks.revealTagNoteInNavigator).not.toHaveBeenCalled();
        expect(mocks.openTagNoteFile).not.toHaveBeenCalled();
    });
});
