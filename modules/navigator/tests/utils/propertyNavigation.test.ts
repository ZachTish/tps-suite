import { describe, expect, it, vi } from 'vitest';
import type { PropertyTreeNode } from '../../src/types/storage';
import { navigateToProperty, type PropertyNavigationEnvironment } from '../../src/utils/propertyNavigation';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';

function makeNode(key: string, valuePath: string | null): PropertyTreeNode {
    return {
        id: valuePath ? buildPropertyValueNodeId(key, valuePath) : buildPropertyKeyNodeId(key),
        kind: valuePath ? 'value' : 'key',
        key,
        valuePath,
        name: valuePath ?? key,
        displayPath: valuePath ?? key,
        children: new Map(),
        notesWithValue: new Set()
    };
}

describe('navigateToProperty nested values', () => {
    it('opens all real ancestors before selecting a nested value', () => {
        const key = makeNode('kind', null);
        const entity = makeNode('kind', 'entity');
        const food = makeNode('kind', 'entity/food');
        const transaction = makeNode('kind', 'entity/food/transaction');
        key.children.set(entity.id, entity);
        entity.children.set(food.id, food);
        food.children.set(transaction.id, transaction);
        const expansionDispatch = vi.fn<PropertyNavigationEnvironment['expansionDispatch']>();
        const selectionDispatch = vi.fn<PropertyNavigationEnvironment['selectionDispatch']>();
        const env: PropertyNavigationEnvironment = {
            showProperties: true,
            showAllPropertiesFolder: false,
            propertyTree: new Map([['kind', key]]),
            expandedProperties: new Set([key.id]),
            expandedVirtualFolders: new Set(),
            collapseOtherBranchesOnExpand: true,
            expansionDispatch,
            selectionDispatch,
            activatePane: vi.fn()
        };

        expect(navigateToProperty(env, transaction.id, { skipScroll: true })).toBe(transaction.id);
        expect(expansionDispatch).toHaveBeenCalledWith({
            type: 'SET_EXPANDED_PROPERTIES',
            properties: new Set([key.id, entity.id, food.id])
        });
        expect(selectionDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_SELECTED_PROPERTY', nodeId: transaction.id }));
    });
});
