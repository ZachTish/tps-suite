/*
 * TPS Notebook Navigator - guarded public list inputs and immutable snapshots.
 */

import { TFile } from 'obsidian';
import type {
    NavItem,
    NavigatorListPresentationState,
    NavigatorListPresentationUpdate,
    NavigatorListGrouping,
    NavigatorListSearchState,
    NavigatorListSearchUpdate,
    NavigatorListSortOption,
    NavigatorListSnapshot,
    NavigatorVisibleListRow
} from '../../api/types';
import { ListPaneItemType } from '../../types';
import type { ListPaneItem } from '../../types/virtualization';
import type { NavigatorProvidedRow } from '../rows/types';

export type PublicListInputResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

const SEARCH_UPDATE_KEYS = new Set(['active', 'query', 'provider', 'focus']);
const PRESENTATION_UPDATE_KEYS = new Set(['sort', 'groupBy', 'displayMode']);
const SORT_SPEC_KEYS = new Set(['option', 'propertyKey']);
const SORT_OPTIONS = new Set([
    'modified-desc',
    'modified-asc',
    'created-desc',
    'created-asc',
    'title-asc',
    'title-desc',
    'filename-asc',
    'filename-desc',
    'property-asc',
    'property-desc'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
    return Object.keys(value).every(key => allowed.has(key));
}

/** Validate and structurally clone a public search update before any readiness wait. */
export function validateListSearchUpdate(value: unknown): PublicListInputResult<NavigatorListSearchUpdate | null> {
    if (value === null) {
        return { ok: true, value: null };
    }
    if (!isRecord(value) || !hasOnlyKeys(value, SEARCH_UPDATE_KEYS)) {
        return { ok: false };
    }

    const { active, query, provider, focus } = value;
    if (active !== undefined && typeof active !== 'boolean') {
        return { ok: false };
    }
    if (query !== undefined && typeof query !== 'string') {
        return { ok: false };
    }
    if (provider !== undefined && provider !== 'internal' && provider !== 'omnisearch') {
        return { ok: false };
    }
    if (focus !== undefined && typeof focus !== 'boolean') {
        return { ok: false };
    }
    if (active === false && ((typeof query === 'string' && query.length > 0) || focus === true || provider !== undefined)) {
        return { ok: false };
    }

    return {
        ok: true,
        value: Object.freeze({
            ...(active === undefined ? {} : { active }),
            ...(query === undefined ? {} : { query }),
            ...(provider === undefined ? {} : { provider }),
            ...(focus === undefined ? {} : { focus })
        })
    };
}

/** Validate and structurally clone a public presentation update before any readiness wait. */
export function validateListPresentationUpdate(value: unknown): PublicListInputResult<NavigatorListPresentationUpdate> {
    if (!isRecord(value) || !hasOnlyKeys(value, PRESENTATION_UPDATE_KEYS) || Object.keys(value).length === 0) {
        return { ok: false };
    }

    const next: {
        sort?: NavigatorListPresentationUpdate['sort'];
        groupBy?: NavigatorListPresentationUpdate['groupBy'];
        displayMode?: NavigatorListPresentationUpdate['displayMode'];
    } = {};

    if (Object.prototype.hasOwnProperty.call(value, 'sort')) {
        if (value.sort === null) {
            next.sort = null;
        } else {
            if (!isRecord(value.sort) || !hasOnlyKeys(value.sort, SORT_SPEC_KEYS)) {
                return { ok: false };
            }
            const option = value.sort.option;
            const propertyKey = value.sort.propertyKey;
            if (typeof option !== 'string' || !SORT_OPTIONS.has(option)) {
                return { ok: false };
            }
            const normalizedOption = option as NavigatorListSortOption;
            const isPropertySort = normalizedOption === 'property-asc' || normalizedOption === 'property-desc';
            if (isPropertySort) {
                if (typeof propertyKey !== 'string' || propertyKey.trim().length === 0) {
                    return { ok: false };
                }
                next.sort = Object.freeze({ option: normalizedOption, propertyKey: propertyKey.trim() });
            } else {
                if (propertyKey !== undefined) {
                    return { ok: false };
                }
                next.sort = Object.freeze({ option: normalizedOption });
            }
        }
    }

    if (Object.prototype.hasOwnProperty.call(value, 'groupBy')) {
        const groupBy = value.groupBy;
        if (
            groupBy !== null &&
            groupBy !== 'none' &&
            groupBy !== 'custom' &&
            groupBy !== 'date' &&
            groupBy !== 'folder' &&
            groupBy !== 'tags' &&
            !(
                typeof groupBy === 'string' &&
                (/^property:[^\s].*$/.test(groupBy) ||
                    /^property-desc:[^\s].*$/.test(groupBy) ||
                    /^property-follow:[^\s].*$/.test(groupBy) ||
                    /^property-path:[^\s].*$/.test(groupBy) ||
                    /^property-path-desc:[^\s].*$/.test(groupBy) ||
                    /^property-path-follow:[^\s].*$/.test(groupBy) ||
                    /^property-day:[^\s].*$/.test(groupBy) ||
                    /^property-day-desc:[^\s].*$/.test(groupBy) ||
                    /^property-day-follow:[^\s].*$/.test(groupBy) ||
                    /^line-property:[^\s].*$/.test(groupBy) ||
                    /^line-property-desc:[^\s].*$/.test(groupBy) ||
                    /^line-property-follow:[^\s].*$/.test(groupBy) ||
                    /^line-property-path:[^\s].*$/.test(groupBy) ||
                    /^line-property-path-desc:[^\s].*$/.test(groupBy) ||
                    /^line-property-path-follow:[^\s].*$/.test(groupBy) ||
                    /^line-property-day:[^\s].*$/.test(groupBy) ||
                    /^line-property-day-desc:[^\s].*$/.test(groupBy) ||
                    /^line-property-day-follow:[^\s].*$/.test(groupBy))
            )
        ) {
            return { ok: false };
        }
        next.groupBy = typeof groupBy === 'string' ? (groupBy.trim() as NavigatorListGrouping) : null;
    }

    if (Object.prototype.hasOwnProperty.call(value, 'displayMode')) {
        const displayMode = value.displayMode;
        if (displayMode !== null && displayMode !== 'standard' && displayMode !== 'compact') {
            return { ok: false };
        }
        next.displayMode = displayMode;
    }

    return { ok: true, value: Object.freeze(next) };
}

function freezeNavItem(item: NavItem): NavItem {
    return Object.freeze({ ...item });
}

function toVisibleProviderRow(
    row: NavigatorProvidedRow,
    selectedType: string | null,
    resolveFile: (path: string) => TFile | null
): NavigatorVisibleListRow {
    return Object.freeze({
        type: 'provider' as const,
        providerId: row.providerId,
        rowId: row.id,
        kind: row.kind,
        label: row.label,
        ...(row.secondaryLabel === undefined ? {} : { secondaryLabel: row.secondaryLabel }),
        sourcePath: row.sourcePath,
        ...(row.sourceLineNumber === undefined ? {} : { sourceLineNumber: row.sourceLineNumber }),
        typeId: selectedType,
        file: resolveFile(row.sourcePath)
    });
}

export function buildNavigatorListSnapshot({
    navItem,
    search,
    presentation,
    listItems,
    selectedType,
    resolveFile
}: {
    navItem: NavItem;
    search: NavigatorListSearchState;
    presentation: NavigatorListPresentationState | null;
    listItems: readonly ListPaneItem[];
    selectedType: string | null;
    resolveFile: (path: string) => TFile | null;
}): NavigatorListSnapshot {
    const rows: NavigatorVisibleListRow[] = [];
    for (const item of listItems) {
        if (item.type === ListPaneItemType.FILE && item.data instanceof TFile) {
            rows.push(
                Object.freeze({
                    type: 'file' as const,
                    file: item.data,
                    path: item.data.path,
                    pinned: item.isPinned === true
                })
            );
            continue;
        }
        if (item.type === ListPaneItemType.PROVIDER_ROW && !(item.data instanceof TFile) && typeof item.data === 'object') {
            rows.push(toVisibleProviderRow(item.data, item.providerTypeId ?? selectedType, resolveFile));
        }
    }

    const frozenSearch = Object.freeze({ ...search });
    const frozenPresentation = presentation
        ? Object.freeze({
              sort: Object.freeze({ ...presentation.sort }),
              grouping: Object.freeze({ ...presentation.grouping }),
              displayMode: Object.freeze({ ...presentation.displayMode })
          })
        : null;

    return Object.freeze({
        navItem: freezeNavItem(navItem),
        search: frozenSearch,
        presentation: frozenPresentation,
        rows: Object.freeze(rows)
    });
}
