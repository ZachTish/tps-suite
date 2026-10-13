import { describe, expect, it, vi } from 'vitest';
import type { EventRef } from 'obsidian';
import type { NotebookNavigatorAPI } from '../../src/api/NotebookNavigatorAPI';
import type { TpsNotebookNavigatorApiChangedPayload, TpsNotebookNavigatorApiRequestPayload } from '../../src/api/types';
import { TPS_NOTEBOOK_NAVIGATOR_API_CHANGED_EVENT, TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT } from '../../src/constants/tpsIdentity';
import { TpsNotebookNavigatorApiLifecycle } from '../../src/integrations/TpsNotebookNavigatorApiLifecycle';

type Listener = (...data: unknown[]) => unknown;
type TestEventRef = { name: string; callback: Listener };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

class WorkspaceBus {
    private readonly listeners = new Map<string, Set<Listener>>();
    readonly triggerNames: string[] = [];

    on(name: string, callback: Listener): EventRef {
        const listeners = this.listeners.get(name) ?? new Set<Listener>();
        listeners.add(callback);
        this.listeners.set(name, listeners);
        return { name, callback };
    }

    offref(ref: EventRef): void {
        const { name, callback } = ref as unknown as TestEventRef;
        this.listeners.get(name)?.delete(callback);
    }

    trigger(name: string, ...data: unknown[]): void {
        this.triggerNames.push(name);
        for (const callback of Array.from(this.listeners.get(name) ?? [])) {
            callback(...data);
        }
    }

    listenerCount(name: string): number {
        return this.listeners.get(name)?.size ?? 0;
    }
}

function createApi(version = '2.8.0'): NotebookNavigatorAPI {
    return { getVersion: vi.fn(() => version) } as unknown as NotebookNavigatorAPI;
}

function request(bus: WorkspaceBus, respond: TpsNotebookNavigatorApiRequestPayload['respond']): void {
    bus.trigger(TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT, {
        sourcePluginId: 'example/consumer',
        timestamp: 123,
        respond
    } satisfies TpsNotebookNavigatorApiRequestPayload);
}

describe('TpsNotebookNavigatorApiLifecycle', () => {
    it('generates one opaque identity per loaded lifecycle instance', () => {
        const firstBus = new WorkspaceBus();
        const secondBus = new WorkspaceBus();
        const first = new TpsNotebookNavigatorApiLifecycle(firstBus as never, '4.11.0');
        const second = new TpsNotebookNavigatorApiLifecycle(secondBus as never, '4.11.0');
        let firstPayload: TpsNotebookNavigatorApiChangedPayload | null = null;
        let secondPayload: TpsNotebookNavigatorApiChangedPayload | null = null;

        first.start();
        second.start();
        request(firstBus, payload => {
            firstPayload = payload;
        });
        request(secondBus, payload => {
            secondPayload = payload;
        });

        expect(firstPayload?.hostInstanceId).toMatch(/^[0-9a-f]{32}$/);
        expect(secondPayload?.hostInstanceId).toMatch(/^[0-9a-f]{32}$/);
        expect(firstPayload?.hostInstanceId).not.toBe(secondPayload?.hostInstanceId);
        first.stop();
        second.stop();
    });

    it('answers late consumers point-to-point without rebroadcasting and starts/stops idempotently', () => {
        const bus = new WorkspaceBus();
        const lifecycle = new TpsNotebookNavigatorApiLifecycle(bus as never, '4.6.0', 'host-a');
        const changed = vi.fn();
        bus.on(TPS_NOTEBOOK_NAVIGATOR_API_CHANGED_EVENT, changed);

        lifecycle.start();
        lifecycle.start();
        expect(bus.listenerCount(TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT)).toBe(1);

        const respond = vi.fn<(payload: TpsNotebookNavigatorApiChangedPayload) => void>();
        request(bus, respond);

        expect(respond).toHaveBeenCalledOnce();
        const response = respond.mock.calls[0][0];
        expect(response).toMatchObject({
            source: 'tps-notebook-navigator',
            sourcePluginId: 'tps-notebook-navigator',
            hostInstanceId: 'host-a',
            available: false,
            pluginVersion: '4.6.0',
            apiVersion: null,
            api: null
        });
        expect(typeof response.timestamp).toBe('number');
        expect(Object.isFrozen(response)).toBe(true);
        expect(changed).not.toHaveBeenCalled();
        expect(bus.triggerNames).toEqual([TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT]);

        lifecycle.stop();
        lifecycle.stop();
        expect(bus.listenerCount(TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT)).toBe(0);
        request(bus, respond);
        expect(respond).toHaveBeenCalledOnce();
    });

    it('publishes each available API and one unavailable state before stopping', () => {
        const bus = new WorkspaceBus();
        const lifecycle = new TpsNotebookNavigatorApiLifecycle(bus as never, '4.6.0', 'host-a');
        const payloads: TpsNotebookNavigatorApiChangedPayload[] = [];
        bus.on(TPS_NOTEBOOK_NAVIGATOR_API_CHANGED_EVENT, payload => {
            payloads.push(payload as TpsNotebookNavigatorApiChangedPayload);
        });
        const firstApi = createApi();
        const secondApi = createApi('2.8.1');

        lifecycle.start();
        lifecycle.publishAvailable(firstApi);
        lifecycle.publishAvailable(firstApi);
        lifecycle.publishAvailable(secondApi);
        lifecycle.stop();
        lifecycle.stop();

        expect(payloads).toHaveLength(3);
        expect(payloads[0]).toMatchObject({ available: true, api: firstApi, apiVersion: '2.8.0', pluginVersion: '4.6.0' });
        expect(payloads[1]).toMatchObject({ available: true, api: secondApi, apiVersion: '2.8.1' });
        expect(payloads[2]).toMatchObject({ available: false, api: null, apiVersion: null });
        expect(payloads.every(payload => payload.hostInstanceId === 'host-a')).toBe(true);
        expect(payloads.every(Object.isFrozen)).toBe(true);
    });

    it('supports teardown and automatic provider reacquisition across a host-only reload', () => {
        const bus = new WorkspaceBus();
        const firstLifecycle = new TpsNotebookNavigatorApiLifecycle(bus as never, '4.6.0', 'host-a');
        const secondLifecycle = new TpsNotebookNavigatorApiLifecycle(bus as never, '4.6.1', 'host-b');
        const firstUnregister = vi.fn();
        const secondUnregister = vi.fn();
        const firstRegister = vi.fn(() => ({ unregister: firstUnregister }));
        const secondRegister = vi.fn(() => ({ unregister: secondUnregister }));
        const firstApi = {
            getVersion: () => '2.8.0',
            types: { registerProvider: firstRegister }
        } as unknown as NotebookNavigatorAPI;
        const secondApi = {
            getVersion: () => '2.8.0',
            types: { registerProvider: secondRegister }
        } as unknown as NotebookNavigatorAPI;
        let currentApi: NotebookNavigatorAPI | null = null;
        let registration: { unregister(): void } | null = null;
        const accept = (state: TpsNotebookNavigatorApiChangedPayload) => {
            if (state.api === currentApi) {
                return;
            }
            registration?.unregister();
            registration = null;
            currentApi = state.available ? state.api : null;
            if (currentApi) {
                registration = currentApi.types.registerProvider({ id: 'example/provider' } as never);
            }
        };
        bus.on(TPS_NOTEBOOK_NAVIGATOR_API_CHANGED_EVENT, payload => accept(payload as TpsNotebookNavigatorApiChangedPayload));

        firstLifecycle.start();
        request(bus, accept);
        expect(currentApi).toBeNull();
        firstLifecycle.publishAvailable(firstApi);
        expect(firstRegister).toHaveBeenCalledOnce();

        firstLifecycle.stop();
        expect(firstUnregister).toHaveBeenCalledOnce();
        expect(currentApi).toBeNull();

        secondLifecycle.start();
        secondLifecycle.publishAvailable(secondApi);
        expect(secondRegister).toHaveBeenCalledOnce();
        expect(currentApi).toBe(secondApi);
        secondLifecycle.stop();
        expect(secondUnregister).toHaveBeenCalledOnce();
    });

    it('ignores malformed requests and isolates throwing, rejected, and change callbacks', async () => {
        const bus = new WorkspaceBus();
        const lifecycle = new TpsNotebookNavigatorApiLifecycle(bus as never, '4.6.0', 'host-a');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        lifecycle.start();

        bus.trigger(TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT, null);
        bus.trigger(TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT, { sourcePluginId: '', timestamp: 1, respond: vi.fn() });
        bus.trigger(TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT, {
            sourcePluginId: 'example/throwing',
            timestamp: 1,
            respond: () => {
                throw new Error('consumer failed');
            }
        });
        bus.trigger(TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT, {
            sourcePluginId: 'example/consumer',
            timestamp: 1,
            respond: () => Promise.reject(new Error('async consumer failed'))
        });
        await Promise.resolve();
        await Promise.resolve();

        bus.on(TPS_NOTEBOOK_NAVIGATOR_API_CHANGED_EVENT, () => {
            throw new Error('change consumer failed');
        });
        expect(() => lifecycle.publishAvailable(createApi())).not.toThrow();

        const warningCalls: unknown[][] = warn.mock.calls;
        const hasWarning = (message: string, requester?: string) =>
            warningCalls.some(([actualMessage, details]) => {
                if (actualMessage !== message || !isRecord(details) || !(details.error instanceof Error)) {
                    return false;
                }
                return requester === undefined || details.requester === requester;
            });
        expect(hasWarning('[TPS Notebook Navigator] API lifecycle request responder failed', 'example/throwing')).toBe(true);
        expect(hasWarning('[TPS Notebook Navigator] API lifecycle request responder failed', 'example/consumer')).toBe(true);
        expect(hasWarning('[TPS Notebook Navigator] API lifecycle change listener failed')).toBe(true);
    });
});
