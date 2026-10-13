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

import type { TFile } from 'obsidian';
import type NotebookNavigatorPlugin from '../../main';
import type { FileMenuOptions } from './menuTypes';
import { revealFileFromListUserAction } from '../listPaneReveal';

export async function revealFileFromFileMenu(params: {
    file: TFile;
    plugin: Pick<NotebookNavigatorPlugin, 'activateView' | 'revealFileInActualFolder'>;
    options?: FileMenuOptions;
}): Promise<void> {
    if (params.options?.onRevealFileInActualFolder && params.options.onResetSearchForNavigation) {
        revealFileFromListUserAction({
            file: params.file,
            revealFileInActualFolder: params.options.onRevealFileInActualFolder,
            onResetSearchForNavigation: params.options.onResetSearchForNavigation
        });
        return;
    }

    await params.plugin.activateView();
    await params.plugin.revealFileInActualFolder(params.file, { showHiddenFileNotice: true });
}
