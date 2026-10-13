import { describe, expect, it } from 'vitest';
import { orderTypeNavigationDescriptors, mergeVisibleTypeNavigationOrder } from '../../src/utils/typeNavigationOrder';
import {
    createTpsNavigatorProviderTypeId,
    TPS_NAVIGATOR_TYPE_IDS,
    type TpsNavigatorTypeDescriptor,
    type TpsNavigatorTypeId
} from '../../src/types/navigatorTypes';

const NOTES = TPS_NAVIGATOR_TYPE_IDS.NOTES;
const CHECKBOXES = TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES;
const TABLES = TPS_NAVIGATOR_TYPE_IDS.TABLES;
const CONTEXTS = createTpsNavigatorProviderTypeId('example/entities', 'contexts')!;
const PROJECTS = createTpsNavigatorProviderTypeId('example/entities', 'projects')!;

function descriptor(
    id: TpsNavigatorTypeId,
    label: string,
    count: number,
    options: { showCount?: boolean } = {}
): TpsNavigatorTypeDescriptor {
    return {
        id,
        label,
        count,
        icon: 'lucide-shapes',
        category: 'structure',
        ...options
    };
}

describe('orderTypeNavigationDescriptors', () => {
    const catalog = [
        descriptor(NOTES, 'Notes', 7),
        descriptor(TABLES, 'Table 10', 0),
        descriptor(CHECKBOXES, 'Table 2', 7),
        descriptor(CONTEXTS, 'Contexts', 0, { showCount: false })
    ];

    it('preserves catalog order without mutating the source array', () => {
        const result = orderTypeNavigationDescriptors(catalog, 'catalog');

        expect(result.map(item => item.id)).toEqual([NOTES, TABLES, CHECKBOXES, CONTEXTS]);
        expect(result).not.toBe(catalog);
        expect(catalog.map(item => item.id)).toEqual([NOTES, TABLES, CHECKBOXES, CONTEXTS]);
    });

    it('sorts labels naturally in both directions and uses the stable Type ID for equal labels', () => {
        const equalLabelProvider = descriptor(PROJECTS, 'Notes', 3, { showCount: false });
        const source = [...catalog, equalLabelProvider];

        expect(orderTypeNavigationDescriptors(source, 'alpha-asc').map(item => `${item.label}:${item.id}`)).toEqual([
            `Contexts:${CONTEXTS}`,
            `Notes:${NOTES}`,
            `Notes:${PROJECTS}`,
            `Table 2:${CHECKBOXES}`,
            `Table 10:${TABLES}`
        ]);
        expect(orderTypeNavigationDescriptors(source, 'alpha-desc').map(item => `${item.label}:${item.id}`)).toEqual([
            `Table 10:${TABLES}`,
            `Table 2:${CHECKBOXES}`,
            `Notes:${NOTES}`,
            `Notes:${PROJECTS}`,
            `Contexts:${CONTEXTS}`
        ]);
    });

    it('sorts known quantities, keeps a real zero ahead of unknown counts, and resolves ties deterministically', () => {
        const source = [
            descriptor(TABLES, 'Tables', 0),
            descriptor(CONTEXTS, 'Contexts', 0, { showCount: false }),
            descriptor(NOTES, 'Notes', 7),
            descriptor(CHECKBOXES, 'Checkboxes', 7),
            descriptor(PROJECTS, 'Projects', 99, { showCount: false })
        ];

        expect(orderTypeNavigationDescriptors(source, 'count-desc').map(item => item.id)).toEqual([
            CHECKBOXES,
            NOTES,
            TABLES,
            CONTEXTS,
            PROJECTS
        ]);
        expect(orderTypeNavigationDescriptors(source, 'count-asc').map(item => item.id)).toEqual([
            TABLES,
            CHECKBOXES,
            NOTES,
            CONTEXTS,
            PROJECTS
        ]);
    });

    it('sanitizes malformed and duplicate manual IDs and appends new descriptors in catalog order', () => {
        const manualOrder: readonly unknown[] = ['bad-id', CHECKBOXES, CHECKBOXES, 42, CONTEXTS, 'provider:bad'] as const;

        expect(orderTypeNavigationDescriptors(catalog, 'manual', manualOrder).map(item => item.id)).toEqual([
            CHECKBOXES,
            CONTEXTS,
            NOTES,
            TABLES
        ]);
    });

    it('preserves saved provider placement across temporary disappearance and reappearance', () => {
        const savedOrder = [CHECKBOXES, CONTEXTS, NOTES];
        const withProvider = [descriptor(NOTES, 'Notes', 1), descriptor(CONTEXTS, 'Contexts', 0), descriptor(CHECKBOXES, 'Tasks', 2)];
        const withoutProvider = withProvider.filter(item => item.id !== CONTEXTS);

        expect(orderTypeNavigationDescriptors(withProvider, 'manual', savedOrder).map(item => item.id)).toEqual(savedOrder);
        expect(orderTypeNavigationDescriptors(withoutProvider, 'manual', savedOrder).map(item => item.id)).toEqual([CHECKBOXES, NOTES]);
        expect(orderTypeNavigationDescriptors(withProvider, 'manual', savedOrder).map(item => item.id)).toEqual(savedOrder);
    });
});

describe('mergeVisibleTypeNavigationOrder', () => {
    it('leaves absent provider IDs in their slots while replacing visible slots in the requested order', () => {
        expect(mergeVisibleTypeNavigationOrder([TABLES, NOTES, CHECKBOXES], [NOTES, CONTEXTS, CHECKBOXES, PROJECTS, TABLES])).toEqual([
            TABLES,
            CONTEXTS,
            NOTES,
            PROJECTS,
            CHECKBOXES
        ]);
    });

    it('persists newly discovered visible Types in the requested position on the first reorder', () => {
        expect(mergeVisibleTypeNavigationOrder([CHECKBOXES, TABLES, NOTES], [NOTES, CONTEXTS, CHECKBOXES])).toEqual([
            CHECKBOXES,
            CONTEXTS,
            TABLES,
            NOTES
        ]);
    });

    it('moves a newly discovered Type between stored Types on the first reorder', () => {
        expect(mergeVisibleTypeNavigationOrder([NOTES, TABLES, CHECKBOXES], [NOTES, CHECKBOXES])).toEqual([NOTES, TABLES, CHECKBOXES]);
    });

    it('filters malformed and duplicate visible and stored IDs at the persistence boundary', () => {
        const visible: readonly unknown[] = ['bad-id', CHECKBOXES, CHECKBOXES, NOTES, null];
        const stored: readonly unknown[] = [NOTES, 'provider:bad', NOTES, CONTEXTS, 17, CHECKBOXES];

        expect(mergeVisibleTypeNavigationOrder(visible, stored)).toEqual([CHECKBOXES, CONTEXTS, NOTES]);
    });

    it('preserves a temporarily absent provider so it returns to the same anchored position', () => {
        const stored = [NOTES, CONTEXTS, CHECKBOXES];
        const duringAbsence = mergeVisibleTypeNavigationOrder([CHECKBOXES, NOTES], stored);

        expect(duringAbsence).toEqual([CHECKBOXES, CONTEXTS, NOTES]);
        expect(
            orderTypeNavigationDescriptors(
                [descriptor(NOTES, 'Notes', 1), descriptor(CONTEXTS, 'Contexts', 0), descriptor(CHECKBOXES, 'Tasks', 2)],
                'manual',
                duringAbsence
            ).map(item => item.id)
        ).toEqual([CHECKBOXES, CONTEXTS, NOTES]);
    });
});
