/*
 * TPS Notebook Navigator - converts transient provider rows into list items.
 */

import { TFile } from 'obsidian';
import { ListPaneItemType } from '../../types';
import type { ListPaneItem } from '../../types/virtualization';
import type { TpsNavigatorLineTypeId } from '../../types/navigatorTypes';
import { NAVIGATOR_ROW_PROVIDER_MAX_ROWS, type NavigatorProvidedRow } from './types';
import {
    compareByAlphaSortOrder,
    getPropertyDayGroupingValue,
    getPropertyDayGroupingValues,
    getPropertyGroupingValues
} from '../../utils/sortUtils';
import { getMatchingRecordValue } from '../../utils/recordUtils';
import { getNavigatorRowSelectionKey } from './rowSelection';

export interface ProviderPropertyGrouping {
    propertyKey: string;
    noValueLabel: string;
    noValuePosition: 'top' | 'bottom';
    valueGroupIdPrefix: string;
    noValueGroupId: string;
    granularity?: 'value' | 'day' | 'path';
    multiValueGrouping?: 'separate' | 'combine';
    formatLabel?: (label: string) => string;
    isLabelVisible?: (label: string) => boolean;
    getLabelKey?: (label: string) => string;
    compareLabelKeys?: (left: string, right: string) => number;
    direction?: 'asc' | 'desc';
    getCollapseKey?: (groupId: string) => string;
    isCollapsed?: (collapseKey: string) => boolean;
}

/**
 * Builds a complete virtualized Types list from rows that are not attached to file rows.
 *
 * Built-in source-backed structural rows are intentionally not subject to the external-provider
 * safety ceiling. Externally owned and augmenting rows continue
 * to share that ceiling.
 */
export function buildStandaloneProviderListItems(
    builtInTypeRows: readonly NavigatorProvidedRow[],
    externalProviderRows: readonly NavigatorProvidedRow[]
): ListPaneItem[] {
    const seenKeys = new Set<string>();
    const rows: ListPaneItem[] = [];

    const appendRow = (row: NavigatorProvidedRow): boolean => {
        const key = `provider:${row.providerId}:${row.id}`;
        if (seenKeys.has(key)) {
            return false;
        }
        seenKeys.add(key);
        rows.push({ type: ListPaneItemType.PROVIDER_ROW, data: row, key });
        return true;
    };

    builtInTypeRows.forEach(appendRow);

    let externalRowsAdded = 0;
    for (const row of externalProviderRows) {
        if (externalRowsAdded >= NAVIGATOR_ROW_PROVIDER_MAX_ROWS) {
            break;
        }
        if (appendRow(row)) {
            externalRowsAdded += 1;
        }
    }

    return [
        {
            type: ListPaneItemType.TOP_SPACER,
            data: '',
            key: 'top-spacer'
        },
        ...rows,
        {
            type: ListPaneItemType.BOTTOM_SPACER,
            data: '',
            key: 'bottom-spacer'
        }
    ];
}

export function mergeProviderRowsIntoList(
    listItems: ListPaneItem[],
    providerRows: readonly NavigatorProvidedRow[],
    propertyGrouping?: ProviderPropertyGrouping
): ListPaneItem[] {
    if (providerRows.length === 0) {
        return listItems;
    }

    const isPathGrouping = propertyGrouping?.granularity === 'path';
    const propertyRows = propertyGrouping ? providerRows.filter(row => row.properties !== undefined) : [];
    const attachedRows = propertyRows.length === 0 ? providerRows : providerRows.filter(row => row.properties === undefined);
    const rowsBySourcePath = new Map<string, NavigatorProvidedRow[]>();
    for (const row of attachedRows) {
        const rows = rowsBySourcePath.get(row.sourcePath) ?? [];
        rows.push(row);
        rowsBySourcePath.set(row.sourcePath, rows);
    }
    const noValueKey = '\u0000no-value';
    const getHeaderGroupKey = (item: ListPaneItem): string | null => {
        if (!propertyGrouping) return null;
        if (item.key === `header-${propertyGrouping.noValueGroupId}`) {
            return noValueKey;
        }
        const prefix = `header-${propertyGrouping.valueGroupIdPrefix}`;
        return item.key.startsWith(prefix) ? item.key.slice(prefix.length) : null;
    };
    const getRowKey = (row: NavigatorProvidedRow): string => getNavigatorRowSelectionKey({ providerId: row.providerId, rowId: row.id });
    const consumedPaths = new Set<string>();
    const merged: ListPaneItem[] = [];

    for (const item of listItems) {
        if (isPathGrouping && item.type === ListPaneItemType.HEADER) {
            // Header membership must survive collapse, where source file rows are absent.
            const attachedGroupRows =
                rowsBySourcePath.size > 0 ? (item.groupFilePaths?.flatMap(path => rowsBySourcePath.get(path) ?? []) ?? []) : [];
            const groupKey = item.headerKind === 'property' ? getHeaderGroupKey(item) : null;
            merged.push(
                attachedGroupRows.length > 0 || (groupKey !== null && item.groupBucketKey === undefined)
                    ? {
                          ...item,
                          ...(groupKey === null ? {} : { groupBucketKey: item.groupBucketKey ?? groupKey }),
                          ...(attachedGroupRows.length === 0
                              ? {}
                              : { groupRowKeys: Array.from(new Set([...(item.groupRowKeys ?? []), ...attachedGroupRows.map(getRowKey)])) })
                      }
                    : item
            );
        } else {
            merged.push(item);
        }
        if (item.type !== ListPaneItemType.FILE || !(item.data instanceof TFile) || consumedPaths.has(item.data.path)) {
            continue;
        }

        consumedPaths.add(item.data.path);
        const rows = rowsBySourcePath.get(item.data.path) ?? [];
        for (const row of rows) {
            merged.push({
                type: ListPaneItemType.PROVIDER_ROW,
                data: row,
                key: `provider:${row.providerId}:${row.id}`
            });
        }
    }

    if (!propertyGrouping || propertyRows.length === 0) return merged;

    type ProviderGroup = {
        key: string;
        label: string;
        numericValue: number | null;
        daySortValue: number | null;
        rows: NavigatorProvidedRow[];
    };
    const rowsByGroup = new Map<string, ProviderGroup>();
    const normalizeValue = (value: {
        parts: readonly string[];
        numericValue?: number | null;
        sortValue?: number;
    }): Omit<ProviderGroup, 'rows'> | null => {
        const parts = value.parts;
        const formatted = propertyGrouping.formatLabel?.(parts.join(', ')) ?? parts.join(', ');
        if (!formatted || propertyGrouping.isLabelVisible?.(formatted) === false) {
            return null;
        }
        return {
            key: propertyGrouping.getLabelKey?.(formatted) ?? parts.join('\u0000'),
            label: formatted,
            numericValue: value.numericValue ?? null,
            daySortValue: value.sortValue ?? null
        };
    };
    propertyRows.forEach(row => {
        const rawValue = getMatchingRecordValue(row.properties, propertyGrouping.propertyKey);
        const values =
            propertyGrouping.granularity === 'day'
                ? propertyGrouping.multiValueGrouping === 'combine'
                    ? [getPropertyDayGroupingValue(rawValue)].filter(value => value !== null)
                    : getPropertyDayGroupingValues(rawValue)
                : getPropertyGroupingValues(rawValue);
        const normalizedValues = values
            .map(value => normalizeValue(value))
            .filter((value): value is Omit<ProviderGroup, 'rows'> => value !== null);
        const uniqueValues = Array.from(new Map(normalizedValues.map(value => [value.key, value])).values());
        const groups =
            uniqueValues.length === 0
                ? [
                      {
                          key: noValueKey,
                          label: propertyGrouping.noValueLabel,
                          numericValue: null,
                          daySortValue: null
                      }
                  ]
                : propertyGrouping.multiValueGrouping === 'combine'
                  ? [
                        {
                            key: uniqueValues.map(value => value.key).join('\u0000'),
                            label: uniqueValues.map(value => value.label).join(', '),
                            numericValue: null,
                            daySortValue: uniqueValues[0]?.daySortValue ?? null
                        }
                    ]
                  : uniqueValues;
        groups.forEach(group => {
            const entry = rowsByGroup.get(group.key) ?? { ...group, rows: [] };
            entry.rows.push(row);
            rowsByGroup.set(group.key, entry);
        });
    });

    const result: ListPaneItem[] = [];
    let currentPropertyKey: string | null = null;
    const renderedKeys = new Set<string>();
    const flush = () => {
        if (currentPropertyKey === null) return;
        const rows = rowsByGroup.get(currentPropertyKey)?.rows ?? [];
        rows.forEach(row => {
            result.push({
                type: ListPaneItemType.PROVIDER_ROW,
                data: row,
                key: `provider:${row.providerId}:${row.id}:${currentPropertyKey}`
            });
        });
        currentPropertyKey = null;
    };
    merged.forEach(item => {
        if (
            currentPropertyKey !== null &&
            (item.type === ListPaneItemType.HEADER_SPACER ||
                (item.type === ListPaneItemType.HEADER && item.headerKind === 'property') ||
                item.type === ListPaneItemType.BOTTOM_SPACER)
        ) {
            flush();
        }
        let outputItem = item;
        if (item.type === ListPaneItemType.HEADER && item.headerKind === 'property') {
            const groupKey = getHeaderGroupKey(item);
            if (groupKey !== null && rowsByGroup.has(groupKey)) {
                renderedKeys.add(groupKey);
                outputItem = {
                    ...item,
                    ...(isPathGrouping
                        ? {
                              groupBucketKey: item.groupBucketKey ?? groupKey,
                              groupRowKeys: Array.from(
                                  new Set([...(item.groupRowKeys ?? []), ...(rowsByGroup.get(groupKey)?.rows ?? []).map(getRowKey)])
                              )
                          }
                        : {}),
                    groupItemCount:
                        (item.groupItemCount ?? item.groupFilePaths?.length ?? 0) + (rowsByGroup.get(groupKey)?.rows.length ?? 0),
                    // Provider rows are queried from the visible/search scope, so an unfiltered
                    // provider total is unavailable. Suppress the native-only total rather than
                    // rendering an impossible visible/total pair such as 2/1.
                    groupTotalItemCount: undefined
                };
            }
            currentPropertyKey = item.isCollapsed ? null : groupKey;
        } else if (item.type === ListPaneItemType.BOTTOM_SPACER) {
            flush();
        }
        result.push(outputItem);
    });
    flush();

    const directionMultiplier = propertyGrouping.direction === 'desc' ? -1 : 1;
    const alphaOrder = propertyGrouping.direction === 'desc' ? 'alpha-desc' : 'alpha-asc';
    const compareGroups = (left: Omit<ProviderGroup, 'rows'>, right: Omit<ProviderGroup, 'rows'>): number => {
        if (left.daySortValue !== null && right.daySortValue !== null && left.daySortValue !== right.daySortValue) {
            return directionMultiplier * (left.daySortValue < right.daySortValue ? -1 : 1);
        }
        if (left.numericValue !== null && right.numericValue !== null) {
            if (left.numericValue !== right.numericValue) {
                return directionMultiplier * (left.numericValue < right.numericValue ? -1 : 1);
            }
        } else if (left.numericValue !== null || right.numericValue !== null) {
            return directionMultiplier * (left.numericValue !== null ? -1 : 1);
        } else {
            const labelCompare = compareByAlphaSortOrder(left.label, right.label, alphaOrder);
            if (labelCompare !== 0) {
                return labelCompare;
            }
        }
        const keyCompare = propertyGrouping.compareLabelKeys?.(left.key, right.key) ?? (left.key < right.key ? -1 : 1);
        return directionMultiplier * keyCompare;
    };
    const missingGroups = Array.from(rowsByGroup.entries())
        .filter(([key]) => !renderedKeys.has(key))
        .map(([key, group]) => ({ key, group, isNoValue: key === noValueKey }))
        .sort((left, right) => {
            if (left.isNoValue || right.isNoValue) {
                if (left.isNoValue && right.isNoValue) return 0;
                const noValueFirst = propertyGrouping.noValuePosition === 'top';
                return left.isNoValue === noValueFirst ? -1 : 1;
            }
            return compareGroups(left.group, right.group);
        });
    missingGroups.forEach(({ key, group, isNoValue }) => {
        const groupId = isNoValue ? propertyGrouping.noValueGroupId : `${propertyGrouping.valueGroupIdPrefix}${key}`;
        const collapseKey = propertyGrouping.getCollapseKey?.(groupId);
        const isCollapsed = collapseKey ? propertyGrouping.isCollapsed?.(collapseKey) === true : false;
        const block: ListPaneItem[] = [
            {
                type: ListPaneItemType.HEADER,
                data: group.label,
                key: `header-${groupId}`,
                headerKind: 'property',
                collapseKey,
                isCollapsed,
                groupFilePaths: [],
                ...(isPathGrouping ? { groupNativeFilePaths: [], groupRowKeys: Array.from(new Set(group.rows.map(getRowKey))) } : {}),
                groupItemCount: group.rows.length,
                groupBucketKey: group.key,
                groupNumericSortValue: group.numericValue,
                groupDaySortValue: group.daySortValue
            },
            ...(isCollapsed
                ? []
                : group.rows.map<ListPaneItem>(row => ({
                      type: ListPaneItemType.PROVIDER_ROW,
                      data: row,
                      key: `provider:${row.providerId}:${row.id}:${key}`
                  })))
        ];
        const bottomIndex = result.findIndex(item => item.type === ListPaneItemType.BOTTOM_SPACER);
        let insertionIndex = bottomIndex === -1 ? result.length : bottomIndex;
        const propertyHeaderIndexes = result
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.type === ListPaneItemType.HEADER && item.headerKind === 'property');
        if (isNoValue && propertyGrouping.noValuePosition === 'top') {
            insertionIndex = propertyHeaderIndexes[0]?.index ?? insertionIndex;
        } else if (!isNoValue) {
            const nextHeader = propertyHeaderIndexes.find(({ item }) => {
                if (getHeaderGroupKey(item) === noValueKey) {
                    return propertyGrouping.noValuePosition === 'bottom';
                }
                const label = typeof item.data === 'string' ? item.data : '';
                const existingKey = getHeaderGroupKey(item) ?? label;
                return (
                    compareGroups(
                        {
                            key: item.groupBucketKey ?? existingKey,
                            label,
                            numericValue: item.groupNumericSortValue ?? null,
                            daySortValue: item.groupDaySortValue ?? null
                        },
                        group
                    ) > 0
                );
            });
            insertionIndex = nextHeader?.index ?? insertionIndex;
        }
        if (insertionIndex > 0 && result[insertionIndex - 1]?.type === ListPaneItemType.HEADER_SPACER) {
            insertionIndex -= 1;
        }
        if (insertionIndex > 0 && result[insertionIndex - 1]?.type !== ListPaneItemType.TOP_SPACER) {
            block.unshift({
                type: ListPaneItemType.HEADER_SPACER,
                data: '',
                key: `header-${groupId}-spacer-before`
            });
        }
        if (result[insertionIndex]?.type === ListPaneItemType.HEADER) {
            block.push({
                type: ListPaneItemType.HEADER_SPACER,
                data: '',
                key: `header-${groupId}-spacer-after`
            });
        }
        result.splice(insertionIndex, 0, ...block);
    });
    return result;
}

/** Appends transient augmenting rows to an already-built standalone list without disturbing its headers. */
export function appendProviderRowsToStandaloneList(
    listItems: readonly ListPaneItem[],
    providerRows: readonly NavigatorProvidedRow[]
): ListPaneItem[] {
    if (providerRows.length === 0) {
        return [...listItems];
    }

    const seenKeys = new Set(listItems.map(item => item.key));
    const additions: ListPaneItem[] = [];
    for (const row of providerRows) {
        if (additions.length >= NAVIGATOR_ROW_PROVIDER_MAX_ROWS) {
            break;
        }
        const key = `provider:${row.providerId}:${row.id}`;
        if (seenKeys.has(key)) {
            continue;
        }
        seenKeys.add(key);
        additions.push({ type: ListPaneItemType.PROVIDER_ROW, data: row, key });
    }
    if (additions.length === 0) {
        return [...listItems];
    }

    const bottomIndex = listItems.findIndex(item => item.type === ListPaneItemType.BOTTOM_SPACER);
    if (bottomIndex === -1) {
        return [...listItems, ...additions];
    }
    return [...listItems.slice(0, bottomIndex), ...additions, ...listItems.slice(bottomIndex)];
}

export interface StructuralTypeSearchGroup {
    typeId: TpsNavigatorLineTypeId;
    label: string;
    rows: readonly NavigatorProvidedRow[];
    /** Sorted/grouped form of the same rows, excluding no search matches. */
    presentedItems?: readonly ListPaneItem[];
}

/**
 * Adds mixed structural search results after native file matches. Type headers provide provenance;
 * repeated source paths intentionally count rows and downstream group actions de-duplicate files.
 */
export function appendStructuralTypeSearchGroups(listItems: ListPaneItem[], groups: readonly StructuralTypeSearchGroup[]): ListPaneItem[] {
    const visibleGroups = groups.filter(group => group.rows.length > 0);
    if (visibleGroups.length === 0) {
        return listItems;
    }

    const bottomIndex = listItems.findIndex(item => item.type === ListPaneItemType.BOTTOM_SPACER);
    const insertionIndex = bottomIndex === -1 ? listItems.length : bottomIndex;
    const prefix = listItems.slice(0, insertionIndex);
    const suffix = listItems.slice(insertionIndex);
    const additions: ListPaneItem[] = [];
    const seenKeys = new Set(listItems.map(item => item.key));

    visibleGroups.forEach(group => {
        const uniqueRows = group.rows.filter(row => {
            const key = `provider:${row.providerId}:${row.id}`;
            if (seenKeys.has(key)) {
                return false;
            }
            seenKeys.add(key);
            return true;
        });
        if (uniqueRows.length === 0) {
            return;
        }
        const uniqueRowKeys = new Set(uniqueRows.map(row => `provider:${row.providerId}:${row.id}`));
        const headerKey = `search-type-header:${group.typeId}`;
        if (prefix.length > 1 || additions.length > 0) {
            additions.push({ type: ListPaneItemType.HEADER_SPACER, data: '', key: `${headerKey}:spacer` });
        }
        additions.push({
            type: ListPaneItemType.HEADER,
            data: group.label,
            key: headerKey,
            headerKind: 'section',
            groupFilePaths: uniqueRows.map(row => row.sourcePath)
        });
        if (group.presentedItems) {
            group.presentedItems.forEach(item => {
                if (item.type === ListPaneItemType.TOP_SPACER || item.type === ListPaneItemType.BOTTOM_SPACER) {
                    return;
                }
                if (
                    item.type === ListPaneItemType.PROVIDER_ROW &&
                    typeof item.data === 'object' &&
                    !uniqueRowKeys.has(
                        `provider:${(item.data as NavigatorProvidedRow).providerId}:${(item.data as NavigatorProvidedRow).id}`
                    )
                ) {
                    return;
                }
                additions.push({
                    ...item,
                    key: `search-type:${group.typeId}:${item.key}`,
                    ...(item.type === ListPaneItemType.PROVIDER_ROW ? { providerTypeId: group.typeId } : {})
                });
            });
            return;
        }
        uniqueRows.forEach(row => {
            const key = `provider:${row.providerId}:${row.id}`;
            additions.push({ type: ListPaneItemType.PROVIDER_ROW, data: row, key, providerTypeId: group.typeId });
        });
    });

    return [...prefix, ...additions, ...suffix];
}
