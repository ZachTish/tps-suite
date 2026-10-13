/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { App } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { openTagNoteFile, revealTagNoteInNavigator } from '../../src/utils/tagNoteNavigation';
import { createTestTFile } from './createTestTFile';

describe('tag note navigation', () => {
    it('reveals a tag note while preserving its tag scope', () => {
        const dispatch = vi.fn();
        const tagNote = createTestTFile('Topics/Project.md');

        revealTagNoteInNavigator(dispatch, tagNote, 'work/project');

        expect(dispatch).toHaveBeenCalledWith({
            type: 'REVEAL_FILE',
            file: tagNote,
            targetTag: 'work/project',
            source: 'manual'
        });
    });

    it('delegates right-sidebar opens to the shared companion-leaf callback', async () => {
        const app = new App();
        const tagNote = createTestTFile('Topics/Project.md');
        const openInRightSidebar = vi.fn(async () => undefined);
        Object.assign(app, {
            workspace: {
                getRightLeaf: vi.fn(() => {
                    throw new Error('fallback should not run');
                })
            }
        });

        await openTagNoteFile({
            app,
            commandQueue: null,
            tagNote,
            context: 'right-sidebar',
            openInRightSidebar
        });

        expect(openInRightSidebar).toHaveBeenCalledWith(tagNote);
    });
});
