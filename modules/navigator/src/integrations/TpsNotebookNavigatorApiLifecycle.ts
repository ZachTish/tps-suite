/*
 * TPS Notebook Navigator - public host API lifecycle handshake.
 *
 * This fork-owned adapter keeps lifecycle code out of inherited Navigator
 * services. It publishes availability changes and answers late consumers
 * point-to-point without retaining provider state across plugin reloads.
 */

import type { EventRef, Workspace } from 'obsidian';
import type { NotebookNavigatorAPI } from '../api/NotebookNavigatorAPI';
import type { TpsNotebookNavigatorApiChangedPayload, TpsNotebookNavigatorApiRequestPayload } from '../api/types';
import {
    TPS_NOTEBOOK_NAVIGATOR_API_CHANGED_EVENT,
    TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT,
    TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID
} from '../constants/tpsIdentity';

interface WorkspaceEventHost {
    on(name: string, callback: (...data: unknown[]) => unknown): EventRef;
    offref(ref: EventRef): void;
    trigger(name: string, ...data: unknown[]): void;
}

function createHostInstanceId(): string {
    const bytes = new Uint32Array(4);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, value => value.toString(16).padStart(8, '0')).join('');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isValidRequest(value: unknown): value is TpsNotebookNavigatorApiRequestPayload {
    if (!isRecord(value)) {
        return false;
    }
    return (
        typeof value.sourcePluginId === 'string' &&
        value.sourcePluginId.trim().length > 0 &&
        typeof value.timestamp === 'number' &&
        Number.isFinite(value.timestamp) &&
        typeof value.respond === 'function'
    );
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return isRecord(value) && typeof value.then === 'function';
}

/** Announces and serves the current public API instance for external TPS integrations. */
export class TpsNotebookNavigatorApiLifecycle {
    private requestRef: EventRef | null = null;
    private currentApi: NotebookNavigatorAPI | null = null;
    private readonly eventHost: WorkspaceEventHost;

    constructor(
        workspace: Workspace,
        private readonly pluginVersion: string,
        private readonly hostInstanceId: string = createHostInstanceId()
    ) {
        // Obsidian types Workspace events as a closed overload set even though
        // the runtime event bus supports plugin-owned names.
        this.eventHost = workspace;
    }

    /** Begin answering point-to-point lifecycle requests. Safe to call repeatedly. */
    start(): void {
        if (this.requestRef) {
            return;
        }
        this.requestRef = this.eventHost.on(TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT, (request: unknown) => {
            this.respondToRequest(request);
        });
    }

    /** Publish a fully initialized API instance. Repeating the same instance is a no-op. */
    publishAvailable(api: NotebookNavigatorAPI): void {
        if (!this.requestRef || this.currentApi === api) {
            return;
        }
        this.currentApi = api;
        this.publishChanged(this.createPayload(api));
    }

    /** Publish host unavailability before the current API is disposed. */
    publishUnavailable(): void {
        if (!this.requestRef || !this.currentApi) {
            return;
        }
        this.currentApi = null;
        this.publishChanged(this.createPayload(null));
    }

    /** Publish unavailability and stop answering requests. Safe to call repeatedly. */
    stop(): void {
        const requestRef = this.requestRef;
        if (!requestRef) {
            return;
        }
        this.publishUnavailable();
        this.requestRef = null;
        try {
            this.eventHost.offref(requestRef);
        } catch (error) {
            console.warn('[TPS Notebook Navigator] API lifecycle request listener cleanup failed', { error });
        }
    }

    private respondToRequest(value: unknown): void {
        if (!isValidRequest(value)) {
            return;
        }

        try {
            const result: unknown = value.respond(this.createPayload(this.currentApi));
            if (isPromiseLike(result)) {
                void Promise.resolve(result).catch((error: unknown) => {
                    console.warn('[TPS Notebook Navigator] API lifecycle request responder failed', {
                        requester: value.sourcePluginId,
                        error
                    });
                });
            }
        } catch (error) {
            console.warn('[TPS Notebook Navigator] API lifecycle request responder failed', {
                requester: value.sourcePluginId,
                error
            });
        }
    }

    private createPayload(api: NotebookNavigatorAPI | null): TpsNotebookNavigatorApiChangedPayload {
        return Object.freeze({
            source: TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID,
            sourcePluginId: TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID,
            hostInstanceId: this.hostInstanceId,
            timestamp: Date.now(),
            available: api !== null,
            pluginVersion: this.pluginVersion,
            apiVersion: api?.getVersion() ?? null,
            api
        });
    }

    private publishChanged(payload: TpsNotebookNavigatorApiChangedPayload): void {
        try {
            this.eventHost.trigger(TPS_NOTEBOOK_NAVIGATOR_API_CHANGED_EVENT, payload);
        } catch (error) {
            // Workspace events are an external callback boundary. A consumer
            // failure must not interrupt Navigator startup or shutdown.
            console.warn('[TPS Notebook Navigator] API lifecycle change listener failed', { error });
        }
    }
}
