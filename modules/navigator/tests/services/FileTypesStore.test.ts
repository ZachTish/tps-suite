import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFolder, type App, type CachedMetadata, type TAbstractFile, type TFile } from 'obsidian';
import { FileTypesStore } from '../../src/services/types/FileTypesStore';
import { buildVaultFileTypesSnapshot } from '../../src/services/types/vaultFileTypes';
import { TypesAPI } from '../../src/api/modules/TypesAPI';
import { TPS_NAVIGATOR_TYPE_IDS as IDS } from '../../src/types/navigatorTypes';
import { createTestTFile } from '../utils/createTestTFile';

afterEach(() => vi.useRealTimers());

function fixture(paths = ['a.md', 'board.canvas', 'table.base', 'image.png']) {
    const files = paths.map(createTestTFile);
    const folders = new Map<string, TFolder>();
    const caches = new Map<TFile, CachedMetadata>();
    const events = new Map<string, (file: TAbstractFile, oldPath?: string) => void>();
    const metadataEvents = new Map<string, (file: TFile, data: string, cache: CachedMetadata) => void>();
    const read = vi.fn(() => {
        throw new Error('File types must not read bodies');
    });
    const getFiles = vi.fn(() => files);
    const getFileCache = vi.fn((file: TFile) => caches.get(file) ?? null);
    const on = vi.fn((name: string, callback: (file: TAbstractFile, oldPath?: string) => void) => {
        events.set(name, callback);
        return { name };
    });
    const app = {
        vault: {
            getFiles,
            getAbstractFileByPath: (path: string) => files.find(file => file.path === path) ?? folders.get(path) ?? null,
            read,
            cachedRead: read,
            on,
            offref: vi.fn((ref: { name: string }) => events.delete(ref.name))
        },
        metadataCache: {
            getFileCache,
            on: vi.fn((name: string, callback: (file: TFile, data: string, cache: CachedMetadata) => void) => {
                metadataEvents.set(name, callback);
                return { name };
            }),
            offref: vi.fn((ref: { name: string }) => metadataEvents.delete(ref.name))
        }
    } as unknown as App;
    const syncChildren = () => {
        for (const folder of folders.values()) {
            folder.children = [...folders.values(), ...files].filter(
                file => file.path.slice(0, file.path.lastIndexOf('/')) === folder.path
            );
        }
    };
    const addFolder = (path: string) => {
        const folder = new TFolder();
        folder.path = path;
        folder.name = path.split('/').pop() ?? path;
        folders.set(path, folder);
        syncChildren();
        return folder;
    };
    const add = (path: string) => {
        const file = createTestTFile(path);
        files.push(file);
        syncChildren();
        events.get('create')?.(file);
        return file;
    };
    const rename = (file: TFile, path: string) => {
        const oldPath = file.path;
        Object.assign(file, createTestTFile(path));
        syncChildren();
        events.get('rename')?.(file, oldPath);
    };
    const remove = (file: TFile) => {
        files.splice(files.indexOf(file), 1);
        syncChildren();
        events.get('delete')?.(file);
    };
    const changeMetadata = (file: TFile, frontmatter?: Record<string, unknown>) => {
        const cache = frontmatter ? { frontmatter } : {};
        caches.set(file, cache);
        metadataEvents.get('changed')?.(file, '', cache);
    };
    return {
        app,
        files,
        folders,
        caches,
        events,
        metadataEvents,
        read,
        getFiles,
        getFileCache,
        on,
        add,
        addFolder,
        rename,
        remove,
        changeMetadata,
        syncChildren
    };
}
function start(f: ReturnType<typeof fixture>) {
    vi.useFakeTimers();
    const store = new FileTypesStore(f.app);
    const listener = vi.fn();
    store.setEnabled(true);
    const stop = store.subscribe(listener);
    f.getFiles.mockClear();
    f.getFileCache.mockClear();
    listener.mockClear();
    return { store, listener, stop };
}
function expectFullSnapshot(f: ReturnType<typeof fixture>, store: FileTypesStore) {
    expect({ ...store.getSnapshot(), revision: 0 }).toEqual(buildVaultFileTypesSnapshot(f.app));
    expect(f.read).not.toHaveBeenCalled();
    f.getFiles.mockClear();
    f.getFileCache.mockClear();
}

describe('File types replacement', () => {
    it('publishes only whole-file collections without reading bodies or calling a provider', () => {
        const { app, read, on } = fixture();
        const api = new TypesAPI(new FileTypesStore(app), true, null);
        const stop = api.subscribe(() => {});
        const snapshot = api.getInternalSnapshot();
        expect(snapshot.availability).toBe('ready');
        expect(snapshot.descriptors.map(d => d.label)).toEqual([
            'Markdown',
            'Bases',
            'Canvas',
            'Drawings',
            'PDFs',
            'Images',
            'Audio',
            'Video'
        ]);
        expect([...snapshot.recordsByType.values()].flat().every(row => row.entityType === 'file')).toBe(true);
        expect(read).not.toHaveBeenCalled();
        expect(on).not.toHaveBeenCalledWith('modify', expect.anything());
        stop();
        api.dispose();
    });
    it('renames one of 1,000 notes with one classification and no vault enumeration', () => {
        const f = fixture(Array.from({ length: 1000 }, (_, i) => `note-${i}.md`).concat('image.png'));
        const { store, listener, stop } = start(f);
        const previous = store.getSnapshot();
        const previousRows = [...previous.recordsByType.values()].flat().map(row => ({ ...row }));
        f.rename(f.files[400], 'Renamed.md');
        expect(store.getSnapshot()).toBe(previous);
        expect(f.getFileCache).not.toHaveBeenCalled();
        vi.advanceTimersByTime(100);
        expect(f.getFiles).not.toHaveBeenCalled();
        expect(f.getFileCache).toHaveBeenCalledExactlyOnceWith(f.files[400]);
        expect(listener).toHaveBeenCalledOnce();
        expect([...previous.recordsByType.values()].flat()).toEqual(previousRows);
        expect(store.getSnapshot().recordsByType.get(IDS.IMAGES)).toBe(previous.recordsByType.get(IDS.IMAGES));
        expectFullSnapshot(f, store);
        stop();
    });
    it('coalesces 1,000 renames over 10,000 notes without rereading unrelated metadata', () => {
        const f = fixture(Array.from({ length: 10000 }, (_, i) => `note-${i}.md`));
        const { store, listener, stop } = start(f);
        for (let i = 0; i < 1000; i++) f.rename(f.files[i], `moved-${i}.md`);
        expect(f.getFileCache).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
        vi.advanceTimersByTime(100);
        expect(f.getFiles).not.toHaveBeenCalled();
        expect(f.getFileCache).toHaveBeenCalledTimes(1000);
        expect(listener).toHaveBeenCalledOnce();
        expectFullSnapshot(f, store);
        stop();
    });
    it('handles folder rename and deletion without descendant events or sibling-prefix collisions', () => {
        const f = fixture(['Folder/a.md', 'Folder/nested/b.md', 'Folder/drawing.md', 'Folderish/keep.md']);
        f.caches.set(f.files[2], { frontmatter: { 'excalidraw-plugin': true } });
        const folder = f.addFolder('Folder');
        const nested = f.addFolder('Folder/nested');
        const { store, stop } = start(f);
        f.folders.delete(folder.path);
        f.folders.delete(nested.path);
        folder.path = 'Moved';
        nested.path = 'Moved/nested';
        f.folders.set(folder.path, folder);
        f.folders.set(nested.path, nested);
        f.files.slice(0, 3).forEach(file => Object.assign(file, createTestTFile(file.path.replace('Folder/', 'Moved/'))));
        f.syncChildren();
        f.events.get('rename')?.(folder, 'Folder');
        vi.advanceTimersByTime(100);
        expect(f.getFiles).not.toHaveBeenCalled();
        expect(f.getFileCache).toHaveBeenCalledTimes(3);
        expectFullSnapshot(f, store);
        f.folders.clear();
        f.files.splice(0, 3);
        f.events.get('delete')?.(folder);
        vi.advanceTimersByTime(100);
        expect(f.getFiles).not.toHaveBeenCalled();
        expect(f.getFileCache).not.toHaveBeenCalled();
        expectFullSnapshot(f, store);
        stop();
    });
    it('preserves extension and Excalidraw filename transitions', () => {
        const f = fixture(['Note.md']);
        const { store, stop } = start(f);
        for (const path of ['Note.excalidraw.md', 'Note.canvas', 'Note.zip', 'Note.MD']) {
            f.rename(f.files[0], path);
            vi.advanceTimersByTime(100);
            expect(f.getFiles).not.toHaveBeenCalled();
            expectFullSnapshot(f, store);
        }
        stop();
    });
    it('ignores ordinary metadata bursts without queuing, reading metadata or publishing', () => {
        const f = fixture(Array.from({ length: 1000 }, (_, i) => `note-${i}.md`));
        const { store, listener, stop } = start(f);
        const original = store.getSnapshot();
        expect(f.metadataEvents.has('changed')).toBe(true);
        f.files.forEach(file => f.changeMetadata(file, { title: 'Changed', 'excalidraw-plugin': false }));
        expect(vi.getTimerCount()).toBe(0);
        vi.runAllTimers();
        expect(f.getFiles).not.toHaveBeenCalled();
        expect(f.getFileCache).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
        expect(store.getSnapshot()).toBe(original);
        stop();
    });
    it('updates actual drawing flag transitions, including removal and cold metadata', () => {
        const f = fixture(['Cold.md', 'Always.excalidraw.md']);
        const { store, listener, stop } = start(f);
        for (const value of [true, false, 'parsed', 'false', 1, 0, {}, null, 'yes', undefined]) {
            f.changeMetadata(f.files[0], value === undefined ? undefined : { 'excalidraw-plugin': value });
            vi.advanceTimersByTime(100);
            expect(f.getFiles).not.toHaveBeenCalled();
            expect(f.getFileCache).toHaveBeenCalledExactlyOnceWith(f.files[0]);
            expectFullSnapshot(f, store);
        }
        listener.mockClear();
        f.changeMetadata(f.files[1], { 'excalidraw-plugin': false });
        vi.runAllTimers();
        expect(listener).not.toHaveBeenCalled();
        expect(f.getFileCache).not.toHaveBeenCalled();
        stop();
    });
    it('classifies new files at flush time when cold metadata settles during the existing batch', () => {
        const f = fixture();
        const { store, listener, stop } = start(f);
        const file = f.add('Cold drawing.md');
        vi.advanceTimersByTime(50);
        f.changeMetadata(file, { 'excalidraw-plugin': 'parsed' });
        vi.advanceTimersByTime(50);
        expect(f.getFiles).not.toHaveBeenCalled();
        expect(f.getFileCache).toHaveBeenCalledExactlyOnceWith(file);
        expect(listener).toHaveBeenCalledOnce();
        expectFullSnapshot(f, store);
        stop();
    });
    it('uses the live file after rename chains and same-path delete/recreate within one batch', () => {
        const f = fixture(['A.md', 'keep.md']);
        const { store, listener, stop } = start(f);
        const deleted = f.files[0];
        f.rename(deleted, 'B.md');
        f.rename(deleted, 'C.md');
        f.remove(deleted);
        const replacement = f.add('C.md');
        f.changeMetadata(replacement, { 'excalidraw-plugin': true });
        f.metadataEvents.get('changed')?.(deleted, '', {});
        vi.advanceTimersByTime(100);
        expect(f.getFiles).not.toHaveBeenCalled();
        expect(f.getFileCache).toHaveBeenCalledExactlyOnceWith(replacement);
        expect(listener).toHaveBeenCalledOnce();
        expectFullSnapshot(f, store);
        stop();
    });
    it('does not publish flag reversals or create/delete pairs that leave the catalog unchanged', () => {
        const f = fixture(['A.md']);
        const { store, listener, stop } = start(f);
        const original = store.getSnapshot();
        f.changeMetadata(f.files[0], { 'excalidraw-plugin': true });
        f.changeMetadata(f.files[0], {});
        const transient = f.add('Transient.md');
        f.remove(transient);
        f.add('Unsupported.zip');
        vi.advanceTimersByTime(100);
        expect(f.getFiles).not.toHaveBeenCalled();
        expect(f.getFileCache).toHaveBeenCalledExactlyOnceWith(f.files[0]);
        expect(store.getSnapshot()).toBe(original);
        expect(listener).not.toHaveBeenCalled();
        stop();
    });
    it('owns one metadata listener and cancels work on disable or final unsubscribe', () => {
        const f = fixture();
        const { store, stop } = start(f);
        const otherStop = store.subscribe(() => {});
        expect(f.metadataEvents.size).toBe(1);
        expect(f.events.size).toBe(3);
        f.add('Canceled.md');
        store.setEnabled(false);
        expect(vi.getTimerCount()).toBe(0);
        expect(f.metadataEvents.size).toBe(0);
        expect(f.events.size).toBe(0);
        vi.runAllTimers();
        expect(f.getFiles).not.toHaveBeenCalled();
        store.setEnabled(true);
        expect(f.getFiles).toHaveBeenCalledOnce();
        expect(f.metadataEvents.size).toBe(1);
        expectFullSnapshot(f, store);
        stop();
        expect(f.metadataEvents.size).toBe(1);
        f.add('Also canceled.md');
        otherStop();
        expect(vi.getTimerCount()).toBe(0);
        expect(f.metadataEvents.size).toBe(0);
        expect(f.events.size).toBe(0);
        vi.runAllTimers();
        expect(f.getFiles).not.toHaveBeenCalled();
    });
    it('ignores late metadata for a deleted file whose path is now a folder', () => {
        const f = fixture(['A.md']);
        const { store, listener, stop } = start(f);
        const oldFile = f.files[0];
        f.remove(oldFile);
        const folder = f.addFolder('A.md');
        f.events.get('create')?.(folder);
        f.add('A.md/child.md');
        vi.advanceTimersByTime(100);
        expectFullSnapshot(f, store);
        listener.mockClear();
        f.metadataEvents.get('changed')?.(oldFile, '', { frontmatter: { 'excalidraw-plugin': true } });
        expect(vi.getTimerCount()).toBe(0);
        expect(listener).not.toHaveBeenCalled();
        expect(f.getFileCache).not.toHaveBeenCalled();
        stop();
    });
    it('classifies overlapping folder and child invalidations only once', () => {
        const f = fixture(['Folder/a.md', 'Folder/nested/b.md']);
        const folder = f.addFolder('Folder');
        const nested = f.addFolder('Folder/nested');
        const { store, stop } = start(f);
        f.events.get('create')?.(folder);
        f.events.get('create')?.(nested);
        f.events.get('create')?.(f.files[0]);
        vi.advanceTimersByTime(100);
        expect(f.getFiles).not.toHaveBeenCalled();
        expect(f.getFileCache).toHaveBeenCalledTimes(2);
        expectFullSnapshot(f, store);
        stop();
    });
    it('handles a file moved out before its folder is renamed, deleted and recreated in one batch', () => {
        const f = fixture(['Old/stays.md', 'Old/out.md']);
        const folder = f.addFolder('Old');
        const { store, stop } = start(f);
        f.rename(f.files[1], 'Outside.md');
        f.folders.delete('Old');
        folder.path = 'New';
        f.folders.set('New', folder);
        Object.assign(f.files[0], createTestTFile('New/stays.md'));
        f.syncChildren();
        f.events.get('rename')?.(folder, 'Old');
        f.folders.delete('New');
        f.files.splice(0, 1);
        f.events.get('delete')?.(folder);
        const recreatedFolder = f.addFolder('Old');
        f.events.get('create')?.(recreatedFolder);
        const replacement = f.add('Old/stays.md');
        f.changeMetadata(replacement, { 'excalidraw-plugin': true });
        vi.advanceTimersByTime(100);
        expect(f.getFiles).not.toHaveBeenCalled();
        expect(f.getFileCache).toHaveBeenCalledTimes(2);
        expect(new Set(f.getFileCache.mock.calls.map(([file]) => file))).toEqual(new Set(f.files));
        expectFullSnapshot(f, store);
        stop();
    });
    it('handles cold metadata arriving after the create batch and ignores later unchanged drawing edits', () => {
        const f = fixture();
        const { store, listener, stop } = start(f);
        const drawing = f.add('Late drawing.md');
        vi.advanceTimersByTime(100);
        expectFullSnapshot(f, store);
        f.changeMetadata(drawing, { 'excalidraw-plugin': true });
        vi.advanceTimersByTime(100);
        expect(f.getFileCache).toHaveBeenCalledExactlyOnceWith(drawing);
        expectFullSnapshot(f, store);
        listener.mockClear();
        for (let i = 0; i < 1000; i++) f.changeMetadata(drawing, { 'excalidraw-plugin': 'parsed', title: `Title ${i}` });
        expect(vi.getTimerCount()).toBe(0);
        expect(f.getFileCache).not.toHaveBeenCalled();
        expect(f.getFiles).not.toHaveBeenCalled();
        expect(listener).not.toHaveBeenCalled();
        stop();
    });
    it('matches a full snapshot after repeated mixed mutation batches', () => {
        const f = fixture(Array.from({ length: 200 }, (_, i) => `note-${i}.md`));
        const { store, listener, stop } = start(f);
        for (let batch = 0; batch < 12; batch++) {
            const file = f.files[batch];
            f.rename(file, `renamed-${batch}.${batch % 2 ? 'canvas' : 'md'}`);
            const added = f.add(`added-${batch}.md`);
            f.changeMetadata(added, { 'excalidraw-plugin': batch % 2 === 0 });
            f.changeMetadata(f.files[100 + batch], { 'excalidraw-plugin': batch % 3 === 0 });
            f.remove(f.files[f.files.length - 3]);
            listener.mockClear();
            vi.advanceTimersByTime(100);
            expect(f.getFiles).not.toHaveBeenCalled();
            expect(f.getFileCache.mock.calls.length).toBeLessThanOrEqual(3);
            expect(listener).toHaveBeenCalledOnce();
            expectFullSnapshot(f, store);
        }
        stop();
    });
});
