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

import { TFolder } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { activateListPaneBreadcrumb } from '../../src/components/ListPaneHeader';
import { buildPropertyKeyNodeId } from '../../src/utils/propertyTree';

describe('ListPaneHeader breadcrumb navigation', () => {
    it('resets search before valid folder, tag, and property ancestor selections', () => {
        const folder = new TFolder('Projects');
        const selectionDispatch = vi.fn();
        const onResetSearchForNavigation = vi.fn();
        const environment = {
            getFolderByPath: vi.fn((path: string) => (path === folder.path ? folder : null)),
            selectionDispatch,
            onResetSearchForNavigation
        };

        expect(
            activateListPaneBreadcrumb({ label: 'Projects', targetType: 'folder', targetPath: folder.path, isLast: false }, environment)
        ).toBe(true);
        expect(selectionDispatch).toHaveBeenLastCalledWith({ type: 'SET_SELECTED_FOLDER', folder });

        expect(activateListPaneBreadcrumb({ label: 'Work', targetType: 'tag', targetPath: '#work', isLast: false }, environment)).toBe(
            true
        );
        expect(selectionDispatch).toHaveBeenLastCalledWith({ type: 'SET_SELECTED_TAG', tag: 'work' });

        const propertyNodeId = buildPropertyKeyNodeId('status');
        expect(
            activateListPaneBreadcrumb({ label: 'Status', targetType: 'property', targetPath: propertyNodeId, isLast: false }, environment)
        ).toBe(true);
        expect(selectionDispatch).toHaveBeenLastCalledWith({ type: 'SET_SELECTED_PROPERTY', nodeId: propertyNodeId });
        expect(onResetSearchForNavigation).toHaveBeenCalledTimes(3);
        expect(onResetSearchForNavigation.mock.invocationCallOrder[0]).toBeLessThan(selectionDispatch.mock.invocationCallOrder[0]);
    });

    it('preserves search when a folder ancestor no longer resolves', () => {
        const selectionDispatch = vi.fn();
        const onResetSearchForNavigation = vi.fn();

        expect(
            activateListPaneBreadcrumb(
                { label: 'Missing', targetType: 'folder', targetPath: 'Missing', isLast: false },
                {
                    getFolderByPath: () => null,
                    selectionDispatch,
                    onResetSearchForNavigation
                }
            )
        ).toBe(false);
        expect(onResetSearchForNavigation).not.toHaveBeenCalled();
        expect(selectionDispatch).not.toHaveBeenCalled();
    });
});
