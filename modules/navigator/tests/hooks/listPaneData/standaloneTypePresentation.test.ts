import { TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import {
    buildStandaloneStructuralTypePresentation,
    getEffectiveStandaloneStructuralTypeGrouping
} from '../../../src/hooks/listPaneData/standaloneTypePresentation';
import type { NavigatorProvidedRow } from '../../../src/services/rows/types';
import type { ListNoteGroupingOption } from '../../../src/settings/types';
import { ListPaneItemType } from '../../../src/types';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../../src/types/navigatorTypes';
import type { ListPaneItem } from '../../../src/types/virtualization';
import { buildListGroupCollapseKey } from '../../../src/utils/listGroupCollapse';
import { ItemType } from '../../../src/types';
import { createTestTFile } from '../../utils/createTestTFile';
import { getNavigatorRowSelectionKey } from '../../../src/services/rows/rowSelection';

interface FixtureFile {
    file: TFile;
    frontmatter: unknown;
}

function file(path: string, created: number, modified: number, frontmatter: unknown = {}): FixtureFile {
    const result = createTestTFile(path);
    Reflect.set(result, 'stat', { ctime: created, mtime: modified, size: 0 });
    return { file: result, frontmatter };
}

function row(id: string, label: string, sourcePath: string, sourceLineNumber?: number): NavigatorProvidedRow {
    return {
        providerId: 'tps/entity-types',
        id,
        kind: 'tps/entity-type/task',
        label,
        sourcePath,
        ...(sourceLineNumber === undefined ? {} : { sourceLineNumber })
    };
}

function rowsFrom(items: readonly ListPaneItem[]): NavigatorProvidedRow[] {
    return items.flatMap(item =>
        item.type === ListPaneItemType.PROVIDER_ROW && typeof item.data === 'object' ? [item.data as NavigatorProvidedRow] : []
    );
}

function headersFrom(items: readonly ListPaneItem[]): ListPaneItem[] {
    return items.filter(item => item.type === ListPaneItemType.HEADER);
}

function present({
    rows,
    files,
    option = 'title-asc',
    propertyKey = '',
    propertySortSecondary = 'title',
    groupBy = 'custom',
    collapsedListGroups,
    linePropertyInheritance,
    multiValueGrouping,
    noValueGroupPosition
}: {
    rows: readonly NavigatorProvidedRow[];
    files: readonly FixtureFile[];
    option?:
        | 'modified-desc'
        | 'modified-asc'
        | 'created-desc'
        | 'created-asc'
        | 'title-asc'
        | 'title-desc'
        | 'filename-asc'
        | 'filename-desc'
        | 'property-asc'
        | 'property-desc';
    propertyKey?: string;
    propertySortSecondary?: 'title' | 'filename' | 'created' | 'modified';
    groupBy?: ListNoteGroupingOption;
    collapsedListGroups?: ReadonlySet<string>;
    linePropertyInheritance?: 'note-first' | 'line-first' | 'combine';
    multiValueGrouping?: 'separate' | 'combine';
    noValueGroupPosition?: 'top' | 'bottom';
}): ListPaneItem[] {
    const sourceByPath = new Map(files.map(entry => [entry.file.path, entry]));
    return buildStandaloneStructuralTypePresentation({
        rows,
        selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
        sort: { option, propertyKey, propertySortSecondary },
        groupBy,
        dayKey: '2026-08-02',
        collapsedListGroups,
        resolveFile: path => sourceByPath.get(path)?.file ?? null,
        getFrontmatter: target => sourceByPath.get(target.path)?.frontmatter ?? null,
        getFileTimestamps: target => ({ created: target.stat.ctime, modified: target.stat.mtime }),
        noValueLabel: 'No value',
        linePropertyInheritance,
        multiValueGrouping,
        noValueGroupPosition
    });
}

describe('standalone structural Type presentation', () => {
    it('keeps exact path bucket and provider membership metadata in collapsed structural groups', () => {
        const source = file('Daily.md', 1, 1);
        const bucketKey = 'transaction/financial/investment';
        const input = [
            { ...row('one', 'One', source.file.path, 1), properties: { kind: [bucketKey] } },
            { ...row('two', 'Two', source.file.path, 2), properties: { kind: [bucketKey] } }
        ];
        const groupBy = 'line-property-path:kind' as ListNoteGroupingOption;
        const collapseKey = buildListGroupCollapseKey({
            selectionType: ItemType.TYPE,
            selectedFolderPath: null,
            selectedTag: null,
            selectedProperty: null,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            groupingMode: groupBy,
            groupId: `line-property-path:${bucketKey}`
        });
        const items = present({ rows: input, files: [source], groupBy, collapsedListGroups: new Set([collapseKey]) });
        expect(headersFrom(items)).toHaveLength(1);
        expect(headersFrom(items)[0]).toMatchObject({
            data: bucketKey,
            groupBucketKey: bucketKey,
            groupFilePaths: [source.file.path, source.file.path],
            groupRowKeys: input.map(item => getNavigatorRowSelectionKey({ providerId: item.providerId, rowId: item.id })),
            isCollapsed: true
        });
        expect(rowsFrom(items)).toEqual([]);
    });

    it('retains combined exact buckets and distinct provider identities without extra source lookups', () => {
        const source = file('Daily.md', 1, 1);
        const input = [
            { ...row('one', 'One', source.file.path, 1), properties: { kind: ['entity/physical', 'entity/general'] } },
            { ...row('two', 'Two', source.file.path, 2), properties: { kind: ['entity/physical', 'entity/general'] } }
        ];
        const resolveFile = vi.fn(() => source.file);
        const getFrontmatter = vi.fn(() => source.frontmatter);
        const getFileTimestamps = vi.fn(() => ({ created: 1, modified: 1 }));
        const items = buildStandaloneStructuralTypePresentation({
            rows: input,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            sort: { option: 'title-asc', propertyKey: '', propertySortSecondary: 'title' },
            groupBy: 'line-property-path:kind',
            dayKey: '2026-08-02',
            noValueLabel: 'None',
            multiValueGrouping: 'combine',
            resolveFile,
            getFrontmatter,
            getFileTimestamps
        });
        expect(headersFrom(items)[0]).toMatchObject({
            data: 'entity/physical, entity/general',
            groupBucketKey: 'entity/physical\u0000entity/general',
            groupRowKeys: input.map(item => getNavigatorRowSelectionKey({ providerId: item.providerId, rowId: item.id }))
        });
        expect(rowsFrom(items).map(item => item.id)).toEqual(['one', 'two']);
        expect(resolveFile).toHaveBeenCalledTimes(1);
        expect(getFrontmatter).toHaveBeenCalledTimes(1);
        expect(getFileTimestamps).toHaveBeenCalledTimes(1);
    });

    it('keeps a mixed-search line source latent when a Navigator-owned range Type returns to standalone mode', () => {
        expect(getEffectiveStandaloneStructuralTypeGrouping(TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS, 'line-property-day:scheduled', true)).toBe(
            'line-property-day:scheduled'
        );
        expect(getEffectiveStandaloneStructuralTypeGrouping(TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS, 'line-property-day:scheduled', false)).toBe(
            'property-day:scheduled'
        );
        expect(getEffectiveStandaloneStructuralTypeGrouping(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, 'line-property:status', false)).toBe(
            'line-property:status'
        );
        expect(getEffectiveStandaloneStructuralTypeGrouping(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, 'tags', false)).toBe('custom');
    });

    it('sorts Title by row label and resolves equal labels by source path, line, and id', () => {
        const files = [file('Zeta.md', 1, 1), file('Alpha.md', 1, 1)];
        const input = [
            row('z', 'Same', 'Zeta.md', 8),
            row('b', 'Same', 'Alpha.md', 8),
            row('a', 'Same', 'Alpha.md', 8),
            row('line', 'Same', 'Alpha.md', 2),
            row('first', 'Alpha row', 'Zeta.md', 3)
        ];

        expect(rowsFrom(present({ rows: input, files })).map(item => item.id)).toEqual(['first', 'line', 'a', 'b', 'z']);
        expect(rowsFrom(present({ rows: input, files, option: 'title-desc' })).map(item => item.id)).toEqual([
            'line',
            'a',
            'b',
            'z',
            'first'
        ]);
    });

    it('sorts filename and file timestamps from the owning TFile while keeping unresolved sources last', () => {
        const files = [file('Zeta.md', 10, 40), file('Alpha.md', 30, 20)];
        const input = [row('missing', 'Missing', 'Gone.md', 1), row('zeta', 'Zeta', 'Zeta.md', 1), row('alpha', 'Alpha', 'Alpha.md', 1)];

        expect(rowsFrom(present({ rows: input, files, option: 'filename-asc' })).map(item => item.id)).toEqual([
            'alpha',
            'zeta',
            'missing'
        ]);
        expect(rowsFrom(present({ rows: input, files, option: 'created-desc' })).map(item => item.id)).toEqual([
            'alpha',
            'zeta',
            'missing'
        ]);
        expect(rowsFrom(present({ rows: input, files, option: 'modified-desc' })).map(item => item.id)).toEqual([
            'zeta',
            'alpha',
            'missing'
        ]);
    });

    it('sorts by owning-note properties, applies the configured secondary, and leaves missing values last in both directions', () => {
        const files = [
            file('A.md', 1, 1, { priority: 'medium' }),
            file('B.md', 1, 1, { priority: 'high' }),
            file('C.md', 1, 1, {}),
            file('D.md', 1, 1, { priority: 'high' })
        ];
        const input = [
            row('c', 'Absent', 'C.md', 1),
            row('d', 'Zulu', 'D.md', 1),
            row('a', 'Medium', 'A.md', 1),
            row('b', 'Alpha', 'B.md', 1)
        ];

        expect(
            rowsFrom(
                present({ rows: input, files, option: 'property-asc', propertyKey: 'Priority', linePropertyInheritance: 'line-first' })
            ).map(item => item.id)
        ).toEqual(['b', 'd', 'a', 'c']);
        expect(
            rowsFrom(
                present({ rows: input, files, option: 'property-desc', propertyKey: 'Priority', linePropertyInheritance: 'line-first' })
            ).map(item => item.id)
        ).toEqual(['a', 'd', 'b', 'c']);
    });

    it('uses the selected inheritance mode for both property sorting and grouping', () => {
        const files = [file('Source.md', 1, 1, { Priority: 'owner' })];
        const input = [
            { ...row('fallback', 'Fallback', 'Source.md', 3) },
            { ...row('empty', 'Empty', 'Source.md', 2), properties: { priority: '' } },
            { ...row('local', 'Local', 'Source.md', 1), properties: { PRIORITY: 'alpha' } }
        ];

        expect(rowsFrom(present({ rows: input, files, option: 'property-asc', propertyKey: 'priority' })).map(item => item.id)).toEqual([
            'local',
            'empty',
            'fallback'
        ]);

        const noInheritance = present({ rows: input, files, groupBy: 'line-property:priority' });
        expect(headersFrom(noInheritance).map(header => header.data)).toEqual(['alpha', 'No value']);
        expect(headersFrom(noInheritance).map(header => header.data)).not.toContain('owner');

        const noteFirst = present({ rows: input, files, groupBy: 'line-property:priority', linePropertyInheritance: 'note-first' });
        expect(headersFrom(noteFirst).map(header => header.data)).toEqual(['owner']);
        expect(rowsFrom(noteFirst).map(item => item.id)).toEqual(['empty', 'fallback', 'local']);

        const lineFirst = present({ rows: input, files, groupBy: 'property:priority', linePropertyInheritance: 'line-first' });
        expect(headersFrom(lineFirst).map(header => header.data)).toEqual(['alpha', 'owner', 'No value']);
        expect(headersFrom(lineFirst).map(header => header.groupFilePaths?.length)).toEqual([1, 1, 1]);
        expect(rowsFrom(lineFirst).map(item => item.id)).toEqual(['local', 'fallback', 'empty']);

        const combined = present({
            rows: input,
            files,
            groupBy: 'line-property:priority',
            linePropertyInheritance: 'combine',
            multiValueGrouping: 'combine'
        });
        expect(headersFrom(combined).map(header => header.data)).toEqual(['owner', 'owner, alpha']);
        expect(rowsFrom(combined).map(item => item.id)).toEqual(['empty', 'fallback', 'local']);
        expect(
            rowsFrom(
                present({ rows: input, files, option: 'property-asc', propertyKey: 'priority', linePropertyInheritance: 'note-first' })
            ).map(item => item.id)
        ).toEqual(['empty', 'fallback', 'local']);
    });

    it('groups repeated raw line values together while treating preserved blank-only arrays as missing', () => {
        const files = [file('Source.md', 1, 1, { Parents: 'Note owner' })];
        const input: NavigatorProvidedRow[] = [
            { ...row('parents', 'Parents', 'Source.md', 1), properties: { Parents: ['Project A', '', 'Area B'] } },
            { ...row('blank', 'Blank', 'Source.md', 2), properties: { Parents: [''] } }
        ];

        const grouped = present({ rows: input, files, groupBy: 'line-property:parents' });

        expect(headersFrom(grouped).map(header => header.data)).toEqual(['Area B', 'Project A', 'No value']);
        expect(rowsFrom(grouped).map(item => item.id)).toEqual(['parents', 'parents', 'blank']);
        expect(new Set(grouped.map(item => item.key)).size).toBe(grouped.length);

        const combined = present({ rows: input, files, groupBy: 'line-property:parents', multiValueGrouping: 'combine' });
        expect(headersFrom(combined).map(header => header.data)).toEqual(['Project A, Area B', 'No value']);
    });

    it('groups property values in deterministic direction, counts rows, trails missing values, and honors collapse state', () => {
        const files = [file('Numeric.md', 1, 1, { lane: 2 }), file('Alpha.md', 1, 1, { lane: 'Alpha' }), file('Missing.md', 1, 1, {})];
        const input = [
            row('numeric', 'Numeric', 'Numeric.md', 1),
            row('alpha-2', 'Alpha 2', 'Alpha.md', 2),
            row('missing', 'Missing', 'Missing.md', 1),
            row('alpha-1', 'Alpha 1', 'Alpha.md', 1)
        ];
        const ascending = present({ rows: input, files, groupBy: 'property:lane', linePropertyInheritance: 'line-first' });

        expect(headersFrom(ascending).map(header => header.data)).toEqual(['2', 'Alpha', 'No value']);
        expect(
            headersFrom(
                present({
                    rows: input,
                    files,
                    groupBy: 'property:lane',
                    linePropertyInheritance: 'line-first',
                    noValueGroupPosition: 'top'
                })
            ).map(header => header.data)
        ).toEqual(['No value', '2', 'Alpha']);
        expect(headersFrom(ascending).map(header => header.groupFilePaths?.length)).toEqual([1, 2, 1]);
        expect(rowsFrom(ascending).map(item => item.id)).toEqual(['numeric', 'alpha-1', 'alpha-2', 'missing']);
        expect(
            headersFrom(present({ rows: input, files, groupBy: 'property-desc:lane', linePropertyInheritance: 'line-first' })).map(
                header => header.data
            )
        ).toEqual(['Alpha', '2', 'No value']);

        const alphaCollapseKey = buildListGroupCollapseKey({
            selectionType: ItemType.TYPE,
            selectedFolderPath: null,
            selectedTag: null,
            selectedProperty: null,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            groupingMode: 'property:lane',
            groupId: 'property-value:Alpha'
        });
        const collapsed = present({
            rows: input,
            files,
            groupBy: 'property:lane',
            collapsedListGroups: new Set([alphaCollapseKey]),
            linePropertyInheritance: 'line-first'
        });
        const alphaHeader = headersFrom(collapsed).find(header => header.data === 'Alpha');

        expect(alphaHeader).toMatchObject({ collapseKey: alphaCollapseKey, isCollapsed: true, headerKind: 'property' });
        expect(rowsFrom(collapsed).map(item => item.id)).toEqual(['numeric', 'missing']);
    });

    it('groups scheduled task values by calendar day without timestamp or timezone drift', () => {
        const files = [file('Source.md', 1, 1, { scheduled: '2026-08-05 07:00:00' })];
        const input: NavigatorProvidedRow[] = [
            { ...row('day-4', 'Day 4', 'Source.md', 3), properties: { scheduled: '2026-08-04 08:00:00' } },
            { ...row('day-3-evening', 'Evening', 'Source.md', 2), properties: { Scheduled: '2026-08-03T23:30:00Z' } },
            { ...row('invalid', 'Invalid', 'Source.md', 5), properties: { scheduled: '2026-02-31 09:00:00' } },
            { ...row('fallback', 'Fallback', 'Source.md', 4) },
            { ...row('day-3-morning', 'Morning', 'Source.md', 1), properties: { scheduled: '2026-08-03 09:00:00' } }
        ];

        const ascending = present({
            rows: input,
            files,
            groupBy: 'line-property-day:scheduled',
            linePropertyInheritance: 'line-first'
        });
        expect(headersFrom(ascending).map(header => header.data)).toEqual(['2026-08-03', '2026-08-04', '2026-08-05', 'No value']);
        expect(headersFrom(ascending).map(header => header.groupFilePaths?.length)).toEqual([2, 1, 1, 1]);
        expect(rowsFrom(ascending).map(item => item.id)).toEqual(['day-3-evening', 'day-3-morning', 'day-4', 'fallback', 'invalid']);
        expect(
            headersFrom(
                present({
                    rows: input,
                    files,
                    groupBy: 'line-property-day-desc:scheduled',
                    linePropertyInheritance: 'line-first'
                })
            ).map(header => header.data)
        ).toEqual(['2026-08-05', '2026-08-04', '2026-08-03', 'No value']);

        const exactHeaders = headersFrom(
            present({ rows: input, files, groupBy: 'line-property:scheduled', linePropertyInheritance: 'line-first' })
        ).map(header => header.data);
        expect(exactHeaders).toContain('2026-08-03 09:00:00');
        expect(exactHeaders).toContain('2026-08-03T23:30:00Z');
        expect(
            headersFrom(present({ rows: input, files, groupBy: 'property-day:scheduled', linePropertyInheritance: 'line-first' })).map(
                header => header.data
            )
        ).toEqual(['2026-08-03', '2026-08-04', '2026-08-05', 'No value']);
    });

    it('groups date-sorted rows by the owning file timestamp with missing timestamps last and collapsible row counts', () => {
        const today = new Date(2026, 7, 2, 12).getTime();
        const yesterday = new Date(2026, 7, 1, 12).getTime();
        const files = [file('Today.md', today, today), file('Yesterday.md', yesterday, yesterday)];
        const input = [
            row('missing', 'Missing', 'Missing.md', 1),
            row('yesterday', 'Yesterday', 'Yesterday.md', 1),
            row('today-2', 'Today 2', 'Today.md', 2),
            row('today-1', 'Today 1', 'Today.md', 1)
        ];
        const uncollapsed = present({ rows: input, files, option: 'modified-desc', groupBy: 'date' });
        const headers = headersFrom(uncollapsed);

        expect(headers.map(header => header.key)).toEqual([
            'standalone-type-header:date:modified:relative:today',
            'standalone-type-header:date:modified:relative:yesterday',
            'standalone-type-header:date:modified:none'
        ]);
        expect(headers.map(header => header.groupFilePaths?.length)).toEqual([2, 1, 1]);
        expect(rowsFrom(uncollapsed).map(item => item.id)).toEqual(['today-1', 'today-2', 'yesterday', 'missing']);

        const todayCollapseKey = headers[0].collapseKey!;
        const collapsed = present({
            rows: input,
            files,
            option: 'modified-desc',
            groupBy: 'date',
            collapsedListGroups: new Set([todayCollapseKey])
        });
        expect(headersFrom(collapsed)[0]).toMatchObject({ isCollapsed: true, headerKind: 'date' });
        expect(rowsFrom(collapsed).map(item => item.id)).toEqual(['yesterday', 'missing']);
    });

    it('does not mutate source rows, resolves each source once, and treats unsupported grouping as an ungrouped list', () => {
        const files = [file('Source.md', 1, 1, { lane: 'Alpha' })];
        const input = Object.freeze([row('two', 'Two', 'Source.md', 2), row('one', 'One', 'Source.md', 1)]);
        const resolveFile = vi.fn((path: string) => files.find(entry => entry.file.path === path)?.file ?? null);
        const getFrontmatter = vi.fn((target: TFile) => files.find(entry => entry.file === target)?.frontmatter ?? null);
        const result = buildStandaloneStructuralTypePresentation({
            rows: input,
            selectedType: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            sort: { option: 'title-asc', propertyKey: '', propertySortSecondary: 'title' },
            groupBy: 'folder',
            dayKey: '2026-08-02',
            resolveFile,
            getFrontmatter,
            getFileTimestamps: target => ({ created: target.stat.ctime, modified: target.stat.mtime }),
            noValueLabel: 'No value'
        });

        expect(rowsFrom(result).map(item => item.id)).toEqual(['one', 'two']);
        expect(headersFrom(result)).toEqual([]);
        expect(input.map(item => item.id)).toEqual(['two', 'one']);
        expect(resolveFile).toHaveBeenCalledOnce();
        expect(getFrontmatter).toHaveBeenCalledOnce();
    });
});
