import type { App } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { TypesAPI, type NavigatorTypesStore } from '../../src/api/modules/TypesAPI';
import type { NavigatorTypeProvider, NavigatorTypeProviderContext, NavigatorTypeProviderOptions } from '../../src/api/types';
import { NavigatorTypeProviderRegistry } from '../../src/services/types/NavigatorTypeProviderRegistry';
import type { TpsNavigatorTypeId, TpsNavigatorTypesSnapshot } from '../../src/types/navigatorTypes';

const app = {} as App;
const EMPTY_TYPES_SNAPSHOT: TpsNavigatorTypesSnapshot = Object.freeze({
    availability: 'unavailable',
    descriptors: Object.freeze([]),
    recordsByType: new Map<TpsNavigatorTypeId, readonly never[]>(),
    revision: 0,
    message: 'Built-in Types are unavailable.'
});

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(nextResolve => {
        resolve = nextResolve;
    });
    return { promise, resolve };
}

class FakeTypesStore implements NavigatorTypesStore {
    readonly setEnabled = vi.fn<(enabled: boolean) => void>();

    getSnapshot(): TpsNavigatorTypesSnapshot {
        return EMPTY_TYPES_SNAPSHOT;
    }

    subscribe(): () => void {
        return () => undefined;
    }
}

function createProvider(overrides: Partial<NavigatorTypeProvider> = {}): NavigatorTypeProvider {
    return {
        id: 'example/entities',
        getCollections: vi.fn(async () => [{ id: 'projects', label: 'Projects', icon: 'lucide-folder-kanban' }]),
        getRows: vi.fn(async () => []),
        ...overrides
    };
}

describe('Navigator Type provider pause lifecycle', () => {
    it('keeps API registrations and latest options inert while disabled, then resumes them on opt-in', async () => {
        const store = new FakeTypesStore();
        const registry = new NavigatorTypeProviderRegistry(app);
        const getCollections = vi.fn(async () => [{ id: 'projects', label: 'Projects', icon: 'lucide-folder-kanban' }]);
        const getRows = vi.fn(async () => []);
        const cleanup = vi.fn();
        const subscribe = vi.fn(
            (_context: NavigatorTypeProviderContext, _options: NavigatorTypeProviderOptions, _invalidate: () => void) => cleanup
        );
        const api = new TypesAPI(store, false, registry);

        const registration = api.registerProvider(createProvider({ getCollections, getRows, subscribe }), { mode: 'initial' });
        registration.updateOptions({ mode: 'latest' });
        const typeId = registration.getTypeId('projects')!;

        expect(store.setEnabled).toHaveBeenLastCalledWith(false);
        expect(getCollections).not.toHaveBeenCalled();
        expect(subscribe).not.toHaveBeenCalled();
        expect(cleanup).not.toHaveBeenCalled();
        expect(registry.getSnapshot()).toMatchObject({ descriptors: [], hasReadyProvider: false });
        expect(registry.getSnapshot().authoritativeSourceKeys).toHaveLength(0);
        await expect(
            api.queryProviderRows(typeId, {
                searchQuery: '',
                allowedVaultFilePaths: ['Projects/Allowed.md'],
                signal: new AbortController().signal
            })
        ).resolves.toEqual([]);
        expect(getRows).not.toHaveBeenCalled();

        api.updateEnabled(true);
        await vi.waitFor(() => expect(api.getProviderOwner(typeId)).not.toBeNull());

        expect(store.setEnabled).toHaveBeenLastCalledWith(true);
        expect(subscribe).toHaveBeenCalledOnce();
        expect(subscribe.mock.calls[0]?.[1]).toEqual({ mode: 'latest' });
        expect(getCollections).toHaveBeenCalledOnce();
        expect(getCollections.mock.calls[0]?.[1]).toEqual({ mode: 'latest' });
        expect(api.getProviderOwner(typeId)?.options).toEqual({ mode: 'latest' });
        expect(api.getSnapshot().descriptors.map(item => item.id)).toContain(typeId);

        api.updateEnabled(false);

        expect(cleanup).toHaveBeenCalledOnce();
        expect(api.getSnapshot()).toMatchObject({ availability: 'disabled', descriptors: [] });
        expect(api.getProviderOwner(typeId)).toBeNull();
        expect(registry.getSnapshot()).toMatchObject({ descriptors: [], hasReadyProvider: false });
        expect(registry.getSnapshot().authoritativeSourceKeys).toHaveLength(0);
        api.dispose();
    });

    it('cancels catalog and row work, clears authority, and rejects late results across a disable cycle', async () => {
        const lateCatalog = deferred<readonly { id: string; label: string; icon: string }[]>();
        let invalidate: (() => void) | null = null;
        const cleanup = vi.fn();
        const subscribe = vi.fn(
            (_context: NavigatorTypeProviderContext, _options: NavigatorTypeProviderOptions, nextInvalidate: () => void) => {
                invalidate = nextInvalidate;
                return cleanup;
            }
        );
        const getCollections = vi
            .fn<NavigatorTypeProvider['getCollections']>()
            .mockResolvedValueOnce([{ id: 'projects', label: 'Projects', icon: 'lucide-folder-kanban' }])
            .mockReturnValueOnce(lateCatalog.promise)
            .mockResolvedValueOnce([{ id: 'contexts', label: 'Contexts', icon: 'lucide-at-sign' }]);
        const rowSignals: AbortSignal[] = [];
        const getRows = vi.fn<NavigatorTypeProvider['getRows']>(
            (_collectionId, context) =>
                new Promise<readonly never[]>(() => {
                    rowSignals.push(context.signal);
                })
        );
        const registry = new NavigatorTypeProviderRegistry(app);
        const registration = registry.register(createProvider({ getCollections, getRows, subscribe }));
        const projectsTypeId = registration.getTypeId('projects')!;
        const contextsTypeId = registration.getTypeId('contexts')!;
        await vi.waitFor(() => expect(registry.getOwner(projectsTypeId)).not.toBeNull());

        invalidate?.();
        await vi.waitFor(() => expect(getCollections).toHaveBeenCalledTimes(2));
        const rowQuery = registry.queryRows(projectsTypeId, {
            searchQuery: '',
            allowedVaultFilePaths: ['Projects/Allowed.md'],
            signal: new AbortController().signal
        });
        await vi.waitFor(() => expect(rowSignals).toHaveLength(1));

        registry.setEnabled(false);

        await expect(rowQuery).resolves.toEqual([]);
        expect(rowSignals[0]?.aborted).toBe(true);
        expect(getCollections.mock.calls[1]?.[0].signal.aborted).toBe(true);
        expect(cleanup).toHaveBeenCalledOnce();
        expect(registry.getOwner(projectsTypeId)).toBeNull();
        expect(registry.getSnapshot()).toMatchObject({ descriptors: [], hasReadyProvider: false });
        expect(registry.getSnapshot().authoritativeSourceKeys).toHaveLength(0);
        const disabledRevision = registry.getSnapshot().revision;

        lateCatalog.resolve([{ id: 'stale', label: 'Stale', icon: 'lucide-x' }]);
        await Promise.resolve();
        await Promise.resolve();
        expect(registry.getSnapshot().revision).toBe(disabledRevision);
        expect(registry.getSnapshot().descriptors).toEqual([]);

        registry.setEnabled(true);
        await vi.waitFor(() => expect(registry.getOwner(contextsTypeId)).not.toBeNull());

        expect(subscribe).toHaveBeenCalledTimes(2);
        expect(getCollections).toHaveBeenCalledTimes(3);
        expect(registry.getOwner(projectsTypeId)).toBeNull();
        expect(registry.getSnapshot().descriptors.map(item => item.providerCollectionId)).toEqual(['contexts']);
        registry.dispose();
    });
});
