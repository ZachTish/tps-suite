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

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TFile, TFolder } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { strings } from '../../src/i18n';
import {
    activateFolderGroupHeaderNavigation,
    ListPaneGroupHeader,
    resolveVisibleStickyHeader,
    type FolderGroupHeaderTarget,
    type HeaderRenderModel
} from '../../src/components/listPane/ListPaneVirtualContent';

vi.mock('../../src/components/FileItem', () => ({ FileItem: () => null }));

function createHeader(itemCount: number | null, totalItemCount: number | null = null): HeaderRenderModel {
    return {
        index: 0,
        label: 'Today',
        baseLabel: 'Today',
        isFirstHeader: true,
        isPinnedHeader: false,
        collapseKey: 'date:today',
        isCollapsed: false,
        isCollapsible: true,
        folderGroupHeaderTarget: null,
        folderGroupHeaderPath: null,
        folderGroupHeaderSegments: [],
        groupFilePaths: ['First.md', 'Second.md', 'Third.md'],
        itemCount,
        totalItemCount,
        manualSortHeaderFilePath: null,
        manualSortHeader: null,
        manualSortHeaderWordCount: 0,
        manualSortHeaderTargetWordCount: null,
        folderIconId: null,
        folderColor: null,
        applyFolderColorToLabel: false
    };
}

function renderHeader(
    itemCount: number | null,
    totalItemCount: number | null = null,
    overrides: Partial<HeaderRenderModel> = {},
    isSticky = false
): string {
    return renderToStaticMarkup(
        React.createElement(ListPaneGroupHeader, {
            header: { ...createHeader(itemCount, totalItemCount), ...overrides },
            isSticky,
            collapseChevronIcons: { collapsed: 'chevron-right', expanded: 'chevron-down' },
            pinnedSectionIcon: '',
            onPinnedGroupHeaderToggle: () => {},
            onListGroupHeaderToggle: () => {},
            onFolderGroupHeaderClick: () => {},
            onFolderGroupHeaderMouseDown: () => {},
            onGroupHeaderContextMenu: () => {}
        })
    );
}

describe('ListPaneGroupHeader item count', () => {
    it('renders the configured item count before the collapse control', () => {
        const markup = renderHeader(3);
        const countIndex = markup.indexOf('<span class="tps-nn-list-group-header-item-count">(3)</span>');
        const collapseIndex = markup.indexOf('tps-nn-list-group-header-collapse-button');

        expect(countIndex).toBeGreaterThan(-1);
        expect(collapseIndex).toBeGreaterThan(countIndex);
    });

    it('renders the filtered and total item counts during search', () => {
        expect(renderHeader(3, 8)).toContain('<span class="tps-nn-list-group-header-item-count">(3/8)</span>');
    });

    it('omits the item count when the setting is disabled', () => {
        expect(renderHeader(null)).not.toContain('tps-nn-list-group-header-item-count');
    });
});

describe('ListPaneGroupHeader nested property presentation', () => {
    const path = 'transaction/financial/investment';
    const nested: Partial<HeaderRenderModel> = {
        label: 'investment',
        baseLabel: 'investment',
        groupDepth: 2,
        groupPath: path
    };

    it.each([1, 2, 4, 9])('caps visual indentation while retaining logical depth %i', depth => {
        const markup = renderHeader(3, null, { ...nested, groupDepth: depth });
        expect(markup).toContain(`data-group-depth="${depth}"`);
        expect(markup).toContain(`padding-inline-start:calc(var(--tps-nn-file-item-padding-horizontal) + ${Math.min(depth, 4)} * 12px)`);
        expect(markup).toContain(`title="${path}"`);
    });

    it('shows the segment normally and the complete path in its collapse button label', () => {
        const markup = renderHeader(3, null, nested);
        expect(markup).toContain('>investment</span>');
        expect(markup).not.toContain(`>${path}</span>`);
        expect(markup).toContain(`aria-label="${strings.listPane.collapseGroup}: ${path}"`);
        expect(markup).toContain('aria-expanded="true"');
    });

    it('uses the full path for the sticky label and preserves collapsed-state accessibility', () => {
        const markup = renderHeader(3, null, { ...nested, isCollapsed: true }, true);
        expect(markup).toContain(`>${path}</span>`);
        expect(markup).not.toContain('>investment</span>');
        expect(markup).toContain(`aria-label="${strings.listPane.expandGroup}: ${path}"`);
        expect(markup).toContain('aria-expanded="false"');
        expect(markup).toContain(`title="${path}"`);
    });

    it('leaves the top-level node unindented while preserving its path metadata', () => {
        const markup = renderHeader(3, null, { ...nested, label: 'transaction', groupPath: 'transaction', groupDepth: 0 });
        expect(markup).toContain('data-group-depth="0"');
        expect(markup).not.toContain('padding-inline-start');
        expect(markup).toContain('title="transaction"');
    });

    it('keeps flat headers free of hierarchy metadata and unchanged when sticky', () => {
        const markup = renderHeader(3);
        expect(markup).toContain('>Today</span>');
        expect(markup).toContain(`aria-label="${strings.listPane.collapseGroup}"`);
        expect(markup).not.toContain('data-group-depth');
        expect(markup).not.toContain('padding-inline-start');
        expect(markup).not.toContain('title=');
        expect(renderHeader(3, null, {}, true)).toBe(markup);
    });
});

describe('resolveVisibleStickyHeader', () => {
    it('suppresses a stale sticky header while the list renders its empty state', () => {
        const header = createHeader(0);

        expect(resolveVisibleStickyHeader(header, false, true)).toBeNull();
        expect(resolveVisibleStickyHeader(header, true, false)).toBeNull();
    });

    it('keeps the active sticky header for a populated selection', () => {
        const header = createHeader(3);

        expect(resolveVisibleStickyHeader(header, false, false)).toBe(header);
    });
});

describe('folder group header navigation', () => {
    it('resets search after successful folder scope changes for plain and folder-note headers', () => {
        const folder = new TFolder('Projects');
        const onNavigateToFolder = vi.fn(() => true);
        const onResetSearchForNavigation = vi.fn();
        const target: FolderGroupHeaderTarget = { folder, folderNote: null };

        activateFolderGroupHeaderNavigation({
            target,
            suppressAutoSelect: false,
            onNavigateToFolder,
            onResetSearchForNavigation
        });

        expect(onResetSearchForNavigation).toHaveBeenCalledOnce();
        expect(onNavigateToFolder).toHaveBeenCalledWith(folder.path, { source: 'manual', suppressAutoSelect: false });
        expect(onNavigateToFolder.mock.invocationCallOrder[0]).toBeLessThan(onResetSearchForNavigation.mock.invocationCallOrder[0]);

        target.folderNote = new TFile('Projects/Projects.md');
        activateFolderGroupHeaderNavigation({
            target,
            suppressAutoSelect: true,
            onNavigateToFolder,
            onResetSearchForNavigation
        });
        expect(onResetSearchForNavigation).toHaveBeenCalledTimes(2);
        expect(onNavigateToFolder).toHaveBeenLastCalledWith(folder.path, { source: 'manual', suppressAutoSelect: true });
    });

    it('preserves search when folder group navigation fails', () => {
        const onResetSearchForNavigation = vi.fn();
        const onNavigateToFolder = vi.fn(() => false);

        expect(
            activateFolderGroupHeaderNavigation({
                target: { folder: new TFolder('Missing'), folderNote: null },
                suppressAutoSelect: false,
                onNavigateToFolder,
                onResetSearchForNavigation
            })
        ).toBe(false);
        expect(onNavigateToFolder).toHaveBeenCalledOnce();
        expect(onResetSearchForNavigation).not.toHaveBeenCalled();
    });
});
