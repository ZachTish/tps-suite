/* TPS Notebook Navigator - callback-free identities for transient row selection. */

import type { NavigatorRowFocusTarget } from '../../api/types';
import type { SelectedNavigatorRow } from '../../context/selection/types';
import type { NavigatorProvidedRow } from './types';

export function getNavigatorRowSelectionKey(row: Pick<SelectedNavigatorRow, 'providerId' | 'rowId'>): string {
    return `${row.providerId}\u0000${row.rowId}`;
}

export function createSelectedNavigatorRow(row: NavigatorProvidedRow, typeId: string | null): SelectedNavigatorRow {
    return Object.freeze({
        providerId: row.providerId,
        rowId: row.id,
        kind: row.kind,
        label: row.label,
        sourcePath: row.sourcePath,
        ...(row.sourceLineNumber === undefined ? {} : { sourceLineNumber: row.sourceLineNumber }),
        typeId
    });
}

export function isValidNavigatorRowFocusTarget(target: unknown): target is NavigatorRowFocusTarget {
    if (!target || typeof target !== 'object') {
        return false;
    }
    const candidate = target as Partial<NavigatorRowFocusTarget>;
    return (
        typeof candidate.providerId === 'string' &&
        candidate.providerId.length > 0 &&
        typeof candidate.rowId === 'string' &&
        candidate.rowId.length > 0 &&
        typeof candidate.sourcePath === 'string' &&
        candidate.sourcePath.length > 0 &&
        (candidate.sourceLineNumber === undefined ||
            (Number.isInteger(candidate.sourceLineNumber) && (candidate.sourceLineNumber ?? -1) >= 0)) &&
        (candidate.typeId === undefined || candidate.typeId === null || typeof candidate.typeId === 'string') &&
        (candidate.kind === undefined || typeof candidate.kind === 'string')
    );
}

export function matchesNavigatorRowFocusTarget(row: NavigatorProvidedRow, typeId: string | null, target: NavigatorRowFocusTarget): boolean {
    if (!isValidNavigatorRowFocusTarget(target)) {
        return false;
    }

    if (row.providerId !== target.providerId || row.id !== target.rowId || row.sourcePath !== target.sourcePath) {
        return false;
    }
    if (target.sourceLineNumber !== undefined && row.sourceLineNumber !== target.sourceLineNumber) {
        return false;
    }
    if (target.typeId !== undefined && typeId !== target.typeId) {
        return false;
    }
    return target.kind === undefined || row.kind === target.kind;
}

export function areSelectedNavigatorRowsEqual(left: SelectedNavigatorRow, right: SelectedNavigatorRow): boolean {
    return (
        left.providerId === right.providerId &&
        left.rowId === right.rowId &&
        left.kind === right.kind &&
        left.label === right.label &&
        left.sourcePath === right.sourcePath &&
        left.sourceLineNumber === right.sourceLineNumber &&
        left.typeId === right.typeId
    );
}
