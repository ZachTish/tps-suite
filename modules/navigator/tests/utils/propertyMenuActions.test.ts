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
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { PropertyTreeService } from '../../src/services/PropertyTreeService';
import type { PropertyTreeNode } from '../../src/types/storage';
import { collectFileMenuPropertyActions } from '../../src/utils/propertyMenuActions';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';

function valueNode(valuePath: string, name: string, notes: string[] = []): PropertyTreeNode {
    return {
        id: buildPropertyValueNodeId('kind', valuePath),
        kind: 'value',
        key: 'kind',
        valuePath,
        name,
        displayPath: valuePath,
        ...(notes.length > 0 ? { assignmentValue: valuePath } : {}),
        children: new Map(),
        notesWithValue: new Set(notes)
    };
}

describe('collectFileMenuPropertyActions', () => {
    it('offers authored nested values but excludes synthetic prefix nodes', () => {
        const transaction = valueNode('entity/food/transaction', 'transaction', ['meal.md']);
        const food = valueNode('entity/food', 'food');
        const entity = valueNode('entity', 'entity', ['entity.md']);
        food.children.set(transaction.id, transaction);
        entity.children.set(food.id, food);
        const keyNode: PropertyTreeNode = {
            id: buildPropertyKeyNodeId('kind'),
            kind: 'key',
            key: 'kind',
            valuePath: null,
            name: 'Kind',
            displayPath: 'Kind',
            children: new Map([[entity.id, entity]]),
            notesWithValue: new Set(['entity.md', 'meal.md'])
        };
        const propertyTreeService = new PropertyTreeService();
        propertyTreeService.updatePropertyTree(new Map([['kind', keyNode]]));
        const settings = {
            ...DEFAULT_SETTINGS,
            vaultProfiles: DEFAULT_SETTINGS.vaultProfiles.map(profile => ({
                ...profile,
                propertyKeys: [{ key: 'Kind', showInNavigation: true, showInList: false, showInFileMenu: true }]
            }))
        };

        expect(collectFileMenuPropertyActions(settings, propertyTreeService)).toEqual([
            { nodeId: entity.id, keyNodeId: keyNode.id, label: 'Kind: entity' },
            { nodeId: transaction.id, keyNodeId: keyNode.id, label: 'Kind: entity/food/transaction' }
        ]);
    });
});
