/*
 * TPS Notebook Navigator - shared Type navigation resolver.
 *
 * This utility keeps Type validation, ancestor expansion, selection, focus,
 * and scrolling consistent across UI, command, and public API entry points.
 */

import type { ExpansionAction } from '../context/ExpansionContext';
import type { SelectionAction, SelectionRevealSource } from '../context/SelectionContext';
import type { ContentPane } from '../context/UIStateContext';
import { ItemType, TYPES_ROOT_VIRTUAL_FOLDER_ID } from '../types';
import { isTpsNavigatorTypeId, type TpsNavigatorTypeId, type TpsNavigatorTypesSnapshot } from '../types/navigatorTypes';
import { isTypeSelectionAuthoritativelyUnavailable } from './navigationTypeHistory';

type Dispatch<T> = (action: T) => void;

export interface NavigateToTypeOptions {
    skipScroll?: boolean;
    source?: SelectionRevealSource;
    preserveNavigationFocus?: boolean;
    skipFocus?: boolean;
    historyIndex?: number;
}

export interface TypeNavigationEnvironment {
    enabled: boolean;
    snapshot: Pick<TpsNavigatorTypesSnapshot, 'availability' | 'descriptors' | 'authoritativeSourceKeys'>;
    expandedVirtualFolders: ReadonlySet<string>;
    expansionDispatch: Dispatch<ExpansionAction>;
    selectionDispatch: Dispatch<SelectionAction>;
    activatePane: (target: ContentPane) => void;
    requestScroll?: (typeId: TpsNavigatorTypeId, options: { align: 'auto'; itemType: typeof ItemType.TYPE }) => void;
}

function canonicalizeTypeId(value: string): TpsNavigatorTypeId | null {
    return isTpsNavigatorTypeId(value) ? value : null;
}

function expandTypeAncestors(env: TypeNavigationEnvironment): void {
    const ancestorIds = [TYPES_ROOT_VIRTUAL_FOLDER_ID];
    if (ancestorIds.every(id => env.expandedVirtualFolders.has(id))) {
        return;
    }

    const nextExpanded = new Set(env.expandedVirtualFolders);
    ancestorIds.forEach(id => nextExpanded.add(id));
    env.expansionDispatch({ type: 'SET_EXPANDED_VIRTUAL_FOLDERS', folders: nextExpanded });
}

/**
 * Selects a built-in or registered-provider Type collection and reveals it in navigation.
 *
 * A ready snapshot is authoritative, so a missing descriptor is rejected.
 * During loading or an integration outage, syntactically valid IDs remain
 * navigable so restored and programmatic selections survive transient state.
 */
export function navigateToType(env: TypeNavigationEnvironment, typeId: string, options?: NavigateToTypeOptions): TpsNavigatorTypeId | null {
    if (!env.enabled) {
        return null;
    }

    const canonicalTypeId = canonicalizeTypeId(typeId);
    if (!canonicalTypeId) {
        return null;
    }

    if (isTypeSelectionAuthoritativelyUnavailable(env.snapshot, canonicalTypeId)) {
        return null;
    }

    expandTypeAncestors(env);
    env.selectionDispatch({
        type: 'SET_SELECTED_TYPE',
        typeId: canonicalTypeId,
        source: options?.source,
        historyIndex: options?.historyIndex
    });

    if (!options?.skipFocus) {
        const preserveNavigationFocus = options?.preserveNavigationFocus ?? true;
        env.activatePane(preserveNavigationFocus ? 'navigation' : 'files');
    }

    if (!options?.skipScroll && env.requestScroll) {
        env.requestScroll(canonicalTypeId, { align: 'auto', itemType: ItemType.TYPE });
    }

    return canonicalTypeId;
}
