/* TPS Notebook Navigator - pure helpers for additive file and source-backed Type search. */

import type { App, TFile } from 'obsidian';
import type { FilterSearchTokens } from '../../utils/filterSearch';
import { filterSearchMatchesTypeFacet } from '../../utils/filterSearch';
import type { TpsNavigatorLineTypeId, TpsNavigatorTypeId } from '../../types/navigatorTypes';
import { TPS_NAVIGATOR_LINE_TYPES, isTpsNavigatorFileTypeId, isTpsNavigatorStructuralTypeId } from '../../types/navigatorTypes';
import { isFileInTpsNavigatorType } from '../../services/types/vaultFileTypes';

/**
 * Name terms belong to an individual structural row, while tag/property/date/folder/task terms
 * describe its owning note. Type facets are evaluated against the row collection itself.
 */
export function getStructuralTypeSourceSearchTokens(tokens: FilterSearchTokens): FilterSearchTokens {
    const sourceExpression = tokens.expression.filter(token => token.kind !== 'property' && token.kind !== 'notProperty');
    const hasInclusions =
        tokens.tagTokens.length > 0 ||
        tokens.folderTokens.length > 0 ||
        tokens.extensionTokens.length > 0 ||
        tokens.dateRanges.length > 0 ||
        tokens.requireTagged ||
        tokens.requireUnfinishedTasks ||
        (tokens.mode === 'tag' && sourceExpression.length > 0);

    return {
        ...tokens,
        expression: sourceExpression,
        hasInclusions,
        propertyTokens: [],
        excludePropertyTokens: [],
        requiresProperties: false,
        nameTokens: [],
        excludeNameTokens: [],
        typeTokens: [],
        excludeTypeTokens: []
    };
}

/**
 * Exact GCM-backed line rows own their tag and property facets. Keep only file-scope criteria here so
 * a tagged task can match inside an untagged note and an untagged task cannot inherit its note's tags.
 */
export function getStructuralLineTypeSourceSearchTokens(tokens: FilterSearchTokens): FilterSearchTokens {
    const sourceTokens = getStructuralTypeSourceSearchTokens(tokens);
    const hasInclusions =
        sourceTokens.folderTokens.length > 0 ||
        sourceTokens.extensionTokens.length > 0 ||
        sourceTokens.dateRanges.length > 0 ||
        sourceTokens.requireUnfinishedTasks;

    return {
        ...sourceTokens,
        mode: 'filter',
        expression: [],
        hasInclusions,
        requiresTags: false,
        allRequireTags: false,
        includedTagTokens: [],
        tagTokens: [],
        requireTagged: false,
        includeUntagged: false,
        excludeTagTokens: [],
        excludeTagged: false
    };
}

/** Applies only file-backed Type facets to native file results; line-backed facets are rendered separately. */
export function fileMatchesStructuralTypeSearch(app: App, file: TFile, tokens: FilterSearchTokens): boolean {
    const matchingFileTypes = tokens.typeTokens.filter(isTpsNavigatorFileTypeId);
    const hasPositiveMatch =
        tokens.typeTokens.length === 0 || matchingFileTypes.some(typeId => isFileInTpsNavigatorType(app, file, typeId));
    if (!hasPositiveMatch) {
        return false;
    }

    return !tokens.excludeTypeTokens.filter(isTpsNavigatorFileTypeId).some(typeId => isFileInTpsNavigatorType(app, file, typeId));
}

/** Stable built-in line collections included by the current Type facet. */
export function getStructuralTypeSearchCollections(tokens: FilterSearchTokens): TpsNavigatorLineTypeId[] {
    return TPS_NAVIGATOR_LINE_TYPES.map(descriptor => descriptor.id as TpsNavigatorLineTypeId).filter(typeId =>
        filterSearchMatchesTypeFacet(typeId, tokens)
    );
}

/** A selected built-in Type stays scoped unless the query explicitly asks for Type facets. */
export function shouldUseGlobalTypeSearch({
    enabled,
    isTypeSelection,
    selectedType,
    hasSearchQuery,
    useOmnisearch,
    hasExplicitTypeFacets
}: {
    enabled: boolean;
    isTypeSelection: boolean;
    selectedType: TpsNavigatorTypeId | null;
    hasSearchQuery: boolean;
    useOmnisearch: boolean;
    hasExplicitTypeFacets: boolean;
}): boolean {
    return (
        enabled &&
        isTypeSelection &&
        isTpsNavigatorStructuralTypeId(selectedType) &&
        hasSearchQuery &&
        !useOmnisearch &&
        hasExplicitTypeFacets
    );
}

/**
 * Whether the current internal Filter Search renders structural rows alongside the native result scope.
 * Keep this predicate aligned with the search-group construction guard so presentation controls describe
 * the rows that are actually on screen. Provider-owned Type scopes never satisfy `useGlobalTypeSearch`.
 */
export function isMixedStructuralSearchActive({
    enabled,
    isTypeSelection,
    useGlobalTypeSearch,
    useOmnisearch,
    hasSearchQuery,
    hasParsedSearchTokens
}: {
    enabled: boolean;
    isTypeSelection: boolean;
    useGlobalTypeSearch: boolean;
    useOmnisearch: boolean;
    hasSearchQuery: boolean;
    hasParsedSearchTokens: boolean;
}): boolean {
    return enabled && (!isTypeSelection || useGlobalTypeSearch) && !useOmnisearch && hasSearchQuery && hasParsedSearchTokens;
}
