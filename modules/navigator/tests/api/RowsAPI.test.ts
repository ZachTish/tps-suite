/* TPS Notebook Navigator - public transient row API lifecycle tests. */

import { describe, expect, it, vi } from 'vitest';
import { RowsAPI } from '../../src/api/modules/RowsAPI';
import { NavigatorRowProviderRegistry } from '../../src/services/rows/NavigatorRowProviderRegistry';
import type { NavigatorRowProvider } from '../../src/services/rows/types';

function createProvider(id: string): NavigatorRowProvider {
    return {
        id,
        getRows: vi.fn(async () => [])
    };
}

describe('RowsAPI', () => {
    it('registers and activates a provider in one operation, updates options, and unregisters idempotently', () => {
        const registry = new NavigatorRowProviderRegistry();
        const rows = new RowsAPI(registry);
        const listener = vi.fn();
        rows.subscribe(listener);
        const provider = createProvider('example/tasks');

        const registration = rows.registerProvider(provider, { limit: 3 });

        expect(registration.id).toBe('example/tasks');
        expect(registry.get(provider.id)).toBe(provider);
        expect(rows.getSelection()).toEqual({
            enabledProviderIds: ['example/tasks'],
            optionsByProviderId: { 'example/tasks': { limit: 3 } }
        });
        expect(listener).toHaveBeenCalledTimes(1);

        registration.updateOptions({ limit: 7 });
        expect(rows.getSelection().optionsByProviderId?.['example/tasks']).toEqual({ limit: 7 });
        expect(listener).toHaveBeenCalledTimes(2);

        registration.unregister();
        registration.unregister();
        registration.updateOptions({ limit: 11 });
        expect(registry.get(provider.id)).toBeNull();
        expect(rows.getSelection().enabledProviderIds).toEqual([]);
        expect(listener).toHaveBeenCalledTimes(3);
    });

    it('disposes every registration and rejects registrations after plugin unload', () => {
        const registry = new NavigatorRowProviderRegistry();
        const rows = new RowsAPI(registry);
        const listener = vi.fn();
        rows.subscribe(listener);
        rows.registerProvider(createProvider('example/one'));
        rows.registerProvider(createProvider('example/two'));

        rows.dispose();
        rows.dispose();

        expect(registry.resolve(['example/one', 'example/two'])).toEqual([]);
        expect(rows.getSelection().enabledProviderIds).toEqual([]);
        expect(() => rows.registerProvider(createProvider('example/three'))).toThrow(/unload/u);
        expect(listener).toHaveBeenCalledTimes(3);
    });

    it('immediately aborts active provider queries on options, unregister, and unload transitions', () => {
        const registry = new NavigatorRowProviderRegistry();
        const rows = new RowsAPI(registry);
        const provider = createProvider('example/tasks');
        const registration = rows.registerProvider(provider);

        const optionsQuery = new AbortController();
        registry.trackQuery(provider, optionsQuery);
        registration.updateOptions({ mode: 'next' });
        expect(optionsQuery.signal.aborted).toBe(true);

        const unregisterQuery = new AbortController();
        registry.trackQuery(provider, unregisterQuery);
        registration.unregister();
        expect(unregisterQuery.signal.aborted).toBe(true);

        const builtInProvider = createProvider('tps/built-in');
        registry.register(builtInProvider);
        const unloadQuery = new AbortController();
        registry.trackQuery(builtInProvider, unloadQuery);
        rows.dispose();
        expect(unloadQuery.signal.aborted).toBe(true);
    });

    it('captures provider identity even if external code mutates the provider object', () => {
        const registry = new NavigatorRowProviderRegistry();
        const rows = new RowsAPI(registry);
        const provider = createProvider('example/tasks');
        const registration = rows.registerProvider(provider, { mode: 'first' });
        const query = new AbortController();
        registry.trackQuery(provider, query);
        (provider as { id: string }).id = 'mutated/identity';

        registration.updateOptions({ mode: 'second' });
        expect(query.signal.aborted).toBe(true);
        expect(registration.id).toBe('example/tasks');
        expect(registry.get('example/tasks')).toBe(provider);
        expect(rows.getSelection()).toEqual({
            enabledProviderIds: ['example/tasks'],
            optionsByProviderId: { 'example/tasks': { mode: 'second' } }
        });

        const unregisterQuery = new AbortController();
        registry.trackQuery(provider, unregisterQuery);
        registration.unregister();
        expect(unregisterQuery.signal.aborted).toBe(true);
        expect(registry.get('example/tasks')).toBeNull();
        expect(rows.getSelection().enabledProviderIds).toEqual([]);
    });

    it('rejects invalid options atomically and isolates activation listeners', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const registry = new NavigatorRowProviderRegistry();
        const rows = new RowsAPI(registry);
        const provider = createProvider('example/tasks');
        const healthyListener = vi.fn();
        rows.subscribe(() => {
            throw new Error('listener failed');
        });
        rows.subscribe(healthyListener);

        expect(() => rows.registerProvider(provider, null as never)).toThrow(/options/u);
        expect(registry.get(provider.id)).toBeNull();
        expect(rows.getSelection().enabledProviderIds).toEqual([]);

        const registration = rows.registerProvider(provider, { mode: 'valid' });
        expect(healthyListener).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledOnce();
        expect(warn.mock.calls[0]?.[0]).toBe('[TPS Notebook Navigator] Row provider activation listener failed');
        const warningContext = warn.mock.calls[0]?.[1] as { error?: unknown } | undefined;
        expect(warningContext?.error).toBeInstanceOf(Error);

        const query = new AbortController();
        registry.trackQuery(provider, query);
        expect(() => registration.updateOptions(null as never)).toThrow(/options/u);
        expect(query.signal.aborted).toBe(false);
        expect(rows.getSelection()).toEqual({
            enabledProviderIds: ['example/tasks'],
            optionsByProviderId: { 'example/tasks': { mode: 'valid' } }
        });
        expect(healthyListener).toHaveBeenCalledOnce();
        warn.mockRestore();
    });
});
