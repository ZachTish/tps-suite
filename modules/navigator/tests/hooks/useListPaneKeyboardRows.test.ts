/* TPS Notebook Navigator - provider rows in list keyboard navigation. */

import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import {
    getListPaneKeyboardSelectionIndex,
    isSelectableListItem,
    requestProviderRowKeyboardActivation
} from '../../src/hooks/useListPaneKeyboard';
import type { NavigatorProvidedRow } from '../../src/services/rows/types';
import { getNavigatorRowSelectionKey } from '../../src/services/rows/rowSelection';
import { ListPaneItemType } from '../../src/types';
import type { ListPaneItem } from '../../src/types/virtualization';

function createProviderRow(overrides: Partial<NavigatorProvidedRow> = {}): NavigatorProvidedRow {
    return {
        providerId: 'tps/tasks',
        id: 'task-12',
        kind: 'tps/task',
        label: 'Review provider contract',
        sourcePath: 'Inbox/Tasks.md',
        ...overrides
    };
}

describe('provider-row list keyboard behavior', () => {
    it('includes provider rows in the same Arrow/Home/End selectable sequence as files', () => {
        const file = new TFile();
        file.path = 'Inbox/Tasks.md';
        const providerRow = createProviderRow();
        const items: ListPaneItem[] = [
            { type: ListPaneItemType.HEADER, data: 'Tasks', key: 'header' },
            { type: ListPaneItemType.FILE, data: file, key: 'file' },
            { type: ListPaneItemType.PROVIDER_ROW, data: providerRow, key: 'row' }
        ];

        expect(items.map(isSelectableListItem)).toEqual([false, true, true]);
        expect(getListPaneKeyboardSelectionIndex(items, new Map([[file.path, 1]]), file.path, null)).toBe(1);
        expect(
            getListPaneKeyboardSelectionIndex(
                items,
                new Map([[file.path, 1]]),
                null,
                getNavigatorRowSelectionKey({ providerId: providerRow.providerId, rowId: providerRow.id })
            )
        ).toBe(2);
    });

    it('runs Enter activation exactly once and leaves display-only rows inert', () => {
        const activate = vi.fn();
        const onError = vi.fn();

        expect(requestProviderRowKeyboardActivation(createProviderRow({ activate }), onError)).toBe(true);
        expect(activate).toHaveBeenCalledOnce();
        expect(onError).not.toHaveBeenCalled();

        expect(requestProviderRowKeyboardActivation(createProviderRow(), onError)).toBe(false);
        expect(activate).toHaveBeenCalledOnce();
    });

    it('reports synchronous activation errors without invoking the provider twice', () => {
        const failure = new Error('failed');
        const activate = vi.fn(() => {
            throw failure;
        });
        const onError = vi.fn();

        expect(requestProviderRowKeyboardActivation(createProviderRow({ activate }), onError)).toBe(true);
        expect(activate).toHaveBeenCalledOnce();
        expect(onError).toHaveBeenCalledWith(failure);
    });
});
