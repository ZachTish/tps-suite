import { App, TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../src/constants/tpsIdentity';
import {
    GCM_ENTITY_INDEX_API_VERSION,
    GcmEntityTypeIndexAdapter,
    isGcmEntityIndexRecord,
    isGcmEntityIndexApiLike,
    resolveGcmEntityIndexApi,
    type GcmEntityIndexApiLike,
    type GcmEntityIndexQueryLike,
    type GcmEntityIndexRecordLike
} from '../../src/integrations/gcm/GcmEntityTypeIndex';
import { TPS_NAVIGATOR_TYPE_IDS, type TpsNavigatorTypeId, type TpsNavigatorTypeRecord } from '../../src/types/navigatorTypes';

interface ApiHarness {
    api: GcmEntityIndexApiLike;
    queryAsync: ReturnType<typeof vi.fn<(query?: GcmEntityIndexQueryLike) => Promise<readonly unknown[]>>>;
    ensureReady: ReturnType<typeof vi.fn<() => Promise<void>>>;
    getByLocator: ReturnType<typeof vi.fn<(locator: string) => unknown>>;
    getDimensionValues: ReturnType<typeof vi.fn<(dimension: string) => readonly string[]>>;
    getRevision: ReturnType<typeof vi.fn<() => number>>;
    registerDimension: ReturnType<typeof vi.fn<() => () => void>>;
    unregisterDimension: ReturnType<typeof vi.fn<() => void>>;
    unsubscribeRevision: ReturnType<typeof vi.fn<() => void>>;
    emitRevision(revision: number): void;
    setRevision(revision: number): void;
}

function createApiHarness(records: readonly unknown[] = [], kindValues: readonly string[] = []): ApiHarness {
    let revision = 1;
    let revisionListener: ((revision: number) => void) | null = null;
    const queryAsync = vi.fn(async (_query?: GcmEntityIndexQueryLike): Promise<readonly unknown[]> => records);
    const ensureReady = vi.fn(async (): Promise<void> => {});
    const getByLocator = vi.fn((_locator: string): unknown => null);
    const getDimensionValues = vi.fn((_dimension: string): readonly string[] => kindValues);
    const getRevision = vi.fn(() => revision);
    const unregisterDimension = vi.fn();
    const unsubscribeRevision = vi.fn();
    const registerDimension = vi.fn(() => unregisterDimension);
    const onChanged = vi.fn((listener: (nextRevision: number) => void) => {
        revisionListener = listener;
        return unsubscribeRevision;
    });
    const api = {
        version: GCM_ENTITY_INDEX_API_VERSION,
        queryAsync,
        ensureReady,
        getByLocator,
        getDimensionValues,
        getRevision,
        onChanged,
        registerDimension
    } as GcmEntityIndexApiLike;
    return {
        api,
        queryAsync,
        ensureReady,
        getByLocator,
        getDimensionValues,
        getRevision,
        registerDimension,
        unregisterDimension,
        unsubscribeRevision,
        emitRevision(nextRevision: number): void {
            revision = nextRevision;
            revisionListener?.(nextRevision);
        },
        setRevision(nextRevision: number): void {
            revision = nextRevision;
        }
    };
}

function createApp(): App {
    return new App();
}

function createApiPayload(entityIndex: unknown, available = true): unknown {
    return {
        source: 'tps-global-context-menu',
        sourcePluginId: TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID,
        timestamp: Date.now(),
        available,
        api: available ? { entityIndex } : null,
        entityIndexVersion:
            entityIndex && typeof entityIndex === 'object' && 'version' in entityIndex
                ? Number((entityIndex as { version?: unknown }).version)
                : null
    };
}

function entity(options: {
    id: string;
    label?: string;
    sourcePath?: string;
    entityType?: 'note' | 'block';
    lineKind?: 'task' | 'bullet' | 'heading';
    lineNumber?: number;
    dimensions?: Readonly<Record<string, readonly string[]>>;
    lineProperties?: Readonly<Record<string, readonly string[]>>;
    locatorKey?: string;
}): GcmEntityIndexRecordLike {
    const entityType = options.entityType ?? 'note';
    const sourcePath = options.sourcePath ?? `${options.id}.md`;
    const label = options.label ?? options.id;
    const lineKind = options.lineKind ?? (entityType === 'block' ? 'bullet' : undefined);
    const lineNumber = options.lineNumber ?? (entityType === 'block' ? 1 : undefined);
    return {
        id: options.id,
        path: sourcePath,
        name: label,
        displayName: label,
        basename: label,
        dimensions: options.dimensions ?? {},
        ...(options.lineProperties ? { lineProperties: options.lineProperties } : {}),
        sourcePath,
        entityType,
        subpath: entityType === 'block' ? '#^block' : '',
        blockId: entityType === 'block' ? 'block' : '',
        ...(lineKind ? { lineKind } : {}),
        ...(lineNumber !== undefined ? { lineNumber } : {}),
        referenceState: 'ready',
        locatorKey: options.locatorKey ?? `${entityType}:${options.id}`,
        referenceTarget: entityType === 'block' ? `[[${sourcePath}#^block]]` : `[[${sourcePath}]]`
    };
}

function navigatorRecord(record: GcmEntityIndexRecordLike, typeId: TpsNavigatorTypeId): TpsNavigatorTypeRecord {
    return {
        id: record.id,
        typeId,
        label: record.displayName,
        sourcePath: record.sourcePath,
        entityType: record.entityType,
        ...(record.lineKind ? { lineKind: record.lineKind } : {}),
        ...(record.lineNumber !== undefined ? { lineNumber: record.lineNumber } : {}),
        locatorKey: record.locatorKey,
        referenceTarget: record.referenceTarget
    };
}

function registerFile(app: App, path: string): TFile {
    const file = new TFile(path);
    (app.vault as unknown as { registerFile(file: TFile): void }).registerFile(file);
    return file;
}

describe('GcmEntityTypeIndexAdapter', () => {
    it('resolves only the enabled, exact entity-index v3 API contract', () => {
        const harness = createApiHarness();
        expect(resolveGcmEntityIndexApi(createApiPayload(harness.api))).toBe(harness.api);
        expect(isGcmEntityIndexApiLike(harness.api)).toBe(true);

        const oldApi = { ...harness.api, version: 2 };
        expect(resolveGcmEntityIndexApi(createApiPayload(oldApi))).toBeNull();
        expect(isGcmEntityIndexApiLike(oldApi)).toBe(false);
        expect(resolveGcmEntityIndexApi(createApiPayload(harness.api, false))).toBeNull();
        expect(resolveGcmEntityIndexApi({ source: 'foreign-plugin', available: true, api: { entityIndex: harness.api } })).toBeNull();
    });

    it('relays GCM revisions without registering a metadata dimension', () => {
        const harness = createApiHarness();
        const adapter = new GcmEntityTypeIndexAdapter(createApp());
        const listener = vi.fn();

        expect(adapter.acceptApiPayload(createApiPayload(harness.api))).toBe(true);
        expect(adapter.connect(harness.api)).toBe(true);
        expect(harness.registerDimension).not.toHaveBeenCalled();
        const unsubscribe = adapter.subscribe(listener);

        harness.emitRevision(7);
        expect(listener).toHaveBeenCalledWith(7);
        expect(adapter.getRevision()).toBe(7);
        unsubscribe();
        harness.emitRevision(8);
        expect(listener).toHaveBeenCalledOnce();

        adapter.dispose();
        expect(harness.unsubscribeRevision).toHaveBeenCalledOnce();
        expect(harness.unregisterDimension).not.toHaveBeenCalled();
    });

    it('clears the published API when GCM announces that it is unavailable', async () => {
        const harness = createApiHarness();
        const adapter = new GcmEntityTypeIndexAdapter(createApp());

        expect(adapter.acceptApiPayload(createApiPayload(harness.api))).toBe(true);
        expect(adapter.acceptApiPayload(createApiPayload(harness.api, false))).toBe(true);
        await expect(adapter.loadSnapshot()).resolves.toMatchObject({
            availability: 'unavailable',
            issue: { code: 'gcm-unavailable' }
        });
        expect(harness.unsubscribeRevision).toHaveBeenCalledOnce();
        expect(harness.unregisterDimension).not.toHaveBeenCalled();
        expect(adapter.acceptApiPayload({ source: 'foreign-plugin', available: false, api: null })).toBe(false);
    });

    it('classifies exact-line structures without publishing notes or frontmatter kinds', async () => {
        const records = [
            entity({ id: 'project-note', label: 'Atlas', dimensions: { Kind: ['Project'] } }),
            entity({ id: 'task', label: 'Ship it', entityType: 'block', lineKind: 'task', dimensions: { kind: ['task'] } }),
            entity({
                id: 'bullet',
                label: 'Project log',
                entityType: 'block',
                lineKind: 'bullet',
                dimensions: { kind: ['bullet', 'project'] }
            }),
            entity({
                id: 'heading',
                label: 'Waiting',
                entityType: 'block',
                lineKind: 'heading',
                dimensions: { kind: ['heading', 'Context'] }
            })
        ];
        const harness = createApiHarness(records, ['task', 'Project', 'project', 'bullet', 'heading', 'Context', '']);
        harness.setRevision(11);
        const adapter = new GcmEntityTypeIndexAdapter(createApp());
        adapter.acceptApiPayload(createApiPayload(harness.api));

        const snapshot = await adapter.loadSnapshot();

        expect(snapshot.availability).toBe('ready');
        expect(snapshot.revision).toBe(11);
        expect(snapshot.descriptors.map(descriptor => [descriptor.id, descriptor.count])).toEqual([
            [TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, 1],
            [TPS_NAVIGATOR_TYPE_IDS.BULLETS, 1],
            [TPS_NAVIGATOR_TYPE_IDS.HEADINGS, 1]
        ]);
        expect(snapshot.recordsByType.has(TPS_NAVIGATOR_TYPE_IDS.NOTES)).toBe(false);
        expect(snapshot.descriptors.some(descriptor => descriptor.id.startsWith('kind:'))).toBe(false);
        expect(harness.ensureReady).toHaveBeenCalledOnce();
        expect(harness.queryAsync).toHaveBeenCalledWith({
            entityTypes: 'block',
            lineKinds: ['task', 'bullet', 'heading']
        });
        expect(harness.getDimensionValues).not.toHaveBeenCalled();
        adapter.dispose();
    });

    it('validates, defensively copies, and deeply freezes optional block line properties', async () => {
        const priority = ['low', '', 'high'];
        const tags = ['waiting', 'home'];
        const lineProperties = Object.assign(Object.create(null) as Record<string, string[]>, { Priority: priority, tags });
        const source = entity({
            id: 'bullet-properties',
            entityType: 'block',
            lineKind: 'bullet',
            lineProperties
        });
        const harness = createApiHarness([source]);
        const adapter = new GcmEntityTypeIndexAdapter(createApp());
        adapter.acceptApiPayload(createApiPayload(harness.api));

        expect(isGcmEntityIndexRecord(source)).toBe(true);
        const snapshot = await adapter.loadSnapshot();
        const [record] = snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.BULLETS) ?? [];

        expect(record.properties).toEqual({ Priority: ['low', '', 'high'], tags: ['waiting', 'home'] });
        expect(Object.getPrototypeOf(record.properties)).toBeNull();
        expect(Object.isFrozen(record.properties)).toBe(true);
        expect(Object.values(record.properties ?? {}).every(Object.isFrozen)).toBe(true);

        priority[0] = 'changed';
        tags.push('mutated');
        expect(record.properties).toEqual({ Priority: ['low', '', 'high'], tags: ['waiting', 'home'] });
        adapter.dispose();
    });

    it('rejects malformed or note-backed line properties without rejecting valid sibling records', async () => {
        const valid = entity({
            id: 'valid-properties',
            entityType: 'block',
            lineKind: 'heading',
            lineProperties: { Owner: ['Sam'] }
        });
        const malformed = [
            { ...valid, id: 'array-object', lineProperties: [] },
            { ...valid, id: 'scalar-value', lineProperties: { Owner: 'Sam' } },
            { ...valid, id: 'date-object', lineProperties: new Date() },
            { ...entity({ id: 'note-properties' }), lineProperties: { Owner: ['Sam'] } }
        ];
        malformed.forEach(record => expect(isGcmEntityIndexRecord(record)).toBe(false));

        const harness = createApiHarness([valid, ...malformed]);
        const adapter = new GcmEntityTypeIndexAdapter(createApp());
        adapter.acceptApiPayload(createApiPayload(harness.api));

        const result = await adapter.queryType(TPS_NAVIGATOR_TYPE_IDS.HEADINGS);
        expect(result).toMatchObject({ ok: true, records: [{ id: 'valid-properties', properties: { Owner: ['Sam'] } }] });
        if (result.ok) {
            expect(result.records).toHaveLength(1);
        }
        adapter.dispose();
    });

    it('uses narrow API queries and defensively filters foreign records for each descriptor', async () => {
        const task = entity({ id: 'task', entityType: 'block', lineKind: 'task', dimensions: { kind: ['task'] } });
        const bullet = entity({ id: 'bullet', entityType: 'block', lineKind: 'bullet', dimensions: { kind: ['bullet', 'Project'] } });
        const note = entity({ id: 'note', dimensions: { kind: ['Project'] } });
        const wrong = entity({ id: 'wrong', dimensions: { kind: ['Context'] } });
        const harness = createApiHarness();
        harness.queryAsync.mockResolvedValue([task, bullet, note, wrong, { malformed: true }]);
        const adapter = new GcmEntityTypeIndexAdapter(createApp());
        adapter.acceptApiPayload(createApiPayload(harness.api));

        const taskResult = await adapter.queryType(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES);
        expect(taskResult).toMatchObject({ ok: true, records: [{ id: 'task' }] });
        expect(harness.queryAsync).toHaveBeenLastCalledWith({ entityTypes: 'block', lineKinds: 'task' });

        const retiredKindResult = await adapter.queryType('kind:Project');
        expect(retiredKindResult).toMatchObject({ ok: false, issue: { code: 'invalid-type' } });
        adapter.dispose();
    });

    it('distinguishes an unavailable plugin from an incomplete line index', async () => {
        const unavailable = new GcmEntityTypeIndexAdapter(createApp());
        await expect(unavailable.loadSnapshot()).resolves.toMatchObject({
            availability: 'unavailable',
            descriptors: [],
            revision: 0,
            issue: { code: 'gcm-unavailable' }
        });

        const harness = createApiHarness();
        harness.ensureReady.mockRejectedValue({
            code: 'entity-index-incomplete',
            failedPaths: ['Bad/B.md', 'Bad/A.md', 'Bad/A.md']
        });
        const incomplete = new GcmEntityTypeIndexAdapter(createApp());
        incomplete.acceptApiPayload(createApiPayload(harness.api));
        await expect(incomplete.loadSnapshot()).resolves.toMatchObject({
            availability: 'error',
            descriptors: [],
            issue: {
                code: 'entity-index-incomplete',
                failedPaths: ['Bad/A.md', 'Bad/B.md']
            }
        });
        expect(harness.queryAsync).not.toHaveBeenCalled();
        incomplete.dispose();
    });

    it('re-resolves a moved line and activates its current one-based line through direct Obsidian APIs', async () => {
        const current = entity({
            id: 'task',
            sourcePath: 'Tasks/Ship.md',
            entityType: 'block',
            lineKind: 'task',
            lineNumber: 9,
            dimensions: { kind: ['task'] },
            locatorKey: 'block:stable'
        });
        const staleSelection = { ...navigatorRecord(current, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES), lineNumber: 2 };
        const harness = createApiHarness();
        harness.getByLocator.mockReturnValue(current);
        const app = createApp();
        const file = registerFile(app, current.sourcePath);
        const setCursor = vi.fn();
        const scrollIntoView = vi.fn();
        const focus = vi.fn();
        const leaf = {
            view: { file, editor: { setCursor, scrollIntoView, focus } },
            openFile: vi.fn(async () => {})
        };
        const workspace = { activeLeaf: leaf, getLeaf: vi.fn(() => leaf), getLeavesOfType: vi.fn(() => [leaf]) };
        Object.assign(app, { workspace });
        const adapter = new GcmEntityTypeIndexAdapter(app);
        adapter.acceptApiPayload(createApiPayload(harness.api));

        await expect(adapter.activate(staleSelection)).resolves.toEqual({ ok: true, sourcePath: 'Tasks/Ship.md', lineNumber: 9 });
        expect(harness.getByLocator).toHaveBeenCalledWith('block:stable');
        expect(workspace.getLeaf).toHaveBeenCalledWith(false);
        expect(leaf.openFile).toHaveBeenCalledWith(file, { state: { mode: 'source' }, active: true });
        expect(setCursor).toHaveBeenCalledWith({ line: 8, ch: 0 });
        expect(scrollIntoView).toHaveBeenCalledWith({ from: { line: 8, ch: 0 }, to: { line: 8, ch: 0 } }, true);
        expect(focus).toHaveBeenCalledOnce();
        adapter.dispose();
    });

    it('fails closed on a stale locator without opening a file', async () => {
        const selected = entity({
            id: 'task',
            sourcePath: 'Tasks/Ship.md',
            entityType: 'block',
            lineKind: 'task',
            dimensions: { kind: ['task'] },
            locatorKey: 'block:gone'
        });
        const harness = createApiHarness();
        harness.getByLocator.mockReturnValue(null);
        const app = createApp();
        const getLeaf = vi.fn();
        Object.assign(app, { workspace: { getLeaf } });
        const adapter = new GcmEntityTypeIndexAdapter(app);
        adapter.acceptApiPayload(createApiPayload(harness.api));

        await expect(adapter.activate(navigatorRecord(selected, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES))).resolves.toEqual({
            ok: false,
            reason: 'stale-locator'
        });
        expect(getLeaf).not.toHaveBeenCalled();
        adapter.dispose();
    });

    it('never moves the cursor in a leaf that changed files during an overlapping activation', async () => {
        const current = entity({
            id: 'task',
            sourcePath: 'Tasks/Ship.md',
            entityType: 'block',
            lineKind: 'task',
            lineNumber: 9,
            dimensions: { kind: ['task'] },
            locatorKey: 'block:stable'
        });
        const harness = createApiHarness();
        harness.getByLocator.mockReturnValue(current);
        const app = createApp();
        const file = registerFile(app, current.sourcePath);
        const setCursor = vi.fn();
        const leaf = {
            view: { file: { path: current.sourcePath }, editor: { setCursor } },
            openFile: vi.fn(async () => {
                leaf.view.file = { path: 'Tasks/Other.md' };
            })
        };
        Object.assign(app, {
            workspace: {
                activeLeaf: leaf,
                getLeaf: vi.fn(() => leaf),
                getLeavesOfType: vi.fn(() => [])
            }
        });
        const adapter = new GcmEntityTypeIndexAdapter(app);
        adapter.acceptApiPayload(createApiPayload(harness.api));

        await expect(adapter.activate(navigatorRecord(current, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES))).resolves.toEqual({
            ok: false,
            reason: 'editor-unavailable'
        });
        expect(leaf.openFile).toHaveBeenCalledWith(file, { state: { mode: 'source' }, active: true });
        expect(setCursor).not.toHaveBeenCalled();
        adapter.dispose();
    });
});
