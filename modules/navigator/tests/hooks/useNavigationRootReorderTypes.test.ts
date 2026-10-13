/* TPS Notebook Navigator - Types-only navigation edit-mode state. */

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { useNavigationRootReorder, type NavigationRootReorderState } from '../../src/hooks/useNavigationRootReorder';
import { buildNavigationTypeReorderItems } from '../../src/hooks/navigationPane/data/useNavigationPaneTypeSection';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import { NavigationSectionId } from '../../src/types';
import { TPS_NAVIGATOR_TYPE_IDS, type TpsNavigatorTypesSnapshot } from '../../src/types/navigatorTypes';
import { getActiveVaultProfile } from '../../src/utils/vaultProfiles';

function createTypeSourceItems() {
    const snapshot: TpsNavigatorTypesSnapshot = {
        availability: 'ready',
        revision: 1,
        recordsByType: new Map(),
        descriptors: [
            {
                id: TPS_NAVIGATOR_TYPE_IDS.NOTES,
                label: 'Notes',
                icon: 'lucide-file-text',
                category: 'structure',
                count: 3
            },
            {
                id: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
                label: 'Checkboxes',
                icon: 'lucide-square-check-big',
                category: 'structure',
                count: 12
            }
        ]
    };
    return buildNavigationTypeReorderItems(snapshot);
}

describe('useNavigationRootReorder Types state', () => {
    it('enables a Types-only editor, keeps counts, and persists manual and automatic choices', async () => {
        let settings = structuredClone(DEFAULT_SETTINGS);
        settings.showRootFolder = false;
        settings.showShortcuts = false;
        settings.showRecentNotes = false;
        settings.showTags = false;
        settings.tpsTypesNavigationEnabled = true;
        const updateSettings = vi.fn(async (updater: (current: NotebookNavigatorSettings) => void) => {
            const next = structuredClone(settings);
            updater(next);
            settings = next;
        });
        let state: NavigationRootReorderState | null = null;

        function Host() {
            state = useNavigationRootReorder({
                app: { vault: {} } as App,
                items: [],
                settings,
                showHiddenItems: false,
                updateSettings,
                sectionOrder: [NavigationSectionId.TYPES],
                setSectionOrder: vi.fn(),
                rootLevelFolders: [],
                missingRootFolderPaths: [],
                resolvedRootTagKeys: [],
                rootOrderingTagTree: new Map(),
                missingRootTagPaths: [],
                resolvedRootPropertyKeys: [],
                rootOrderingPropertyTree: new Map(),
                missingRootPropertyKeys: [],
                typeReorderSourceItems: createTypeSourceItems(),
                metadataService: {} as never,
                foldersSectionExpanded: false,
                tagsSectionExpanded: false,
                propertiesSectionExpanded: false,
                typesSectionExpanded: true,
                propertiesSectionActive: false,
                handleToggleFoldersSection: vi.fn(),
                handleToggleTagsSection: vi.fn(),
                handleTogglePropertiesSection: vi.fn(),
                handleToggleTypesSection: vi.fn(),
                activeProfile: {
                    profile: getActiveVaultProfile(settings),
                    hiddenFolders: [],
                    descendantExcludedFolders: [],
                    hiddenFileProperties: [],
                    hiddenFileNames: [],
                    hiddenTags: [],
                    hiddenFileTags: [],
                    fileVisibility: getActiveVaultProfile(settings).fileVisibility,
                    propertyKeys: [],
                    navigationBanner: null
                }
            });
            return null;
        }

        renderToStaticMarkup(React.createElement(Host));
        const renderedState = state as NavigationRootReorderState | null;
        expect(renderedState).not.toBeNull();
        if (!renderedState) {
            throw new Error('Expected reorder state');
        }
        expect(renderedState.canReorderSections).toBe(false);
        expect(renderedState.canReorderRootTypes).toBe(true);
        expect(renderedState.canReorderRootItems).toBe(true);
        expect(renderedState.typeReorderItems.map(item => item.props.count)).toEqual(['3', '12']);

        await renderedState.setTypeNavigationSortOrder('count-desc', [TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, TPS_NAVIGATOR_TYPE_IDS.NOTES]);
        expect(settings.typeNavigationSortOrder).toBe('count-desc');
        expect(settings.rootTypeOrder).toEqual([]);

        await renderedState.setTypeNavigationSortOrder('manual', [TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, TPS_NAVIGATOR_TYPE_IDS.NOTES]);
        expect(settings.typeNavigationSortOrder).toBe('manual');
        expect(settings.rootTypeOrder).toEqual([TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, TPS_NAVIGATOR_TYPE_IDS.NOTES]);

        await renderedState.reorderRootTypeOrder([TPS_NAVIGATOR_TYPE_IDS.NOTES, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES]);
        expect(settings.typeNavigationSortOrder).toBe('manual');
        expect(settings.rootTypeOrder).toEqual([TPS_NAVIGATOR_TYPE_IDS.NOTES, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES]);
        expect(updateSettings).toHaveBeenCalledTimes(3);
    });
});
