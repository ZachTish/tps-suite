/* TPS Notebook Navigator - pure history guards for the optional Types source. */

import type { TFolder } from 'obsidian';
import type { SelectionAction, SelectionHistoryEntry } from '../context/selection/types';
import { ItemType } from '../types';
import {
    isTpsNavigatorTypeAuthoritativelyMissing,
    isTpsNavigatorTypeId,
    type TpsNavigatorTypeId,
    type TpsNavigatorTypesSnapshot
} from '../types/navigatorTypes';

type TypeAuthoritySnapshot = Pick<TpsNavigatorTypesSnapshot, 'availability' | 'descriptors' | 'authoritativeSourceKeys'>;

export function isTypeSelectionAuthoritativelyUnavailable(snapshot: TypeAuthoritySnapshot, typeId: TpsNavigatorTypeId): boolean {
    return isTpsNavigatorTypeAuthoritativelyMissing(snapshot, typeId);
}

/** Hidden or malformed Type entries must be skipped by back/forward navigation. */
export function resolveTypeSelectionHistoryEntry(
    entry: SelectionHistoryEntry,
    typesNavigationEnabled: boolean,
    snapshot?: TypeAuthoritySnapshot
): SelectionHistoryEntry | null {
    if (entry.type !== ItemType.TYPE || !typesNavigationEnabled || !isTpsNavigatorTypeId(entry.value)) {
        return null;
    }

    if (snapshot && isTypeSelectionAuthoritativelyUnavailable(snapshot, entry.value)) {
        return null;
    }

    return {
        type: ItemType.TYPE,
        value: entry.value
    };
}

/** Replaces a disabled or removed Type in place so history cannot revisit it forever. */
export function createTypeSelectionFallbackAction(folder: TFolder): Extract<SelectionAction, { type: 'SET_SELECTED_FOLDER' }> {
    return {
        type: 'SET_SELECTED_FOLDER',
        folder,
        historyBehavior: 'replace'
    };
}
