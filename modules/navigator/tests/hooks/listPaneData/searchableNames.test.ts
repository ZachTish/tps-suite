import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, CachedMetadata, FrontMatterCache, TFile } from 'obsidian';
import type { IndexedDBStorage } from '../../../src/storage/IndexedDBStorage';
import { createTestTFile } from '../../utils/createTestTFile';
import { parseFilterSearchTokens } from '../../../src/utils/filterSearch';

// Exercise the hook's real effects and updater functions without a DOM. Keep
// dependency/cleanup semantics so repeated navigation and disabling search
// are covered, not just the predicate selecting the fast path.
const hooks = vi.hoisted<{
    state: unknown;
    cursor: number;
    dependencies: Array<readonly unknown[]>;
    cleanups: Array<(() => void) | undefined>;
    pending: Array<() => void>;
}>(() => ({
    state: undefined,
    cursor: 0,
    dependencies: [],
    cleanups: [],
    pending: []
}));
vi.mock('react', async importOriginal => ({
    ...(await importOriginal<typeof import('react')>()),
    useState(initial: unknown) {
        if (hooks.state === undefined) hooks.state = initial;
        return [
            hooks.state,
            (next: unknown) => {
                hooks.state = typeof next === 'function' ? (next as (previous: unknown) => unknown)(hooks.state) : next;
            }
        ];
    },
    useEffect(effect: () => void | (() => void), dependencies: readonly unknown[]) {
        const index = hooks.cursor++;
        const previous = hooks.dependencies[index];
        if (
            previous &&
            dependencies.length === previous.length &&
            dependencies.every((value, offset) => Object.is(value, previous[offset]))
        )
            return;
        hooks.dependencies[index] = dependencies;
        hooks.pending.push(() => {
            hooks.cleanups[index]?.();
            hooks.cleanups[index] = effect() || undefined;
        });
    }
}));
import { filterListPaneFiles, useSearchableNames } from '../../../src/hooks/listPaneData/searchPipeline';

beforeEach(() => {
    hooks.cleanups.forEach(cleanup => cleanup?.());
    hooks.state = undefined;
    hooks.cursor = 0;
    hooks.dependencies = [];
    hooks.cleanups = [];
    hooks.pending = [];
});

function fixture(count = 1000) {
    const files = Array.from({ length: count }, (_, index) => createTestTFile(`Notes/${index}.md`));
    const metadata = new Map(files.map((file, index) => [file.path, { title: `Native title ${index}`, aliases: [`Alias ${index}`] }]));
    const listeners = new Set<(file: TFile, data: string, cache: { frontmatter: FrontMatterCache }) => void>();
    const getFileCache = vi.fn((file: TFile) => ({ frontmatter: metadata.get(file.path) }));
    const app = {
        metadataCache: {
            getFileCache,
            on(_event: string, callback: (file: TFile, data: string, cache: { frontmatter: FrontMatterCache }) => void) {
                listeners.add(callback);
                return callback;
            },
            offref(callback: (file: TFile, data: string, cache: { frontmatter: FrontMatterCache }) => void) {
                listeners.delete(callback);
            }
        }
    } as unknown as App;
    const inspect = vi.fn((file: TFile, _metadata?: CachedMetadata) => metadata.get(file.path)?.title || file.basename);
    function render(query: string, options: { useOmnisearch?: boolean; files?: TFile[]; replacementGetter?: boolean } = {}) {
        const getFileDisplayName = options.replacementGetter ? (file: TFile) => inspect(file) : inspect;
        for (let pass = 0; pass < 4; pass++) {
            hooks.cursor = 0;
            hooks.pending = [];
            const previous = hooks.state;
            const names = useSearchableNames({
                app,
                baseFiles: options.files || files,
                getFileDisplayName,
                searchTokens: query ? parseFilterSearchTokens(query) : null,
                useOmnisearch: options.useOmnisearch === true
            });
            hooks.pending.forEach(effect => effect());
            if (hooks.state === previous) return names;
        }
        throw Error('Unstable searchable-name hook');
    }
    function update(file: TFile, title: string, aliases: string[]) {
        const frontmatter = { title, aliases };
        metadata.set(file.path, frontmatter);
        listeners.forEach(callback => callback(file, '', { frontmatter }));
    }
    return { app, files, metadata, inspect, getFileCache, render, update, listeners };
}

describe('searchable names work follows name-search demand', () => {
    it('does no full-list inspection on startup, repeated navigation, or metadata changes with no search', () => {
        const f = fixture();
        expect(f.render('').size).toBe(0);
        for (let index = 0; index < 4; index++) {
            expect(f.render('', { files: [...f.files], replacementGetter: true }).size).toBe(0);
            f.update(f.files[index], 'Changed title', ['Changed alias']);
        }
        expect(f.inspect).not.toHaveBeenCalled();
        expect(f.getFileCache).not.toHaveBeenCalled();
        expect(f.listeners.size).toBe(0);
    });

    it.each(['#kind/task', '.status=open', 'folder:Notes', 'ext:md', 'type:note'])(
        'does not inspect names for structural-only query %s',
        query => {
            const f = fixture();
            expect(f.render(query).size).toBe(0);
            expect(f.inspect).not.toHaveBeenCalled();
            expect(f.getFileCache).not.toHaveBeenCalled();
        }
    );

    it('uses Omnisearch results without building an unused native-name index', () => {
        const f = fixture();
        expect(f.render('Native title', { useOmnisearch: true }).size).toBe(0);
        expect(f.inspect).not.toHaveBeenCalled();
        expect(f.listeners.size).toBe(0);
    });

    it('enabling name search builds names once and updates only the changed note', () => {
        const f = fixture();
        f.render('');
        const names = f.render('Alias');
        expect(names.size).toBe(1000);
        expect(f.inspect).toHaveBeenCalledTimes(1000);
        expect(names.get(f.files[17].path)).toMatchObject({
            foldedDisplayName: 'native title 17',
            aliases: ['Alias 17'],
            foldedAliases: ['alias 17']
        });
        f.render('Native');
        expect(f.inspect).toHaveBeenCalledTimes(1000);
        f.update(f.files[17], 'Replacement', ['Special alias']);
        expect(f.inspect).toHaveBeenCalledTimes(1001);
        const changed = f.render('"Special alias"');
        const result = filterListPaneFiles({
            app: f.app,
            baseFiles: f.files,
            getDB: () => ({ getFile: () => null }) as unknown as IndexedDBStorage,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            omnisearchResult: null,
            searchableNames: changed,
            settings: { alphabeticalDateMode: 'modified' },
            sortOption: 'alphabetical-asc',
            trimmedQuery: '"Special alias"',
            useOmnisearch: false
        });
        expect(result.files).toEqual([f.files[17]]);
        expect(result.matchedAliases.get(f.files[17].path)?.map(alias => alias.value)).toEqual(['Special alias']);
    });

    it('retains resolved names when modified sorting only replaces or reorders the file array', () => {
        const f = fixture();
        const names = f.render('Native');
        f.inspect.mockClear();
        f.getFileCache.mockClear();

        expect(f.render('Native', { files: [...f.files].reverse() })).toBe(names);
        expect(f.render('Native', { files: [...f.files] })).toBe(names);
        expect(f.inspect).not.toHaveBeenCalled();
        expect(f.getFileCache).not.toHaveBeenCalled();
    });

    it('does not re-inspect the full selection during a burst of body edits and modified-sort refreshes', () => {
        const f = fixture();
        const names = f.render('Native');
        f.inspect.mockClear();
        f.getFileCache.mockClear();

        let currentNames = names;
        for (let index = 0; index < 20; index++) {
            f.update(f.files[index], `Native title ${index}`, [`Alias ${index}`]);
            const files = index % 2 === 0 ? [...f.files].reverse() : [...f.files];
            currentNames = f.render('Native', { files });
        }

        expect(f.inspect).toHaveBeenCalledTimes(20);
        expect(f.getFileCache).not.toHaveBeenCalled();
        expect(currentNames).toBe(names);
    });

    it('resolves only additions while preserving changed titles and aliases through membership changes', () => {
        const f = fixture(4);
        f.render('Native', { files: f.files.slice(0, 2) });
        f.inspect.mockClear();
        f.getFileCache.mockClear();
        f.update(f.files[0], 'Replacement', ['Special alias']);

        const names = f.render('Special', { files: [f.files[2], f.files[0]] });
        expect([...names.keys()]).toEqual([f.files[2].path, f.files[0].path]);
        expect(names.get(f.files[0].path)?.foldedDisplayName).toBe('replacement');
        expect(names.get(f.files[0].path)?.aliases).toEqual(['Special alias']);
        expect(f.inspect).toHaveBeenCalledTimes(2);
        expect(f.getFileCache).toHaveBeenCalledTimes(1);

        f.update(f.files[1], 'Changed while absent', []);
        const reentered = f.render('Changed', { files: [f.files[1], f.files[0]] });
        expect(reentered.get(f.files[1].path)?.foldedDisplayName).toBe('changed while absent');
        expect(f.inspect).toHaveBeenCalledTimes(3);
    });

    it('does not reuse a deleted note name when a new TFile occupies the same path', () => {
        const f = fixture(2);
        f.render('Native');
        f.inspect.mockClear();
        const replacement = createTestTFile(f.files[0].path);
        f.metadata.set(replacement.path, { title: 'Replacement file', aliases: ['New alias'] });

        const names = f.render('Replacement', { files: [replacement, f.files[1]] });
        expect(names.get(replacement.path)?.foldedDisplayName).toBe('replacement file');
        expect(names.get(replacement.path)?.aliases).toEqual(['New alias']);
        expect(f.inspect).toHaveBeenCalledTimes(1);
        expect(f.inspect).toHaveBeenCalledWith(replacement, { frontmatter: f.metadata.get(replacement.path) });
    });

    it('uses supplied live metadata for new files and name events instead of a stale indexed name', () => {
        const f = fixture(1);
        f.inspect.mockImplementation((_file, metadata) => {
            const title: unknown = metadata?.frontmatter?.title;
            return typeof title === 'string' ? title : 'Stale indexed name';
        });
        expect(f.render('Native').get(f.files[0].path)?.foldedDisplayName).toBe('native title 0');

        f.update(f.files[0], 'Fresh event name', ['Fresh alias']);
        const changed = f.render('Fresh');
        expect(changed.get(f.files[0].path)?.foldedDisplayName).toBe('fresh event name');
        expect(f.render('Fresh', { files: [...f.files] })).toBe(changed);

        const replacement = createTestTFile(f.files[0].path);
        f.metadata.set(replacement.path, { title: 'Fresh replacement name', aliases: [] });
        expect(f.render('Fresh', { files: [replacement] }).get(replacement.path)?.foldedDisplayName).toBe('fresh replacement name');
    });

    it('drops a renamed path and resolves its new title without rereading retained notes', () => {
        const f = fixture(3);
        f.render('Native');
        f.inspect.mockClear();
        const originalPath = f.files[0].path;
        f.files[0].path = 'Notes/renamed.md';
        f.files[0].basename = 'renamed';
        f.update(f.files[0], 'Renamed title', ['New alias']);
        expect(f.inspect).not.toHaveBeenCalled();

        const names = f.render('Renamed', { files: [...f.files] });
        expect(names.has(originalPath)).toBe(false);
        expect(names.get(f.files[0].path)?.foldedDisplayName).toBe('renamed title');
        expect(f.inspect).toHaveBeenCalledTimes(1);
        expect(f.inspect).toHaveBeenCalledWith(f.files[0], { frontmatter: f.metadata.get(f.files[0].path) });
    });

    it('rebuilds all names when the resolver or metadata source is replaced', () => {
        const f = fixture(3);
        f.render('Native');
        f.inspect.mockClear();
        f.metadata.set(f.files[0].path, { title: 'Updated resolver name', aliases: [] });

        const names = f.render('Updated', { replacementGetter: true });
        expect(names.get(f.files[0].path)?.foldedDisplayName).toBe('updated resolver name');
        expect(f.inspect).toHaveBeenCalledTimes(3);
        f.render('Updated');
        expect(f.inspect).toHaveBeenCalledTimes(6);
        f.render('Updated');
        expect(f.inspect).toHaveBeenCalledTimes(6);

        const replacementListeners = new Set<unknown>();
        Reflect.set(f.app, 'metadataCache', {
            getFileCache: f.getFileCache,
            on: (_name: string, listener: unknown) => {
                replacementListeners.add(listener);
                return listener;
            },
            offref: (listener: unknown) => replacementListeners.delete(listener)
        });
        f.render('Updated');
        expect(f.inspect).toHaveBeenCalledTimes(9);
        expect(f.listeners.size).toBe(0);
        expect(replacementListeners.size).toBe(1);
    });

    it('releases names for Omnisearch and rebuilds current values when internal name search resumes', () => {
        const f = fixture(2);
        f.render('Native');
        expect(f.inspect).toHaveBeenCalledTimes(2);
        expect(f.render('Native', { useOmnisearch: true }).size).toBe(0);
        expect(f.listeners.size).toBe(0);
        f.update(f.files[0], 'Changed while external search owns results', ['New alias']);
        expect(f.inspect).toHaveBeenCalledTimes(2);

        const names = f.render('Changed');
        expect(names.get(f.files[0].path)?.foldedDisplayName).toBe('changed while external search owns results');
        expect(names.get(f.files[0].path)?.aliases).toEqual(['New alias']);
        expect(f.inspect).toHaveBeenCalledTimes(4);
        expect(f.listeners.size).toBe(1);
    });

    it('negative name search still indexes aliases and clearing search releases its metadata listener', () => {
        const f = fixture(2);
        expect(f.render('-Alias').size).toBe(2);
        expect(f.inspect).toHaveBeenCalledTimes(2);
        expect(f.listeners.size).toBe(1);
        expect(f.render('').size).toBe(0);
        expect(f.listeners.size).toBe(0);
        f.update(f.files[0], 'After clearing', ['Fresh alias']);
        expect(f.inspect).toHaveBeenCalledTimes(2);
        expect(f.render('Fresh').get(f.files[0].path)?.foldedDisplayName).toBe('after clearing');
        expect(f.inspect).toHaveBeenCalledTimes(4);
    });
});
