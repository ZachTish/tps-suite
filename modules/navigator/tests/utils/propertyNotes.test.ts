import { App, TFile, TFolder, type EventRef } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import {
    getPropertyNote,
    getPropertyNoteIndexStore,
    resolvePropertyNoteFromIndex,
    revealPropertyNoteInNavigator
} from '../../src/utils/propertyNotes';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';
import { createTestTFile } from './createTestTFile';

function harness() {
    const app = new App();
    const files: TFile[] = [];
    const listeners = new Map<EventRef, { name: string; callback: (...args: unknown[]) => void }>();
    const scan = vi.fn(() => files);
    app.vault.getMarkdownFiles = scan;
    Object.assign(app.vault, {
        on: (name: string, callback: (...args: unknown[]) => void) => {
            const ref = {} as EventRef;
            listeners.set(ref, { name, callback });
            return ref;
        },
        offref: (ref: EventRef) => listeners.delete(ref)
    });
    const emit = (name: string, ...args: unknown[]) =>
        listeners.forEach(event => {
            if (event.name === name) event.callback(...args);
        });
    const add = (path: string) => {
        const file = createTestTFile(path);
        files.push(file);
        emit('create', file);
        return file;
    };
    return { app, files, listeners, scan, emit, add, store: getPropertyNoteIndexStore(app) };
}

describe('property note filename convention', () => {
    it('links keys and scalar/list value labels anywhere in the vault without frontmatter', () => {
        const h = harness();
        const status = h.add('Reference/Status.md');
        const xyz = h.add('Projects/XyZ.md');
        const spaced = h.add('Hidden/My project.md');
        expect(getPropertyNote(h.app, buildPropertyKeyNodeId('status'))).toBe(status);
        expect(getPropertyNote(h.app, buildPropertyValueNodeId('project', 'xyz'))).toBe(xyz);
        expect(getPropertyNote(h.app, buildPropertyValueNodeId('another-key', 'my project'))).toBe(spaced);
        expect(getPropertyNote(h.app, buildPropertyValueNodeId('status', 'missing'))).toBeNull();
    });

    it('fails closed for duplicates, virtual roots, invalid ids, and partial names', () => {
        const h = harness();
        h.add('A/xyz.md');
        h.add('B/XYZ.md');
        expect(getPropertyNote(h.app, buildPropertyValueNodeId('project', 'xyz'))).toBeNull();
        expect(getPropertyNote(h.app, 'properties-root')).toBeNull();
        expect(getPropertyNote(h.app, 'invalid')).toBeNull();
        expect(getPropertyNote(h.app, buildPropertyValueNodeId('project', 'xy'))).toBeNull();
        expect(getPropertyNote(h.app, buildPropertyValueNodeId('project', 'parent/xyz'))).toBeNull();
    });

    it('keeps the selected property scope when opening a note that lacks the property', () => {
        const dispatch = vi.fn();
        const file = createTestTFile('status.md');
        const nodeId = buildPropertyKeyNodeId('status');
        revealPropertyNoteInNavigator(dispatch, file, nodeId);
        expect(dispatch).toHaveBeenCalledWith({ type: 'REVEAL_FILE', file, targetProperty: nodeId, source: 'manual' });
        revealPropertyNoteInNavigator(dispatch, file, 'properties-root');
        expect(dispatch).toHaveBeenCalledTimes(1);
    });
});

describe('property note index lifecycle', () => {
    it('shares one index, updates create/rename/delete, and removes all subscriptions', () => {
        const h = harness();
        expect(getPropertyNoteIndexStore(h.app)).toBe(h.store);
        expect(getPropertyNoteIndexStore(new App())).not.toBe(h.store);
        const changed = vi.fn();
        const unsubscribe = h.store.subscribe(changed);
        const second = h.store.subscribe(vi.fn());
        h.store.getIndex();
        h.scan.mockClear();
        const file = h.add('Inbox/xyz.md');
        const xyz = buildPropertyValueNodeId('project', 'xyz');
        expect(h.store.resolve(xyz)).toBe(file);
        for (let i = 0; i < 100; i++) expect(resolvePropertyNoteFromIndex(h.store.getIndex(), xyz)).toBe(file);
        const oldPath = file.path;
        (file as TFile & { setPath: (path: string) => void }).setPath('Inbox/renamed.md');
        h.emit('rename', file, oldPath);
        expect(h.store.resolve(xyz)).toBeNull();
        expect(h.store.resolve(buildPropertyValueNodeId('project', 'renamed'))).toBe(file);
        h.files.splice(0, 1);
        h.emit('delete', file);
        expect(h.store.resolve(buildPropertyValueNodeId('project', 'renamed'))).toBeNull();
        expect(h.scan).not.toHaveBeenCalled();
        unsubscribe();
        expect(h.listeners.size).toBe(3);
        second();
        expect(h.listeners.size).toBe(0);
        const createdWhileUnmounted = h.add('xyz.md');
        expect(h.store.resolve(xyz)).toBe(createdWhileUnmounted);
    });

    it('clears ambiguous matches after deletion and rescans once after a folder rename', () => {
        const h = harness();
        const stop = h.store.subscribe(vi.fn());
        const first = h.add('A/status.md');
        const duplicate = h.add('B/Status.md');
        const key = buildPropertyKeyNodeId('status');
        expect(h.store.resolve(key)).toBeNull();
        h.files.splice(1, 1);
        h.emit('delete', duplicate);
        expect(h.store.resolve(key)).toBe(first);
        h.scan.mockClear();
        h.emit('rename', new TFolder('Moved'), 'A');
        expect(h.store.resolve(key)).toBe(first);
        h.store.getIndex();
        expect(h.scan).toHaveBeenCalledTimes(1);
        stop();
    });

    it('removes a file renamed to a non-Markdown extension', () => {
        const h = harness();
        const stop = h.store.subscribe(vi.fn());
        const file = h.add('status.md');
        const key = buildPropertyKeyNodeId('status');
        expect(h.store.resolve(key)).toBe(file);
        (file as TFile & { setPath: (path: string) => void }).setPath('status.canvas');
        h.files.splice(0, 1);
        h.emit('rename', file, 'status.md');
        expect(h.store.resolve(key)).toBeNull();
        stop();
    });
});
