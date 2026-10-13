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
import { App, TFolder } from 'obsidian';
import { ShortcutStartType } from '../../src/types/shortcuts';
import {
    canSaveSearchShortcutQuery,
    getSearchActivationQuery,
    getNavigationSearchQuery,
    getTypeFacetQueryWithNavigationSelection,
    includeNavigationSelectionInSearchQuery,
    resolveSearchShortcutStartFolderPath,
    resolveSearchShortcutStartTarget
} from '../../src/hooks/useListPaneSearch';
import { ALL_TAGS_TAG_ID, ItemType, PROPERTIES_ROOT_VIRTUAL_FOLDER_ID, TAGGED_TAG_ID, UNTAGGED_TAG_ID } from '../../src/types';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';
import { updateFilterQueryWithTag, updateFilterQueryWithType } from '../../src/utils/filterSearch';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';
import type { PropertyTreeNode, TagTreeNode } from '../../src/types/storage';

interface TestVaultRegistration {
    registerFolder(folder: TFolder): void;
}

function getTestVault(app: App): TestVaultRegistration {
    return app.vault as unknown as TestVaultRegistration;
}

describe('resolveSearchShortcutStartFolderPath', () => {
    it('resolves folder start targets with mismatched casing', () => {
        const app = new App();
        getTestVault(app).registerFolder(new TFolder('applab/skills-workflows/mmgi'));

        expect(
            resolveSearchShortcutStartFolderPath(app, {
                type: ShortcutStartType.FOLDER,
                path: 'appLab/SKILLS-WORKFLOWS/mmgi'
            })
        ).toBe('applab/skills-workflows/mmgi');
    });
});

describe('resolveSearchShortcutStartTarget', () => {
    const tagNode = { path: 'projects/active' } as TagTreeNode;
    const propertyNode = { id: buildPropertyValueNodeId('status', 'active') } as PropertyTreeNode;
    const lookup = {
        tagTreeService: {
            findTagNode: (tagPath: string) => (tagPath === tagNode.path ? tagNode : null)
        },
        propertyTreeService: {
            findNode: (nodeId: string) => (nodeId === propertyNode.id ? propertyNode : null)
        }
    };

    it('resolves exact folder, tag, property, and virtual collection start targets', () => {
        const app = new App();
        getTestVault(app).registerFolder(new TFolder('Projects/Active'));

        expect(resolveSearchShortcutStartTarget(app, { type: ShortcutStartType.FOLDER, path: 'projects/active' }, lookup)).toEqual({
            type: ShortcutStartType.FOLDER,
            path: 'Projects/Active'
        });
        expect(resolveSearchShortcutStartTarget(app, { type: ShortcutStartType.TAG, tagPath: '#Projects/Active' }, lookup)).toEqual({
            type: ShortcutStartType.TAG,
            tagPath: 'projects/active'
        });
        expect(resolveSearchShortcutStartTarget(app, { type: ShortcutStartType.PROPERTY, nodeId: 'key:STATUS=ACTIVE' }, lookup)).toEqual({
            type: ShortcutStartType.PROPERTY,
            nodeId: propertyNode.id
        });
        expect(resolveSearchShortcutStartTarget(app, { type: ShortcutStartType.TAG, tagPath: TAGGED_TAG_ID }, lookup)).toEqual({
            type: ShortcutStartType.TAG,
            tagPath: TAGGED_TAG_ID
        });
        expect(resolveSearchShortcutStartTarget(app, { type: ShortcutStartType.TAG, tagPath: ALL_TAGS_TAG_ID }, lookup)).toEqual({
            type: ShortcutStartType.TAG,
            tagPath: ALL_TAGS_TAG_ID
        });
        expect(
            resolveSearchShortcutStartTarget(app, { type: ShortcutStartType.PROPERTY, nodeId: PROPERTIES_ROOT_VIRTUAL_FOLDER_ID }, lookup)
        ).toEqual({ type: ShortcutStartType.PROPERTY, nodeId: PROPERTIES_ROOT_VIRTUAL_FOLDER_ID });
    });

    it('rejects missing folder, tag, and exact property value targets', () => {
        const app = new App();

        expect(resolveSearchShortcutStartTarget(app, { type: ShortcutStartType.FOLDER, path: 'missing' }, lookup)).toBeNull();
        expect(resolveSearchShortcutStartTarget(app, { type: ShortcutStartType.TAG, tagPath: 'missing' }, lookup)).toBeNull();
        expect(
            resolveSearchShortcutStartTarget(
                app,
                { type: ShortcutStartType.PROPERTY, nodeId: buildPropertyValueNodeId('status', 'missing') },
                lookup
            )
        ).toBeNull();
    });
});

describe('search-bar navigation source of truth', () => {
    it('shows the selected Checkboxes Type as soon as Search opens', () => {
        expect(
            getSearchActivationQuery('', {
                selectionType: ItemType.TYPE,
                selectedTag: null,
                selectedProperty: null,
                selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES
            })
        ).toBe('type:structural:task');
    });

    it('does not materialize a stale Type selection while Types navigation is paused', () => {
        const selection = {
            selectionType: ItemType.TYPE,
            selectedTag: null,
            selectedProperty: null,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES
        } as const;

        expect(getSearchActivationQuery('', selection, false)).toBe('');
        expect(includeNavigationSelectionInSearchQuery('meeting', selection, false)).toBe('meeting');
    });

    it('includes the selected property value before a Type facet is added', () => {
        const query = includeNavigationSelectionInSearchQuery('type:structural:task', {
            selectionType: ItemType.PROPERTY,
            selectedTag: null,
            selectedProperty: buildPropertyValueNodeId('status', 'todo'),
            selectedType: null
        });

        expect(query).toBe('type:structural:task .status==todo');
        expect(
            includeNavigationSelectionInSearchQuery(query, {
                selectionType: ItemType.PROPERTY,
                selectedTag: null,
                selectedProperty: buildPropertyValueNodeId('status', 'todo'),
                selectedType: null
            })
        ).toBe(query);
    });

    it('materializes a selected property key as a key-presence filter', () => {
        const selection = {
            selectionType: ItemType.PROPERTY,
            selectedTag: null,
            selectedProperty: buildPropertyKeyNodeId('status'),
            selectedType: null
        } as const;

        expect(includeNavigationSelectionInSearchQuery('', selection)).toBe('.status');
        expect(includeNavigationSelectionInSearchQuery('.status', selection)).toBe('.status');
        expect(getSearchActivationQuery('', selection)).toBe('.status');
    });

    it('does not narrow Search when the aggregate Tags root is selected', () => {
        const selection = {
            selectionType: ItemType.TAG,
            selectedTag: ALL_TAGS_TAG_ID,
            selectedProperty: null,
            selectedType: null
        } as const;

        expect(includeNavigationSelectionInSearchQuery('meeting', selection)).toBe('meeting');
        expect(getSearchActivationQuery('', selection)).toBe('');
    });

    it('represents the selected Untagged collection explicitly and idempotently', () => {
        const selection = {
            selectionType: ItemType.TAG,
            selectedTag: UNTAGGED_TAG_ID,
            selectedProperty: null,
            selectedType: null
        } as const;

        expect(includeNavigationSelectionInSearchQuery('type:structural:task', selection)).toBe('type:structural:task -#');
        expect(includeNavigationSelectionInSearchQuery('type:structural:task -#', selection)).toBe('type:structural:task -#');
    });

    it('keeps a selected tag as the source scope when adding an exact-line Type facet', () => {
        const selection = {
            selectionType: ItemType.TAG,
            selectedTag: 'projects/active',
            selectedProperty: null,
            selectedType: null
        } as const;

        const baseQuery = getTypeFacetQueryWithNavigationSelection('', selection);
        expect(baseQuery).toBe('');
        expect(updateFilterQueryWithType(baseQuery, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES).query).toBe('type:structural:task');
    });

    it('includes the selected Checkboxes Type before adding a tag facet', () => {
        const selectedTypeQuery = includeNavigationSelectionInSearchQuery('', {
            selectionType: ItemType.TYPE,
            selectedTag: null,
            selectedProperty: null,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES
        });

        expect(updateFilterQueryWithTag(selectedTypeQuery, 'hca', 'AND').query).toBe('type:structural:task #hca');
    });
});

describe('search shortcut query validation', () => {
    it('blocks invalid Filter Search queries but leaves Omnisearch syntax opaque', () => {
        expect(canSaveSearchShortcutQuery('folder:', 'internal')).toBe(false);
        expect(canSaveSearchShortcutQuery('#alpha OR meeting', 'internal')).toBe(false);
        expect(canSaveSearchShortcutQuery('#work OR ext:md', 'internal')).toBe(false);
        expect(canSaveSearchShortcutQuery('#alpha OR #beta', 'internal')).toBe(true);
        expect(canSaveSearchShortcutQuery('OR', 'internal')).toBe(true);
        expect(canSaveSearchShortcutQuery('alpha OR beta', 'internal')).toBe(true);
        expect(canSaveSearchShortcutQuery('research and development', 'internal')).toBe(true);
        expect(canSaveSearchShortcutQuery('folder:', 'omnisearch')).toBe(true);
    });

    it('blocks Type facets while Types collections are turned off', () => {
        expect(
            canSaveSearchShortcutQuery(`type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES}`, 'internal', {
                typesNavigationEnabled: false
            })
        ).toBe(false);
    });
});

describe('root-scoped navigation queries', () => {
    const root = {
        selectionType: ItemType.FOLDER,
        selectedFolder: { path: '/' },
        selectedTag: null,
        selectedProperty: null,
        selectedType: null
    } as const;

    it('leaves an already-rooted query alone, including when it is cleared', () => {
        expect(getNavigationSearchQuery(root, false)).toBeNull();
        expect(getNavigationSearchQuery(root, true)).toBeNull();
    });

    it.each([ALL_TAGS_TAG_ID, PROPERTIES_ROOT_VIRTUAL_FOLDER_ID])('turns aggregate %s into an empty vault-wide search', id => {
        const selection =
            id === ALL_TAGS_TAG_ID
                ? { ...root, selectionType: ItemType.TAG, selectedTag: id }
                : { ...root, selectionType: ItemType.PROPERTY, selectedProperty: id };
        expect(getNavigationSearchQuery(selection, false)).toBe('');
    });

    it.each([
        ['work/projects', '#work/projects'],
        [TAGGED_TAG_ID, '#'],
        [UNTAGGED_TAG_ID, '-#']
    ])('represents tag %s entirely in the query', (selectedTag, query) => {
        expect(getNavigationSearchQuery({ ...root, selectionType: ItemType.TAG, selectedTag }, true)).toBe(query);
    });

    it('represents property keys and values entirely in the query', () => {
        expect(
            getNavigationSearchQuery(
                { ...root, selectionType: ItemType.PROPERTY, selectedProperty: buildPropertyKeyNodeId('status') },
                true
            )
        ).toBe('.status');
        expect(
            getNavigationSearchQuery(
                { ...root, selectionType: ItemType.PROPERTY, selectedProperty: buildPropertyValueNodeId('status', 'in progress') },
                true
            )
        ).toBe('.status=="in progress"');
    });

    it('uses a slash-boundary subtree query for an expanded property parent and an exact query for a leaf', () => {
        const parentId = buildPropertyValueNodeId('kind', 'entity');
        const childId = buildPropertyValueNodeId('kind', 'entity/physical');
        const parent = { id: parentId, children: new Map([[childId, { id: childId }]]) } as PropertyTreeNode;
        const child = { id: childId, children: new Map() } as PropertyTreeNode;
        const propertyTreeProvider = {
            findNode: (nodeId: string) => (nodeId === parentId ? parent : nodeId === childId ? child : null)
        };

        expect(
            getNavigationSearchQuery(
                { ...root, selectionType: ItemType.PROPERTY, selectedProperty: parentId },
                true,
                true,
                propertyTreeProvider
            )
        ).toBe('.kind^=entity');
        expect(
            getNavigationSearchQuery(
                { ...root, selectionType: ItemType.PROPERTY, selectedProperty: parentId },
                false,
                true,
                propertyTreeProvider
            )
        ).toBe('.kind==entity');
        expect(
            getNavigationSearchQuery(
                { ...root, selectionType: ItemType.PROPERTY, selectedProperty: childId },
                true,
                true,
                propertyTreeProvider
            )
        ).toBe('.kind==entity/physical');
    });

    it('represents file and structural types using the existing filter grammar', () => {
        for (const selectedType of [TPS_NAVIGATOR_TYPE_IDS.NOTES, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES]) {
            const selection = { ...root, selectionType: ItemType.TYPE, selectedType };
            expect(getNavigationSearchQuery(selection, true)).toBe(getSearchActivationQuery('', selection));
        }
    });

    it('quotes folders and expresses descendant visibility in the visible query', () => {
        const selection = { ...root, selectedFolder: { path: 'Projects/Team "A"' } };
        expect(getNavigationSearchQuery(selection, false)).toBe('folder:' + JSON.stringify('/Projects/Team "A"'));
        expect(getNavigationSearchQuery(selection, true)).toBe('folder:' + JSON.stringify('/Projects/Team "A"/**'));
    });
});
