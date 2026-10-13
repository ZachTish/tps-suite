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
import { getResetAwareFileMenuOptions } from '../../../src/utils/contextMenu/resetAwareFileMenuOptions';

describe('getResetAwareFileMenuOptions', () => {
    it('preserves the local reveal and reset pair for converted list and folder-note menus', () => {
        const onRevealFileInActualFolder = vi.fn(() => true);
        const onResetSearchForNavigation = vi.fn();

        expect(getResetAwareFileMenuOptions({ onRevealFileInActualFolder, onResetSearchForNavigation })).toEqual({
            onRevealFileInActualFolder,
            onResetSearchForNavigation
        });
    });

    it('does not create a partially reset-aware file menu', () => {
        expect(getResetAwareFileMenuOptions()).toBeUndefined();
        expect(getResetAwareFileMenuOptions({ onResetSearchForNavigation: vi.fn() })).toBeUndefined();
    });
});
