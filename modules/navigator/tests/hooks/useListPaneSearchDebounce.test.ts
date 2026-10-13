import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseListPaneSearchResult } from '../../src/hooks/useListPaneSearch';

// Run the real hook's state/effects with dependency cleanup and fake browser timers.
// Context services and the unrelated midnight clock are isolated from this test.
const h = vi.hoisted(() => ({
    cursor: 0,
    state: [] as unknown[],
    deps: [] as (readonly unknown[] | undefined)[],
    cleanups: [] as ((() => void) | undefined)[],
    pending: [] as (() => void)[],
    changed: false,
    active: true,
    dispatch: vi.fn(),
    shortcuts: new Map()
}));
vi.mock('react', async original => {
    const actual = await original<typeof import('react')>();
    const effect = (fn: () => void | (() => void), deps: readonly unknown[]) => {
        const i = h.cursor++;
        const prior = h.deps[i];
        if (prior && deps.length === prior.length && deps.every((v, j) => Object.is(v, prior[j]))) return;
        h.deps[i] = deps;
        h.pending.push(() => {
            h.cleanups[i]?.();
            h.cleanups[i] = fn() || undefined;
        });
    };
    return {
        ...actual,
        useState(initial: unknown) {
            const i = h.cursor++;
            if (!(i in h.state)) h.state[i] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
            return [
                h.state[i],
                (next: unknown) => {
                    const value = typeof next === 'function' ? (next as (previous: unknown) => unknown)(h.state[i]) : next;
                    if (!Object.is(value, h.state[i])) {
                        h.state[i] = value;
                        h.changed = true;
                    }
                }
            ];
        },
        useRef(initial: unknown) {
            const i = h.cursor++;
            if (!(i in h.state)) h.state[i] = { current: initial };
            return h.state[i];
        },
        useMemo: (fn: () => unknown) => fn(),
        useCallback: (fn: unknown) => fn,
        useEffect: effect,
        useLayoutEffect: effect
    };
});
vi.mock('../../src/hooks/useLocalDayKey', () => ({ useLocalDayKey: () => '2026-09-28' }));
vi.mock('../../src/context/SelectionContext', () => ({
    useSelectionDispatch: () => h.dispatch,
    useSelectionState: () => ({ selectionType: 'folder', selectedFolder: null, selectedTag: null, selectedProperty: null })
}));
vi.mock('../../src/context/ServicesContext', () => ({
    useServices: () => ({ app: {}, plugin: { setSearchProvider: vi.fn() }, isMobile: false })
}));
vi.mock('../../src/context/SettingsContext', () => ({
    useSettingsState: () => ({ searchProvider: 'internal', tpsFileTypesNavigationEnabled: true })
}));
vi.mock('../../src/context/ShortcutsContext', () => ({
    useShortcuts: () => ({ searchShortcutsByName: h.shortcuts, addSearchShortcut: vi.fn(), removeSearchShortcut: vi.fn() })
}));
vi.mock('../../src/context/UIStateContext', () => ({ useUIDispatch: () => h.dispatch }));
vi.mock('../../src/context/UXPreferencesContext', () => ({
    useUXPreferences: () => ({ searchActive: h.active }),
    useUXPreferenceActions: () => ({
        setSearchActive: (active: boolean) => {
            h.active = active;
            h.changed = true;
        }
    })
}));
import { useListPaneSearch } from '../../src/hooks/useListPaneSearch';

function render(): UseListPaneSearchResult {
    for (let pass = 0; pass < 10; pass++) {
        h.cursor = 0;
        h.changed = false;
        h.pending = [];
        const result = useListPaneSearch({
            rootContainerRef: { current: null },
            onNavigateToFolder: () => true,
            onRevealTag: () => true,
            onRevealProperty: () => true,
            ensureSelectionForCurrentFilterRef: { current: null }
        });
        h.pending.forEach(run => run());
        if (!h.changed) return result;
    }
    throw Error('Hook did not settle');
}
function query(value: string) {
    render().setSearchQuery(value);
    return render();
}
function apply(value: string) {
    query(value);
    vi.advanceTimersByTime(100);
    return render();
}

beforeEach(() => {
    h.cursor = 0;
    h.state = [];
    h.deps = [];
    h.cleanups = [];
    h.pending = [];
    h.changed = false;
    h.active = true;
    h.dispatch.mockClear();
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout, clearTimeout });
});
afterEach(() => {
    h.cleanups.forEach(cleanup => cleanup?.());
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('search debounce follows typing, not clearing', () => {
    it.each(['name query', '#work/project', '.status=open'])('clears applied %s immediately without a timer', value => {
        expect(apply(value).debouncedSearchQuery).toBe(value);
        expect(query('').debouncedSearchQuery).toBe('');
        expect(vi.getTimerCount()).toBe(0);
    });
    it('cancels pending text when cleared and never reapplies it later', () => {
        apply('first');
        query('pending');
        vi.advanceTimersByTime(40);
        expect(query('').debouncedSearchQuery).toBe('');
        expect(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(1000);
        expect(render().debouncedSearchQuery).toBe('');
    });
    it('retains one debounce for a burst and applies only the final nonempty query', () => {
        for (const text of ['a', 'ab', 'abc']) {
            expect(query(text).debouncedSearchQuery).toBe('');
            expect(vi.getTimerCount()).toBe(1);
            vi.advanceTimersByTime(30);
        }
        vi.advanceTimersByTime(69);
        expect(render().debouncedSearchQuery).toBe('');
        vi.advanceTimersByTime(1);
        expect(render().debouncedSearchQuery).toBe('abc');
        expect(vi.getTimerCount()).toBe(0);
    });
    it('repeated empty changes schedule no work', () => {
        for (let i = 0; i < 50; i++) expect(query('').debouncedSearchQuery).toBe('');
        expect(vi.getTimerCount()).toBe(0);
    });
    it('a new query after clearing still waits for typing to settle', () => {
        apply('first');
        query('');
        expect(query('second').debouncedSearchQuery).toBe('');
        vi.advanceTimersByTime(100);
        expect(render().debouncedSearchQuery).toBe('second');
    });
    it('deactivation cancels pending input and clears both values', () => {
        apply('first');
        query('pending');
        h.active = false;
        const result = render();
        expect(result.searchQuery).toBe('');
        expect(result.debouncedSearchQuery).toBe('');
        expect(vi.getTimerCount()).toBe(0);
    });
    it('unmount removes its pending debounce', () => {
        query('pending');
        h.cleanups.forEach(cleanup => cleanup?.());
        expect(vi.getTimerCount()).toBe(0);
    });
});
