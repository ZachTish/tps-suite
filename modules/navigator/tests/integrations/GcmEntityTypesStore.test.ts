import { App, TFile, type CachedMetadata } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import {
    TPS_FILES_UPDATED_EVENT,
    TPS_GCM_API_CHANGED_EVENT,
    TPS_GCM_API_REQUEST_EVENT,
    TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID
} from '../../src/constants/tpsIdentity';
import type { GcmEntityIndexApiLike, GcmEntityIndexRecordLike } from '../../src/integrations/gcm/GcmEntityTypeIndex';
import type { GcmTaskApiLike, GcmTaskRecordLike } from '../../src/integrations/gcm/gcmTaskApi';
import { GcmEntityTypesStore } from '../../src/integrations/gcm/useGcmEntityTypes';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

interface Deferred<T> {
    promise: Promise<T>;
    resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(resolver => {
        resolve = resolver;
    });
    return { promise, resolve };
}

describe('GcmEntityTypesStore', () => {
    it('keeps file-backed Types ready when the optional GCM line index is unavailable', async () => {
        const app = new App();
        const files = [new TFile('Notes/Alpha.md'), new TFile('Data/Projects.base')];
        const testVault = app.vault as unknown as { registerFile(file: TFile): void; getFiles(): TFile[]; getMarkdownFiles(): TFile[] };
        files.forEach(file => testVault.registerFile(file));
        testVault.getFiles = () => files;
        testVault.getMarkdownFiles = () => files.filter(file => file.extension === 'md');
        const store = new GcmEntityTypesStore(app);

        const unsubscribe = store.subscribe(vi.fn());
        await vi.waitFor(() => expect(store.getSnapshot().lineAvailability).toBe('unavailable'));

        expect(store.getSnapshot()).toMatchObject({
            availability: 'ready',
            lineAvailability: 'unavailable',
            markdownAvailability: 'ready'
        });
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.NOTES)).toHaveLength(1);
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.BASES)).toHaveLength(1);
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)).toHaveLength(0);
        expect(store.getSnapshot().descriptors.map(descriptor => descriptor.id)).toEqual([
            TPS_NAVIGATOR_TYPE_IDS.NOTES,
            TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            TPS_NAVIGATOR_TYPE_IDS.BULLETS,
            TPS_NAVIGATOR_TYPE_IDS.HEADINGS,
            TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS,
            TPS_NAVIGATOR_TYPE_IDS.CALLOUTS,
            TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES,
            TPS_NAVIGATOR_TYPE_IDS.TABLES,
            TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS,
            TPS_NAVIGATOR_TYPE_IDS.BASES,
            TPS_NAVIGATOR_TYPE_IDS.CANVAS,
            TPS_NAVIGATOR_TYPE_IDS.DRAWINGS,
            TPS_NAVIGATOR_TYPE_IDS.PDFS,
            TPS_NAVIGATOR_TYPE_IDS.IMAGES,
            TPS_NAVIGATOR_TYPE_IDS.AUDIO,
            TPS_NAVIGATOR_TYPE_IDS.VIDEO
        ]);
        unsubscribe();
    });

    it('publishes file Types immediately while line and Web-link sources load independently', async () => {
        const app = new App();
        const file = new TFile('Notes/Startup.md');
        (app.vault as unknown as { registerFile(file: TFile): void }).registerFile(file);
        const bodyRead = deferred<string>();
        const cachedRead = vi.fn(() => bodyRead.promise);
        Object.assign(app.vault, {
            getFiles: () => [file],
            getMarkdownFiles: () => [file],
            cachedRead
        });
        Object.assign(app.metadataCache, { getFileCache: () => ({}) });

        const lineQuery = deferred<readonly unknown[]>();
        const queryAsync = vi.fn(() => lineQuery.promise);
        const entityApi = {
            version: 3,
            queryAsync,
            ensureReady: vi.fn(async () => undefined),
            getByLocator: vi.fn(() => null),
            getDimensionValues: vi.fn(() => []),
            getRevision: vi.fn(() => 1),
            onChanged: vi.fn(() => () => undefined),
            registerDimension: vi.fn(() => () => undefined)
        } as GcmEntityIndexApiLike;
        const changedPayload = {
            source: 'tps-global-context-menu',
            sourcePluginId: 'tps-global-context-menu',
            available: true,
            api: { entityIndex: entityApi },
            entityIndexVersion: 3
        };
        type Listener = (payload: unknown) => void;
        const listeners = new Map<string, Set<Listener>>();
        Object.assign(app, {
            workspace: {
                on: vi.fn((name: string, callback: Listener) => {
                    const eventListeners = listeners.get(name) ?? new Set<Listener>();
                    eventListeners.add(callback);
                    listeners.set(name, eventListeners);
                    return { name, callback };
                }),
                offref: vi.fn(),
                trigger: vi.fn((name: string, payload: unknown) => {
                    if (name === TPS_GCM_API_REQUEST_EVENT) {
                        listeners.get(TPS_GCM_API_CHANGED_EVENT)?.forEach(listener => listener(changedPayload));
                    }
                })
            }
        });

        const store = new GcmEntityTypesStore(app);
        const unsubscribe = store.subscribe(vi.fn());
        await vi.waitFor(() => expect(cachedRead).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(queryAsync).toHaveBeenCalledOnce());

        expect(store.getSnapshot()).toMatchObject({
            availability: 'ready',
            lineAvailability: 'loading',
            markdownAvailability: 'loading'
        });
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.NOTES)).toHaveLength(1);

        lineQuery.resolve([]);
        await vi.waitFor(() => expect(store.getSnapshot().lineAvailability).toBe('ready'));
        expect(store.getSnapshot().markdownAvailability).toBe('loading');

        bodyRead.resolve('[Site](https://example.com/startup)');
        await vi.waitFor(() => expect(store.getSnapshot().markdownAvailability).toBe('ready'));
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)?.[0]?.label).toBe('Site');

        unsubscribe();
    });

    it('clears built-in snapshots and ignores an outstanding Markdown rebuild while disabled', async () => {
        const app = new App();
        const file = new TFile('Notes/Pause.md');
        (app.vault as unknown as { registerFile(file: TFile): void }).registerFile(file);
        const staleBodyRead = deferred<string>();
        const cachedRead = vi
            .fn<(file: TFile) => Promise<string>>()
            .mockImplementationOnce(() => staleBodyRead.promise)
            .mockResolvedValueOnce('[Fresh](https://fresh.example/after-reenable)');
        Object.assign(app.vault, {
            getFiles: () => [file],
            getMarkdownFiles: () => [file],
            cachedRead
        });
        Object.assign(app.metadataCache, { getFileCache: () => ({}) });
        const store = new GcmEntityTypesStore(app);
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);

        await vi.waitFor(() => expect(cachedRead).toHaveBeenCalledOnce());
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.NOTES)).toHaveLength(1);

        store.setEnabled(false);
        const disabledSnapshot = store.getSnapshot();
        expect(disabledSnapshot).toMatchObject({
            availability: 'unavailable',
            descriptors: [],
            message: 'Types navigation is disabled.'
        });
        expect(disabledSnapshot.recordsByType.size).toBe(0);

        staleBodyRead.resolve('[Stale](https://stale.example/before-disable)');
        await Promise.resolve();
        await Promise.resolve();
        expect(store.getSnapshot()).toBe(disabledSnapshot);

        store.setEnabled(true);
        await vi.waitFor(() => expect(cachedRead).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(store.getSnapshot().markdownAvailability).toBe('ready'));
        expect(
            store
                .getSnapshot()
                .recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)
                ?.map(record => record.searchText)
        ).toEqual(['https://fresh.example']);

        unsubscribe();
    });

    it('uses the public request/change handshake and coalesces revision bursts to one follow-up load', async () => {
        const app = new App();
        const firstQuery = deferred<readonly unknown[]>();
        let revision = 1;
        let revisionListener: ((nextRevision: number) => void) | null = null;
        const unregisterDimension = vi.fn();
        const unsubscribeRevision = vi.fn();
        const queryAsync = vi
            .fn<(query?: unknown) => Promise<readonly unknown[]>>()
            .mockImplementationOnce(() => firstQuery.promise)
            .mockResolvedValue([]);
        const api = {
            version: 3,
            queryAsync,
            ensureReady: vi.fn(async () => {}),
            getByLocator: vi.fn(() => null),
            getDimensionValues: vi.fn(() => []),
            getRevision: vi.fn(() => revision),
            onChanged: vi.fn((listener: (nextRevision: number) => void) => {
                revisionListener = listener;
                return unsubscribeRevision;
            }),
            registerDimension: vi.fn(() => unregisterDimension)
        } as GcmEntityIndexApiLike;
        const changedPayload = {
            source: 'tps-global-context-menu',
            sourcePluginId: 'tps-global-context-menu',
            available: true,
            api: { entityIndex: api },
            entityIndexVersion: 3
        };

        type Listener = (payload: unknown) => void;
        const listeners = new Map<string, Set<Listener>>();
        const requestPayloads: unknown[] = [];
        const workspace = {
            on: vi.fn((name: string, callback: Listener) => {
                const eventListeners = listeners.get(name) ?? new Set<Listener>();
                eventListeners.add(callback);
                listeners.set(name, eventListeners);
                return { name, callback };
            }),
            offref: vi.fn((ref: { name: string; callback: Listener }) => {
                listeners.get(ref.name)?.delete(ref.callback);
            }),
            trigger: vi.fn((name: string, payload: unknown) => {
                if (name === TPS_GCM_API_REQUEST_EVENT) {
                    requestPayloads.push(payload);
                    listeners.get(TPS_GCM_API_CHANGED_EVENT)?.forEach(listener => listener(changedPayload));
                    return;
                }
                listeners.get(name)?.forEach(listener => listener(payload));
            })
        };
        Object.assign(app, { workspace });

        const store = new GcmEntityTypesStore(app);
        const subscriber = vi.fn();
        const unsubscribe = store.subscribe(subscriber);

        await vi.waitFor(() => expect(queryAsync).toHaveBeenCalledOnce());
        expect(requestPayloads).toEqual([
            expect.objectContaining({
                sourcePluginId: TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID,
                requester: TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID
            })
        ]);

        revision = 2;
        revisionListener?.(2);
        revision = 3;
        revisionListener?.(3);
        revision = 4;
        revisionListener?.(4);
        firstQuery.resolve([]);

        await vi.waitFor(() => expect(queryAsync).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({ availability: 'ready', lineAvailability: 'ready' }));
        expect(queryAsync).toHaveBeenCalledTimes(2);
        expect(subscriber.mock.calls.length).toBeGreaterThanOrEqual(2);

        // Task-only GCM mutations can leave the entity-index revision unchanged.
        const beforeTaskRefresh = subscriber.mock.calls.length;
        workspace.trigger(TPS_FILES_UPDATED_EVENT, { paths: [] });
        await vi.waitFor(() => expect(queryAsync).toHaveBeenCalledTimes(3));
        await vi.waitFor(() => expect(subscriber.mock.calls.length).toBeGreaterThan(beforeTaskRefresh));
        expect(store.getSnapshot()).toMatchObject({ availability: 'ready', lineAvailability: 'ready' });

        const staleQuery = deferred<readonly unknown[]>();
        queryAsync.mockImplementationOnce(() => staleQuery.promise);
        revision = 5;
        revisionListener?.(5);
        await vi.waitFor(() => expect(queryAsync).toHaveBeenCalledTimes(4));

        workspace.trigger(TPS_GCM_API_CHANGED_EVENT, {
            ...changedPayload,
            available: false,
            api: null,
            entityIndexVersion: null
        });
        await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({ availability: 'ready', lineAvailability: 'unavailable' }));

        const replacementUnregister = vi.fn();
        const replacementUnsubscribe = vi.fn();
        const replacementApi = {
            ...api,
            queryAsync: vi.fn(async () => []),
            getRevision: vi.fn(() => 6),
            onChanged: vi.fn(() => replacementUnsubscribe),
            registerDimension: vi.fn(() => replacementUnregister)
        } as GcmEntityIndexApiLike;
        workspace.trigger(TPS_GCM_API_CHANGED_EVENT, {
            ...changedPayload,
            available: true,
            api: { entityIndex: replacementApi },
            entityIndexVersion: 3
        });
        await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({ availability: 'ready', lineAvailability: 'ready' }));
        const replacementRevision = store.getSnapshot().revision;
        const replacementSubscriberCount = subscriber.mock.calls.length;

        staleQuery.resolve([]);
        await Promise.resolve();
        await Promise.resolve();
        expect(store.getSnapshot()).toMatchObject({ availability: 'ready', lineAvailability: 'ready', revision: replacementRevision });
        expect(subscriber).toHaveBeenCalledTimes(replacementSubscriberCount);

        unsubscribe();
        expect(workspace.offref).toHaveBeenCalledTimes(2);
        expect(unsubscribeRevision).toHaveBeenCalledOnce();
        expect(unregisterDimension).not.toHaveBeenCalled();
        expect(replacementUnsubscribe).toHaveBeenCalledOnce();
        expect(replacementUnregister).not.toHaveBeenCalled();
    });

    it('retries a failed task hydration path after GCM or manual vault file updates', async () => {
        const app = new App();
        const file = new TFile('Tasks/Retry.md');
        (app.vault as unknown as { registerFile(file: TFile): void }).registerFile(file);
        const files = [file];
        const getFiles = vi.fn(() => files);
        (app.vault as unknown as { getFiles(): TFile[] }).getFiles = getFiles;
        (app.vault as unknown as { getMarkdownFiles(): TFile[] }).getMarkdownFiles = () => files;
        const entity: GcmEntityIndexRecordLike = {
            id: 'retry-task',
            path: file.path,
            name: 'Retry task',
            displayName: 'Retry task',
            basename: file.basename,
            dimensions: { kind: ['task'] },
            sourcePath: file.path,
            entityType: 'block',
            subpath: '#^retry-task',
            blockId: 'retry-task',
            lineKind: 'task',
            lineNumber: 1,
            referenceState: 'ready',
            locatorKey: 'block:retry-task',
            referenceTarget: `[[${file.path}#^retry-task]]`
        };
        let currentTask: GcmTaskRecordLike = {
            id: `${file.path}:1`,
            path: file.path,
            lineNumber: 0,
            rawLine: '- [ ] Retry task',
            title: 'Retry task',
            checkbox: '[ ]',
            marker: ' ',
            status: 'todo',
            isComplete: false,
            tags: []
        };
        let failHydration = true;
        const list = vi.fn(async () => {
            if (failHydration) {
                failHydration = false;
                throw new Error('temporary read failure');
            }
            return [currentTask];
        });
        const tasks: GcmTaskApiLike = { version: 1, list, focus: vi.fn(async () => true) };
        const queryAsync = vi.fn(async () => [entity]);
        const entityApi = {
            version: 3,
            queryAsync,
            ensureReady: vi.fn(async () => undefined),
            getByLocator: vi.fn(() => entity),
            getDimensionValues: vi.fn(() => []),
            getRevision: vi.fn(() => 1),
            onChanged: vi.fn(() => () => undefined),
            registerDimension: vi.fn(() => () => undefined)
        } as GcmEntityIndexApiLike;
        const changedPayload = {
            source: 'tps-global-context-menu',
            sourcePluginId: 'tps-global-context-menu',
            available: true,
            api: { entityIndex: entityApi, tasks },
            entityIndexVersion: 3
        };

        type Listener = (...args: unknown[]) => void;
        const workspaceListeners = new Map<string, Set<Listener>>();
        const workspace = {
            on: vi.fn((name: string, callback: Listener) => {
                const eventListeners = workspaceListeners.get(name) ?? new Set<Listener>();
                eventListeners.add(callback);
                workspaceListeners.set(name, eventListeners);
                return { name, callback };
            }),
            offref: vi.fn((ref: { name: string; callback: Listener }) => {
                workspaceListeners.get(ref.name)?.delete(ref.callback);
            }),
            trigger: vi.fn((name: string, payload: unknown) => {
                if (name === TPS_GCM_API_REQUEST_EVENT) {
                    workspaceListeners.get(TPS_GCM_API_CHANGED_EVENT)?.forEach(listener => listener(changedPayload));
                    return;
                }
                workspaceListeners.get(name)?.forEach(listener => listener(payload));
            })
        };
        Object.assign(app, { workspace });

        const vaultListeners = new Map<string, Set<Listener>>();
        const vaultEvents = {
            on: vi.fn((name: string, callback: Listener) => {
                const eventListeners = vaultListeners.get(name) ?? new Set<Listener>();
                eventListeners.add(callback);
                vaultListeners.set(name, eventListeners);
                return { name, callback };
            }),
            offref: vi.fn((ref: { name: string; callback: Listener }) => {
                vaultListeners.get(ref.name)?.delete(ref.callback);
            }),
            trigger(name: string, ...args: unknown[]) {
                vaultListeners.get(name)?.forEach(listener => listener(...args));
            }
        };
        Object.assign(app.vault, vaultEvents);

        const metadataListeners = new Map<string, Set<Listener>>();
        let isDrawing = false;
        const metadataEvents = {
            getFileCache: vi.fn(() => (isDrawing ? { frontmatter: { 'excalidraw-plugin': 'parsed' } } : null)),
            on: vi.fn((name: string, callback: Listener) => {
                const eventListeners = metadataListeners.get(name) ?? new Set<Listener>();
                eventListeners.add(callback);
                metadataListeners.set(name, eventListeners);
                return { name, callback };
            }),
            offref: vi.fn((ref: { name: string; callback: Listener }) => {
                metadataListeners.get(ref.name)?.delete(ref.callback);
            }),
            trigger(name: string, ...args: unknown[]) {
                metadataListeners.get(name)?.forEach(listener => listener(...args));
            }
        };
        Object.assign(app.metadataCache, metadataEvents);

        const store = new GcmEntityTypesStore(app);
        const unsubscribe = store.subscribe(vi.fn());
        await vi.waitFor(() => expect(list).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(store.getSnapshot().availability).toBe('ready'));
        expect(getFiles).toHaveBeenCalledOnce();
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0]?.task).toBeUndefined();

        workspace.trigger(TPS_FILES_UPDATED_EVENT, { paths: [file.path] });
        await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2));
        await vi.waitFor(() =>
            expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0]?.task?.isComplete).toBe(false)
        );
        expect(getFiles).toHaveBeenCalledOnce();

        currentTask = { ...currentTask, rawLine: '- [x] Retry task', checkbox: '[x]', marker: 'x', isComplete: true };
        file.stat.mtime += 1;
        vaultEvents.trigger('modify', file);
        await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(3));
        await vi.waitFor(() =>
            expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0]?.task?.isComplete).toBe(true)
        );
        expect(getFiles).toHaveBeenCalledOnce();

        const queriesBeforeMetadataChange = queryAsync.mock.calls.length;
        metadataEvents.trigger('changed', file);
        await Promise.resolve();
        expect(getFiles).toHaveBeenCalledOnce();
        expect(queryAsync).toHaveBeenCalledTimes(queriesBeforeMetadataChange);

        isDrawing = true;
        metadataEvents.trigger('changed', file);
        await vi.waitFor(() => expect(getFiles).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.DRAWINGS)).toHaveLength(1));
        expect(queryAsync).toHaveBeenCalledTimes(queriesBeforeMetadataChange);

        const base = new TFile('Data/New.base');
        files.push(base);
        const queriesBeforeBaseCreate = queryAsync.mock.calls.length;
        vaultEvents.trigger('create', base);
        await vi.waitFor(() => expect(getFiles).toHaveBeenCalledTimes(3));
        await vi.waitFor(() => expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.BASES)).toHaveLength(1));
        expect(queryAsync).toHaveBeenCalledTimes(queriesBeforeBaseCreate);

        unsubscribe();
        expect(vaultEvents.offref).toHaveBeenCalledTimes(4);
        expect(metadataEvents.offref).toHaveBeenCalledTimes(2);
    });

    it('updates local Markdown structures path-wise and treats resolved as a one-shot rebuild barrier', async () => {
        const app = new App();
        const file = new TFile('Notes/Structures.md');
        const files = [file];
        const caches = new Map<string, CachedMetadata>([
            [
                file.path,
                {
                    sections: [
                        {
                            type: 'code',
                            position: {
                                start: { line: 2, col: 0, offset: 20 },
                                end: { line: 5, col: 3, offset: 53 }
                            }
                        }
                    ]
                }
            ]
        ]);
        const getFiles = vi.fn(() => files);
        const getMarkdownFiles = vi.fn(() => files);
        let markdownBody = '[Initial site](https://initial.example/path)';
        const cachedRead = vi.fn(async () => markdownBody);
        Object.assign(app.vault, { getFiles, getMarkdownFiles, cachedRead });
        (app.vault as unknown as { registerFile(file: TFile): void }).registerFile(file);

        type Listener = (...args: unknown[]) => void;
        const vaultListeners = new Map<string, Set<Listener>>();
        const vaultEvents = {
            on: vi.fn((name: string, callback: Listener) => {
                const listeners = vaultListeners.get(name) ?? new Set<Listener>();
                listeners.add(callback);
                vaultListeners.set(name, listeners);
                return { name, callback };
            }),
            offref: vi.fn((ref: { name: string; callback: Listener }) => vaultListeners.get(ref.name)?.delete(ref.callback)),
            trigger(name: string, ...args: unknown[]) {
                vaultListeners.get(name)?.forEach(listener => listener(...args));
            }
        };
        Object.assign(app.vault, vaultEvents);

        const metadataListeners = new Map<string, Set<Listener>>();
        const metadataEvents = {
            getFileCache: vi.fn((target: TFile) => caches.get(target.path) ?? null),
            on: vi.fn((name: string, callback: Listener) => {
                const listeners = metadataListeners.get(name) ?? new Set<Listener>();
                listeners.add(callback);
                metadataListeners.set(name, listeners);
                return { name, callback };
            }),
            offref: vi.fn((ref: { name: string; callback: Listener }) => metadataListeners.get(ref.name)?.delete(ref.callback)),
            trigger(name: string, ...args: unknown[]) {
                metadataListeners.get(name)?.forEach(listener => listener(...args));
            }
        };
        Object.assign(app.metadataCache, metadataEvents);

        const store = new GcmEntityTypesStore(app);
        const unsubscribe = store.subscribe(vi.fn());
        await vi.waitFor(() => expect(store.getSnapshot().markdownAvailability).toBe('ready'));
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS)).toHaveLength(1);
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)?.[0]?.label).toBe('Initial site');
        expect(getMarkdownFiles).toHaveBeenCalledOnce();
        expect(cachedRead).toHaveBeenCalledOnce();

        const tableCache: CachedMetadata = {
            sections: [
                {
                    type: 'table',
                    position: {
                        start: { line: 8, col: 0, offset: 80 },
                        end: { line: 10, col: 4, offset: 104 }
                    }
                }
            ]
        };
        caches.set(file.path, tableCache);
        markdownBody = '[Current site](https://current.example/path)';
        metadataEvents.trigger('changed', file, markdownBody, tableCache);
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS)).toHaveLength(0);
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.TABLES)).toHaveLength(1);
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)?.[0]?.label).toBe('Current site');
        expect(getMarkdownFiles).toHaveBeenCalledOnce();

        // Some Obsidian versions or synthetic callers do not provide a string
        // body with the metadata event. Refresh sections but retain the last
        // known links instead of erasing them.
        metadataEvents.trigger('changed', file, undefined, tableCache);
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.TABLES)).toHaveLength(1);
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)?.[0]?.label).toBe('Current site');

        const revisionBeforeResolved = store.getSnapshot().revision;
        metadataEvents.trigger('resolved');
        await vi.waitFor(() => expect(getMarkdownFiles).toHaveBeenCalledTimes(2));
        await vi.waitFor(() => expect(store.getSnapshot().revision).toBeGreaterThan(revisionBeforeResolved));
        expect(cachedRead).toHaveBeenCalledOnce();
        metadataEvents.trigger('resolved');
        await Promise.resolve();
        expect(getMarkdownFiles).toHaveBeenCalledTimes(2);

        const oldPath = file.path;
        (file as TFile & { setPath(path: string): void }).setPath('Notes/Renamed.md');
        caches.delete(oldPath);
        caches.set(file.path, tableCache);
        vaultEvents.trigger('rename', file, oldPath);
        await vi.waitFor(() =>
            expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.TABLES)?.[0]?.sourcePath).toBe(file.path)
        );
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)?.[0]).toMatchObject({
            label: 'Current site',
            sourcePath: file.path
        });

        files.splice(0, 1);
        vaultEvents.trigger('delete', file);
        await vi.waitFor(() => expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.TABLES)).toHaveLength(0));
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)).toHaveLength(0);

        unsubscribe();
        expect(metadataEvents.offref).toHaveBeenCalledTimes(2);
    });

    it('does not roll back a Markdown metadata update when an older GCM line refresh finishes later', async () => {
        const app = new App();
        const file = new TFile('Notes/Concurrent structures.md');
        const files = [file];
        let cache: CachedMetadata = {
            sections: [
                {
                    type: 'code',
                    position: {
                        start: { line: 2, col: 0, offset: 20 },
                        end: { line: 5, col: 3, offset: 53 }
                    }
                }
            ]
        };
        Object.assign(app.vault, {
            getFiles: () => files,
            getMarkdownFiles: () => files
        });
        (app.vault as unknown as { registerFile(file: TFile): void }).registerFile(file);

        type Listener = (...args: unknown[]) => void;
        const metadataListeners = new Map<string, Set<Listener>>();
        const metadataEvents = {
            getFileCache: vi.fn(() => cache),
            on: vi.fn((name: string, callback: Listener) => {
                const listeners = metadataListeners.get(name) ?? new Set<Listener>();
                listeners.add(callback);
                metadataListeners.set(name, listeners);
                return { name, callback };
            }),
            offref: vi.fn((ref: { name: string; callback: Listener }) => metadataListeners.get(ref.name)?.delete(ref.callback)),
            trigger(name: string, ...args: unknown[]) {
                metadataListeners.get(name)?.forEach(listener => listener(...args));
            }
        };
        Object.assign(app.metadataCache, metadataEvents);

        const lineQuery = deferred<readonly unknown[]>();
        const queryAsync = vi.fn(() => lineQuery.promise);
        const entityApi = {
            version: 3,
            queryAsync,
            ensureReady: vi.fn(async () => undefined),
            getByLocator: vi.fn(() => null),
            getDimensionValues: vi.fn(() => []),
            getRevision: vi.fn(() => 1),
            onChanged: vi.fn(() => () => undefined),
            registerDimension: vi.fn(() => () => undefined)
        } as GcmEntityIndexApiLike;
        const changedPayload = {
            source: 'tps-global-context-menu',
            sourcePluginId: 'tps-global-context-menu',
            available: true,
            api: { entityIndex: entityApi },
            entityIndexVersion: 3
        };
        const workspaceListeners = new Map<string, Set<Listener>>();
        const workspace = {
            on: vi.fn((name: string, callback: Listener) => {
                const listeners = workspaceListeners.get(name) ?? new Set<Listener>();
                listeners.add(callback);
                workspaceListeners.set(name, listeners);
                return { name, callback };
            }),
            offref: vi.fn((ref: { name: string; callback: Listener }) => workspaceListeners.get(ref.name)?.delete(ref.callback)),
            trigger: vi.fn((name: string, payload: unknown) => {
                if (name === TPS_GCM_API_REQUEST_EVENT) {
                    workspaceListeners.get(TPS_GCM_API_CHANGED_EVENT)?.forEach(listener => listener(changedPayload));
                    return;
                }
                workspaceListeners.get(name)?.forEach(listener => listener(payload));
            })
        };
        Object.assign(app, { workspace });

        const store = new GcmEntityTypesStore(app);
        const unsubscribe = store.subscribe(vi.fn());
        await vi.waitFor(() => expect(queryAsync).toHaveBeenCalledOnce());
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS)).toHaveLength(1);

        cache = {
            sections: [
                {
                    type: 'table',
                    position: {
                        start: { line: 8, col: 0, offset: 80 },
                        end: { line: 10, col: 4, offset: 104 }
                    }
                }
            ]
        };
        metadataEvents.trigger('changed', file, '', cache);
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS)).toHaveLength(0);
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.TABLES)).toHaveLength(1);

        lineQuery.resolve([]);
        await vi.waitFor(() => expect(store.getSnapshot().lineAvailability).toBe('ready'));
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS)).toHaveLength(0);
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.TABLES)).toHaveLength(1);

        unsubscribe();
    });

    it('survives an initial vault catalog failure and retries cleanly on the next subscription', async () => {
        const app = new App();
        const file = new TFile('Notes/Recovered.md');
        const getFiles = vi
            .fn<() => TFile[]>()
            .mockImplementationOnce(() => {
                throw new Error('temporary vault failure');
            })
            .mockReturnValue([file]);
        (app.vault as unknown as { getFiles(): TFile[] }).getFiles = getFiles;
        (app.vault as unknown as { getMarkdownFiles(): TFile[] }).getMarkdownFiles = () => [file];
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const store = new GcmEntityTypesStore(app);

        const unsubscribeFirst = store.subscribe(vi.fn());
        await vi.waitFor(() => expect(store.getSnapshot().availability).toBe('error'));
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.NOTES)).toHaveLength(0);
        expect(consoleSpy.mock.calls[0]?.[0]).toBe('[TPS Notebook Navigator] Vault file Types refresh failed');
        const warningContext: unknown = consoleSpy.mock.calls[0]?.[1];
        expect((warningContext as { error?: unknown }).error).toBeInstanceOf(Error);
        unsubscribeFirst();

        const unsubscribeSecond = store.subscribe(vi.fn());
        await vi.waitFor(() => expect(store.getSnapshot().availability).toBe('ready'));
        expect(store.getSnapshot().recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.NOTES)).toHaveLength(1);
        expect(getFiles).toHaveBeenCalledTimes(2);
        unsubscribeSecond();
    });
});
