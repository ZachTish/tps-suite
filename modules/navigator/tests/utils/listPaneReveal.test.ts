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
import { createTestTFile } from '../utils/createTestTFile';
import { revealFileFromListUserAction } from '../../src/utils/listPaneReveal';

describe('revealFileFromListUserAction', () => {
    it('resets search only after a successful explicit list reveal', () => {
        const file = createTestTFile('Projects/Note.md');
        const revealFileInActualFolder = vi.fn(() => true);
        let helperReturned = false;
        const onResetSearchForNavigation = vi.fn(() => {
            expect(helperReturned).toBe(false);
        });

        expect(revealFileFromListUserAction({ file, revealFileInActualFolder, onResetSearchForNavigation })).toBe(true);
        helperReturned = true;
        expect(revealFileInActualFolder).toHaveBeenCalledWith(file, { showHiddenFileNotice: true });
        expect(revealFileInActualFolder.mock.invocationCallOrder[0]).toBeLessThan(onResetSearchForNavigation.mock.invocationCallOrder[0]);
    });

    it('preserves search when the explicit list reveal fails', () => {
        const file = createTestTFile('Hidden/Note.md');
        const revealFileInActualFolder = vi.fn(() => false);
        const onResetSearchForNavigation = vi.fn();

        expect(revealFileFromListUserAction({ file, revealFileInActualFolder, onResetSearchForNavigation })).toBe(false);
        expect(revealFileInActualFolder).toHaveBeenCalledOnce();
        expect(onResetSearchForNavigation).not.toHaveBeenCalled();
    });
});
