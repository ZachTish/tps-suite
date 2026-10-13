/* TPS Notebook Navigator - strict whole-file creation plans derived from Filter Search. */

import type { TpsNavigatorTypeId } from '../../types/navigatorTypes';
import { parseFilterSearchTokens } from '../../utils/filterSearch';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId, type PropertySelectionNodeId } from '../../utils/propertyTree';
import { isTpsNavigatorCreatableFileTypeId } from './fileResourceCreation';

export interface SearchResourceCreationPlan {
    readonly ok: true;
    readonly typeId: TpsNavigatorTypeId;
}

export interface SearchResourceCreationBlock {
    readonly ok: false;
    readonly reason: string;
}

export type SearchResourceCreationResolution = SearchResourceCreationPlan | SearchResourceCreationBlock;

const AMBIGUOUS_FILTER_REASON = 'New item unavailable: this search contains criteria that cannot be applied to a new file.';

/** A Type search can create only a complete file whose resulting type is guaranteed to match. */
export function resolveSearchResourceCreation(query: string): SearchResourceCreationResolution {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
        return { ok: false, reason: 'New item unavailable: the search is empty.' };
    }

    const tokens = parseFilterSearchTokens(trimmedQuery);
    if (tokens.typeTokens.length !== 1 || tokens.excludeTypeTokens.length > 0) {
        return { ok: false, reason: 'New item unavailable: this search must select exactly one supported Type.' };
    }
    const typeId = tokens.typeTokens[0];
    if (!isTpsNavigatorCreatableFileTypeId(typeId)) {
        return { ok: false, reason: 'New item unavailable: only whole-file Types support creation.' };
    }

    const hasUnsupportedCriteria =
        tokens.nameTokens.length > 0 ||
        tokens.excludeNameTokens.length > 0 ||
        tokens.includedTagTokens.length > 0 ||
        tokens.excludeTagTokens.length > 0 ||
        tokens.propertyTokens.length > 0 ||
        tokens.excludePropertyTokens.length > 0 ||
        tokens.folderTokens.length > 0 ||
        tokens.excludeFolderTokens.length > 0 ||
        tokens.extensionTokens.length > 0 ||
        tokens.excludeExtensionTokens.length > 0 ||
        tokens.dateRanges.length > 0 ||
        tokens.excludeDateRanges.length > 0 ||
        tokens.requireUnfinishedTasks ||
        tokens.excludeUnfinishedTasks ||
        tokens.requireTagged ||
        tokens.includeUntagged ||
        tokens.excludeTagged ||
        tokens.expression.some(token => token.kind === 'operator' && token.operator === 'OR');
    if (hasUnsupportedCriteria) {
        return { ok: false, reason: AMBIGUOUS_FILTER_REASON };
    }

    return { ok: true, typeId };
}

export type NavigationSearchCreationTarget =
    { type: 'folder'; path: string } | { type: 'tag'; tag: string } | { type: 'property'; nodeId: PropertySelectionNodeId };

/** Reuse ordinary note creation only when the visible search contains exactly one writable navigation facet. */
export function resolveNavigationSearchCreation(query: string): NavigationSearchCreationTarget | null {
    const tokens = parseFilterSearchTokens(query);
    if (
        tokens.invalidReason ||
        tokens.nameTokens.length ||
        tokens.excludeNameTokens.length ||
        tokens.excludeTagTokens.length ||
        tokens.excludePropertyTokens.length ||
        tokens.excludeFolderTokens.length ||
        tokens.typeTokens.length ||
        tokens.excludeTypeTokens.length ||
        tokens.extensionTokens.length ||
        tokens.excludeExtensionTokens.length ||
        tokens.dateRanges.length ||
        tokens.excludeDateRanges.length ||
        tokens.requireTagged ||
        tokens.excludeTagged ||
        tokens.includeUntagged ||
        tokens.requireUnfinishedTasks ||
        tokens.excludeUnfinishedTasks ||
        tokens.expression.some(token => token.kind === 'operator' && token.operator === 'OR') ||
        tokens.includedTagTokens.length + tokens.propertyTokens.length + tokens.folderTokens.length !== 1
    ) {
        return null;
    }
    const folder = tokens.folderTokens[0];
    if (folder) return folder.mode === 'segment' ? null : { type: 'folder', path: folder.value || '/' };
    const tag = tokens.includedTagTokens[0];
    if (tag) return { type: 'tag', tag };
    const property = tokens.propertyTokens[0];
    if (!property || property.value === '') return null;
    return {
        type: 'property',
        nodeId: property.value === null ? buildPropertyKeyNodeId(property.key) : buildPropertyValueNodeId(property.key, property.value)
    };
}
