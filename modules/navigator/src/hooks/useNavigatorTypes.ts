/* TPS Notebook Navigator - React adapter for the composite Types catalog. */

import { useCallback, useSyncExternalStore } from 'react';
import { INTERNAL_NOTEBOOK_NAVIGATOR_API, type NotebookNavigatorAPI } from '../api/NotebookNavigatorAPI';
import type { TpsNavigatorTypeId, TpsNavigatorTypesSnapshot } from '../types/navigatorTypes';

const EMPTY_RECORDS = new Map<TpsNavigatorTypeId, readonly never[]>();
const EMPTY_SNAPSHOT: TpsNavigatorTypesSnapshot = Object.freeze({
    availability: 'unavailable',
    descriptors: Object.freeze([]),
    recordsByType: EMPTY_RECORDS,
    revision: 0,
    message: 'The Types catalog is unavailable.'
});

export function useNavigatorTypes(api: NotebookNavigatorAPI | null): TpsNavigatorTypesSnapshot {
    const types = api?.[INTERNAL_NOTEBOOK_NAVIGATOR_API].types ?? null;
    const subscribe = useCallback((listener: () => void) => types?.subscribeInternal(listener) ?? (() => undefined), [types]);
    const getSnapshot = useCallback(() => types?.getInternalSnapshot() ?? EMPTY_SNAPSHOT, [types]);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
