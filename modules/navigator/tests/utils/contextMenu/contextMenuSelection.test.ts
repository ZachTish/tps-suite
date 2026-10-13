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
import { selectContextMenuTarget } from '../../../src/utils/contextMenu/contextMenuSelection';

describe('selectContextMenuTarget', () => {
    it('synchronously resets search before selecting a different context-menu target', () => {
        const onResetSearchForNavigation = vi.fn();
        const onSelect = vi.fn();

        expect(selectContextMenuTarget({ isSelected: false, onResetSearchForNavigation, onSelect })).toBe(true);
        expect(onResetSearchForNavigation).toHaveBeenCalledOnce();
        expect(onResetSearchForNavigation.mock.invocationCallOrder[0]).toBeLessThan(onSelect.mock.invocationCallOrder[0]);
    });

    it('preserves search when the context-menu target is already selected', () => {
        const onResetSearchForNavigation = vi.fn();
        const onSelect = vi.fn();

        expect(selectContextMenuTarget({ isSelected: true, onResetSearchForNavigation, onSelect })).toBe(false);
        expect(onResetSearchForNavigation).not.toHaveBeenCalled();
        expect(onSelect).not.toHaveBeenCalled();
    });
});
