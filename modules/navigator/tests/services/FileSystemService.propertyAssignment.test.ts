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
import { App, type TFile } from 'obsidian';
import { FileSystemOperations } from '../../src/services/FileSystemService';
import type { ISettingsProvider } from '../../src/interfaces/ISettingsProvider';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import type { FileData, PropertyItem } from '../../src/storage/IndexedDBStorage';
import { PropertyTreeService } from '../../src/services/PropertyTreeService';
import {
    buildPropertyKeyNodeId,
    buildPropertyTreeFromDatabase,
    buildPropertyValueNodeId,
    normalizePropertyTreeValuePath
} from '../../src/utils/propertyTree';
import type { PropertyTreeDatabaseLike } from '../../src/utils/propertyTree';
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

interface MockFile {
    path: string;
    properties: PropertyItem[] | null;
}

function createFileData(properties: PropertyItem[] | null): FileData {
    return {
        mtime: 0,
        markdownPipelineMtime: 0,
        tagsMtime: 0,
        metadataMtime: 0,
        fileThumbnailsMtime: 0,
        tags: null,
        wordCount: null,
        taskTotal: 0,
        taskUnfinished: 0,
        properties,
        previewStatus: 'unprocessed',
        featureImage: null,
        featureImageStatus: 'unprocessed',
        featureImageKey: null,
        metadata: null
    };
}

function createMockDb(files: MockFile[]): PropertyTreeDatabaseLike {
    const payload = files.map(file => ({
        path: file.path,
        data: createFileData(file.properties)
    }));

    return {
        forEachFile(callback) {
            payload.forEach(file => callback(file.path, file.data));
        }
    };
}

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

function createFile(path: string, frontmatter: Record<string, unknown>): TFile & { frontmatter: Record<string, unknown> } {
    return Object.assign(createTestTFile(path), { frontmatter });
}

function createOperations(
    app: App,
    propertyTreeService: PropertyTreeService,
    settings: NotebookNavigatorSettings = { ...DEFAULT_SETTINGS }
): FileSystemOperations {
    return new FileSystemOperations(
        app,
        () => null,
        () => propertyTreeService,
        () => null,
        () => null,
        () => ({ includeDescendantNotes: false, showHiddenItems: false }),
        createSettingsProvider(settings)
    );
}

describe('FileSystemOperations property assignment', () => {
    it('writes an empty value when applying a property key node', async () => {
        const app = new App();
        const target = createFile('Target.md', {});
        const propertyTreeService = new PropertyTreeService();
        propertyTreeService.updatePropertyTree(
            buildPropertyTreeFromDatabase(
                createMockDb([
                    {
                        path: 'Source.md',
                        properties: [{ fieldKey: 'Categories', value: 'Reference', valueKind: 'string' }]
                    }
                ])
            )
        );

        app.fileManager.processFrontMatter = vi.fn((file: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
            callback((file as TFile & { frontmatter: Record<string, unknown> }).frontmatter);
            return Promise.resolve();
        });

        const operations = createOperations(app, propertyTreeService);

        await expect(operations.applyPropertyNodeToFiles(buildPropertyKeyNodeId('categories'), [target])).resolves.toEqual({
            updated: 1,
            skipped: 0
        });
        expect(target.frontmatter).toEqual({ Categories: null });
    });

    it('replaces a true property value with an empty value when applying its key root', async () => {
        const app = new App();
        const target = createFile('Target.md', { Categories: true });
        const propertyTreeService = new PropertyTreeService();
        propertyTreeService.updatePropertyTree(
            buildPropertyTreeFromDatabase(
                createMockDb([
                    {
                        path: 'Source.md',
                        properties: [{ fieldKey: 'Categories', value: 'Reference', valueKind: 'string' }]
                    }
                ])
            )
        );

        app.fileManager.processFrontMatter = vi.fn((file: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
            callback((file as TFile & { frontmatter: Record<string, unknown> }).frontmatter);
            return Promise.resolve();
        });

        const operations = createOperations(app, propertyTreeService);

        await expect(operations.applyPropertyNodeToFiles(buildPropertyKeyNodeId('categories'), [target])).resolves.toEqual({
            updated: 1,
            skipped: 0
        });
        expect(target.frontmatter).toEqual({ Categories: null });
    });

    it('writes a Markdown property key without invoking GCM companion writers even with a saved legacy mode', async () => {
        const app = new App();
        const missingTarget = createFile('Missing.md', {});
        const valuedTarget = createFile('Valued.md', { Status: 'done' });
        const propertyTreeService = new PropertyTreeService();
        propertyTreeService.updatePropertyTree(
            buildPropertyTreeFromDatabase(
                createMockDb([
                    {
                        path: 'Source.md',
                        properties: [{ fieldKey: 'Status', value: 'todo', valueKind: 'string' }]
                    }
                ])
            )
        );

        const processFrontMatter = vi.fn((file: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
            callback((file as TFile & { frontmatter: Record<string, unknown> }).frontmatter);
            return Promise.resolve();
        });
        const setValues = vi.fn().mockResolvedValue([missingTarget, valuedTarget]);
        const addListValues = vi.fn().mockResolvedValue([missingTarget, valuedTarget]);
        app.fileManager.processFrontMatter = processFrontMatter;
        (app as App & { plugins: unknown }).plugins = {
            enabledPlugins: new Set(['tps-global-context-menu']),
            getPlugin: () => ({
                api: {
                    itemProperties: {
                        version: 1,
                        listDefinitions: vi.fn(() => []),
                        resolveDefinition: vi.fn(() => ({
                            id: 'status',
                            key: 'Status',
                            label: 'Status',
                            type: 'selector',
                            allowInlineSet: true
                        }))
                    },
                    frontmatter: { setValues, addListValues },
                    fileProperties: {
                        version: 1,
                        isTarget: vi.fn(() => false),
                        setValues,
                        addListValues
                    }
                }
            })
        };
        const operations = createOperations(app, propertyTreeService, {
            ...DEFAULT_SETTINGS,
            tpsDataArchitectureMode: 'legacy'
        });

        await expect(operations.applyPropertyNodeToFiles(buildPropertyKeyNodeId('status'), [missingTarget, valuedTarget])).resolves.toEqual(
            { updated: 2, skipped: 0 }
        );
        expect(missingTarget.frontmatter).toEqual({ Status: null });
        expect(valuedTarget.frontmatter).toEqual({ Status: null });
        expect(processFrontMatter).toHaveBeenCalledTimes(2);
        expect(setValues).not.toHaveBeenCalled();
        expect(addListValues).not.toHaveBeenCalled();
    });

    it('creates a note with an empty value when invoked from a property key node', async () => {
        const app = new App();
        const createdFile = createFile('Untitled.md', {});
        const openFile = vi.fn().mockResolvedValue(undefined);
        const propertyTreeService = new PropertyTreeService();
        propertyTreeService.updatePropertyTree(
            buildPropertyTreeFromDatabase(
                createMockDb([
                    {
                        path: 'Source.md',
                        properties: [{ fieldKey: 'Categories', value: 'Reference', valueKind: 'string' }]
                    }
                ])
            )
        );

        app.fileManager.getNewFileParent = vi.fn(() => app.vault.getRoot());
        app.fileManager.createNewMarkdownFile = vi.fn(async (_parent, _name, content) => {
            expect(content).toBe('---\n"Categories": null\n---\n');
            createdFile.frontmatter.Categories = null;
            return createdFile;
        });
        const processFrontMatter = vi.fn((file: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
            callback((file as TFile & { frontmatter: Record<string, unknown> }).frontmatter);
            return Promise.resolve();
        });
        app.fileManager.processFrontMatter = processFrontMatter;
        app.workspace = {
            getActiveFile: vi.fn(() => null),
            getLeaf: vi.fn(() => ({ openFile }))
        } as unknown as App['workspace'];

        const operations = createOperations(app, propertyTreeService);

        await expect(operations.createNewFileForProperty(buildPropertyKeyNodeId('categories'))).resolves.toBe(createdFile);
        expect(createdFile.frontmatter).toEqual({ Categories: null });
        expect(processFrontMatter).not.toHaveBeenCalled();
        expect(openFile).toHaveBeenCalledWith(createdFile, { state: { mode: 'source' }, active: true });
    });

    it('writes the original wiki-link value when applying a property value node', async () => {
        const rawValue = '[[Mini-Tasks]]';
        const app = new App();
        const target = createFile('Target.md', {});
        const plainTarget = createFile('Plain.md', { Project: 'Mini-Tasks' });
        const propertyTreeService = new PropertyTreeService();
        propertyTreeService.updatePropertyTree(
            buildPropertyTreeFromDatabase(
                createMockDb([
                    {
                        path: 'Source.md',
                        properties: [{ fieldKey: 'Project', value: rawValue, valueKind: 'string' }]
                    }
                ])
            )
        );

        app.fileManager.processFrontMatter = vi.fn((file: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
            callback((file as TFile & { frontmatter: Record<string, unknown> }).frontmatter);
            return Promise.resolve();
        });

        const operations = createOperations(app, propertyTreeService);
        const nodeId = buildPropertyValueNodeId('project', normalizePropertyTreeValuePath(rawValue));

        await expect(operations.applyPropertyNodeToFiles(nodeId, [target, plainTarget])).resolves.toEqual({ updated: 2, skipped: 0 });
        expect(target.frontmatter).toEqual({ Project: rawValue });
        expect(plainTarget.frontmatter).toEqual({ Project: rawValue });
    });

    it('adds configured list values with native frontmatter without calling GCM writers', async () => {
        const app = new App();
        const target = createFile('Target.md', { Parents: ['[[Alpha]]'], Priority: 'low' });
        const emptyTarget = createFile('Empty.md', {});
        const scalarTarget = createFile('Scalar.md', { Parents: '[[Alpha]]' });
        const propertyTreeService = new PropertyTreeService();
        propertyTreeService.updatePropertyTree(
            buildPropertyTreeFromDatabase(
                createMockDb([
                    {
                        path: 'Source.md',
                        properties: [
                            { fieldKey: 'Parents', value: '[[Beta]]', valueKind: 'string' },
                            { fieldKey: 'Priority', value: 'high', valueKind: 'string' }
                        ]
                    }
                ])
            )
        );
        const addListValues = vi.fn().mockResolvedValue([target]);
        const setValues = vi.fn().mockResolvedValue([target]);
        const processFrontMatter = vi.fn((file: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
            callback((file as TFile & { frontmatter: Record<string, unknown> }).frontmatter);
            return Promise.resolve();
        });
        app.fileManager.processFrontMatter = processFrontMatter;
        const itemProperties = {
            version: 1,
            listDefinitions: vi.fn(() => []),
            resolveDefinition: vi.fn((key: string) =>
                key.toLowerCase() === 'parents'
                    ? { id: 'parents', key: 'Parents', label: 'Parents', type: 'list', listItemType: 'link', allowInlineSet: true }
                    : { id: 'priority', key: 'Priority', label: 'Priority', type: 'selector', allowInlineSet: true }
            )
        };
        (app as App & { plugins: unknown }).plugins = {
            enabledPlugins: new Set(['tps-global-context-menu']),
            getPlugin: () => ({
                api: {
                    itemProperties,
                    frontmatter: { setValues, addListValues },
                    fileProperties: { version: 1, isTarget: vi.fn(() => false), setValues, addListValues }
                }
            })
        };
        const operations = createOperations(app, propertyTreeService);

        const parentsNode = buildPropertyValueNodeId('parents', normalizePropertyTreeValuePath('[[Beta]]'));
        await expect(operations.applyPropertyNodeToFiles(parentsNode, [target, emptyTarget, scalarTarget])).resolves.toEqual({
            updated: 3,
            skipped: 0
        });
        expect(target.frontmatter.Parents).toEqual(['[[Alpha]]', '[[Beta]]']);
        expect(emptyTarget.frontmatter.Parents).toEqual(['[[Beta]]']);
        expect(scalarTarget.frontmatter.Parents).toEqual(['[[Alpha]]', '[[Beta]]']);
        await expect(operations.applyPropertyNodeToFiles(parentsNode, [target])).resolves.toEqual({ updated: 0, skipped: 1 });
        expect(target.frontmatter.Parents).toEqual(['[[Alpha]]', '[[Beta]]']);

        await operations.applyPropertyNodeToFiles(buildPropertyValueNodeId('priority', normalizePropertyTreeValuePath('high')), [target]);
        expect(target.frontmatter.Priority).toBe('high');
        expect(processFrontMatter).toHaveBeenCalledTimes(5);
        expect(addListValues).not.toHaveBeenCalled();
        expect(setValues).not.toHaveBeenCalled();
    });

    it('skips a whole-note property drop when the current value already matches', async () => {
        const app = new App();
        const target = createFile('Target.md', { Parents: ['[[Alpha]]'] });
        const propertyTreeService = new PropertyTreeService();
        propertyTreeService.updatePropertyTree(
            buildPropertyTreeFromDatabase(
                createMockDb([{ path: 'Source.md', properties: [{ fieldKey: 'Parents', value: '[[Alpha]]', valueKind: 'string' }] }])
            )
        );
        const processFrontMatter = vi.fn((file: TFile, callback: (frontmatter: Record<string, unknown>) => void) => {
            callback((file as TFile & { frontmatter: Record<string, unknown> }).frontmatter);
            return Promise.resolve();
        });
        app.fileManager.processFrontMatter = processFrontMatter;
        (app as App & { plugins: unknown }).plugins = {
            enabledPlugins: new Set(['tps-global-context-menu']),
            getPlugin: () => ({
                api: {
                    itemProperties: {
                        version: 1,
                        listDefinitions: vi.fn(() => []),
                        resolveDefinition: vi.fn(() => ({
                            id: 'parents',
                            key: 'Parents',
                            label: 'Parents',
                            type: 'list',
                            listItemType: 'link',
                            allowInlineSet: true
                        }))
                    },
                    frontmatter: { setValues: vi.fn(), addListValues: vi.fn().mockResolvedValue([]) },
                    fileProperties: {
                        version: 1,
                        isTarget: vi.fn(() => false),
                        setValues: vi.fn(),
                        addListValues: vi.fn()
                    }
                }
            })
        };
        const operations = createOperations(app, propertyTreeService);

        await expect(
            operations.applyPropertyNodeToFiles(buildPropertyValueNodeId('parents', normalizePropertyTreeValuePath('[[Alpha]]')), [target])
        ).resolves.toEqual({ updated: 0, skipped: 1 });
        expect(processFrontMatter).toHaveBeenCalledOnce();
    });

    it('does not write companion properties for non-Markdown file drops', async () => {
        const app = new App();
        const target = createFile('Board.canvas', {});
        const processFrontMatter = vi.fn().mockResolvedValue(undefined);
        app.fileManager.processFrontMatter = processFrontMatter;
        const propertyTreeService = new PropertyTreeService();
        propertyTreeService.updatePropertyTree(
            buildPropertyTreeFromDatabase(
                createMockDb([{ path: 'Source.md', properties: [{ fieldKey: 'Parents', value: '[[Beta]]', valueKind: 'string' }] }])
            )
        );
        const frontmatterAdd = vi.fn();
        const assetAdd = vi.fn().mockResolvedValue([target]);
        (app as App & { plugins: unknown }).plugins = {
            enabledPlugins: new Set(['tps-global-context-menu']),
            getPlugin: () => ({
                api: {
                    itemProperties: {
                        version: 1,
                        listDefinitions: vi.fn(() => []),
                        resolveDefinition: vi.fn(() => ({
                            id: 'parents',
                            key: 'Parents',
                            label: 'Parents',
                            type: 'list',
                            listItemType: 'link',
                            allowInlineSet: true
                        }))
                    },
                    frontmatter: { setValues: vi.fn(), addListValues: frontmatterAdd },
                    fileProperties: {
                        version: 1,
                        isTarget: vi.fn(() => true),
                        setValues: vi.fn(),
                        addListValues: assetAdd
                    }
                }
            })
        };
        const operations = createOperations(app, propertyTreeService);
        await expect(
            operations.applyPropertyNodeToFiles(buildPropertyValueNodeId('parents', normalizePropertyTreeValuePath('[[Beta]]')), [target])
        ).resolves.toEqual({ updated: 0, skipped: 0 });
        expect(frontmatterAdd).not.toHaveBeenCalled();
        expect(assetAdd).not.toHaveBeenCalled();
        expect(processFrontMatter).not.toHaveBeenCalled();
    });

    it('never creates or updates companion properties in native-record mode', async () => {
        const app = new App();
        const target = createFile('Board.canvas', {});
        const propertyTreeService = new PropertyTreeService();
        propertyTreeService.updatePropertyTree(
            buildPropertyTreeFromDatabase(
                createMockDb([{ path: 'Source.md', properties: [{ fieldKey: 'Parents', value: '[[Beta]]', valueKind: 'string' }] }])
            )
        );
        const assetAdd = vi.fn();
        (app as App & { plugins: unknown }).plugins = {
            enabledPlugins: new Set(['tps-global-context-menu']),
            getPlugin: () => ({
                api: {
                    itemProperties: {
                        version: 1,
                        listDefinitions: vi.fn(() => []),
                        resolveDefinition: vi.fn(() => ({ id: 'parents', key: 'Parents', label: 'Parents', type: 'list' }))
                    },
                    frontmatter: { setValues: vi.fn(), addListValues: vi.fn() },
                    fileProperties: { version: 1, isTarget: vi.fn(() => true), setValues: vi.fn(), addListValues: assetAdd }
                }
            })
        };
        const operations = createOperations(app, propertyTreeService, {
            ...DEFAULT_SETTINGS,
            tpsDataArchitectureMode: 'native-records'
        });

        await expect(
            operations.applyPropertyNodeToFiles(buildPropertyValueNodeId('parents', normalizePropertyTreeValuePath('[[Beta]]')), [target])
        ).resolves.toEqual({ updated: 0, skipped: 0 });
        expect(assetAdd).not.toHaveBeenCalled();
    });
});
