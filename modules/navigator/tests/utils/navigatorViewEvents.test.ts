/* TPS Notebook Navigator - owner-window lifecycle event routing. */

import { describe, expect, it, vi } from 'vitest';
import { dispatchNavigatorViewportChange, getNavigatorViewWindow } from '../../src/utils/navigatorViewEvents';
import { TPS_NOTEBOOK_NAVIGATOR_VIEWPORT_EVENT } from '../../src/constants/tpsIdentity';

function createWindowHarness(name: string) {
    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

    const addEventListener = vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        const typeListeners = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
        typeListeners.add(listener);
        listeners.set(type, typeListeners);
    });

    class WindowCustomEvent<T> {
        readonly sourceWindow = name;
        readonly type: string;
        readonly detail: T | null;

        constructor(type: string, init?: CustomEventInit<T>) {
            this.type = type;
            this.detail = init?.detail ?? null;
        }
    }

    const dispatchEvent = vi.fn((event: Event) => {
        listeners.get(event.type)?.forEach(listener => {
            if (typeof listener === 'function') {
                listener(event);
            } else {
                listener.handleEvent(event);
            }
        });
        return true;
    });

    return {
        addEventListener,
        dispatchEvent,
        window: {
            CustomEvent: WindowCustomEvent,
            addEventListener,
            dispatchEvent
        } as unknown as Window
    };
}

function createContainer(ownerWindow: Window | null): HTMLElement {
    return {
        ownerDocument: { defaultView: ownerWindow }
    } as unknown as HTMLElement;
}

describe('Navigator view lifecycle events', () => {
    it('routes viewport recovery to a popout container owner window', () => {
        const primary = createWindowHarness('primary');
        const popout = createWindowHarness('popout');
        const container = createContainer(popout.window);
        const primaryListener = vi.fn();
        const popoutListener = vi.fn();
        primary.window.addEventListener(TPS_NOTEBOOK_NAVIGATOR_VIEWPORT_EVENT, primaryListener);
        popout.window.addEventListener(TPS_NOTEBOOK_NAVIGATOR_VIEWPORT_EVENT, popoutListener);

        dispatchNavigatorViewportChange(container, primary.window);

        expect(popout.dispatchEvent).toHaveBeenCalledTimes(1);
        expect(primary.dispatchEvent).not.toHaveBeenCalled();
        expect(popoutListener).toHaveBeenCalledTimes(1);
        expect(primaryListener).not.toHaveBeenCalled();
        const event = popout.dispatchEvent.mock.calls[0][0] as unknown as CustomEvent<{ container: HTMLElement }> & {
            sourceWindow: string;
        };
        expect(event.type).toBe(TPS_NOTEBOOK_NAVIGATOR_VIEWPORT_EVENT);
        expect(event.detail).toEqual({ container });
        expect(event.sourceWindow).toBe('popout');
    });

    it('uses the fallback window when the container document has no window', () => {
        const fallback = createWindowHarness('fallback');
        const container = createContainer(null);

        expect(getNavigatorViewWindow(container, fallback.window)).toBe(fallback.window);
        dispatchNavigatorViewportChange(container, fallback.window);

        expect(fallback.dispatchEvent).toHaveBeenCalledTimes(1);
        const event = fallback.dispatchEvent.mock.calls[0][0] as unknown as CustomEvent<{ container: HTMLElement }> & {
            sourceWindow: string;
        };
        expect(event.type).toBe(TPS_NOTEBOOK_NAVIGATOR_VIEWPORT_EVENT);
        expect(event.detail).toEqual({ container });
        expect(event.sourceWindow).toBe('fallback');
    });
});
