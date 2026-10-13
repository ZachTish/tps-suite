/*
 * TPS Notebook Navigator - route exact Core tag activations into the Navigator.
 */

import type { App, EventRef } from 'obsidian';
import { hasValidTagCharacters, normalizeTagPath } from '../utils/tagUtils';
import { isReservedVirtualTagPath } from '../utils/virtualTagCollections';

const GLOBAL_SEARCH_PLUGIN_ID = 'global-search';
const OPEN_GLOBAL_SEARCH_METHOD = 'openGlobalSearch';
const ACTIVATION_EVENT_NAMES = ['click', 'contextmenu', 'pointerup', 'touchend', 'keydown'] as const;
const ACTIVATION_PERMIT_DURATION_MS = 250;

type OpenGlobalSearch = (this: unknown, ...args: unknown[]) => unknown;

interface GlobalSearchPlugin {
    instance?: unknown;
}

interface InternalPluginRegistry {
    getPluginById?(pluginId: string): unknown;
}

interface AppWithInternalPlugins {
    internalPlugins?: InternalPluginRegistry;
}

interface InstalledWrapper {
    readonly instance: object;
    readonly original: OpenGlobalSearch;
    readonly wrapper: OpenGlobalSearch;
    readonly previousOwnDescriptor: PropertyDescriptor | undefined;
}

export interface CoreTagSearchRouterOptions {
    readonly app: App;
    readonly mainDocument: Document | null | undefined;
    readonly routeTag: (canonicalTagPath: string) => boolean | Promise<boolean>;
}

/**
 * Parses the complete query emitted by Obsidian Core when a single tag is activated.
 * Compound searches, ordinary hash searches, virtual collection ids, and malformed tags
 * intentionally remain owned by Core Search.
 */
export function parseExactCoreTagSearchQuery(query: unknown): string | null {
    if (typeof query !== 'string') {
        return null;
    }

    const match = /^tag:#?([^\s]+)$/u.exec(query);
    if (!match) {
        return null;
    }

    const rawTagPath = match[1];
    if (!rawTagPath || !hasValidTagCharacters(rawTagPath) || isReservedVirtualTagPath(rawTagPath)) {
        return null;
    }

    const canonicalTagPath = normalizeTagPath(rawTagPath);
    if (!canonicalTagPath || isReservedVirtualTagPath(canonicalTagPath)) {
        return null;
    }

    return canonicalTagPath;
}

/**
 * Reversibly shadows Core Search's `openGlobalSearch` method on its current instance.
 * Only an exact single-tag query made within a short, consumed-once permit after a
 * captured user activation is offered to the host; every other call preserves Core
 * Search's original behavior.
 */
export class CoreTagSearchRouter {
    private readonly app: App;
    private readonly mainDocument: Document | null | undefined;
    private readonly routeTag: CoreTagSearchRouterOptions['routeTag'];
    private readonly attachedDocuments = new Set<Document>();
    private readonly workspaceEventRefs: EventRef[] = [];

    private installedWrapper: InstalledWrapper | null = null;
    private running = false;
    private activationPermit = 0;
    private activationPermitDeadline = 0;
    private activationPermitTimer: ReturnType<typeof window.setTimeout> | null = null;
    private activationSequence = 0;
    private requestSequence = 0;
    private latestRequestSequence = 0;

    constructor(options: CoreTagSearchRouterOptions) {
        this.app = options.app;
        this.mainDocument = options.mainDocument;
        this.routeTag = options.routeTag;
    }

    /** Starts document tracking and attempts the first Core Search capability probe. */
    public start(): boolean {
        if (this.running) {
            return this.probe();
        }

        this.running = true;
        this.attachDocument(this.mainDocument);
        this.attachCurrentWorkspaceDocuments();
        this.registerWorkspaceEvents();
        return this.probe();
    }

    /**
     * Re-resolves Core Search and safely replaces this router's own wrapper when the
     * internal plugin instance or method has changed.
     */
    public probe(): boolean {
        if (!this.running) {
            return false;
        }

        const resolved = this.resolveOpenGlobalSearch();
        if (resolved && this.installedWrapper?.instance === resolved.instance && this.installedWrapper.wrapper === resolved.method) {
            return true;
        }

        this.restoreInstalledWrapper();

        const current = this.resolveOpenGlobalSearch();
        if (!current) {
            return false;
        }

        return this.installWrapper(current.instance, current.method);
    }

    /** Restores only this router's still-installed wrapper and removes every listener. */
    public dispose(): void {
        if (!this.running && this.installedWrapper === null && this.attachedDocuments.size === 0) {
            return;
        }

        this.running = false;
        this.clearActivationPermit();
        this.restoreInstalledWrapper();

        for (const eventRef of this.workspaceEventRefs.splice(0)) {
            try {
                this.app.workspace.offref(eventRef);
            } catch {
                // A partially torn-down workspace must not prevent fail-open cleanup.
            }
        }

        for (const document of this.attachedDocuments) {
            this.detachDocument(document);
        }
    }

    private resolveOpenGlobalSearch(): { readonly instance: object; readonly method: OpenGlobalSearch } | null {
        try {
            const app = this.app as unknown as AppWithInternalPlugins;
            const registry = app.internalPlugins;
            if (!registry || typeof registry.getPluginById !== 'function') {
                return null;
            }

            const plugin = registry.getPluginById(GLOBAL_SEARCH_PLUGIN_ID) as GlobalSearchPlugin | null | undefined;
            const instance = plugin?.instance;
            if ((typeof instance !== 'object' || instance === null) && typeof instance !== 'function') {
                return null;
            }

            const method = Reflect.get(instance, OPEN_GLOBAL_SEARCH_METHOD) as unknown;
            if (typeof method !== 'function') {
                return null;
            }

            return { instance, method: method as OpenGlobalSearch };
        } catch {
            return null;
        }
    }

    private installWrapper(instance: object, original: OpenGlobalSearch): boolean {
        let previousOwnDescriptor: PropertyDescriptor | undefined;
        try {
            previousOwnDescriptor = Object.getOwnPropertyDescriptor(instance, OPEN_GLOBAL_SEARCH_METHOD);
        } catch {
            return false;
        }
        if (previousOwnDescriptor && !('value' in previousOwnDescriptor)) {
            return false;
        }

        const handleOpenGlobalSearch = this.handleOpenGlobalSearch.bind(this);
        const wrapper: OpenGlobalSearch = function (this: unknown, ...args: unknown[]): unknown {
            return handleOpenGlobalSearch(original, this, args);
        };

        const wrapperDescriptor: PropertyDescriptor = previousOwnDescriptor
            ? { ...previousOwnDescriptor, value: wrapper }
            : {
                  configurable: true,
                  enumerable: false,
                  value: wrapper,
                  writable: true
              };

        try {
            Object.defineProperty(instance, OPEN_GLOBAL_SEARCH_METHOD, wrapperDescriptor);
            if (Object.getOwnPropertyDescriptor(instance, OPEN_GLOBAL_SEARCH_METHOD)?.value !== wrapper) {
                return false;
            }
        } catch {
            return false;
        }

        this.installedWrapper = {
            instance,
            original,
            wrapper,
            previousOwnDescriptor
        };
        return true;
    }

    private restoreInstalledWrapper(): void {
        const installed = this.installedWrapper;
        this.installedWrapper = null;
        if (!installed) {
            return;
        }

        let currentOwnDescriptor: PropertyDescriptor | undefined;
        try {
            currentOwnDescriptor = Object.getOwnPropertyDescriptor(installed.instance, OPEN_GLOBAL_SEARCH_METHOD);
        } catch {
            return;
        }
        if (!currentOwnDescriptor || !('value' in currentOwnDescriptor) || currentOwnDescriptor.value !== installed.wrapper) {
            return;
        }

        try {
            if (installed.previousOwnDescriptor) {
                Object.defineProperty(installed.instance, OPEN_GLOBAL_SEARCH_METHOD, installed.previousOwnDescriptor);
            } else {
                Reflect.deleteProperty(installed.instance, OPEN_GLOBAL_SEARCH_METHOD);
            }
        } catch {
            // A retained wrapper observes running=false and therefore remains fail-open.
        }
    }

    private handleOpenGlobalSearch(original: OpenGlobalSearch, receiver: unknown, args: readonly unknown[]): unknown {
        if (!this.running) {
            return Reflect.apply(original, receiver, args);
        }

        const canonicalTagPath = parseExactCoreTagSearchQuery(args[0]);
        const hasActivationPermit = this.consumeActivationPermit();
        if (!canonicalTagPath || !hasActivationPermit) {
            return Reflect.apply(original, receiver, args);
        }

        const requestSequence = ++this.requestSequence;
        this.latestRequestSequence = requestSequence;
        let fallbackInvoked = false;
        const invokeFallback = (): unknown => {
            if (fallbackInvoked) {
                return undefined;
            }
            fallbackInvoked = true;
            return Reflect.apply(original, receiver, args);
        };

        return Promise.resolve()
            .then(() => (this.running ? this.routeTag(canonicalTagPath) : false))
            .then(
                succeeded => {
                    if (requestSequence !== this.latestRequestSequence) {
                        return undefined;
                    }
                    if (!this.running) {
                        return invokeFallback();
                    }
                    if (succeeded === true) {
                        return undefined;
                    }
                    return invokeFallback();
                },
                () => {
                    if (requestSequence !== this.latestRequestSequence) {
                        return undefined;
                    }
                    if (!this.running) {
                        return invokeFallback();
                    }
                    return invokeFallback();
                }
            );
    }

    private consumeActivationPermit(): boolean {
        if (this.activationPermit === 0) {
            return false;
        }

        if (Date.now() > this.activationPermitDeadline) {
            this.clearActivationPermit();
            return false;
        }

        this.clearActivationPermit();
        return true;
    }

    private readonly handleActivationCapture = (event: Event): void => {
        if (!this.running) {
            return;
        }
        if (!this.isSupportedActivation(event)) {
            if (event.isTrusted === true) {
                this.clearActivationPermit();
            }
            return;
        }

        const activationSequence = ++this.activationSequence;
        this.clearActivationPermit();
        this.activationPermit = activationSequence;
        this.activationPermitDeadline = Date.now() + ACTIVATION_PERMIT_DURATION_MS;
        this.activationPermitTimer = window.setTimeout(() => {
            if (this.activationPermit === activationSequence) {
                this.activationPermit = 0;
                this.activationPermitDeadline = 0;
                this.activationPermitTimer = null;
            }
        }, ACTIVATION_PERMIT_DURATION_MS);
    };

    private clearActivationPermit(): void {
        this.activationPermit = 0;
        this.activationPermitDeadline = 0;
        if (this.activationPermitTimer !== null) {
            window.clearTimeout(this.activationPermitTimer);
            this.activationPermitTimer = null;
        }
    }

    private isSupportedActivation(event: Event): boolean {
        if (event.isTrusted !== true) {
            return false;
        }

        if (event.type !== 'keydown') {
            return event.type === 'click' || event.type === 'contextmenu' || event.type === 'pointerup' || event.type === 'touchend';
        }

        const key = (event as KeyboardEvent).key;
        return (key === 'Enter' || key === ' ' || key === 'Spacebar') && !this.isEditableKeyboardTarget(event.target);
    }

    private isEditableKeyboardTarget(target: EventTarget | null): boolean {
        if (typeof target !== 'object' || target === null) {
            return false;
        }

        const candidate = target as {
            readonly isContentEditable?: unknown;
            readonly tagName?: unknown;
            closest?: (selector: string) => unknown;
        };
        if (candidate.isContentEditable === true) {
            return true;
        }

        const tagName = typeof candidate.tagName === 'string' ? candidate.tagName.toUpperCase() : '';
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
            return true;
        }

        try {
            return (
                typeof candidate.closest === 'function' &&
                candidate.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null
            );
        } catch {
            return false;
        }
    }

    private attachDocument(document: Document | null | undefined): void {
        if (!this.running || !document || this.attachedDocuments.has(document)) {
            return;
        }

        try {
            for (const eventName of ACTIVATION_EVENT_NAMES) {
                document.addEventListener(eventName, this.handleActivationCapture, true);
            }
            this.attachedDocuments.add(document);
        } catch {
            for (const eventName of ACTIVATION_EVENT_NAMES) {
                try {
                    document.removeEventListener(eventName, this.handleActivationCapture, true);
                } catch {
                    // Ignore partial listener cleanup on an invalid/closing document.
                }
            }
        }
    }

    private detachDocument(document: Document): void {
        for (const eventName of ACTIVATION_EVENT_NAMES) {
            try {
                document.removeEventListener(eventName, this.handleActivationCapture, true);
            } catch {
                // Ignore teardown races with a closing popout document.
            }
        }
        this.attachedDocuments.delete(document);
    }

    private attachCurrentWorkspaceDocuments(): void {
        try {
            this.app.workspace.iterateAllLeaves(leaf => {
                try {
                    this.attachDocument(leaf.getContainer().doc);
                } catch {
                    // Ignore a leaf whose popout is closing while the layout is enumerated.
                }
            });
        } catch {
            // Older or partial hosts still retain the explicitly supplied main document.
        }
    }

    private registerWorkspaceEvents(): void {
        try {
            this.workspaceEventRefs.push(
                this.app.workspace.on('layout-change', () => {
                    this.attachCurrentWorkspaceDocuments();
                    this.probe();
                })
            );
            this.workspaceEventRefs.push(
                this.app.workspace.on('window-open', (_workspaceWindow, window) => {
                    this.attachDocument(window.document);
                    this.probe();
                })
            );
            this.workspaceEventRefs.push(
                this.app.workspace.on('window-close', (_workspaceWindow, window) => {
                    this.detachDocument(window.document);
                })
            );
        } catch {
            // Capability probing still works when a test host or older build lacks events.
        }
    }
}
