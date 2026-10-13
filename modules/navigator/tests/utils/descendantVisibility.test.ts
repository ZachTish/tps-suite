import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import { ALL_TAGS_TAG_ID, ItemType } from '../../src/types';
import {
    getDescendantVisibilityTarget,
    isAggregateNavigationSelection,
    resolveSelectionIncludeDescendants,
    setSelectionIncludeDescendants
} from '../../src/utils/descendantVisibility';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';

function createSettings(): NotebookNavigatorSettings {
    return structuredClone(DEFAULT_SETTINGS);
}

describe('per-view descendant visibility', () => {
    it('keeps folder, tag, and property choices independent while untouched views inherit the default', () => {
        const settings = createSettings();
        const projects = { selectionType: ItemType.FOLDER, selectedFolderPath: 'Projects' } as const;
        const archive = { selectionType: ItemType.FOLDER, selectedFolderPath: 'Archive' } as const;
        const workTag = { selectionType: ItemType.TAG, selectedTag: 'work' } as const;
        const openStatusProperty = {
            selectionType: ItemType.PROPERTY,
            selectedProperty: buildPropertyValueNodeId('status', 'open')
        } as const;

        expect(resolveSelectionIncludeDescendants(settings, projects, false)).toBe(false);
        expect(setSelectionIncludeDescendants(settings, projects, true)).toBe(true);
        expect(setSelectionIncludeDescendants(settings, archive, false)).toBe(true);
        expect(setSelectionIncludeDescendants(settings, workTag, true)).toBe(true);
        expect(setSelectionIncludeDescendants(settings, openStatusProperty, false)).toBe(true);

        expect(resolveSelectionIncludeDescendants(settings, projects, false)).toBe(true);
        expect(resolveSelectionIncludeDescendants(settings, archive, true)).toBe(false);
        expect(resolveSelectionIncludeDescendants(settings, workTag, false)).toBe(true);
        expect(resolveSelectionIncludeDescendants(settings, openStatusProperty, true)).toBe(false);
        expect(
            resolveSelectionIncludeDescendants(settings, { selectionType: ItemType.FOLDER, selectedFolderPath: 'Unconfigured' }, true)
        ).toBe(true);
    });

    it('keeps aggregate Tags and property-key rows outside descendant persistence', () => {
        const settings = createSettings();
        const allTags = { selectionType: ItemType.TAG, selectedTag: ALL_TAGS_TAG_ID } as const;
        const statusProperty = {
            selectionType: ItemType.PROPERTY,
            selectedProperty: buildPropertyKeyNodeId('status')
        } as const;

        expect(isAggregateNavigationSelection(allTags)).toBe(true);
        expect(isAggregateNavigationSelection(statusProperty)).toBe(true);
        expect(getDescendantVisibilityTarget(allTags)).toBeNull();
        expect(getDescendantVisibilityTarget(statusProperty)).toBeNull();
        expect(setSelectionIncludeDescendants(settings, allTags, false)).toBe(false);
        expect(setSelectionIncludeDescendants(settings, statusProperty, false)).toBe(false);
        expect(settings.tagAppearances).toEqual({});
        expect(settings.propertyAppearances).toEqual({});
    });

    it('persists a root-folder choice while leaving Type collections outside descendant semantics', () => {
        const settings = createSettings();

        expect(getDescendantVisibilityTarget({ selectionType: ItemType.FOLDER, selectedFolderPath: '/' })).toEqual({
            recordKey: 'folderAppearances',
            key: '/'
        });
        expect(setSelectionIncludeDescendants(settings, { selectionType: ItemType.FOLDER, selectedFolderPath: '/' }, false)).toBe(true);
        expect(resolveSelectionIncludeDescendants(settings, { selectionType: ItemType.FOLDER, selectedFolderPath: '/' }, true)).toBe(false);
        expect(setSelectionIncludeDescendants(settings, { selectionType: ItemType.TYPE }, true)).toBe(false);
        expect(settings.folderAppearances).toEqual({ '/': { includeDescendants: false } });
        expect(settings.typeAppearances).toEqual({});
    });

    it('preserves unrelated appearance fields when the descendant choice changes', () => {
        const settings = createSettings();
        settings.folderAppearances.Projects = { mode: 'compact', groupBy: 'folder' };

        expect(setSelectionIncludeDescendants(settings, { selectionType: ItemType.FOLDER, selectedFolderPath: 'Projects' }, true)).toBe(
            true
        );
        expect(settings.folderAppearances.Projects).toEqual({ mode: 'compact', groupBy: 'folder', includeDescendants: true });
    });
});
