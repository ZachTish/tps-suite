/* TPS Notebook Navigator - file-backed Type selection retention for path moves. */

import { App, TFolder, type TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import type { SelectionAction } from '../../src/context/SelectionContext';
import type { ISettingsProvider } from '../../src/interfaces/ISettingsProvider';
import type { CommandQueueService, MoveFilesCommandData } from '../../src/services/CommandQueueService';
import { FileMoveService } from '../../src/services/fileSystem/FileMoveService';
import type { FolderPathSettingsSync } from '../../src/services/fileSystem/FolderPathSettingsSync';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import { createTestTFile } from '../utils/createTestTFile';

vi.mock('../../src/modals/FolderSuggestModal', () => ({
    FolderSuggestModal: class FolderSuggestModal {}
}));

vi.mock('../../src/modals/MoveFileConflictModal', () => ({
    MoveFileConflictModal: class MoveFileConflictModal {}
}));

type TestFolder = TFolder & { children: Array<TFile | TFolder>; name: string };
type MutableTestFile = TFile & { setPath(path: string): void };

function createSettingsProvider(settings: NotebookNavigatorSettings): ISettingsProvider {
    return {
        settings,
        saveSettingsAndUpdate: vi.fn().mockResolvedValue(undefined),
        notifySettingsUpdate: vi.fn(),
        getRecentNotes: () => [],
        setRecentNotes: vi.fn(),
        getRecentIcons: () => ({}),
        setRecentIcons: vi.fn(),
        getRecentColors: () => [],
        setRecentColors: vi.fn()
    };
}

function createCommandQueue(): CommandQueueService {
    return {
        executeMoveFiles: vi.fn(async (_files: TFile[], _targetFolder: TFolder, performMove: () => Promise<MoveFilesCommandData>) => ({
            success: true,
            data: await performMove()
        }))
    } as unknown as CommandQueueService;
}

function createHarness() {
    const app = new App();
    const openFile = vi.fn().mockResolvedValue(undefined);
    Object.assign(app, { workspace: { getLeaf: () => ({ openFile }) } });
    app.fileManager.renameFile = vi.fn(async (file: TFile, targetPath: string) => {
        (file as MutableTestFile).setPath(targetPath);
    });

    const service = new FileMoveService({
        app,
        settingsProvider: createSettingsProvider({ ...DEFAULT_SETTINGS }),
        getCommandQueue: createCommandQueue,
        resolveFolderDisplayLabel: folder => folder.path,
        folderPathSettingsSync: {} as FolderPathSettingsSync
    });
    const targetFolder = Object.assign(new TFolder('Archive'), { name: 'Archive', children: [] }) as TestFolder;

    return { app, openFile, service, targetFolder };
}

describe('FileMoveService file-backed Type selection', () => {
    it('keeps a single moved file selected by remapping its path instead of advancing', async () => {
        const { service, targetFolder, openFile } = createHarness();
        const before = createTestTFile('Inbox/Before.md');
        const selected = createTestTFile('Inbox/Selected.md');
        const after = createTestTFile('Inbox/After.md');
        const dispatch = vi.fn<(action: SelectionAction) => void>();
        const membershipGuard = vi.fn(() => true);

        await service.moveFilesToFolder({
            files: [selected],
            targetFolder,
            showNotifications: false,
            selectionContext: {
                selectedFile: selected,
                dispatch,
                allFiles: [before, selected, after],
                shouldKeepMovedFileSelected: membershipGuard
            }
        });

        expect(selected.path).toBe('Archive/Selected.md');
        expect(membershipGuard).toHaveBeenCalledWith(selected);
        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'UPDATE_FILE_PATH',
            oldPath: 'Inbox/Selected.md',
            newPath: 'Archive/Selected.md'
        });
        expect(openFile).not.toHaveBeenCalled();
    });

    it('remaps every moved path without collapsing a multi-file selection', async () => {
        const { service, targetFolder } = createHarness();
        const first = createTestTFile('Inbox/First.md');
        const second = createTestTFile('Inbox/Second.md');
        const dispatch = vi.fn<(action: SelectionAction) => void>();

        await service.moveFilesToFolder({
            files: [first, second],
            targetFolder,
            showNotifications: false,
            selectionContext: {
                selectedFile: first,
                dispatch,
                allFiles: [first, second],
                shouldKeepMovedFileSelected: () => true
            }
        });

        expect(dispatch.mock.calls.map(([action]) => action)).toEqual([
            { type: 'UPDATE_FILE_PATH', oldPath: 'Inbox/First.md', newPath: 'Archive/First.md' },
            { type: 'UPDATE_FILE_PATH', oldPath: 'Inbox/Second.md', newPath: 'Archive/Second.md' }
        ]);
        expect(dispatch.mock.calls.some(([action]) => action.type === 'SET_SELECTED_FILE')).toBe(false);
        expect(dispatch.mock.calls.some(([action]) => action.type === 'CLEAR_FILE_SELECTION')).toBe(false);
    });

    it('falls back to the adjacent row when the moved file no longer belongs to the Type', async () => {
        const { service, targetFolder, openFile } = createHarness();
        const before = createTestTFile('Inbox/Before.md');
        const selected = createTestTFile('Inbox/Selected.md');
        const after = createTestTFile('Inbox/After.md');
        const dispatch = vi.fn<(action: SelectionAction) => void>();

        await service.moveFilesToFolder({
            files: [selected],
            targetFolder,
            showNotifications: false,
            selectionContext: {
                selectedFile: selected,
                dispatch,
                allFiles: [before, selected, after],
                shouldKeepMovedFileSelected: () => false
            }
        });

        expect(dispatch).toHaveBeenCalledWith({ type: 'SET_SELECTED_FILE', file: after });
        expect(openFile).toHaveBeenCalledWith(after, { active: false });
    });
});
