import { describe, expect, it, vi } from 'vitest';
import { buildTypeProviderRows, type TypeRecordActivationResult } from '../../src/services/rows/typeProviderRows';
import {
    TPS_NAVIGATOR_TYPE_IDS,
    type TpsNavigatorTypeId,
    type TpsNavigatorTypeRecord,
    type TpsNavigatorTypesSnapshot
} from '../../src/types/navigatorTypes';
import { parseFilterSearchTokens } from '../../src/utils/filterSearch';

const selectedLineTypeId = TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES;

function createRecord(overrides: Partial<TpsNavigatorTypeRecord> = {}): TpsNavigatorTypeRecord {
    return {
        id: 'project-one',
        typeId: selectedLineTypeId,
        label: 'Project one',
        sourcePath: 'Projects/One.md',
        entityType: 'note',
        locatorKey: 'note:Projects/One.md',
        referenceTarget: '[[Projects/One]]',
        ...overrides
    };
}

function createSnapshot(
    records: readonly TpsNavigatorTypeRecord[],
    availability: TpsNavigatorTypesSnapshot['availability'] = 'ready',
    message?: string,
    selectedType: TpsNavigatorTypeId = selectedLineTypeId
): TpsNavigatorTypesSnapshot {
    return {
        availability,
        descriptors: [],
        recordsByType: new Map([[selectedType, records]]),
        revision: 3,
        ...(message ? { message } : {})
    };
}

function buildRows(options?: {
    records?: readonly TpsNavigatorTypeRecord[];
    availability?: TpsNavigatorTypesSnapshot['availability'];
    message?: string;
    searchQuery?: string;
    searchTokens?: ReturnType<typeof parseFilterSearchTokens>;
    allowedSourcePaths?: ReadonlySet<string>;
    getNoteProperties?: (sourcePath: string) => Readonly<Record<string, unknown>> | undefined;
    linePropertyInheritance?: 'note-first' | 'line-first' | 'combine';
    includeUnavailableStatus?: boolean;
    selectedType?: TpsNavigatorTypeId;
    activate?: (record: TpsNavigatorTypeRecord) => Promise<TypeRecordActivationResult>;
    setTaskCheckbox?: (record: TpsNavigatorTypeRecord, checked: boolean) => Promise<{ ok: boolean; reason?: string }>;
    addTaskContextMenuItems?: (menu: { addItem: () => unknown; addSeparator: () => unknown }, record: TpsNavigatorTypeRecord) => boolean;
    onActivationFailure?: (record: TpsNavigatorTypeRecord, result: TypeRecordActivationResult) => void;
}) {
    const selectedType = options?.selectedType ?? selectedLineTypeId;
    return buildTypeProviderRows({
        snapshot: createSnapshot(options?.records ?? [], options?.availability, options?.message, selectedType),
        selectedType,
        searchQuery: options?.searchQuery ?? '',
        searchTokens: options?.searchTokens,
        allowedSourcePaths: options?.allowedSourcePaths,
        getNoteProperties: options?.getNoteProperties,
        linePropertyInheritance: options?.linePropertyInheritance,
        includeUnavailableStatus: options?.includeUnavailableStatus,
        activate: options?.activate ?? (async () => ({ ok: true })),
        setTaskCheckbox: options?.setTaskCheckbox ?? (async () => ({ ok: true })),
        addTaskContextMenuItems: options?.addTaskContextMenuItems ?? (() => true),
        onActivationFailure: options?.onActivationFailure ?? (() => undefined)
    });
}

describe('buildTypeProviderRows', () => {
    it.each([
        ['loading', 'Loading entity index…'],
        ['unavailable', 'Types are unavailable.'],
        ['error', 'Entity index failed']
    ] as const)('maps a %s snapshot to one standalone status row', (availability, message) => {
        const rows = buildRows({ availability, message });

        expect(rows).toEqual([
            {
                providerId: 'tps/entity-types',
                id: `status:${availability}`,
                kind: 'tps/entity-type-status',
                label: message,
                sourcePath: 'Types'
            }
        ]);
    });

    it('keeps built-in GCM status independent when an external provider makes the aggregate catalog ready', () => {
        const snapshot = createSnapshot([], 'ready');
        snapshot.builtinAvailability = 'unavailable';
        snapshot.builtinMessage = 'GCM is unavailable.';

        const rows = buildTypeProviderRows({
            snapshot,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            searchQuery: '',
            activate: async () => ({ ok: true }),
            setTaskCheckbox: async () => ({ ok: true }),
            addTaskContextMenuItems: () => true,
            onActivationFailure: () => undefined
        });

        expect(rows[0]).toMatchObject({ id: 'status:unavailable', label: 'GCM is unavailable.' });
    });

    it('keeps Navigator-owned Markdown structures ready when GCM is unavailable', () => {
        const codeRecord = createRecord({
            id: 'code',
            typeId: TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS,
            label: 'Code block',
            entityType: 'block',
            lineKind: 'code',
            lineNumber: 5,
            lineEndNumber: 9,
            locatorKey: 'markdown-section:code',
            sourcePath: 'Notes/Code.md'
        });
        const snapshot = createSnapshot([], 'ready');
        snapshot.lineAvailability = 'unavailable';
        snapshot.lineMessage = 'GCM is unavailable.';
        snapshot.markdownAvailability = 'ready';
        snapshot.recordsByType = new Map([[TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS, [codeRecord]]]);

        const rows = buildTypeProviderRows({
            snapshot,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS,
            searchQuery: '',
            activate: async () => ({ ok: true }),
            setTaskCheckbox: async () => ({ ok: true }),
            addTaskContextMenuItems: () => true,
            onActivationFailure: () => undefined
        });

        expect(rows[0]).toMatchObject({
            kind: 'tps/entity-type/code',
            secondaryLabel: 'Notes/Code.md · lines 5–9',
            tooltip: 'Open Notes/Code.md at lines 5–9',
            sourceLineNumber: 4
        });
    });

    it('shows only the Markdown source status for a local structure Type', () => {
        const snapshot = createSnapshot([], 'ready');
        snapshot.lineAvailability = 'ready';
        snapshot.markdownAvailability = 'loading';
        snapshot.markdownMessage = 'Loading Markdown structures…';

        const rows = buildTypeProviderRows({
            snapshot,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.TABLES,
            searchQuery: '',
            activate: async () => ({ ok: true }),
            setTaskCheckbox: async () => ({ ok: true }),
            addTaskContextMenuItems: () => true,
            onActivationFailure: () => undefined
        });

        expect(rows).toEqual([
            {
                providerId: 'tps/markdown-types',
                id: 'status:loading',
                kind: 'tps/markdown-type-status',
                label: 'Loading Markdown structures…',
                sourcePath: 'Types'
            }
        ]);
    });

    it('maps note records to path-only rows and one-based line records to zero-based source positions', () => {
        const note = createRecord();
        const checkbox = createRecord({
            id: 'task-one',
            label: 'Ship the release',
            sourcePath: 'Tasks/Today.md',
            entityType: 'block',
            lineKind: 'task',
            lineNumber: 9,
            locatorKey: 'block:Tasks/Today.md:^task-one',
            referenceTarget: '[[Tasks/Today#^task-one]]'
        });

        const rows = buildRows({ records: [note, checkbox] });

        expect(rows[0]).toMatchObject({
            id: `${selectedLineTypeId}:${note.locatorKey}`,
            kind: 'tps/entity-type/note',
            label: 'Project one',
            secondaryLabel: 'Projects/One.md',
            tooltip: 'Open Projects/One.md',
            sourcePath: 'Projects/One.md'
        });
        expect(rows[0]).not.toHaveProperty('sourceLineNumber');
        expect(rows[1]).toMatchObject({
            id: `${selectedLineTypeId}:${checkbox.locatorKey}`,
            kind: 'tps/entity-type/task',
            label: 'Ship the release',
            secondaryLabel: 'Tasks/Today.md · line 9',
            tooltip: 'Open Tasks/Today.md at line 9',
            sourcePath: 'Tasks/Today.md',
            sourceLineNumber: 8
        });
    });

    it.each([
        [TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, 'task'],
        [TPS_NAVIGATOR_TYPE_IDS.BULLETS, 'bullet'],
        [TPS_NAVIGATOR_TYPE_IDS.HEADINGS, 'heading']
    ] as const)('publishes repeated and blank raw line properties for %s rows', (selectedType, lineKind) => {
        const record = createRecord({
            id: lineKind,
            typeId: selectedType,
            entityType: 'block',
            lineKind,
            lineNumber: 2,
            properties: { Parents: ['Project A', '', 'Area B'], Empty: [''] }
        });

        const [result] = buildRows({ records: [record], selectedType });

        expect(result.properties).toEqual({ Parents: ['Project A', '', 'Area B'], Empty: [''] });
        expect(Object.isFrozen(result.properties)).toBe(true);
        expect(Object.values(result.properties ?? {}).every(value => !Array.isArray(value) || Object.isFrozen(value))).toBe(true);
    });

    it('does not publish record properties for Navigator-owned Markdown range rows', () => {
        const record = createRecord({
            id: 'web-link',
            typeId: TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS,
            entityType: 'block',
            lineKind: 'web-link',
            lineNumber: 2,
            properties: { secret: ['must-not-leak'] }
        });

        const [result] = buildRows({ records: [record], selectedType: TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS });

        expect(result.properties).toBeUndefined();
    });

    it('requires every case-insensitive search term while matching across both label and source path', () => {
        const matching = createRecord({ label: 'Buy weekly supplies', sourcePath: 'Shopping/Home.md' });
        const missingTerm = createRecord({
            id: 'work',
            label: 'Buy office supplies',
            sourcePath: 'Shopping/Work.md',
            locatorKey: 'note:Shopping/Work.md'
        });

        const rows = buildRows({ records: [matching, missingTerm], searchQuery: '  BUY   home  ' });

        expect(rows.map(row => row.label)).toEqual(['Buy weekly supplies']);
    });

    it('searches a web link only by its redacted origin without indexing path, credentials, query values, or fragments', () => {
        const webLink = createRecord({
            id: 'web-link',
            label: 'Product docs',
            lineKind: 'web-link',
            referenceTarget: 'https://user:password@example.com/docs/start?token=secret-token#private-fragment',
            searchText: 'https://example.com'
        });

        expect(buildRows({ records: [webLink], searchQuery: 'example.com' })).toHaveLength(1);
        expect(buildRows({ records: [webLink], searchQuery: 'start' })).toHaveLength(0);
        expect(buildRows({ records: [webLink], searchQuery: 'password' })).toHaveLength(0);
        expect(buildRows({ records: [webLink], searchQuery: 'secret-token' })).toHaveLength(0);
        expect(buildRows({ records: [webLink], searchQuery: 'private-fragment' })).toHaveLength(0);
    });

    it('enforces tag facets against authoritative task-local tags instead of the owning note', () => {
        const taskState = {
            lineNumber: 0,
            rawLine: '- [ ] Task',
            title: 'Task',
            checkbox: '[ ]',
            marker: ' ',
            status: 'todo',
            isComplete: false,
            fields: {},
            canMutateCheckbox: true,
            hasContextMenu: true
        } as const;
        const shopping = createRecord({
            id: 'shopping',
            label: 'Buy milk',
            sourcePath: 'Areas/Home.md',
            entityType: 'block',
            lineKind: 'task',
            task: { ...taskState, tags: ['shopping'] }
        });
        const work = createRecord({
            id: 'work',
            label: 'Buy servers',
            sourcePath: 'Areas/Work.md',
            locatorKey: 'task:work',
            entityType: 'block',
            lineKind: 'task',
            task: { ...taskState, tags: [] }
        });
        const query = '#shopping type:structural:task';

        const rows = buildRows({
            records: [shopping, work],
            searchQuery: query,
            searchTokens: parseFilterSearchTokens(query),
            allowedSourcePaths: new Set([shopping.sourcePath, work.sourcePath]),
            getNoteProperties: sourcePath => ({ tags: sourcePath === work.sourcePath ? ['shopping'] : [] }),
            linePropertyInheritance: 'line-first'
        });

        expect(rows.map(row => row.label)).toEqual(['Buy milk']);
    });

    it('supports nested, negative, and untagged task-local tag facets', () => {
        const createTask = (id: string, tags: readonly string[]) =>
            createRecord({
                id,
                locatorKey: `task:${id}`,
                label: id,
                entityType: 'block',
                lineKind: 'task',
                task: {
                    lineNumber: 0,
                    rawLine: `- [ ] ${id}`,
                    title: id,
                    checkbox: '[ ]',
                    marker: ' ',
                    status: 'todo',
                    isComplete: false,
                    tags,
                    fields: {},
                    canMutateCheckbox: true,
                    hasContextMenu: true
                }
            });
        const records = [createTask('nested', ['hca/support']), createTask('excluded', ['hca', 'blocked']), createTask('untagged', [])];

        expect(
            buildRows({
                records,
                searchQuery: '#hca -#blocked type:structural:task',
                searchTokens: parseFilterSearchTokens('#hca -#blocked type:structural:task')
            }).map(row => row.label)
        ).toEqual(['nested']);
        expect(
            buildRows({
                records,
                searchQuery: '-# type:structural:task',
                searchTokens: parseFilterSearchTokens('-# type:structural:task')
            }).map(row => row.label)
        ).toEqual(['untagged']);
    });

    it('applies positive and negative row text terms after folding', () => {
        const matching = createRecord({ id: 'matching', label: 'Résumé checklist', sourcePath: 'Work/One.md' });
        const excluded = createRecord({ id: 'excluded', label: 'Résumé archived checklist', sourcePath: 'Work/Two.md' });
        const query = 'resume -archived';

        const rows = buildRows({ records: [matching, excluded], searchQuery: query, searchTokens: parseFilterSearchTokens(query) });

        expect(rows.map(row => row.label)).toEqual(['Résumé checklist']);
    });

    it('matches checkbox status against effective line properties instead of requiring note frontmatter', () => {
        const todo = createRecord({
            id: 'todo',
            label: 'Open task',
            entityType: 'block',
            lineKind: 'task',
            task: {
                lineNumber: 0,
                rawLine: '- [ ] Open task',
                title: 'Open task',
                checkbox: '[ ]',
                marker: ' ',
                status: 'todo',
                isComplete: false,
                fields: {},
                canMutateCheckbox: true,
                hasContextMenu: true
            }
        });
        const complete = createRecord({
            ...todo,
            id: 'complete',
            locatorKey: 'complete',
            label: 'Closed task',
            task: { ...todo.task!, status: 'complete', isComplete: true }
        });
        const query = '.status=todo';

        const rows = buildRows({
            records: [todo, complete],
            searchQuery: query,
            searchTokens: parseFilterSearchTokens(query),
            getNoteProperties: () => ({ status: 'complete' }),
            linePropertyInheritance: 'line-first'
        });

        expect(rows.map(row => row.label)).toEqual(['Open task']);
    });

    it('does not use owning-note properties for task filtering unless inheritance is explicitly enabled', () => {
        const task = createRecord({ id: 'task', label: 'Task without local team' });
        const query = '.team=daily';
        const options = {
            records: [task],
            searchQuery: query,
            searchTokens: parseFilterSearchTokens(query),
            getNoteProperties: () => ({ team: 'daily' })
        };

        expect(buildRows(options)).toEqual([]);
        expect(buildRows({ ...options, linePropertyInheritance: 'line-first' }).map(row => row.label)).toEqual(['Task without local team']);
    });

    it('clears a raw owning-note tag from an explicitly untagged task row', () => {
        const task = createRecord({
            id: 'untagged-task',
            label: 'Untagged task',
            entityType: 'block',
            lineKind: 'task',
            properties: { tags: ['dailynote'] },
            task: {
                lineNumber: 0,
                rawLine: '- [ ] Untagged task',
                title: 'Untagged task',
                checkbox: '[ ]',
                marker: ' ',
                status: 'todo',
                isComplete: false,
                tags: [],
                fields: {},
                canMutateCheckbox: true,
                hasContextMenu: true
            }
        });

        const [result] = buildRows({ records: [task] });

        expect(result.properties).toMatchObject({ tags: [] });
        expect(result.properties?.tags).not.toContain('dailynote');
    });

    it('returns no rows when the selected collection does not match the Type facet', () => {
        const query = 'type:structural:heading';
        const rows = buildRows({ records: [createRecord()], searchQuery: query, searchTokens: parseFilterSearchTokens(query) });

        expect(rows).toEqual([]);
    });

    it('omits unavailable source status rows from mixed search sections', () => {
        const rows = buildRows({ availability: 'unavailable', includeUnavailableStatus: false });

        expect(rows).toEqual([]);
    });

    it('reports failed activation with the exact record and result but ignores successful activation', async () => {
        const failedRecord = createRecord({ id: 'failed' });
        const successfulRecord = createRecord({ id: 'successful', locatorKey: 'note:successful' });
        const failure = { ok: false, reason: 'Line moved' } as const;
        const activate = vi.fn(async (record: TpsNavigatorTypeRecord) =>
            record.id === failedRecord.id ? failure : ({ ok: true } as const)
        );
        const onActivationFailure = vi.fn();
        const rows = buildRows({ records: [failedRecord, successfulRecord], activate, onActivationFailure });

        await rows[0].activate?.();
        await rows[1].activate?.();

        expect(activate).toHaveBeenNthCalledWith(1, failedRecord);
        expect(activate).toHaveBeenNthCalledWith(2, successfulRecord);
        expect(onActivationFailure).toHaveBeenCalledOnce();
        expect(onActivationFailure).toHaveBeenCalledWith(failedRecord, failure);
    });

    it('returns no rows when the selected ready type has no records', () => {
        const rows = buildTypeProviderRows({
            snapshot: createSnapshot([createRecord()]),
            selectedType: TPS_NAVIGATOR_TYPE_IDS.HEADINGS,
            searchQuery: '',
            activate: async () => ({ ok: true }),
            setTaskCheckbox: async () => ({ ok: true }),
            addTaskContextMenuItems: () => true,
            onActivationFailure: () => undefined
        });

        expect(rows).toEqual([]);
    });

    it('decorates hydrated checkbox records with live GCM controls', async () => {
        const task = createRecord({
            id: 'task-one',
            label: 'Ship it',
            sourcePath: 'Tasks/Today.md',
            entityType: 'block',
            lineKind: 'task',
            lineNumber: 4,
            locatorKey: 'block:task-one',
            properties: {
                scheduled: ['2026-08-02 08:00:00'],
                PRIORITY: ['low', 'medium'],
                Status: ['waiting'],
                Parents: ['Project A', '', 'Area B']
            },
            task: {
                lineNumber: 3,
                rawLine: '- [ ] Ship it',
                title: 'Ship it',
                checkbox: '[ ]',
                marker: ' ',
                status: 'todo',
                isComplete: false,
                tags: ['hca'],
                fields: { Scheduled: '2026-08-03 09:30:00', Priority: 'high', status: 'working', Owner: '' },
                canMutateCheckbox: true,
                hasContextMenu: true
            }
        });
        const setTaskCheckbox = vi.fn(async () => ({ ok: true }) as const);
        const addTaskContextMenuItems = vi.fn(() => true);
        const rows = buildRows({ records: [task], setTaskCheckbox, addTaskContextMenuItems });

        expect(rows[0].indicator).toMatchObject({ type: 'checkbox', checked: false, marker: ' ' });
        expect(rows[0].properties).toEqual({
            scheduled: '2026-08-03 09:30:00',
            PRIORITY: 'high',
            Status: 'todo',
            tags: ['hca'],
            Parents: ['Project A', '', 'Area B'],
            Owner: ''
        });
        expect(Object.isFrozen(rows[0].properties)).toBe(true);
        expect(Object.isFrozen(rows[0].properties?.Parents)).toBe(true);
        await rows[0].indicator?.onChange?.(true);
        expect(setTaskCheckbox).toHaveBeenCalledWith(task, true);

        const menu = { addItem: vi.fn(), addSeparator: vi.fn() };
        rows[0].contextMenu?.({
            providerId: rows[0].providerId,
            rowId: rows[0].id,
            kind: rows[0].kind,
            sourcePath: rows[0].sourcePath,
            sourceLineNumber: rows[0].sourceLineNumber,
            ...menu
        });
        expect(addTaskContextMenuItems).toHaveBeenCalledWith(menu, task);
    });

    it('keeps non-task and unhydrated task records open-only', () => {
        const bullet = createRecord({ entityType: 'block', lineKind: 'bullet', lineNumber: 2 });
        const unhydratedTask = createRecord({
            id: 'task',
            locatorKey: 'block:task',
            entityType: 'block',
            lineKind: 'task',
            lineNumber: 3
        });

        const rows = buildRows({ records: [bullet, unhydratedTask] });
        expect(rows).toHaveLength(2);
        rows.forEach(row => {
            expect(row.indicator).toBeUndefined();
            expect(row.contextMenu).toBeUndefined();
        });
    });

    it('surfaces a task mutation failure so the shared optimistic checkbox UI can roll back', async () => {
        const task = createRecord({
            entityType: 'block',
            lineKind: 'task',
            lineNumber: 2,
            task: {
                lineNumber: 1,
                rawLine: '- [ ] Ship it',
                title: 'Ship it',
                checkbox: '[ ]',
                marker: ' ',
                status: 'todo',
                isComplete: false,
                canMutateCheckbox: true,
                hasContextMenu: false
            }
        });
        const rows = buildRows({
            records: [task],
            setTaskCheckbox: async () => ({ ok: false, reason: 'Task moved' })
        });

        await expect(rows[0].indicator?.onChange?.(true)).rejects.toThrow('Task moved');
    });
});
