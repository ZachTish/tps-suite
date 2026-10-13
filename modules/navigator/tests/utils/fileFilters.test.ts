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
import { App, TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import { FILE_VISIBILITY } from '../../src/utils/fileTypeUtils';
import {
    createFrontmatterPropertyExclusionMatcher,
    createHiddenFileNameMatcher,
    getFilteredFiles,
    getFilteredIndexableFiles,
    shouldExcludeFileWithMatcher,
    shouldExcludeFileName,
    shouldExcludeFolder
} from '../../src/utils/fileFilters';
import { createTestTFile } from './createTestTFile';

function createSettings(): NotebookNavigatorSettings {
    const profile = DEFAULT_SETTINGS.vaultProfiles[0];
    return {
        ...DEFAULT_SETTINGS,
        vaultProfile: profile.id,
        vaultProfiles: [
            {
                ...profile,
                fileVisibility: FILE_VISIBILITY.ALL,
                hiddenFolders: [],
                hiddenTags: [],
                hiddenFileNames: [],
                hiddenFileTags: [],
                hiddenFileProperties: []
            }
        ]
    };
}

function createAppWithFiles(files: TFile[]): App {
    const app = new App();
    const filesByPath = new Map(files.map(file => [file.path, file]));
    app.vault.getFiles = () => files;
    app.vault.getAbstractFileByPath = (path: string) => filesByPath.get(path) ?? null;
    app.metadataCache.getFileCache = () => null;
    return app;
}

function toPaths(files: TFile[]): string[] {
    return files.map(file => file.path);
}

describe('shouldExcludeFileName', () => {
    it('matches literal names exactly and does not match basenames', () => {
        const file = createTestTFile('cover.md');
        expect(shouldExcludeFileName(file, ['cover'])).toBe(false);
        expect(shouldExcludeFileName(file, ['cover.md'])).toBe(true);
    });

    it('matches wildcard patterns against names with and without extensions', () => {
        const fileWithoutExtension = createTestTFile('cover');
        const fileWithExtension = createTestTFile('cover.md');
        expect(shouldExcludeFileName(fileWithoutExtension, ['cover*'])).toBe(true);
        expect(shouldExcludeFileName(fileWithExtension, ['cover*'])).toBe(true);
    });

    it('matches wildcard prefix patterns against the basename', () => {
        const file = createTestTFile('temp-123.md');
        expect(shouldExcludeFileName(file, ['temp-*'])).toBe(true);
        expect(shouldExcludeFileName(file, ['other-*'])).toBe(false);
    });

    it('matches wildcard extension patterns against the filename', () => {
        const file = createTestTFile('Images/Cover.PNG');
        expect(shouldExcludeFileName(file, ['*.png'])).toBe(true);
        expect(shouldExcludeFileName(file, ['*.jpg'])).toBe(false);
    });

    it('matches path patterns with leading slashes', () => {
        const file = createTestTFile('Images/Cover.PNG');
        expect(shouldExcludeFileName(file, ['/images/*'])).toBe(true);
        expect(shouldExcludeFileName(file, ['/other/*'])).toBe(false);
    });

    it('matches NFC and NFD-equivalent file names and paths', () => {
        const file = createTestTFile('Café/Résumé.md');
        expect(shouldExcludeFileName(file, ['/cafe\u0301/*'])).toBe(true);
        expect(shouldExcludeFileName(file, ['re\u0301sume\u0301.md'])).toBe(true);
    });

    it('matches literal extension patterns', () => {
        const file = createTestTFile('photo.png');
        expect(shouldExcludeFileName(file, ['.png'])).toBe(true);
        expect(shouldExcludeFileName(file, ['.md'])).toBe(false);
    });

    it('matches exact filenames', () => {
        const file = createTestTFile('cover.png');
        expect(shouldExcludeFileName(file, ['cover.png'])).toBe(true);
        expect(shouldExcludeFileName(file, ['other.png'])).toBe(false);
    });

    it('handles multiple wildcards without requiring regex', () => {
        const file = createTestTFile('prefix-middle-suffix.md');
        expect(shouldExcludeFileName(file, ['prefix*middle*suffix'])).toBe(true);
        expect(shouldExcludeFileName(file, ['prefix*middle*suffix*'])).toBe(true);
        expect(shouldExcludeFileName(file, ['prefix*middle*suffixx'])).toBe(false);
        expect(shouldExcludeFileName(file, ['*prefix*middle*suffix'])).toBe(true);
        expect(shouldExcludeFileName(file, ['*prefix*middle*suffix*'])).toBe(true);
    });

    it('treats * as a match-all glob', () => {
        const file = createTestTFile('any/path/file.md');
        expect(shouldExcludeFileName(file, ['*'])).toBe(true);
    });

    it('treats consecutive wildcards as a single wildcard', () => {
        const file = createTestTFile('a---b.md');
        expect(shouldExcludeFileName(file, ['a**b'])).toBe(true);
        expect(shouldExcludeFileName(file, ['a***b'])).toBe(true);
    });

    it('dedupes and sorts patterns when caching matchers', () => {
        const first = createHiddenFileNameMatcher(['  *.png ', 'temp-*', '*.png']);
        const second = createHiddenFileNameMatcher(['temp-*', '*.png']);
        expect(first).toBe(second);
    });
});

describe('shouldExcludeFolder', () => {
    it('matches NFC and NFD-equivalent folder names for literal and wildcard rules', () => {
        expect(shouldExcludeFolder('re\u0301union', ['réunion'])).toBe(true);
        expect(shouldExcludeFolder('re\u0301union-notes', ['réunion*'])).toBe(true);
    });
});

describe('getFilteredFiles', () => {
    it('hides Excalidraw companion PNGs unless hidden items are shown', () => {
        const drawing = createTestTFile('Drawings/Sketch.excalidraw.md');
        const companionImage = createTestTFile('Drawings/Sketch.excalidraw.png');
        const normalImage = createTestTFile('Drawings/Cover.png');
        const app = createAppWithFiles([drawing, companionImage, normalImage]);
        const settings = createSettings();

        expect(toPaths(getFilteredFiles(app, settings))).toEqual(['Drawings/Sketch.excalidraw.md', 'Drawings/Cover.png']);
        expect(toPaths(getFilteredFiles(app, settings, { showHiddenItems: true }))).toEqual([
            'Drawings/Sketch.excalidraw.md',
            'Drawings/Sketch.excalidraw.png',
            'Drawings/Cover.png'
        ]);
    });

    it('shows Excalidraw companion PNGs when rendered preview image hiding is disabled', () => {
        const drawing = createTestTFile('Drawings/Sketch.excalidraw.md');
        const companionImage = createTestTFile('Drawings/Sketch.excalidraw.png');
        const normalImage = createTestTFile('Drawings/Cover.png');
        const app = createAppWithFiles([drawing, companionImage, normalImage]);
        const settings = { ...createSettings(), hideDrawingPreviewImages: false };

        expect(toPaths(getFilteredFiles(app, settings))).toEqual([
            'Drawings/Sketch.excalidraw.md',
            'Drawings/Sketch.excalidraw.png',
            'Drawings/Cover.png'
        ]);
    });
});

describe('getFilteredIndexableFiles', () => {
    it('includes markdown, PDF, SVG, and raw Tldraw files', () => {
        const note = createTestTFile('Notes/A.md');
        const pdf = createTestTFile('Docs/File.pdf');
        const svg = createTestTFile('Images/Logo.svg');
        const drawing = createTestTFile('Drawings/Sketch.tldr');
        const image = createTestTFile('Images/Cover.png');
        const app = createAppWithFiles([note, pdf, svg, drawing, image]);
        const settings = createSettings();

        expect(toPaths(getFilteredIndexableFiles(app, settings))).toEqual([
            'Notes/A.md',
            'Docs/File.pdf',
            'Images/Logo.svg',
            'Drawings/Sketch.tldr'
        ]);
    });

    it('includes raw Tldraw files even when the extension is not visible in the UI', () => {
        const note = createTestTFile('Notes/A.md');
        const drawing = createTestTFile('Drawings/Sketch.tldr');
        const app = createAppWithFiles([note, drawing]);
        const settings = createSettings();
        settings.vaultProfiles = settings.vaultProfiles.map(profile => ({
            ...profile,
            fileVisibility: FILE_VISIBILITY.SUPPORTED
        }));

        expect(toPaths(getFilteredIndexableFiles(app, settings))).toEqual(['Notes/A.md', 'Drawings/Sketch.tldr']);
    });

    it('excludes debug log markdown files from indexing', () => {
        const note = createTestTFile('Notes/A.md');
        const debugLog = createTestTFile('tps-nn-debug-2026-05-23T21-30-12-123Z.md');
        const app = createAppWithFiles([note, debugLog]);
        const settings = createSettings();

        expect(toPaths(getFilteredIndexableFiles(app, settings))).toEqual(['Notes/A.md']);
        expect(toPaths(getFilteredFiles(app, settings, { showHiddenItems: true }))).toEqual(['Notes/A.md']);
    });
});

describe('createFrontmatterPropertyExclusionMatcher', () => {
    it('matches key-only rules when the key exists regardless of value', () => {
        const matcher = createFrontmatterPropertyExclusionMatcher(['archived']);

        expect(matcher.matches({ archived: null })).toBe(true);
        expect(matcher.matches({ archived: false })).toBe(true);
        expect(matcher.matches({ archived: 'yes' })).toBe(true);
        expect(matcher.matches({ status: 'active' })).toBe(false);
    });

    it('matches key=value rules against scalar frontmatter values', () => {
        const matcher = createFrontmatterPropertyExclusionMatcher(['status=done', 'published=true', 'priority=2']);

        expect(matcher.matches({ status: 'Done' })).toBe(true);
        expect(matcher.matches({ published: true })).toBe(true);
        expect(matcher.matches({ priority: 2 })).toBe(true);
        expect(matcher.matches({ status: 'draft', published: false, priority: 3 })).toBe(false);
    });

    it('matches key=value rules against array frontmatter values', () => {
        const matcher = createFrontmatterPropertyExclusionMatcher(['status=done', 'published=true']);

        expect(matcher.matches({ status: ['draft', 'Done'] })).toBe(true);
        expect(matcher.matches({ published: [false, true] })).toBe(true);
        expect(matcher.matches({ status: ['draft', 'review'] })).toBe(false);
    });

    it('matches a leading property-value prefix across nested list values', () => {
        const matcher = createFrontmatterPropertyExclusionMatcher(['kind=transaction*']);

        expect(matcher.matches({ kind: ['note/daily', 'transaction/financial/investment'] })).toBe(true);
        expect(matcher.matches({ Kind: 'TRANSACTION/FINANCIAL' })).toBe(true);
        expect(matcher.matches({ kind: 'transaction' })).toBe(true);
        expect(matcher.matches({ kind: ['note/transaction', 'nontransaction/financial'] })).toBe(false);
    });

    it('matches a trailing property-value suffix and accepts the YAML-style separator', () => {
        const matcher = createFrontmatterPropertyExclusionMatcher(['kind: *example']);

        expect(matcher.matches({ kind: ['note/daily', 'entity/example'] })).toBe(true);
        expect(matcher.matches({ kind: 'note/myExample' })).toBe(true);
        expect(matcher.matches({ kind: 'entity/example-extra' })).toBe(false);
        expect(matcher.matches({ other: 'entity/example' })).toBe(false);
    });

    it('supports descendant-only prefixes and retains colons inside exact values', () => {
        const descendants = createFrontmatterPropertyExclusionMatcher(['kind=transaction/*']);
        const url = createFrontmatterPropertyExclusionMatcher(['source=https://example.com']);

        expect(descendants.matches({ kind: 'transaction/financial/investment' })).toBe(true);
        expect(descendants.matches({ kind: 'transaction' })).toBe(false);
        expect(descendants.matches({ kind: 'transactional/financial' })).toBe(false);
        expect(url.matches({ source: 'https://example.com' })).toBe(true);
        expect(url.matches({ source: 'https://example.com/other' })).toBe(false);
    });

    it('keeps literal and key-only rules exact while ignoring unsupported wildcard shapes', () => {
        const exact = createFrontmatterPropertyExclusionMatcher(['kind=transaction']);
        const keyOnly = createFrontmatterPropertyExclusionMatcher(['kind']);
        const unsupported = createFrontmatterPropertyExclusionMatcher(['kind=trans*action', 'kind=*trans*', 'kind=*']);

        expect(exact.matches({ kind: 'transaction' })).toBe(true);
        expect(exact.matches({ kind: ['transaction/financial'] })).toBe(false);
        expect(keyOnly.matches({ kind: ['transaction/financial'] })).toBe(true);
        expect(unsupported.hasCriteria).toBe(false);
        expect(unsupported.matches({ kind: 'transaction' })).toBe(false);
    });

    it('canonicalizes colon and equals rules into one cached matcher and reads metadata only', () => {
        const first = createFrontmatterPropertyExclusionMatcher(['kind: transaction*', 'status=done']);
        const second = createFrontmatterPropertyExclusionMatcher(['status: done', 'kind=transaction*']);
        const files = Array.from({ length: 1000 }, (_, index) => createTestTFile(`Inbox/${index}.md`));
        const app = createAppWithFiles(files);
        app.vault.read = vi.fn();
        app.vault.cachedRead = vi.fn();
        app.vault.modify = vi.fn();
        const getFileCache = vi.spyOn(app.metadataCache, 'getFileCache').mockImplementation(file => ({
            frontmatter: { kind: file.path.endsWith('/999.md') ? ['transaction/financial'] : ['note/daily'] }
        }));
        const read = vi.spyOn(app.vault, 'read');
        const cachedRead = vi.spyOn(app.vault, 'cachedRead');
        const modify = vi.spyOn(app.vault, 'modify');

        expect(first).toBe(second);
        expect(files.filter(file => shouldExcludeFileWithMatcher(file, first, app))).toHaveLength(1);
        expect(getFileCache).toHaveBeenCalledTimes(1000);
        expect(read).not.toHaveBeenCalled();
        expect(cachedRead).not.toHaveBeenCalled();
        expect(modify).not.toHaveBeenCalled();
    });

    it('ignores invalid rules and caches normalized rule sets', () => {
        const first = createFrontmatterPropertyExclusionMatcher([' archived ', 'status=done', 'status=Done', 'status=', '=done']);
        const second = createFrontmatterPropertyExclusionMatcher(['status=done', 'archived']);

        expect(first).toBe(second);
    });

    it('reuses matcher instances for the same rule array reference', () => {
        const rules = ['status=done', 'archived'];
        const first = createFrontmatterPropertyExclusionMatcher(rules);
        const second = createFrontmatterPropertyExclusionMatcher(rules);

        expect(first).toBe(second);
    });

    it('returns an empty matcher when no valid rules are present', () => {
        const matcher = createFrontmatterPropertyExclusionMatcher(['', '=', 'status=']);

        expect(matcher.hasCriteria).toBe(false);
        expect(matcher.matches({ status: 'done' })).toBe(false);
    });
});
