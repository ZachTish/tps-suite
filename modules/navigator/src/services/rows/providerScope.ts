/* TPS Notebook Navigator - scope policy shared by row queries and subscriptions. */

import { TFile } from 'obsidian';
import { ListPaneItemType } from '../../types';
import type { ListPaneItem } from '../../types/virtualization';
import type { NavigatorRowProviderRegistry } from './NavigatorRowProviderRegistry';
import type { NavigatorProvidedRow, NavigatorRowProvider, NavigatorRowProviderSelection, NavigatorRowScope } from './types';

/** Stable inert scope used while no optional row provider is selected. */
export const EMPTY_NAVIGATOR_ROW_SCOPE: NavigatorRowScope = Object.freeze({
    visibleFilePaths: Object.freeze([]),
    selectionType: null,
    selectedFolderPath: null,
    selectedTag: null,
    selectedProperty: null,
    selectedType: null
});

/** Avoids deriving a potentially vault-sized scope until a provider can consume it. */
export function resolveNavigatorRowScope(
    selection: NavigatorRowProviderSelection,
    buildActiveScope: () => NavigatorRowScope
): NavigatorRowScope {
    return selection.enabledProviderIds.length === 0 ? EMPTY_NAVIGATOR_ROW_SCOPE : buildActiveScope();
}

/**
 * Legacy providers remain active in every pre-Type scope. A provider must opt
 * in before it can observe or contribute to a standalone Type collection.
 */
export function navigatorRowProviderSupportsScope(provider: NavigatorRowProvider, scope: NavigatorRowScope): boolean {
    if (scope.selectionType !== 'type') {
        return true;
    }

    return provider.supportsTypeScope === true && typeof scope.selectedType === 'string' && scope.selectedType.trim().length > 0;
}

/** Resolves providers in configured order after applying the shared scope policy. */
export function resolveNavigatorRowProvidersForScope(
    registry: NavigatorRowProviderRegistry,
    providerIds: readonly string[],
    scope: NavigatorRowScope
): NavigatorRowProvider[] {
    return registry.resolve(providerIds).filter(provider => navigatorRowProviderSupportsScope(provider, scope));
}

/**
 * Derives the exact visible vault-file paths represented by native Type rows.
 * The valid path set excludes synthetic status rows and preserves Navigator visibility.
 */
export function collectTypeScopeVisibleFilePaths(
    typeRows: readonly NavigatorProvidedRow[],
    validVisibleSourcePaths: ReadonlySet<string>
): string[] {
    const seen = new Set<string>();
    const paths: string[] = [];

    for (const row of typeRows) {
        if (!validVisibleSourcePaths.has(row.sourcePath) || seen.has(row.sourcePath)) {
            continue;
        }
        seen.add(row.sourcePath);
        paths.push(row.sourcePath);
    }

    return paths;
}

/**
 * Collects the exact native-note scope represented by a built list. Property/tag grouping can
 * render provider rows in a different bucket from their source note, so collapsed native groups
 * contribute their header-owned file paths even though their FILE rows are not mounted.
 */
export function collectListProviderScopeVisibleFilePaths(
    listItems: readonly ListPaneItem[],
    includeGroupedHeaderMembers: boolean
): string[] {
    const seen = new Set<string>();
    const paths: string[] = [];
    const addPath = (path: string): void => {
        if (seen.has(path)) return;
        seen.add(path);
        paths.push(path);
    };

    listItems.forEach(item => {
        if (includeGroupedHeaderMembers && item.type === ListPaneItemType.HEADER) {
            item.groupFilePaths?.forEach(addPath);
        }
        if (item.type === ListPaneItemType.FILE && item.data instanceof TFile) {
            addPath(item.data.path);
        }
    });

    return paths;
}
