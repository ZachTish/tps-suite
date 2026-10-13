import { describe, expect, it } from 'vitest';
import { resolvePropertyRevealExpansion } from '../../src/hooks/useNavigatorReveal';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId, normalizePropertyTreeValuePath } from '../../src/utils/propertyTree';
import { PROPERTIES_ROOT_VIRTUAL_FOLDER_ID } from '../../src/types';
import type { PropertyTreeNode } from '../../src/types/storage';

describe('property reveal expansion', () => {
    it('expands a collapsed key and keeps the value row when descendants are enabled', () => {
        const keyNodeId = buildPropertyKeyNodeId('status');
        const valueNodeId = buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('working'));

        expect(resolvePropertyRevealExpansion(valueNodeId, true, false, new Set())).toEqual({
            targetProperty: valueNodeId,
            expandPropertiesRoot: false,
            propertyAncestorNodeIdsToExpand: [keyNodeId]
        });
    });

    it('can keep the collapsed global Properties collection as the all-properties target', () => {
        const valueNodeId = buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('working'));

        expect(resolvePropertyRevealExpansion(valueNodeId, true, true, new Set())).toEqual({
            targetProperty: PROPERTIES_ROOT_VIRTUAL_FOLDER_ID,
            expandPropertiesRoot: false,
            propertyAncestorNodeIdsToExpand: []
        });
    });

    it('expands every actual ancestor of a nested property value', () => {
        const keyId = buildPropertyKeyNodeId('kind');
        const entityId = buildPropertyValueNodeId('kind', 'entity');
        const foodId = buildPropertyValueNodeId('kind', 'entity/food');
        const transactionId = buildPropertyValueNodeId('kind', 'entity/food/transaction');
        const makeNode = (id: string, valuePath: string | null, children = new Map<string, PropertyTreeNode>()): PropertyTreeNode => ({
            id: id as PropertyTreeNode['id'],
            kind: valuePath ? 'value' : 'key',
            key: 'kind',
            valuePath,
            name: valuePath ?? 'kind',
            displayPath: valuePath ?? 'kind',
            children,
            notesWithValue: new Set()
        });
        const transaction = makeNode(transactionId, 'entity/food/transaction');
        const food = makeNode(foodId, 'entity/food', new Map([[transactionId, transaction]]));
        const entity = makeNode(entityId, 'entity', new Map([[foodId, food]]));
        const key = makeNode(keyId, null, new Map([[entityId, entity]]));

        expect(resolvePropertyRevealExpansion(transactionId, false, false, new Set([keyId]), new Map([['kind', key]]))).toEqual({
            targetProperty: transactionId,
            expandPropertiesRoot: false,
            propertyAncestorNodeIdsToExpand: [keyId, entityId, foodId]
        });
    });
});
