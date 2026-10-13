import { describe, expect, it } from 'vitest';
import { isSelectableNavigationItem, resolvePropertyValueKeyboardParentId } from '../../src/hooks/useNavigationPaneKeyboard';
import { NavigationPaneItemType, TYPES_ROOT_VIRTUAL_FOLDER_ID } from '../../src/types';
import type { PropertyTreeNode } from '../../src/types/storage';
import type { VirtualFolderItem } from '../../src/types/virtualization';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';

function createVirtualFolder(id: string, overrides: Partial<VirtualFolderItem> = {}): VirtualFolderItem {
    return {
        type: NavigationPaneItemType.VIRTUAL_FOLDER,
        data: { id, name: id },
        key: id,
        level: 0,
        hasChildren: true,
        ...overrides
    };
}

describe('Types keyboard navigation', () => {
    it('makes the Types root reachable when its builder marks it selectable', () => {
        expect(isSelectableNavigationItem(createVirtualFolder(TYPES_ROOT_VIRTUAL_FOLDER_ID, { isSelectable: true }))).toBe(true);
    });

    it('does not make unrelated virtual headers keyboard selections', () => {
        expect(isSelectableNavigationItem(createVirtualFolder('unrelated', { isSelectable: true }))).toBe(false);
    });

    it('keeps descriptor-backed Type rows keyboard selectable', () => {
        expect(
            isSelectableNavigationItem(
                createVirtualFolder('tps-type:structural:task', {
                    isSelectable: true,
                    typeCollectionId: 'structural:task',
                    hasChildren: false
                })
            )
        ).toBe(true);
    });
});

describe('property keyboard parent navigation', () => {
    it('moves from a nested leaf to its immediate actual parent', () => {
        const key: PropertyTreeNode = {
            id: buildPropertyKeyNodeId('kind'),
            kind: 'key',
            key: 'kind',
            valuePath: null,
            name: 'kind',
            displayPath: 'kind',
            children: new Map(),
            notesWithValue: new Set()
        };
        const entity: PropertyTreeNode = {
            ...key,
            id: buildPropertyValueNodeId('kind', 'entity'),
            kind: 'value',
            valuePath: 'entity',
            name: 'entity',
            displayPath: 'entity',
            children: new Map()
        };
        const food: PropertyTreeNode = {
            ...entity,
            id: buildPropertyValueNodeId('kind', 'entity/food'),
            valuePath: 'entity/food',
            name: 'food',
            displayPath: 'entity/food',
            children: new Map()
        };
        const leaf: PropertyTreeNode = {
            ...food,
            id: buildPropertyValueNodeId('kind', 'entity/food/transaction'),
            valuePath: 'entity/food/transaction',
            name: 'transaction',
            displayPath: 'entity/food/transaction'
        };
        food.children.set(leaf.id, leaf);
        entity.children.set(food.id, food);
        key.children.set(entity.id, entity);

        expect(resolvePropertyValueKeyboardParentId(leaf, key)).toBe(food.id);
        expect(resolvePropertyValueKeyboardParentId(entity, key)).toBe(key.id);
    });

    it('keeps an atomic slash-containing value directly under its key', () => {
        const key: PropertyTreeNode = {
            id: buildPropertyKeyNodeId('link'),
            kind: 'key',
            key: 'link',
            valuePath: null,
            name: 'link',
            displayPath: 'link',
            children: new Map(),
            notesWithValue: new Set()
        };
        const url: PropertyTreeNode = {
            ...key,
            id: buildPropertyValueNodeId('link', 'https://example.com/a'),
            kind: 'value',
            valuePath: 'https://example.com/a',
            name: 'https://example.com/a',
            displayPath: 'https://example.com/a'
        };
        key.children.set(url.id, url);

        expect(resolvePropertyValueKeyboardParentId(url, key)).toBe(key.id);
    });
});
