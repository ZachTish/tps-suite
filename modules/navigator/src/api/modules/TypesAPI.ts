/*
 * TPS Notebook Navigator - public, provider-neutral Types catalog API.
 */

import {
    TPS_NAVIGATOR_BUILTIN_TYPE_SOURCE,
    TPS_NAVIGATOR_TYPE_IDS,
    createTpsNavigatorKindTypeId,
    getTpsNavigatorKindValue,
    isTpsNavigatorTypeId,
    type TpsNavigatorTypeDescriptor,
    type TpsNavigatorTypeId,
    type TpsNavigatorTypeRecord,
    type TpsNavigatorTypesSnapshot
} from '../../types/navigatorTypes';
import type {
    NavigatorTypeDescriptor,
    NavigatorTypeProvider,
    NavigatorTypeProviderOptions,
    NavigatorTypeProviderRegistration,
    NavigatorTypesListener,
    NavigatorTypesSnapshot
} from '../types';
import type {
    NavigatorTypeProviderOwner,
    NavigatorTypeProviderRegistry,
    NavigatorTypeProviderRegistrySnapshot,
    NavigatorTypeProviderRowsQuery
} from '../../services/types/NavigatorTypeProviderRegistry';
import type { NavigatorProvidedRow } from '../../services/rows/types';

export interface NavigatorTypesStore {
    getSnapshot(): TpsNavigatorTypesSnapshot;
    subscribe(listener: () => void): () => void;
    /** Internal lifecycle control implemented by the built-in store. */
    setEnabled?(enabled: boolean): void;
}

const EMPTY_RECORDS = new Map<TpsNavigatorTypeId, readonly never[]>();
const EMPTY_AUTHORITIES = new Set<string>();
const EMPTY_PROVIDER_SNAPSHOT: NavigatorTypeProviderRegistrySnapshot = Object.freeze({
    descriptors: Object.freeze([]),
    authoritativeSourceKeys: EMPTY_AUTHORITIES,
    hasReadyProvider: false,
    revision: 0
});
const DISABLED_SNAPSHOT: NavigatorTypesSnapshot = Object.freeze({
    availability: 'disabled',
    descriptors: Object.freeze([]),
    revision: 0,
    message: 'Types navigation is disabled.'
});
const DISPOSED_SNAPSHOT: NavigatorTypesSnapshot = Object.freeze({
    availability: 'unavailable',
    descriptors: Object.freeze([]),
    revision: 0,
    message: 'The Types catalog is unavailable after plugin unload.'
});
const DISABLED_INTERNAL_SNAPSHOT: TpsNavigatorTypesSnapshot = Object.freeze({
    availability: 'unavailable',
    descriptors: Object.freeze([]),
    recordsByType: EMPTY_RECORDS,
    revision: 0,
    message: 'Types navigation is disabled.',
    authoritativeSourceKeys: EMPTY_AUTHORITIES,
    builtinAvailability: 'unavailable',
    builtinMessage: 'Types navigation is disabled.'
});
const DISPOSED_INTERNAL_SNAPSHOT: TpsNavigatorTypesSnapshot = Object.freeze({
    availability: 'unavailable',
    descriptors: Object.freeze([]),
    recordsByType: EMPTY_RECORDS,
    revision: 0,
    message: 'The Types catalog is unavailable after plugin unload.',
    authoritativeSourceKeys: EMPTY_AUTHORITIES,
    builtinAvailability: 'unavailable',
    builtinMessage: 'The Types catalog is unavailable after plugin unload.'
});

function toPublicDescriptor(descriptor: TpsNavigatorTypeDescriptor): NavigatorTypeDescriptor {
    const publicDescriptor: NavigatorTypeDescriptor = {
        id: descriptor.id,
        label: descriptor.label,
        icon: descriptor.icon,
        category: descriptor.category
    };
    if (descriptor.providerId !== undefined) {
        return Object.freeze({
            ...publicDescriptor,
            providerId: descriptor.providerId,
            providerCollectionId: descriptor.providerCollectionId
        });
    }
    return Object.freeze(publicDescriptor);
}

function toPublicSnapshot(snapshot: TpsNavigatorTypesSnapshot): NavigatorTypesSnapshot {
    const descriptors = Object.freeze(snapshot.descriptors.map(toPublicDescriptor));
    const publicSnapshot: NavigatorTypesSnapshot = {
        availability: snapshot.availability,
        descriptors,
        revision: snapshot.revision
    };
    if (snapshot.message !== undefined) {
        return Object.freeze({ ...publicSnapshot, message: snapshot.message });
    }
    return Object.freeze(publicSnapshot);
}

function composeDescriptors(
    builtinDescriptors: readonly TpsNavigatorTypeDescriptor[],
    providerDescriptors: readonly TpsNavigatorTypeDescriptor[]
): readonly TpsNavigatorTypeDescriptor[] {
    return Object.freeze([...builtinDescriptors, ...providerDescriptors].filter(descriptor => isTpsNavigatorTypeId(descriptor.id)));
}

function composeRecordsByType(
    recordsByType: ReadonlyMap<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>,
    descriptors: readonly TpsNavigatorTypeDescriptor[]
): ReadonlyMap<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]> {
    const activeTypeIds = new Set(descriptors.map(descriptor => descriptor.id));
    return new Map([...recordsByType].filter(([typeId]) => isTpsNavigatorTypeId(typeId) && activeTypeIds.has(typeId)));
}

/**
 * Catalog controller for the fixed vault-file/Markdown-structure Types and externally
 * registered top-level scopes. Source readiness is isolated: the aggregate
 * catalog remains available while file-backed collections work.
 */
export class TypesAPI {
    readonly notesId = TPS_NAVIGATOR_TYPE_IDS.NOTES;
    readonly checkboxesId = TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES;
    readonly bulletsId = TPS_NAVIGATOR_TYPE_IDS.BULLETS;
    readonly headingsId = TPS_NAVIGATOR_TYPE_IDS.HEADINGS;
    readonly codeBlocksId = TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS;
    readonly calloutsId = TPS_NAVIGATOR_TYPE_IDS.CALLOUTS;
    readonly blockquotesId = TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES;
    readonly tablesId = TPS_NAVIGATOR_TYPE_IDS.TABLES;
    readonly webLinksId = TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS;
    readonly basesId = TPS_NAVIGATOR_TYPE_IDS.BASES;
    readonly canvasId = TPS_NAVIGATOR_TYPE_IDS.CANVAS;
    readonly drawingsId = TPS_NAVIGATOR_TYPE_IDS.DRAWINGS;
    readonly pdfsId = TPS_NAVIGATOR_TYPE_IDS.PDFS;
    readonly imagesId = TPS_NAVIGATOR_TYPE_IDS.IMAGES;
    readonly audioId = TPS_NAVIGATOR_TYPE_IDS.AUDIO;
    readonly videoId = TPS_NAVIGATOR_TYPE_IDS.VIDEO;

    private readonly listeners = new Set<NavigatorTypesListener>();
    private readonly internalListeners = new Set<() => void>();
    private readonly readyWaiters = new Set<(snapshot: NavigatorTypesSnapshot) => void>();
    private unsubscribeStore: (() => void) | null = null;
    private unsubscribeProviders: (() => void) | null = null;
    private cachedBuiltinSnapshot: TpsNavigatorTypesSnapshot | null = null;
    private cachedProviderSnapshot: NavigatorTypeProviderRegistrySnapshot | null = null;
    private cachedInternalSnapshot: TpsNavigatorTypesSnapshot | null = null;
    private cachedPublicSourceSnapshot: TpsNavigatorTypesSnapshot | null = null;
    private cachedPublicSnapshot: NavigatorTypesSnapshot | null = null;
    private compositeRevision = 0;
    private enabled: boolean;
    private disposed = false;

    constructor(
        private readonly store: NavigatorTypesStore,
        enabled = true,
        private readonly providerRegistry: NavigatorTypeProviderRegistry | null = null
    ) {
        this.enabled = enabled;
        this.store.setEnabled?.(enabled);
        this.providerRegistry?.setEnabled(enabled);
    }

    /** @deprecated Kind is frontmatter metadata and is no longer published in Types. */
    buildKind(kind: string): string | null {
        return createTpsNavigatorKindTypeId(kind);
    }

    /** @deprecated Parses stale Kind Type ids for compatibility only. */
    parseKind(typeId: string): string | null {
        return typeof typeId === 'string' ? getTpsNavigatorKindValue(typeId) : null;
    }

    /** Return whether a runtime value is a fixed or canonical provider Type id. */
    isType(typeId: unknown): boolean {
        return isTpsNavigatorTypeId(typeId);
    }

    /** Register runtime-owned top-level collections and their guarded rows. */
    registerProvider(provider: NavigatorTypeProvider, options?: NavigatorTypeProviderOptions): NavigatorTypeProviderRegistration {
        if (!this.providerRegistry) {
            throw new Error('Navigator Type provider registration is unavailable in this host.');
        }
        return this.providerRegistry.register(provider, options);
    }

    /** Return the latest immutable provider-neutral discovery snapshot. */
    getSnapshot(): NavigatorTypesSnapshot {
        if (this.disposed) {
            return DISPOSED_SNAPSHOT;
        }
        if (!this.enabled) {
            return DISABLED_SNAPSHOT;
        }
        const sourceSnapshot = this.getInternalSnapshot();
        if (sourceSnapshot === this.cachedPublicSourceSnapshot && this.cachedPublicSnapshot) {
            return this.cachedPublicSnapshot;
        }
        this.cachedPublicSourceSnapshot = sourceSnapshot;
        this.cachedPublicSnapshot = toPublicSnapshot(sourceSnapshot);
        return this.cachedPublicSnapshot;
    }

    /**
     * Subscribe to catalog changes. The listener receives the current snapshot
     * synchronously before this method returns.
     */
    subscribe(listener: NavigatorTypesListener): () => void {
        if (this.disposed) {
            try {
                listener(DISPOSED_SNAPSHOT);
            } catch {
                // Keep post-unload reads inert even when an external consumer fails.
            }
            return () => undefined;
        }
        this.listeners.add(listener);
        this.ensureSourceSubscriptions();
        try {
            listener(this.getSnapshot());
        } catch {
            // Match later delivery: one external consumer must not interrupt setup.
        }
        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            this.listeners.delete(listener);
            this.stopSourceSubscriptionsWhenIdle();
        };
    }

    /** Resolve on the first non-loading aggregate snapshot. */
    whenReady(): Promise<NavigatorTypesSnapshot> {
        const current = this.getSnapshot();
        if (current.availability !== 'loading') {
            return Promise.resolve(current);
        }
        return new Promise(resolve => {
            this.readyWaiters.add(resolve);
            this.ensureSourceSubscriptions();
            this.resolveReadyWaiters(this.getSnapshot());
        });
    }

    /** @internal Composite catalog containing records and source authority. */
    getInternalSnapshot(): TpsNavigatorTypesSnapshot {
        if (this.disposed) {
            return DISPOSED_INTERNAL_SNAPSHOT;
        }
        if (!this.enabled) {
            return DISABLED_INTERNAL_SNAPSHOT;
        }
        const builtinSnapshot = this.store.getSnapshot();
        const providerSnapshot = this.providerRegistry?.getSnapshot() ?? EMPTY_PROVIDER_SNAPSHOT;
        if (
            builtinSnapshot === this.cachedBuiltinSnapshot &&
            providerSnapshot === this.cachedProviderSnapshot &&
            this.cachedInternalSnapshot
        ) {
            return this.cachedInternalSnapshot;
        }

        this.cachedBuiltinSnapshot = builtinSnapshot;
        this.cachedProviderSnapshot = providerSnapshot;
        this.compositeRevision += 1;
        const authoritativeSourceKeys = new Set(providerSnapshot.authoritativeSourceKeys);
        if (builtinSnapshot.availability === 'ready') {
            authoritativeSourceKeys.add(TPS_NAVIGATOR_BUILTIN_TYPE_SOURCE);
        }
        const hasReadyExternalProvider = providerSnapshot.hasReadyProvider;
        const availability = builtinSnapshot.availability === 'ready' || hasReadyExternalProvider ? 'ready' : builtinSnapshot.availability;
        const message = availability === 'ready' ? undefined : builtinSnapshot.message;
        const builtinAvailability = builtinSnapshot.builtinAvailability ?? builtinSnapshot.availability;
        const builtinMessage = builtinSnapshot.builtinMessage ?? builtinSnapshot.message;
        const descriptors = composeDescriptors(builtinSnapshot.descriptors, providerSnapshot.descriptors);
        const snapshot: TpsNavigatorTypesSnapshot = {
            availability,
            descriptors,
            recordsByType: composeRecordsByType(builtinSnapshot.recordsByType, descriptors),
            revision: this.providerRegistry ? this.compositeRevision : builtinSnapshot.revision,
            authoritativeSourceKeys,
            builtinAvailability,
            ...(builtinSnapshot.lineAvailability ? { lineAvailability: builtinSnapshot.lineAvailability } : {}),
            ...(builtinSnapshot.lineMessage ? { lineMessage: builtinSnapshot.lineMessage } : {}),
            ...(builtinSnapshot.markdownAvailability ? { markdownAvailability: builtinSnapshot.markdownAvailability } : {}),
            ...(builtinSnapshot.markdownMessage ? { markdownMessage: builtinSnapshot.markdownMessage } : {})
        };
        if (message !== undefined || builtinMessage !== undefined) {
            this.cachedInternalSnapshot = Object.freeze({
                ...snapshot,
                ...(message !== undefined ? { message } : {}),
                ...(builtinMessage !== undefined ? { builtinMessage } : {})
            });
        } else {
            this.cachedInternalSnapshot = Object.freeze(snapshot);
        }
        return this.cachedInternalSnapshot;
    }

    /** @internal Subscribe React views to the complete catalog. */
    subscribeInternal(listener: () => void): () => void {
        if (this.disposed) {
            return () => undefined;
        }
        this.internalListeners.add(listener);
        this.ensureSourceSubscriptions();
        return () => {
            this.internalListeners.delete(listener);
            this.stopSourceSubscriptionsWhenIdle();
        };
    }

    /** @internal Resolve the provider that owns a currently discovered Type. */
    getProviderOwner(typeId: TpsNavigatorTypeId): NavigatorTypeProviderOwner | null {
        return this.enabled ? (this.providerRegistry?.getOwner(typeId) ?? null) : null;
    }

    /** @internal Query guarded rows from the provider that establishes a Type. */
    queryProviderRows(typeId: TpsNavigatorTypeId, query: NavigatorTypeProviderRowsQuery): Promise<NavigatorProvidedRow[]> {
        return this.enabled ? (this.providerRegistry?.queryRows(typeId, query) ?? Promise.resolve([])) : Promise.resolve([]);
    }

    /** @internal Enable or disable display after a settings update. */
    updateEnabled(enabled: boolean): void {
        if (this.disposed || this.enabled === enabled) {
            return;
        }
        this.enabled = enabled;
        if (!enabled) {
            this.unsubscribeStore?.();
            this.unsubscribeStore = null;
            this.unsubscribeProviders?.();
            this.unsubscribeProviders = null;
            this.store.setEnabled?.(false);
            this.providerRegistry?.setEnabled(false);
        } else {
            this.store.setEnabled?.(true);
            this.providerRegistry?.setEnabled(true);
            this.ensureSourceSubscriptions();
        }
        this.invalidateCaches();
        this.publish();
    }

    /** @internal Release provider callbacks, source subscriptions, and listeners. */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.unsubscribeStore?.();
        this.unsubscribeProviders?.();
        this.unsubscribeStore = null;
        this.unsubscribeProviders = null;
        this.providerRegistry?.dispose();
        this.invalidateCaches();
        this.publish();
        this.listeners.clear();
        this.internalListeners.clear();
    }

    private ensureSourceSubscriptions(): void {
        if (
            this.disposed ||
            !this.enabled ||
            (this.listeners.size === 0 && this.internalListeners.size === 0 && this.readyWaiters.size === 0)
        ) {
            return;
        }
        this.unsubscribeStore ??= this.store.subscribe(() => this.handleSourceChange());
        if (this.providerRegistry) {
            this.unsubscribeProviders ??= this.providerRegistry.subscribe(() => this.handleSourceChange());
        }
    }

    private handleSourceChange(): void {
        this.invalidateCaches();
        this.publish();
    }

    private invalidateCaches(): void {
        this.cachedBuiltinSnapshot = null;
        this.cachedProviderSnapshot = null;
        this.cachedInternalSnapshot = null;
        this.cachedPublicSourceSnapshot = null;
        this.cachedPublicSnapshot = null;
    }

    private publish(): void {
        const publicSnapshot = this.getSnapshot();
        for (const listener of [...this.listeners]) {
            try {
                listener(publicSnapshot);
            } catch {
                // One external consumer must not interrupt catalog delivery.
            }
        }
        for (const listener of [...this.internalListeners]) {
            try {
                listener();
            } catch {
                // One view must not interrupt another view's catalog delivery.
            }
        }
        this.resolveReadyWaiters(publicSnapshot);
    }

    private resolveReadyWaiters(snapshot: NavigatorTypesSnapshot): void {
        if (snapshot.availability === 'loading') {
            return;
        }
        for (const resolve of [...this.readyWaiters]) {
            resolve(snapshot);
        }
        this.readyWaiters.clear();
        this.stopSourceSubscriptionsWhenIdle();
    }

    private stopSourceSubscriptionsWhenIdle(): void {
        if (this.listeners.size > 0 || this.internalListeners.size > 0 || this.readyWaiters.size > 0) {
            return;
        }
        this.unsubscribeStore?.();
        this.unsubscribeProviders?.();
        this.unsubscribeStore = null;
        this.unsubscribeProviders = null;
    }
}
