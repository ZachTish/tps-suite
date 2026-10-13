/* TPS Notebook Navigator - isolated runtime guards for first-party Type collections. */

import { ItemType, type NavigationItemType } from '../../types';
import { normalizePropertyGroupingSourceForMenu, type ListNoteGroupingOption } from '../../settings/types';
import {
    isTpsNavigatorFileTypeId,
    isTpsNavigatorGcmLineTypeId,
    isTpsNavigatorLineTypeId,
    type TpsNavigatorTypeId
} from '../../types/navigatorTypes';

export function supportsCalendarInteractionsForSelection(selectionType: NavigationItemType | null): boolean {
    return selectionType !== ItemType.TYPE;
}

export function shouldCollapseMobileDrawerForTypeProviderActivation(selectionType: NavigationItemType | null, isMobile: boolean): boolean {
    return isMobile && selectionType === ItemType.TYPE;
}

/** Reports whether the selected folder is the vault root. */
export function isVaultRootResourceScope(
    selectionType: ItemType | null | undefined,
    selectedFolderPath: string | null | undefined
): boolean {
    return selectionType === ItemType.FOLDER && selectedFolderPath === '/';
}

/** The vault root always contains every descendant, including after the search is cleared. */
export function resolveIncludeDescendantResources({
    selectionType,
    selectedFolderPath,
    includeDescendants,
    forceWholeVaultSearch = false
}: {
    selectionType: ItemType | null | undefined;
    selectedFolderPath: string | null | undefined;
    includeDescendants: boolean;
    forceWholeVaultSearch?: boolean;
}): boolean {
    return isVaultRootResourceScope(selectionType, selectedFolderPath) || includeDescendants || forceWholeVaultSearch;
}

/** Native file presentation controls apply to ordinary scopes and fixed file-backed Types only. */
export function supportsNativeListPresentationForSelection(
    selectionType: NavigationItemType | null,
    selectedType: TpsNavigatorTypeId | null
): boolean {
    return selectionType !== ItemType.TYPE || isTpsNavigatorFileTypeId(selectedType);
}

/** Sort/group controls also support fixed line-backed Types through owning-note metadata. */
export function supportsListSortAndGroupingForSelection(
    selectionType: NavigationItemType | null,
    selectedType: TpsNavigatorTypeId | null
): boolean {
    return selectionType !== ItemType.TYPE || isTpsNavigatorFileTypeId(selectedType) || isTpsNavigatorLineTypeId(selectedType);
}

/** Line properties are available for exact GCM rows and for any scope currently showing mixed structural search results. */
export function supportsLinePropertyGroupingSourceForSelection(
    selectionType: NavigationItemType | null,
    selectedType: TpsNavigatorTypeId | null,
    mixedStructuralSearchActive: boolean
): boolean {
    return mixedStructuralSearchActive || (selectionType === ItemType.TYPE && isTpsNavigatorGcmLineTypeId(selectedType));
}

/**
 * Reports the grouping source that the current rendered rows actually use while retaining
 * a latent line-source override for a later mixed search. Native rows and Navigator-owned
 * source ranges use note frontmatter whenever exact GCM line fields are not available.
 */
export function resolveRenderedPropertyGroupingForSelection(
    selectionType: NavigationItemType | null,
    selectedType: TpsNavigatorTypeId | null,
    groupBy: ListNoteGroupingOption,
    mixedStructuralSearchActive: boolean
): ListNoteGroupingOption {
    if (groupBy === 'tags' && selectionType === ItemType.TYPE && isTpsNavigatorLineTypeId(selectedType)) {
        return 'custom';
    }
    return normalizePropertyGroupingSourceForMenu(
        groupBy,
        supportsLinePropertyGroupingSourceForSelection(selectionType, selectedType, mixedStructuralSearchActive)
    );
}

/** Calendar-day property buckets apply to standalone line rows and to structural rows mixed into search. */
export function supportsDayPropertyGroupingForSelection(
    selectionType: NavigationItemType | null,
    selectedType: TpsNavigatorTypeId | null,
    mixedStructuralSearchActive: boolean
): boolean {
    return mixedStructuralSearchActive || (selectionType === ItemType.TYPE && isTpsNavigatorLineTypeId(selectedType));
}

/**
 * Ordinary scopes retain the existing (possibly disabled) New note control. Type scopes expose it only
 * when the selected Type has a real create action, except that an active search keeps the disabled control
 * visible so its constructibility reason remains discoverable.
 */
export function shouldShowListCreateButton(
    selectionType: NavigationItemType | null,
    canCreateSelectedItem: boolean,
    settingVisible: boolean,
    hasActiveCreationSearch = false
): boolean {
    return settingVisible && (hasActiveCreationSearch || selectionType !== ItemType.TYPE || canCreateSelectedItem);
}
