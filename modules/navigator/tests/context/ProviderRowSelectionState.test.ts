/* TPS Notebook Navigator - provider-row cursor reducer behavior. */

import { describe, expect, it } from 'vitest';
import { TFile, TFolder } from 'obsidian';
import { selectionReducer } from '../../src/context/selection/state';
import type { SelectedNavigatorRow, SelectionState } from '../../src/context/selection/types';

function createFolder(path: string): TFolder {
    const folder = new TFolder();
    folder.path = path;
    folder.name = path;
    folder.children = [];
    return folder;
}

function createFile(path: string, parent: TFolder): TFile {
    const file = new TFile();
    file.path = path;
    file.name = path.split('/').pop() ?? path;
    file.basename = file.name.replace(/\.md$/u, '');
    file.extension = 'md';
    file.parent = parent;
    file.stat = { ctime: 0, mtime: 0, size: 0 };
    return file;
}

function createState(file: TFile): SelectionState {
    return {
        selectionType: 'folder',
        selectedFolder: file.parent,
        selectedTag: null,
        selectedProperty: null,
        selectedType: null,
        selectedFiles: new Set([file.path]),
        selectedFile: file,
        selectedRow: null,
        anchorIndex: 2,
        lastMovementDirection: 'down',
        isRevealOperation: false,
        isFolderChangeWithAutoSelect: false,
        isKeyboardNavigation: true,
        isFolderNavigation: false,
        revealSource: null,
        navigationHistory: [{ type: 'folder', value: file.parent?.path ?? '' }],
        navigationHistoryIndex: 0
    };
}

const selectedRow: SelectedNavigatorRow = {
    providerId: 'tps/tasks',
    rowId: 'task-12',
    kind: 'tps/task',
    label: 'Review provider contract',
    sourcePath: 'Inbox/Tasks.md',
    sourceLineNumber: 11,
    typeId: null
};

describe('selectionReducer provider-row cursor', () => {
    it('selects exactly one immutable row and clears native file selection state', () => {
        const folder = createFolder('Inbox');
        const file = createFile('Inbox/Tasks.md', folder);

        const state = selectionReducer(createState(file), { type: 'SET_SELECTED_ROW', row: selectedRow });

        expect(state.selectedFiles.size).toBe(0);
        expect(state.selectedFile).toBeNull();
        expect(state.selectedRow).toEqual(selectedRow);
        expect(Object.isFrozen(state.selectedRow)).toBe(true);
        expect(state.anchorIndex).toBeNull();
        expect(state.lastMovementDirection).toBeNull();
        expect(state.isKeyboardNavigation).toBe(false);
    });

    it('makes subsequent native file selection exclusive with the row cursor', () => {
        const folder = createFolder('Inbox');
        const file = createFile('Inbox/Tasks.md', folder);
        const rowState = selectionReducer(createState(file), { type: 'SET_SELECTED_ROW', row: selectedRow });

        const fileState = selectionReducer(rowState, { type: 'SET_SELECTED_FILE', file });

        expect(fileState.selectedRow).toBeNull();
        expect(Array.from(fileState.selectedFiles)).toEqual([file.path]);
        expect(fileState.selectedFile).toBe(file);
    });

    it('clears a row cursor when navigation scope changes', () => {
        const folder = createFolder('Inbox');
        const file = createFile('Inbox/Tasks.md', folder);
        const rowState = selectionReducer(createState(file), { type: 'SET_SELECTED_ROW', row: selectedRow });

        const typeState = selectionReducer(rowState, { type: 'SET_SELECTED_TYPE', typeId: 'structural:bullet' });

        expect(typeState.selectedRow).toBeNull();
        expect(typeState.selectionType).toBe('type');
        expect(typeState.selectedType).toBe('structural:bullet');
    });

    it('clears a row cursor when its source is deleted or renamed', () => {
        const folder = createFolder('Inbox');
        const file = createFile('Inbox/Tasks.md', folder);
        const rowState = selectionReducer(createState(file), { type: 'SET_SELECTED_ROW', row: selectedRow });

        expect(selectionReducer(rowState, { type: 'CLEANUP_DELETED_FILE', deletedPath: selectedRow.sourcePath }).selectedRow).toBeNull();
        expect(
            selectionReducer(rowState, {
                type: 'UPDATE_FILE_PATH',
                oldPath: selectedRow.sourcePath,
                newPath: 'Inbox/Renamed.md'
            }).selectedRow
        ).toBeNull();
    });
});
