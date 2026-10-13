import { describe, expect, it, vi } from 'vitest';
import { CoreTagSearchRouter, parseExactCoreTagSearchQuery } from '../../src/services/CoreTagSearchRouter';

/* eslint-disable @typescript-eslint/unbound-method -- This suite intentionally detaches and compares methods to test receiver and restoration behavior. */

type Listener = EventListenerOrEventListenerObject;

class FakeDocument {
    private readonly listeners = new Map<string, Set<Listener>>();

    public addEventListener(type: string, listener: Listener): void {
        const listeners = this.listeners.get(type) ?? new Set<Listener>();
        listeners.add(listener);
        this.listeners.set(type, listeners);
    }

    public removeEventListener(type: string, listener: Listener): void {
        this.listeners.get(type)?.delete(listener);
    }

    public activate(
        type: 'click' | 'contextmenu' | 'pointerup' | 'touchend' | 'keydown',
        key = '',
        options: { readonly isTrusted?: boolean; readonly target?: unknown } = {}
    ): void {
        const event = {
            isTrusted: options.isTrusted ?? true,
            key,
            target: options.target ?? null,
            type
        } as KeyboardEvent;
        for (const listener of this.listeners.get(type) ?? []) {
            if (typeof listener === 'function') {
                listener(event);
            } else {
                listener.handleEvent(event);
            }
        }
    }

    public listenerCount(type: string): number {
        return this.listeners.get(type)?.size ?? 0;
    }
}

class FakeWorkspace {
    private readonly callbacks = new Map<string, Set<(...args: unknown[]) => void>>();
    public existingDocuments: FakeDocument[] = [];

    public on(name: string, callback: (...args: unknown[]) => void): object {
        const callbacks = this.callbacks.get(name) ?? new Set<(...args: unknown[]) => void>();
        callbacks.add(callback);
        this.callbacks.set(name, callbacks);
        return { callback, name };
    }

    public offref(ref: unknown): void {
        const eventRef = ref as { callback: (...args: unknown[]) => void; name: string };
        this.callbacks.get(eventRef.name)?.delete(eventRef.callback);
    }

    public emit(name: string, ...args: unknown[]): void {
        for (const callback of this.callbacks.get(name) ?? []) {
            callback(...args);
        }
    }

    public iterateAllLeaves(callback: (leaf: { getContainer(): { doc: Document } }) => void): void {
        for (const document of this.existingDocuments) {
            callback({ getContainer: () => ({ doc: document as unknown as Document }) });
        }
    }
}

interface TestSearchInstance {
    calls: Array<{ readonly args: readonly unknown[]; readonly receiver: unknown }>;
    openGlobalSearch(this: unknown, ...args: unknown[]): string;
}

function createSearchInstance(label = 'core'): TestSearchInstance {
    return {
        calls: [],
        openGlobalSearch(this: TestSearchInstance, ...args: unknown[]): string {
            this.calls.push({ args, receiver: this });
            return `${label}:${String(args[0])}`;
        }
    };
}

function createHarness(options?: {
    readonly instance?: TestSearchInstance;
    readonly routeTag?: (tag: string) => boolean | Promise<boolean>;
}) {
    const document = new FakeDocument();
    const workspace = new FakeWorkspace();
    const instance = options?.instance ?? createSearchInstance();
    let currentInstance: TestSearchInstance | null = instance;
    const app = {
        internalPlugins: {
            getPluginById(pluginId: string) {
                return pluginId === 'global-search' && currentInstance ? { instance: currentInstance } : undefined;
            }
        },
        workspace
    };
    const routeTag = vi.fn(options?.routeTag ?? (() => true));
    const router = new CoreTagSearchRouter({
        app: app as never,
        mainDocument: document as unknown as Document,
        routeTag
    });

    return {
        app,
        document,
        instance,
        routeTag,
        router,
        setInstance(next: TestSearchInstance | null) {
            currentInstance = next;
        },
        workspace
    };
}

function deferred<T>(): {
    readonly promise: Promise<T>;
    readonly resolve: (value: T) => void;
    readonly reject: (reason?: unknown) => void;
} {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, reject, resolve };
}

describe('parseExactCoreTagSearchQuery', () => {
    it('accepts only a complete Core single-tag query and returns a validated canonical path', () => {
        expect(parseExactCoreTagSearchQuery('tag:#Projects/Client')).toBe('projects/client');
        expect(parseExactCoreTagSearchQuery('tag:Projects/Client')).toBe('projects/client');
        expect(parseExactCoreTagSearchQuery('tag:#café/📚')).toBe('café/📚');

        for (const query of [
            null,
            '#project',
            'tag:',
            'tag:#',
            'tag:##project',
            ' tag:#project',
            'tag:#project ',
            'tag:#project tag:#other',
            'tag:#project OR tag:#other',
            'tag:#project//child',
            'tag:#project!',
            'tag:#__all_tags__',
            'tag:__tagged__',
            'tag:#__untagged__/child'
        ]) {
            expect(parseExactCoreTagSearchQuery(query)).toBeNull();
        }
    });
});

describe('CoreTagSearchRouter', () => {
    it('passes non-tag, compound, and unactivated calls through synchronously with the receiver and every argument', () => {
        const harness = createHarness();
        expect(harness.router.start()).toBe(true);

        const replacementReceiver = { calls: [] as TestSearchInstance['calls'] };
        const method = harness.instance.openGlobalSearch;
        expect(method.call(replacementReceiver, 'tag:#project', 'extra', 42)).toBe('core:tag:#project');
        expect(harness.instance.calls).toHaveLength(0);
        expect(replacementReceiver.calls).toEqual([{ args: ['tag:#project', 'extra', 42], receiver: replacementReceiver }]);

        harness.document.activate('click');
        expect(harness.instance.openGlobalSearch('tag:#project tag:#other', 'compound')).toBe('core:tag:#project tag:#other');
        expect(harness.instance.openGlobalSearch('tag:#project')).toBe('core:tag:#project');
        expect(harness.routeTag).not.toHaveBeenCalled();
    });

    it('routes one exact query from pointer, touch, context-menu, Enter, or Space activation and expires each permit', async () => {
        vi.useFakeTimers();
        const harness = createHarness();
        try {
            harness.router.start();

            for (const [type, key] of [
                ['click', ''],
                ['contextmenu', ''],
                ['pointerup', ''],
                ['touchend', ''],
                ['keydown', 'Enter'],
                ['keydown', ' ']
            ] as const) {
                harness.document.activate(type, key);
                const query = type === 'contextmenu' ? 'tag:Projects/Client' : 'tag:#Projects/Client';
                await expect(harness.instance.openGlobalSearch(query)).resolves.toBeUndefined();
            }

            harness.document.activate('keydown', 'ArrowDown');
            expect(harness.instance.openGlobalSearch('tag:#ignored')).toBe('core:tag:#ignored');
            harness.document.activate('click');
            vi.advanceTimersByTime(251);
            expect(harness.instance.openGlobalSearch('tag:#expired')).toBe('core:tag:#expired');
            expect(harness.routeTag).toHaveBeenCalledTimes(6);
            expect(harness.routeTag).toHaveBeenCalledWith('projects/client');
        } finally {
            harness.router.dispose();
            vi.useRealTimers();
        }
    });

    it("keeps a trusted click permit long enough for Core Search's delayed tag callback", async () => {
        vi.useFakeTimers();
        const harness = createHarness();
        try {
            harness.router.start();
            harness.document.activate('click');

            const routed = new Promise<unknown>(resolve => {
                window.setTimeout(() => resolve(harness.instance.openGlobalSearch('tag:#delayed')), 150);
            });
            await vi.advanceTimersByTimeAsync(150);

            await expect(routed).resolves.toBeUndefined();
            expect(harness.routeTag).toHaveBeenCalledOnce();
            expect(harness.routeTag).toHaveBeenCalledWith('delayed');
            expect(harness.instance.calls).toHaveLength(0);
        } finally {
            harness.router.dispose();
            vi.useRealTimers();
        }
    });

    it("keeps a newer activation valid after the older permit's deadline", async () => {
        vi.useFakeTimers();
        const harness = createHarness();
        try {
            harness.router.start();
            harness.document.activate('click');
            vi.advanceTimersByTime(100);
            harness.document.activate('click');
            vi.advanceTimersByTime(151);

            await expect(harness.instance.openGlobalSearch('tag:#newer')).resolves.toBeUndefined();
            expect(harness.routeTag).toHaveBeenCalledOnce();
            expect(harness.routeTag).toHaveBeenCalledWith('newer');
        } finally {
            harness.router.dispose();
            vi.useRealTimers();
        }
    });

    it('clears an unconsumed activation timer on disposal', () => {
        vi.useFakeTimers();
        const harness = createHarness();
        try {
            harness.router.start();
            harness.document.activate('click');
            expect(vi.getTimerCount()).toBe(1);

            harness.router.dispose();
            expect(vi.getTimerCount()).toBe(0);
            expect(harness.instance.openGlobalSearch('tag:#disposed')).toBe('core:tag:#disposed');
            expect(harness.routeTag).not.toHaveBeenCalled();
        } finally {
            harness.router.dispose();
            vi.useRealTimers();
        }
    });

    it('does not grant activation permits to synthetic events or editable keyboard targets', () => {
        const harness = createHarness();
        harness.router.start();

        harness.document.activate('click', '', { isTrusted: false });
        expect(harness.instance.openGlobalSearch('tag:#synthetic')).toBe('core:tag:#synthetic');

        for (const target of [
            { tagName: 'INPUT' },
            { tagName: 'textarea' },
            { isContentEditable: true },
            { closest: () => ({ tagName: 'INPUT' }) }
        ]) {
            harness.document.activate('keydown', 'Enter', { target });
            expect(harness.instance.openGlobalSearch('tag:#manual')).toBe('core:tag:#manual');
        }
        expect(harness.routeTag).not.toHaveBeenCalled();
    });

    it('falls back exactly once when routing returns false or rejects', async () => {
        const outcomes: Array<boolean | Error> = [false, new Error('unavailable')];
        const harness = createHarness({
            routeTag: async () => {
                const outcome = outcomes.shift();
                if (outcome instanceof Error) {
                    throw outcome;
                }
                return outcome ?? false;
            }
        });
        harness.router.start();

        harness.document.activate('click');
        await expect(harness.instance.openGlobalSearch('tag:#first', 'one')).resolves.toBe('core:tag:#first');
        harness.document.activate('contextmenu');
        await expect(harness.instance.openGlobalSearch('tag:#second', 'two')).resolves.toBe('core:tag:#second');

        expect(harness.instance.calls.map(call => call.args)).toEqual([
            ['tag:#first', 'one'],
            ['tag:#second', 'two']
        ]);
        expect(harness.instance.calls.every(call => call.receiver === harness.instance)).toBe(true);
    });

    it('suppresses an older failed fallback after a newer activation succeeds', async () => {
        const first = deferred<boolean>();
        const second = deferred<boolean>();
        const harness = createHarness({
            routeTag: tag => (tag === 'first' ? first.promise : second.promise)
        });
        harness.router.start();

        harness.document.activate('click');
        const firstResult = harness.instance.openGlobalSearch('tag:#first');
        harness.document.activate('click');
        const secondResult = harness.instance.openGlobalSearch('tag:#second');
        second.resolve(true);
        await expect(secondResult).resolves.toBeUndefined();
        first.resolve(false);
        await expect(firstResult).resolves.toBeUndefined();

        expect(harness.instance.calls).toHaveLength(0);
    });

    it('suppresses an older failed fallback after a newer success even when disposal follows', async () => {
        const first = deferred<boolean>();
        const second = deferred<boolean>();
        const harness = createHarness({ routeTag: tag => (tag === 'first' ? first.promise : second.promise) });
        harness.router.start();

        harness.document.activate('click');
        const firstResult = harness.instance.openGlobalSearch('tag:#first');
        harness.document.activate('click');
        const secondResult = harness.instance.openGlobalSearch('tag:#second');
        second.resolve(true);
        await expect(secondResult).resolves.toBeUndefined();
        harness.router.dispose();
        first.resolve(false);
        await expect(firstResult).resolves.toBeUndefined();

        expect(harness.instance.calls).toHaveLength(0);
    });

    it('restores the exact own descriptor, stays fail-open during pending disposal, and never clobbers a replacement', async () => {
        const pending = deferred<boolean>();
        const instance = createSearchInstance();
        const original = instance.openGlobalSearch;
        Object.defineProperty(instance, 'openGlobalSearch', {
            configurable: true,
            enumerable: true,
            value: original,
            writable: false
        });
        const before = Object.getOwnPropertyDescriptor(instance, 'openGlobalSearch');
        const harness = createHarness({ instance, routeTag: () => pending.promise });
        harness.router.start();

        harness.document.activate('click');
        const routed = instance.openGlobalSearch('tag:#pending');
        harness.router.dispose();
        expect(Object.getOwnPropertyDescriptor(instance, 'openGlobalSearch')).toEqual(before);
        pending.resolve(true);
        await expect(routed).resolves.toBe('core:tag:#pending');
        expect(instance.calls).toHaveLength(1);

        const secondHarness = createHarness();
        secondHarness.router.start();
        const externalReplacement = vi.fn(() => 'replacement');
        Object.defineProperty(secondHarness.instance, 'openGlobalSearch', {
            configurable: true,
            enumerable: false,
            value: externalReplacement,
            writable: true
        });
        secondHarness.router.dispose();
        expect(secondHarness.instance.openGlobalSearch).toBe(externalReplacement);
    });

    it('re-probes a replaced Core instance without clobbering either instance', async () => {
        const first = createSearchInstance('first');
        const second = createSearchInstance('second');
        const firstOriginal = first.openGlobalSearch;
        const secondOriginal = second.openGlobalSearch;
        const harness = createHarness({ instance: first });
        harness.router.start();
        expect(first.openGlobalSearch).not.toBe(firstOriginal);

        harness.setInstance(second);
        expect(harness.router.probe()).toBe(true);
        expect(first.openGlobalSearch).toBe(firstOriginal);
        expect(second.openGlobalSearch).not.toBe(secondOriginal);

        harness.document.activate('click');
        await expect(second.openGlobalSearch('tag:#new')).resolves.toBeUndefined();
        harness.router.dispose();
        expect(second.openGlobalSearch).toBe(secondOriginal);
    });

    it('fails open when Core Search is unavailable and recovers on a later layout probe', async () => {
        const harness = createHarness();
        const original = harness.instance.openGlobalSearch;
        harness.setInstance(null);
        expect(harness.router.start()).toBe(false);
        expect(harness.router.start()).toBe(false);
        expect(harness.document.listenerCount('click')).toBe(1);

        harness.setInstance(harness.instance);
        harness.workspace.emit('layout-change');
        expect(harness.instance.openGlobalSearch).not.toBe(original);
        harness.document.activate('click');
        await expect(harness.instance.openGlobalSearch('tag:#recovered')).resolves.toBeUndefined();

        harness.router.dispose();
        harness.router.dispose();
        expect(harness.instance.openGlobalSearch).toBe(original);
        expect(harness.document.listenerCount('click')).toBe(0);
    });

    it('captures activation in workspace popouts and detaches closed and disposed documents', async () => {
        const harness = createHarness();
        const existingPopoutDocument = new FakeDocument();
        harness.workspace.existingDocuments = [existingPopoutDocument];
        harness.router.start();
        expect(existingPopoutDocument.listenerCount('click')).toBe(1);

        existingPopoutDocument.activate('click');
        await expect(harness.instance.openGlobalSearch('tag:#existing-popout')).resolves.toBeUndefined();
        expect(harness.routeTag).toHaveBeenLastCalledWith('existing-popout');

        const popoutDocument = new FakeDocument();
        const popoutWindow = { document: popoutDocument };
        harness.workspace.emit('window-open', {}, popoutWindow);
        expect(popoutDocument.listenerCount('click')).toBe(1);

        popoutDocument.activate('keydown', 'Enter');
        await expect(harness.instance.openGlobalSearch('tag:#popout')).resolves.toBeUndefined();
        expect(harness.routeTag).toHaveBeenLastCalledWith('popout');

        harness.workspace.emit('window-close', {}, popoutWindow);
        expect(popoutDocument.listenerCount('click')).toBe(0);
        harness.router.dispose();
        expect(harness.document.listenerCount('click')).toBe(0);
    });
});

/* eslint-enable @typescript-eslint/unbound-method -- End intentional method identity assertions. */
