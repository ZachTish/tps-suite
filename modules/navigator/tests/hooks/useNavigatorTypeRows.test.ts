import { describe, expect, it } from 'vitest';
import type { NavigatorTypeProviderOwner } from '../../src/services/types/NavigatorTypeProviderRegistry';
import {
    getNavigatorTypeOwnerQueryKey,
    getNavigatorTypeOwnerScopeKey,
    resolveNavigatorTypeRowsForRender
} from '../../src/hooks/useNavigatorTypeRows';

function owner(overrides: Partial<NavigatorTypeProviderOwner> = {}): NavigatorTypeProviderOwner {
    return {
        providerId: 'example/entities',
        collectionId: 'projects',
        provider: {} as NavigatorTypeProviderOwner['provider'],
        options: {},
        instanceId: 1,
        revision: 2,
        ...overrides
    };
}

describe('getNavigatorTypeOwnerQueryKey', () => {
    it('ignores freshly allocated owner DTO identity from unrelated catalog publications', () => {
        expect(getNavigatorTypeOwnerQueryKey(owner())).toBe(getNavigatorTypeOwnerQueryKey(owner()));
    });

    it('changes for owner invalidation, replacement, or a different collection', () => {
        const baseline = getNavigatorTypeOwnerQueryKey(owner());

        expect(getNavigatorTypeOwnerQueryKey(owner({ revision: 3 }))).not.toBe(baseline);
        expect(getNavigatorTypeOwnerQueryKey(owner({ instanceId: 2 }))).not.toBe(baseline);
        expect(getNavigatorTypeOwnerQueryKey(owner({ collectionId: 'contexts' }))).not.toBe(baseline);
        expect(getNavigatorTypeOwnerQueryKey(null)).toBeNull();
    });

    it('retains the render scope across invalidation but clears it for a replacement registration', () => {
        const baseline = getNavigatorTypeOwnerScopeKey(owner());

        expect(getNavigatorTypeOwnerScopeKey(owner({ revision: 3 }))).toBe(baseline);
        expect(getNavigatorTypeOwnerScopeKey(owner({ instanceId: 2 }))).not.toBe(baseline);
    });
});

describe('resolveNavigatorTypeRowsForRender', () => {
    it('reports loading instead of a false empty result while a new async scope is unsettled', () => {
        expect(resolveNavigatorTypeRowsForRender({ scopeKey: 'old', status: 'ready', rows: [] }, 'new', true)).toEqual({
            scopeKey: 'new',
            status: 'loading',
            rows: []
        });
    });

    it('preserves settled empty and error states for the active scope', () => {
        const empty = { scopeKey: 'active', status: 'ready' as const, rows: [] };
        const error = { scopeKey: 'active', status: 'error' as const, rows: [] };

        expect(resolveNavigatorTypeRowsForRender(empty, 'active', true)).toBe(empty);
        expect(resolveNavigatorTypeRowsForRender(error, 'active', true)).toBe(error);
        expect(resolveNavigatorTypeRowsForRender(empty, null, false).status).toBe('idle');
    });
});
