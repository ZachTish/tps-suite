import { describe, expect, it } from 'vitest';
import {
    buildNavigationTypeItems,
    buildNavigationTypeReorderItems,
    expandTypeSelectionAncestors,
    getTypeSelectionAncestorIds
} from '../../src/hooks/navigationPane/data/useNavigationPaneTypeSection';
import { TYPES_ROOT_VIRTUAL_FOLDER_ID } from '../../src/types';
import {
    createTpsNavigatorProviderTypeId,
    TPS_NAVIGATOR_TYPE_IDS,
    type TpsNavigatorTypeDescriptor,
    type TpsNavigatorTypesSnapshot
} from '../../src/types/navigatorTypes';

const externalTypeId = createTpsNavigatorProviderTypeId('example/entities', 'contexts')!;

function createSnapshot(descriptors: readonly TpsNavigatorTypeDescriptor[]): TpsNavigatorTypesSnapshot {
    return {
        availability: 'ready',
        descriptors,
        recordsByType: new Map(),
        revision: 1
    };
}

const structuralDescriptor: TpsNavigatorTypeDescriptor = {
    id: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
    label: 'Checkboxes',
    icon: 'lucide-square-check-big',
    category: 'structure',
    count: 12
};

const externalDescriptor: TpsNavigatorTypeDescriptor = {
    id: externalTypeId,
    label: 'Contexts',
    icon: 'lucide-at-sign',
    category: 'structure',
    count: 0,
    showCount: false,
    providerId: 'example/entities',
    providerCollectionId: 'contexts'
};

describe('buildNavigationTypeItems', () => {
    it('returns only the collapsed Types root and advertises its children', () => {
        const items = buildNavigationTypeItems(createSnapshot([structuralDescriptor, externalDescriptor]), new Set());

        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({
            key: TYPES_ROOT_VIRTUAL_FOLDER_ID,
            level: 0,
            isSelectable: true,
            hasChildren: true,
            data: {
                id: TYPES_ROOT_VIRTUAL_FOLDER_ID,
                name: 'File types',
                icon: 'lucide-shapes'
            }
        });
    });

    it('shows every catalog descriptor directly under Types', () => {
        const items = buildNavigationTypeItems(
            createSnapshot([structuralDescriptor, externalDescriptor]),
            new Set([TYPES_ROOT_VIRTUAL_FOLDER_ID])
        );

        expect(items.map(item => item.key)).toEqual([TYPES_ROOT_VIRTUAL_FOLDER_ID, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, externalTypeId]);
        expect(items[1]).toMatchObject({
            level: 1,
            typeCollectionId: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            isSelectable: true,
            hasChildren: false,
            showFileCount: true,
            noteCount: { current: 12, descendants: 0, total: 12 }
        });
    });

    it('uses only the Types root as the virtual ancestor for built-in and provider IDs', () => {
        expect(getTypeSelectionAncestorIds(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)).toEqual([TYPES_ROOT_VIRTUAL_FOLDER_ID]);
        expect(getTypeSelectionAncestorIds(externalTypeId)).toEqual([TYPES_ROOT_VIRTUAL_FOLDER_ID]);

        const structuralExpansion = expandTypeSelectionAncestors(new Set(), TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES);
        expect(structuralExpansion).toEqual(new Set([TYPES_ROOT_VIRTUAL_FOLDER_ID]));

        const providerExpansion = expandTypeSelectionAncestors(new Set(['unrelated']), externalTypeId);
        expect(providerExpansion).toEqual(new Set(['unrelated', TYPES_ROOT_VIRTUAL_FOLDER_ID]));
        expect(expandTypeSelectionAncestors(providerExpansion, externalTypeId)).toBe(providerExpansion);
    });

    it('builds a rootless reorder list in caller-provided order with the same visible counts', () => {
        const items = buildNavigationTypeReorderItems(createSnapshot([structuralDescriptor, externalDescriptor]));

        expect(items.map(item => item.key)).toEqual([TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, externalTypeId]);
        expect(items[0]).toMatchObject({
            level: 1,
            showFileCount: true,
            noteCount: { current: 12, descendants: 0, total: 12 }
        });
        expect(items[1]).toMatchObject({ level: 1, showFileCount: false });
        expect(items[1]).not.toHaveProperty('noteCount');
    });

    it('renders external collections directly under Types without a misleading pre-query count', () => {
        const items = buildNavigationTypeItems(
            createSnapshot([structuralDescriptor, externalDescriptor]),
            new Set([TYPES_ROOT_VIRTUAL_FOLDER_ID])
        );

        expect(items.map(item => item.key)).toEqual([TYPES_ROOT_VIRTUAL_FOLDER_ID, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, externalTypeId]);
        expect(items[2]).toMatchObject({
            level: 1,
            key: externalTypeId,
            typeCollectionId: externalTypeId,
            showFileCount: false,
            data: { name: 'Contexts', icon: 'lucide-at-sign' }
        });
        expect(items[2]).not.toHaveProperty('noteCount');
        expect(getTypeSelectionAncestorIds(externalTypeId, [externalDescriptor])).toEqual([TYPES_ROOT_VIRTUAL_FOLDER_ID]);
    });

    it('marks an empty root as childless', () => {
        const structuralItems = buildNavigationTypeItems(createSnapshot([structuralDescriptor]), new Set([TYPES_ROOT_VIRTUAL_FOLDER_ID]));
        const emptyItems = buildNavigationTypeItems(createSnapshot([]), new Set());

        expect(structuralItems.map(item => item.key)).toEqual([TYPES_ROOT_VIRTUAL_FOLDER_ID, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES]);
        expect(emptyItems).toHaveLength(1);
        expect(emptyItems[0].hasChildren).toBe(false);
    });
});
