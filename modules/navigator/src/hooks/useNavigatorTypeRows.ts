/* TPS Notebook Navigator - guarded row lifecycle for an owning Type provider. */

import { useEffect, useMemo, useState } from 'react';
import { INTERNAL_NOTEBOOK_NAVIGATOR_API, type NotebookNavigatorAPI } from '../api/NotebookNavigatorAPI';
import type { NavigatorProvidedRow } from '../services/rows/types';
import type { NavigatorTypeProviderOwner } from '../services/types/NavigatorTypeProviderRegistry';
import type { TpsNavigatorTypeId } from '../types/navigatorTypes';

interface UseNavigatorTypeRowsParams {
    api: NotebookNavigatorAPI | null;
    selectedType: TpsNavigatorTypeId | null;
    searchQuery: string;
    allowedVaultFilePaths: readonly string[];
    catalogRevision: number;
}

export type NavigatorTypeRowsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface NavigatorTypeRowsResult {
    scopeKey: string | null;
    status: NavigatorTypeRowsStatus;
    rows: NavigatorProvidedRow[];
}

/** Stable across unrelated catalog publications; changes only when this owning collection is replaced. */
export function getNavigatorTypeOwnerScopeKey(owner: NavigatorTypeProviderOwner | null): string | null {
    return owner ? `${owner.providerId}\u0000${owner.instanceId}\u0000${owner.collectionId}` : null;
}

/** Adds the owner's row revision so invalidation starts exactly one new query. */
export function getNavigatorTypeOwnerQueryKey(owner: NavigatorTypeProviderOwner | null): string | null {
    const scopeKey = getNavigatorTypeOwnerScopeKey(owner);
    return scopeKey ? `${scopeKey}\u0000${owner?.revision ?? 0}` : null;
}

/** Prevents a new async scope from being rendered as a settled empty collection. */
export function resolveNavigatorTypeRowsForRender(
    result: NavigatorTypeRowsResult,
    scopeKey: string | null,
    hasOwner: boolean
): NavigatorTypeRowsResult {
    if (!hasOwner || !scopeKey) {
        return { scopeKey: null, status: 'idle', rows: [] };
    }
    return result.scopeKey === scopeKey ? result : { scopeKey, status: 'loading', rows: [] };
}

export function useNavigatorTypeRows({
    api,
    selectedType,
    searchQuery,
    allowedVaultFilePaths,
    catalogRevision
}: UseNavigatorTypeRowsParams): NavigatorTypeRowsResult {
    const types = api?.[INTERNAL_NOTEBOOK_NAVIGATOR_API].types ?? null;
    const owner = useMemo(() => {
        void catalogRevision;
        return selectedType ? (types?.getProviderOwner(selectedType) ?? null) : null;
    }, [catalogRevision, selectedType, types]);
    const ownerScopeKey = getNavigatorTypeOwnerScopeKey(owner);
    const ownerQueryKey = getNavigatorTypeOwnerQueryKey(owner);
    const ownerProviderId = owner?.providerId ?? null;
    const scopeKey = useMemo(() => {
        if (!ownerScopeKey || !selectedType) {
            return null;
        }
        return `${ownerScopeKey}\u0000${selectedType}\u0000${searchQuery}\u0000${allowedVaultFilePaths.join('\u0000')}`;
    }, [allowedVaultFilePaths, ownerScopeKey, searchQuery, selectedType]);
    const [result, setResult] = useState<NavigatorTypeRowsResult>({ scopeKey: null, status: 'idle', rows: [] });

    useEffect(() => {
        if (!ownerQueryKey || !selectedType || !scopeKey) {
            const emptyResult: NavigatorTypeRowsResult = { scopeKey: null, status: 'idle', rows: [] };
            setResult(emptyResult);
            return;
        }

        let cancelled = false;
        const abortController = new AbortController();
        setResult(current => (current.scopeKey === scopeKey ? current : { scopeKey, status: 'loading', rows: [] }));
        void types
            ?.queryProviderRows(selectedType, {
                searchQuery,
                allowedVaultFilePaths,
                signal: abortController.signal
            })
            .then(rows => {
                if (cancelled || abortController.signal.aborted) {
                    return;
                }
                const nextResult: NavigatorTypeRowsResult = { scopeKey, status: 'ready', rows };
                setResult(nextResult);
            })
            .catch(error => {
                if (cancelled) {
                    return;
                }
                console.warn('[TPS Notebook Navigator] Type provider row query failed', {
                    providerId: ownerProviderId,
                    typeId: selectedType,
                    error: error instanceof Error ? error.message : String(error)
                });
                const nextResult: NavigatorTypeRowsResult = { scopeKey, status: 'error', rows: [] };
                setResult(nextResult);
            });

        return () => {
            cancelled = true;
            abortController.abort();
        };
    }, [allowedVaultFilePaths, ownerProviderId, ownerQueryKey, scopeKey, searchQuery, selectedType, types]);

    return resolveNavigatorTypeRowsForRender(result, scopeKey, ownerQueryKey !== null);
}
