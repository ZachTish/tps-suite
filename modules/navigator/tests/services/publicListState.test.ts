import { describe, expect, it, vi } from 'vitest';
import { ListPaneItemType } from '../../src/types';
import {
    buildNavigatorListSnapshot,
    validateListPresentationUpdate,
    validateListSearchUpdate
} from '../../src/services/listViewState/publicListState';
import { createTestTFile } from '../utils/createTestTFile';

describe('public list state', () => {
    it('preserves composed file/provider order while omitting executable provider fields', () => {
        const file = createTestTFile('Projects/Alpha.md');
        const activate = vi.fn();
        const snapshot = buildNavigatorListSnapshot({
            navItem: { type: 'none', folder: null, tag: null, property: null },
            search: {
                active: true,
                query: 'alpha',
                appliedQuery: 'alpha',
                requestedProvider: 'internal',
                effectiveProvider: 'internal'
            },
            presentation: {
                sort: { option: 'title-asc', propertyKey: null, source: 'scope' },
                grouping: { configured: 'custom', effective: 'custom', source: 'default' },
                displayMode: { value: 'compact', source: 'scope' }
            },
            listItems: [
                { type: ListPaneItemType.TOP_SPACER, data: '', key: 'top' },
                { type: ListPaneItemType.FILE, data: file, key: file.path, isPinned: true },
                {
                    type: ListPaneItemType.PROVIDER_ROW,
                    key: 'provider:demo/tasks:1',
                    data: {
                        providerId: 'demo/tasks',
                        id: '1',
                        kind: 'demo/task',
                        label: 'Ship',
                        secondaryLabel: 'Today',
                        sourcePath: file.path,
                        sourceLineNumber: 4,
                        activate,
                        indicator: { type: 'checkbox', checked: false, onChange: vi.fn() },
                        contextMenu: vi.fn()
                    }
                },
                { type: ListPaneItemType.BOTTOM_SPACER, data: '', key: 'bottom' }
            ],
            selectedType: null,
            resolveFile: path => (path === file.path ? file : null)
        });

        expect(snapshot.rows.map(row => row.type)).toEqual(['file', 'provider']);
        expect(snapshot.rows[0]).toMatchObject({ path: file.path, pinned: true });
        expect(snapshot.rows[1]).toEqual({
            type: 'provider',
            providerId: 'demo/tasks',
            rowId: '1',
            kind: 'demo/task',
            label: 'Ship',
            secondaryLabel: 'Today',
            sourcePath: file.path,
            sourceLineNumber: 4,
            typeId: null,
            file
        });
        expect('activate' in snapshot.rows[1]).toBe(false);
        expect('indicator' in snapshot.rows[1]).toBe(false);
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Object.isFrozen(snapshot.rows)).toBe(true);
        expect(Object.isFrozen(snapshot.rows[1])).toBe(true);
    });

    it('keeps non-source Type placeholders callback-free with a null file', () => {
        const snapshot = buildNavigatorListSnapshot({
            navItem: { type: 'type', folder: null, tag: null, property: null, navigatorType: 'provider:demo/all' },
            search: {
                active: false,
                query: '',
                appliedQuery: '',
                requestedProvider: 'omnisearch',
                effectiveProvider: 'internal'
            },
            presentation: null,
            listItems: [
                {
                    type: ListPaneItemType.PROVIDER_ROW,
                    key: 'loading',
                    data: { providerId: 'status', id: 'loading', kind: 'status/loading', label: 'Loading…', sourcePath: 'Types' }
                }
            ],
            selectedType: 'provider:demo/all',
            resolveFile: () => null
        });

        expect(snapshot.rows[0]).toMatchObject({ file: null, typeId: 'provider:demo/all' });
    });

    it('publishes the owning Type for structural rows mixed into another navigation search', () => {
        const file = createTestTFile('Projects/Alpha.md');
        const snapshot = buildNavigatorListSnapshot({
            navItem: { type: 'tag', folder: null, tag: 'work', property: null },
            search: {
                active: true,
                query: '#work type:structural:task',
                appliedQuery: '#work type:structural:task',
                requestedProvider: 'internal',
                effectiveProvider: 'internal'
            },
            presentation: null,
            listItems: [
                {
                    type: ListPaneItemType.PROVIDER_ROW,
                    key: 'provider:tps/entity-types:task-1',
                    providerTypeId: 'structural:task',
                    data: {
                        providerId: 'tps/entity-types',
                        id: 'task-1',
                        kind: 'tps/entity-type/task',
                        label: 'Ship release',
                        sourcePath: file.path,
                        sourceLineNumber: 3
                    }
                }
            ],
            selectedType: null,
            resolveFile: path => (path === file.path ? file : null)
        });

        expect(snapshot.rows[0]).toMatchObject({ type: 'provider', typeId: 'structural:task', file });
    });

    it('publishes native presentation for file-backed Type snapshots', () => {
        const file = createTestTFile('Notes/Project.md');
        const presentation = {
            sort: { option: 'property-desc' as const, propertyKey: 'priority', source: 'scope' as const },
            grouping: { configured: 'property:status' as const, effective: 'property:status' as const, source: 'scope' as const },
            displayMode: { value: 'compact' as const, source: 'scope' as const }
        };
        const snapshot = buildNavigatorListSnapshot({
            navItem: { type: 'type', folder: null, tag: null, property: null, navigatorType: 'entity:note' },
            search: {
                active: false,
                query: '',
                appliedQuery: '',
                requestedProvider: 'internal',
                effectiveProvider: 'internal'
            },
            presentation,
            listItems: [{ type: ListPaneItemType.FILE, data: file, key: file.path }],
            selectedType: 'entity:note',
            resolveFile: path => (path === file.path ? file : null)
        });

        expect(snapshot.presentation).toEqual(presentation);
        expect(snapshot.rows).toHaveLength(1);
        expect(snapshot.rows[0]).toMatchObject({ type: 'file', path: file.path });
        expect(Object.isFrozen(snapshot.presentation)).toBe(true);
    });

    it('guards contradictory, unknown, and malformed updates', () => {
        expect(validateListSearchUpdate(null)).toEqual({ ok: true, value: null });
        expect(validateListSearchUpdate({ active: false, focus: true })).toEqual({ ok: false });
        expect(validateListSearchUpdate({ active: false, provider: 'omnisearch' })).toEqual({ ok: false });
        expect(validateListSearchUpdate({ typo: true })).toEqual({ ok: false });
        expect(validateListPresentationUpdate({ sort: { option: 'property-asc', propertyKey: ' Rank ' } })).toMatchObject({
            ok: true,
            value: { sort: { option: 'property-asc', propertyKey: 'Rank' } }
        });
        expect(validateListPresentationUpdate({ groupBy: 'property:' })).toEqual({ ok: false });
        expect(validateListPresentationUpdate({ groupBy: 'tags' })).toMatchObject({
            ok: true,
            value: { groupBy: 'tags' }
        });
        expect(validateListPresentationUpdate({ groupBy: 'property-day:scheduled ' })).toMatchObject({
            ok: true,
            value: { groupBy: 'property-day:scheduled' }
        });
        expect(validateListPresentationUpdate({ groupBy: 'property-day-desc:scheduled' })).toMatchObject({
            ok: true,
            value: { groupBy: 'property-day-desc:scheduled' }
        });
        expect(validateListPresentationUpdate({ groupBy: 'property-follow:status' })).toMatchObject({
            ok: true,
            value: { groupBy: 'property-follow:status' }
        });
        expect(validateListPresentationUpdate({ groupBy: 'line-property:status' })).toMatchObject({
            ok: true,
            value: { groupBy: 'line-property:status' }
        });
        expect(validateListPresentationUpdate({ groupBy: 'line-property-day-desc:scheduled' })).toMatchObject({
            ok: true,
            value: { groupBy: 'line-property-day-desc:scheduled' }
        });
        expect(validateListPresentationUpdate({ groupBy: 'line-property-day-follow:scheduled' })).toMatchObject({
            ok: true,
            value: { groupBy: 'line-property-day-follow:scheduled' }
        });
        expect(validateListPresentationUpdate({ groupBy: 'property-day:' })).toEqual({ ok: false });
        expect(validateListPresentationUpdate({ groupBy: 'line-property-day:' })).toEqual({ ok: false });
        expect(validateListPresentationUpdate({ displayMode: 'wide' })).toEqual({ ok: false });
    });
});
