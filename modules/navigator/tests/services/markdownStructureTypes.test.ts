import { App, TFile, type CachedMetadata, type Pos, type SectionCache } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { LIMITS } from '../../src/constants/limits';
import { MarkdownStructureTypesIndex, getMarkdownStructureRecordsForFile } from '../../src/services/types/markdownStructureTypes';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

function position(startLine: number, endLine = startLine, endColumn = 1): Pos {
    return {
        start: { line: startLine, col: 0, offset: startLine * 10 },
        end: { line: endLine, col: endColumn, offset: endLine * 10 + endColumn }
    };
}

function section(type: string, startLine: number, endLine = startLine, endColumn = 1, id?: string): SectionCache {
    return { type, position: position(startLine, endLine, endColumn), ...(id ? { id } : {}) };
}

function createApp(files: TFile[], caches: Map<string, CachedMetadata | null>, contents: Map<string, string | Error> = new Map()) {
    const app = new App();
    const getFiles = vi.fn(() => files);
    const getFileCache = vi.fn((file: TFile) => caches.get(file.path) ?? null);
    const cachedRead = vi.fn(async (file: TFile) => {
        const content = contents.get(file.path) ?? '';
        if (content instanceof Error) {
            throw content;
        }
        return content;
    });
    Object.assign(app.vault, { getFiles, getMarkdownFiles: getFiles, cachedRead });
    Object.assign(app.metadataCache, { getFileCache });
    files.forEach(file => (app.vault as unknown as { registerFile(file: TFile): void }).registerFile(file));
    return { app, getFiles, getFileCache, cachedRead };
}

describe('Markdown structure Types', () => {
    it('indexes only the four explicit root-level section kinds with one-based inclusive ranges', () => {
        const file = new TFile('Notes/Structures.md');
        const cache: CachedMetadata = {
            sections: [
                section('yaml', 0, 2, 0),
                section('code', 3, 7, 0),
                section('callout', 8, 10),
                section('blockquote', 12, 12, 9, 'quote-id'),
                section('table', 14, 17),
                section('paragraph', 19),
                section('thematicBreak', 20),
                { type: 'code', position: { start: { line: -1, col: 0, offset: 0 }, end: { line: 1, col: 0, offset: 0 } } }
            ]
        };

        const records = getMarkdownStructureRecordsForFile(file, cache);

        expect(records.map(record => [record.typeId, record.label, record.lineNumber, record.lineEndNumber])).toEqual([
            [TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS, 'Structures · line 4', 4, 7],
            [TPS_NAVIGATOR_TYPE_IDS.CALLOUTS, 'Structures · line 9', 9, 11],
            [TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES, 'Structures · line 13', 13, undefined],
            [TPS_NAVIGATOR_TYPE_IDS.TABLES, 'Structures · line 15', 15, 18]
        ]);
        expect(records[2]).toMatchObject({
            blockId: 'quote-id',
            referenceTarget: '[[Notes/Structures.md#^quote-id]]'
        });
    });

    it('does not index nested syntax unless Obsidian publishes it as its own root-level section', () => {
        const file = new TFile('Notes/Nested.md');
        const outerOnly: CachedMetadata = { sections: [section('callout', 0, 8)] };
        const explicitlyPublished: CachedMetadata = {
            sections: [section('callout', 0, 8), section('code', 3, 6)]
        };

        expect(getMarkdownStructureRecordsForFile(file, outerOnly).map(record => record.typeId)).toEqual([TPS_NAVIGATOR_TYPE_IDS.CALLOUTS]);
        expect(getMarkdownStructureRecordsForFile(file, explicitlyPublished).map(record => record.typeId)).toEqual([
            TPS_NAVIGATOR_TYPE_IDS.CALLOUTS,
            TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS
        ]);
    });

    it('indexes authored HTTP(S) links from Markdown text and redacts sensitive URL parts', () => {
        const file = new TFile('Notes/Links.md');
        const cache: CachedMetadata = {};
        const content = [
            'Intro',
            '    [Product docs](https://user:password@example.com/docs/start?token=secret#private)',
            '',
            'http://example.org/plain',
            '<https://person:pass@example.net/autolink?api_key=hidden#fragment>',
            '[[Notes/Internal]]',
            '[Mail](mailto:person@example.com)',
            '![](https://example.net/image.png)'
        ].join('\n');

        const records = getMarkdownStructureRecordsForFile(file, cache, content);

        // The four-space-indented Markdown example and image are deliberately excluded.
        expect(records).toHaveLength(2);
        expect(records[0]).toMatchObject({
            typeId: TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS,
            label: 'http://example.org',
            sourcePath: file.path,
            lineKind: 'web-link',
            lineNumber: 4,
            columnNumber: 0,
            referenceTarget: 'http://example.org/plain',
            searchText: 'http://example.org'
        });
        expect(records[1]).toMatchObject({
            label: 'https://example.net',
            lineNumber: 5,
            columnNumber: 0,
            searchText: 'https://example.net'
        });
        expect(JSON.stringify(records.map(({ label, locatorKey, searchText }) => ({ label, locatorKey, searchText })))).not.toContain(
            'api_key'
        );
        expect(JSON.stringify(records.map(({ label, locatorKey, searchText }) => ({ label, locatorKey, searchText })))).not.toContain(
            'pass'
        );
    });

    it('keeps multiple web links on one source line distinct by their exact cached columns', async () => {
        const file = new TFile('Notes/Many links.md');
        const content = '  https://alpha.example/path and          https://beta.example/path';
        const records = getMarkdownStructureRecordsForFile(file, {}, content);

        expect(records.map(record => [record.lineNumber, record.columnNumber, record.searchText])).toEqual([
            [1, 2, 'https://alpha.example'],
            [1, content.indexOf('https://beta.example/path'), 'https://beta.example']
        ]);
        expect(new Set(records.map(record => record.locatorKey)).size).toBe(2);

        const caches = new Map<string, CachedMetadata | null>([[file.path, {}]]);
        const sorted = await new MarkdownStructureTypesIndex(createApp([file], caches, new Map([[file.path, content]])).app).rebuild();
        expect(sorted.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)?.map(record => record.columnNumber)).toEqual([
            2,
            content.indexOf('https://beta.example/path')
        ]);
    });

    it('excludes Excalidraw Markdown and reads each eligible body at most once per unchanged file stat', async () => {
        const drawing = new TFile('Drawings/Diagram.md');
        const note = new TFile('Notes/Code.md');
        const caches = new Map<string, CachedMetadata | null>([
            [drawing.path, { frontmatter: { 'excalidraw-plugin': 'parsed' }, sections: [section('code', 1, 3)] }],
            [note.path, { sections: [section('code', 4, 6)] }]
        ]);
        const context = createApp([drawing, note], caches);
        const index = new MarkdownStructureTypesIndex(context.app);

        const snapshot = await index.rebuild();
        await index.rebuild();

        expect(snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS)?.map(record => record.sourcePath)).toEqual([note.path]);
        expect(context.getFiles).toHaveBeenCalledTimes(2);
        expect(context.cachedRead).toHaveBeenCalledTimes(1);
    });

    it('updates one path incrementally and removes deleted paths without rescanning the vault', async () => {
        const alpha = new TFile('Notes/Alpha.md');
        const beta = new TFile('Notes/Beta.md');
        const caches = new Map<string, CachedMetadata | null>([
            [alpha.path, { sections: [section('code', 1, 2)] }],
            [beta.path, { sections: [section('table', 3, 5)] }]
        ]);
        const context = createApp([alpha, beta], caches);
        const index = new MarkdownStructureTypesIndex(context.app);
        await index.rebuild();

        const updated = index.updateFile(alpha, { sections: [section('callout', 7, 9)] });
        const removed = index.removePath(beta.path);

        expect(context.getFiles).toHaveBeenCalledOnce();
        expect(updated.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS)).toHaveLength(0);
        expect(updated.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CALLOUTS)).toHaveLength(1);
        expect(removed.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.TABLES)).toHaveLength(0);
        expect(context.cachedRead).toHaveBeenCalledTimes(2);
    });

    it('refreshes a stable block-id row when only its cached end line changes', async () => {
        const file = new TFile('Notes/Stable.md');
        const caches = new Map<string, CachedMetadata | null>([[file.path, { sections: [section('callout', 3, 5, 4, 'stable-callout')] }]]);
        const context = createApp([file], caches);
        const index = new MarkdownStructureTypesIndex(context.app);
        const initial = await index.rebuild();
        const initialRecord = initial.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CALLOUTS)?.[0];

        const updated = index.updateFile(file, { sections: [section('callout', 3, 8, 4, 'stable-callout')] });
        const updatedRecord = updated.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CALLOUTS)?.[0];

        expect(updated.revision).toBeGreaterThan(initial.revision);
        expect(updatedRecord?.locatorKey).toBe(initialRecord?.locatorKey);
        expect(updatedRecord?.lineEndNumber).toBe(9);
    });

    it('revalidates ranges before opening and follows an existing block id after movement', async () => {
        const file = new TFile('Notes/Open.md');
        const caches = new Map<string, CachedMetadata | null>([
            [file.path, { sections: [section('code', 4, 7), section('blockquote', 10, 11, 4, 'stable-quote')] }]
        ]);
        const context = createApp([file], caches);
        const editor = {
            setCursor: vi.fn(),
            scrollIntoView: vi.fn(),
            focus: vi.fn()
        };
        const leaf = {
            view: { file, editor },
            openFile: vi.fn(async () => undefined)
        };
        Object.assign(context.app, {
            workspace: {
                activeLeaf: leaf,
                getLeaf: vi.fn(() => leaf),
                getLeavesOfType: vi.fn(() => [leaf])
            }
        });
        const index = new MarkdownStructureTypesIndex(context.app);
        const snapshot = await index.rebuild();
        const code = snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS)?.[0];
        const quote = snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES)?.[0];
        expect(code).toBeDefined();
        expect(quote).toBeDefined();

        caches.set(file.path, { sections: [section('code', 5, 8), section('blockquote', 15, 16, 4, 'stable-quote')] });

        await expect(index.activate(code!)).resolves.toEqual({ ok: false, reason: 'stale-locator' });
        expect(leaf.openFile).not.toHaveBeenCalled();

        await expect(index.activate(quote!)).resolves.toEqual({ ok: true, sourcePath: file.path, lineNumber: 16 });
        expect(leaf.openFile).toHaveBeenCalledWith(file, { state: { mode: 'source' }, active: true });
        expect(editor.setCursor).toHaveBeenCalledWith({ line: 15, ch: 0 });
        expect(editor.scrollIntoView).toHaveBeenCalledWith({ from: { line: 15, ch: 0 }, to: { line: 15, ch: 0 } }, true);
        expect(editor.focus).toHaveBeenCalledOnce();
    });

    it('revalidates a web-link target and opens its exact cached line and column', async () => {
        const file = new TFile('Notes/Open link.md');
        const caches = new Map<string, CachedMetadata | null>([[file.path, {}]]);
        const prefix = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'].join('\n') + '\n';
        const linePrefix = 'Source link: ';
        const contents = new Map<string, string | Error>([[file.path, `${prefix}${linePrefix}[Docs](https://example.com/docs?private=1)`]]);
        const context = createApp([file], caches, contents);
        const editor = {
            setCursor: vi.fn(),
            scrollIntoView: vi.fn(),
            focus: vi.fn()
        };
        const leaf = {
            view: { file, editor },
            openFile: vi.fn(async () => undefined)
        };
        Object.assign(context.app, {
            workspace: {
                activeLeaf: leaf,
                getLeaf: vi.fn(() => leaf),
                getLeavesOfType: vi.fn(() => [leaf])
            }
        });
        const index = new MarkdownStructureTypesIndex(context.app);
        const record = (await index.rebuild()).recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)?.[0];
        expect(record).toBeDefined();

        await expect(index.activate(record!)).resolves.toEqual({ ok: true, sourcePath: file.path, lineNumber: 7 });
        expect(editor.setCursor).toHaveBeenCalledWith({ line: 6, ch: linePrefix.length });

        // Keep the authored range and sanitized display identical. Only the
        // private query value changes, proving activation compares the exact
        // target as well as the line/column locator.
        contents.set(file.path, `${prefix}${linePrefix}[Docs](https://example.com/docs?private=2)`);
        await expect(index.activate(record!)).resolves.toEqual({ ok: false, reason: 'stale-locator' });
        expect(leaf.openFile).toHaveBeenCalledOnce();
    });

    it('refreshes the body stat after an identical changed-event scan', async () => {
        const file = new TFile('Notes/Same links.md');
        const body = 'https://example.com/stable';
        const caches = new Map<string, CachedMetadata | null>([[file.path, {}]]);
        const context = createApp([file], caches, new Map([[file.path, body]]));
        const index = new MarkdownStructureTypesIndex(context.app);
        await index.rebuild();
        expect(context.cachedRead).toHaveBeenCalledOnce();

        file.stat.mtime += 1;
        index.updateFile(file, {}, body);
        await index.rebuild();

        expect(context.cachedRead).toHaveBeenCalledOnce();
    });

    it('skips oversized bodies before cachedRead and keeps metadata-backed structures', async () => {
        const file = new TFile('Notes/Large.md');
        file.stat.size = LIMITS.markdown.maxReadBytes.desktop + 1;
        const caches = new Map<string, CachedMetadata | null>([[file.path, { sections: [section('table', 2, 4)] }]]);
        const context = createApp([file], caches, new Map([[file.path, 'https://example.com/never-read']]));

        const snapshot = await new MarkdownStructureTypesIndex(context.app).rebuild();

        expect(context.cachedRead).not.toHaveBeenCalled();
        expect(snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)).toHaveLength(0);
        expect(snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.TABLES)).toHaveLength(1);
    });

    it('clears cached rows and prevents an outstanding rebuild from repopulating them', async () => {
        const file = new TFile('Notes/Pause.md');
        const caches = new Map<string, CachedMetadata | null>([[file.path, {}]]);
        let resolvePausedRead!: (content: string) => void;
        const pausedRead = new Promise<string>(resolve => {
            resolvePausedRead = resolve;
        });
        const context = createApp([file], caches);
        context.cachedRead.mockImplementationOnce(() => pausedRead).mockResolvedValueOnce('https://fresh.example/after-reenable');
        const index = new MarkdownStructureTypesIndex(context.app);
        const controller = new AbortController();

        const pending = index.rebuild(controller.signal);
        await vi.waitFor(() => expect(context.cachedRead).toHaveBeenCalledOnce());
        controller.abort();
        const cleared = index.clear();
        resolvePausedRead('https://stale.example/before-disable');

        expect(await pending).toBe(cleared);
        expect(index.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)).toHaveLength(0);

        const rebuilt = await index.rebuild();
        expect(context.cachedRead).toHaveBeenCalledTimes(2);
        expect(rebuilt.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)?.map(record => record.searchText)).toEqual([
            'https://fresh.example'
        ]);
    });

    it('preserves the newer changed-event body when an older full rebuild read finishes later', async () => {
        const file = new TFile('Notes/Race.md');
        const caches = new Map<string, CachedMetadata | null>([[file.path, {}]]);
        let resolveRead!: (content: string) => void;
        const pendingRead = new Promise<string>(resolve => {
            resolveRead = resolve;
        });
        const context = createApp([file], caches);
        context.cachedRead.mockImplementationOnce(() => pendingRead);
        const index = new MarkdownStructureTypesIndex(context.app);

        const rebuild = index.rebuild();
        index.updateFile(file, {}, 'https://new.example/path');
        resolveRead('https://old.example/path');
        const snapshot = await rebuild;

        expect(snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)?.map(record => record.searchText)).toEqual([
            'https://new.example'
        ]);
    });

    it('does not let an older full rebuild overwrite a newer completed rebuild', async () => {
        const file = new TFile('Notes/Overlapping rebuilds.md');
        const caches = new Map<string, CachedMetadata | null>([[file.path, {}]]);
        let resolveOldRead!: (content: string) => void;
        const oldRead = new Promise<string>(resolve => {
            resolveOldRead = resolve;
        });
        const context = createApp([file], caches);
        context.cachedRead.mockImplementationOnce(() => oldRead).mockResolvedValueOnce('https://new.example/path');
        const index = new MarkdownStructureTypesIndex(context.app);

        const olderRebuild = index.rebuild();
        const newerSnapshot = await index.rebuild();
        resolveOldRead('https://old.example/path');
        const olderResult = await olderRebuild;

        expect(newerSnapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)?.map(record => record.searchText)).toEqual([
            'https://new.example'
        ]);
        expect(olderResult).toBe(newerSnapshot);
        expect(index.getSnapshot()).toBe(newerSnapshot);
    });

    it('preserves prior Web links after an unreadable refresh but reports guarded activation failure', async () => {
        const file = new TFile('Notes/Unreadable.md');
        const caches = new Map<string, CachedMetadata | null>([[file.path, {}]]);
        const contents = new Map<string, string | Error>([[file.path, 'https://example.com/available']]);
        const context = createApp([file], caches, contents);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const index = new MarkdownStructureTypesIndex(context.app);
        const initial = await index.rebuild();
        const record = initial.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)?.[0];
        expect(record).toBeDefined();

        file.stat.mtime += 1;
        contents.set(file.path, new Error('read failed'));
        const refreshed = await index.rebuild();

        expect(refreshed.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)).toHaveLength(1);
        expect(warn).toHaveBeenCalledWith('[TPS Notebook Navigator] Web-link body scan skipped unreadable Markdown files', { count: 1 });
        await expect(index.activate(record!)).resolves.toMatchObject({ ok: false, reason: 'read-failed' });
        warn.mockRestore();
    });

    it('drops links when a note becomes ineligible and rescans after an Excalidraw-to-Markdown rename', async () => {
        const file = new TFile('Notes/Rename.md');
        const caches = new Map<string, CachedMetadata | null>([[file.path, {}]]);
        const contents = new Map<string, string | Error>([[file.path, 'https://before.example/path']]);
        const context = createApp([file], caches, contents);
        const index = new MarkdownStructureTypesIndex(context.app);
        expect((await index.rebuild()).recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)).toHaveLength(1);

        const markdownPath = file.path;
        Reflect.set(file, 'path', 'Drawings/Rename.excalidraw.md');
        Reflect.set(file, 'name', 'Rename.excalidraw.md');
        caches.delete(markdownPath);
        caches.set(file.path, {});
        contents.delete(markdownPath);
        contents.set(file.path, 'https://hidden.example/path');
        expect(index.renameFile(file, markdownPath).recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)).toHaveLength(0);
        expect(index.updateFile(file, {}).recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)).toHaveLength(0);

        const drawingPath = file.path;
        Reflect.set(file, 'path', 'Notes/Restored.md');
        Reflect.set(file, 'name', 'Restored.md');
        caches.delete(drawingPath);
        caches.set(file.path, {});
        contents.delete(drawingPath);
        contents.set(file.path, 'https://restored.example/path');
        index.renameFile(file, drawingPath);
        const restored = await index.rebuild();

        expect(restored.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)?.map(record => record.searchText)).toEqual([
            'https://restored.example'
        ]);
    });
});
