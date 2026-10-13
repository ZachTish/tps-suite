/*
 * TPS Notebook Navigator - pure ordering helpers for the flat Types catalog.
 *
 * Type discovery remains provider-owned. These helpers only arrange the
 * descriptors that are visible now while preserving stable IDs for providers
 * that may temporarily disappear during plugin load or unload.
 */

import type { TypeNavigationSortOrder } from '../settings/types';
import { isTpsNavigatorTypeId, type TpsNavigatorTypeDescriptor, type TpsNavigatorTypeId } from '../types/navigatorTypes';
import { naturalCompare } from './sortUtils';

function sanitizeTypeIds(values: readonly unknown[] | null | undefined): TpsNavigatorTypeId[] {
    if (!Array.isArray(values)) {
        return [];
    }

    const seen = new Set<TpsNavigatorTypeId>();
    const normalized: TpsNavigatorTypeId[] = [];
    values.forEach(value => {
        if (!isTpsNavigatorTypeId(value) || seen.has(value)) {
            return;
        }
        seen.add(value);
        normalized.push(value);
    });
    return normalized;
}

function compareDescriptorIdentity(left: TpsNavigatorTypeDescriptor, right: TpsNavigatorTypeDescriptor): number {
    return naturalCompare(left.label, right.label) || naturalCompare(left.id, right.id);
}

function compareKnownCounts(left: TpsNavigatorTypeDescriptor, right: TpsNavigatorTypeDescriptor, direction: 'asc' | 'desc'): number {
    const leftHasCount = left.showCount !== false;
    const rightHasCount = right.showCount !== false;

    // A provider that deliberately hides its count has an unknown quantity,
    // not a quantity of zero. Keep unknowns after every countable Type in both
    // directions so a real zero remains distinguishable and useful.
    if (leftHasCount !== rightHasCount) {
        return leftHasCount ? -1 : 1;
    }

    if (leftHasCount && rightHasCount && left.count !== right.count) {
        return direction === 'asc' ? left.count - right.count : right.count - left.count;
    }

    return compareDescriptorIdentity(left, right);
}

/**
 * Orders visible Type descriptors without mutating the provider snapshot.
 *
 * Catalog mode preserves provider/catalog order. Manual mode follows saved
 * stable Type IDs and appends newly discovered descriptors in catalog order.
 */
export function orderTypeNavigationDescriptors(
    descriptors: readonly TpsNavigatorTypeDescriptor[],
    mode: TypeNavigationSortOrder,
    manualOrder?: readonly unknown[] | null
): TpsNavigatorTypeDescriptor[] {
    const ordered = [...descriptors];

    if (mode === 'catalog') {
        return ordered;
    }

    if (mode === 'alpha-asc' || mode === 'alpha-desc') {
        const direction = mode === 'alpha-asc' ? 1 : -1;
        return ordered.sort((left, right) => {
            const labelComparison = naturalCompare(left.label, right.label);
            if (labelComparison !== 0) {
                return direction * labelComparison;
            }
            return naturalCompare(left.id, right.id);
        });
    }

    if (mode === 'count-asc' || mode === 'count-desc') {
        return ordered.sort((left, right) => compareKnownCounts(left, right, mode === 'count-asc' ? 'asc' : 'desc'));
    }

    const manualIds = sanitizeTypeIds(manualOrder);
    if (manualIds.length === 0) {
        return ordered;
    }

    const manualIndex = new Map<TpsNavigatorTypeId, number>();
    manualIds.forEach((typeId, index) => manualIndex.set(typeId, index));
    const catalogIndex = new Map<TpsNavigatorTypeId, number>();
    descriptors.forEach((descriptor, index) => {
        if (!catalogIndex.has(descriptor.id)) {
            catalogIndex.set(descriptor.id, index);
        }
    });

    return ordered.sort((left, right) => {
        const leftManualIndex = manualIndex.get(left.id);
        const rightManualIndex = manualIndex.get(right.id);
        const leftIsManual = leftManualIndex !== undefined;
        const rightIsManual = rightManualIndex !== undefined;

        if (leftIsManual && rightIsManual) {
            return leftManualIndex - rightManualIndex;
        }
        if (leftIsManual !== rightIsManual) {
            return leftIsManual ? -1 : 1;
        }
        return (catalogIndex.get(left.id) ?? 0) - (catalogIndex.get(right.id) ?? 0);
    });
}

/**
 * Merges a user-reordered visible subset into persisted manual order.
 *
 * Temporarily absent provider IDs stay in their existing slots. Visible IDs
 * fill the existing visible slots in their requested order. If more Types are
 * visible now than were present in storage, the remaining requested IDs are
 * appended. Malformed and duplicate IDs are discarded at this boundary.
 */
export function mergeVisibleTypeNavigationOrder(
    visibleOrder: readonly unknown[] | null | undefined,
    storedOrder: readonly unknown[] | null | undefined
): TpsNavigatorTypeId[] {
    const visibleIds = sanitizeTypeIds(visibleOrder);
    const storedIds = sanitizeTypeIds(storedOrder);
    const visibleSet = new Set(visibleIds);
    let visibleIndex = 0;

    const merged = storedIds.map(typeId => {
        if (!visibleSet.has(typeId)) {
            return typeId;
        }
        const replacement = visibleIds[visibleIndex];
        visibleIndex += 1;
        return replacement ?? typeId;
    });

    return [...merged, ...visibleIds.slice(visibleIndex)];
}
