/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, it, vi } from 'vitest';
import { TFolder } from 'obsidian';
import { SelectionAPI } from '../../src/api/modules/SelectionAPI';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { buildPropertyValueNodeId, normalizePropertyTreeValuePath } from '../../src/utils/propertyTree';
import { createTestTFile } from '../utils/createTestTFile';

function createSelectionHarness(filePaths: readonly string[] = []) {
    const files = new Map(filePaths.map(path => [path, createTestTFile(path)]));
    const trigger = vi.fn<(event: string, payload?: object) => void>();
    const selectionAPI = new SelectionAPI({
        app: {
            vault: {
                getFolderByPath: () => null,
                getFileByPath: (path: string) => files.get(path) ?? null
            }
        },
        getPlugin: () => ({
            settings: structuredClone(DEFAULT_SETTINGS)
        }),
        trigger
    } as never);

    return { files, selectionAPI, trigger };
}

function createSelectionAPI(): SelectionAPI {
    return createSelectionHarness().selectionAPI;
}

describe('SelectionAPI', () => {
    it('adds a type discriminator to NavItem results', () => {
        const selectionAPI = createSelectionAPI();
        const folder = new TFolder();
        folder.path = 'Folder';

        expect(selectionAPI.getNavItem()).toEqual({
            type: 'none',
            folder: null,
            tag: null,
            property: null
        });

        selectionAPI.updateNavigationState(folder, null, null);
        expect(selectionAPI.getNavItem()).toEqual({
            type: 'folder',
            folder,
            tag: null,
            property: null
        });

        selectionAPI.updateNavigationState(null, 'work', null);
        expect(selectionAPI.getNavItem()).toEqual({
            type: 'tag',
            folder: null,
            tag: 'work',
            property: null
        });

        selectionAPI.updateNavigationState(null, null, 'key:status');
        expect(selectionAPI.getNavItem()).toEqual({
            type: 'property',
            folder: null,
            tag: null,
            property: 'key:status'
        });

        selectionAPI.updateNavigationState(null, null, null, 'structural:task');
        expect(selectionAPI.getNavItem()).toEqual({
            type: 'type',
            folder: null,
            tag: null,
            property: null,
            navigatorType: 'structural:task'
        });
    });

    it('normalizes property navigation ids before storing navigation state', () => {
        const selectionAPI = createSelectionAPI();

        selectionAPI.updateNavigationState(null, null, 'key:Re\u0301union=Planifie\u0301');

        expect(selectionAPI.getNavItem()).toEqual({
            type: 'property',
            folder: null,
            tag: null,
            property: buildPropertyValueNodeId('réunion', normalizePropertyTreeValuePath('Planifié'))
        });
    });

    it('normalizes tag navigation ids before storing navigation state', () => {
        const selectionAPI = createSelectionAPI();

        selectionAPI.updateNavigationState(null, '#re\u0301union/notes', null);

        expect(selectionAPI.getNavItem()).toEqual({
            type: 'tag',
            folder: null,
            tag: 'réunion/notes',
            property: null
        });
    });

    it('publishes one immutable row selection and makes native file selection exclusive', () => {
        const path = 'Inbox/Tasks.md';
        const { files, selectionAPI, trigger } = createSelectionHarness([path]);
        const row = {
            providerId: 'tps/tasks',
            rowId: 'task-12',
            kind: 'tps/task',
            label: 'Review provider contract',
            sourcePath: path,
            sourceLineNumber: 11,
            typeId: 'structural:task'
        };

        selectionAPI.updateRowState(row);
        const current = selectionAPI.getCurrentRow();

        expect(current).toMatchObject(row);
        expect(current?.file).toBe(files.get(path));
        expect(Object.isFrozen(current)).toBe(true);
        expect(trigger).toHaveBeenCalledWith('row-selection-changed', { row: current });
        const eventPayload = trigger.mock.calls.find(([event]) => event === 'row-selection-changed')?.[1];
        expect(Object.isFrozen(eventPayload)).toBe(true);

        selectionAPI.updateRowState(row);
        expect(trigger.mock.calls.filter(([event]) => event === 'row-selection-changed')).toHaveLength(1);

        selectionAPI.updateFileState(new Set([path]), files.get(path) ?? null);
        expect(selectionAPI.getCurrentRow()).toBeNull();
        expect(trigger.mock.calls.filter(([event]) => event === 'row-selection-changed')).toHaveLength(2);
        expect(trigger).toHaveBeenCalledWith('row-selection-changed', { row: null });
    });

    it('keeps one row-event listener from replacing the payload seen by the next listener', () => {
        const path = 'Inbox/Tasks.md';
        const file = createTestTFile(path);
        const observed: unknown[] = [];
        const listeners = [
            (payload: { row: unknown }) => {
                expect(() => {
                    payload.row = null;
                }).toThrow(TypeError);
            },
            (payload: { row: unknown }) => observed.push(payload.row)
        ];
        const selectionAPI = new SelectionAPI({
            app: {
                vault: {
                    getFolderByPath: () => null,
                    getFileByPath: (candidate: string) => (candidate === path ? file : null)
                }
            },
            getPlugin: () => ({ settings: structuredClone(DEFAULT_SETTINGS) }),
            trigger: (event: string, payload: { row: unknown }) => {
                if (event === 'row-selection-changed') {
                    listeners.forEach(listener => listener(payload));
                }
            }
        } as never);

        selectionAPI.updateRowState({
            providerId: 'tps/tasks',
            rowId: 'task-12',
            kind: 'tps/task',
            label: 'Review provider contract',
            sourcePath: path,
            typeId: null
        });

        expect(observed).toHaveLength(1);
        expect(observed[0]).toMatchObject({ providerId: 'tps/tasks', rowId: 'task-12' });
    });

    it('clears the row event when navigation scope changes and ignores a stale source', () => {
        const path = 'Inbox/Tasks.md';
        const { files, selectionAPI, trigger } = createSelectionHarness([path]);
        const row = {
            providerId: 'tps/tasks',
            rowId: 'task-12',
            kind: 'tps/task',
            label: 'Review provider contract',
            sourcePath: path,
            typeId: null
        };

        selectionAPI.updateRowState(row);
        selectionAPI.updateNavigationState(null, null, null, 'structural:task');
        expect(selectionAPI.getCurrentRow()).toBeNull();
        expect(trigger).toHaveBeenCalledWith('row-selection-changed', { row: null });

        files.delete(path);
        trigger.mockClear();
        selectionAPI.updateRowState(row);
        expect(selectionAPI.getCurrentRow()).toBeNull();
        expect(trigger).not.toHaveBeenCalled();
    });

    it('clears transient row state on disposal', () => {
        const path = 'Inbox/Tasks.md';
        const { selectionAPI, trigger } = createSelectionHarness([path]);
        selectionAPI.updateRowState({
            providerId: 'tps/tasks',
            rowId: 'task-12',
            kind: 'tps/task',
            label: 'Review provider contract',
            sourcePath: path,
            typeId: null
        });

        trigger.mockClear();
        selectionAPI.dispose();

        expect(selectionAPI.getCurrentRow()).toBeNull();
        expect(trigger).toHaveBeenCalledOnce();
        expect(trigger).toHaveBeenCalledWith('row-selection-changed', { row: null });
    });
});
