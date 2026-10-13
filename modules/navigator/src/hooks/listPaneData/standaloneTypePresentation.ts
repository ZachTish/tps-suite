/* TPS Notebook Navigator - pure sort/group presentation for built-in structural Type rows. */

import type { TFile } from 'obsidian';
import type { ListNoteGroupingOption } from '../../settings/types';
import {
    getPropertyGroupingGranularity,
    getPropertyGroupingKey,
    getPropertyGroupingSource,
    replacePropertyGroupingSource
} from '../../settings/types';
import type { NavigatorProvidedRow } from '../../services/rows/types';
import type { LinePropertyInheritance, MultiValueGrouping, NoValueGroupPosition } from '../useListPaneAppearance';
import { ItemType, ListPaneItemType } from '../../types';
import { isTpsNavigatorGcmLineTypeId, type TpsNavigatorLineTypeId } from '../../types/navigatorTypes';
import type { ListPaneItem } from '../../types/virtualization';
import { DateUtils } from '../../utils/dateUtils';
import { buildListGroupCollapseKey } from '../../utils/listGroupCollapse';
import { findMatchingRecordKey, getMatchingRecordValue } from '../../utils/recordUtils';
import {
    getPropertyDayGroupingValue,
    getPropertyDayGroupingValues,
    getPropertyGroupingValue,
    getPropertyGroupingValues,
    getPropertySortValue,
    isDateSortOption,
    naturalCompare,
    type EffectiveListSort
} from '../../utils/sortUtils';
import { resolvePropertyGroupingDirection } from '../../utils/listGrouping';
import { getNavigatorRowSelectionKey } from '../../services/rows/rowSelection';

export interface StructuralTypeRowPresentationArgs {
    /** Built-in rows for one selected structural Type. External Type collections are not part of this contract. */
    rows: readonly NavigatorProvidedRow[];
    selectedType: TpsNavigatorLineTypeId;
    sort: EffectiveListSort;
    groupBy: ListNoteGroupingOption;
    dayKey: string;
    collapsedListGroups?: ReadonlySet<string>;
    resolveFile: (sourcePath: string) => TFile | null;
    getFrontmatter: (file: TFile) => unknown;
    getFileTimestamps: (file: TFile) => { created: number; modified: number };
    noValueLabel: string;
    /** How row-local and owning-note values are inherited for property sort and grouping. */
    linePropertyInheritance?: LinePropertyInheritance;
    multiValueGrouping?: MultiValueGrouping;
    noValueGroupPosition?: NoValueGroupPosition;
}

interface DecoratedStructuralTypeRow {
    row: NavigatorProvidedRow;
    file: TFile | null;
    frontmatter: unknown;
    timestamps: { created: number; modified: number } | null;
    inputIndex: number;
}

interface StructuralTypeRowGroup {
    id: string;
    label: string;
    kind: 'date' | 'property';
    rows: DecoratedStructuralTypeRow[];
    bucketKey?: string;
}

/**
 * Preserves a latent mixed-search line source without applying it to a standalone Navigator-owned range collection.
 * GCM line Types have a real row-property contract and may keep the line source when search closes.
 */
export function getEffectiveStandaloneStructuralTypeGrouping(
    selectedType: TpsNavigatorLineTypeId,
    groupBy: ListNoteGroupingOption,
    mixedStructuralSearchActive: boolean
): ListNoteGroupingOption {
    // Source-backed rows do not have a stable tag-instance contract. Keep a global Tags default
    // from claiming a grouping the structural presenter cannot render.
    if (groupBy === 'tags') {
        return 'custom';
    }
    if (mixedStructuralSearchActive || isTpsNavigatorGcmLineTypeId(selectedType) || getPropertyGroupingSource(groupBy) !== 'line') {
        return groupBy;
    }
    return replacePropertyGroupingSource(groupBy, 'note') ?? groupBy;
}

function compareStrings(left: string, right: string, descending: boolean): number {
    const result = naturalCompare(left, right);
    return result === 0 ? 0 : descending ? -result : result;
}

function compareStableText(left: string, right: string): number {
    const naturalResult = naturalCompare(left, right);
    if (naturalResult !== 0 || left === right) {
        return naturalResult;
    }
    return left < right ? -1 : 1;
}

/** Missing source-derived values always trail concrete values in both directions. */
function compareOptional<T>(
    left: T | null,
    right: T | null,
    descending: boolean,
    compare: (leftValue: T, rightValue: T) => number
): number {
    if (left === null || right === null) {
        if (left === right) {
            return 0;
        }
        return left === null ? 1 : -1;
    }

    const result = compare(left, right);
    return result === 0 ? 0 : descending ? -result : result;
}

function getFileTimestamp(entry: DecoratedStructuralTypeRow, field: 'created' | 'modified'): number | null {
    if (!entry.file) {
        return null;
    }
    const value = entry.timestamps?.[field];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getFilename(entry: DecoratedStructuralTypeRow): string | null {
    return entry.file?.basename || null;
}

function getRowPropertyValue(entry: DecoratedStructuralTypeRow, propertyKey: string): { present: boolean; value: unknown } {
    const rowProperties = entry.row.properties as Record<string, unknown> | undefined;
    const rowPropertyKey = findMatchingRecordKey(rowProperties, propertyKey);
    if (rowPropertyKey !== null && rowProperties) {
        return { present: true, value: rowProperties[rowPropertyKey] };
    }
    return { present: false, value: undefined };
}

function getNotePropertyValue(entry: DecoratedStructuralTypeRow, propertyKey: string): unknown {
    const frontmatter =
        entry.frontmatter && typeof entry.frontmatter === 'object' && !Array.isArray(entry.frontmatter)
            ? (entry.frontmatter as Record<string, unknown>)
            : undefined;
    return getMatchingRecordValue(frontmatter, propertyKey);
}

function combinePropertyValues(noteValue: unknown, lineValue: unknown): unknown {
    const noteValues: unknown[] = Array.isArray(noteValue) ? (noteValue as unknown[]) : [noteValue];
    const lineValues: unknown[] = Array.isArray(lineValue) ? (lineValue as unknown[]) : [lineValue];
    const values = [...noteValues, ...lineValues];
    const seen = new Set<string>();
    return values.filter(value => {
        const key = `${typeof value}:${String(value)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function getResolvedPropertyValue(entry: DecoratedStructuralTypeRow, propertyKey: string, inheritance: LinePropertyInheritance): unknown {
    const rowProperty = getRowPropertyValue(entry, propertyKey);
    const noteValue = getNotePropertyValue(entry, propertyKey);
    if (inheritance === 'none') return rowProperty.value;
    if (inheritance === 'note-first') return noteValue === undefined ? rowProperty.value : noteValue;
    if (inheritance === 'combine') return combinePropertyValues(noteValue, rowProperty.value);
    return rowProperty.present ? rowProperty.value : noteValue;
}

function compareStableIdentity(left: DecoratedStructuralTypeRow, right: DecoratedStructuralTypeRow): number {
    const sourcePathResult = compareStableText(left.row.sourcePath, right.row.sourcePath);
    if (sourcePathResult !== 0) {
        return sourcePathResult;
    }

    const leftLine = left.row.sourceLineNumber ?? Number.MAX_SAFE_INTEGER;
    const rightLine = right.row.sourceLineNumber ?? Number.MAX_SAFE_INTEGER;
    if (leftLine !== rightLine) {
        return leftLine - rightLine;
    }

    const providerResult = compareStableText(left.row.providerId, right.row.providerId);
    if (providerResult !== 0) {
        return providerResult;
    }

    const idResult = compareStableText(left.row.id, right.row.id);
    return idResult !== 0 ? idResult : left.inputIndex - right.inputIndex;
}

function compareSecondary(
    left: DecoratedStructuralTypeRow,
    right: DecoratedStructuralTypeRow,
    sort: EffectiveListSort,
    descending: boolean
): number {
    switch (sort.propertySortSecondary) {
        case 'created':
            return compareOptional(getFileTimestamp(left, 'created'), getFileTimestamp(right, 'created'), descending, (a, b) => a - b);
        case 'modified':
            return compareOptional(getFileTimestamp(left, 'modified'), getFileTimestamp(right, 'modified'), descending, (a, b) => a - b);
        case 'filename':
            return compareOptional(getFilename(left), getFilename(right), descending, naturalCompare);
        case 'title':
        default:
            return compareStrings(left.row.label, right.row.label, descending);
    }
}

function compareRows(
    left: DecoratedStructuralTypeRow,
    right: DecoratedStructuralTypeRow,
    sort: EffectiveListSort,
    inheritance: LinePropertyInheritance
): number {
    const descending = sort.option.endsWith('-desc');
    let result = 0;

    if (sort.option.startsWith('title')) {
        result = compareStrings(left.row.label, right.row.label, descending);
    } else if (sort.option.startsWith('filename')) {
        result = compareOptional(getFilename(left), getFilename(right), descending, naturalCompare);
    } else if (sort.option.startsWith('created')) {
        result = compareOptional(getFileTimestamp(left, 'created'), getFileTimestamp(right, 'created'), descending, (a, b) => a - b);
    } else if (sort.option.startsWith('modified')) {
        result = compareOptional(getFileTimestamp(left, 'modified'), getFileTimestamp(right, 'modified'), descending, (a, b) => a - b);
    } else {
        const leftValue = getPropertySortValue(getResolvedPropertyValue(left, sort.propertyKey, inheritance));
        const rightValue = getPropertySortValue(getResolvedPropertyValue(right, sort.propertyKey, inheritance));
        result = compareOptional(leftValue, rightValue, descending, naturalCompare);
        if (result === 0 && leftValue !== null && rightValue !== null) {
            result = compareSecondary(left, right, sort, descending);
        }
    }

    return result !== 0 ? result : compareStableIdentity(left, right);
}

function orderPropertyGroups(
    entries: readonly DecoratedStructuralTypeRow[],
    groupBy: ListNoteGroupingOption,
    sort: EffectiveListSort,
    noValueLabel: string,
    inheritance: LinePropertyInheritance,
    multiValueGrouping: MultiValueGrouping,
    noValueGroupPosition: NoValueGroupPosition
): StructuralTypeRowGroup[] {
    const propertyKey = getPropertyGroupingKey(groupBy);
    if (propertyKey === null) {
        return [];
    }

    const granularity = getPropertyGroupingGranularity(groupBy) ?? 'value';
    const source = getPropertyGroupingSource(groupBy) ?? 'note';
    const grouped = new Map<
        string,
        { label: string; numericValue: number | null; daySortValue: number | null; rows: DecoratedStructuralTypeRow[] }
    >();
    const missing: DecoratedStructuralTypeRow[] = [];

    entries.forEach(entry => {
        const rawValue = getResolvedPropertyValue(entry, propertyKey, inheritance);
        const values =
            multiValueGrouping === 'separate'
                ? granularity === 'day'
                    ? getPropertyDayGroupingValues(rawValue)
                    : getPropertyGroupingValues(rawValue)
                : [granularity === 'day' ? getPropertyDayGroupingValue(rawValue) : getPropertyGroupingValue(rawValue)].filter(
                      value => value !== null
                  );
        if (values.length === 0) {
            missing.push(entry);
            return;
        }
        values.forEach(value => {
            const id = value.parts.join('\u0000');
            const existing = grouped.get(id);
            if (existing) {
                existing.rows.push(entry);
            } else {
                grouped.set(id, {
                    label: value.parts.join(', '),
                    numericValue: 'numericValue' in value ? value.numericValue : null,
                    daySortValue: 'sortValue' in value ? value.sortValue : null,
                    rows: [entry]
                });
            }
        });
    });

    const descending = resolvePropertyGroupingDirection(groupBy, sort.option) === 'desc';
    const direction = descending ? -1 : 1;
    const groupIdPrefix = source === 'line' ? `line-property-${granularity}` : `property-${granularity}`;
    const groups: StructuralTypeRowGroup[] = Array.from(grouped.entries())
        .map(([id, group]) => ({ id: `${groupIdPrefix}:${id}`, bucketKey: id, kind: 'property' as const, ...group }))
        .sort((left, right) => {
            if (left.daySortValue !== null && right.daySortValue !== null && left.daySortValue !== right.daySortValue) {
                return direction * (left.daySortValue < right.daySortValue ? -1 : 1);
            }
            if (left.numericValue !== null && right.numericValue !== null && left.numericValue !== right.numericValue) {
                return direction * (left.numericValue < right.numericValue ? -1 : 1);
            }
            if (left.numericValue !== null || right.numericValue !== null) {
                return direction * (left.numericValue !== null ? -1 : 1);
            }
            const labelResult = compareStrings(left.label, right.label, descending);
            if (labelResult !== 0) {
                return labelResult;
            }
            return direction * (left.id < right.id ? -1 : 1);
        })
        .map(({ id, label, kind, rows, bucketKey }) => ({ id, label, kind, rows, bucketKey }));

    if (missing.length > 0) {
        const noValueGroup = {
            id: 'property-none',
            bucketKey: '\u0000no-value',
            label: noValueLabel,
            kind: 'property' as const,
            rows: missing
        };
        if (noValueGroupPosition === 'top') groups.unshift(noValueGroup);
        else groups.push(noValueGroup);
    }
    return groups;
}

function orderDateGroups(
    entries: readonly DecoratedStructuralTypeRow[],
    sort: EffectiveListSort,
    dayKey: string,
    noValueLabel: string
): StructuralTypeRowGroup[] {
    if (!isDateSortOption(sort.option)) {
        return [];
    }

    const field = sort.option.startsWith('created') ? 'created' : 'modified';
    const referenceDate = DateUtils.parseLocalDayKey(dayKey) ?? new Date();
    const groups = new Map<string, StructuralTypeRowGroup>();
    const missing: DecoratedStructuralTypeRow[] = [];

    entries.forEach(entry => {
        const timestamp = getFileTimestamp(entry, field);
        if (timestamp === null) {
            missing.push(entry);
            return;
        }
        const dateGroup = DateUtils.getDateGroupInfo(timestamp, referenceDate);
        const id = `date:${field}:${dateGroup.key}`;
        const existing = groups.get(id);
        if (existing) {
            existing.rows.push(entry);
            return;
        }
        groups.set(id, { id, label: dateGroup.label, kind: 'date', rows: [entry] });
    });

    const result = Array.from(groups.values());
    if (missing.length > 0) {
        result.push({ id: `date:${field}:none`, label: noValueLabel, kind: 'date', rows: missing });
    }
    return result;
}

function rowItem(entry: DecoratedStructuralTypeRow, selectedType: TpsNavigatorLineTypeId, instanceId = ''): ListPaneItem {
    return {
        type: ListPaneItemType.PROVIDER_ROW,
        data: entry.row,
        key: `provider:${entry.row.providerId}:${entry.row.id}${instanceId}`,
        providerTypeId: selectedType
    };
}

function buildGroupedItems(
    groups: readonly StructuralTypeRowGroup[],
    args: Pick<StructuralTypeRowPresentationArgs, 'selectedType' | 'groupBy' | 'collapsedListGroups'>
): ListPaneItem[] {
    const items: ListPaneItem[] = [{ type: ListPaneItemType.TOP_SPACER, data: '', key: 'top-spacer' }];
    const includePathMembership = getPropertyGroupingGranularity(args.groupBy) === 'path';

    groups.forEach(group => {
        const collapseKey = buildListGroupCollapseKey({
            selectionType: ItemType.TYPE,
            selectedFolderPath: null,
            selectedTag: null,
            selectedProperty: null,
            selectedType: args.selectedType,
            groupingMode: args.groupBy,
            groupId: group.id
        });
        const isCollapsed = args.collapsedListGroups?.has(collapseKey) === true;
        const headerKey = `standalone-type-header:${group.id}`;
        if (items.length > 1) {
            items.push({ type: ListPaneItemType.HEADER_SPACER, data: '', key: `${headerKey}-spacer-before` });
        }
        items.push({
            type: ListPaneItemType.HEADER,
            data: group.label,
            key: headerKey,
            headerKind: group.kind,
            collapseKey,
            isCollapsed,
            // Repeated paths intentionally count structural rows, while existing group file actions de-duplicate paths.
            groupFilePaths: group.rows.map(entry => entry.row.sourcePath),
            ...(group.kind === 'property' && includePathMembership
                ? {
                      groupBucketKey: group.bucketKey,
                      groupNativeFilePaths: [],
                      groupRowKeys: Array.from(
                          new Set(
                              group.rows.map(entry =>
                                  getNavigatorRowSelectionKey({ providerId: entry.row.providerId, rowId: entry.row.id })
                              )
                          )
                      )
                  }
                : {})
        });
        if (!isCollapsed) {
            items.push(...group.rows.map(entry => rowItem(entry, args.selectedType, `:group:${group.id}`)));
        }
    });

    items.push({ type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom-spacer' });
    return items;
}

/**
 * Sorts and groups one built-in structural Type collection without treating transient rows as files.
 * Source-note fields are resolved once per path. The function mutates neither rows nor caller-owned settings.
 */
export function buildStandaloneStructuralTypePresentation(args: StructuralTypeRowPresentationArgs): ListPaneItem[] {
    const sourceCache = new Map<
        string,
        { file: TFile | null; frontmatter: unknown; timestamps: { created: number; modified: number } | null }
    >();
    const entries = args.rows.map((row, inputIndex): DecoratedStructuralTypeRow => {
        let source = sourceCache.get(row.sourcePath);
        if (!source) {
            const file = args.resolveFile(row.sourcePath);
            source = {
                file,
                frontmatter: file ? args.getFrontmatter(file) : null,
                timestamps: file ? args.getFileTimestamps(file) : null
            };
            sourceCache.set(row.sourcePath, source);
        }
        return { row, inputIndex, ...source };
    });
    const inheritance = args.linePropertyInheritance ?? 'none';
    entries.sort((left, right) => compareRows(left, right, args.sort, inheritance));

    const propertyGroups = orderPropertyGroups(
        entries,
        args.groupBy,
        args.sort,
        args.noValueLabel,
        inheritance,
        args.multiValueGrouping ?? 'separate',
        args.noValueGroupPosition ?? 'bottom'
    );
    if (propertyGroups.length > 0 || getPropertyGroupingKey(args.groupBy) !== null) {
        return buildGroupedItems(propertyGroups, args);
    }

    const dateGroups = args.groupBy === 'date' ? orderDateGroups(entries, args.sort, args.dayKey, args.noValueLabel) : [];
    if (dateGroups.length > 0 || (args.groupBy === 'date' && isDateSortOption(args.sort.option))) {
        return buildGroupedItems(dateGroups, args);
    }

    return [
        { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top-spacer' },
        ...entries.map(entry => rowItem(entry, args.selectedType)),
        { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom-spacer' }
    ];
}
