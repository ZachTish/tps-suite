import { describe, expect, it, vi } from 'vitest';
import { createTestTFile } from '../utils/createTestTFile';
import { ListPaneItemType } from '../../src/types';
import type { ListPaneItem } from '../../src/types/virtualization';
import { mergeProviderRowsIntoList } from '../../src/services/rows/providerListItems';
import { buildFilePathToIndexMap, buildOrderedFiles } from '../../src/hooks/listPaneData/listItems';
import type { ProviderPropertyGrouping } from '../../src/services/rows/providerListItems';
import { getNavigatorRowSelectionKey } from '../../src/services/rows/rowSelection';

function getProviderGroupLabels(items: readonly ListPaneItem[]): Map<string, string> {
    const groupByRow = new Map<string, string>();
    let group = '';
    items.forEach(item => {
        if (item.type === ListPaneItemType.HEADER) group = typeof item.data === 'string' ? item.data : '';
        if (item.type === ListPaneItemType.PROVIDER_ROW) groupByRow.set(String((item.data as { id: string }).id), group);
    });
    return groupByRow;
}

describe('mergeProviderRowsIntoList', () => {
    it('places transient rows directly below their source file, preserves source-local order, and drops orphans', () => {
        const one = createTestTFile('Notes/one.md');
        const two = createTestTFile('Notes/two.md');
        const listItems: ListPaneItem[] = [
            { type: ListPaneItemType.FILE, data: one, key: 'file-one' },
            { type: ListPaneItemType.FILE, data: two, key: 'file-two' },
            { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
        ];
        const merged = mergeProviderRowsIntoList(listItems, [
            {
                providerId: 'tps/example',
                id: 'two-a',
                kind: 'tps/example-row',
                label: 'Two A',
                sourcePath: 'Notes/two.md'
            },
            {
                providerId: 'tps/example',
                id: 'one-a',
                kind: 'tps/example-row',
                label: 'One A',
                sourcePath: 'Notes/one.md'
            },
            {
                providerId: 'tps/example',
                id: 'orphan',
                kind: 'tps/example-row',
                label: 'Orphan',
                sourcePath: 'Notes/missing.md'
            },
            {
                providerId: 'tps/example',
                id: 'one-b',
                kind: 'tps/example-row',
                label: 'One B',
                sourcePath: 'Notes/one.md'
            }
        ]);

        expect(merged.map(item => item.type)).toEqual([
            ListPaneItemType.FILE,
            ListPaneItemType.PROVIDER_ROW,
            ListPaneItemType.PROVIDER_ROW,
            ListPaneItemType.FILE,
            ListPaneItemType.PROVIDER_ROW,
            ListPaneItemType.BOTTOM_SPACER
        ]);
        expect(merged.map(item => item.key)).toEqual([
            'file-one',
            'provider:tps/example:one-a',
            'provider:tps/example:one-b',
            'file-two',
            'provider:tps/example:two-a',
            'bottom'
        ]);

        expect(buildOrderedFiles(merged).orderedFiles).toEqual([one, two]);
        expect(Array.from(buildFilePathToIndexMap(merged).entries())).toEqual([
            ['Notes/one.md', 0],
            ['Notes/two.md', 3]
        ]);
    });

    it('returns the original list identity when there are no provider rows', () => {
        const listItems: ListPaneItem[] = [{ type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }];
        expect(mergeProviderRowsIntoList(listItems, [])).toBe(listItems);
    });

    it('does no grouping work for repeated empty provider results in path mode', () => {
        const listItems: ListPaneItem[] = [{ type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }];
        const readPropertyKey = vi.fn(() => 'kind');
        const grouping: ProviderPropertyGrouping = {
            get propertyKey() {
                return readPropertyKey();
            },
            noValueLabel: 'None',
            noValuePosition: 'bottom',
            valueGroupIdPrefix: 'property-path:',
            noValueGroupId: 'property-none',
            granularity: 'path'
        };
        for (let call = 0; call < 500; call += 1) {
            expect(mergeProviderRowsIntoList(listItems, [], grouping)).toBe(listItems);
        }
        expect(readPropertyKey).not.toHaveBeenCalled();
    });

    it('does not inspect flat header membership for source-attached providers', () => {
        const inspectMembers = vi.fn(() => ['Daily.md']);
        const header: ListPaneItem = {
            type: ListPaneItemType.HEADER,
            data: 'flat',
            key: 'header-property-value:flat',
            headerKind: 'property',
            isCollapsed: true,
            get groupFilePaths() {
                return inspectMembers();
            }
        };
        const rows = [{ providerId: 'tps/example', id: 'one', kind: 'example', label: 'One', sourcePath: 'Daily.md' }];
        for (let index = 0; index < 500; index += 1) {
            const result = mergeProviderRowsIntoList([header], rows, {
                propertyKey: 'kind',
                noValueLabel: 'None',
                noValuePosition: 'bottom',
                valueGroupIdPrefix: 'property-value:',
                noValueGroupId: 'property-none',
                granularity: 'value'
            });
            expect(result[0]).toBe(header);
            expect(result[0].groupRowKeys).toBeUndefined();
        }
        expect(inspectMembers).not.toHaveBeenCalled();
    });

    it.each(['value', 'day'] as const)('does not add path membership metadata to %s provider groups', granularity => {
        const result = mergeProviderRowsIntoList(
            [{ type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }],
            [
                {
                    providerId: 'tps/example',
                    id: 'one',
                    kind: 'example',
                    label: 'One',
                    sourcePath: 'Daily.md',
                    properties: { kind: '2026-10-10' }
                }
            ],
            {
                propertyKey: 'kind',
                noValueLabel: 'None',
                noValuePosition: 'bottom',
                valueGroupIdPrefix: `property-${granularity}:`,
                noValueGroupId: 'property-none',
                granularity
            }
        );
        const propertyHeader = result.find(item => item.type === ListPaneItemType.HEADER)!;
        expect(propertyHeader.groupNativeFilePaths).toBeUndefined();
        expect(propertyHeader.groupRowKeys).toBeUndefined();
        expect(propertyHeader.groupBucketKey).toBe('2026-10-10');
    });

    it.each([false, true])('retains provider membership in native path headers when collapsed=%s', isCollapsed => {
        const source = createTestTFile('Daily.md');
        const bucketKey = 'transaction/financial';
        const nativeHeader: ListPaneItem = {
            type: ListPaneItemType.HEADER,
            data: bucketKey,
            key: `header-property-path:${bucketKey}`,
            headerKind: 'property',
            isCollapsed,
            groupFilePaths: [source.path],
            groupItemCount: 1
        };
        const listItems: ListPaneItem[] = [
            { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
            nativeHeader,
            ...(isCollapsed ? [] : [{ type: ListPaneItemType.FILE, data: source, key: 'daily-file' }]),
            { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
        ];
        const providerRows = [
            { providerId: 'tps/example', id: 'attached', kind: 'example', label: 'Attached', sourcePath: source.path },
            {
                providerId: 'tps/example',
                id: 'valued',
                kind: 'example',
                label: 'Valued',
                sourcePath: source.path,
                properties: { kind: bucketKey }
            }
        ];
        const merged = mergeProviderRowsIntoList(listItems, providerRows, {
            propertyKey: 'kind',
            noValueLabel: 'None',
            noValuePosition: 'bottom',
            valueGroupIdPrefix: 'property-path:',
            noValueGroupId: 'property-none',
            granularity: 'path'
        });
        const header = merged.find(item => item.type === ListPaneItemType.HEADER)!;
        expect(header.groupBucketKey).toBe(bucketKey);
        expect(header.groupFilePaths).toEqual([source.path]);
        expect(header.groupRowKeys).toEqual(
            providerRows.map(row => getNavigatorRowSelectionKey({ providerId: row.providerId, rowId: row.id }))
        );
        expect(merged.filter(item => item.type === ListPaneItemType.PROVIDER_ROW)).toHaveLength(isCollapsed ? 0 : 2);
        expect(nativeHeader.groupBucketKey).toBeUndefined();
        expect(nativeHeader.groupRowKeys).toBeUndefined();
    });

    it('preserves provider-only path bucket metadata and identities while collapsed', () => {
        const bucketKey = 'transaction/financial/investment';
        const merged = mergeProviderRowsIntoList(
            [{ type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }],
            [
                {
                    providerId: 'tps/example',
                    id: 'one',
                    kind: 'example',
                    label: 'One',
                    sourcePath: 'Daily.md',
                    properties: { kind: bucketKey }
                }
            ],
            {
                propertyKey: 'kind',
                noValueLabel: 'None',
                noValuePosition: 'bottom',
                valueGroupIdPrefix: 'property-path:',
                noValueGroupId: 'property-none',
                granularity: 'path',
                getCollapseKey: id => `collapse:${id}`,
                isCollapsed: () => true
            }
        );
        const header = merged.find(item => item.type === ListPaneItemType.HEADER)!;
        expect(header).toMatchObject({
            data: bucketKey,
            groupBucketKey: bucketKey,
            groupFilePaths: [],
            groupItemCount: 1,
            isCollapsed: true
        });
        expect(header.groupRowKeys).toEqual([getNavigatorRowSelectionKey({ providerId: 'tps/example', rowId: 'one' })]);
        expect(merged.some(item => item.type === ListPaneItemType.PROVIDER_ROW)).toBe(false);
    });

    it('retains attached-row membership before returning without property-bearing providers', () => {
        const header: ListPaneItem = {
            type: ListPaneItemType.HEADER,
            data: 'transaction/financial',
            key: 'header-property-path:transaction/financial',
            headerKind: 'property',
            groupFilePaths: ['Daily.md'],
            groupItemCount: 1,
            isCollapsed: true
        };
        const merged = mergeProviderRowsIntoList(
            [header],
            [{ providerId: 'tps/example', id: 'one', kind: 'example', label: 'One', sourcePath: 'Daily.md' }],
            {
                propertyKey: 'kind',
                noValueLabel: 'None',
                noValuePosition: 'bottom',
                valueGroupIdPrefix: 'property-path:',
                noValueGroupId: 'property-none',
                granularity: 'path'
            }
        );
        expect(merged).toHaveLength(1);
        expect(merged[0]).toMatchObject({
            groupBucketKey: 'transaction/financial',
            groupItemCount: 1,
            groupRowKeys: [getNavigatorRowSelectionKey({ providerId: 'tps/example', rowId: 'one' })]
        });
        expect(header.groupRowKeys).toBeUndefined();
    });

    it('groups property-bearing task rows by their own tags instead of their source note group', () => {
        const daily = createTestTFile('Daily.md');
        const listItems: ListPaneItem[] = [
            { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
            {
                type: ListPaneItemType.HEADER,
                data: 'dailynote',
                key: 'header-property-value:dailynote',
                headerKind: 'property'
            },
            { type: ListPaneItemType.FILE, data: daily, key: 'daily-file' },
            { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
        ];
        const rows = [
            {
                providerId: 'tps/gcm-tasks',
                id: 'untagged',
                kind: 'tps/gcm-task',
                label: 'Untagged task',
                sourcePath: daily.path,
                properties: { tags: [] }
            },
            {
                providerId: 'tps/gcm-tasks',
                id: 'career',
                kind: 'tps/gcm-task',
                label: 'Career task',
                sourcePath: daily.path,
                properties: { tags: ['career'] }
            }
        ];

        const merged = mergeProviderRowsIntoList(listItems, rows, {
            propertyKey: 'tags',
            noValueLabel: 'None',
            noValuePosition: 'bottom',
            valueGroupIdPrefix: 'property-value:',
            noValueGroupId: 'property-none'
        });

        const groupByRow = getProviderGroupLabels(merged);
        expect(groupByRow).toEqual(
            new Map([
                ['career', 'career'],
                ['untagged', 'None']
            ])
        );
        expect(groupByRow.has('dailynote')).toBe(false);
    });

    it('matches tag groups case-insensitively, filters hidden task tags, and combines visible values', () => {
        const daily = createTestTFile('Daily.md');
        const listItems: ListPaneItem[] = [
            { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
            {
                type: ListPaneItemType.HEADER,
                data: 'Career, Urgent',
                key: `header-tags-value:career\u0000urgent`,
                headerKind: 'property'
            },
            { type: ListPaneItemType.FILE, data: daily, key: 'daily-file' },
            { type: ListPaneItemType.HEADER, data: 'Untagged', key: 'header-tags-no-value', headerKind: 'property' },
            { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
        ];
        const rows = [
            {
                providerId: 'tps/gcm-tasks',
                id: 'visible',
                kind: 'tps/gcm-task',
                label: 'Visible task',
                sourcePath: daily.path,
                properties: { tags: ['#career', 'Urgent', 'private/hidden'] }
            },
            {
                providerId: 'tps/gcm-tasks',
                id: 'hidden-only',
                kind: 'tps/gcm-task',
                label: 'Hidden task',
                sourcePath: daily.path,
                properties: { tags: ['private/hidden'] }
            }
        ];

        const merged = mergeProviderRowsIntoList(listItems, rows, {
            propertyKey: 'tags',
            noValueLabel: 'Untagged',
            noValuePosition: 'bottom',
            valueGroupIdPrefix: 'tags-value:',
            noValueGroupId: 'tags-no-value',
            multiValueGrouping: 'combine',
            formatLabel: label => label.replace(/^#/, ''),
            isLabelVisible: label => !label.toLowerCase().startsWith('private/'),
            getLabelKey: label => label.toLowerCase()
        });

        const groupByRow = getProviderGroupLabels(merged);
        expect(groupByRow).toEqual(
            new Map([
                ['visible', 'Career, Urgent'],
                ['hidden-only', 'Untagged']
            ])
        );
    });

    it('keeps provider rows hidden when their existing group is collapsed', () => {
        const source = createTestTFile('Daily.md');
        const merged = mergeProviderRowsIntoList(
            [
                { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
                {
                    type: ListPaneItemType.HEADER,
                    data: 'career',
                    key: 'header-tags-value:career',
                    headerKind: 'property',
                    isCollapsed: true
                },
                { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
            ],
            [
                {
                    providerId: 'tps/gcm-tasks',
                    id: 'career',
                    kind: 'tps/gcm-task',
                    label: 'Career task',
                    sourcePath: source.path,
                    properties: { tags: ['career'] }
                }
            ],
            {
                propertyKey: 'tags',
                noValueLabel: 'Untagged',
                noValuePosition: 'bottom',
                valueGroupIdPrefix: 'tags-value:',
                noValueGroupId: 'tags-no-value',
                getLabelKey: label => label.toLowerCase()
            }
        );

        expect(merged.filter(item => item.type === ListPaneItemType.PROVIDER_ROW)).toEqual([]);
        expect(merged.filter(item => item.type === ListPaneItemType.HEADER).map(item => item.key)).toEqual(['header-tags-value:career']);
    });

    it('creates a collapsed provider-only group without exposing source files or provider rows', () => {
        const source = createTestTFile('Daily.md');
        const merged = mergeProviderRowsIntoList(
            [
                { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
                { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
            ],
            [
                {
                    providerId: 'tps/gcm-tasks',
                    id: 'career',
                    kind: 'tps/gcm-task',
                    label: 'Career task',
                    sourcePath: source.path,
                    properties: { tags: ['career'] }
                }
            ],
            {
                propertyKey: 'tags',
                noValueLabel: 'Untagged',
                noValuePosition: 'bottom',
                valueGroupIdPrefix: 'tags-value:',
                noValueGroupId: 'tags-no-value',
                getLabelKey: label => label.toLowerCase(),
                getCollapseKey: groupId => `collapse:${groupId}`,
                isCollapsed: () => true
            }
        );

        expect(merged.filter(item => item.type === ListPaneItemType.PROVIDER_ROW)).toEqual([]);
        expect(merged.find(item => item.type === ListPaneItemType.HEADER)).toMatchObject({
            key: 'header-tags-value:career',
            collapseKey: 'collapse:tags-value:career',
            isCollapsed: true,
            groupFilePaths: [],
            groupItemCount: 1
        });
    });

    it('keeps native group paths, augments the visible count, and suppresses a native-only search total', () => {
        const source = createTestTFile('Daily.md');
        const merged = mergeProviderRowsIntoList(
            [
                { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
                {
                    type: ListPaneItemType.HEADER,
                    data: 'career',
                    key: 'header-tags-value:career',
                    headerKind: 'property',
                    groupFilePaths: [source.path],
                    groupItemCount: 1,
                    groupTotalItemCount: 5
                },
                { type: ListPaneItemType.FILE, data: source, key: source.path },
                { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
            ],
            [
                {
                    providerId: 'tps/gcm-tasks',
                    id: 'career',
                    kind: 'tps/gcm-task',
                    label: 'Career task',
                    sourcePath: source.path,
                    properties: { tags: ['career'] }
                }
            ],
            {
                propertyKey: 'tags',
                noValueLabel: 'Untagged',
                noValuePosition: 'bottom',
                valueGroupIdPrefix: 'tags-value:',
                noValueGroupId: 'tags-no-value',
                getLabelKey: label => label.toLowerCase()
            }
        );

        const header = merged.find(item => item.key === 'header-tags-value:career');
        expect(header).toMatchObject({ groupFilePaths: [source.path], groupItemCount: 2 });
        expect(header?.groupTotalItemCount).toBeUndefined();
    });

    it.each([
        ['top', ['None', 'A', 'B']],
        ['bottom', ['A', 'B', 'None']]
    ] as const)('orders provider-only groups and places no-value groups at the %s', (noValuePosition, expectedLabels) => {
        const source = createTestTFile('Daily.md');
        const merged = mergeProviderRowsIntoList(
            [
                { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
                { type: ListPaneItemType.HEADER, data: 'A', key: 'header-property-value:A', headerKind: 'property' },
                { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
            ],
            [
                {
                    providerId: 'tps/gcm-tasks',
                    id: 'none',
                    kind: 'tps/gcm-task',
                    label: 'No status',
                    sourcePath: source.path,
                    properties: { status: null }
                },
                {
                    providerId: 'tps/gcm-tasks',
                    id: 'b',
                    kind: 'tps/gcm-task',
                    label: 'Status B',
                    sourcePath: source.path,
                    properties: { status: 'B' }
                }
            ],
            {
                propertyKey: 'status',
                noValueLabel: 'None',
                noValuePosition,
                valueGroupIdPrefix: 'property-value:',
                noValueGroupId: 'property-none'
            }
        );

        expect(
            merged
                .filter(item => item.type === ListPaneItemType.HEADER && item.headerKind === 'property')
                .map(item => (typeof item.data === 'string' ? item.data : ''))
        ).toEqual(expectedLabels);
    });

    it('keeps a spacer boundary after a provider-only top bucket inserted before the first native group', () => {
        const source = createTestTFile('Daily.md');
        const merged = mergeProviderRowsIntoList(
            [
                { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
                { type: ListPaneItemType.HEADER, data: 'A', key: 'header-property-value:A', headerKind: 'property' },
                { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
            ],
            [
                {
                    providerId: 'tps/gcm-tasks',
                    id: 'none',
                    kind: 'tps/gcm-task',
                    label: 'No status',
                    sourcePath: source.path,
                    properties: { status: null }
                }
            ],
            {
                propertyKey: 'status',
                noValueLabel: 'None',
                noValuePosition: 'top',
                valueGroupIdPrefix: 'property-value:',
                noValueGroupId: 'property-none'
            }
        );

        expect(merged.map(item => item.key)).toEqual([
            'top',
            'header-property-none',
            'provider:tps/gcm-tasks:none:\u0000no-value',
            'header-property-none-spacer-after',
            'header-property-value:A',
            'bottom'
        ]);
    });

    it('groups provider rows by local calendar day and orders provider-only day buckets chronologically', () => {
        const source = createTestTFile('Daily.md');
        const merged = mergeProviderRowsIntoList(
            [
                { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
                { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
            ],
            [
                {
                    providerId: 'tps/gcm-tasks',
                    id: 'later',
                    kind: 'tps/gcm-task',
                    label: 'Later',
                    sourcePath: source.path,
                    properties: { scheduled: '2026-08-28 09:00' }
                },
                {
                    providerId: 'tps/gcm-tasks',
                    id: 'earlier',
                    kind: 'tps/gcm-task',
                    label: 'Earlier',
                    sourcePath: source.path,
                    properties: { scheduled: '2026-08-27 17:00' }
                }
            ],
            {
                propertyKey: 'scheduled',
                noValueLabel: 'None',
                noValuePosition: 'bottom',
                valueGroupIdPrefix: 'property-day:',
                noValueGroupId: 'property-none',
                granularity: 'day',
                direction: 'asc'
            }
        );

        const headers = merged.filter(item => item.type === ListPaneItemType.HEADER);
        expect(headers.map(item => item.data)).toEqual(['2026-08-27', '2026-08-28']);
        expect(headers.map(item => item.groupFilePaths)).toEqual([[], []]);
        expect(headers.map(item => item.groupItemCount)).toEqual([1, 1]);
    });

    it('orders numeric provider-only groups numerically, including negative values', () => {
        const source = createTestTFile('Daily.md');
        const merged = mergeProviderRowsIntoList(
            [
                { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
                { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
            ],
            [-2, -10].map(value => ({
                providerId: 'tps/gcm-tasks',
                id: String(value),
                kind: 'tps/gcm-task',
                label: String(value),
                sourcePath: source.path,
                properties: { score: value }
            })),
            {
                propertyKey: 'score',
                noValueLabel: 'None',
                noValuePosition: 'bottom',
                valueGroupIdPrefix: 'property-value:',
                noValueGroupId: 'property-none',
                direction: 'asc'
            }
        );

        expect(merged.filter(item => item.type === ListPaneItemType.HEADER).map(item => item.data)).toEqual(['-10', '-2']);
    });

    it('uses the tag key comparator when alpha-equivalent provider and native labels tie', () => {
        const source = createTestTFile('Daily.md');
        const merged = mergeProviderRowsIntoList(
            [
                { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
                { type: ListPaneItemType.HEADER, data: 'à', key: 'header-tags-value:à', headerKind: 'property' },
                { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
            ],
            [
                {
                    providerId: 'tps/gcm-tasks',
                    id: 'accent',
                    kind: 'tps/gcm-task',
                    label: 'Accent',
                    sourcePath: source.path,
                    properties: { tags: ['á'] }
                }
            ],
            {
                propertyKey: 'tags',
                noValueLabel: 'Untagged',
                noValuePosition: 'bottom',
                valueGroupIdPrefix: 'tags-value:',
                noValueGroupId: 'tags-no-value',
                getLabelKey: label => label,
                compareLabelKeys: (left, right) => left.localeCompare(right)
            }
        );

        expect(merged.filter(item => item.type === ListPaneItemType.HEADER).map(item => item.data)).toEqual(['á', 'à']);
    });

    it('distinguishes a literal Untagged tag from the no-visible-tags bucket', () => {
        const source = createTestTFile('Daily.md');
        const merged = mergeProviderRowsIntoList(
            [
                { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
                { type: ListPaneItemType.HEADER, data: 'Untagged', key: 'header-tags-value:untagged', headerKind: 'property' },
                { type: ListPaneItemType.HEADER, data: 'Untagged', key: 'header-tags-no-value', headerKind: 'property' },
                { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
            ],
            [
                {
                    providerId: 'tps/gcm-tasks',
                    id: 'literal',
                    kind: 'tps/gcm-task',
                    label: 'Literal tag',
                    sourcePath: source.path,
                    properties: { tags: ['Untagged'] }
                },
                {
                    providerId: 'tps/gcm-tasks',
                    id: 'none',
                    kind: 'tps/gcm-task',
                    label: 'No tags',
                    sourcePath: source.path,
                    properties: { tags: [] }
                }
            ],
            {
                propertyKey: 'tags',
                noValueLabel: 'Untagged',
                noValuePosition: 'bottom',
                valueGroupIdPrefix: 'tags-value:',
                noValueGroupId: 'tags-no-value',
                getLabelKey: label => label.toLowerCase()
            }
        );

        const headerKeyByRow = new Map<string, string>();
        let headerKey = '';
        merged.forEach(item => {
            if (item.type === ListPaneItemType.HEADER) headerKey = item.key;
            if (item.type === ListPaneItemType.PROVIDER_ROW) {
                headerKeyByRow.set(String((item.data as { id: string }).id), headerKey);
            }
        });
        expect(headerKeyByRow).toEqual(
            new Map([
                ['literal', 'header-tags-value:untagged'],
                ['none', 'header-tags-no-value']
            ])
        );
    });

    it('distinguishes a literal property value matching the localized no-value label', () => {
        const source = createTestTFile('Daily.md');
        const merged = mergeProviderRowsIntoList(
            [
                { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
                {
                    type: ListPaneItemType.HEADER,
                    data: 'No value',
                    key: 'header-property-value:No value',
                    headerKind: 'property'
                },
                { type: ListPaneItemType.HEADER, data: 'No value', key: 'header-property-none', headerKind: 'property' },
                { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
            ],
            [
                {
                    providerId: 'tps/gcm-tasks',
                    id: 'literal',
                    kind: 'tps/gcm-task',
                    label: 'Literal status',
                    sourcePath: source.path,
                    properties: { status: 'No value' }
                },
                {
                    providerId: 'tps/gcm-tasks',
                    id: 'none',
                    kind: 'tps/gcm-task',
                    label: 'Blank status',
                    sourcePath: source.path,
                    properties: { status: '' }
                }
            ],
            {
                propertyKey: 'status',
                noValueLabel: 'No value',
                noValuePosition: 'bottom',
                valueGroupIdPrefix: 'property-value:',
                noValueGroupId: 'property-none'
            }
        );

        const headerKeyByRow = new Map<string, string>();
        let headerKey = '';
        merged.forEach(item => {
            if (item.type === ListPaneItemType.HEADER) headerKey = item.key;
            if (item.type === ListPaneItemType.PROVIDER_ROW) {
                headerKeyByRow.set(String((item.data as { id: string }).id), headerKey);
            }
        });
        expect(headerKeyByRow).toEqual(
            new Map([
                ['literal', 'header-property-value:No value'],
                ['none', 'header-property-none']
            ])
        );
    });
});
