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
import { Platform } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyboardNavigationHelpers } from '../../src/hooks/useKeyboardNavigation';
import type { CombinedNavigationItem, VirtualFolderItem } from '../../src/types/virtualization';

interface CapturedKeyboardParams {
    onKeyDown: (event: KeyboardEvent, helpers: KeyboardNavigationHelpers<CombinedNavigationItem>) => void;
}

const mocks = vi.hoisted(() => ({
    keyboardParams: null as CapturedKeyboardParams | null,
    selectionDispatch: vi.fn(),
    resetSearchForNavigation: vi.fn(),
    settings: {}
}));

vi.mock('../../src/context/ExpansionContext', () => ({
    useExpansionState: () => ({
        expandedFolders: new Set(),
        expandedTags: new Set(),
        expandedProperties: new Set(),
        expandedVirtualFolders: new Set()
    }),
    useExpansionDispatch: () => vi.fn()
}));

vi.mock('../../src/context/SelectionContext', () => ({
    useNavigationCursor: () => ({}),
    useSelectionState: () => ({
        selectionType: 'folder',
        selectedFolder: null,
        selectedTag: null,
        selectedProperty: null,
        selectedType: null
    }),
    useSelectionDispatch: () => mocks.selectionDispatch
}));

vi.mock('../../src/context/ServicesContext', () => ({
    useServices: () => ({
        app: {},
        commandQueue: null,
        plugin: { openFolderNoteInRightSidebar: vi.fn() }
    }),
    useFileSystemOps: () => ({})
}));

vi.mock('../../src/context/SettingsContext', () => ({
    useSettingsState: () => mocks.settings
}));

vi.mock('../../src/context/UXPreferencesContext', () => ({
    useUXPreferences: () => ({ includeDescendantNotes: false, showHiddenItems: false })
}));

vi.mock('../../src/context/UIStateContext', () => ({
    useUIState: () => ({ singlePane: false }),
    useUIDispatch: () => vi.fn()
}));

vi.mock('../../src/hooks/useKeyboardNavigation', () => ({
    useKeyboardNavigation: (params: CapturedKeyboardParams) => {
        mocks.keyboardParams = params;
    }
}));

import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { NavigationPaneItemType, TYPES_ROOT_VIRTUAL_FOLDER_ID } from '../../src/types';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';
import { useNavigationPaneKeyboard } from '../../src/hooks/useNavigationPaneKeyboard';

function createVirtualFolder(id: string, overrides: Partial<VirtualFolderItem> = {}): VirtualFolderItem {
    return {
        type: NavigationPaneItemType.VIRTUAL_FOLDER,
        data: { id, name: id },
        key: id,
        level: 0,
        hasChildren: false,
        ...overrides
    };
}

function createArrowDownEvent(): KeyboardEvent {
    return {
        key: 'ArrowDown',
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        preventDefault: vi.fn()
    } as unknown as KeyboardEvent;
}

function createHelpers(items: CombinedNavigationItem[], targetIndex: number): KeyboardNavigationHelpers<CombinedNavigationItem> {
    return {
        findNextIndex: () => targetIndex,
        findPreviousIndex: () => targetIndex,
        getPageSize: () => 10,
        scrollToIndex: vi.fn(),
        getItemAt: index => items[index],
        isRTL: () => false
    };
}

describe('useNavigationPaneKeyboard search reset', () => {
    beforeEach(() => {
        mocks.keyboardParams = null;
        mocks.selectionDispatch.mockClear();
        mocks.resetSearchForNavigation.mockClear();
        mocks.settings = DEFAULT_SETTINGS;
        Platform.isMacOS = false;
    });

    it('resets search for a selected Type row but not for the keyboard-only Types root', () => {
        const typesRoot = createVirtualFolder(TYPES_ROOT_VIRTUAL_FOLDER_ID, {
            isSelectable: true,
            hasChildren: true
        });
        const typeRow = createVirtualFolder('tps-type:file:notes', {
            isSelectable: true,
            typeCollectionId: TPS_NAVIGATOR_TYPE_IDS.NOTES
        });
        const renderHarness = (renderedItems: CombinedNavigationItem[]): CapturedKeyboardParams => {
            mocks.keyboardParams = null;

            function Harness() {
                useNavigationPaneKeyboard({
                    items: renderedItems,
                    virtualizer: { scrollToIndex: vi.fn() } as never,
                    containerRef: { current: null },
                    pathToIndex: new Map(),
                    onResetSearchForNavigation: mocks.resetSearchForNavigation
                });
                return null;
            }

            renderToStaticMarkup(React.createElement(Harness));
            if (!mocks.keyboardParams) {
                throw new Error('Expected keyboard navigation handler');
            }
            return mocks.keyboardParams;
        };

        renderHarness([typesRoot]).onKeyDown(createArrowDownEvent(), createHelpers([typesRoot], 0));
        expect(mocks.resetSearchForNavigation).not.toHaveBeenCalled();
        expect(mocks.selectionDispatch).not.toHaveBeenCalled();

        renderHarness([typeRow]).onKeyDown(createArrowDownEvent(), createHelpers([typeRow], 0));
        expect(mocks.resetSearchForNavigation).toHaveBeenCalledTimes(1);
        expect(mocks.selectionDispatch).toHaveBeenCalledWith({
            type: 'SET_SELECTED_TYPE',
            typeId: TPS_NAVIGATOR_TYPE_IDS.NOTES
        });
    });
});
