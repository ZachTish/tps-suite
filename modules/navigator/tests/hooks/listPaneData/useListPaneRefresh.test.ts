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

import { describe, expect, it } from 'vitest';
import { App, TFile } from 'obsidian';
import {
    getModifiedSortBoundaryRefreshKey,
    hasPropertySearchContentChange,
    hasStructuralTypeTagSearchContentChange,
    hasTypePresentationContentChange,
    hasTypeVisibilityContentChange,
    shouldRefreshForCustomGroupHeaderMetadataChange,
    shouldRefreshOnFileModifyForList,
    shouldSkipModifiedSortBoundaryRefresh
} from '../../../src/hooks/listPaneData/useListPaneRefresh';
import { ItemType } from '../../../src/types';

function createFile(path: string, mtime: number): TFile {
    const file = new TFile(path);
    file.stat.mtime = mtime;
    file.stat.ctime = mtime;
    return file;
}

describe('getModifiedSortBoundaryRefreshKey', () => {
    const today = new Date(2026, 5, 23, 12).getTime();
    const yesterday = new Date(2026, 5, 22, 12).getTime();

    it('returns a key for the first file in modified-desc order', () => {
        const first = createFile('notes/first.md', today);
        const second = createFile('notes/second.md', yesterday);

        const key = getModifiedSortBoundaryRefreshKey({
            dayKey: '2026-06-23',
            file: first,
            files: [first, second],
            groupBy: 'date',
            sortOption: 'modified-desc'
        });

        expect(key).toBe('modified-desc\u0000date\u0000relative:today\u00002');
    });

    it('returns a key for the last file in modified-asc order', () => {
        const first = createFile('notes/first.md', yesterday);
        const second = createFile('notes/second.md', today);

        const key = getModifiedSortBoundaryRefreshKey({
            dayKey: '2026-06-23',
            file: second,
            files: [first, second],
            groupBy: 'date',
            sortOption: 'modified-asc'
        });

        expect(key).toBe('modified-asc\u0000date\u0000relative:today\u00002');
    });

    it('returns null for non-boundary files and non-primary modified sorts', () => {
        const first = createFile('notes/first.md', today);
        const second = createFile('notes/second.md', yesterday);

        expect(
            getModifiedSortBoundaryRefreshKey({
                dayKey: '2026-06-23',
                file: second,
                files: [first, second],
                groupBy: 'date',
                sortOption: 'modified-desc'
            })
        ).toBeNull();
        expect(
            getModifiedSortBoundaryRefreshKey({
                dayKey: '2026-06-23',
                file: first,
                files: [first, second],
                groupBy: 'date',
                sortOption: 'property-asc'
            })
        ).toBeNull();
    });

    it('changes keys when date grouping changes', () => {
        const file = createFile('notes/current.md', today);
        const todayKey = getModifiedSortBoundaryRefreshKey({
            dayKey: '2026-06-23',
            file,
            files: [file],
            groupBy: 'date',
            sortOption: 'modified-desc'
        });

        file.stat.mtime = yesterday;
        const yesterdayKey = getModifiedSortBoundaryRefreshKey({
            dayKey: '2026-06-23',
            file,
            files: [file],
            groupBy: 'date',
            sortOption: 'modified-desc'
        });

        expect(todayKey).not.toBe(yesterdayKey);
    });

    it('skips unchanged boundary refreshes only when dates, tooltips, and date filters are inactive', () => {
        const boundaryRefreshKey = 'modified-desc\u0000date\u0000relative:today\u00002';

        expect(
            shouldSkipModifiedSortBoundaryRefresh({
                previousBoundaryRefreshKey: boundaryRefreshKey,
                boundaryRefreshKey,
                hasDateSearchFilters: false,
                showFileDate: false,
                showTooltips: false
            })
        ).toBe(true);

        expect(
            shouldSkipModifiedSortBoundaryRefresh({
                previousBoundaryRefreshKey: boundaryRefreshKey,
                boundaryRefreshKey,
                hasDateSearchFilters: false,
                showFileDate: true,
                showTooltips: false
            })
        ).toBe(false);

        expect(
            shouldSkipModifiedSortBoundaryRefresh({
                previousBoundaryRefreshKey: boundaryRefreshKey,
                boundaryRefreshKey,
                hasDateSearchFilters: false,
                showFileDate: false,
                showTooltips: true
            })
        ).toBe(false);

        expect(
            shouldSkipModifiedSortBoundaryRefresh({
                previousBoundaryRefreshKey: boundaryRefreshKey,
                boundaryRefreshKey,
                hasDateSearchFilters: true,
                showFileDate: false,
                showTooltips: false
            })
        ).toBe(false);
    });
});

describe('hasPropertySearchContentChange', () => {
    it('detects property writes inside the unfiltered list scope', () => {
        const basePathSet = new Set(['notes/in-scope.md']);

        expect(
            hasPropertySearchContentChange([{ path: 'notes/in-scope.md', changes: { properties: [] }, changeType: 'content' }], basePathSet)
        ).toBe(true);
        expect(
            hasPropertySearchContentChange(
                [
                    { path: 'notes/outside.md', changes: { properties: [] }, changeType: 'content' },
                    { path: 'notes/in-scope.md', changes: { taskUnfinished: 1 }, changeType: 'content' }
                ],
                basePathSet
            )
        ).toBe(false);
    });
});

describe('hasTypeVisibilityContentChange', () => {
    it('refreshes a Type allowlist for relevant hidden-property and hidden-tag changes without a base path', () => {
        expect(
            hasTypeVisibilityContentChange({
                changes: [{ path: 'notes/project.md', changes: { properties: [] }, metadataHiddenChanged: true, changeType: 'content' }],
                selectionType: ItemType.TYPE,
                showHiddenItems: false,
                hasHiddenPropertyRules: true,
                hasHiddenTagRules: false
            })
        ).toBe(true);
        expect(
            hasTypeVisibilityContentChange({
                changes: [{ path: 'notes/project.md', changes: { tags: ['hidden'] }, changeType: 'content' }],
                selectionType: ItemType.TYPE,
                showHiddenItems: false,
                hasHiddenPropertyRules: false,
                hasHiddenTagRules: true
            })
        ).toBe(true);
    });

    it('ignores unrelated fields, other selections, and the explicit hidden-items override', () => {
        const changes = [{ path: 'notes/project.md', changes: { wordCount: 42 }, changeType: 'content' as const }];
        const base = {
            changes,
            selectionType: ItemType.TYPE,
            showHiddenItems: false,
            hasHiddenPropertyRules: true,
            hasHiddenTagRules: true
        };

        expect(hasTypeVisibilityContentChange(base)).toBe(false);
        expect(hasTypeVisibilityContentChange({ ...base, selectionType: ItemType.FOLDER })).toBe(false);
        expect(hasTypeVisibilityContentChange({ ...base, showHiddenItems: true })).toBe(false);
    });
});

describe('hasTypePresentationContentChange', () => {
    it('refreshes structural Type ordering/grouping for in-scope property writes', () => {
        const changes = [{ path: 'notes/project.md', changes: { properties: [] }, changeType: 'content' as const }];

        expect(
            hasTypePresentationContentChange({
                changes,
                basePathSet: new Set(['notes/project.md']),
                isStructuralTypeSelection: true,
                usesMetadataPresentation: true
            })
        ).toBe(true);
    });

    it('guards external Types, metadata-independent presentation, and out-of-scope writes', () => {
        const changes = [{ path: 'notes/project.md', changes: { properties: [] }, changeType: 'content' as const }];
        const base = {
            changes,
            basePathSet: new Set(['notes/project.md']),
            isStructuralTypeSelection: true,
            usesMetadataPresentation: true
        };

        expect(hasTypePresentationContentChange({ ...base, isStructuralTypeSelection: false })).toBe(false);
        expect(hasTypePresentationContentChange({ ...base, usesMetadataPresentation: false })).toBe(false);
        expect(hasTypePresentationContentChange({ ...base, basePathSet: new Set(['notes/other.md']) })).toBe(false);
    });
});

describe('filter search refresh', () => {
    it('refreshes an active tag search when an owning note changes tags', () => {
        const changes = [{ path: 'notes/shopping.md', changes: { tags: ['shopping'] }, changeType: 'content' as const }];

        expect(
            hasStructuralTypeTagSearchContentChange({
                changes,
                basePathSet: new Set(['notes/shopping.md']),
                hasTagSearchFilters: true,
                isStructuralTypeSelection: true
            })
        ).toBe(true);
        expect(
            hasStructuralTypeTagSearchContentChange({
                changes,
                basePathSet: new Set(['notes/shopping.md']),
                hasTagSearchFilters: false,
                isStructuralTypeSelection: true
            })
        ).toBe(false);
        expect(
            hasStructuralTypeTagSearchContentChange({
                changes,
                basePathSet: new Set(['notes/other.md']),
                hasTagSearchFilters: true,
                isStructuralTypeSelection: true
            })
        ).toBe(false);
        expect(
            hasStructuralTypeTagSearchContentChange({
                changes,
                basePathSet: new Set(['notes/shopping.md']),
                hasTagSearchFilters: true,
                isStructuralTypeSelection: false
            })
        ).toBe(false);
    });

    it('refreshes every active date search on file modification even when its sort ignores mtime', () => {
        expect(
            shouldRefreshOnFileModifyForList({
                hasDateSearchFilters: true,
                isStructuralTypeSelection: true,
                propertySortSecondary: 'title',
                sortOption: 'title-asc'
            })
        ).toBe(true);
        expect(
            shouldRefreshOnFileModifyForList({
                hasDateSearchFilters: true,
                isStructuralTypeSelection: false,
                propertySortSecondary: 'title',
                sortOption: 'title-asc'
            })
        ).toBe(true);
        expect(
            shouldRefreshOnFileModifyForList({
                hasDateSearchFilters: false,
                isStructuralTypeSelection: true,
                propertySortSecondary: 'title',
                sortOption: 'modified-desc'
            })
        ).toBe(true);
        expect(
            shouldRefreshOnFileModifyForList({
                hasDateSearchFilters: false,
                isStructuralTypeSelection: false,
                propertySortSecondary: 'title',
                sortOption: 'title-asc'
            })
        ).toBe(false);
    });
});

describe('shouldRefreshForCustomGroupHeaderMetadataChange', () => {
    it('detects removal from an owner retained by the search count snapshot', () => {
        const app = new App();
        const file = createFile('notes/previous-header.md', 0);
        app.metadataCache.getFileCache = () => ({ frontmatter: {} });

        expect(
            shouldRefreshForCustomGroupHeaderMetadataChange({
                app,
                basePathSet: new Set([file.path]),
                cachedCustomGroupHeaderFilePaths: new Set([file.path]),
                customGroupHeaderFilePaths: new Set(),
                file,
                manualSortGroupHeaderPropertyKey: 'group_header',
                shouldRefreshOnCustomGroupHeaderMetadataChange: true
            })
        ).toBe(true);
    });

    it('detects a newly added header that is absent from the search count snapshot', () => {
        const app = new App();
        const file = createFile('notes/new-header.md', 0);
        app.metadataCache.getFileCache = () => ({ frontmatter: { group_header: 'New group' } });

        expect(
            shouldRefreshForCustomGroupHeaderMetadataChange({
                app,
                basePathSet: new Set([file.path]),
                cachedCustomGroupHeaderFilePaths: new Set(),
                customGroupHeaderFilePaths: new Set(),
                file,
                manualSortGroupHeaderPropertyKey: 'group_header',
                shouldRefreshOnCustomGroupHeaderMetadataChange: true
            })
        ).toBe(true);
    });

    it('ignores metadata changes outside the unfiltered list scope', () => {
        const app = new App();
        const file = createFile('notes/outside.md', 0);
        app.metadataCache.getFileCache = () => ({ frontmatter: { group_header: 'Outside group' } });

        expect(
            shouldRefreshForCustomGroupHeaderMetadataChange({
                app,
                basePathSet: new Set(),
                cachedCustomGroupHeaderFilePaths: new Set([file.path]),
                customGroupHeaderFilePaths: new Set([file.path]),
                file,
                manualSortGroupHeaderPropertyKey: 'group_header',
                shouldRefreshOnCustomGroupHeaderMetadataChange: true
            })
        ).toBe(false);
    });
});
