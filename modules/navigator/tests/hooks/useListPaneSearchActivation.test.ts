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
import { App, TFolder } from 'obsidian';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    uiDispatch: vi.fn(),
    setSearchActive: vi.fn(),
    showNotice: vi.fn(),
    searchActive: false,
    searchProvider: ((): 'internal' | 'omnisearch' => 'internal')(),
    services: {
        app: null as App | null,
        isMobile: false,
        plugin: {
            setSearchProvider: vi.fn()
        },
        propertyTreeService: {
            findNode: vi.fn()
        },
        tagTreeService: {
            findTagNode: vi.fn()
        }
    }
}));

vi.mock('../../src/context/SelectionContext', () => ({
    useSelectionDispatch: () => vi.fn(),
    useSelectionState: () => ({
        selectionType: 'folder',
        selectedFolder: null,
        selectedTag: null,
        selectedProperty: null
    })
}));

vi.mock('../../src/context/ServicesContext', () => ({
    useServices: () => mocks.services
}));

vi.mock('../../src/context/SettingsContext', () => ({
    useSettingsState: () => ({
        paneTransitionDuration: 0,
        searchProvider: mocks.searchProvider,
        skipAutoScroll: false,
        tpsFileTypesNavigationEnabled: true
    })
}));

vi.mock('../../src/context/ShortcutsContext', () => ({
    useShortcuts: () => ({
        addSearchShortcut: vi.fn(),
        removeSearchShortcut: vi.fn(),
        searchShortcutsByName: new Map()
    })
}));

vi.mock('../../src/context/UIStateContext', () => ({
    useUIDispatch: () => mocks.uiDispatch
}));

vi.mock('../../src/context/UXPreferencesContext', () => ({
    useUXPreferences: () => ({ searchActive: mocks.searchActive }),
    useUXPreferenceActions: () => ({ setSearchActive: mocks.setSearchActive })
}));

vi.mock('../../src/utils/noticeUtils', () => ({
    showNotice: mocks.showNotice
}));

import { useListPaneSearch, type UseListPaneSearchResult } from '../../src/hooks/useListPaneSearch';
import { TAGGED_TAG_ID } from '../../src/types';
import { ShortcutStartType, ShortcutType, type SearchShortcut, type ShortcutStartTarget } from '../../src/types/shortcuts';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';
import { buildPropertyKeyNodeId } from '../../src/utils/propertyTree';
import type { PropertyTreeNode, TagTreeNode } from '../../src/types/storage';

function renderSearchHarness() {
    let captured: UseListPaneSearchResult | null = null;
    const callbacks = {
        onNavigateToFolder: vi.fn(() => true),
        onRevealTag: vi.fn(() => true),
        onRevealProperty: vi.fn(() => true)
    };

    function Harness() {
        captured = useListPaneSearch({
            rootContainerRef: { current: null },
            ...callbacks,
            ensureSelectionForCurrentFilterRef: { current: null }
        });
        return null;
    }

    renderToStaticMarkup(React.createElement(Harness));
    if (!captured) {
        throw new Error('Expected hook result');
    }

    return { result: captured as UseListPaneSearchResult, ...callbacks };
}

describe('useListPaneSearch activation', () => {
    beforeEach(() => {
        mocks.uiDispatch.mockClear();
        mocks.setSearchActive.mockClear();
        mocks.showNotice.mockClear();
        mocks.searchActive = false;
        mocks.services.plugin.setSearchProvider.mockClear();
        mocks.services.propertyTreeService.findNode.mockReset();
        mocks.services.tagTreeService.findTagNode.mockReset();
        mocks.searchProvider = 'internal';
        mocks.services.app = new App();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn((callback: FrameRequestCallback) => {
                callback(0);
                return 1;
            })
        );
        vi.stubGlobal('HTMLElement', class {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('preserves pane activation when a navigation-side search modification does not focus search', () => {
        let captured: UseListPaneSearchResult | null = null;

        function Harness() {
            captured = useListPaneSearch({
                rootContainerRef: { current: null },
                onNavigateToFolder: vi.fn(() => true),
                onRevealTag: vi.fn(() => true),
                onRevealProperty: vi.fn(() => true),
                ensureSelectionForCurrentFilterRef: { current: null }
            });
            return null;
        }

        renderToStaticMarkup(React.createElement(Harness));

        expect(captured).not.toBeNull();
        if (!captured) {
            throw new Error('Expected hook result');
        }
        const result = captured as UseListPaneSearchResult;

        result.modifySearchWithTag('work', 'AND', { focusSearch: false });

        expect(mocks.setSearchActive).toHaveBeenCalledWith(true);
        expect(mocks.uiDispatch).not.toHaveBeenCalled();
    });

    it('unconditionally resets navigation search state without dispatching pane focus', () => {
        const { result } = renderSearchHarness();

        result.resetSearchForNavigation();

        expect(mocks.setSearchActive).toHaveBeenCalledWith(false);
        expect(mocks.uiDispatch).not.toHaveBeenCalled();
    });

    it('activates a Type facet without stealing navigation focus and forces internal search', () => {
        mocks.searchProvider = 'omnisearch';
        let captured: UseListPaneSearchResult | null = null;

        function Harness() {
            captured = useListPaneSearch({
                rootContainerRef: { current: null },
                onNavigateToFolder: vi.fn(() => true),
                onRevealTag: vi.fn(() => true),
                onRevealProperty: vi.fn(() => true),
                ensureSelectionForCurrentFilterRef: { current: null }
            });
            return null;
        }

        renderToStaticMarkup(React.createElement(Harness));

        expect(captured).not.toBeNull();
        if (!captured) {
            throw new Error('Expected hook result');
        }
        const result = captured as UseListPaneSearchResult;

        result.modifySearchWithType(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, { focusSearch: false });

        expect(mocks.services.plugin.setSearchProvider).toHaveBeenCalledWith('internal');
        expect(mocks.setSearchActive).toHaveBeenCalledWith(true);
        expect(mocks.uiDispatch).not.toHaveBeenCalled();
    });

    const missingStartTargets: Array<{ label: string; startTarget: ShortcutStartTarget }> = [
        {
            label: 'folder',
            startTarget: { type: ShortcutStartType.FOLDER, path: 'missing/folder' }
        },
        {
            label: 'tag',
            startTarget: { type: ShortcutStartType.TAG, tagPath: 'missing/tag' }
        },
        {
            label: 'property',
            startTarget: { type: ShortcutStartType.PROPERTY, nodeId: buildPropertyKeyNodeId('missing') }
        }
    ];

    it.each(missingStartTargets)('fails closed when a saved search has a missing $label start target', async ({ startTarget }) => {
        const { result, onNavigateToFolder, onRevealTag, onRevealProperty } = renderSearchHarness();
        const shortcut: SearchShortcut = {
            type: ShortcutType.SEARCH,
            name: 'Scoped search',
            query: 'meeting',
            provider: 'omnisearch',
            startTarget
        };

        await result.executeSearchShortcut({ searchShortcut: shortcut });

        expect(onNavigateToFolder).not.toHaveBeenCalled();
        expect(onRevealTag).not.toHaveBeenCalled();
        expect(onRevealProperty).not.toHaveBeenCalled();
        expect(mocks.services.plugin.setSearchProvider).not.toHaveBeenCalled();
        expect(mocks.setSearchActive).not.toHaveBeenCalled();
        expect(mocks.uiDispatch).not.toHaveBeenCalled();
        expect(requestAnimationFrame).not.toHaveBeenCalled();
        expect(mocks.showNotice).toHaveBeenCalledOnce();
    });

    it('does not apply a saved search when root navigation fails', async () => {
        const { result, onNavigateToFolder } = renderSearchHarness();
        onNavigateToFolder.mockReturnValue(false);

        await result.executeSearchShortcut({
            searchShortcut: {
                type: ShortcutType.SEARCH,
                name: 'Scoped search',
                query: 'meeting',
                provider: 'omnisearch',
                startTarget: { type: ShortcutStartType.TAG, tagPath: TAGGED_TAG_ID }
            }
        });

        expect(onNavigateToFolder).toHaveBeenCalledWith('/', expect.any(Object));
        expect(mocks.services.plugin.setSearchProvider).not.toHaveBeenCalled();
        expect(mocks.setSearchActive).not.toHaveBeenCalled();
        expect(mocks.uiDispatch).not.toHaveBeenCalled();
        expect(requestAnimationFrame).not.toHaveBeenCalled();
        expect(mocks.showNotice).not.toHaveBeenCalled();
    });

    it('executes valid folder, tag, and property start targets before applying the saved search', async () => {
        const app = mocks.services.app;
        if (!app) {
            throw new Error('Expected test app');
        }
        (app.vault as unknown as { registerFolder: (folder: TFolder) => void }).registerFolder(new TFolder('Projects'));

        const tagNode = { path: 'projects' } as TagTreeNode;
        const propertyNode = { id: buildPropertyKeyNodeId('status') } as PropertyTreeNode;
        mocks.services.tagTreeService.findTagNode.mockImplementation((tagPath: string) => (tagPath === tagNode.path ? tagNode : null));
        mocks.services.propertyTreeService.findNode.mockImplementation((nodeId: string) =>
            nodeId === propertyNode.id ? propertyNode : null
        );

        const cases: Array<{
            startTarget: ShortcutStartTarget;
            expectedCallback: 'onNavigateToFolder' | 'onRevealTag' | 'onRevealProperty';
            expectedTarget: string;
        }> = [
            {
                startTarget: { type: ShortcutStartType.FOLDER, path: 'projects' },
                expectedCallback: 'onNavigateToFolder',
                expectedTarget: 'Projects'
            },
            {
                startTarget: { type: ShortcutStartType.TAG, tagPath: '#Projects' },
                expectedCallback: 'onRevealTag',
                expectedTarget: 'projects'
            },
            {
                startTarget: { type: ShortcutStartType.PROPERTY, nodeId: 'key:STATUS' },
                expectedCallback: 'onRevealProperty',
                expectedTarget: propertyNode.id
            }
        ];

        for (const testCase of cases) {
            mocks.services.plugin.setSearchProvider.mockClear();
            mocks.setSearchActive.mockClear();
            mocks.uiDispatch.mockClear();
            mocks.showNotice.mockClear();

            const harness = renderSearchHarness();
            await harness.result.executeSearchShortcut({
                searchShortcut: {
                    type: ShortcutType.SEARCH,
                    name: 'Scoped search',
                    query: 'meeting',
                    provider: 'omnisearch',
                    startTarget: testCase.startTarget
                }
            });

            expect(harness.onNavigateToFolder).toHaveBeenCalledWith('/', expect.any(Object));
            expect(harness.onRevealTag).not.toHaveBeenCalled();
            expect(harness.onRevealProperty).not.toHaveBeenCalled();
            expect(mocks.services.plugin.setSearchProvider).toHaveBeenCalledWith('internal');
            expect(mocks.setSearchActive).toHaveBeenCalledWith(true);
            expect(mocks.uiDispatch).toHaveBeenCalledWith({ type: 'ACTIVATE_PANE', target: 'files' });
            expect(mocks.showNotice).not.toHaveBeenCalled();
        }
    });
});
