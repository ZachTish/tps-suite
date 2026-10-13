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
import { describe, expect, it, vi } from 'vitest';
import type { ISettingsProvider } from '../../src/interfaces/ISettingsProvider';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { FileSystemOperations } from '../../src/services/FileSystemService';
import type { TagTreeService } from '../../src/services/TagTreeService';
import type { TagTreeNode } from '../../src/types/storage';
import { createTestTFile } from '../utils/createTestTFile';

vi.mock('../../src/modals/ConfirmModal', () => ({
    ConfirmModal: class ConfirmModal {
        open(): void {}
    }
}));

vi.mock('../../src/modals/FolderSuggestModal', () => ({
    FolderSuggestModal: class FolderSuggestModal {}
}));

vi.mock('../../src/modals/InputModal', () => ({
    InputModal: class InputModal {
        open(): void {}
    }
}));

type FrontmatterFile = TFile & { frontmatter: Record<string, unknown> };

function createSettingsProvider(): ISettingsProvider {
    return {
        settings: { ...DEFAULT_SETTINGS },
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

function createTagNode(): TagTreeNode {
    return {
        name: 'Active',
        path: 'projects/active',
        displayPath: 'Projects/Active',
        children: new Map(),
        notesWithTag: new Set()
    };
}

function createOperations(app: App, node: TagTreeNode | null = createTagNode()): FileSystemOperations {
    const tagTreeService = {
        findTagNode: vi.fn(() => node)
    } as unknown as TagTreeService;
    return new FileSystemOperations(
        app,
        () => tagTreeService,
        () => null,
        () => null,
        () => null,
        () => ({ includeDescendantNotes: false, showHiddenItems: false }),
        createSettingsProvider()
    );
}

function configureCreation(app: App, targetFolder: TFolder, createdFile: FrontmatterFile) {
    const openFile = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue(createdFile);
    const getNewFileParent = vi.fn(() => targetFolder);
    const getLeaf = vi.fn(() => ({ openFile }));
    app.fileManager.getNewFileParent = getNewFileParent;
    app.vault.create = create;
    app.workspace = {
        getActiveFile: vi.fn(() => null),
        getLeaf
    } as unknown as App['workspace'];
    return { create, getNewFileParent, getLeaf, openFile };
}

describe('FileSystemOperations.createTagNote', () => {
    it('creates the exact display-leaf name in the normal tag-note parent and writes the full display tag', async () => {
        const app = new App();
        const targetFolder = new TFolder('Notes');
        const createdFile = Object.assign(createTestTFile('Notes/Active.md'), { frontmatter: {} });
        const mocks = configureCreation(app, targetFolder, createdFile);
        const operations = createOperations(app);

        await expect(operations.createTagNote('projects/active', 'Current.md', { openInNewTab: true })).resolves.toEqual({
            status: 'created',
            file: createdFile,
            path: 'Notes/Active.md'
        });

        expect(mocks.getNewFileParent).toHaveBeenCalledWith('Current.md');
        expect(mocks.create).toHaveBeenCalledWith('Notes/Active.md', '---\ntags:\n  - "Projects/Active"\n---\n');
        expect(mocks.getLeaf).toHaveBeenCalledWith(true);
        expect(mocks.openFile).toHaveBeenCalledWith(createdFile, { state: { mode: 'source' }, active: true });
    });

    it('uses the active note to resolve the default parent when no source path is supplied', async () => {
        const app = new App();
        const targetFolder = new TFolder('Notes');
        const activeFile = createTestTFile('Journal/Today.md');
        const createdFile = Object.assign(createTestTFile('Notes/Active.md'), { frontmatter: {} });
        const mocks = configureCreation(app, targetFolder, createdFile);
        app.workspace.getActiveFile = vi.fn(() => activeFile);
        const operations = createOperations(app);

        await expect(operations.createTagNote('projects/active')).resolves.toMatchObject({ status: 'created' });

        expect(mocks.getNewFileParent).toHaveBeenCalledWith('Journal/Today.md');
        expect(mocks.getLeaf).toHaveBeenCalledWith(false);
    });

    it('can defer opening so a caller can route the created note itself', async () => {
        const app = new App();
        const targetFolder = new TFolder('Notes');
        const createdFile = Object.assign(createTestTFile('Notes/Active.md'), { frontmatter: {} });
        const mocks = configureCreation(app, targetFolder, createdFile);
        const operations = createOperations(app);

        await expect(operations.createTagNote('projects/active', undefined, { openAfterCreate: false })).resolves.toMatchObject({
            status: 'created',
            file: createdFile
        });

        expect(mocks.getLeaf).not.toHaveBeenCalled();
        expect(mocks.openFile).not.toHaveBeenCalled();
    });

    it('never numbers an occupied target name, including a case-only collision', async () => {
        const app = new App();
        const targetFolder = new TFolder('Notes') as TFolder & { children: TFile[] };
        targetFolder.children = [];
        const occupiedFile = createTestTFile('Notes/active.md');
        occupiedFile.parent = targetFolder;
        targetFolder.children.push(occupiedFile);
        (app.vault as unknown as { registerFile: (target: TFile) => void }).registerFile(occupiedFile);
        const createdFile = Object.assign(createTestTFile('Notes/Active 1.md'), { frontmatter: {} });
        const mocks = configureCreation(app, targetFolder, createdFile);
        const operations = createOperations(app);

        await expect(operations.createTagNote('projects/active')).resolves.toEqual({
            status: 'conflict',
            file: null,
            path: 'Notes/active.md'
        });
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.openFile).not.toHaveBeenCalled();
    });

    it('does not create a duplicate when a unique tag note already exists elsewhere', async () => {
        const app = new App();
        const existing = createTestTFile('Indexes/Active.md');
        (app.vault as unknown as { registerFile: (target: TFile) => void }).registerFile(existing);
        app.metadataCache.getFileCache = file => (file === existing ? { frontmatter: { tags: ['Projects/Active'] } } : null);
        const targetFolder = new TFolder('Notes');
        const createdFile = Object.assign(createTestTFile('Notes/Active.md'), { frontmatter: {} });
        const mocks = configureCreation(app, targetFolder, createdFile);
        const operations = createOperations(app);

        await expect(operations.createTagNote('projects/active')).resolves.toEqual({
            status: 'conflict',
            file: null,
            path: 'Indexes/Active.md'
        });
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('reports a concurrent exact-path creation as a conflict instead of numbering', async () => {
        const app = new App();
        const targetFolder = new TFolder('Notes') as TFolder & { children: TFile[] };
        targetFolder.children = [];
        const createdFile = Object.assign(createTestTFile('Notes/Active.md'), { frontmatter: {} });
        const mocks = configureCreation(app, targetFolder, createdFile);
        mocks.create.mockImplementation(async () => {
            const concurrentFile = createTestTFile('Notes/Active.md');
            concurrentFile.parent = targetFolder;
            targetFolder.children.push(concurrentFile);
            (app.vault as unknown as { registerFile: (target: TFile) => void }).registerFile(concurrentFile);
            throw new Error('path already exists');
        });
        const operations = createOperations(app);

        await expect(operations.createTagNote('projects/active')).resolves.toEqual({
            status: 'conflict',
            file: null,
            path: 'Notes/Active.md'
        });
    });

    it('rejects virtual tags before touching the file system', async () => {
        const app = new App();
        const targetFolder = new TFolder('Notes');
        const createdFile = Object.assign(createTestTFile('Notes/Tags.md'), { frontmatter: {} });
        const mocks = configureCreation(app, targetFolder, createdFile);
        const operations = createOperations(app, null);

        await expect(operations.createTagNote('__all_tags__')).resolves.toEqual({
            status: 'invalid',
            file: null,
            path: null
        });
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('reports an atomic creation failure without opening or leaving an untagged partial note', async () => {
        const app = new App();
        const targetFolder = new TFolder('Notes');
        const createdFile = Object.assign(createTestTFile('Notes/Active.md'), { frontmatter: {} });
        const mocks = configureCreation(app, targetFolder, createdFile);
        mocks.create.mockRejectedValue(new Error('path already exists'));
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const operations = createOperations(app);

        await expect(operations.createTagNote('projects/active')).resolves.toEqual({
            status: 'failed',
            file: null,
            path: 'Notes/Active.md'
        });
        expect(mocks.openFile).not.toHaveBeenCalled();
        expect(consoleError).toHaveBeenCalledOnce();
        consoleError.mockRestore();
    });
});
