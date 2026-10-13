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

import { App, type CachedMetadata, type TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import type { TagTreeNode } from '../../src/types/storage';
import {
    createTagNoteIndex,
    getTagNote,
    getTagNoteForNode,
    resolveTagNote,
    resolveTagNoteBasename,
    resolveTagNoteForNode
} from '../../src/utils/tagNotes';
import { createTestTFile } from '../utils/createTestTFile';

function installFiles(app: App, entries: Array<{ path: string; tags?: string[] }>): Map<string, TFile> {
    const metadata = new Map<string, CachedMetadata>();
    const files = new Map<string, TFile>();

    for (const entry of entries) {
        const file = createTestTFile(entry.path);
        (app.vault as unknown as { registerFile: (target: TFile) => void }).registerFile(file);
        files.set(file.path, file);
        metadata.set(file.path, { frontmatter: entry.tags ? { tags: entry.tags } : {} });
    }

    app.metadataCache.getFileCache = file => metadata.get(file.path) ?? null;
    return files;
}

function createTagNode(overrides: Partial<TagTreeNode> = {}): TagTreeNode {
    return {
        name: 'Active',
        path: 'projects/active',
        displayPath: 'Projects/Active',
        children: new Map(),
        notesWithTag: new Set(),
        ...overrides
    };
}

describe('tag notes', () => {
    it('derives the basename from the final display-tag segment', () => {
        expect(resolveTagNoteBasename('#Projects/Active')).toBe('Active');
        expect(resolveTagNoteBasename('Reading')).toBe('Reading');
        expect(resolveTagNoteBasename('')).toBeNull();
        expect(resolveTagNoteBasename('Projects/')).toBeNull();
    });

    it('finds the unique Markdown note whose basename and exact full tag match', () => {
        const app = new App();
        const files = installFiles(app, [
            { path: 'Indexes/active.md', tags: ['Projects/Active'] },
            { path: 'Other/Active.md', tags: ['Projects'] },
            { path: 'Elsewhere/Active.md', tags: ['Projects/Active/Next'] },
            { path: 'Wrong.md', tags: ['Projects/Active'] }
        ]);

        const result = resolveTagNote(app, 'projects/active', 'Projects/Active');

        expect(result).toMatchObject({
            status: 'found',
            normalizedTagPath: 'projects/active',
            displayTagPath: 'Projects/Active',
            basename: 'Active',
            file: files.get('Indexes/active.md')
        });
        expect(result.matches).toEqual([files.get('Indexes/active.md')]);
        expect(getTagNote(app, '#PROJECTS/ACTIVE', 'Projects/Active')).toBe(files.get('Indexes/active.md'));
    });

    it('requires an exact full-tag membership rather than an ancestor or descendant', () => {
        const app = new App();
        installFiles(app, [
            { path: 'One/Active.md', tags: ['projects'] },
            { path: 'Two/Active.md', tags: ['projects/active/next'] }
        ]);

        expect(resolveTagNote(app, 'projects/active', 'Projects/Active')).toMatchObject({
            status: 'missing',
            matches: [],
            file: null
        });
    });

    it('fails closed when more than one exact matching note exists', () => {
        const app = new App();
        const files = installFiles(app, [
            { path: 'Zulu/Active.md', tags: ['Projects/Active'] },
            { path: 'Alpha/active.md', tags: ['projects/active'] }
        ]);

        const result = resolveTagNote(app, 'projects/active', 'Projects/Active');

        expect(result.status).toBe('ambiguous');
        expect(result.file).toBeNull();
        expect(result.matches).toEqual([files.get('Alpha/active.md'), files.get('Zulu/Active.md')]);
        expect(getTagNote(app, 'projects/active', 'Projects/Active')).toBeNull();
    });

    it('rejects virtual, malformed, and mismatched display tag paths', () => {
        const app = new App();

        expect(resolveTagNote(app, '__all_tags__')).toMatchObject({ status: 'invalid', normalizedTagPath: null });
        expect(resolveTagNote(app, '__untagged__/child')).toMatchObject({ status: 'invalid', normalizedTagPath: null });
        expect(resolveTagNote(app, 'has spaces')).toMatchObject({ status: 'invalid', normalizedTagPath: null });
        expect(resolveTagNote(app, 'projects/active', 'Projects/Done')).toMatchObject({ status: 'invalid', normalizedTagPath: null });
    });

    it('ignores a non-Markdown candidate even if a vault implementation includes it', () => {
        const app = new App();
        const canvas = createTestTFile('Active.canvas');
        app.vault.getMarkdownFiles = () => [canvas];
        app.metadataCache.getFileCache = () => ({ frontmatter: { tags: ['Projects/Active'] } });

        expect(resolveTagNote(app, 'projects/active', 'Projects/Active').status).toBe('missing');
    });

    it('resolves directly from exact-membership paths on a tag tree node', () => {
        const app = new App();
        const files = installFiles(app, [{ path: 'Indexes/ACTIVE.md' }, { path: 'Indexes/Other.md' }, { path: 'Indexes/Active.canvas' }]);
        const node = createTagNode({ notesWithTag: new Set(files.keys()) });

        const result = resolveTagNoteForNode(app, node);

        expect(result.status).toBe('found');
        expect(result.file).toBe(files.get('Indexes/ACTIVE.md'));
        expect(getTagNoteForNode(app, node)).toBe(files.get('Indexes/ACTIVE.md'));
    });

    it('uses the shared all-vault index for a match outside the rendered tag-node scope', () => {
        const app = new App();
        const files = installFiles(app, [{ path: 'Excluded/Active.md', tags: ['Projects/Active'] }]);
        const node = createTagNode({ notesWithTag: new Set() });

        expect(getTagNoteForNode(app, node, createTagNoteIndex(app))).toBe(files.get('Excluded/Active.md'));
    });

    it('indexes only tag memberships whose final segment can match the note basename', () => {
        const app = new App();
        installFiles(app, [
            {
                path: 'Excluded/Active.md',
                tags: ['Projects/Active', 'Projects', 'Projects/Done', 'PROJECTS/ACTIVE']
            },
            { path: 'Hidden/Wrong.md', tags: ['Projects/Active'] }
        ]);

        const index = createTagNoteIndex(app);

        expect(index.matchesByTagAndBasename.size).toBe(1);
        expect(resolveTagNoteForNode(app, createTagNode({ notesWithTag: new Set() }), index)).toMatchObject({
            status: 'found',
            file: app.vault.getFileByPath('Excluded/Active.md')
        });
    });

    it('reports direct node matches as ambiguous and rejects virtual nodes', () => {
        const app = new App();
        const files = installFiles(app, [{ path: 'A/Active.md' }, { path: 'B/active.md' }]);
        const node = createTagNode({ notesWithTag: new Set(files.keys()) });

        expect(resolveTagNoteForNode(app, node)).toMatchObject({ status: 'ambiguous', file: null });
        expect(
            resolveTagNoteForNode(
                app,
                createTagNode({ name: 'Tags', path: '__all_tags__', displayPath: '__all_tags__', notesWithTag: new Set() })
            )
        ).toMatchObject({ status: 'invalid', file: null });
    });
});
