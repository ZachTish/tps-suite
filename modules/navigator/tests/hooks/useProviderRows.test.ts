/* TPS Notebook Navigator - provider row refresh retention. */

import { describe, expect, it } from 'vitest';
import { createProviderRowsRefreshResolver, resolveProviderRowsForRender } from '../../src/hooks/useProviderRows';
import { NAVIGATOR_ROW_PROVIDER_MAX_ROWS, type NavigatorProviderRowsSnapshot } from '../../src/services/rows/composeProviderRows';
import type { NavigatorProvidedRow, NavigatorRowProviderSelection, NavigatorRowScope } from '../../src/services/rows/types';

const scope: NavigatorRowScope = {
    visibleFilePaths: ['Notes/one.md'],
    selectionType: null,
    selectedFolderPath: null,
    selectedTag: null,
    selectedProperty: null,
    selectedType: null
};
const selection: NavigatorRowProviderSelection = {
    enabledProviderIds: ['tps/example']
};
const rows: NavigatorProvidedRow[] = [
    {
        providerId: 'tps/example',
        id: 'one',
        kind: 'tps/example',
        label: 'One',
        sourcePath: 'Notes/one.md'
    }
];

describe('resolveProviderRowsForRender', () => {
    it('retains rows while only the provider revision refreshes', () => {
        expect(
            resolveProviderRowsForRender(
                { scope, selection, revision: 1, rows },
                {
                    scope,
                    selection,
                    revision: 2
                }
            )
        ).toBe(rows);
    });

    it('renders an empty snapshot as soon as the active revision publishes one', () => {
        expect(
            resolveProviderRowsForRender(
                { scope, selection, revision: 2, rows: [] },
                {
                    scope,
                    selection,
                    revision: 2
                }
            )
        ).toEqual([]);
    });

    it('clears rows when the visible scope or provider selection changes', () => {
        const result = { scope, selection, revision: 1, rows };
        expect(resolveProviderRowsForRender(result, { scope: { ...scope }, selection, revision: 1 })).toEqual([]);
        expect(
            resolveProviderRowsForRender(result, {
                scope,
                selection: { ...selection },
                revision: 1
            })
        ).toEqual([]);
    });

    it('does not retain rows when a different Type is selected over the same source paths', () => {
        const taskScope: NavigatorRowScope = {
            ...scope,
            selectionType: 'type',
            selectedType: 'structural:task'
        };
        const headingScope: NavigatorRowScope = {
            ...scope,
            selectionType: 'type',
            selectedType: 'structural:heading'
        };

        expect(
            resolveProviderRowsForRender(
                { scope: taskScope, selection, revision: 1, rows },
                { scope: headingScope, selection, revision: 1 }
            )
        ).toEqual([]);
    });
});

function providerRow(providerId: string, id: string): NavigatorProvidedRow {
    return {
        providerId,
        id,
        kind: 'tps/example',
        label: id,
        sourcePath: 'Notes/one.md'
    };
}

function snapshot(
    providerIds: readonly string[],
    settledProviderIds: readonly string[],
    snapshotRows: readonly NavigatorProvidedRow[]
): NavigatorProviderRowsSnapshot {
    return { providerIds, settledProviderIds, rows: snapshotRows };
}

describe('createProviderRowsRefreshResolver', () => {
    it('retains each unresolved provider independently and replaces providers in settlement order', () => {
        const oldA = providerRow('tps/a', 'a-old');
        const oldB = providerRow('tps/b', 'b-old');
        const freshA = providerRow('tps/a', 'a-fresh');
        const freshB = providerRow('tps/b', 'b-fresh');
        const resolveRefresh = createProviderRowsRefreshResolver([oldA, oldB]);

        expect([oldA, oldB].map(row => row.id)).toEqual(['a-old', 'b-old']);
        expect(resolveRefresh(snapshot(['tps/a', 'tps/b'], ['tps/b'], [freshB])).map(row => row.id)).toEqual(['a-old', 'b-fresh']);
        expect(resolveRefresh(snapshot(['tps/a', 'tps/b'], ['tps/a', 'tps/b'], [freshA, freshB])).map(row => row.id)).toEqual([
            'a-fresh',
            'b-fresh'
        ]);
    });

    it('removes only the retained slice belonging to a provider that settles empty', () => {
        const oldA = providerRow('tps/a', 'a-old');
        const oldB = providerRow('tps/b', 'b-old');
        const oldBSecond = providerRow('tps/b', 'b-old-2');
        const resolveRefresh = createProviderRowsRefreshResolver([oldA, oldB, oldBSecond]);

        expect(resolveRefresh(snapshot(['tps/a', 'tps/b'], ['tps/b'], []))).toEqual([oldA]);
    });

    it('preserves configured provider order and enforces the true global budget across retained and fresh rows', () => {
        const baselineA = Array.from({ length: 600 }, (_, index) => providerRow('tps/a', `a-old-${index}`));
        const baselineB = Array.from({ length: 400 }, (_, index) => providerRow('tps/b', `b-old-${index}`));
        const freshB = Array.from({ length: 600 }, (_, index) => providerRow('tps/b', `b-fresh-${index}`));
        const freshA = Array.from({ length: 800 }, (_, index) => providerRow('tps/a', `a-fresh-${index}`));
        const resolveRefresh = createProviderRowsRefreshResolver([...baselineA, ...baselineB]);

        const partial = resolveRefresh(snapshot(['tps/a', 'tps/b'], ['tps/b'], freshB));
        expect(partial).toHaveLength(NAVIGATOR_ROW_PROVIDER_MAX_ROWS);
        expect(partial.filter(row => row.providerId === 'tps/a')).toHaveLength(600);
        expect(partial.filter(row => row.providerId === 'tps/b')).toHaveLength(400);
        expect(partial[599]?.id).toBe('a-old-599');
        expect(partial[600]?.id).toBe('b-fresh-0');

        const finalRows = resolveRefresh(snapshot(['tps/a', 'tps/b'], ['tps/a', 'tps/b'], [...freshA, ...freshB.slice(0, 200)]));
        expect(finalRows).toHaveLength(NAVIGATOR_ROW_PROVIDER_MAX_ROWS);
        expect(finalRows.filter(row => row.providerId === 'tps/a')).toHaveLength(800);
        expect(finalRows.filter(row => row.providerId === 'tps/b')).toHaveLength(200);
        expect(finalRows[799]?.id).toBe('a-fresh-799');
        expect(finalRows[800]?.id).toBe('b-fresh-0');
        expect(finalRows[999]?.id).toBe('b-fresh-199');
    });
});
