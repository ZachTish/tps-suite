/*
 * TPS Notebook Navigator - provider-neutral public list presentation plans.
 */

import type { TFolder } from 'obsidian';
import type { NavigatorListPresentationUpdate } from '../../api/types';
import type { FolderAppearance } from '../../hooks/useListPaneAppearance';
import {
    createPropertyGroupingOption,
    getPropertyGroupingGranularity,
    getPropertyGroupingKey,
    getPropertyGroupingOrder,
    getPropertyGroupingSource,
    normalizeListNoteGroupingOption,
    normalizeListSortOverride,
    type ListNoteGroupingOption,
    type ListSortOverrideValue,
    type NotebookNavigatorSettings
} from '../../settings/types';
import { ItemType } from '../../types';
import {
    isTpsNavigatorFileTypeId,
    isTpsNavigatorGcmLineTypeId,
    isTpsNavigatorLineTypeId,
    isTpsNavigatorStructuralTypeId,
    type TpsNavigatorTypeId
} from '../../types/navigatorTypes';
import { parsePropertyNodeId, type PropertySelectionNodeId } from '../../utils/propertyTree';
import { casefold, ensureRecord, sanitizeRecord } from '../../utils/recordUtils';
import {
    areListSortOverridesEqual,
    createListSortOverride,
    isDateSortOption,
    isManualSortPropertyKey,
    parsePropertySortKeys,
    resolveListSort,
    resolveSourceBackedTypeListSort
} from '../../utils/sortUtils';
import {
    areListGroupingOptionsEqual,
    resolveListGroupingOverride,
    resolveNavigationSelectionDefaultGrouping
} from '../../utils/listGrouping';

export type NavigatorListPresentationTarget =
    | { readonly type: typeof ItemType.FOLDER; readonly key: string }
    | { readonly type: typeof ItemType.TAG; readonly key: string }
    | { readonly type: typeof ItemType.PROPERTY; readonly key: string }
    | { readonly type: typeof ItemType.TYPE; readonly key: TpsNavigatorTypeId };

interface PlannedField<T> {
    readonly included: boolean;
    readonly value: T | undefined;
}

export interface NavigatorListPresentationPlan {
    readonly target: NavigatorListPresentationTarget;
    readonly sort: PlannedField<ListSortOverrideValue>;
    readonly grouping: PlannedField<ListNoteGroupingOption>;
    readonly displayMode: PlannedField<'standard' | 'compact'>;
    readonly changed: boolean;
}

interface NavigatorListPresentationRollbackState {
    readonly target: NavigatorListPresentationTarget;
    readonly sortPresent: boolean;
    readonly sortValue?: ListSortOverrideValue;
    readonly appearancePresent: boolean;
    readonly appearanceValue?: FolderAppearance;
}

const presentationWriteQueues = new WeakMap<NotebookNavigatorSettings, Promise<void>>();

export function resolveNavigatorListPresentationTarget({
    selectionType,
    selectedFolder,
    selectedTag,
    selectedProperty,
    selectedType
}: {
    selectionType: string | null;
    selectedFolder: TFolder | null;
    selectedTag: string | null;
    selectedProperty: PropertySelectionNodeId | null;
    selectedType?: TpsNavigatorTypeId | null;
}): NavigatorListPresentationTarget | null {
    if (selectionType === ItemType.FOLDER && selectedFolder) {
        return Object.freeze({ type: ItemType.FOLDER, key: selectedFolder.path });
    }
    if (selectionType === ItemType.TAG && selectedTag) {
        return Object.freeze({ type: ItemType.TAG, key: selectedTag });
    }
    if (selectionType === ItemType.PROPERTY && selectedProperty) {
        return Object.freeze({ type: ItemType.PROPERTY, key: selectedProperty });
    }
    if (selectionType === ItemType.TYPE && isTpsNavigatorStructuralTypeId(selectedType)) {
        return Object.freeze({ type: ItemType.TYPE, key: selectedType });
    }
    return null;
}

function getSortRecord(
    settings: NotebookNavigatorSettings,
    target: NavigatorListPresentationTarget
): Record<string, ListSortOverrideValue> {
    if (target.type === ItemType.FOLDER) {
        return settings.folderSortOverrides;
    }
    if (target.type === ItemType.TAG) {
        return settings.tagSortOverrides;
    }
    if (target.type === ItemType.PROPERTY) {
        return settings.propertySortOverrides;
    }
    return settings.typeSortOverrides ?? {};
}

function setSortRecord(
    settings: NotebookNavigatorSettings,
    target: NavigatorListPresentationTarget,
    record: Record<string, ListSortOverrideValue>
): void {
    if (target.type === ItemType.FOLDER) {
        settings.folderSortOverrides = record;
    } else if (target.type === ItemType.TAG) {
        settings.tagSortOverrides = record;
    } else if (target.type === ItemType.PROPERTY) {
        settings.propertySortOverrides = record;
    } else {
        settings.typeSortOverrides = record;
    }
}

function getAppearanceRecord(
    settings: NotebookNavigatorSettings,
    target: NavigatorListPresentationTarget
): Record<string, FolderAppearance> {
    if (target.type === ItemType.FOLDER) {
        return settings.folderAppearances;
    }
    if (target.type === ItemType.TAG) {
        return settings.tagAppearances;
    }
    if (target.type === ItemType.PROPERTY) {
        return settings.propertyAppearances;
    }
    return settings.typeAppearances ?? {};
}

function setAppearanceRecord(
    settings: NotebookNavigatorSettings,
    target: NavigatorListPresentationTarget,
    record: Record<string, FolderAppearance>
): void {
    if (target.type === ItemType.FOLDER) {
        settings.folderAppearances = record;
    } else if (target.type === ItemType.TAG) {
        settings.tagAppearances = record;
    } else if (target.type === ItemType.PROPERTY) {
        settings.propertyAppearances = record;
    } else {
        settings.typeAppearances = record;
    }
}

function getConfiguredPropertyKey(settings: NotebookNavigatorSettings, requestedKey: string, purpose: 'sort' | 'group'): string | null {
    const normalizedRequested = casefold(requestedKey.trim());
    if (!normalizedRequested) {
        return null;
    }
    const configuredKeys = purpose === 'group' ? settings.propertyGroupKey : settings.propertySortKey;
    const configured = parsePropertySortKeys(configuredKeys).find(key => casefold(key) === normalizedRequested);
    if (!configured || isManualSortPropertyKey(settings, configured)) {
        return null;
    }
    return configured;
}

function normalizeRequestedSort(
    settings: NotebookNavigatorSettings,
    update: NavigatorListPresentationUpdate['sort']
): ListSortOverrideValue | undefined | null {
    if (update === null) {
        return undefined;
    }
    if (update === undefined) {
        return null;
    }
    if (update.option === 'property-asc' || update.option === 'property-desc') {
        const propertyKey = getConfiguredPropertyKey(settings, update.propertyKey ?? '', 'sort');
        return propertyKey ? createListSortOverride(update.option, propertyKey) : null;
    }
    return update.option;
}

function normalizeRequestedGrouping(
    settings: NotebookNavigatorSettings,
    target: NavigatorListPresentationTarget,
    update: NavigatorListPresentationUpdate['groupBy']
): ListNoteGroupingOption | undefined | null {
    if (update === null) {
        return undefined;
    }
    if (update === undefined) {
        return null;
    }
    const normalized = normalizeListNoteGroupingOption(update);
    if (!normalized || (normalized === 'folder' && target.type !== ItemType.FOLDER)) {
        return null;
    }
    if (normalized === 'tags' && target.type === ItemType.TYPE && !isTpsNavigatorFileTypeId(target.key)) {
        return null;
    }
    const propertyKey = getPropertyGroupingKey(normalized);
    if (propertyKey === null) {
        return normalized;
    }
    const targetPropertyKey = target.type === ItemType.PROPERTY ? parsePropertyNodeId(target.key)?.key : undefined;
    const configuredKey =
        getConfiguredPropertyKey(settings, propertyKey, 'group') ??
        (targetPropertyKey && casefold(targetPropertyKey) === casefold(propertyKey) ? targetPropertyKey : null);
    if (!configuredKey) {
        return null;
    }
    const order = getPropertyGroupingOrder(normalized) ?? 'asc';
    const granularity = getPropertyGroupingGranularity(normalized) ?? 'value';
    const source = getPropertyGroupingSource(normalized) ?? 'note';
    if (source === 'line' && target.type === ItemType.TYPE) {
        // File-backed Types can host mixed structural search results. Exact GCM line Types can use
        // row-local properties standalone. Navigator-owned range Types have no inline-property contract.
        if (!isTpsNavigatorFileTypeId(target.key) && !isTpsNavigatorGcmLineTypeId(target.key)) {
            return null;
        }
    }
    return createPropertyGroupingOption(configuredKey, order, granularity, source);
}

function getCurrentSortOverride(
    settings: NotebookNavigatorSettings,
    target: NavigatorListPresentationTarget
): ListSortOverrideValue | undefined {
    return getSortRecord(settings, target)?.[target.key];
}

function sameOptionalGrouping(left: ListNoteGroupingOption | undefined, right: ListNoteGroupingOption | undefined): boolean {
    if (left === undefined || right === undefined) {
        return left === right;
    }
    return areListGroupingOptionsEqual(left, right);
}

/**
 * Validate every requested field before producing an immutable plan. The caller applies
 * the plan in one settings transaction, so a rejected field can never partially mutate state.
 */
export function createNavigatorListPresentationPlan(
    settings: NotebookNavigatorSettings,
    target: NavigatorListPresentationTarget,
    update: NavigatorListPresentationUpdate
): NavigatorListPresentationPlan | null {
    const isSourceBackedTypeTarget = target.type === ItemType.TYPE && isTpsNavigatorLineTypeId(target.key);
    const resolveTargetSort = (sortOverride?: ListSortOverrideValue) =>
        isSourceBackedTypeTarget ? resolveSourceBackedTypeListSort(settings, sortOverride) : resolveListSort(settings, sortOverride);
    const currentSortOverride = getCurrentSortOverride(settings, target);
    const currentSort = resolveTargetSort(currentSortOverride);
    if (!isSourceBackedTypeTarget && isManualSortPropertyKey(settings, currentSort.propertyKey)) {
        return null;
    }

    const sortIncluded = Object.prototype.hasOwnProperty.call(update, 'sort');
    const requestedSort = normalizeRequestedSort(settings, update.sort);
    if (sortIncluded && requestedSort === null) {
        return null;
    }

    let plannedSort = requestedSort ?? undefined;
    if (sortIncluded && plannedSort !== undefined) {
        const defaultSort = resolveTargetSort(undefined);
        const requestedEffectiveSort = resolveTargetSort(plannedSort);
        if (
            requestedEffectiveSort.option === defaultSort.option &&
            casefold(requestedEffectiveSort.propertyKey) === casefold(defaultSort.propertyKey)
        ) {
            plannedSort = undefined;
        }
    }

    const groupingIncluded = Object.prototype.hasOwnProperty.call(update, 'groupBy');
    const requestedGrouping = normalizeRequestedGrouping(settings, target, update.groupBy);
    if (groupingIncluded && requestedGrouping === null) {
        return null;
    }

    let plannedGrouping = requestedGrouping ?? undefined;
    if (groupingIncluded && plannedGrouping !== undefined) {
        const selectionDefault = resolveNavigationSelectionDefaultGrouping({
            noteGrouping: settings.noteGrouping,
            selectionType: target.type,
            tag: target.type === ItemType.TAG ? target.key : null,
            propertyNodeId: target.type === ItemType.PROPERTY ? target.key : null
        });
        const groupingDefault = resolveListGroupingOverride({
            noteGrouping: selectionDefault,
            selectionType: target.type
        }).effectiveGrouping;
        if (areListGroupingOptionsEqual(plannedGrouping, groupingDefault)) {
            plannedGrouping = undefined;
        }
    }

    const finalSort = resolveTargetSort(sortIncluded ? plannedSort : currentSortOverride);
    if (groupingIncluded && requestedGrouping === 'date' && !isDateSortOption(finalSort.option)) {
        return null;
    }

    const displayModeIncluded = Object.prototype.hasOwnProperty.call(update, 'displayMode');
    if (displayModeIncluded && target.type === ItemType.TYPE && !isTpsNavigatorFileTypeId(target.key)) {
        return null;
    }
    const defaultDisplayMode = settings.defaultListMode === 'compact' ? 'compact' : 'standard';
    const plannedDisplayMode = update.displayMode === null || update.displayMode === defaultDisplayMode ? undefined : update.displayMode;

    const currentAppearance = getAppearanceRecord(settings, target)?.[target.key];
    const currentGrouping = normalizeListNoteGroupingOption(currentAppearance?.groupBy) ?? undefined;
    const currentDisplayMode =
        currentAppearance?.mode === defaultDisplayMode || (currentAppearance?.mode !== 'standard' && currentAppearance?.mode !== 'compact')
            ? undefined
            : currentAppearance.mode;
    const currentNormalizedSort = normalizeListSortOverride(currentSortOverride);

    const changed =
        (sortIncluded && !areListSortOverridesEqual(currentNormalizedSort, plannedSort)) ||
        (groupingIncluded && !sameOptionalGrouping(currentGrouping, plannedGrouping)) ||
        (displayModeIncluded && currentDisplayMode !== plannedDisplayMode);

    return Object.freeze({
        target,
        sort: Object.freeze({ included: sortIncluded, value: plannedSort }),
        grouping: Object.freeze({ included: groupingIncluded, value: plannedGrouping }),
        displayMode: Object.freeze({ included: displayModeIncluded, value: plannedDisplayMode }),
        changed
    });
}

export function applyNavigatorListPresentationPlan(settings: NotebookNavigatorSettings, plan: NavigatorListPresentationPlan): void {
    if (plan.sort.included) {
        const nextSortRecord = sanitizeRecord(ensureRecord(getSortRecord(settings, plan.target)));
        if (plan.sort.value === undefined) {
            delete nextSortRecord[plan.target.key];
        } else {
            nextSortRecord[plan.target.key] = typeof plan.sort.value === 'string' ? plan.sort.value : { ...plan.sort.value };
        }
        setSortRecord(settings, plan.target, nextSortRecord);
    }

    if (!plan.grouping.included && !plan.displayMode.included) {
        return;
    }

    const nextAppearanceRecord = sanitizeRecord(ensureRecord(getAppearanceRecord(settings, plan.target)));
    const nextAppearance: FolderAppearance = { ...(nextAppearanceRecord[plan.target.key] ?? {}) };
    if (plan.grouping.included) {
        if (plan.grouping.value === undefined) {
            delete nextAppearance.groupBy;
        } else {
            nextAppearance.groupBy = plan.grouping.value;
        }
    }
    if (plan.displayMode.included) {
        if (plan.displayMode.value === undefined) {
            delete nextAppearance.mode;
        } else {
            nextAppearance.mode = plan.displayMode.value;
        }
    }

    if (Object.keys(nextAppearance).length === 0) {
        delete nextAppearanceRecord[plan.target.key];
    } else {
        nextAppearanceRecord[plan.target.key] = nextAppearance;
    }
    setAppearanceRecord(settings, plan.target, nextAppearanceRecord);
}

function captureNavigatorListPresentationState(
    settings: NotebookNavigatorSettings,
    target: NavigatorListPresentationTarget
): NavigatorListPresentationRollbackState {
    const sortRecord = ensureRecord(getSortRecord(settings, target));
    const sortPresent = Object.prototype.hasOwnProperty.call(sortRecord, target.key);
    const sortValue = sortPresent ? sortRecord[target.key] : undefined;
    const appearanceRecord = ensureRecord(getAppearanceRecord(settings, target));
    const appearancePresent = Object.prototype.hasOwnProperty.call(appearanceRecord, target.key);
    const appearanceValue = appearancePresent ? appearanceRecord[target.key] : undefined;

    return {
        target,
        sortPresent,
        ...(sortValue === undefined ? {} : { sortValue: typeof sortValue === 'string' ? sortValue : { ...sortValue } }),
        appearancePresent,
        ...(appearanceValue === undefined ? {} : { appearanceValue: { ...appearanceValue } })
    };
}

function restoreNavigatorListPresentationState(
    settings: NotebookNavigatorSettings,
    rollback: NavigatorListPresentationRollbackState
): void {
    const nextSortRecord = sanitizeRecord(ensureRecord(getSortRecord(settings, rollback.target)));
    if (rollback.sortPresent && rollback.sortValue !== undefined) {
        nextSortRecord[rollback.target.key] = typeof rollback.sortValue === 'string' ? rollback.sortValue : { ...rollback.sortValue };
    } else {
        delete nextSortRecord[rollback.target.key];
    }
    setSortRecord(settings, rollback.target, nextSortRecord);

    const nextAppearanceRecord = sanitizeRecord(ensureRecord(getAppearanceRecord(settings, rollback.target)));
    if (rollback.appearancePresent && rollback.appearanceValue !== undefined) {
        nextAppearanceRecord[rollback.target.key] = { ...rollback.appearanceValue };
    } else {
        delete nextAppearanceRecord[rollback.target.key];
    }
    setAppearanceRecord(settings, rollback.target, nextAppearanceRecord);
}

/** Apply and persist one plan, restoring the affected live scope when persistence rejects. */
export async function persistNavigatorListPresentationPlan({
    settings,
    plan,
    persist,
    onRollback
}: {
    settings: NotebookNavigatorSettings;
    plan: NavigatorListPresentationPlan;
    persist: () => Promise<void>;
    onRollback?: () => void;
}): Promise<void> {
    const rollback = captureNavigatorListPresentationState(settings, plan.target);
    applyNavigatorListPresentationPlan(settings, plan);

    try {
        await persist();
    } catch (error) {
        restoreNavigatorListPresentationState(settings, rollback);
        onRollback?.();
        throw error;
    }
}

/**
 * Serialize public presentation writes for one live settings object. Planning happens
 * inside the queue so a reset or no-op is evaluated against the preceding committed
 * (or rolled-back) write rather than stale call-time state.
 */
export async function persistNavigatorListPresentationUpdate({
    settings,
    target,
    update,
    persist,
    onRollback
}: {
    settings: NotebookNavigatorSettings;
    target: NavigatorListPresentationTarget;
    update: NavigatorListPresentationUpdate;
    persist: () => Promise<void>;
    onRollback?: () => void;
}): Promise<boolean> {
    const previous = presentationWriteQueues.get(settings) ?? Promise.resolve();
    const operation = previous.then(async () => {
        const plan = createNavigatorListPresentationPlan(settings, target, update);
        if (!plan) {
            return false;
        }
        if (!plan.changed) {
            return true;
        }

        await persistNavigatorListPresentationPlan({ settings, plan, persist, onRollback });
        return true;
    });
    const tail = operation.then(
        () => undefined,
        () => undefined
    );
    presentationWriteQueues.set(settings, tail);

    try {
        return await operation;
    } finally {
        if (presentationWriteQueues.get(settings) === tail) {
            presentationWriteQueues.delete(settings);
        }
    }
}
