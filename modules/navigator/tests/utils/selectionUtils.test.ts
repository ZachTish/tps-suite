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

import { App, TFolder, type TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import {
    canAddShortcutForNavigationSelection,
    createFileBackedTypeMoveSelectionGuard,
    findNextFileAfterRemoval,
    getVisibleFileTypeFiles,
    getNavigatorPinContext,
    getPinnedSectionCollapseKey,
    getSelectedPath,
    orderFilesByReference,
    resolveFileOperationCurrentFiles
} from '../../src/utils/selectionUtils';
import { ItemType } from '../../src/types';
import { TPS_NAVIGATOR_FILE_TYPES, TPS_NAVIGATOR_LINE_TYPES, TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { createTestTFile } from './createTestTFile';

describe('orderFilesByReference', () => {
    it('orders files by a reference list and appends missing files in original order', () => {
        const first = createTestTFile('Notes/First.md');
        const second = createTestTFile('Notes/Second.md');
        const third = createTestTFile('Notes/Third.md');
        const outsideReference = createTestTFile('Notes/Outside.md');

        const ordered = orderFilesByReference([third, first, second], [outsideReference, second, first]);

        expect(ordered.map(file => file.path)).toEqual([second.path, first.path, third.path]);
    });
});

describe('Types selection helpers', () => {
    const typeSelection = {
        selectionType: ItemType.TYPE,
        selectedFolder: null,
        selectedTag: null,
        selectedProperty: null,
        selectedType: 'kind:project' as const
    };

    it('returns the selected type as the navigation path', () => {
        expect(getSelectedPath(typeSelection)).toBe('kind:project');
    });

    it('does not introduce a new persisted pin namespace', () => {
        expect(getNavigatorPinContext(typeSelection.selectionType)).toBe(ItemType.FOLDER);
        expect(getPinnedSectionCollapseKey(typeSelection)).toBe('folder:/');
    });

    it('blocks shortcut mutation instead of falling through to the active file', () => {
        expect(canAddShortcutForNavigationSelection(ItemType.TYPE)).toBe(false);
        expect(canAddShortcutForNavigationSelection(ItemType.FOLDER)).toBe(true);
        expect(canAddShortcutForNavigationSelection(ItemType.TAG)).toBe(true);
        expect(canAddShortcutForNavigationSelection(ItemType.PROPERTY)).toBe(true);
    });

    it.each(TPS_NAVIGATOR_FILE_TYPES)('uses the live ordered rows for file-backed Type $id operations', descriptor => {
        const orderedFiles = [createTestTFile('Visible/Second.md'), createTestTFile('Visible/First.md')];
        let fallbackCalls = 0;

        const result = resolveFileOperationCurrentFiles({ ...typeSelection, selectedType: descriptor.id }, orderedFiles, () => {
            fallbackCalls += 1;
            return [createTestTFile('Fallback.md')];
        });

        expect(result).toBe(orderedFiles);
        expect(fallbackCalls).toBe(0);
    });

    it('treats an unavailable live list as an empty file-backed Type scope', () => {
        const fallback = [createTestTFile('Fallback.md')];

        expect(resolveFileOperationCurrentFiles({ ...typeSelection, selectedType: 'file:base' }, undefined, () => fallback)).toEqual([]);
    });

    it.each([...TPS_NAVIGATOR_LINE_TYPES.map(descriptor => descriptor.id), 'provider:example%2Fentities:projects', 'kind:project'])(
        'preserves fallback selection behavior for non-file Type %s',
        selectedType => {
            const orderedFiles = [createTestTFile('Visible.md')];
            const fallback = [createTestTFile('Fallback.md')];

            expect(resolveFileOperationCurrentFiles({ ...typeSelection, selectedType }, orderedFiles, () => fallback)).toBe(fallback);
        }
    );

    it('retains a moved file only while it remains visible in the selected file-backed Type', () => {
        const app = new App();
        const root = app.vault.getRoot() as TFolder & { children: TFile[] };
        const note = createTestTFile('Inbox/Note.md');
        (note as TFile & { parent: TFolder }).parent = root;
        root.children = [note];

        const guard = createFileBackedTypeMoveSelectionGuard(
            { ...typeSelection, selectedType: TPS_NAVIGATOR_TYPE_IDS.NOTES },
            DEFAULT_SETTINGS,
            false,
            app
        );

        expect(guard).toBeTypeOf('function');
        expect(guard?.(note)).toBe(true);

        Object.assign(note, createTestTFile('Inbox/Note.base'));
        expect(guard?.(note)).toBe(false);

        Object.assign(note, createTestTFile('Inbox/Note.md'));
        root.children = [];
        expect(guard?.(note)).toBe(false);
    });

    it.each([...TPS_NAVIGATOR_LINE_TYPES.map(descriptor => descriptor.id), 'provider:example%2Fentities:projects', 'kind:project'])(
        'does not opt non-file Type %s into moved-file retention',
        selectedType => {
            expect(
                createFileBackedTypeMoveSelectionGuard({ ...typeSelection, selectedType }, DEFAULT_SETTINGS, false, new App())
            ).toBeUndefined();
        }
    );
});

describe('findNextFileAfterRemoval', () => {
    it('uses stable pre-operation paths after Obsidian mutates moved TFile objects', () => {
        const first = createTestTFile('Inbox/First.md');
        const moved = createTestTFile('Inbox/Moved.md');
        const last = createTestTFile('Inbox/Last.md');
        const originalPaths = new Map<TFile, string>([
            [first, first.path],
            [moved, moved.path],
            [last, last.path]
        ]);

        Object.assign(moved, createTestTFile('Archive/Moved.md'));

        expect(findNextFileAfterRemoval([first, moved, last], new Set(['Inbox/Moved.md']), originalPaths)).toBe(last);
    });
});

describe('File category visibility', () => {
    it('includes Base and Canvas with a Markdown-only profile without modifying the preference', () => {
        const app = new App();
        const root = app.vault.getRoot() as TFolder & { children: TFile[] };
        const files = ['Note.md', 'Table.base', 'Board.canvas'].map(createTestTFile);
        for (const file of files) (file as TFile & { parent: TFolder }).parent = root;
        root.children = files;
        const settings = structuredClone(DEFAULT_SETTINGS);
        for (const profile of settings.vaultProfiles) profile.fileVisibility = 'markdown';
        expect(
            getVisibleFileTypeFiles(settings, false, app)
                .map(file => file.path)
                .sort()
        ).toEqual(['Board.canvas', 'Note.md', 'Table.base']);
        expect(settings.vaultProfiles.every(profile => profile.fileVisibility === 'markdown')).toBe(true);
    });
});
