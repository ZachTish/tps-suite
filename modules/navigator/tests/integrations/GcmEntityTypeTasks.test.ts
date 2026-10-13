import { App, TFile, type MenuItem } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../src/constants/tpsIdentity';
import {
    GCM_ENTITY_INDEX_API_VERSION,
    GCM_TYPE_TASK_CACHE_MAX_PATHS,
    GCM_TYPE_TASK_QUERY_PATHS_PER_BATCH,
    GcmEntityTypeIndexAdapter,
    type GcmEntityIndexApiLike,
    type GcmEntityIndexRecordLike
} from '../../src/integrations/gcm/GcmEntityTypeIndex';
import {
    isGcmTaskRecord,
    type GcmTaskApiLike,
    type GcmTaskCheckboxesApiLike,
    type GcmTaskLinesApiLike,
    type GcmTaskRecordLike
} from '../../src/integrations/gcm/gcmTaskApi';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

function taskEntity(overrides: Partial<GcmEntityIndexRecordLike> = {}): GcmEntityIndexRecordLike {
    return {
        id: 'task-one',
        path: 'Tasks/Today.md',
        name: 'Ship it',
        displayName: 'Ship it',
        basename: 'Today',
        dimensions: { kind: ['project'] },
        sourcePath: 'Tasks/Today.md',
        entityType: 'block',
        subpath: '#^task-one',
        blockId: 'task-one',
        lineKind: 'task',
        lineNumber: 3,
        referenceState: 'ready',
        locatorKey: 'block:task-one',
        referenceTarget: '[[Tasks/Today#^task-one]]',
        ...overrides
    };
}

function taskRecord(overrides: Partial<GcmTaskRecordLike> = {}): GcmTaskRecordLike {
    return {
        id: 'Tasks/Today.md:3',
        path: 'Tasks/Today.md',
        lineNumber: 2,
        rawLine: '- [ ] Ship it',
        title: 'Ship it',
        checkbox: '[ ]',
        marker: ' ',
        status: 'todo',
        isComplete: false,
        tags: ['project'],
        ...overrides
    };
}

function createEntityApi(record: GcmEntityIndexRecordLike) {
    let current: GcmEntityIndexRecordLike | null = record;
    const unsubscribe = vi.fn();
    const api: GcmEntityIndexApiLike = {
        version: GCM_ENTITY_INDEX_API_VERSION,
        queryAsync: vi.fn(async () => [record]),
        ensureReady: vi.fn(async () => undefined),
        getByLocator: vi.fn(() => current),
        getRevision: vi.fn(() => 4),
        onChanged: vi.fn(() => unsubscribe)
    };
    return {
        api,
        setCurrent(next: GcmEntityIndexRecordLike | null) {
            current = next;
        }
    };
}

function createEntityApiForRecords(records: readonly GcmEntityIndexRecordLike[]) {
    const recordsByLocator = new Map(records.map(record => [record.locatorKey, record]));
    const unsubscribe = vi.fn();
    const api: GcmEntityIndexApiLike = {
        version: GCM_ENTITY_INDEX_API_VERSION,
        queryAsync: vi.fn(async () => records),
        ensureReady: vi.fn(async () => undefined),
        getByLocator: vi.fn((locator: string) => recordsByLocator.get(locator) ?? null),
        getRevision: vi.fn(() => 4),
        onChanged: vi.fn(() => unsubscribe)
    };
    return { api };
}

function createTaskApi(initialTasks: GcmTaskRecordLike[]) {
    let tasks = initialTasks;
    const list = vi.fn(async () => tasks);
    const setCheckbox = vi.fn<NonNullable<GcmTaskApiLike['setCheckbox']>>(async () => ({
        ok: true,
        changed: true,
        task: tasks[0] ?? null
    }));
    const setCompletion = vi.fn<NonNullable<GcmTaskApiLike['setCompletion']>>(async (ref, completed) => {
        const next = { ...ref, isComplete: completed };
        tasks = [next];
        return { ok: true, changed: ref.isComplete !== completed, task: next };
    });
    const api: GcmTaskApiLike = {
        version: 1,
        list,
        focus: vi.fn(async () => true),
        setCheckbox,
        setCompletion
    };
    return {
        api,
        list,
        setCheckbox,
        setCompletion,
        setTasks(next: GcmTaskRecordLike[]) {
            tasks = next;
        }
    };
}

function createTaskLinesApi() {
    const addMenuItems = vi.fn<GcmTaskLinesApiLike['addMenuItems']>((menu, _context, _options) => {
        menu.addItem((_item: MenuItem) => undefined);
        menu.addSeparator();
    });
    const api: GcmTaskLinesApiLike = { version: 1, addMenuItems };
    return { api, addMenuItems };
}

function payload(
    entityIndex: GcmEntityIndexApiLike,
    tasks: GcmTaskApiLike,
    taskLines: GcmTaskLinesApiLike,
    taskCheckboxes?: GcmTaskCheckboxesApiLike
): unknown {
    Object.assign(tasks, { supportsTaskLineMutation: tasks.supportsTaskLineMutation ?? true });
    Object.assign(taskLines, { supportsTaskLineMutation: taskLines.supportsTaskLineMutation ?? true });
    return {
        source: 'tps-global-context-menu',
        sourcePluginId: TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID,
        available: true,
        api: { entityIndex, tasks, taskLines, ...(taskCheckboxes ? { taskCheckboxes } : {}) },
        entityIndexVersion: 3
    };
}

function createAppWithFile(path = 'Tasks/Today.md'): App {
    return createAppWithFiles([path]);
}

function createAppWithFiles(paths: readonly string[]): App {
    const app = new App();
    paths.forEach(path => (app.vault as unknown as { registerFile(file: TFile): void }).registerFile(new TFile(path)));
    return app;
}

describe('GCM entity Type task integration', () => {
    it('accepts optional string task fields and rejects malformed field payloads', () => {
        expect(isGcmTaskRecord(taskRecord())).toBe(true);
        expect(isGcmTaskRecord(taskRecord({ fields: { scheduled: '2026-08-03 09:30:00' } }))).toBe(true);
        expect(isGcmTaskRecord({ ...taskRecord(), fields: { scheduled: 42 } })).toBe(false);
        expect(isGcmTaskRecord({ ...taskRecord(), fields: new Date() })).toBe(false);
    });

    it('hydrates exact live task state into the Checkboxes collection', async () => {
        const entity = taskEntity();
        const entityApi = createEntityApi(entity);
        const fields = { scheduled: '2026-08-03 09:30:00', Priority: 'high' };
        const tasks = createTaskApi([taskRecord({ fields })]);
        const taskLines = createTaskLinesApi();
        const adapter = new GcmEntityTypeIndexAdapter(createAppWithFile());
        expect(adapter.acceptApiPayload(payload(entityApi.api, tasks.api, taskLines.api))).toBe(true);

        const snapshot = await adapter.loadSnapshot();
        const structural = snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0];

        expect(tasks.list).toHaveBeenCalledWith({
            paths: ['Tasks/Today.md'],
            includeCompleted: true,
            maxResults: Number.MAX_SAFE_INTEGER
        });
        expect(structural?.task).toMatchObject({
            lineNumber: 2,
            rawLine: '- [ ] Ship it',
            isComplete: false,
            canMutateCheckbox: true,
            hasContextMenu: true
        });
        expect(structural?.task?.fields).toEqual(fields);
        expect(structural?.task?.fields).not.toBe(fields);
        expect(Object.isFrozen(structural?.task?.fields)).toBe(true);
        fields.scheduled = '2026-08-04 10:00:00';
        expect(structural?.task?.fields?.scheduled).toBe('2026-08-03 09:30:00');
        expect(structural?.checked).toBe(false);
    });

    it('keeps older GCM v1 task records without fields compatible', async () => {
        const entityApi = createEntityApi(taskEntity());
        const tasks = createTaskApi([taskRecord()]);
        const adapter = new GcmEntityTypeIndexAdapter(createAppWithFile());
        adapter.acceptApiPayload(payload(entityApi.api, tasks.api, createTaskLinesApi().api));

        const task = (await adapter.loadSnapshot()).recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0]?.task;

        expect(task?.title).toBe('Ship it');
        expect(task?.fields).toBeUndefined();
    });

    it('degrades a failed task hydration path to open-only without failing the Type snapshot', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const entity = taskEntity();
        const entityApi = createEntityApi(entity);
        const tasks = createTaskApi([]);
        tasks.list.mockRejectedValueOnce(new Error('read failed'));
        const adapter = new GcmEntityTypeIndexAdapter(createAppWithFile());
        expect(adapter.acceptApiPayload(payload(entityApi.api, tasks.api, createTaskLinesApi().api))).toBe(true);

        const snapshot = await adapter.loadSnapshot();
        expect(snapshot.availability).toBe('ready');
        expect(snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0]?.task).toBeUndefined();
        expect(warn).toHaveBeenCalledWith(
            '[TPS Notebook Navigator] Some Type task states could not be hydrated',
            expect.objectContaining({ failedPathCount: 1 })
        );
        tasks.setTasks([taskRecord()]);
        const recovered = await adapter.loadSnapshot();
        expect(tasks.list).toHaveBeenCalledTimes(2);
        expect(recovered.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0]?.task).toMatchObject({ title: 'Ship it' });
        warn.mockRestore();
    });

    it('batches cold task hydration, reuses unchanged paths, and invalidates only the changed path', async () => {
        const paths = ['Tasks/One.md', 'Tasks/Two.md'];
        const firstPath = paths[0] ?? '';
        const secondPath = paths[1] ?? '';
        const entities = paths.map((path, index) =>
            taskEntity({
                id: `task-${index}`,
                path,
                sourcePath: path,
                lineNumber: 1,
                locatorKey: `block:task-${index}`,
                referenceTarget: `[[${path}#^task-${index}]]`
            })
        );
        let recordsByPath = new Map(
            paths.map((path, index) => [
                path,
                taskRecord({
                    id: `${path}:1`,
                    path,
                    lineNumber: 0,
                    rawLine: `- [ ] Task ${index}`,
                    title: `Task ${index}`
                })
            ])
        );
        const list = vi.fn(async ({ paths: requestedPaths }: { paths: string[] }) =>
            requestedPaths.flatMap(path => {
                const task = recordsByPath.get(path);
                return task ? [task] : [];
            })
        );
        const taskApi: GcmTaskApiLike = { version: 1, list, focus: vi.fn(async () => true) };
        const entityApi = createEntityApiForRecords(entities);
        const adapter = new GcmEntityTypeIndexAdapter(createAppWithFiles(paths));
        adapter.acceptApiPayload(payload(entityApi.api, taskApi, createTaskLinesApi().api));

        await adapter.loadSnapshot();
        expect(list).toHaveBeenCalledOnce();
        expect(list).toHaveBeenCalledWith({ paths, includeCompleted: true, maxResults: Number.MAX_SAFE_INTEGER });

        await adapter.loadSnapshot();
        expect(list).toHaveBeenCalledOnce();

        recordsByPath = new Map(recordsByPath);
        const firstTask = recordsByPath.get(firstPath);
        expect(firstTask).toBeDefined();
        recordsByPath.set(firstPath, { ...firstTask, isComplete: true, marker: 'x', checkbox: '[x]' } as GcmTaskRecordLike);
        adapter.invalidateTaskPaths([firstPath]);
        const refreshed = await adapter.loadSnapshot();

        expect(list).toHaveBeenCalledTimes(2);
        expect(list).toHaveBeenLastCalledWith({
            paths: [firstPath],
            includeCompleted: true,
            maxResults: Number.MAX_SAFE_INTEGER
        });
        const refreshedTasks = refreshed.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES) ?? [];
        expect(refreshedTasks.find(record => record.sourcePath === firstPath)?.task?.isComplete).toBe(true);
        expect(refreshedTasks.find(record => record.sourcePath === secondPath)?.task?.isComplete).toBe(false);
    });

    it('does not cache an in-flight task result invalidated by a later update with the same file fingerprint', async () => {
        const entity = taskEntity();
        const entityApi = createEntityApi(entity);
        let resolveStaleRequest: ((tasks: GcmTaskRecordLike[]) => void) | null = null;
        const staleRequest = new Promise<GcmTaskRecordLike[]>(resolve => {
            resolveStaleRequest = resolve;
        });
        const list = vi
            .fn<NonNullable<GcmTaskApiLike['list']>>()
            .mockImplementationOnce(async () => staleRequest)
            .mockImplementationOnce(async () => [taskRecord({ checkbox: '[x]', marker: 'x', isComplete: true })]);
        const taskApi: GcmTaskApiLike = { version: 1, list, focus: vi.fn(async () => true) };
        const adapter = new GcmEntityTypeIndexAdapter(createAppWithFile());
        adapter.acceptApiPayload(payload(entityApi.api, taskApi, createTaskLinesApi().api));

        adapter.invalidateTaskPaths([entity.sourcePath]);
        const staleLoad = adapter.loadSnapshot();
        await vi.waitFor(() => expect(list).toHaveBeenCalledOnce());
        adapter.invalidateTaskPaths([entity.sourcePath]);
        expect(resolveStaleRequest).not.toBeNull();
        resolveStaleRequest?.([taskRecord()]);

        const staleSnapshot = await staleLoad;
        expect(staleSnapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0]?.task).toBeUndefined();
        const refreshedSnapshot = await adapter.loadSnapshot();
        expect(list).toHaveBeenCalledTimes(2);
        expect(refreshedSnapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0]?.task?.isComplete).toBe(true);
    });

    it('cooperatively cancels outstanding task hydration without committing its cache', async () => {
        const entity = taskEntity();
        const entityApi = createEntityApi(entity);
        let resolveTaskList!: (tasks: GcmTaskRecordLike[]) => void;
        const pendingTaskList = new Promise<GcmTaskRecordLike[]>(resolve => {
            resolveTaskList = resolve;
        });
        const list = vi.fn<NonNullable<GcmTaskApiLike['list']>>(async () => pendingTaskList);
        const taskApi: GcmTaskApiLike = { version: 1, list, focus: vi.fn(async () => true) };
        const adapter = new GcmEntityTypeIndexAdapter(createAppWithFile());
        adapter.acceptApiPayload(payload(entityApi.api, taskApi, createTaskLinesApi().api));
        const controller = new AbortController();

        const loading = adapter.loadSnapshot(controller.signal);
        await vi.waitFor(() => expect(list).toHaveBeenCalledOnce());
        controller.abort();
        adapter.dispose();
        resolveTaskList([taskRecord()]);

        const cancelled = await loading;
        expect(cancelled.availability).toBe('unavailable');
        expect(cancelled.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES) ?? []).toHaveLength(0);
        expect((adapter as unknown as { taskHydrationCache: Map<string, unknown> }).taskHydrationCache.size).toBe(0);
    });

    it('bounds the per-path task hydration cache while querying cold paths in bounded batches', async () => {
        const pathCount = GCM_TYPE_TASK_CACHE_MAX_PATHS + 1;
        const paths = Array.from({ length: pathCount }, (_, index) => `Tasks/Cache-${index}.md`);
        const entities = paths.map((path, index) =>
            taskEntity({
                id: `cache-${index}`,
                path,
                sourcePath: path,
                lineNumber: 1,
                locatorKey: `block:cache-${index}`,
                referenceTarget: `[[${path}#^cache-${index}]]`
            })
        );
        const list = vi.fn(async ({ paths: requestedPaths }: { paths: string[] }) =>
            requestedPaths.map((path, index) =>
                taskRecord({ id: `${path}:1`, path, lineNumber: 0, rawLine: `- [ ] ${path}`, title: `${path}:${index}` })
            )
        );
        const taskApi: GcmTaskApiLike = { version: 1, list, focus: vi.fn(async () => true) };
        const adapter = new GcmEntityTypeIndexAdapter(createAppWithFiles(paths));
        adapter.acceptApiPayload(payload(createEntityApiForRecords(entities).api, taskApi, createTaskLinesApi().api));

        await adapter.loadSnapshot();

        expect(list).toHaveBeenCalledTimes(Math.ceil(pathCount / GCM_TYPE_TASK_QUERY_PATHS_PER_BATCH));
        expect(list.mock.calls.every(call => call[0].paths.length <= GCM_TYPE_TASK_QUERY_PATHS_PER_BATCH)).toBe(true);
        const cache = (adapter as unknown as { taskHydrationCache: Map<string, unknown> }).taskHydrationCache;
        expect(cache.size).toBe(GCM_TYPE_TASK_CACHE_MAX_PATHS);
    });

    it('keeps hydrated task state display-only when GCM exposes no safe mutation capability', async () => {
        const entityApi = createEntityApi(taskEntity());
        const tasks = createTaskApi([taskRecord()]);
        delete tasks.api.setCompletion;
        delete tasks.api.setCheckbox;
        const adapter = new GcmEntityTypeIndexAdapter(createAppWithFile());
        adapter.acceptApiPayload(payload(entityApi.api, tasks.api, createTaskLinesApi().api));

        const record = (await adapter.loadSnapshot()).recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0];
        expect(record?.task).toMatchObject({ isComplete: false, canMutateCheckbox: false, hasContextMenu: true });
    });

    it('re-resolves a moved locator and sends the exact current task to the current checkbox API', async () => {
        const entity = taskEntity();
        const entityApi = createEntityApi(entity);
        const oldTasks = createTaskApi([taskRecord()]);
        const taskLines = createTaskLinesApi();
        const adapter = new GcmEntityTypeIndexAdapter(createAppWithFile());
        adapter.acceptApiPayload(payload(entityApi.api, oldTasks.api, taskLines.api));
        const record = (await adapter.loadSnapshot()).recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0];
        expect(record).toBeDefined();

        const movedEntity = taskEntity({ lineNumber: 5 });
        const movedTask = taskRecord({ lineNumber: 4, rawLine: '- [ ] Ship it ^task-one' });
        entityApi.setCurrent(movedEntity);
        const currentTasks = createTaskApi([movedTask]);
        adapter.acceptApiPayload(payload(entityApi.api, currentTasks.api, taskLines.api));

        await expect(adapter.setTaskCheckbox(record!, true)).resolves.toEqual({ ok: true });
        expect(oldTasks.setCheckbox).not.toHaveBeenCalled();
        expect(currentTasks.setCompletion).toHaveBeenCalledWith(movedTask, true);
    });

    it('fails closed without mutation when the locator is stale or no longer a task of the selected Type', async () => {
        const entity = taskEntity();
        const entityApi = createEntityApi(entity);
        const tasks = createTaskApi([taskRecord()]);
        const adapter = new GcmEntityTypeIndexAdapter(createAppWithFile());
        adapter.acceptApiPayload(payload(entityApi.api, tasks.api, createTaskLinesApi().api));
        const record = (await adapter.loadSnapshot()).recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0];
        expect(record).toBeDefined();

        entityApi.setCurrent(taskEntity({ lineKind: 'bullet' }));
        await expect(adapter.setTaskCheckbox(record!, true)).resolves.toMatchObject({ ok: false, reason: 'stale-locator' });
        expect(tasks.setCheckbox).not.toHaveBeenCalled();

        entityApi.setCurrent(null);
        await expect(adapter.setTaskCheckbox(record!, true)).resolves.toMatchObject({ ok: false, reason: 'stale-locator' });
        expect(tasks.setCheckbox).not.toHaveBeenCalled();
    });

    it('builds the full GCM menu through the restricted item/separator facade and rejects stale line state', async () => {
        const entity = taskEntity();
        const entityApi = createEntityApi(entity);
        const tasks = createTaskApi([taskRecord()]);
        const taskLines = createTaskLinesApi();
        const adapter = new GcmEntityTypeIndexAdapter(createAppWithFile());
        adapter.acceptApiPayload(payload(entityApi.api, tasks.api, taskLines.api));
        const record = (await adapter.loadSnapshot()).recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0];
        expect(record).toBeDefined();
        const menu = { addItem: vi.fn(), addSeparator: vi.fn() };

        expect(adapter.addTaskContextMenuItems(menu, record!)).toBe(true);
        expect(taskLines.addMenuItems).toHaveBeenCalledWith(
            menu,
            expect.objectContaining({
                lineNumber: 3,
                lineIndex: 2,
                rawLine: '- [ ] Ship it',
                checkboxToken: '[ ]',
                isCalendarTask: false
            }),
            { includeTags: true }
        );
        expect(menu.addItem).toHaveBeenCalledOnce();
        expect(menu.addSeparator).toHaveBeenCalledOnce();

        taskLines.addMenuItems.mockClear();
        entityApi.setCurrent(taskEntity({ lineNumber: 4 }));
        expect(adapter.addTaskContextMenuItems(menu, record!)).toBe(false);
        expect(taskLines.addMenuItems).not.toHaveBeenCalled();
    });

    it('falls back through configured mappings and validates the effective completion state', async () => {
        const entityApi = createEntityApi(taskEntity());
        const tasks = createTaskApi([taskRecord()]);
        delete tasks.api.setCompletion;
        const stateForStatus = vi.fn(() => '[!]');
        const taskCheckboxes: GcmTaskCheckboxesApiLike = { version: 1, stateForStatus };
        tasks.setCheckbox.mockImplementationOnce(async (ref, checkbox) => ({
            ok: true,
            changed: true,
            task: { ...ref, checkbox, marker: '!', isComplete: true }
        }));
        const adapter = new GcmEntityTypeIndexAdapter(createAppWithFile());
        adapter.acceptApiPayload(payload(entityApi.api, tasks.api, createTaskLinesApi().api, taskCheckboxes));
        const record = (await adapter.loadSnapshot()).recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0];

        await expect(adapter.setTaskCheckbox(record!, true)).resolves.toEqual({ ok: true });
        expect(stateForStatus).toHaveBeenCalledWith('complete');
        expect(tasks.setCheckbox).toHaveBeenCalledWith(expect.objectContaining({ lineNumber: 2 }), '[!]');

        tasks.api.setCompletion = vi.fn<NonNullable<GcmTaskApiLike['setCompletion']>>(async ref => ({
            ok: true,
            changed: false,
            task: { ...ref, isComplete: false }
        }));
        adapter.acceptApiPayload(payload(entityApi.api, tasks.api, createTaskLinesApi().api, taskCheckboxes));
        await expect(adapter.setTaskCheckbox(record!, true)).resolves.toMatchObject({ ok: false, reason: 'mutation-failed' });
    });

    it('does not expose task mutation or menus when GCM v5 disables line actions', async () => {
        const entityApi = createEntityApi(taskEntity());
        const tasks = createTaskApi([taskRecord()]);
        const taskLines = createTaskLinesApi();
        Object.assign(tasks.api, { version: 4, supportsTaskLineMutation: false });
        Object.assign(taskLines.api, { version: 2, supportsTaskLineMutation: false });
        const adapter = new GcmEntityTypeIndexAdapter(createAppWithFile());
        adapter.acceptApiPayload(payload(entityApi.api, tasks.api, taskLines.api));
        const record = (await adapter.loadSnapshot()).recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)?.[0];

        expect(record?.task).toMatchObject({ canMutateCheckbox: false, hasContextMenu: false });
        await expect(adapter.setTaskCheckbox(record!, true)).resolves.toMatchObject({ ok: false, reason: 'gcm-unavailable' });
        expect(adapter.addTaskContextMenuItems({ addItem: vi.fn(), addSeparator: vi.fn() }, record!)).toBe(false);
        expect(tasks.setCompletion).not.toHaveBeenCalled();
        expect(tasks.setCheckbox).not.toHaveBeenCalled();
        expect(taskLines.addMenuItems).not.toHaveBeenCalled();
    });
});
