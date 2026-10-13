import { App, TFolder } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISettingsProvider } from '../../src/interfaces/ISettingsProvider';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { FileSystemOperations } from '../../src/services/FileSystemService';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';
import { presentCreatedNote } from '../../src/utils/tpsNoteOpening';
import { createTestTFile } from '../utils/createTestTFile';

vi.mock('../../src/modals/ConfirmModal', () => ({ ConfirmModal: class {} }));
vi.mock('../../src/modals/FolderSuggestModal', () => ({ FolderSuggestModal: class {} }));
vi.mock('../../src/modals/InputModal', () => ({ InputModal: class {} }));
vi.mock('../../src/utils/tpsNoteOpening', () => ({ presentCreatedNote: vi.fn().mockResolvedValue(true) }));

beforeEach(() => vi.clearAllMocks());

function fixture() {
    const app = new App();
    const parent = new TFolder('Inbox');
    const file = createTestTFile('Inbox/Untitled.md');
    const created = vi.fn();
    const create = vi.fn(async (_parent: TFolder, _name: string, content = '') => {
        // Model the synchronous create observer: it sees only initial bytes,
        // before createNewMarkdownFile resolves and before any later writer.
        created(content);
        return file;
    });
    const mutate = vi.fn().mockRejectedValue(new Error('A second frontmatter write must not be needed'));
    const getNewFileParent = vi.fn(() => parent);
    app.fileManager.getNewFileParent = getNewFileParent;
    app.fileManager.createNewMarkdownFile = create;
    app.fileManager.processFrontMatter = mutate;
    app.workspace = { getActiveFile: vi.fn(() => null) } as unknown as App['workspace'];
    const settings: ISettingsProvider = {
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
    const operations = new FileSystemOperations(
        app,
        () => null,
        () => null,
        () => null,
        () => null,
        () => ({ includeDescendantNotes: false, showHiddenItems: false }),
        settings
    );
    return { app, parent, file, created, create, mutate, getNewFileParent, operations };
}

describe('facet note creation publishes complete initial content', () => {
    it('publishes the nested tag at create time with no later frontmatter write', async () => {
        const f = fixture();
        await expect(f.operations.createNewFileForTag('kind/food/transaction', 'Current.md', true)).resolves.toBe(f.file);
        expect(f.created).toHaveBeenCalledExactlyOnceWith('---\ntags:\n  - "kind/food/transaction"\n---\n');
        expect(f.create).toHaveBeenCalledWith(f.parent, 'Untitled', expect.any(String));
        expect(f.getNewFileParent).toHaveBeenCalledWith('Current.md');
        expect(f.mutate).not.toHaveBeenCalled();
        expect(presentCreatedNote).toHaveBeenCalledExactlyOnceWith(f.app, f.file, true);
    });

    it('publishes the kind property value at create time with no later frontmatter write', async () => {
        const f = fixture();
        await expect(f.operations.createNewFileForProperty(buildPropertyValueNodeId('kind', 'task'))).resolves.toBe(f.file);
        expect(f.created).toHaveBeenCalledExactlyOnceWith('---\n"kind": "task"\n---\n');
        expect(f.mutate).not.toHaveBeenCalled();
        expect(presentCreatedNote).toHaveBeenCalledExactlyOnceWith(f.app, f.file, false);
    });

    it.each([
        ['kind', 'task/todo'],
        ['categories', 'Work/Projects']
    ])('publishes configured list property %s as an array in the initial note', async (key, value) => {
        const f = fixture();
        const resolveDefinition = vi.fn((requestedKey: string) =>
            requestedKey.toLowerCase() === key.toLowerCase() ? { id: key, key, label: key, type: 'list', allowInlineSet: true } : null
        );
        (f.app as App & { plugins: unknown }).plugins = {
            enabledPlugins: new Set(['tps-global-context-menu']),
            getPlugin: () => ({ api: { itemProperties: { version: 1, listDefinitions: vi.fn(() => []), resolveDefinition } } })
        };

        await expect(f.operations.createNewFileForProperty(buildPropertyValueNodeId(key, value))).resolves.toBe(f.file);
        expect(resolveDefinition).toHaveBeenCalledWith(key);
        expect(f.created).toHaveBeenCalledExactlyOnceWith(`---\n${JSON.stringify(key)}: [${JSON.stringify(value)}]\n---\n`);
        expect(f.mutate).not.toHaveBeenCalled();
        expect(presentCreatedNote).toHaveBeenCalledExactlyOnceWith(f.app, f.file, false);
    });

    it('keeps a configured list key without a selected value as an empty placeholder', async () => {
        const f = fixture();
        (f.app as App & { plugins: unknown }).plugins = {
            enabledPlugins: new Set(['tps-global-context-menu']),
            getPlugin: () => ({
                api: {
                    itemProperties: {
                        version: 1,
                        listDefinitions: vi.fn(() => []),
                        resolveDefinition: vi.fn(() => ({ id: 'categories', key: 'Categories', label: 'Categories', type: 'list' }))
                    }
                }
            })
        };

        await expect(f.operations.createNewFileForProperty(buildPropertyKeyNodeId('Categories'))).resolves.toBe(f.file);
        expect(f.created).toHaveBeenCalledExactlyOnceWith('---\n"categories": null\n---\n');
        expect(f.mutate).not.toHaveBeenCalled();
    });

    it.each(['tag', 'property'] as const)('does not publish or open an incomplete note when %s creation fails', async route => {
        const f = fixture();
        f.create.mockRejectedValueOnce(new Error('Creation rejected'));
        const result = await (route === 'tag'
            ? f.operations.createNewFileForTag('kind/food/transaction')
            : f.operations.createNewFileForProperty(buildPropertyValueNodeId('kind', 'task')));
        expect(result).toBeNull();
        expect(f.created).not.toHaveBeenCalled();
        expect(f.mutate).not.toHaveBeenCalled();
        expect(presentCreatedNote).not.toHaveBeenCalled();
    });
});
