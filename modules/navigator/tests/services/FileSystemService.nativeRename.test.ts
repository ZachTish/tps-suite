import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { App, type TFile } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileSystemOperations } from '../../src/services/FileSystemService';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import type { ISettingsProvider } from '../../src/interfaces/ISettingsProvider';
import { createTestTFile } from '../utils/createTestTFile';

const boundaries = vi.hoisted(() => ({ modal: vi.fn(), notice: vi.fn() }));
vi.mock('../../src/utils/noticeUtils', () => ({ showNotice: boundaries.notice }));
vi.mock('../../src/modals/InputModal', () => ({
    InputModal: class {
        constructor(...args: unknown[]) {
            boundaries.modal(...args);
        }
        open(): void {}
    }
}));
vi.mock('../../src/modals/ConfirmModal', () => ({ ConfirmModal: class {} }));
vi.mock('../../src/modals/FolderSuggestModal', () => ({ FolderSuggestModal: class {} }));

function fixture(settings: Partial<NotebookNavigatorSettings> = {}, frontmatter: Record<string, unknown> = {}) {
    const app = new App();
    const file = createTestTFile('Inbox/Exact target.md');
    const otherFile = createTestTFile('Inbox/Unrelated active.md');
    const metadata = vi.fn(() => ({ frontmatter }));
    app.metadataCache.getFileCache = metadata;
    const prompt = vi.fn(async function (this: unknown, target: TFile) {
        expect(this).toBe(app.fileManager);
        expect(target).toBe(file);
    });
    const processFrontMatter = vi.fn();
    const renameFile = vi.fn();
    Object.assign(app.fileManager, { promptForFileRename: prompt, processFrontMatter, renameFile });
    const updateFrontmatter = vi.fn();
    const command = vi.fn();
    Object.assign(app, {
        workspace: { getActiveFile: () => otherFile },
        commands: { executeCommandById: command },
        plugins: { plugins: { 'tps-global-context-menu': { api: { updateFrontmatter } } } }
    });
    const read = vi.fn();
    const cachedRead = vi.fn();
    const inventory = vi.fn();
    Object.assign(app.vault, { read, cachedRead, getMarkdownFiles: inventory });
    const operations = new FileSystemOperations(
        app,
        () => null,
        () => null,
        () => null,
        () => null,
        () => ({ includeDescendantNotes: false, showHiddenItems: false }),
        {
            settings: { ...DEFAULT_SETTINGS, useFrontmatterMetadata: false, ...settings },
            saveSettingsAndUpdate: vi.fn(),
            notifySettingsUpdate: vi.fn(),
            getRecentNotes: () => [],
            setRecentNotes: vi.fn(),
            getRecentIcons: () => ({}),
            setRecentIcons: vi.fn(),
            getRecentColors: () => [],
            setRecentColors: vi.fn()
        } satisfies ISettingsProvider
    );
    return {
        app,
        file,
        operations,
        prompt,
        metadata,
        processFrontMatter,
        renameFile,
        updateFrontmatter,
        command,
        read,
        cachedRead,
        inventory
    };
}

function expectNoNoteWork(h: ReturnType<typeof fixture>): void {
    for (const operation of [h.processFrontMatter, h.renameFile, h.updateFrontmatter, h.command, h.read, h.cachedRead, h.inventory]) {
        expect(operation).not.toHaveBeenCalled();
    }
}

/** Executes the actual list action; unrelated React tree/DOM are outside this harness. */
function listRenameAction(environment: Record<string, unknown>): (file: TFile) => boolean {
    const source = readFileSync(new URL('../../src/components/ListPane.tsx', import.meta.url), 'utf8');
    const parsed = ts.createSourceFile('ListPane.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let initializer: ts.Expression | undefined;
    function visit(node: ts.Node): void {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'handleStartFileInlineRenameForFile') {
            initializer = node.initializer;
        }
        ts.forEachChild(node, visit);
    }
    visit(parsed);
    if (!initializer) throw new Error('List rename action is missing');
    const javascript = ts.transpileModule(`const action = ${initializer.getText(parsed)};`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText;
    return runInNewContext(`${javascript}\naction;`, {
        React: { useCallback: (callback: unknown) => callback },
        ...environment
    }) as (file: TFile) => boolean;
}

beforeEach(() => {
    boundaries.modal.mockClear();
    boundaries.notice.mockClear();
});

describe('ordinary Rename uses the exact-target native Obsidian prompt', () => {
    it.each([
        {},
        { useFrontmatterMetadata: true, frontmatterNameField: 'title' },
        { useFrontmatterMetadata: true, frontmatterNameField: 'TITLE, alias' }
    ])('opens the core prompt without a custom editor or eager title write: %j', async settings => {
        const h = fixture(settings, { title: 'Different display title' });
        await h.operations.renameFile(h.file, true);
        expect(h.prompt).toHaveBeenCalledExactlyOnceWith(h.file);
        expect(boundaries.modal).not.toHaveBeenCalled();
        expectNoNoteWork(h);
    });

    it('handles creation before metadata exists and native cancellation without any note work', async () => {
        const h = fixture();
        h.app.metadataCache.getFileCache = () => null;
        await h.operations.renameFile(h.file, true);
        expect(h.prompt).toHaveBeenCalledExactlyOnceWith(h.file);
        expect(h.file.path).toBe('Inbox/Exact target.md');
        expectNoNoteWork(h);
    });

    it.each([undefined, false])('refuses an unavailable native prompt without a custom or active-note fallback: %j', async value => {
        const h = fixture();
        Reflect.set(h.app.fileManager, 'promptForFileRename', value);
        await h.operations.renameFile(h.file, true);
        expect(boundaries.notice).toHaveBeenCalledOnce();
        expect(boundaries.notice.mock.calls[0]?.[0]).toContain('native Rename dialog');
        expect(boundaries.modal).not.toHaveBeenCalled();
        expectNoNoteWork(h);
    });

    it('reports a core prompt failure once without another editor or writer', async () => {
        const h = fixture();
        h.prompt.mockRejectedValueOnce(new Error('Core prompt failed'));
        await h.operations.renameFile(h.file, true);
        expect(h.prompt).toHaveBeenCalledOnce();
        expect(boundaries.notice).toHaveBeenCalledOnce();
        expect(boundaries.modal).not.toHaveBeenCalled();
        expectNoNoteWork(h);
    });

    it('preserves the separately configured non-title property editor', async () => {
        const h = fixture({ useFrontmatterMetadata: true, frontmatterNameField: 'alias' }, { alias: 'Personal label' });
        await h.operations.renameFile(h.file, true);
        expect(h.prompt).not.toHaveBeenCalled();
        expect(boundaries.modal).toHaveBeenCalledOnce();
        expect(boundaries.modal.mock.calls[0]?.[4]).toBe('Personal label');
        expectNoNoteWork(h);
    });

    it('follows the resolved field in an ordered display-property list', async () => {
        const h = fixture({ useFrontmatterMetadata: true, frontmatterNameField: 'title, alias' }, { alias: 'Personal label' });
        await h.operations.renameFile(h.file, true);
        expect(h.prompt).not.toHaveBeenCalled();
        expect(boundaries.modal).toHaveBeenCalledOnce();
        expect(boundaries.modal.mock.calls[0]?.[4]).toBe('Personal label');
    });

    it('leaves explicit folder-note detachment and resource prompts on their existing route', async () => {
        const h = fixture();
        await h.operations.renameFile(h.file);
        const resource = createTestTFile('Inbox/Drawing.canvas');
        await h.operations.renameFile(resource, true);
        expect(h.prompt).not.toHaveBeenCalled();
        expect(boundaries.modal).toHaveBeenCalledTimes(2);
        expectNoNoteWork(h);
    });

    it('twenty repeated opens perform no scans, source reads or mutations', async () => {
        const h = fixture();
        for (let i = 0; i < 20; i += 1) await h.operations.renameFile(h.file, true);
        expect(h.prompt).toHaveBeenCalledTimes(20);
        expect(boundaries.modal).not.toHaveBeenCalled();
        expectNoNoteWork(h);
    });
});

describe('the actual ListPane context-menu and keyboard rename action', () => {
    function harness(h: ReturnType<typeof fixture>, visible = true) {
        const setInlineRenameFilePath = vi.fn();
        const scrollToIndexSafely = vi.fn();
        const pending: Promise<unknown>[] = [];
        const action = listRenameAction({
            fileSystemOps: h.operations,
            filePathToIndex: new Map(visible ? [[h.file.path, 4]] : []),
            setInlineRenameFilePath,
            scrollToIndexSafely,
            runAsyncAction: (callback: () => Promise<unknown>) => pending.push(callback())
        });
        return { action, setInlineRenameFilePath, scrollToIndexSafely, pending };
    }

    it.each([true, false])('uses the same native prompt without row focus or inline state: visible %j', async visible => {
        const h = fixture();
        const list = harness(h, visible);
        expect(list.action(h.file)).toBe(true);
        await Promise.all(list.pending);
        expect(h.prompt).toHaveBeenCalledExactlyOnceWith(h.file);
        expect(list.setInlineRenameFilePath).not.toHaveBeenCalled();
        expect(list.scrollToIndexSafely).not.toHaveBeenCalled();
        expect(boundaries.modal).not.toHaveBeenCalled();
        expectNoNoteWork(h);
    });

    it('retains visible inline editing for a separately configured display property', () => {
        const h = fixture({ useFrontmatterMetadata: true, frontmatterNameField: 'alias' }, { alias: 'Label' });
        const list = harness(h);
        expect(list.action(h.file)).toBe(true);
        expect(list.setInlineRenameFilePath).toHaveBeenCalledExactlyOnceWith(h.file.path);
        expect(list.scrollToIndexSafely).toHaveBeenCalledExactlyOnceWith(4, 'auto');
        expect(h.prompt).not.toHaveBeenCalled();
    });

    it('lets a nonvisible custom display property reach its existing modal fallback', () => {
        const h = fixture({ useFrontmatterMetadata: true, frontmatterNameField: 'alias' }, { alias: 'Label' });
        const list = harness(h, false);
        expect(list.action(h.file)).toBe(false);
        expect(list.setInlineRenameFilePath).not.toHaveBeenCalled();
        expect(h.prompt).not.toHaveBeenCalled();
    });
});
