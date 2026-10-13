/* TPS Notebook Navigator - provider-row identity and focus guards. */

import { describe, expect, it, vi } from 'vitest';
import type { NavigatorProvidedRow } from '../../src/services/rows/types';
import {
    areSelectedNavigatorRowsEqual,
    createSelectedNavigatorRow,
    getNavigatorRowSelectionKey,
    isValidNavigatorRowFocusTarget,
    matchesNavigatorRowFocusTarget
} from '../../src/services/rows/rowSelection';

function createRow(overrides: Partial<NavigatorProvidedRow> = {}): NavigatorProvidedRow {
    return {
        providerId: 'tps/tasks',
        id: 'task-12',
        kind: 'tps/task',
        label: 'Review provider contract',
        sourcePath: 'Inbox/Tasks.md',
        sourceLineNumber: 11,
        activate: vi.fn(),
        ...overrides
    };
}

describe('provider-row selection identity', () => {
    it('creates an immutable callback-free identity', () => {
        const selection = createSelectedNavigatorRow(createRow(), 'structural:task');

        expect(selection).toEqual({
            providerId: 'tps/tasks',
            rowId: 'task-12',
            kind: 'tps/task',
            label: 'Review provider contract',
            sourcePath: 'Inbox/Tasks.md',
            sourceLineNumber: 11,
            typeId: 'structural:task'
        });
        expect(Object.isFrozen(selection)).toBe(true);
        expect('activate' in selection).toBe(false);
        expect(getNavigatorRowSelectionKey(selection)).toBe('tps/tasks\u0000task-12');
    });

    it('requires a complete source-backed focus identity', () => {
        expect(isValidNavigatorRowFocusTarget({ providerId: 'tps/tasks', rowId: 'task-12', sourcePath: 'Inbox/Tasks.md' })).toBe(true);
        expect(isValidNavigatorRowFocusTarget({ providerId: '', rowId: 'task-12', sourcePath: 'Inbox/Tasks.md' })).toBe(false);
        expect(isValidNavigatorRowFocusTarget({ providerId: 'tps/tasks', rowId: '', sourcePath: 'Inbox/Tasks.md' })).toBe(false);
        expect(isValidNavigatorRowFocusTarget({ providerId: 'tps/tasks', rowId: 'task-12', sourcePath: '' })).toBe(false);
        expect(
            isValidNavigatorRowFocusTarget({
                providerId: 'tps/tasks',
                rowId: 'task-12',
                sourcePath: 'Inbox/Tasks.md',
                sourceLineNumber: -1
            })
        ).toBe(false);
    });

    it('matches the exact current row and honors every optional stale-reference guard', () => {
        const row = createRow();
        const target = {
            providerId: row.providerId,
            rowId: row.id,
            sourcePath: row.sourcePath,
            sourceLineNumber: row.sourceLineNumber,
            typeId: 'structural:task',
            kind: row.kind
        } as const;

        expect(matchesNavigatorRowFocusTarget(row, 'structural:task', target)).toBe(true);
        expect(matchesNavigatorRowFocusTarget(row, 'structural:task', { ...target, sourcePath: 'Inbox/Other.md' })).toBe(false);
        expect(matchesNavigatorRowFocusTarget(row, 'structural:task', { ...target, sourceLineNumber: 12 })).toBe(false);
        expect(matchesNavigatorRowFocusTarget(row, 'kind:project', target)).toBe(false);
        expect(matchesNavigatorRowFocusTarget(row, 'structural:task', { ...target, kind: 'tps/header' })).toBe(false);
    });

    it('treats presentation or source changes as a different immutable selection', () => {
        const current = createSelectedNavigatorRow(createRow(), 'structural:task');
        const same = createSelectedNavigatorRow(createRow(), 'structural:task');
        const renamed = createSelectedNavigatorRow(createRow({ label: 'Renamed task' }), 'structural:task');

        expect(areSelectedNavigatorRowsEqual(current, same)).toBe(true);
        expect(areSelectedNavigatorRowsEqual(current, renamed)).toBe(false);
    });
});
