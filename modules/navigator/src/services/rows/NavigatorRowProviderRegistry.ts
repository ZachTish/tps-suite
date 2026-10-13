/*
 * TPS Notebook Navigator - deterministic registry for optional list row providers.
 */

import type { NavigatorRowProvider } from './types';

const NAMESPACED_PROVIDER_ID_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;

export class NavigatorRowProviderRegistry {
    private readonly providers = new Map<string, NavigatorRowProvider>();
    private readonly registeredProviderIds = new WeakMap<NavigatorRowProvider, string>();
    private readonly activeQueryControllers = new Map<string, Set<AbortController>>();

    register(provider: NavigatorRowProvider): () => void {
        const providerId = provider?.id;
        if (!provider || typeof provider !== 'object' || typeof providerId !== 'string') {
            throw new Error('Navigator row provider must be an object with a string ID.');
        }
        if (!NAMESPACED_PROVIDER_ID_RE.test(providerId)) {
            throw new Error(`Navigator row provider ID must be namespaced: ${providerId}`);
        }
        if (typeof provider.getRows !== 'function') {
            throw new Error(`Navigator row provider must implement getRows(): ${providerId}`);
        }
        const existingProviderId = this.registeredProviderIds.get(provider);
        if (existingProviderId && this.providers.get(existingProviderId) === provider) {
            throw new Error(`Navigator row provider is already registered: ${existingProviderId}`);
        }
        if (this.providers.has(providerId)) {
            throw new Error(`Navigator row provider is already registered: ${providerId}`);
        }

        this.providers.set(providerId, provider);
        this.registeredProviderIds.set(provider, providerId);
        return () => {
            if (this.providers.get(providerId) === provider) {
                this.cancelProviderQueries(providerId);
                this.providers.delete(providerId);
                this.registeredProviderIds.delete(provider);
            }
        };
    }

    get(providerId: string): NavigatorRowProvider | null {
        return this.providers.get(providerId) ?? null;
    }

    resolve(providerIds: readonly string[]): NavigatorRowProvider[] {
        const seen = new Set<string>();
        const providers: NavigatorRowProvider[] = [];

        for (const providerId of providerIds) {
            if (seen.has(providerId)) {
                continue;
            }
            seen.add(providerId);
            const provider = this.providers.get(providerId);
            if (provider) {
                providers.push(provider);
            }
        }

        return providers;
    }

    /** @internal Returns the immutable ID captured when this exact provider instance registered. */
    getRegisteredId(provider: NavigatorRowProvider): string | null {
        const providerId = this.registeredProviderIds.get(provider);
        return providerId !== undefined && this.providers.get(providerId) === provider ? providerId : null;
    }

    /** @internal Owns provider query lifetimes across public options, unregister, and unload transitions. */
    trackQuery(provider: NavigatorRowProvider, controller: AbortController): () => void {
        const providerId = this.getRegisteredId(provider);
        if (providerId === null) {
            controller.abort();
            return () => undefined;
        }
        const controllers = this.activeQueryControllers.get(providerId) ?? new Set<AbortController>();
        controllers.add(controller);
        this.activeQueryControllers.set(providerId, controllers);
        let active = true;
        return () => {
            if (!active) {
                return;
            }
            active = false;
            controllers.delete(controller);
            if (controllers.size === 0 && this.activeQueryControllers.get(providerId) === controllers) {
                this.activeQueryControllers.delete(providerId);
            }
        };
    }

    /** @internal Immediately cancels every active query owned by one provider. */
    cancelProviderQueries(providerId: string): void {
        const controllers = this.activeQueryControllers.get(providerId);
        if (!controllers) {
            return;
        }
        this.activeQueryControllers.delete(providerId);
        controllers.forEach(controller => controller.abort());
        controllers.clear();
    }

    /** @internal Immediately cancels all active queries, including built-in providers, during unload. */
    cancelAllQueries(): void {
        [...this.activeQueryControllers.keys()].forEach(providerId => this.cancelProviderQueries(providerId));
    }
}
