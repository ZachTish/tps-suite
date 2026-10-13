import { describe, expect, it } from 'vitest';
import { collectTypeLinePropertyRecords } from '../../src/context/storage/usePropertyTreeSync';
import type { TpsNavigatorTypesSnapshot } from '../../src/types/navigatorTypes';

describe('collectTypeLinePropertyRecords', () => {
    const snapshot: TpsNavigatorTypesSnapshot = {
        availability: 'ready',
        descriptors: [],
        recordsByType: new Map([
            [
                'structural:task',
                [
                    {
                        id: 'task-one',
                        typeId: 'structural:task',
                        label: 'Task one',
                        sourcePath: 'Tasks/Today.md',
                        entityType: 'block',
                        lineKind: 'task',
                        locatorKey: 'block:task-one',
                        referenceTarget: '[[Tasks/Today#^task-one]]',
                        properties: { project: ['Alpha'] },
                        task: {
                            lineNumber: 1,
                            rawLine: '- [ ] Task one',
                            title: 'Task one',
                            checkbox: '[ ]',
                            marker: ' ',
                            status: 'todo',
                            isComplete: false,
                            canMutateCheckbox: false,
                            hasContextMenu: false
                        }
                    }
                ]
            ]
        ]),
        revision: 1
    };

    it('drops every line-derived property carrier while Types are disabled', () => {
        expect(collectTypeLinePropertyRecords(snapshot, false)).toEqual([]);
        expect(collectTypeLinePropertyRecords(snapshot, true)).toEqual([
            {
                sourcePath: 'Tasks/Today.md',
                properties: { project: ['Alpha'] },
                taskStatus: 'todo'
            }
        ]);
    });
});
