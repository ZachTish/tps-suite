import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import type { NavigatorTypeProvider, NavigatorTypeProviderContext, NavigatorTypeProviderOptions } from '../../src/api/types';
import {
    NAVIGATOR_TYPE_PROVIDER_QUERY_TIMEOUT_MS,
    NavigatorTypeProviderRegistry
} from '../../src/services/types/NavigatorTypeProviderRegistry';
import {
    createTpsNavigatorProviderTypeId,
    getTpsNavigatorProviderSourceKey,
    parseTpsNavigatorProviderTypeId
} from '../../src/types/navigatorTypes';

const app = {} as App;

function provider(overrides: Partial<NavigatorTypeProvider> = {}): NavigatorTypeProvider {
    return {
        id: 'example/entities',
        getCollections: vi.fn(async () => [{ id: 'projects', label: 'Projects', icon: 'lucide-folder-kanban' }]),
        getRows: vi.fn(async () => []),
        ...overrides
    };
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('NavigatorTypeProviderRegistry', () => {
    it('host-generates canonical collision-free IDs and round-trips provider ownership', () => {
        const first = createTpsNavigatorProviderTypeId('example/entities', 'projects');
        const second = createTpsNavigatorProviderTypeId('other/entities', 'projects');

        expect(first).toBe('provider:example%2Fentities:projects');
        expect(second).not.toBe(first);
        expect(parseTpsNavigatorProviderTypeId(first!)).toEqual({ providerId: 'example/entities', collectionId: 'projects' });
        expect(createTpsNavigatorProviderTypeId('plain', 'projects')).toBeNull();
        expect(createTpsNavigatorProviderTypeId('example/entities', 'Project')).toBeNull();
        expect(parseTpsNavigatorProviderTypeId('provider:example%2fentities:projects')).toBeNull();
    });

    it('registers an async catalog in stable order, freezes DTOs, and exposes its row owner', async () => {
        const registry = new NavigatorTypeProviderRegistry(app);
        const getCollections = vi.fn(async () => [
            { id: 'projects', label: 'Projects', icon: 'lucide-folder-kanban' },
            { id: 'contexts', label: 'Contexts', icon: 'lucide-at-sign' }
        ]);
        const getRows = vi.fn(async () => []);
        const registration = registry.register(provider({ getCollections, getRows }), { includeArchived: false });

        expect(registration.getTypeId('projects')).toBe('provider:example%2Fentities:projects');
        expect(registration.getTypeId('Project')).toBeNull();
        await vi.waitFor(() => expect(registry.getSnapshot().descriptors).toHaveLength(2));

        const snapshot = registry.getSnapshot();
        expect(snapshot.descriptors.map(item => item.id)).toEqual([
            'provider:example%2Fentities:projects',
            'provider:example%2Fentities:contexts'
        ]);
        expect(snapshot.descriptors[0]).toMatchObject({
            category: 'structure',
            showCount: false,
            providerId: 'example/entities',
            providerCollectionId: 'projects'
        });
        expect(Object.isFrozen(snapshot.descriptors)).toBe(true);
        expect(Object.isFrozen(snapshot.descriptors[0])).toBe(true);
        expect(snapshot.authoritativeSourceKeys).toContain(getTpsNavigatorProviderSourceKey('example/entities'));

        const owner = registry.getOwner(snapshot.descriptors[0].id);
        expect(owner?.providerId).toBe('example/entities');
        expect(owner?.collectionId).toBe('projects');
        expect(owner?.provider).toBeDefined();
        expect(owner?.options).toEqual({ includeArchived: false });
        expect(Object.isFrozen(owner?.options)).toBe(true);
    });

    it('rejects invalid surfaces atomically and isolates duplicate providers', () => {
        const registry = new NavigatorTypeProviderRegistry(app);

        expect(() => registry.register(provider({ id: 'plain' }))).toThrow(/namespaced/u);
        expect(() => registry.register(provider({ getCollections: undefined as never }))).toThrow(/getCollections/u);
        expect(() => registry.register(provider(), null as never)).toThrow(/options/u);
        expect(registry.getSnapshot().descriptors).toEqual([]);

        registry.register(provider());
        expect(() => registry.register(provider())).toThrow(/already registered/u);
    });

    it('retains the last good catalog when a later invalidation fails and refreshes rows immediately', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        let invalidate: (() => void) | null = null;
        let fail = false;
        const cleanup = vi.fn();
        const registry = new NavigatorTypeProviderRegistry(app);
        const registration = registry.register(
            provider({
                getCollections: vi.fn(async () => {
                    if (fail) {
                        return [{ id: 'Duplicate', label: 'Bad', icon: 'lucide-x' }];
                    }
                    return [{ id: 'projects', label: 'Projects', icon: 'lucide-folder-kanban' }];
                }),
                subscribe: vi.fn(
                    (_context: NavigatorTypeProviderContext, _options: NavigatorTypeProviderOptions, nextInvalidate: () => void) => {
                        invalidate = nextInvalidate;
                        return cleanup;
                    }
                )
            })
        );
        await vi.waitFor(() => expect(registry.getSnapshot().descriptors).toHaveLength(1));
        const ownerBefore = registry.getOwner(registration.getTypeId('projects')!);

        fail = true;
        invalidate?.();
        await vi.waitFor(() => expect(warn).toHaveBeenCalled());

        expect(registry.getSnapshot().descriptors).toHaveLength(1);
        expect(registry.getSnapshot().descriptors[0].label).toBe('Projects');
        expect(registry.getOwner(registration.getTypeId('projects')!)?.revision).toBe((ownerBefore?.revision ?? 0) + 1);
        expect(cleanup).not.toHaveBeenCalled();
    });

    it('publishes one row revision without a second catalog publication when an invalidation returns the same catalog', async () => {
        let invalidate: (() => void) | null = null;
        const getCollections = vi.fn(async () => [{ id: 'projects', label: 'Projects', icon: 'lucide-folder-kanban' }]);
        const registry = new NavigatorTypeProviderRegistry(app);
        const registration = registry.register(
            provider({
                getCollections,
                subscribe: (_context, _options, nextInvalidate) => {
                    invalidate = nextInvalidate;
                }
            })
        );
        const typeId = registration.getTypeId('projects')!;
        await vi.waitFor(() => expect(registry.getOwner(typeId)).not.toBeNull());
        const snapshotRevision = registry.getSnapshot().revision;
        const ownerRevision = registry.getOwner(typeId)?.revision ?? 0;

        invalidate?.();
        await vi.waitFor(() => expect(getCollections).toHaveBeenCalledTimes(2));
        await Promise.resolve();
        await Promise.resolve();

        expect(registry.getSnapshot().revision).toBe(snapshotRevision + 1);
        expect(registry.getOwner(typeId)?.revision).toBe(ownerRevision + 1);
    });

    it('queries owner rows with search and visibility context, preserving guarded actions and dropping orphan paths', async () => {
        const activate = vi.fn();
        const onChange = vi.fn();
        const contextMenu = vi.fn();
        const getRows = vi.fn<NavigatorTypeProvider['getRows']>(async () => [
            {
                id: 'allowed',
                kind: 'example/project',
                label: 'Allowed project',
                sourcePath: 'Projects/Allowed.md',
                sourceLineNumber: 4,
                activate,
                indicator: { type: 'checkbox', checked: false, marker: '/', onChange },
                contextMenu
            },
            { id: 'orphan', kind: 'example/project', label: 'Hidden project', sourcePath: 'Projects/Hidden.md' },
            { id: 'allowed', kind: 'example/project', label: 'Duplicate', sourcePath: 'Projects/Allowed.md' }
        ]);
        const registry = new NavigatorTypeProviderRegistry(app);
        const registration = registry.register(provider({ getRows }), { mode: 'active' });
        const typeId = registration.getTypeId('projects')!;
        await vi.waitFor(() => expect(registry.getOwner(typeId)).not.toBeNull());
        const abortController = new AbortController();

        const rows = await registry.queryRows(typeId, {
            searchQuery: 'roadmap',
            allowedVaultFilePaths: ['Projects/Allowed.md'],
            signal: abortController.signal
        });

        expect(getRows).toHaveBeenCalledWith(
            'projects',
            expect.objectContaining({
                app,
                typeId,
                searchQuery: 'roadmap',
                allowedVaultFilePaths: ['Projects/Allowed.md']
            }),
            { mode: 'active' }
        );
        const providerContext = getRows.mock.calls[0]?.[1];
        expect(providerContext?.signal).toBeInstanceOf(AbortSignal);
        expect(Object.isFrozen(providerContext)).toBe(true);
        expect(Object.isFrozen(providerContext?.allowedVaultFilePaths)).toBe(true);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            providerId: 'example/entities',
            id: 'allowed',
            sourceLineNumber: 4,
            activate,
            contextMenu,
            indicator: { marker: '/', onChange }
        });
    });

    it('aborts superseded owner-row work and enforces the shared five-second query boundary', async () => {
        const getRows = vi.fn(() => new Promise<readonly never[]>(() => undefined));
        const registry = new NavigatorTypeProviderRegistry(app);
        const registration = registry.register(provider({ getRows }));
        const typeId = registration.getTypeId('projects')!;
        await vi.waitFor(() => expect(registry.getOwner(typeId)).not.toBeNull());

        const externalAbort = new AbortController();
        const abortedQuery = registry.queryRows(typeId, {
            searchQuery: '',
            allowedVaultFilePaths: ['Projects/Allowed.md'],
            signal: externalAbort.signal
        });
        externalAbort.abort();
        await expect(abortedQuery).rejects.toThrow(/aborted/u);

        vi.useFakeTimers();
        const timeoutQuery = registry.queryRows(typeId, {
            searchQuery: '',
            allowedVaultFilePaths: ['Projects/Allowed.md'],
            signal: new AbortController().signal
        });
        const timeoutExpectation = expect(timeoutQuery).rejects.toThrow(/timed out/u);
        await vi.advanceTimersByTimeAsync(NAVIGATOR_TYPE_PROVIDER_QUERY_TIMEOUT_MS);
        await timeoutExpectation;
    });

    it('cancels and discards owner-row work when options change, a provider unregisters, or the registry unloads', async () => {
        const rowSignals: AbortSignal[] = [];
        const getRows = vi.fn<NavigatorTypeProvider['getRows']>(
            (_collectionId, context) =>
                new Promise<readonly never[]>(() => {
                    rowSignals.push(context.signal);
                })
        );
        const registry = new NavigatorTypeProviderRegistry(app);
        const registration = registry.register(provider({ getRows }), { mode: 'first' });
        const typeId = registration.getTypeId('projects')!;
        await vi.waitFor(() => expect(registry.getOwner(typeId)).not.toBeNull());

        const firstQuery = registry.queryRows(typeId, {
            searchQuery: '',
            allowedVaultFilePaths: ['Projects/Allowed.md'],
            signal: new AbortController().signal
        });
        await vi.waitFor(() => expect(rowSignals).toHaveLength(1));
        registration.updateOptions({ mode: 'second' });
        await expect(firstQuery).resolves.toEqual([]);
        expect(rowSignals[0].aborted).toBe(true);

        await vi.waitFor(() => expect(registry.getOwner(typeId)?.options).toEqual({ mode: 'second' }));
        const secondQuery = registry.queryRows(typeId, {
            searchQuery: '',
            allowedVaultFilePaths: ['Projects/Allowed.md'],
            signal: new AbortController().signal
        });
        await vi.waitFor(() => expect(rowSignals).toHaveLength(2));
        registration.unregister();
        await expect(secondQuery).resolves.toEqual([]);
        expect(rowSignals[1].aborted).toBe(true);

        const secondRegistry = new NavigatorTypeProviderRegistry(app);
        const secondRegistration = secondRegistry.register(provider({ id: 'example/dispose', getRows }));
        const secondTypeId = secondRegistration.getTypeId('projects')!;
        await vi.waitFor(() => expect(secondRegistry.getOwner(secondTypeId)).not.toBeNull());
        const thirdQuery = secondRegistry.queryRows(secondTypeId, {
            searchQuery: '',
            allowedVaultFilePaths: ['Projects/Allowed.md'],
            signal: new AbortController().signal
        });
        await vi.waitFor(() => expect(rowSignals).toHaveLength(3));
        secondRegistry.dispose();
        await expect(thirdQuery).resolves.toEqual([]);
        expect(rowSignals[2].aborted).toBe(true);
    });

    it('captures provider identity at registration even if external code mutates the provider object', async () => {
        let invalidate: (() => void) | null = null;
        const getCollections = vi.fn(async () => [{ id: 'projects', label: 'Projects', icon: 'lucide-folder-kanban' }]);
        const mutableProvider = provider({
            getCollections,
            subscribe: (_context, _options, nextInvalidate) => {
                invalidate = nextInvalidate;
            }
        });
        const registry = new NavigatorTypeProviderRegistry(app);
        const registration = registry.register(mutableProvider, { mode: 'first' });
        (mutableProvider as { id: string }).id = 'mutated/identity';

        await vi.waitFor(() => expect(registry.getSnapshot().descriptors).toHaveLength(1));
        expect(registration.id).toBe('example/entities');
        expect(registration.getTypeId('projects')).toBe('provider:example%2Fentities:projects');
        expect(registry.getSnapshot().descriptors[0].providerId).toBe('example/entities');

        invalidate?.();
        await vi.waitFor(() => expect(getCollections).toHaveBeenCalledTimes(2));
        registration.updateOptions({ mode: 'second' });
        await vi.waitFor(() => expect(getCollections).toHaveBeenCalledTimes(3));
        expect(getCollections.mock.calls[2]?.[1]).toEqual({ mode: 'second' });

        registration.unregister();
        expect(registration.getTypeId('projects')).toBeNull();
        expect(registry.getSnapshot().descriptors).toEqual([]);
        expect(registry.getSnapshot().authoritativeSourceKeys).toContain(getTpsNavigatorProviderSourceKey('example/entities'));
    });

    it('replaces options and subscriptions, suppresses stale queries, and makes handles inert after unregister', async () => {
        let resolveFirst: ((value: readonly { id: string; label: string; icon: string }[]) => void) | null = null;
        const firstQuery = new Promise<readonly { id: string; label: string; icon: string }[]>(resolve => {
            resolveFirst = resolve;
        });
        const cleanup = vi.fn();
        const getCollections = vi
            .fn<NavigatorTypeProvider['getCollections']>()
            .mockReturnValueOnce(firstQuery)
            .mockResolvedValueOnce([{ id: 'contexts', label: 'Contexts', icon: 'lucide-at-sign' }]);
        const registry = new NavigatorTypeProviderRegistry(app);
        const registration = registry.register(provider({ getCollections, subscribe: vi.fn(() => cleanup) }), { mode: 'first' });

        registration.updateOptions({ mode: 'second' });
        await vi.waitFor(() => expect(registry.getSnapshot().descriptors[0]?.providerCollectionId).toBe('contexts'));
        resolveFirst?.([{ id: 'projects', label: 'Projects', icon: 'lucide-folder-kanban' }]);
        await Promise.resolve();
        await Promise.resolve();
        expect(registry.getSnapshot().descriptors.map(item => item.providerCollectionId)).toEqual(['contexts']);
        expect(cleanup).toHaveBeenCalledOnce();

        const removedTypeId = registration.getTypeId('contexts')!;
        registration.unregister();
        registration.unregister();
        registration.updateOptions({ mode: 'ignored' });
        expect(registration.getTypeId('contexts')).toBeNull();
        expect(registry.getSnapshot().descriptors).toEqual([]);
        expect(registry.getSnapshot().authoritativeSourceKeys).toContain(getTpsNavigatorProviderSourceKey('example/entities'));
        expect(registry.getOwner(removedTypeId)).toBeNull();
        expect(cleanup).toHaveBeenCalledTimes(2);
    });

    it('suppresses invalidations fired by a subscription while that subscription is being cleaned up', async () => {
        const getCollections = vi.fn(async () => [{ id: 'projects', label: 'Projects', icon: 'lucide-folder-kanban' }]);
        const registry = new NavigatorTypeProviderRegistry(app);
        const registration = registry.register(
            provider({
                getCollections,
                subscribe: (_context, _options, invalidate) => () => invalidate()
            })
        );
        await vi.waitFor(() => expect(registry.getSnapshot().descriptors).toHaveLength(1));
        expect(getCollections).toHaveBeenCalledOnce();

        registration.unregister();
        await Promise.resolve();

        expect(getCollections).toHaveBeenCalledOnce();
        expect(registry.getSnapshot().descriptors).toEqual([]);
    });

    it('detaches cleanup before calling untrusted provider code and stays stopped after reentrant unregister', async () => {
        const registry = new NavigatorTypeProviderRegistry(app);
        let registration: ReturnType<NavigatorTypeProviderRegistry['register']> | null = null;
        const cleanup = vi.fn(() => registration?.unregister());
        const subscribe = vi.fn(() => cleanup);
        registration = registry.register(provider({ subscribe }));
        await vi.waitFor(() => expect(registry.getSnapshot().descriptors).toHaveLength(1));

        registration.updateOptions({ mode: 'replacement' });

        expect(cleanup).toHaveBeenCalledOnce();
        expect(subscribe).toHaveBeenCalledOnce();
        expect(registration.getTypeId('projects')).toBeNull();
        expect(registry.getSnapshot().descriptors).toEqual([]);
    });

    it('times out an initial catalog without becoming authoritative and disposes every provider once', async () => {
        vi.useFakeTimers();
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const cleanupOne = vi.fn();
        const cleanupTwo = vi.fn();
        const registry = new NavigatorTypeProviderRegistry(app);
        registry.register(
            provider({
                id: 'example/one',
                getCollections: vi.fn(() => new Promise(() => undefined)),
                subscribe: vi.fn(() => cleanupOne)
            })
        );
        registry.register(provider({ id: 'example/two', subscribe: vi.fn(() => cleanupTwo) }));

        await vi.advanceTimersByTimeAsync(NAVIGATOR_TYPE_PROVIDER_QUERY_TIMEOUT_MS);
        expect(warn).toHaveBeenCalledWith(
            '[TPS Notebook Navigator] Type provider catalog query failed',
            expect.objectContaining({ providerId: 'example/one' })
        );
        expect(registry.getSnapshot().authoritativeSourceKeys).not.toContain(getTpsNavigatorProviderSourceKey('example/one'));

        registry.dispose();
        registry.dispose();
        expect(cleanupOne).toHaveBeenCalledOnce();
        expect(cleanupTwo).toHaveBeenCalledOnce();
        expect(() => registry.register(provider({ id: 'example/three' }))).toThrow(/unload/u);
    });
});
