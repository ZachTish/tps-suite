import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TypesAPI, type NavigatorTypesStore } from '../../src/api/modules/TypesAPI';
import { NavigatorTypeProviderRegistry } from '../../src/services/types/NavigatorTypeProviderRegistry';
import { getTpsNavigatorProviderSourceKey } from '../../src/types/navigatorTypes';
import type {
    TpsNavigatorTypeDescriptor,
    TpsNavigatorTypeId,
    TpsNavigatorTypeRecord,
    TpsNavigatorTypesSnapshot
} from '../../src/types/navigatorTypes';

const EMPTY_RECORDS = new Map<TpsNavigatorTypeId, readonly never[]>();

function descriptor(overrides: Partial<TpsNavigatorTypeDescriptor> = {}): TpsNavigatorTypeDescriptor {
    return {
        id: 'structural:task',
        label: 'Checkboxes',
        icon: 'lucide-square-check-big',
        category: 'structure',
        count: 12,
        ...overrides
    };
}

function legacyKindDescriptor(id = 'kind:project'): TpsNavigatorTypeDescriptor {
    return {
        id,
        label: 'Projects',
        icon: 'lucide-box',
        category: 'structure',
        count: 4
    } as unknown as TpsNavigatorTypeDescriptor;
}

function legacyKindRecord(typeId = 'kind:project'): TpsNavigatorTypeRecord {
    return {
        id: 'legacy-project',
        typeId,
        label: 'Legacy project',
        sourcePath: 'Projects/Legacy.md',
        entityType: 'note',
        locatorKey: 'note:Projects/Legacy.md',
        referenceTarget: 'Projects/Legacy.md'
    } as unknown as TpsNavigatorTypeRecord;
}

function snapshot(
    availability: TpsNavigatorTypesSnapshot['availability'],
    descriptors: readonly TpsNavigatorTypeDescriptor[] = [],
    revision = 0,
    message?: string
): TpsNavigatorTypesSnapshot {
    return {
        availability,
        descriptors,
        recordsByType: EMPTY_RECORDS,
        revision,
        ...(message === undefined ? {} : { message })
    };
}

class FakeStore implements NavigatorTypesStore {
    private readonly listeners = new Set<() => void>();
    readonly subscribeCalls = vi.fn();
    readonly unsubscribeCalls = vi.fn();
    readonly setEnabled = vi.fn<(enabled: boolean) => void>();

    constructor(private current: TpsNavigatorTypesSnapshot) {}

    getSnapshot(): TpsNavigatorTypesSnapshot {
        return this.current;
    }

    subscribe(listener: () => void): () => void {
        this.subscribeCalls();
        this.listeners.add(listener);
        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            this.listeners.delete(listener);
            this.unsubscribeCalls();
        };
    }

    publish(next: TpsNavigatorTypesSnapshot): void {
        this.current = next;
        [...this.listeners].forEach(listener => listener());
    }
}

describe('TypesAPI', () => {
    it('provides stable fixed ids while retaining deprecated Kind syntax helpers', () => {
        const api = new TypesAPI(new FakeStore(snapshot('loading')));

        expect(api.notesId).toBe('entity:note');
        expect(api.checkboxesId).toBe('structural:task');
        expect(api.bulletsId).toBe('structural:bullet');
        expect(api.headingsId).toBe('structural:heading');
        expect(api.codeBlocksId).toBe('structural:code-block');
        expect(api.calloutsId).toBe('structural:callout');
        expect(api.blockquotesId).toBe('structural:blockquote');
        expect(api.tablesId).toBe('structural:table');
        expect(api.webLinksId).toBe('structural:web-link');
        expect(api.basesId).toBe('file:base');
        expect(api.canvasId).toBe('file:canvas');
        expect(api.drawingsId).toBe('file:drawing');
        expect(api.pdfsId).toBe('file:pdf');
        expect(api.imagesId).toBe('file:image');
        expect(api.audioId).toBe('file:audio');
        expect(api.videoId).toBe('file:video');
        expect(api.buildKind('Project objective')).toBe('kind:Project%20objective');
        expect(api.buildKind('   ')).toBeNull();
        expect(api.parseKind('kind:Project%20objective')).toBe('Project objective');
        expect(api.parseKind('structural:task')).toBeNull();
        expect(api.parseKind(null as never)).toBeNull();
        expect(api.isType('file:drawing')).toBe(true);
        expect(api.isType('kind:Project%20objective')).toBe(false);
        expect(api.isType('kind:')).toBe(false);
        expect(api.isType(null)).toBe(false);
    });

    it('returns cached immutable DTOs without records, counts, or legacy Kind descriptors', () => {
        const activeRecord: TpsNavigatorTypeRecord = {
            id: 'active-task',
            typeId: 'structural:task',
            label: 'Active task',
            sourcePath: 'Tasks/Active.md',
            entityType: 'block',
            lineKind: 'task',
            lineNumber: 1,
            locatorKey: 'task:Tasks/Active.md:1',
            referenceTarget: 'Tasks/Active.md'
        };
        const source = {
            ...snapshot(
                'ready',
                [descriptor(), legacyKindDescriptor(), descriptor({ id: 'file:base', label: 'Bases', icon: 'lucide-table-2', count: 2 })],
                8
            ),
            recordsByType: new Map([
                ['structural:task', [activeRecord]],
                ['kind:project', [legacyKindRecord()]]
            ]) as unknown as TpsNavigatorTypesSnapshot['recordsByType']
        };
        const store = new FakeStore(source);
        const api = new TypesAPI(store);

        const first = api.getSnapshot();
        const second = api.getSnapshot();

        expect(second).toBe(first);
        expect(first).toEqual({
            availability: 'ready',
            descriptors: [
                { id: 'structural:task', label: 'Checkboxes', icon: 'lucide-square-check-big', category: 'structure' },
                { id: 'file:base', label: 'Bases', icon: 'lucide-table-2', category: 'structure' }
            ],
            revision: 8
        });
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.descriptors)).toBe(true);
        expect(first.descriptors.every(item => Object.isFrozen(item))).toBe(true);
        expect('recordsByType' in first).toBe(false);
        expect('count' in first.descriptors[0]).toBe(false);
        expect([...api.getInternalSnapshot().recordsByType]).toEqual([['structural:task', [activeRecord]]]);

        store.publish(snapshot('error', [], 8, 'Index failed.'));
        expect(api.getSnapshot()).toEqual({ availability: 'error', descriptors: [], revision: 8, message: 'Index failed.' });
        expect(api.getSnapshot()).not.toBe(first);
    });

    it('keeps the fixed catalog ready while exact-line availability is guarded independently', async () => {
        const source: TpsNavigatorTypesSnapshot = {
            ...snapshot(
                'ready',
                [descriptor({ id: 'entity:note', label: 'Notes', icon: 'lucide-file-text', count: 3 }), descriptor({ count: 0 })],
                12
            ),
            builtinAvailability: 'ready',
            lineAvailability: 'unavailable',
            lineMessage: 'Exact-line items require TPS Global Context Menu.',
            markdownAvailability: 'error',
            markdownMessage: 'Markdown structures could not be indexed.'
        };
        const store = new FakeStore(source);
        const api = new TypesAPI(store);

        const publicSnapshot = api.getSnapshot();

        expect(publicSnapshot).toEqual({
            availability: 'ready',
            descriptors: [
                { id: 'entity:note', label: 'Notes', icon: 'lucide-file-text', category: 'structure' },
                { id: 'structural:task', label: 'Checkboxes', icon: 'lucide-square-check-big', category: 'structure' }
            ],
            revision: 12
        });
        expect('lineAvailability' in publicSnapshot).toBe(false);
        expect(api.getInternalSnapshot()).toMatchObject({
            availability: 'ready',
            builtinAvailability: 'ready',
            lineAvailability: 'unavailable',
            lineMessage: 'Exact-line items require TPS Global Context Menu.',
            markdownAvailability: 'error',
            markdownMessage: 'Markdown structures could not be indexed.'
        });
        expect(api.getInternalSnapshot().authoritativeSourceKeys).toContain('builtin');
        await expect(api.whenReady()).resolves.toBe(publicSnapshot);
        expect(store.subscribeCalls).not.toHaveBeenCalled();
    });

    it('immediately emits to subscribers while sharing one underlying subscription', () => {
        const store = new FakeStore(snapshot('loading', [descriptor()], 0, 'Loading types…'));
        const api = new TypesAPI(store);
        const first = vi.fn();
        const second = vi.fn();

        const unsubscribeFirst = api.subscribe(first);
        const unsubscribeSecond = api.subscribe(second);

        expect(store.subscribeCalls).toHaveBeenCalledOnce();
        expect(first).toHaveBeenCalledOnce();
        expect(second).toHaveBeenCalledOnce();
        expect(first.mock.calls[0][0]).toMatchObject({ availability: 'loading', revision: 0 });

        store.publish(snapshot('ready', [descriptor()], 2));
        expect(first).toHaveBeenCalledTimes(2);
        expect(second).toHaveBeenCalledTimes(2);
        expect(first.mock.calls[1][0]).toMatchObject({ availability: 'ready', revision: 2 });

        unsubscribeFirst();
        unsubscribeFirst();
        expect(store.unsubscribeCalls).not.toHaveBeenCalled();
        unsubscribeSecond();
        unsubscribeSecond();
        expect(store.unsubscribeCalls).toHaveBeenCalledOnce();
    });

    it('isolates subscriber failures during immediate and later catalog delivery', () => {
        const store = new FakeStore(snapshot('loading'));
        const api = new TypesAPI(store);
        const throwingListener = vi.fn(() => {
            throw new Error('consumer failed');
        });
        const healthyListener = vi.fn();

        let unsubscribeThrowing: (() => void) | undefined;
        expect(() => {
            unsubscribeThrowing = api.subscribe(throwingListener);
        }).not.toThrow();
        const unsubscribeHealthy = api.subscribe(healthyListener);

        expect(throwingListener).toHaveBeenCalledOnce();
        expect(healthyListener).toHaveBeenCalledOnce();
        expect(store.subscribeCalls).toHaveBeenCalledOnce();

        expect(() => store.publish(snapshot('ready', [descriptor()], 1))).not.toThrow();
        expect(throwingListener).toHaveBeenCalledTimes(2);
        expect(healthyListener).toHaveBeenCalledTimes(2);

        unsubscribeThrowing?.();
        expect(store.unsubscribeCalls).not.toHaveBeenCalled();
        unsubscribeHealthy();
        expect(store.unsubscribeCalls).toHaveBeenCalledOnce();

        api.dispose();
        expect(() => api.subscribe(throwingListener)).not.toThrow();
        expect(throwingListener).toHaveBeenCalledTimes(3);
    });

    it('resolves readiness on the first terminal success or failure snapshot and releases its temporary subscription', async () => {
        const store = new FakeStore(snapshot('loading'));
        const api = new TypesAPI(store);

        const ready = api.whenReady();
        expect(store.subscribeCalls).toHaveBeenCalledOnce();
        store.publish(snapshot('unavailable', [descriptor()], 0, 'GCM is unavailable.'));

        await expect(ready).resolves.toEqual({
            availability: 'unavailable',
            descriptors: [{ id: 'structural:task', label: 'Checkboxes', icon: 'lucide-square-check-big', category: 'structure' }],
            revision: 0,
            message: 'GCM is unavailable.'
        });
        expect(store.unsubscribeCalls).toHaveBeenCalledOnce();

        await expect(api.whenReady()).resolves.toMatchObject({ availability: 'unavailable' });
    });

    it('publishes enabled changes, keeps disabled reads inert, and fails closed after disposal', async () => {
        const store = new FakeStore(snapshot('loading'));
        const api = new TypesAPI(store, false);
        const listener = vi.fn();
        const unsubscribe = api.subscribe(listener);

        expect(listener).toHaveBeenLastCalledWith({
            availability: 'disabled',
            descriptors: [],
            revision: 0,
            message: 'Types navigation is disabled.'
        });
        expect(store.subscribeCalls).not.toHaveBeenCalled();
        expect(store.setEnabled).toHaveBeenLastCalledWith(false);
        await expect(api.whenReady()).resolves.toMatchObject({ availability: 'disabled' });

        store.publish(snapshot('loading'));
        api.updateEnabled(true);
        expect(store.setEnabled).toHaveBeenLastCalledWith(true);
        expect(store.subscribeCalls).toHaveBeenCalledOnce();
        expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ availability: 'loading' }));

        store.publish(snapshot('ready', [descriptor()], 3));
        expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ availability: 'ready', revision: 3 }));

        api.updateEnabled(false);
        expect(store.setEnabled).toHaveBeenLastCalledWith(false);
        expect(store.unsubscribeCalls).toHaveBeenCalledOnce();
        expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ availability: 'disabled' }));

        store.publish(snapshot('loading'));
        api.updateEnabled(true);
        const pending = api.whenReady();
        expect(store.subscribeCalls).toHaveBeenCalledTimes(2);
        api.dispose();
        api.dispose();

        await expect(pending).resolves.toMatchObject({
            availability: 'unavailable',
            message: 'The Types catalog is unavailable after plugin unload.'
        });
        expect(store.unsubscribeCalls).toHaveBeenCalledTimes(2);
        expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ availability: 'unavailable' }));

        const afterDispose = vi.fn();
        const unsubscribeAfterDispose = api.subscribe(afterDispose);
        expect(afterDispose).toHaveBeenCalledOnce();
        expect(afterDispose).toHaveBeenCalledWith(expect.objectContaining({ availability: 'unavailable' }));
        unsubscribeAfterDispose();
        unsubscribe();
        api.updateEnabled(false);
        expect(store.subscribeCalls).toHaveBeenCalledTimes(2);
    });

    it('composes external collections independently from built-in readiness without emitting legacy Kinds', async () => {
        const store = new FakeStore(snapshot('unavailable', [descriptor(), legacyKindDescriptor()], 3, 'GCM is unavailable.'));
        const registry = new NavigatorTypeProviderRegistry({} as App);
        const api = new TypesAPI(store, true, registry);
        const registration = api.registerProvider({
            id: 'example/entities',
            getCollections: async () => [{ id: 'events', label: 'Events', icon: 'lucide-calendar' }],
            getRows: async () => []
        });

        await vi.waitFor(() => expect(api.getSnapshot().descriptors).toHaveLength(2));
        expect(api.getSnapshot()).toMatchObject({
            availability: 'ready',
            descriptors: [
                { id: 'structural:task' },
                {
                    id: 'provider:example%2Fentities:events',
                    label: 'Events',
                    category: 'structure',
                    providerId: 'example/entities',
                    providerCollectionId: 'events'
                }
            ]
        });
        const internal = api.getInternalSnapshot();
        expect(internal.builtinAvailability).toBe('unavailable');
        expect(internal.authoritativeSourceKeys).not.toContain('builtin');
        expect(internal.authoritativeSourceKeys).toContain(getTpsNavigatorProviderSourceKey('example/entities'));

        registration.unregister();
        expect(api.getSnapshot().descriptors.map(item => item.id)).toEqual(['structural:task']);
        expect(api.getInternalSnapshot().authoritativeSourceKeys).toContain(getTpsNavigatorProviderSourceKey('example/entities'));
    });
});
