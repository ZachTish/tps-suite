/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import React from 'react';
import { App, Platform, TFile, TFolder } from 'obsidian';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useNavigationPaneShortcutActions } from '../../src/hooks/navigationPane/useNavigationPaneShortcutActions';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import { ItemType } from '../../src/types';
import { ShortcutType, type SearchShortcut } from '../../src/types/shortcuts';
import type { TagTreeNode } from '../../src/types/storage';

interface TestVaultMethods {
    registerFile(file: TFile): void;
    registerFolder(folder: TFolder): void;
}

function createHarness(options?: { app?: App; settings?: NotebookNavigatorSettings; onRevealProperty?: ReturnType<typeof vi.fn> }) {
    const app = options?.app ?? new App();
    Object.assign(app, {
        workspace: {
            getLeaf: () => ({ openFile: vi.fn(async () => undefined) }),
            leftSplit: null
        }
    });
    const onResetSearchForNavigation = vi.fn();
    const onNavigateToFolder = vi.fn();
    const onRevealTag = vi.fn();
    const onRevealProperty = options?.onRevealProperty ?? vi.fn(() => true);
    const onRevealFile = vi.fn();
    const onRevealShortcutFile = vi.fn();
    const onExecuteSearchShortcut = vi.fn();
    const selectionDispatch = vi.fn();
    const setActiveShortcut = vi.fn();
    const tagNode: TagTreeNode = {
        name: 'work',
        path: 'work',
        displayPath: 'Work',
        children: new Map(),
        notesWithTag: new Set()
    };
    let captured: ReturnType<typeof useNavigationPaneShortcutActions> | null = null;

    function Harness() {
        captured = useNavigationPaneShortcutActions({
            app,
            commandQueue: null,
            isMobile: false,
            rootContainerRef: { current: null },
            settings: options?.settings ?? DEFAULT_SETTINGS,
            uiState: { singlePane: false, currentSinglePaneView: 'files' },
            uiDispatch: vi.fn(),
            selectionType: ItemType.FOLDER,
            selectedFolder: null,
            selectionDispatch,
            setActiveShortcut,
            onExecuteSearchShortcut,
            onNavigateToFolder,
            onRevealTag,
            onRevealProperty,
            onRevealFile,
            onRevealShortcutFile,
            onResetSearchForNavigation,
            openFolderNoteInRightSidebar: vi.fn(async () => undefined),
            tagTree: new Map([[tagNode.path, tagNode]]),
            hydratedShortcuts: []
        });
        return null;
    }

    renderToStaticMarkup(React.createElement(Harness));
    if (!captured) {
        throw new Error('Expected hook result');
    }

    return {
        app,
        result: captured as ReturnType<typeof useNavigationPaneShortcutActions>,
        onResetSearchForNavigation,
        onNavigateToFolder,
        onRevealTag,
        onRevealProperty,
        onRevealFile,
        onRevealShortcutFile,
        onExecuteSearchShortcut,
        selectionDispatch
    };
}

describe('useNavigationPaneShortcutActions search reset', () => {
    it('resets ordinary folder, tag, and successful property navigation shortcuts', () => {
        const harness = createHarness();
        const folder = new TFolder('Projects');

        harness.result.handleShortcutFolderActivate(folder, 'folder:Projects');
        expect(harness.onResetSearchForNavigation).toHaveBeenCalledOnce();
        expect(harness.onNavigateToFolder).toHaveBeenCalledWith('Projects', expect.objectContaining({ source: 'shortcut' }));

        harness.onResetSearchForNavigation.mockClear();
        harness.result.handleShortcutTagActivate('work', 'tag:work');
        expect(harness.onResetSearchForNavigation).toHaveBeenCalledOnce();
        expect(harness.onRevealTag).toHaveBeenCalledWith('work', expect.objectContaining({ source: 'shortcut' }));

        harness.onResetSearchForNavigation.mockClear();
        expect(harness.result.handleShortcutPropertyActivate('key:status', 'property:status')).toBe(true);
        expect(harness.onResetSearchForNavigation).toHaveBeenCalledOnce();
    });

    it('preserves search when a property shortcut reveal fails', () => {
        const harness = createHarness({ onRevealProperty: vi.fn(() => false) });

        expect(harness.result.handleShortcutPropertyActivate('key:missing', 'property:missing')).toBe(false);
        expect(harness.onResetSearchForNavigation).not.toHaveBeenCalled();
    });

    it('resets plain note and recent-note shortcuts but preserves alternate new-tab activation', () => {
        const previousIsMobile = Platform.isMobile;
        const previousIsTablet = Platform.isTablet;
        Platform.isMobile = false;
        Platform.isTablet = false;

        try {
            const note = new TFile('Notes/Test.md');
            const harness = createHarness({ settings: { ...DEFAULT_SETTINGS, multiSelectModifier: 'optionAlt' } });

            harness.result.handleShortcutNoteActivate(note, 'note:Notes/Test.md');
            expect(harness.onResetSearchForNavigation).toHaveBeenCalledOnce();
            expect(harness.onRevealFile).toHaveBeenCalledWith(note);

            harness.onResetSearchForNavigation.mockClear();
            harness.result.handleRecentNoteActivate(note);
            expect(harness.onResetSearchForNavigation).toHaveBeenCalledOnce();

            harness.onResetSearchForNavigation.mockClear();
            harness.result.handleShortcutNoteActivate(note, 'note:Notes/Test.md', {
                altKey: false,
                ctrlKey: true,
                metaKey: true
            } as React.MouseEvent<HTMLDivElement>);
            expect(harness.onResetSearchForNavigation).not.toHaveBeenCalled();
        } finally {
            Platform.isMobile = previousIsMobile;
            Platform.isTablet = previousIsTablet;
        }
    });

    it('does not reset before executing a saved-search shortcut', () => {
        const harness = createHarness();
        const searchShortcut: SearchShortcut = {
            type: ShortcutType.SEARCH,
            name: 'Work search',
            query: '#work'
        };

        harness.result.handleShortcutSearchActivate('search:work', searchShortcut);

        expect(harness.onExecuteSearchShortcut).toHaveBeenCalledWith('search:work', searchShortcut);
        expect(harness.onResetSearchForNavigation).not.toHaveBeenCalled();
    });

    it('opens a tag-note shortcut label without leaving the tag scope', () => {
        const app = new App();
        const tagNote = new TFile('Topics/Work.md');
        (app.vault as App['vault'] & TestVaultMethods).registerFile(tagNote);
        app.metadataCache.getFileCache = file => (file === tagNote ? { tags: [{ tag: '#Work' }] } : null);
        const harness = createHarness({
            app,
            settings: { ...DEFAULT_SETTINGS, enableFolderNotes: true, enableFolderNoteLinks: true }
        });

        harness.result.handleShortcutTagNoteClick('work', 'tag:work', {
            altKey: false,
            ctrlKey: false,
            metaKey: false
        } as React.MouseEvent<HTMLSpanElement>);

        expect(harness.onResetSearchForNavigation).toHaveBeenCalledOnce();
        expect(harness.selectionDispatch).toHaveBeenCalledWith({
            type: 'REVEAL_FILE',
            file: tagNote,
            targetTag: 'work',
            source: 'manual'
        });
        expect(harness.selectionDispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_SELECTED_TAG' }));
    });

    it('resets before a middle-click folder-note selection', () => {
        const app = new App();
        const folder = new TFolder('Projects') as TFolder & { children: Array<TFile>; name: string; vault: App['vault'] };
        folder.children = [];
        folder.name = 'Projects';
        folder.vault = app.vault;
        const note = new TFile('Projects/index.md') as TFile & { parent: TFolder };
        note.parent = folder;
        folder.children.push(note);
        const testVault = app.vault as App['vault'] & TestVaultMethods;
        testVault.registerFolder(folder);
        testVault.registerFile(note);
        const harness = createHarness({
            app,
            settings: { ...DEFAULT_SETTINGS, enableFolderNotes: true, enableFolderNoteLinks: true, folderNoteNamePattern: 'index' }
        });
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();

        harness.result.handleShortcutFolderNoteMouseDown(folder, {
            button: 1,
            preventDefault,
            stopPropagation
        } as unknown as React.MouseEvent<HTMLSpanElement>);

        expect(harness.onResetSearchForNavigation).toHaveBeenCalledOnce();
        expect(harness.selectionDispatch).toHaveBeenCalledWith({ type: 'SET_SELECTED_FOLDER', folder, autoSelectedFile: null });
        expect(preventDefault).toHaveBeenCalledOnce();
        expect(stopPropagation).toHaveBeenCalledOnce();
    });
});
