/*
 * TPS Notebook Navigator - isolated registry for externally owned Type scopes.
 *
 * Providers register runtime-only callbacks. The registry owns catalog
 * validation, cancellation, deterministic ordering, and lifecycle cleanup;
 * React remains a consumer of immutable snapshots.
 */

import type { App } from 'obsidian';
import type {
    NavigatorTypeCollectionDefinition,
    NavigatorTypeProvider,
    NavigatorTypeProviderOptions,
    NavigatorTypeProviderQueryContext,
    NavigatorTypeProviderRegistration,
    NavigatorTypeRowsContext
} from '../../api/types';
import { NAVIGATOR_ROW_PROVIDER_MAX_ROWS, normalizeNavigatorProviderRows } from '../rows/composeProviderRows';
import type { NavigatorProvidedRow } from '../rows/types';
import {
    createTpsNavigatorProviderTypeId,
    getTpsNavigatorProviderSourceKey,
    TPS_NAVIGATOR_TYPE_COLLECTION_ID_PATTERN,
    TPS_NAVIGATOR_TYPE_PROVIDER_ID_PATTERN,
    type TpsNavigatorTypeDescriptor,
    type TpsNavigatorTypeId
} from '../../types/navigatorTypes';

export const NAVIGATOR_TYPE_PROVIDER_QUERY_TIMEOUT_MS = 5_000;
export const NAVIGATOR_TYPE_PROVIDER_MAX_COLLECTIONS = 100;

export interface NavigatorTypeProviderOwner {
    readonly providerId: string;
    readonly collectionId: string;
    readonly provider: NavigatorTypeProvider;
    readonly options: NavigatorTypeProviderOptions;
    readonly instanceId: number;
    readonly revision: number;
}

export interface NavigatorTypeProviderRowsQuery {
    readonly searchQuery: string;
    readonly allowedVaultFilePaths: readonly string[];
    readonly signal: AbortSignal;
}

export interface NavigatorTypeProviderRegistrySnapshot {
    readonly descriptors: readonly TpsNavigatorTypeDescriptor[];
    readonly authoritativeSourceKeys: ReadonlySet<string>;
    readonly hasReadyProvider: boolean;
    readonly revision: number;
}

interface ActiveProvider {
    readonly providerId: string;
    readonly instanceId: number;
    readonly provider: NavigatorTypeProvider;
    options: NavigatorTypeProviderOptions;
    collections: readonly NavigatorTypeCollectionDefinition[];
    descriptors: readonly TpsNavigatorTypeDescriptor[];
    authoritative: boolean;
    generation: number;
    subscriptionGeneration: number;
    rowRevision: number;
    rowGeneration: number;
    readonly rowAbortControllers: Set<AbortController>;
    abortController: AbortController | null;
    abortCatalogQuery: (() => void) | null;
    cleanup: (() => void) | null;
}

const ROW_QUERY_CANCELLED = Symbol('navigator-type-row-query-cancelled');
const CATALOG_QUERY_CANCELLED = Symbol('navigator-type-catalog-query-cancelled');

const EMPTY_SNAPSHOT: NavigatorTypeProviderRegistrySnapshot = Object.freeze({
    descriptors: Object.freeze([]),
    authoritativeSourceKeys: new Set<string>(),
    hasReadyProvider: false,
    revision: 0
});

function cloneOptions(options: NavigatorTypeProviderOptions): NavigatorTypeProviderOptions {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new Error('Navigator Type provider options must be a record.');
    }
    return Object.freeze({ ...options });
}

function validateProvider(provider: NavigatorTypeProvider): void {
    if (!provider || typeof provider !== 'object' || typeof provider.id !== 'string') {
        throw new Error('Navigator Type provider must be an object with a string ID.');
    }
    if (provider.id.length > 128 || !TPS_NAVIGATOR_TYPE_PROVIDER_ID_PATTERN.test(provider.id)) {
        throw new Error(`Navigator Type provider ID must be namespaced: ${provider.id}`);
    }
    if (typeof provider.getCollections !== 'function') {
        throw new Error(`Navigator Type provider must implement getCollections(): ${provider.id}`);
    }
    if (typeof provider.getRows !== 'function') {
        throw new Error(`Navigator Type provider must implement getRows(): ${provider.id}`);
    }
    if (provider.subscribe !== undefined && typeof provider.subscribe !== 'function') {
        throw new Error(`Navigator Type provider subscribe must be a function: ${provider.id}`);
    }
}

function normalizeCollections(
    providerId: string,
    value: unknown
): {
    collections: readonly NavigatorTypeCollectionDefinition[];
    descriptors: readonly TpsNavigatorTypeDescriptor[];
} {
    if (!Array.isArray(value)) {
        throw new Error('Type provider returned a non-array catalog.');
    }
    if (value.length > NAVIGATOR_TYPE_PROVIDER_MAX_COLLECTIONS) {
        throw new Error('Type provider exceeded the collection limit.');
    }

    const seen = new Set<string>();
    const collections: NavigatorTypeCollectionDefinition[] = [];
    const descriptors: TpsNavigatorTypeDescriptor[] = [];
    for (const candidate of value as readonly unknown[]) {
        if (!candidate || typeof candidate !== 'object') {
            throw new Error('Type provider returned an invalid collection definition.');
        }
        const definition = candidate as Record<string, unknown>;
        const id = typeof definition.id === 'string' ? definition.id.trim() : '';
        const label = typeof definition.label === 'string' ? definition.label.trim() : '';
        const icon = typeof definition.icon === 'string' ? definition.icon.trim() : '';
        if (!TPS_NAVIGATOR_TYPE_COLLECTION_ID_PATTERN.test(id)) {
            throw new Error(`Type provider returned an invalid collection ID: ${id || '(empty)'}`);
        }
        if (seen.has(id)) {
            throw new Error(`Type provider returned a duplicate collection ID: ${id}`);
        }
        if (!label || label.length > 120 || !icon || icon.length > 120) {
            throw new Error(`Type provider returned invalid collection presentation for: ${id}`);
        }
        const typeId = createTpsNavigatorProviderTypeId(providerId, id);
        if (!typeId) {
            throw new Error(`Type provider collection could not be canonicalized: ${id}`);
        }

        seen.add(id);
        const collection = Object.freeze({ id, label, icon });
        collections.push(collection);
        descriptors.push(
            Object.freeze({
                id: typeId,
                label,
                icon,
                category: 'structure' as const,
                count: 0,
                showCount: false,
                providerId,
                providerCollectionId: id
            })
        );
    }

    return {
        collections: Object.freeze(collections),
        descriptors: Object.freeze(descriptors)
    };
}

function safeCleanup(providerId: string, cleanup: (() => void) | null): void {
    if (!cleanup) {
        return;
    }
    try {
        cleanup();
    } catch {
        console.warn('[TPS Notebook Navigator] Type provider cleanup failed', { providerId });
    }
}

function collectionsEqual(
    left: readonly NavigatorTypeCollectionDefinition[],
    right: readonly NavigatorTypeCollectionDefinition[]
): boolean {
    return (
        left.length === right.length &&
        left.every(
            (collection, index) =>
                collection.id === right[index]?.id && collection.label === right[index]?.label && collection.icon === right[index]?.icon
        )
    );
}

/** Plugin-instance-owned registry for top-level external Type collections. */
export class NavigatorTypeProviderRegistry {
    private readonly providers = new Map<string, ActiveProvider>();
    private readonly removedProviderIds = new Set<string>();
    private readonly listeners = new Set<() => void>();
    private snapshot = EMPTY_SNAPSHOT;
    private revision = 0;
    private providerInstanceSequence = 0;
    private enabled = true;
    private disposed = false;

    constructor(private readonly app: App) {}

    register(provider: NavigatorTypeProvider, options?: NavigatorTypeProviderOptions): NavigatorTypeProviderRegistration {
        if (this.disposed) {
            throw new Error('TPS Notebook Navigator Type providers are unavailable after plugin unload.');
        }
        validateProvider(provider);
        const providerId = provider.id;
        if (this.providers.has(providerId)) {
            throw new Error(`Navigator Type provider is already registered: ${providerId}`);
        }
        const initialOptions = cloneOptions(options === undefined ? {} : options);
        const activeProvider: ActiveProvider = {
            providerId,
            instanceId: ++this.providerInstanceSequence,
            provider,
            options: initialOptions,
            collections: Object.freeze([]),
            descriptors: Object.freeze([]),
            authoritative: false,
            generation: 0,
            subscriptionGeneration: 0,
            rowRevision: 0,
            rowGeneration: 0,
            rowAbortControllers: new Set(),
            abortController: null,
            abortCatalogQuery: null,
            cleanup: null
        };
        this.providers.set(providerId, activeProvider);
        this.removedProviderIds.delete(providerId);
        if (this.enabled) {
            this.publish();
            this.startSubscription(activeProvider);
            this.refreshProvider(activeProvider);
        }

        let handleActive = true;
        return Object.freeze({
            id: providerId,
            getTypeId: (collectionId: string) => {
                if (!handleActive || this.disposed || this.providers.get(providerId) !== activeProvider) {
                    return null;
                }
                return createTpsNavigatorProviderTypeId(providerId, collectionId);
            },
            updateOptions: (nextOptions: NavigatorTypeProviderOptions) => {
                if (!handleActive || this.disposed || this.providers.get(providerId) !== activeProvider) {
                    return;
                }
                const clonedOptions = cloneOptions(nextOptions);
                this.cancelProviderRows(activeProvider);
                activeProvider.options = clonedOptions;
                activeProvider.rowRevision += 1;
                activeProvider.subscriptionGeneration += 1;
                const cleanup = activeProvider.cleanup;
                activeProvider.cleanup = null;
                safeCleanup(providerId, cleanup);
                if (!handleActive || this.disposed || this.providers.get(providerId) !== activeProvider) {
                    return;
                }
                if (this.enabled) {
                    this.publish();
                    this.startSubscription(activeProvider);
                    this.refreshProvider(activeProvider);
                }
            },
            unregister: () => {
                if (!handleActive) {
                    return;
                }
                handleActive = false;
                if (this.providers.get(providerId) !== activeProvider) {
                    return;
                }
                this.stopProvider(activeProvider);
                this.providers.delete(providerId);
                this.removedProviderIds.add(providerId);
                if (this.enabled) {
                    this.publish();
                }
            }
        });
    }

    getSnapshot(): NavigatorTypeProviderRegistrySnapshot {
        return this.snapshot;
    }

    /** Pauses provider callbacks and catalogs while preserving registrations and options. */
    setEnabled(enabled: boolean): void {
        if (this.disposed || this.enabled === enabled) {
            return;
        }
        this.enabled = enabled;
        if (!enabled) {
            for (const activeProvider of this.providers.values()) {
                this.stopProvider(activeProvider);
            }
            this.publish();
            return;
        }

        // Publish the clean enabled baseline before providers resume. Catalogs remain absent
        // until each fresh query establishes current authority.
        this.publish();
        for (const activeProvider of this.providers.values()) {
            this.startSubscription(activeProvider);
            this.refreshProvider(activeProvider);
        }
    }

    subscribe(listener: () => void): () => void {
        if (this.disposed) {
            return () => undefined;
        }
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getOwner(typeId: TpsNavigatorTypeId): NavigatorTypeProviderOwner | null {
        if (!this.enabled || this.disposed) {
            return null;
        }
        for (const activeProvider of this.providers.values()) {
            const descriptor = activeProvider.descriptors.find(candidate => candidate.id === typeId);
            if (!descriptor?.providerCollectionId) {
                continue;
            }
            return Object.freeze({
                providerId: activeProvider.providerId,
                collectionId: descriptor.providerCollectionId,
                provider: activeProvider.provider,
                options: activeProvider.options,
                instanceId: activeProvider.instanceId,
                revision: activeProvider.rowRevision
            });
        }
        return null;
    }

    /** Query and validate rows for the provider that establishes this Type scope. */
    async queryRows(typeId: TpsNavigatorTypeId, query: NavigatorTypeProviderRowsQuery): Promise<NavigatorProvidedRow[]> {
        if (!this.enabled || this.disposed) {
            return [];
        }
        const owner = this.getOwner(typeId);
        if (!owner || query.signal.aborted) {
            return [];
        }
        const activeProvider = this.providers.get(owner.providerId);
        if (!activeProvider || activeProvider.provider !== owner.provider) {
            return [];
        }
        const rowGeneration = activeProvider.rowGeneration;
        const lifecycleAbortController = new AbortController();
        activeProvider.rowAbortControllers.add(lifecycleAbortController);
        const abortController = new AbortController();
        let rejectExternalAbort: ((reason: Error) => void) | null = null;
        const handleExternalAbort = () => {
            abortController.abort();
            rejectExternalAbort?.(new Error('Type provider row query was aborted.'));
        };
        query.signal.addEventListener('abort', handleExternalAbort, { once: true });
        const allowedVaultFilePaths = Object.freeze([...query.allowedVaultFilePaths]);
        const context: NavigatorTypeRowsContext = Object.freeze({
            app: this.app,
            signal: abortController.signal,
            typeId,
            searchQuery: query.searchQuery,
            allowedVaultFilePaths
        });
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const timeout = new Promise<never>((_resolve, reject) => {
            timeoutId = window.setTimeout(() => {
                abortController.abort();
                reject(new Error('Type provider row query timed out.'));
            }, NAVIGATOR_TYPE_PROVIDER_QUERY_TIMEOUT_MS);
        });
        const externalAbort = new Promise<never>((_resolve, reject) => {
            rejectExternalAbort = reject;
        });
        const lifecycleAbort = new Promise<typeof ROW_QUERY_CANCELLED>(resolve => {
            lifecycleAbortController.signal.addEventListener(
                'abort',
                () => {
                    abortController.abort();
                    resolve(ROW_QUERY_CANCELLED);
                },
                { once: true }
            );
        });
        try {
            const value = await Promise.race([
                Promise.resolve().then(() => owner.provider.getRows(owner.collectionId, context, owner.options)),
                timeout,
                externalAbort,
                lifecycleAbort
            ]);
            if (
                value === ROW_QUERY_CANCELLED ||
                query.signal.aborted ||
                this.disposed ||
                !this.enabled ||
                this.providers.get(owner.providerId) !== activeProvider ||
                activeProvider.rowGeneration !== rowGeneration ||
                !activeProvider.descriptors.some(descriptor => descriptor.id === typeId)
            ) {
                return [];
            }
            if (!Array.isArray(value)) {
                throw new Error('Type provider returned a non-array row result.');
            }
            if (value.length > NAVIGATOR_ROW_PROVIDER_MAX_ROWS) {
                throw new Error('Type provider exceeded the row limit.');
            }
            return normalizeNavigatorProviderRows(owner.providerId, value, new Set(allowedVaultFilePaths));
        } finally {
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
            query.signal.removeEventListener('abort', handleExternalAbort);
            rejectExternalAbort = null;
            activeProvider.rowAbortControllers.delete(lifecycleAbortController);
        }
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const activeProvider of this.providers.values()) {
            this.stopProvider(activeProvider);
        }
        this.providers.clear();
        this.removedProviderIds.clear();
        this.revision += 1;
        this.snapshot = Object.freeze({
            descriptors: Object.freeze([]),
            authoritativeSourceKeys: new Set<string>(),
            hasReadyProvider: false,
            revision: this.revision
        });
        this.notifyListeners();
        this.listeners.clear();
    }

    private startSubscription(activeProvider: ActiveProvider): void {
        if (!this.enabled || this.disposed) {
            return;
        }
        const { provider, providerId } = activeProvider;
        if (!provider.subscribe) {
            return;
        }
        activeProvider.subscriptionGeneration += 1;
        const subscriptionGeneration = activeProvider.subscriptionGeneration;
        const context = Object.freeze({ app: this.app });
        try {
            const cleanup = provider.subscribe(context, activeProvider.options, () => {
                if (
                    this.disposed ||
                    !this.enabled ||
                    subscriptionGeneration !== activeProvider.subscriptionGeneration ||
                    this.providers.get(providerId) !== activeProvider
                ) {
                    return;
                }
                this.cancelProviderRows(activeProvider);
                activeProvider.rowRevision += 1;
                this.publish();
                this.refreshProvider(activeProvider);
            });
            if (typeof cleanup === 'function') {
                activeProvider.cleanup = cleanup;
            }
        } catch {
            console.warn('[TPS Notebook Navigator] Type provider subscription failed', { providerId });
        }
    }

    private refreshProvider(activeProvider: ActiveProvider): void {
        if (!this.enabled || this.disposed) {
            return;
        }
        const { provider, providerId } = activeProvider;
        activeProvider.generation += 1;
        const generation = activeProvider.generation;
        activeProvider.abortCatalogQuery?.();
        activeProvider.abortCatalogQuery = null;
        activeProvider.abortController?.abort();
        const abortController = new AbortController();
        activeProvider.abortController = abortController;
        const context: NavigatorTypeProviderQueryContext = Object.freeze({ app: this.app, signal: abortController.signal });
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let timedOut = false;
        const timeout = new Promise<never>((_resolve, reject) => {
            timeoutId = window.setTimeout(() => {
                timedOut = true;
                abortController.abort();
                reject(new Error('Type provider catalog query timed out.'));
            }, NAVIGATOR_TYPE_PROVIDER_QUERY_TIMEOUT_MS);
        });
        let resolveLifecycleAbort: ((value: typeof CATALOG_QUERY_CANCELLED) => void) | null = null;
        const lifecycleAbort = new Promise<typeof CATALOG_QUERY_CANCELLED>(resolve => {
            resolveLifecycleAbort = resolve;
        });
        const abortCatalogQuery = () => {
            if (!timedOut) {
                resolveLifecycleAbort?.(CATALOG_QUERY_CANCELLED);
            }
            abortController.abort();
        };
        activeProvider.abortCatalogQuery = abortCatalogQuery;

        void Promise.race([Promise.resolve().then(() => provider.getCollections(context, activeProvider.options)), timeout, lifecycleAbort])
            .then(value => {
                if (value === CATALOG_QUERY_CANCELLED) {
                    return;
                }
                const normalized = normalizeCollections(providerId, value);
                if (
                    this.disposed ||
                    !this.enabled ||
                    abortController.signal.aborted ||
                    generation !== activeProvider.generation ||
                    this.providers.get(providerId) !== activeProvider
                ) {
                    return;
                }
                const catalogChanged = !collectionsEqual(activeProvider.collections, normalized.collections);
                const authorityChanged = !activeProvider.authoritative;
                if (catalogChanged) {
                    this.cancelProviderRows(activeProvider);
                    activeProvider.rowRevision += 1;
                }
                activeProvider.collections = normalized.collections;
                activeProvider.descriptors = normalized.descriptors;
                activeProvider.authoritative = true;
                if (catalogChanged || authorityChanged) {
                    this.publish();
                }
            })
            .catch(error => {
                if (
                    this.disposed ||
                    !this.enabled ||
                    generation !== activeProvider.generation ||
                    this.providers.get(providerId) !== activeProvider
                ) {
                    return;
                }
                console.warn('[TPS Notebook Navigator] Type provider catalog query failed', {
                    providerId,
                    error: error instanceof Error ? error.message : String(error)
                });
            })
            .finally(() => {
                if (timeoutId !== null) {
                    window.clearTimeout(timeoutId);
                }
                resolveLifecycleAbort = null;
                if (activeProvider.abortController === abortController) {
                    activeProvider.abortController = null;
                }
                if (activeProvider.abortCatalogQuery === abortCatalogQuery) {
                    activeProvider.abortCatalogQuery = null;
                }
            });
    }

    private stopProvider(activeProvider: ActiveProvider): void {
        activeProvider.generation += 1;
        activeProvider.subscriptionGeneration += 1;
        this.cancelProviderRows(activeProvider);
        activeProvider.abortCatalogQuery?.();
        activeProvider.abortCatalogQuery = null;
        activeProvider.abortController?.abort();
        activeProvider.abortController = null;
        const cleanup = activeProvider.cleanup;
        activeProvider.cleanup = null;
        safeCleanup(activeProvider.providerId, cleanup);
        activeProvider.collections = Object.freeze([]);
        activeProvider.descriptors = Object.freeze([]);
        activeProvider.authoritative = false;
        activeProvider.rowRevision += 1;
    }

    private cancelProviderRows(activeProvider: ActiveProvider): void {
        activeProvider.rowGeneration += 1;
        for (const abortController of activeProvider.rowAbortControllers) {
            abortController.abort();
        }
        activeProvider.rowAbortControllers.clear();
    }

    private publish(): void {
        const descriptors: TpsNavigatorTypeDescriptor[] = [];
        const authoritativeSourceKeys = new Set<string>();
        let hasReadyProvider = false;
        if (this.enabled) {
            for (const [providerId, activeProvider] of this.providers) {
                descriptors.push(...activeProvider.descriptors);
                if (activeProvider.authoritative) {
                    hasReadyProvider = true;
                    authoritativeSourceKeys.add(getTpsNavigatorProviderSourceKey(providerId));
                }
            }
            this.removedProviderIds.forEach(providerId => authoritativeSourceKeys.add(getTpsNavigatorProviderSourceKey(providerId)));
        }
        this.revision += 1;
        this.snapshot = Object.freeze({
            descriptors: Object.freeze(descriptors),
            authoritativeSourceKeys,
            hasReadyProvider,
            revision: this.revision
        });
        this.notifyListeners();
    }

    private notifyListeners(): void {
        for (const listener of [...this.listeners]) {
            try {
                listener();
            } catch {
                // One view or public consumer must not interrupt provider delivery.
            }
        }
    }
}
