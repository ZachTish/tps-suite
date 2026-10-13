import { describe, expect, it } from 'vitest';
import { isPropertyDescendantSettingKey } from '../../src/hooks/useListActions';
import { PropertyTreeService } from '../../src/services/PropertyTreeService';
import { PROPERTIES_ROOT_VIRTUAL_FOLDER_ID } from '../../src/types';
import type { PropertyTreeNode } from '../../src/types/storage';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';

function node(key: string, valuePath: string | null): PropertyTreeNode {
    return {
        id: valuePath === null ? buildPropertyKeyNodeId(key) : buildPropertyValueNodeId(key, valuePath),
        kind: valuePath === null ? 'key' : 'value',
        key,
        valuePath,
        name: valuePath ?? key,
        displayPath: valuePath ?? key,
        children: new Map(),
        notesWithValue: new Set()
    };
}

describe('property descendant settings scope', () => {
    it('uses actual indexed descendants and excludes atomic slash-containing siblings', () => {
        const kind = node('kind', null);
        const entity = node('kind', 'entity');
        const food = node('kind', 'entity/food');
        entity.children.set(food.id, food);
        kind.children.set(entity.id, entity);

        const link = node('link', null);
        const url = node('link', 'https://example.com');
        const longerUrl = node('link', 'https://example.com/path');
        link.children.set(url.id, url);
        link.children.set(longerUrl.id, longerUrl);

        const service = new PropertyTreeService();
        service.updatePropertyTree(
            new Map([
                ['kind', kind],
                ['link', link]
            ])
        );

        expect(isPropertyDescendantSettingKey(entity.id, food.id, service)).toBe(true);
        expect(isPropertyDescendantSettingKey(url.id, longerUrl.id, service)).toBe(false);
        expect(isPropertyDescendantSettingKey(kind.id, food.id, service)).toBe(true);
        expect(isPropertyDescendantSettingKey(PROPERTIES_ROOT_VIRTUAL_FOLDER_ID, food.id, service)).toBe(true);
    });
});
