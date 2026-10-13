/*
 * TPS Notebook Navigator - React lifecycle for optional navigator row providers.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { INTERNAL_NOTEBOOK_NAVIGATOR_API, type NotebookNavigatorAPI } from '../api/NotebookNavigatorAPI';
import type { NavigatorRowProviderRegistry } from '../services/rows/NavigatorRowProviderRegistry';
import {
    composeProviderRows,
    NAVIGATOR_ROW_PROVIDER_MAX_ROWS,
    type NavigatorProviderRowsSnapshot
} from '../services/rows/composeProviderRows';
import type {
    NavigatorProvidedRow,
    NavigatorRowProviderContext,
    NavigatorRowProviderSelection,
    NavigatorRowScope
} from '../services/rows/types';
import { resolveNavigatorRowProvidersForScope } from '../services/rows/providerScope';

interface UseProviderRowsParams {
    app: App;
    registry: NavigatorRowProviderRegistry;
    scope: NavigatorRowScope;
    selection: NavigatorRowProviderSelection;
}

interface ProviderRowsResult {
    scope: NavigatorRowScope | null;
    selection: NavigatorRowProviderSelection | null;
    revision: number;
    rows: NavigatorProvidedRow[];
}

interface ActiveProviderRowsQuery {
    scope: NavigatorRowScope;
    selection: NavigatorRowProviderSelection;
    revision: number;
}

const EMPTY_EXTERNAL_ROW_PROVIDER_SELECTION: NavigatorRowProviderSelection = Object.freeze({
    enabledProviderIds: Object.freeze([]),
    optionsByProviderId: Object.freeze({})
});

/** Subscribes a list pane to complete public provider activation state. */
export function useExternalRowProviderSelection(api: NotebookNavigatorAPI | null): NavigatorRowProviderSelection {
    const rows = api?.[INTERNAL_NOTEBOOK_NAVIGATOR_API].rows ?? null;
    const subscribe = useCallback((listener: () => void) => rows?.subscribe(listener) ?? (() => undefined), [rows]);
    const getSnapshot = useCallback(() => rows?.getSelection() ?? EMPTY_EXTERNAL_ROW_PROVIDER_SELECTION, [rows]);
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** @internal Keeps a valid scope snapshot visible while only its provider revision refreshes. */
export function resolveProviderRowsForRender(result: ProviderRowsResult, activeQuery: ActiveProviderRowsQuery): NavigatorProvidedRow[] {
    if (result.scope !== activeQuery.scope || result.selection !== activeQuery.selection) {
        return [];
    }
    return result.rows;
}

function groupRowsByProvider(rows: readonly NavigatorProvidedRow[]): Map<string, readonly NavigatorProvidedRow[]> {
    const grouped = new Map<string, NavigatorProvidedRow[]>();
    for (const row of rows) {
        const providerRows = grouped.get(row.providerId);
        if (providerRows) {
            providerRows.push(row);
        } else {
            grouped.set(row.providerId, [row]);
        }
    }
    return grouped;
}

/**
 * Creates one refresh-local resolver. Until a provider settles, its prior rows
 * remain visible; a settled provider replaces them immediately, including with
 * an empty result. Every snapshot is recomposed in current provider order.
 */
export function createProviderRowsRefreshResolver(
    baselineRows: readonly NavigatorProvidedRow[]
): (snapshot: NavigatorProviderRowsSnapshot) => NavigatorProvidedRow[] {
    const baselineByProvider = groupRowsByProvider(baselineRows);

    return snapshot => {
        const settledProviderIds = new Set(snapshot.settledProviderIds);
        const freshByProvider = groupRowsByProvider(snapshot.rows);
        const rows: NavigatorProvidedRow[] = [];

        for (const providerId of snapshot.providerIds) {
            const providerRows = settledProviderIds.has(providerId)
                ? (freshByProvider.get(providerId) ?? [])
                : (baselineByProvider.get(providerId) ?? []);
            const remaining = NAVIGATOR_ROW_PROVIDER_MAX_ROWS - rows.length;
            if (remaining <= 0) {
                break;
            }
            rows.push(...providerRows.slice(0, remaining));
        }

        return rows;
    };
}

export function useProviderRows({ app, registry, scope, selection }: UseProviderRowsParams): NavigatorProvidedRow[] {
    const [result, setResult] = useState<ProviderRowsResult>({ scope: null, selection: null, revision: -1, rows: [] });
    const resultRef = useRef(result);
    const activeQueryAbortControllerRef = useRef<AbortController | null>(null);
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        resultRef.current = result;
    }, [result]);

    useEffect(() => {
        const context: NavigatorRowProviderContext = { app, scope };
        const cleanups: { providerId: string; cleanup: () => void }[] = [];
        let active = true;

        for (const provider of resolveNavigatorRowProvidersForScope(registry, selection.enabledProviderIds, scope)) {
            try {
                const cleanup = provider.subscribe?.(context, selection.optionsByProviderId?.[provider.id] ?? {}, () => {
                    if (active) {
                        activeQueryAbortControllerRef.current?.abort();
                        setRevision(current => current + 1);
                    }
                });
                if (typeof cleanup === 'function') {
                    cleanups.push({ providerId: provider.id, cleanup });
                }
            } catch {
                console.warn('[TPS Notebook Navigator] Row provider subscription failed', {
                    providerId: provider.id
                });
            }
        }

        return () => {
            active = false;
            cleanups.forEach(({ providerId, cleanup }) => {
                try {
                    cleanup();
                } catch {
                    console.warn('[TPS Notebook Navigator] Row provider cleanup failed', { providerId });
                }
            });
        };
    }, [app, registry, scope, selection]);

    useEffect(() => {
        let cancelled = false;
        let hasPublishedSnapshot = false;
        const abortController = new AbortController();
        activeQueryAbortControllerRef.current = abortController;
        const context: NavigatorRowProviderContext = { app, scope };
        const baselineResult = resultRef.current;
        const resolveSnapshot = createProviderRowsRefreshResolver(
            baselineResult.scope === scope && baselineResult.selection === selection ? baselineResult.rows : []
        );
        const publishRows = (nextRows: NavigatorProvidedRow[]) => {
            if (cancelled || abortController.signal.aborted) {
                return;
            }
            const nextResult = { scope, selection, revision, rows: nextRows };
            resultRef.current = nextResult;
            setResult(current => {
                if (
                    current.scope === scope &&
                    current.selection === selection &&
                    current.revision === revision &&
                    current.rows === nextRows
                ) {
                    return current;
                }
                return nextResult;
            });
        };

        void composeProviderRows({
            registry,
            context,
            signal: abortController.signal,
            selection,
            onFailure: ({ providerId }) => {
                if (!cancelled && !abortController.signal.aborted) {
                    console.warn('[TPS Notebook Navigator] Row provider query failed', { providerId });
                }
            },
            onSnapshot: snapshot => {
                hasPublishedSnapshot = true;
                publishRows(resolveSnapshot(snapshot));
            }
        })
            .then(nextRows => {
                if (!hasPublishedSnapshot) {
                    publishRows(nextRows);
                }
            })
            .catch(() => {
                if (!cancelled && !abortController.signal.aborted) {
                    console.warn('[TPS Notebook Navigator] Row provider composition failed');
                    const emptyResult = { scope, selection, revision, rows: [] };
                    resultRef.current = emptyResult;
                    setResult(emptyResult);
                }
            });

        return () => {
            cancelled = true;
            abortController.abort();
            if (activeQueryAbortControllerRef.current === abortController) {
                activeQueryAbortControllerRef.current = null;
            }
        };
    }, [app, registry, revision, scope, selection]);

    return resolveProviderRowsForRender(result, { scope, selection, revision });
}
