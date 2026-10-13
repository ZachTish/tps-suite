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
import { App, TFolder, type TFile } from 'obsidian';
import { FileSystemOperations } from '../../src/services/FileSystemService';
import type { ISettingsProvider } from '../../src/interfaces/ISettingsProvider';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import { createTestTFile } from '../utils/createTestTFile';

vi.mock('../../src/modals/ConfirmModal', () => ({
    ConfirmModal: class ConfirmModal {
        open(): void {}
    }
}));

vi.mock('../../src/modals/FolderSuggestModal', () => ({
    FolderSuggestModal: class FolderSuggestModal {}
}));

const renameModal = vi.hoisted(() => ({ submit: null as null | ((value: string) => Promise<void>), initialValue: '' }));

vi.mock('../../src/modals/InputModal', () => ({
    InputModal: class InputModal {
        constructor(_app: unknown, _title: string, _prompt: string, submit: (value: string) => Promise<void>, initialValue: string) {
            renameModal.submit = submit;
            renameModal.initialValue = initialValue;
        }
        open(): void {}
    }
}));

type FrontmatterFile = TFile & { frontmatter: Record<string, unknown> };
type TestFolder = TFolder & {
    children: TFile[];
    name: string;
    parent: TFolder | null;
    vault: App['vault'];
};

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

function createSettings(overrides: Partial<NotebookNavigatorSettings>): NotebookNavigatorSettings {
    return { ...DEFAULT_SETTINGS, ...overrides };
}

function createOperations(app: App, settings: NotebookNavigatorSettings): FileSystemOperations {
    return new FileSystemOperations(
        app,
        () => null,
        () => null,
        () => null,
        () => null,
        () => ({ includeDescendantNotes: false, showHiddenItems: false }),
        createSettingsProvider(settings)
    );
}

function createFile(path: string, frontmatter: Record<string, unknown>): FrontmatterFile {
    return Object.assign(createTestTFile(path), { frontmatter });
}

function installFrontmatterMocks(app: App): ReturnType<typeof vi.fn> {
    app.metadataCache.getFileCache = (file: TFile) => ({
        frontmatter: (file as Partial<FrontmatterFile>).frontmatter
    });
    const processFrontMatter = vi.fn(async (file: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
        callback((file as FrontmatterFile).frontmatter);
    });
    app.fileManager.processFrontMatter = processFrontMatter;
    return processFrontMatter;
}

function createFolderWithFolderNote(app: App, folderPath: string): { folder: TestFolder; folderNote: FrontmatterFile } {
    const folder = new TFolder(folderPath) as TestFolder;
    folder.name = folderPath.split('/').pop() ?? folderPath;
    folder.parent = app.vault.getRoot();
    folder.vault = app.vault;
    folder.children = [];

    const folderNote = createFile(`${folderPath}/${folder.name}.md`, {});
    (folderNote as TFile & { parent: TFolder }).parent = folder;
    folder.children.push(folderNote);

    const vault = app.vault as App['vault'] & {
        registerFolder: (target: TFolder) => void;
        registerFile: (target: TFile) => void;
    };
    vault.registerFolder(folder);
    vault.registerFile(folderNote);

    return { folder, folderNote };
}

describe('FileSystemOperations display-name rename', () => {
    it('prefills missing file frontmatter names with the file name and skips unchanged writes', async () => {
        const app = new App();
        const processFrontMatter = installFrontmatterMocks(app);
        const file = createFile('Note.md', {});
        const operations = createOperations(
            app,
            createSettings({
                useFrontmatterMetadata: true,
                frontmatterNameField: 'title, name'
            })
        );

        expect(operations.getFileDisplayNameRenameInput(file).initialValue).toBe('Note');
        await expect(operations.renameFileDisplayName(file, 'Note')).resolves.toBe(true);

        expect(file.frontmatter).toEqual({});
        expect(processFrontMatter).not.toHaveBeenCalled();
    });

    it('edits missing file frontmatter name when the value changes', async () => {
        const app = new App();
        const processFrontMatter = installFrontmatterMocks(app);
        const file = createFile('Note.md', {});
        const operations = createOperations(
            app,
            createSettings({
                useFrontmatterMetadata: true,
                frontmatterNameField: 'title, name'
            })
        );

        await expect(operations.renameFileDisplayName(file, 'Display title')).resolves.toBe(true);

        expect(file.frontmatter).toEqual({ title: 'Display title' });
        expect(processFrontMatter).toHaveBeenCalledWith(file, expect.any(Function));
    });

    it('removes file frontmatter name when the value matches the file name', async () => {
        const app = new App();
        const processFrontMatter = installFrontmatterMocks(app);
        const file = createFile('Johan.md', { title: 'JohanS' });
        const operations = createOperations(
            app,
            createSettings({
                useFrontmatterMetadata: true,
                frontmatterNameField: 'title, name'
            })
        );

        expect(operations.getFileDisplayNameRenameInput(file).initialValue).toBe('JohanS');
        await expect(operations.renameFileDisplayName(file, 'Johan')).resolves.toBe(true);

        expect(file.frontmatter).toEqual({});
        expect(processFrontMatter).toHaveBeenCalledWith(file, expect.any(Function));
    });

    it('renames the file path when frontmatter display names are not active', async () => {
        const app = new App();
        const file = createFile('Note.md', {});
        (file as TFile & { parent: TFolder }).parent = app.vault.getRoot();
        const renameFile = vi.fn().mockResolvedValue(undefined);
        app.fileManager.renameFile = renameFile;
        const operations = createOperations(
            app,
            createSettings({
                useFrontmatterMetadata: false,
                frontmatterNameField: 'title'
            })
        );

        expect(operations.getFileDisplayNameRenameInput(file).initialValue).toBe('Note');
        await expect(operations.renameFileDisplayName(file, 'Renamed')).resolves.toBe(true);

        expect(renameFile).toHaveBeenCalledWith(file, 'Renamed.md');
    });

    it('edits folder-note frontmatter name and starts with the folder name when no value exists', async () => {
        const app = new App();
        const processFrontMatter = installFrontmatterMocks(app);
        const { folder, folderNote } = createFolderWithFolderNote(app, 'Projects');
        const operations = createOperations(
            app,
            createSettings({
                enableFolderNotes: true,
                useFrontmatterMetadata: true,
                frontmatterNameField: 'title'
            })
        );

        expect(operations.getFolderDisplayNameRenameInput(folder).initialValue).toBe('Projects');
        await expect(operations.renameFolderDisplayName(folder, 'Project display')).resolves.toBe(true);

        expect(folderNote.frontmatter).toEqual({ title: 'Project display' });
        expect(processFrontMatter).toHaveBeenCalledWith(folderNote, expect.any(Function));
    });
});

describe('title-based folder-note actions', () => {
    it('explicit linking updates an existing title without requiring a filename change', async () => {
        const app = new App();
        const processFrontMatter = installFrontmatterMocks(app);
        const { folder, folderNote } = createFolderWithFolderNote(app, 'Projects');
        folderNote.frontmatter = { Title: 'Previous title', unrelated: 'preserved' };
        const settings = createSettings({ enableFolderNotes: true, folderNoteNamePattern: '{{folder}}' });
        const originalPath = folderNote.path;
        await createOperations(app, settings).setFileAsFolderNote(folderNote, settings);
        expect(folderNote.path).toBe(originalPath);
        expect(folderNote.frontmatter).toEqual({ Title: folder.name, unrelated: 'preserved' });
        expect(processFrontMatter).toHaveBeenCalledTimes(1);
    });
});

describe('Navigator explicit rename with GCM', () => {
    function setup(frontmatter: Record<string, unknown> = {}, settings: Partial<NotebookNavigatorSettings> = {}) {
        const app = new App();
        const processFrontMatter = installFrontmatterMocks(app);
        const file = createFile('Untitled.md', frontmatter);
        (file as TFile & { parent: TFolder }).parent = app.vault.getRoot();
        const renameFile = vi.fn().mockResolvedValue(undefined);
        app.fileManager.renameFile = renameFile;
        const updateFrontmatter = vi.fn().mockResolvedValue(1);
        Object.assign(app, { plugins: { plugins: { 'tps-global-context-menu': { api: { updateFrontmatter } } } } });
        const operations = createOperations(app, createSettings({ useFrontmatterMetadata: false, ...settings }));
        return { app, file, operations, updateFrontmatter, renameFile, processFrontMatter };
    }

    it('sends an immediate rename to the title owner before metadata exists', async () => {
        const h = setup({ title: 'Untitled' });
        h.app.metadataCache.getFileCache = () => null;
        await expect(h.operations.renameFileDisplayName(h.file, 'New note')).resolves.toBe(true);
        expect(h.updateFrontmatter).toHaveBeenCalledWith([h.file], { title: 'New note' });
        expect(h.renameFile).not.toHaveBeenCalled();
        expect(h.processFrontMatter).not.toHaveBeenCalled();
    });

    it('uses the same title owner when Navigator is configured to display titles', async () => {
        const h = setup({ Title: 'Untitled' }, { useFrontmatterMetadata: true, frontmatterNameField: 'title' });
        await expect(h.operations.renameFileDisplayName(h.file, 'New note')).resolves.toBe(true);
        expect(h.updateFrontmatter).toHaveBeenCalledWith([h.file], { title: 'New note' });
        expect(h.renameFile).not.toHaveBeenCalled();
    });

    it('does not fall through to filename-only renaming when the title write is cancelled or rejected', async () => {
        const h = setup();
        h.updateFrontmatter.mockResolvedValue(0);
        await expect(h.operations.renameFileDisplayName(h.file, 'New note')).resolves.toBe(false);
        expect(h.renameFile).not.toHaveBeenCalled();
    });

    it('does not fall through after a title writer error', async () => {
        const h = setup();
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        h.updateFrontmatter.mockRejectedValue(new Error('Rejected'));
        await expect(h.operations.renameFileDisplayName(h.file, 'New note')).resolves.toBe(false);
        expect(h.renameFile).not.toHaveBeenCalled();
        log.mockRestore();
    });

    it('preserves separately configured display-name fields', async () => {
        const h = setup({ alias: 'Old', title: 'Untitled' }, { useFrontmatterMetadata: true, frontmatterNameField: 'alias' });
        await expect(h.operations.renameFileDisplayName(h.file, 'New alias')).resolves.toBe(true);
        expect(h.file.frontmatter).toEqual({ alias: 'New alias', title: 'Untitled' });
        expect(h.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('closes an unchanged title edit without calling either writer', async () => {
        const h = setup({ title: 'Current title' });
        await expect(h.operations.renameFileDisplayName(h.file, 'Current title')).resolves.toBe(true);
        expect(h.updateFrontmatter).not.toHaveBeenCalled();
        expect(h.renameFile).not.toHaveBeenCalled();
    });

    it('prefills GCM title edits with the title rather than an unrelated filename', () => {
        const h = setup({ Title: 'Current title' });
        expect(h.operations.getFileDisplayNameRenameInput(h.file).initialValue).toBe('Current title');
    });

    it('routes the ordinary rename dialog through the native file prompt without a title mutation', async () => {
        const h = setup();
        const prompt = vi.fn().mockResolvedValue(undefined);
        Object.assign(h.app.fileManager, { promptForFileRename: prompt });
        await h.operations.renameFile(h.file, true);
        expect(prompt).toHaveBeenCalledExactlyOnceWith(h.file);
        expect(h.updateFrontmatter).not.toHaveBeenCalled();
        expect(h.renameFile).not.toHaveBeenCalled();
    });

    it('retains explicit filename-only operations for folder-note detachment', async () => {
        const h = setup();
        await h.operations.renameFile(h.file);
        await renameModal.submit?.('Detached');
        expect(h.renameFile).toHaveBeenCalledWith(h.file, 'Detached.md');
        expect(h.updateFrontmatter).not.toHaveBeenCalled();
    });

    it('retains filename renaming for non-Markdown resources', async () => {
        const h = setup();
        const resource = createFile('Untitled.canvas', {});
        (resource as TFile & { parent: TFolder }).parent = h.app.vault.getRoot();
        await expect(h.operations.renameFileDisplayName(resource, 'Canvas')).resolves.toBe(true);
        expect(h.renameFile).toHaveBeenCalledWith(resource, 'Canvas.canvas');
        expect(h.updateFrontmatter).not.toHaveBeenCalled();
    });
});
