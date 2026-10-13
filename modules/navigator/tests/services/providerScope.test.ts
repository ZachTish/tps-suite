import { describe, expect, it, vi } from 'vitest';
import { NavigatorRowProviderRegistry } from '../../src/services/rows/NavigatorRowProviderRegistry';
import {
    collectListProviderScopeVisibleFilePaths,
    collectTypeScopeVisibleFilePaths,
    EMPTY_NAVIGATOR_ROW_SCOPE,
    navigatorRowProviderSupportsScope,
    resolveNavigatorRowProvidersForScope,
    resolveNavigatorRowScope
} from '../../src/services/rows/providerScope';
import type { NavigatorProvidedRow, NavigatorRowProvider, NavigatorRowScope } from '../../src/services/rows/types';
import { ListPaneItemType } from '../../src/types';
import type { ListPaneItem } from '../../src/types/virtualization';
import { createTestTFile } from '../utils/createTestTFile';

function scope(overrides: Partial<NavigatorRowScope> = {}): NavigatorRowScope {
    return {
        visibleFilePaths: ['Notes/one.md'],
        selectionType: 'folder',
        selectedFolderPath: 'Notes',
        selectedTag: null,
        selectedProperty: null,
        selectedType: null,
        ...overrides
    };
}

function provider(id: string, supportsTypeScope?: boolean): NavigatorRowProvider {
    return {
        id,
        ...(supportsTypeScope === undefined ? {} : { supportsTypeScope }),
        getRows: vi.fn(async () => [])
    };
}

describe('navigator row provider scope policy', () => {
    it('does no scope-source work and reuses one inert scope when no provider is enabled', () => {
        const buildActiveScope = vi.fn(() => scope());

        const first = resolveNavigatorRowScope({ enabledProviderIds: [] }, buildActiveScope);
        const second = resolveNavigatorRowScope({ enabledProviderIds: [] }, buildActiveScope);

        expect(buildActiveScope).not.toHaveBeenCalled();
        expect(first).toBe(EMPTY_NAVIGATOR_ROW_SCOPE);
        expect(second).toBe(first);

        expect(resolveNavigatorRowScope({ enabledProviderIds: ['example/tasks'] }, buildActiveScope)).toEqual(scope());
        expect(buildActiveScope).toHaveBeenCalledOnce();
    });

    it('preserves every legacy provider in pre-Type scopes', () => {
        expect(navigatorRowProviderSupportsScope(provider('example/legacy'), scope())).toBe(true);
        expect(navigatorRowProviderSupportsScope(provider('example/type', true), scope())).toBe(true);
    });

    it('requires an explicit capability and an exact selected Type ID', () => {
        const legacy = provider('example/legacy');
        const typeCapable = provider('example/type', true);

        expect(
            navigatorRowProviderSupportsScope(
                legacy,
                scope({ selectionType: 'type', selectedFolderPath: null, selectedType: 'structural:task' })
            )
        ).toBe(false);
        expect(
            navigatorRowProviderSupportsScope(
                typeCapable,
                scope({ selectionType: 'type', selectedFolderPath: null, selectedType: 'structural:task' })
            )
        ).toBe(true);
        expect(
            navigatorRowProviderSupportsScope(typeCapable, scope({ selectionType: 'type', selectedFolderPath: null, selectedType: null }))
        ).toBe(false);
    });

    it('resolves eligible providers in configured order without enabling a legacy provider in Type mode', () => {
        const registry = new NavigatorRowProviderRegistry();
        const legacy = provider('example/legacy');
        const firstTypeProvider = provider('example/first-type', true);
        const secondTypeProvider = provider('example/second-type', true);
        registry.register(legacy);
        registry.register(firstTypeProvider);
        registry.register(secondTypeProvider);

        expect(
            resolveNavigatorRowProvidersForScope(
                registry,
                ['example/second-type', 'example/legacy', 'example/first-type'],
                scope({ selectionType: 'type', selectedFolderPath: null, selectedType: 'kind:project' })
            )
        ).toEqual([secondTypeProvider, firstTypeProvider]);
    });
});

describe('collectTypeScopeVisibleFilePaths', () => {
    it('deduplicates native Type sources in display order and excludes synthetic or hidden paths', () => {
        const rows: NavigatorProvidedRow[] = [
            {
                providerId: 'tps/entity-types',
                id: 'one:first',
                kind: 'tps/entity-type/task',
                label: 'First task',
                sourcePath: 'Notes/one.md'
            },
            {
                providerId: 'tps/entity-types',
                id: 'one:second',
                kind: 'tps/entity-type/task',
                label: 'Second task',
                sourcePath: 'Notes/one.md'
            },
            {
                providerId: 'tps/entity-types',
                id: 'two',
                kind: 'tps/entity-type/task',
                label: 'Another task',
                sourcePath: 'Notes/two.md'
            },
            {
                providerId: 'tps/entity-types',
                id: 'status:loading',
                kind: 'tps/entity-type-status',
                label: 'Loading entity index…',
                sourcePath: 'Types'
            },
            {
                providerId: 'tps/entity-types',
                id: 'hidden',
                kind: 'tps/entity-type/task',
                label: 'Hidden task',
                sourcePath: 'Hidden/task.md'
            }
        ];

        expect(collectTypeScopeVisibleFilePaths(rows, new Set(['Notes/one.md', 'Notes/two.md']))).toEqual(['Notes/one.md', 'Notes/two.md']);
    });
});

describe('collectListProviderScopeVisibleFilePaths', () => {
    it('includes collapsed group members only when provider rows own their grouping', () => {
        const collapsedSource = createTestTFile('Daily.md');
        const visibleSource = createTestTFile('Visible.md');
        const items: ListPaneItem[] = [
            { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
            {
                type: ListPaneItemType.HEADER,
                data: 'dailynote',
                key: 'header-tags-value:dailynote',
                headerKind: 'property',
                isCollapsed: true,
                groupFilePaths: [collapsedSource.path, visibleSource.path]
            },
            { type: ListPaneItemType.FILE, data: visibleSource, key: visibleSource.path },
            { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
        ];

        expect(collectListProviderScopeVisibleFilePaths(items, false)).toEqual([visibleSource.path]);
        expect(collectListProviderScopeVisibleFilePaths(items, true)).toEqual([collapsedSource.path, visibleSource.path]);
    });
});
