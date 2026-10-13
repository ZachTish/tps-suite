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

import type { App, TFile, WorkspaceLeaf } from 'obsidian';
import type { SelectionDispatch } from '../context/selection/types';
import type { CommandQueueService } from '../services/CommandQueueService';
import type { FolderNoteOpenContext } from './folderNotes';
import { openFileInContext } from './openFileInContext';

interface OpenTagNoteFileParams {
    app: App;
    commandQueue: CommandQueueService | null;
    tagNote: TFile;
    context: FolderNoteOpenContext;
    active?: boolean;
    openInRightSidebar?: (tagNote: TFile) => Promise<void>;
}

/** Selects a tag note through the same explicit-reveal path used by linked folder notes. */
export function revealTagNoteInNavigator(selectionDispatch: SelectionDispatch, tagNote: TFile, tagPath: string): void {
    selectionDispatch({
        type: 'REVEAL_FILE',
        file: tagNote,
        targetTag: tagPath,
        source: 'manual'
    });
}

/** Opens a linked tag note in the configured folder-note destination. */
export async function openTagNoteFile({
    app,
    commandQueue,
    tagNote,
    context,
    active = true,
    openInRightSidebar
}: OpenTagNoteFileParams): Promise<void> {
    if (context === 'right-sidebar') {
        if (openInRightSidebar) {
            await openInRightSidebar(tagNote);
            return;
        }

        const leaf = app.workspace.getRightLeaf(true) ?? app.workspace.getRightLeaf(false);
        if (!leaf) {
            return;
        }
        await leaf.openFile(tagNote, { active: false });
        await app.workspace.revealLeaf(leaf);
        return;
    }

    if (context) {
        await openFileInContext({ app, commandQueue, file: tagNote, context, active });
        return;
    }

    const getLeaf = () => app.workspace.getLeaf(false);
    const openFile = async (leaf: WorkspaceLeaf | null) => {
        if (leaf) {
            await leaf.openFile(tagNote, { active });
        }
    };

    if (commandQueue) {
        await commandQueue.executeOpenActiveFile(tagNote, openFile, { active, getLeaf });
        return;
    }

    await openFile(getLeaf());
}
