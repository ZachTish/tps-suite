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

import { App, Plugin, TFile, TFolder } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { TEMPLATER_PLUGIN_ID } from '../../src/constants/pluginIds';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import {
    createFolderNote,
    getFolderNote,
    isFolderNote,
    isFolderNoteTemplateCompatible,
    resolveFolderNoteNameForFolder
} from '../../src/utils/folderNotes';
import { createTestTFile } from './createTestTFile';

interface TestVaultMethods {
    registerFile(file: TFile): void;
    create(path: string, content: string): Promise<TFile>;
    read(file: TFile): Promise<string>;
}

type TestTemplaterCreateFn = (
    template: TFile | string,
    folder?: unknown,
    filename?: string,
    openNewNote?: boolean
) => TFile | Promise<TFile | undefined> | undefined;

class TestTemplaterPlugin extends Plugin {
    templater: {
        create_new_note_from_template: TestTemplaterCreateFn;
    };

    constructor(app: App, createNoteFromTemplate: TestTemplaterCreateFn) {
        super(app, {
            id: TEMPLATER_PLUGIN_ID,
            name: 'Templater',
            author: 'Test',
            version: '1.0.0',
            minAppVersion: '1.0.0',
            description: 'Test plugin'
        });

        this.templater = {
            create_new_note_from_template: createNoteFromTemplate
        };
    }
}

function getTestVault(app: App): App['vault'] & TestVaultMethods {
    return app.vault as App['vault'] & TestVaultMethods;
}

function registerTemplater(app: App, createNoteFromTemplate: TestTemplaterCreateFn): void {
    const appWithPlugins = app as App & { plugins: { plugins: Record<string, Plugin> } };
    appWithPlugins.plugins = {
        plugins: {
            [TEMPLATER_PLUGIN_ID]: new TestTemplaterPlugin(app, createNoteFromTemplate)
        }
    };
}

function registerTemplateLifecycle(app: App, prepareInstanceSource: (source: string) => string | null): void {
    const appWithPlugins = app as App & { plugins: { plugins: Record<string, unknown> } };
    appWithPlugins.plugins = {
        plugins: {
            ...(appWithPlugins.plugins?.plugins ?? {}),
            'tps-global-context-menu': {
                api: {
                    templates: {
                        version: 1,
                        getMode: () => 'tag',
                        matches: () => false,
                        prepareInstanceSource
                    }
                }
            }
        }
    };
}

function createRootFolder(app: App, vaultName: string): TFolder {
    Object.defineProperty(app.vault, 'getName', {
        configurable: true,
        value: () => vaultName
    });

    const root = app.vault.getRoot() as TFolder & { children: TFile[]; name: string; vault: App['vault'] };
    root.name = '/';
    root.path = '/';
    root.children = [];
    root.vault = app.vault;

    return root;
}

function registerRootFile(app: App, root: TFolder, path: string): TFile {
    const file = createTestTFile(path);
    file.parent = root;
    file.vault = app.vault;
    root.children.push(file);
    getTestVault(app).registerFile(file);

    return file;
}

describe('root folder notes', () => {
    it('uses the stable Vault name instead of the vault display name', () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');

        expect(
            resolveFolderNoteNameForFolder(root, {
                folderNoteNamePattern: ''
            })
        ).toBe('Vault');
    });

    it('uses Vault for the folder token at the vault root', () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');

        expect(
            resolveFolderNoteNameForFolder(root, {
                folderNoteNamePattern: '_{{folder}}'
            })
        ).toBe('_Vault');
    });

    it('detects a root folder note at the vault root', () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const folderNote = registerRootFile(app, root, 'Vault.md');

        expect(
            getFolderNote(root, {
                enableFolderNotes: true,
                folderNoteNamePattern: ''
            })
        ).toBe(folderNote);
    });

    it('keeps detecting a legacy vault-name root folder note', () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const legacyFolderNote = registerRootFile(app, root, 'Shared Scratch.md');

        expect(
            getFolderNote(root, {
                enableFolderNotes: true,
                folderNoteNamePattern: '{{folder}}'
            })
        ).toBe(legacyFolderNote);
        expect(
            isFolderNote(legacyFolderNote, root, {
                enableFolderNotes: true,
                folderNoteNamePattern: '{{folder}}'
            })
        ).toBe(true);
    });

    it('prefers Vault when both current and legacy root folder notes exist', () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const preferredFolderNote = registerRootFile(app, root, 'Vault.md');
        const legacyFolderNote = registerRootFile(app, root, 'Shared Scratch.md');
        const settings = {
            enableFolderNotes: true,
            folderNoteNamePattern: '{{folder}}'
        };

        expect(getFolderNote(root, settings)).toBe(preferredFolderNote);
        expect(isFolderNote(preferredFolderNote, root, settings)).toBe(true);
        expect(isFolderNote(legacyFolderNote, root, settings)).toBe(false);
    });

    it('matches root folder note files using the stable Vault name', () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const folderNote = registerRootFile(app, root, 'Vault.md');

        expect(
            isFolderNote(folderNote, root, {
                enableFolderNotes: true,
                folderNoteNamePattern: ''
            })
        ).toBe(true);
    });

    it('keeps fixed folder note names for the vault root', () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const folderNote = registerRootFile(app, root, 'index.md');

        expect(
            getFolderNote(root, {
                enableFolderNotes: true,
                folderNoteNamePattern: 'index'
            })
        ).toBe(folderNote);
    });

    it('creates root folder notes at the vault root', async () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const openFile = vi.fn().mockResolvedValue(undefined);
        const createdFile = createTestTFile('Vault.md');
        createdFile.parent = root;
        createdFile.vault = app.vault;

        const createNewMarkdownFile = vi.fn(async () => {
            root.children.push(createdFile);
            getTestVault(app).registerFile(createdFile);
            return createdFile;
        });
        app.fileManager.createNewMarkdownFile = createNewMarkdownFile;
        app.workspace = {
            getLeaf: vi.fn(() => ({ openFile }))
        } as unknown as App['workspace'];

        const created = await createFolderNote(
            app,
            root,
            {
                folderNoteType: 'markdown',
                folderNoteNamePattern: '',
                folderNoteTemplate: DEFAULT_SETTINGS.folderNoteTemplate
            },
            null
        );

        expect(createNewMarkdownFile).toHaveBeenCalledWith(root, 'Vault');
        expect(created).toBe(createdFile);
        expect(openFile).toHaveBeenCalledWith(createdFile, { active: true });
    });

    it('opens created folder notes in the right sidebar when requested', async () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const openFile = vi.fn().mockResolvedValue(undefined);
        const openInRightSidebar = vi.fn().mockResolvedValue(undefined);
        const createdFile = createTestTFile('Vault.md');
        createdFile.parent = root;
        createdFile.vault = app.vault;

        const createNewMarkdownFile = vi.fn(async () => {
            root.children.push(createdFile);
            getTestVault(app).registerFile(createdFile);
            return createdFile;
        });
        app.fileManager.createNewMarkdownFile = createNewMarkdownFile;
        app.workspace = {
            getLeaf: vi.fn(() => ({ openFile }))
        } as unknown as App['workspace'];

        const created = await createFolderNote(
            app,
            root,
            {
                folderNoteType: 'markdown',
                folderNoteNamePattern: '',
                folderNoteTemplate: DEFAULT_SETTINGS.folderNoteTemplate
            },
            null,
            {
                openContext: 'right-sidebar',
                openInRightSidebar
            }
        );

        expect(created).toBe(createdFile);
        expect(openInRightSidebar).toHaveBeenCalledWith(createdFile);
        expect(openFile).not.toHaveBeenCalled();
    });

    it('uses Templater directly when a configured folder note template is available', async () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const templateFile = createTestTFile('Templates/Folder.md');
        const createdFile = createTestTFile('Vault.md');
        const openFile = vi.fn().mockResolvedValue(undefined);
        const createNewMarkdownFile = vi.fn();
        const createNoteFromTemplate = vi.fn(async () => createdFile);

        getTestVault(app).registerFile(templateFile);
        registerTemplater(app, createNoteFromTemplate);
        app.fileManager.createNewMarkdownFile = createNewMarkdownFile;
        app.workspace = {
            getLeaf: vi.fn(() => ({ openFile }))
        } as unknown as App['workspace'];

        const created = await createFolderNote(
            app,
            root,
            {
                folderNoteType: 'markdown',
                folderNoteNamePattern: '',
                folderNoteTemplate: templateFile.path
            },
            null
        );

        expect(created).toBe(createdFile);
        expect(createNoteFromTemplate).toHaveBeenCalledWith(templateFile, root, 'Vault', false);
        expect(createNewMarkdownFile).not.toHaveBeenCalled();
        expect(openFile).toHaveBeenCalledWith(createdFile, { active: true });
    });

    it('copies folder note template content when Templater is unavailable', async () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const templateFile = createTestTFile('Templates/Folder.md');
        const createdFile = createTestTFile('Vault.md');
        const templateContent = '---\ntags: [template, keep]\ncreated: <% tp.file.creation_date("YYYY-MM-DD") %>\n---\n#template\n';
        const preparedContent = templateContent.replace('template, ', '');
        const openFile = vi.fn().mockResolvedValue(undefined);
        const createNewMarkdownFile = vi.fn(async () => createdFile);
        const read = vi.fn(async () => templateContent);
        const modify = vi.fn(async () => undefined);

        getTestVault(app).registerFile(templateFile);
        registerTemplateLifecycle(app, source => source.replace('template, ', ''));
        app.fileManager.createNewMarkdownFile = createNewMarkdownFile;
        app.vault.read = read;
        app.vault.modify = modify;
        app.workspace = {
            getLeaf: vi.fn(() => ({ openFile }))
        } as unknown as App['workspace'];

        const created = await createFolderNote(
            app,
            root,
            {
                folderNoteType: 'markdown',
                folderNoteNamePattern: '',
                folderNoteTemplate: templateFile.path
            },
            null
        );

        expect(created).toBe(createdFile);
        expect(createNewMarkdownFile).toHaveBeenCalledWith(root, 'Vault');
        expect(read).toHaveBeenCalledWith(templateFile);
        expect(modify).toHaveBeenCalledWith(createdFile, preparedContent);
        expect(openFile).toHaveBeenCalledWith(createdFile, { active: true });
    });

    it('fails closed before creating a folder note when template preparation is rejected', async () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const templateFile = createTestTFile('Templates/Folder.md');
        const createNewMarkdownFile = vi.fn();

        getTestVault(app).registerFile(templateFile);
        registerTemplateLifecycle(app, () => null);
        app.fileManager.createNewMarkdownFile = createNewMarkdownFile;
        app.vault.read = vi.fn(async () => '---\ntags: [template]\n---\n');

        await expect(
            createFolderNote(
                app,
                root,
                {
                    folderNoteType: 'markdown',
                    folderNoteName: '',
                    folderNoteNamePattern: '',
                    folderNoteTemplate: templateFile.path
                },
                null
            )
        ).resolves.toBeNull();
        expect(createNewMarkdownFile).not.toHaveBeenCalled();
    });

    it('copies canvas folder note template content', async () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const templateFile = createTestTFile('Templates/Folder.canvas');
        const templateContent = '{"nodes":[{"id":"folder-note"}],"edges":[]}';
        const createdFile = createTestTFile('Vault.canvas');
        createdFile.parent = root;
        createdFile.vault = app.vault;
        const openFile = vi.fn().mockResolvedValue(undefined);
        const create = vi.fn(async () => {
            root.children.push(createdFile);
            getTestVault(app).registerFile(createdFile);
            return createdFile;
        });
        const read = vi.fn(async () => templateContent);

        getTestVault(app).registerFile(templateFile);
        getTestVault(app).create = create;
        getTestVault(app).read = read;
        app.workspace = {
            getLeaf: vi.fn(() => ({ openFile }))
        } as unknown as App['workspace'];

        const created = await createFolderNote(
            app,
            root,
            {
                folderNoteType: 'canvas',
                folderNoteNamePattern: '',
                folderNoteTemplate: templateFile.path
            },
            null
        );

        expect(created).toBe(createdFile);
        expect(read).toHaveBeenCalledWith(templateFile);
        expect(create).toHaveBeenCalledWith('Vault.canvas', templateContent);
        expect(openFile).toHaveBeenCalledWith(createdFile, { active: true });
    });

    it('copies base folder note template content', async () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const templateFile = createTestTFile('Templates/Folder.base');
        const templateContent = '{"model":{"version":1,"kind":"Table","columns":[{"name":"Status"}]},"pluginVersion":"1.0.0"}';
        const createdFile = createTestTFile('Vault.base');
        createdFile.parent = root;
        createdFile.vault = app.vault;
        const openFile = vi.fn().mockResolvedValue(undefined);
        const create = vi.fn(async () => {
            root.children.push(createdFile);
            getTestVault(app).registerFile(createdFile);
            return createdFile;
        });
        const read = vi.fn(async () => templateContent);

        getTestVault(app).registerFile(templateFile);
        getTestVault(app).create = create;
        getTestVault(app).read = read;
        app.workspace = {
            getLeaf: vi.fn(() => ({ openFile }))
        } as unknown as App['workspace'];

        const created = await createFolderNote(
            app,
            root,
            {
                folderNoteType: 'base',
                folderNoteNamePattern: '',
                folderNoteTemplate: templateFile.path
            },
            null
        );

        expect(created).toBe(createdFile);
        expect(read).toHaveBeenCalledWith(templateFile);
        expect(create).toHaveBeenCalledWith('Vault.base', templateContent);
        expect(openFile).toHaveBeenCalledWith(createdFile, { active: true });
    });

    it('uses default canvas content when the template extension does not match', async () => {
        const app = new App();
        const root = createRootFolder(app, 'Shared Scratch');
        const templateFile = createTestTFile('Templates/Folder.md');
        const createdFile = createTestTFile('Vault.canvas');
        createdFile.parent = root;
        createdFile.vault = app.vault;
        const openFile = vi.fn().mockResolvedValue(undefined);
        const create = vi.fn(async () => createdFile);
        const read = vi.fn(async () => '# Template');

        getTestVault(app).registerFile(templateFile);
        getTestVault(app).create = create;
        getTestVault(app).read = read;
        app.workspace = {
            getLeaf: vi.fn(() => ({ openFile }))
        } as unknown as App['workspace'];

        const created = await createFolderNote(
            app,
            root,
            {
                folderNoteType: 'canvas',
                folderNoteNamePattern: '',
                folderNoteTemplate: templateFile.path
            },
            null
        );

        expect(created).toBe(createdFile);
        expect(read).not.toHaveBeenCalled();
        expect(create).toHaveBeenCalledWith('Vault.canvas', '{}');
    });
});

describe('folder note template compatibility', () => {
    it('accepts matching supported template extensions', () => {
        expect(isFolderNoteTemplateCompatible('Templates/Folder.md', 'markdown')).toBe(true);
        expect(isFolderNoteTemplateCompatible('Templates/Folder.canvas', 'canvas')).toBe(true);
        expect(isFolderNoteTemplateCompatible('Templates/Folder.base', 'base')).toBe(true);
    });

    it('rejects mismatched fixed folder note template extensions', () => {
        expect(isFolderNoteTemplateCompatible('Templates/Folder.md', 'canvas')).toBe(false);
        expect(isFolderNoteTemplateCompatible('Templates/Folder.canvas', 'base')).toBe(false);
        expect(isFolderNoteTemplateCompatible('Templates/Folder.base', 'markdown')).toBe(false);
    });

    it('accepts any supported template extension when folder note type is selected during creation', () => {
        expect(isFolderNoteTemplateCompatible('Templates/Folder.md', 'ask')).toBe(true);
        expect(isFolderNoteTemplateCompatible('Templates/Folder.canvas', 'ask')).toBe(true);
        expect(isFolderNoteTemplateCompatible('Templates/Folder.base', 'ask')).toBe(true);
    });

    it('rejects unsupported template extensions', () => {
        expect(isFolderNoteTemplateCompatible('Templates/Folder.txt', 'ask')).toBe(false);
        expect(isFolderNoteTemplateCompatible('Templates/Folder.txt', 'markdown')).toBe(false);
    });
});

describe('title-based folder note identity', () => {
    const settings = { enableFolderNotes: true, folderNoteNamePattern: '{{folder}}' };
    function setup() {
        const app = new App();
        const root = createRootFolder(app, 'TishOS v0.2');
        const titles = new Map<string, unknown>();
        const metadata = { getFileCache: (file: TFile) => ({ frontmatter: { title: titles.get(file.path) } }) };
        return { app, root, titles, metadata };
    }

    it('uses the authored title despite an unrelated filename and case differences', () => {
        const { app, root, titles, metadata } = setup();
        const note = registerRootFile(app, root, '123-note.md');
        titles.set(note.path, ' TishOS V0.2 ');
        expect(getFolderNote(root, settings, metadata)).toBe(note);
        expect(isFolderNote(note, root, settings, metadata)).toBe(true);
    });

    it('updates identity when only metadata changes, including title removal', () => {
        const { app, root, titles, metadata } = setup();
        const note = registerRootFile(app, root, '123-note.md');
        titles.set(note.path, 'Unrelated');
        expect(getFolderNote(root, settings, metadata)).toBeNull();
        titles.set(note.path, 'TishOS v0.2');
        expect(getFolderNote(root, settings, metadata)).toBe(note);
        titles.delete(note.path);
        expect(getFolderNote(root, settings, metadata)).toBeNull();
    });

    it('prefers titles over filename matches and rejects a stale matching filename with a different title', () => {
        const { app, root, titles, metadata } = setup();
        const named = registerRootFile(app, root, 'TishOS v0.2.md');
        const titled = registerRootFile(app, root, 'id.md');
        titles.set(titled.path, 'TishOS v0.2');
        expect(getFolderNote(root, settings, metadata)).toBe(titled);
        titles.set(titled.path, 'Other');
        titles.set(named.path, 'Also other');
        expect(getFolderNote(root, settings, metadata)).toBeNull();
    });

    it('does not choose among duplicate titles or descend into subfolders', () => {
        const { app, root, titles, metadata } = setup();
        const one = registerRootFile(app, root, 'one.md');
        const two = registerRootFile(app, root, 'two.md');
        titles.set(one.path, 'Vault');
        titles.set(two.path, 'vault');
        expect(getFolderNote(root, settings, metadata)).toBeNull();
        two.parent = new TFolder('Nested');
        expect(getFolderNote(root, settings, metadata)).toBe(one);
    });

    it('retains filename fallback for missing, empty, invalid, and unresolved titles', () => {
        const { app, root, titles, metadata } = setup();
        const note = registerRootFile(app, root, 'Vault.md');
        for (const value of [undefined, '', ['Vault'], '{{title}}']) {
            titles.set(note.path, value);
            expect(getFolderNote(root, settings, metadata)).toBe(note);
        }
        expect(getFolderNote(root, { ...settings, enableFolderNotes: false }, metadata)).toBeNull();
    });

    it('matches nested folder patterns and case-insensitive Title keys', () => {
        const { app } = setup();
        const folder = new TFolder('Projects');
        folder.name = 'Projects';
        folder.vault = app.vault;
        folder.children = [];
        const file = registerRootFile(app, folder, 'Projects/id.md');
        const metadata = { getFileCache: () => ({ frontmatter: { Title: '_Projects' } }) };
        expect(getFolderNote(folder, { ...settings, folderNoteNamePattern: '_{{folder}}' }, metadata)).toBe(file);
    });

    it('avoids NFC work during repeated ASCII sibling scans and still follows title changes', () => {
        const app = new App();
        const root = createRootFolder(app, 'Test Vault');
        const frontmatterByPath = new Map<string, Record<string, unknown>>();
        const plainFrontmatter = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`field_${index}`, index]));
        const files = Array.from({ length: 120 }, (_, index) => {
            const file = registerRootFile(app, root, `Transaction ${index}.md`);
            frontmatterByPath.set(file.path, plainFrontmatter);
            return file;
        });
        const titledFile = files[files.length - 1];
        const metadata = { getFileCache: (file: TFile) => ({ frontmatter: frontmatterByPath.get(file.path) }) };
        const normalize = vi.spyOn(String.prototype, 'normalize');
        let unchangedResults: (TFile | null)[] = [];
        let matchedResult: TFile | null = null;
        let removedResult: TFile | null = null;
        let normalizeCalls = -1;

        try {
            unchangedResults = Array.from({ length: 4 }, () => getFolderNote(root, settings, metadata));
            frontmatterByPath.set(titledFile.path, { ...plainFrontmatter, Title: 'Vault' });
            matchedResult = getFolderNote(root, settings, metadata);
            frontmatterByPath.set(titledFile.path, plainFrontmatter);
            removedResult = getFolderNote(root, settings, metadata);
            normalizeCalls = normalize.mock.calls.length;
        } finally {
            normalize.mockRestore();
        }

        expect(unchangedResults).toEqual(Array(4).fill(null));
        expect(matchedResult).toBe(titledFile);
        expect(removedResult).toBeNull();
        expect(normalizeCalls).toBe(0);
    });
});
