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
import { revealFileFromFileMenu } from '../../../src/utils/contextMenu/fileMenuReveal';
import { createTestTFile } from '../createTestTFile';

type RevealPlugin = Parameters<typeof revealFileFromFileMenu>[0]['plugin'];

function createRevealPlugin(): RevealPlugin {
    return {
        activateView: vi.fn(async () => undefined),
        revealFileInActualFolder: vi.fn(async () => undefined)
    } as unknown as RevealPlugin;
}

describe('revealFileFromFileMenu', () => {
    it('resets list search after a successful file-menu reveal', async () => {
        const file = createTestTFile('Projects/Note.md');
        const plugin = createRevealPlugin();
        const onRevealFileInActualFolder = vi.fn(() => true);
        const onResetSearchForNavigation = vi.fn();

        await revealFileFromFileMenu({
            file,
            plugin,
            options: { onRevealFileInActualFolder, onResetSearchForNavigation }
        });

        expect(plugin.activateView).not.toHaveBeenCalled();
        expect(onRevealFileInActualFolder).toHaveBeenCalledWith(file, { showHiddenFileNotice: true });
        expect(onResetSearchForNavigation).toHaveBeenCalledOnce();
        expect(plugin.revealFileInActualFolder).not.toHaveBeenCalled();
    });

    it('preserves list search when a file-menu reveal fails', async () => {
        const file = createTestTFile('Hidden/Note.md');
        const plugin = createRevealPlugin();
        const onRevealFileInActualFolder = vi.fn(() => false);
        const onResetSearchForNavigation = vi.fn();

        await revealFileFromFileMenu({
            file,
            plugin,
            options: { onRevealFileInActualFolder, onResetSearchForNavigation }
        });

        expect(onResetSearchForNavigation).not.toHaveBeenCalled();
        expect(plugin.activateView).not.toHaveBeenCalled();
        expect(plugin.revealFileInActualFolder).not.toHaveBeenCalled();
    });

    it('keeps non-list file-menu reveals on the existing plugin path', async () => {
        const file = createTestTFile('Projects/Note.md');
        const plugin = createRevealPlugin();

        await revealFileFromFileMenu({ file, plugin });

        expect(plugin.activateView).toHaveBeenCalledOnce();
        expect(plugin.revealFileInActualFolder).toHaveBeenCalledWith(file, { showHiddenFileNotice: true });
    });
});
