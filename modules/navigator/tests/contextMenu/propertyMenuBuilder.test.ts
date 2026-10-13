import { describe, expect, it } from 'vitest';
import { resolvePropertyMenuLabel } from '../../src/utils/contextMenu/propertyMenuBuilder';
import type { PropertyTreeNode } from '../../src/types/storage';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';

describe('property context menu label', () => {
    it('includes the full nested path rather than only the final segment', () => {
        const keyNode: PropertyTreeNode = {
            id: buildPropertyKeyNodeId('kind'),
            kind: 'key',
            key: 'kind',
            valuePath: null,
            name: 'Kind',
            displayPath: 'Kind',
            children: new Map(),
            notesWithValue: new Set()
        };
        const valueNode: PropertyTreeNode = {
            ...keyNode,
            id: buildPropertyValueNodeId('kind', 'entity/food/transaction'),
            kind: 'value',
            valuePath: 'entity/food/transaction',
            name: 'transaction',
            displayPath: 'entity/food/transaction'
        };

        expect(resolvePropertyMenuLabel({ propertyNodeId: valueNode.id, propertyNode: valueNode, keyNode })).toBe(
            'Kind = entity/food/transaction'
        );
        expect(resolvePropertyMenuLabel({ propertyNodeId: valueNode.id })).toBe('kind = entity/food/transaction');
    });
});
