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
import { buildPropertyNodeSuggestions } from '../../src/modals/PropertyNodeSuggestModal';
import type { PropertyTreeNode } from '../../src/types/storage';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';

vi.mock('obsidian', async importOriginal => {
    const actual = await importOriginal<typeof import('obsidian')>();
    return {
        ...actual,
        FuzzySuggestModal: class {
            constructor() {}
        }
    };
});

function valueNode(valuePath: string, name: string, notes: string[] = []): PropertyTreeNode {
    return {
        id: buildPropertyValueNodeId('kind', valuePath),
        kind: 'value',
        key: 'kind',
        valuePath,
        name,
        displayPath: valuePath,
        children: new Map(),
        notesWithValue: new Set(notes)
    };
}

describe('buildPropertyNodeSuggestions', () => {
    it('includes nested property paths and grouping parents for navigation', () => {
        const transaction = valueNode('entity/food/transaction', 'transaction', ['meal.md']);
        const food = valueNode('entity/food', 'food');
        const entity = valueNode('entity', 'entity');
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
            notesWithValue: new Set(['meal.md'])
        };

        const suggestions = buildPropertyNodeSuggestions(new Map([['kind', keyNode]]));

        expect(suggestions.map(item => item.nodeId)).toEqual([keyNode.id, entity.id, food.id, transaction.id]);
        expect(suggestions[suggestions.length - 1]).toMatchObject({
            label: 'Kind: entity/food/transaction',
            searchText: 'Kind entity/food/transaction',
            noteCount: 1
        });
    });
});
