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
import { TFolder } from 'obsidian';
import type { ExpansionAction } from '../../src/context/ExpansionContext';
import { NavigationPaneItemType, TYPES_ROOT_VIRTUAL_FOLDER_ID } from '../../src/types';
import type { CombinedNavigationItem, VirtualFolderItem } from '../../src/types/virtualization';
import type { PropertyTreeNode } from '../../src/types/storage';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';
import {
    getFolderAncestorPaths,
    getNavigationExpansionTargetForItem,
    getPropertyAncestorNodeIds,
    isFolderEffectivelyExpanded,
    isFolderExpansionLocked,
    toggleNavigationExpansionTarget
} from '../../src/utils/navigationExpansion';

describe('navigationExpansion', () => {
    it('keeps the actual nested property branch without inventing parents for a slash-containing link', () => {
        const keyId = buildPropertyKeyNodeId('kind');
        const entityId = buildPropertyValueNodeId('kind', 'entity');
        const foodId = buildPropertyValueNodeId('kind', 'entity/food');
        const leafId = buildPropertyValueNodeId('kind', 'entity/food/transaction');
        const makeNode = (id: PropertyTreeNode['id'], valuePath: string | null): PropertyTreeNode => ({
            id,
            kind: valuePath ? 'value' : 'key',
            key: 'kind',
            valuePath,
            name: valuePath ?? 'kind',
            displayPath: valuePath ?? 'kind',
            children: new Map(),
            notesWithValue: new Set()
        });
        const key = makeNode(keyId, null);
        const entity = makeNode(entityId, 'entity');
        const food = makeNode(foodId, 'entity/food');
        const leaf = makeNode(leafId, 'entity/food/transaction');
        food.children.set(leafId, leaf);
        entity.children.set(foodId, food);
        key.children.set(entityId, entity);

        expect(getPropertyAncestorNodeIds(leafId, key)).toEqual([keyId, entityId, foodId]);
        const leafItem: CombinedNavigationItem = {
            type: NavigationPaneItemType.PROPERTY_VALUE,
            data: leaf,
            key: leafId,
            level: 3
        };
        expect(getNavigationExpansionTargetForItem(leafItem, { showHiddenItems: false, showRootFolder: true, propertyKeyNode: key })).toEqual({
            type: 'property',
            id: leafId,
            hasChildren: false,
            ancestorIds: [keyId, entityId, foodId]
        });

        const linkId = buildPropertyValueNodeId('kind', 'docs/note');
        key.children.set(linkId, makeNode(linkId, 'docs/note'));
        expect(getPropertyAncestorNodeIds(linkId, key)).toEqual([keyId]);
    });

    it('locks a hidden root open without relying on persisted expansion', () => {
        expect(isFolderExpansionLocked('/', false)).toBe(true);
        expect(isFolderEffectivelyExpanded('/', new Set(), false)).toBe(true);
        expect(isFolderExpansionLocked('/', true)).toBe(false);
        expect(isFolderEffectivelyExpanded('/', new Set(), true)).toBe(false);
        expect(isFolderEffectivelyExpanded('/', new Set(['/']), true)).toBe(true);
    });

    it('omits the locked root from persisted ancestor expansion paths', () => {
        const rootFolder = new TFolder('/');
        const parentFolder = new TFolder('Projects');
        const childFolder = new TFolder('Projects/Active');
        Object.assign(parentFolder, { parent: rootFolder });
        Object.assign(childFolder, { parent: parentFolder });

        expect(getFolderAncestorPaths(childFolder)).toEqual(['/', 'Projects']);
        expect(getFolderAncestorPaths(childFolder, { includeRootFolder: false })).toEqual(['Projects']);
    });

    it('replaces unrelated tag branches when branch collapse is enabled', () => {
        const dispatch = vi.fn<(action: ExpansionAction) => void>();

        const didExpand = toggleNavigationExpansionTarget(
            {
                type: 'tag',
                id: 'projects/active',
                hasChildren: true,
                ancestorIds: ['projects']
            },
            {
                expandedFolders: new Set(),
                expandedTags: new Set(['areas', 'archive']),
                expandedProperties: new Set(),
                expandedVirtualFolders: new Set()
            },
            dispatch,
            'expand',
            { collapseOtherBranches: true }
        );

        expect(didExpand).toBe(true);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'SET_EXPANDED_TAGS',
            tags: new Set(['projects', 'projects/active'])
        });
    });

    it('uses the normal collapse action when the target is already expanded', () => {
        const dispatch = vi.fn<(action: ExpansionAction) => void>();

        const didCollapse = toggleNavigationExpansionTarget(
            {
                type: 'property',
                id: 'key:status',
                hasChildren: true
            },
            {
                expandedFolders: new Set(),
                expandedTags: new Set(),
                expandedProperties: new Set(['key:status', 'key:priority']),
                expandedVirtualFolders: new Set()
            },
            dispatch,
            'toggle',
            { collapseOtherBranches: true }
        );

        expect(didCollapse).toBe(true);
        expect(dispatch).toHaveBeenCalledWith({ type: 'TOGGLE_PROPERTY_EXPANDED', propertyNodeId: 'key:status' });
    });

    it('exposes the Types root as a keyboard expansion target', () => {
        const item: VirtualFolderItem = {
            type: NavigationPaneItemType.VIRTUAL_FOLDER,
            data: { id: TYPES_ROOT_VIRTUAL_FOLDER_ID, name: TYPES_ROOT_VIRTUAL_FOLDER_ID },
            key: TYPES_ROOT_VIRTUAL_FOLDER_ID,
            level: 0,
            isSelectable: true,
            hasChildren: true
        };

        expect(getNavigationExpansionTargetForItem(item, { showHiddenItems: false, showRootFolder: true })).toEqual({
            type: 'virtual-folder',
            id: TYPES_ROOT_VIRTUAL_FOLDER_ID,
            hasChildren: true
        });
    });
});
