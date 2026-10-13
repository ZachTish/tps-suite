import { describe, expect, it } from 'vitest';
import {
    createTpsNavigatorKindTypeId,
    createTpsNavigatorProviderTypeId,
    filterTpsNavigatorTypesSnapshot,
    getTpsNavigatorKindValue,
    isTpsNavigatorTypeId,
    parseTpsNavigatorProviderTypeId,
    TPS_NAVIGATOR_TYPE_IDS,
    type TpsNavigatorTypeDescriptor,
    type TpsNavigatorTypeRecord,
    type TpsNavigatorTypesSnapshot
} from '../../src/types/navigatorTypes';

function createDescriptor(id: TpsNavigatorTypeDescriptor['id'], label: string, count: number): TpsNavigatorTypeDescriptor {
    return {
        id,
        label,
        icon: 'lucide-shapes',
        category: 'structure',
        count
    };
}

function createRecord(id: string, typeId: TpsNavigatorTypeRecord['typeId'], sourcePath: string): TpsNavigatorTypeRecord {
    return {
        id,
        typeId,
        label: id,
        sourcePath,
        entityType: 'note',
        locatorKey: sourcePath,
        referenceTarget: sourcePath
    };
}

describe('TPS navigator type ids', () => {
    it('round-trips deprecated Kind syntax without treating it as an active Type id', () => {
        const typeId = createTpsNavigatorKindTypeId('  Project / Client #1  ');

        expect(typeId).toBe('kind:Project%20%2F%20Client%20%231');
        expect(getTpsNavigatorKindValue(typeId!)).toBe('Project / Client #1');
        expect(isTpsNavigatorTypeId(typeId)).toBe(false);
    });

    it('rejects empty, malformed, and unrelated ids while accepting every structural id', () => {
        expect(createTpsNavigatorKindTypeId('   ')).toBeNull();
        expect(getTpsNavigatorKindValue('kind:')).toBeNull();
        expect(getTpsNavigatorKindValue('kind:%E0%A4%A')).toBeNull();
        expect(getTpsNavigatorKindValue('entity:project')).toBeNull();

        for (const typeId of Object.values(TPS_NAVIGATOR_TYPE_IDS)) {
            expect(isTpsNavigatorTypeId(typeId)).toBe(true);
        }
        expect(isTpsNavigatorTypeId('kind:')).toBe(false);
        expect(isTpsNavigatorTypeId('entity:project')).toBe(false);
        expect(isTpsNavigatorTypeId(null)).toBe(false);
    });

    it('accepts only canonical host-owned provider identifiers', () => {
        const typeId = createTpsNavigatorProviderTypeId('example/entities', 'project-items');
        expect(typeId).toBe('provider:example%2Fentities:project-items');
        expect(isTpsNavigatorTypeId(typeId)).toBe(true);
        expect(parseTpsNavigatorProviderTypeId(typeId!)).toEqual({
            providerId: 'example/entities',
            collectionId: 'project-items'
        });
        expect(isTpsNavigatorTypeId('provider:example%2fentities:project-items')).toBe(false);
        expect(isTpsNavigatorTypeId('provider:example%2Fentities:Project')).toBe(false);
        expect(isTpsNavigatorTypeId('provider:example%2Fentities:project:extra')).toBe(false);
    });
});

describe('filterTpsNavigatorTypesSnapshot', () => {
    it('filters every descriptor to visible sources and recomputes its count without mutating the input', () => {
        const projectTypeId = createTpsNavigatorProviderTypeId('example/entities', 'projects')!;
        const taskRecords = [
            createRecord('visible-task', TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, 'Visible.md'),
            createRecord('hidden-task', TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, 'Hidden.md')
        ];
        const projectRecords = [
            createRecord('visible-project', projectTypeId, 'Projects/Visible.md'),
            createRecord('hidden-project', projectTypeId, 'Projects/Hidden.md')
        ];
        const descriptors = [
            createDescriptor(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, 'Checkboxes', taskRecords.length),
            createDescriptor(projectTypeId, 'Project', projectRecords.length)
        ];
        const snapshot: TpsNavigatorTypesSnapshot = {
            availability: 'ready',
            descriptors,
            recordsByType: new Map([
                [TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, taskRecords],
                [projectTypeId, projectRecords]
            ]),
            revision: 17,
            message: 'ready'
        };

        const filtered = filterTpsNavigatorTypesSnapshot(snapshot, new Set(['Visible.md', 'Projects/Visible.md']));

        expect(filtered).not.toBe(snapshot);
        expect(filtered.availability).toBe('ready');
        expect(filtered.revision).toBe(17);
        expect(filtered.message).toBe('ready');
        expect(filtered.descriptors.map(descriptor => [descriptor.id, descriptor.count])).toEqual([
            [TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, 1],
            [projectTypeId, 1]
        ]);
        expect(filtered.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)).toEqual([taskRecords[0]]);
        expect(filtered.recordsByType.get(projectTypeId)).toEqual([projectRecords[0]]);
        expect(snapshot.descriptors.map(descriptor => descriptor.count)).toEqual([2, 2]);
        expect(snapshot.recordsByType.get(projectTypeId)).toHaveLength(2);
    });

    it('preserves a descriptor object when all of its records remain visible', () => {
        const descriptor = createDescriptor(TPS_NAVIGATOR_TYPE_IDS.NOTES, 'Notes', 1);
        const record = createRecord('note', TPS_NAVIGATOR_TYPE_IDS.NOTES, 'Note.md');
        const snapshot: TpsNavigatorTypesSnapshot = {
            availability: 'ready',
            descriptors: [descriptor],
            recordsByType: new Map([[descriptor.id, [record]]]),
            revision: 1
        };

        const filtered = filterTpsNavigatorTypesSnapshot(snapshot, new Set(['Note.md']));

        expect(filtered.descriptors[0]).toBe(descriptor);
        expect(filtered.recordsByType.get(descriptor.id)).toEqual([record]);
    });

    it('does not invent a zero count for an external collection before its rows are queried', () => {
        const typeId = createTpsNavigatorProviderTypeId('example/entities', 'projects')!;
        const descriptor: TpsNavigatorTypeDescriptor = {
            id: typeId,
            label: 'Projects',
            icon: 'lucide-folder-kanban',
            category: 'structure',
            count: 0,
            showCount: false,
            providerId: 'example/entities',
            providerCollectionId: 'projects'
        };
        const snapshot: TpsNavigatorTypesSnapshot = {
            availability: 'ready',
            descriptors: [descriptor],
            recordsByType: new Map(),
            revision: 2
        };

        const filtered = filterTpsNavigatorTypesSnapshot(snapshot, new Set(['Projects/Visible.md']));

        expect(filtered.descriptors[0]).toBe(descriptor);
        expect(filtered.descriptors[0].showCount).toBe(false);
    });
});
