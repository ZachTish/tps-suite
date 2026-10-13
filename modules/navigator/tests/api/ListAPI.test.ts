import { describe, expect, it, vi } from 'vitest';
import { ListAPI } from '../../src/api/modules/ListAPI';
import type { NavigatorListSnapshot } from '../../src/api/types';

const snapshot = Object.freeze({
    navItem: Object.freeze({ type: 'none', folder: null, tag: null, property: null }),
    search: Object.freeze({
        active: false,
        query: '',
        appliedQuery: '',
        requestedProvider: 'internal',
        effectiveProvider: 'internal'
    }),
    presentation: null,
    rows: Object.freeze([])
}) as NavigatorListSnapshot;

describe('ListAPI', () => {
    it('fails closed without opening a Navigator when no list view is mounted', async () => {
        const getLeavesOfType = vi.fn(() => []);
        const api = new ListAPI({ app: { workspace: { getLeavesOfType } } });

        await expect(api.getSnapshot()).resolves.toBeNull();
        await expect(api.setSearch({ active: true })).resolves.toBe(false);
        await expect(api.setPresentation({ displayMode: 'compact' })).resolves.toBe(false);
        expect(getLeavesOfType).toHaveBeenCalledTimes(3);
    });

    it('waits for and calls the primary mounted list view', async () => {
        const view = {
            whenReady: vi.fn(async () => true),
            getListSnapshot: vi.fn(() => snapshot),
            setListSearch: vi.fn(async () => true),
            setListPresentation: vi.fn(async () => true)
        };
        const api = new ListAPI({ app: { workspace: { getLeavesOfType: () => [{ view }] } } });

        await expect(api.getSnapshot()).resolves.toBe(snapshot);
        await expect(api.setSearch({ query: 'work' })).resolves.toBe(true);
        await expect(api.setPresentation({ groupBy: 'tags' })).resolves.toBe(true);
        await expect(api.setPresentation({ groupBy: 'none' })).resolves.toBe(true);
        expect(view.whenReady).toHaveBeenCalledTimes(4);
        expect(view.setListPresentation).toHaveBeenCalledWith({ groupBy: 'tags' });
        expect(view.setListPresentation).toHaveBeenCalledWith({ groupBy: 'none' });
    });

    it('rejects a stale primary view after readiness changes the leaf order', async () => {
        let resolveReady: (ready: boolean) => void = () => undefined;
        const first = {
            whenReady: () => new Promise<boolean>(resolve => (resolveReady = resolve)),
            getListSnapshot: vi.fn(() => snapshot)
        };
        const second = { getListSnapshot: vi.fn(() => snapshot) };
        let leaves = [{ view: first }, { view: second }];
        const api = new ListAPI({ app: { workspace: { getLeavesOfType: () => leaves } } });

        const pending = api.getSnapshot();
        leaves = [{ view: second }, { view: first }];
        resolveReady(true);

        await expect(pending).resolves.toBeNull();
        expect(first.getListSnapshot).not.toHaveBeenCalled();
        expect(second.getListSnapshot).not.toHaveBeenCalled();
    });

    it('structurally clones updates before awaiting view readiness', async () => {
        let resolveReady: (ready: boolean) => void = () => undefined;
        const setListSearch = vi.fn(async () => true);
        const view = {
            whenReady: () => new Promise<boolean>(resolve => (resolveReady = resolve)),
            setListSearch
        };
        const api = new ListAPI({ app: { workspace: { getLeavesOfType: () => [{ view }] } } });
        const update = { query: 'before', provider: 'internal' } as { query: string; provider: 'internal' | 'omnisearch' };

        const pending = api.setSearch(update);
        update.query = 'after';
        update.provider = 'omnisearch';
        resolveReady(true);

        await expect(pending).resolves.toBe(true);
        expect(setListSearch).toHaveBeenCalledWith({ query: 'before', provider: 'internal' });
        expect(Object.isFrozen(setListSearch.mock.calls[0][0])).toBe(true);
    });

    it('rejects malformed updates before consulting view readiness', async () => {
        const whenReady = vi.fn(async () => true);
        const view = { whenReady, setListSearch: vi.fn(), setListPresentation: vi.fn() };
        const api = new ListAPI({ app: { workspace: { getLeavesOfType: () => [{ view }] } } });

        await expect(api.setSearch({ active: false, query: 'contradiction' })).resolves.toBe(false);
        await expect(api.setPresentation({ sort: { option: 'property-asc' } })).resolves.toBe(false);
        await expect(api.setPresentation({})).resolves.toBe(false);
        expect(whenReady).not.toHaveBeenCalled();
    });
});
