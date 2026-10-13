/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, it } from 'vitest';
import type { NotebookNavigatorSettings } from '../../src/settings';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import {
    createPropertyGroupingOption,
    getPropertyGroupingDirection,
    getPropertyGroupingGranularity,
    getPropertyGroupingKey,
    getPropertyGroupingOrder,
    getPropertyGroupingSource,
    normalizeListNoteGroupingBaseOption,
    normalizeListNoteGroupingOption,
    normalizePropertyGroupingSourceForMenu,
    replacePropertyGroupingSource
} from '../../src/settings/types';
import { ALL_TAGS_TAG_ID, ItemType } from '../../src/types';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';
import {
    areListGroupingOptionsEqual,
    areListGroupingOptionsSameKind,
    hasEffectiveCustomListGrouping,
    hasEffectiveCustomListGroupingForSelection,
    pruneUnavailablePropertyGroupingOverrides,
    reconcileDefaultNoteGrouping,
    resolveEffectiveListGroupingForSort,
    resolveListGrouping,
    resolveListGroupingOverrideForDefault,
    resolvePropertyGroupingDirection,
    updateDefaultNoteGroupingKey,
    updatePropertyGroupKeySetting,
    updatePropertyGroupingOverrideKeys
} from '../../src/utils/listGrouping';

type GroupingSettings = Pick<
    NotebookNavigatorSettings,
    'noteGrouping' | 'folderAppearances' | 'tagAppearances' | 'propertyAppearances' | 'typeAppearances'
>;

function createGroupingSettings(noteGrouping: GroupingSettings['noteGrouping']): GroupingSettings {
    return {
        noteGrouping,
        folderAppearances: {},
        tagAppearances: {},
        propertyAppearances: {},
        typeAppearances: {}
    };
}

describe('resolveListGrouping property selections', () => {
    it('uses custom property grouping overrides when present', () => {
        const propertyNodeId = buildPropertyKeyNodeId('status');
        const settings = createGroupingSettings('custom');
        settings.propertyAppearances = {
            [propertyNodeId]: { groupBy: 'date' }
        };

        const result = resolveListGrouping({
            settings,
            selectionType: ItemType.PROPERTY,
            propertyNodeId
        });

        expect(result.defaultGrouping).toBe('property-follow:status');
        expect(result.effectiveGrouping).toBe('date');
        expect(result.normalizedOverride).toBe('date');
        expect(result.hasCustomOverride).toBe(true);
    });

    it('normalizes invalid folder grouping overrides for properties', () => {
        const propertyNodeId = buildPropertyKeyNodeId('status');
        const settings = createGroupingSettings('folder');
        settings.propertyAppearances = {
            [propertyNodeId]: { groupBy: 'folder' }
        };

        const result = resolveListGrouping({
            settings,
            selectionType: ItemType.PROPERTY,
            propertyNodeId
        });

        expect(result.defaultGrouping).toBe('property-follow:status');
        expect(result.effectiveGrouping).toBe('property-follow:status');
        expect(result.normalizedOverride).toBeUndefined();
        expect(result.hasCustomOverride).toBe(false);
    });

    it('groups a top-level property selection by that property when no override exists', () => {
        const settings = createGroupingSettings('folder');

        const result = resolveListGrouping({
            settings,
            selectionType: ItemType.PROPERTY,
            propertyNodeId: buildPropertyKeyNodeId('status')
        });

        expect(result.defaultGrouping).toBe('property-follow:status');
        expect(result.effectiveGrouping).toBe('property-follow:status');
        expect(result.normalizedOverride).toBeUndefined();
        expect(result.hasCustomOverride).toBe(false);
    });

    it('keeps a property value selection on the normalized global default', () => {
        const settings = createGroupingSettings('folder');

        const result = resolveListGrouping({
            settings,
            selectionType: ItemType.PROPERTY,
            propertyNodeId: buildPropertyValueNodeId('status', 'open')
        });

        expect(result.defaultGrouping).toBe('date');
        expect(result.effectiveGrouping).toBe('date');
        expect(result.hasCustomOverride).toBe(false);
    });
});

describe('resolveListGrouping aggregate Tags selection', () => {
    it('groups the Tags root by tag without changing ordinary tag defaults', () => {
        const settings = createGroupingSettings('date');

        expect(
            resolveListGrouping({
                settings,
                selectionType: ItemType.TAG,
                tag: ALL_TAGS_TAG_ID
            })
        ).toMatchObject({
            defaultGrouping: 'tags',
            effectiveGrouping: 'tags',
            hasCustomOverride: false
        });
        expect(
            resolveListGrouping({
                settings,
                selectionType: ItemType.TAG,
                tag: 'projects'
            })
        ).toMatchObject({
            defaultGrouping: 'date',
            effectiveGrouping: 'date',
            hasCustomOverride: false
        });
    });
});

describe('resolveListGrouping structural Type selections', () => {
    it('uses a per-Type override and normalizes a folder default for vault-wide Types', () => {
        const settings = createGroupingSettings('folder');
        settings.typeAppearances = {
            [TPS_NAVIGATOR_TYPE_IDS.NOTES]: { groupBy: 'property:status' }
        };

        expect(
            resolveListGrouping({
                settings,
                selectionType: ItemType.TYPE,
                typeId: TPS_NAVIGATOR_TYPE_IDS.NOTES
            })
        ).toMatchObject({
            defaultGrouping: 'date',
            effectiveGrouping: 'property:status',
            hasCustomOverride: true
        });
        expect(
            resolveListGrouping({
                settings,
                selectionType: ItemType.TYPE,
                typeId: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES
            })
        ).toMatchObject({
            defaultGrouping: 'date',
            effectiveGrouping: 'date',
            hasCustomOverride: false
        });
    });
});

describe('resolveEffectiveListGroupingForSort', () => {
    it('uses no grouping when property sort would otherwise use date grouping', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'date',
                sortOption: 'property-asc',
                selectionType: ItemType.FOLDER
            })
        ).toBe('none');
    });

    it('keeps folder grouping for property-sorted folder views', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'folder',
                sortOption: 'property-asc',
                selectionType: ItemType.FOLDER
            })
        ).toBe('folder');
    });

    it('uses no grouping for property-sorted tag and property views', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'date',
                sortOption: 'property-asc',
                selectionType: ItemType.TAG
            })
        ).toBe('none');
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'date',
                sortOption: 'property-asc',
                selectionType: ItemType.PROPERTY
            })
        ).toBe('none');
    });

    it('keeps custom grouping with property sort', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'custom',
                sortOption: 'property-asc',
                selectionType: ItemType.TAG
            })
        ).toBe('custom');
    });

    it('uses no grouping when date grouping is paired with a non-date sort', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'date',
                sortOption: 'title-asc',
                selectionType: ItemType.FOLDER
            })
        ).toBe('none');
    });

    it('keeps date grouping with date sorts', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'date',
                sortOption: 'modified-desc',
                selectionType: ItemType.FOLDER
            })
        ).toBe('date');
    });

    it('locks manual sort to custom groups', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'folder',
                sortOption: 'property-asc',
                selectionType: ItemType.FOLDER,
                isManualSortActive: true
            })
        ).toBe('custom');
    });

    it('keeps property grouping under every sort and selection type', () => {
        const groupBy = createPropertyGroupingOption('status', 'asc');
        (['modified-desc', 'title-asc', 'property-asc'] as const).forEach(sortOption => {
            expect(
                resolveEffectiveListGroupingForSort({
                    groupBy,
                    sortOption,
                    selectionType: ItemType.FOLDER
                })
            ).toBe(groupBy);
        });
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy,
                sortOption: 'property-asc',
                selectionType: ItemType.TAG
            })
        ).toBe(groupBy);
    });

    it('keeps tag grouping under every sort', () => {
        (['modified-desc', 'title-asc', 'property-asc'] as const).forEach(sortOption => {
            expect(
                resolveEffectiveListGroupingForSort({
                    groupBy: 'tags',
                    sortOption,
                    selectionType: ItemType.TAG
                })
            ).toBe('tags');
        });
    });

    it('locks manual sort to custom groups even with property grouping', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: createPropertyGroupingOption('status', 'asc'),
                sortOption: 'property-asc',
                selectionType: ItemType.FOLDER,
                isManualSortActive: true
            })
        ).toBe('custom');
    });

    it('preserves aggregate grouping while manual order remains within each group', () => {
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: 'tags',
                sortOption: 'title-asc',
                selectionType: ItemType.TAG,
                isManualSortActive: true,
                preserveGroupingDuringManualSort: true
            })
        ).toBe('tags');
        expect(
            resolveEffectiveListGroupingForSort({
                groupBy: createPropertyGroupingOption('status', 'follow'),
                sortOption: 'title-asc',
                selectionType: ItemType.PROPERTY,
                isManualSortActive: true,
                preserveGroupingDuringManualSort: true
            })
        ).toBe('property-follow:status');
    });
});

describe('property grouping option encoding', () => {
    it('extracts trimmed property keys from encoded options', () => {
        expect(getPropertyGroupingKey('property:status')).toBe('status');
        expect(getPropertyGroupingKey('property: status ')).toBe('status');
        expect(getPropertyGroupingKey('property-desc:status')).toBe('status');
        expect(getPropertyGroupingKey('property-follow:status')).toBe('status');
        expect(getPropertyGroupingKey('property-day:scheduled')).toBe('scheduled');
        expect(getPropertyGroupingKey('property-day-desc:scheduled')).toBe('scheduled');
        expect(getPropertyGroupingKey('property-day-follow:scheduled')).toBe('scheduled');
        expect(getPropertyGroupingKey('line-property:scheduled')).toBe('scheduled');
        expect(getPropertyGroupingKey('line-property-day-desc:scheduled')).toBe('scheduled');
        expect(getPropertyGroupingKey('line-property-day-follow:scheduled')).toBe('scheduled');
        expect(getPropertyGroupingKey('property:')).toBeNull();
        expect(getPropertyGroupingKey('folder')).toBeNull();
    });

    it('preserves order, granularity, and source across every property grouping prefix', () => {
        expect(getPropertyGroupingOrder('property:status')).toBe('asc');
        expect(getPropertyGroupingOrder('property-desc:status')).toBe('desc');
        expect(getPropertyGroupingOrder('property-follow:status')).toBe('follow');
        expect(getPropertyGroupingOrder('property-day:scheduled')).toBe('asc');
        expect(getPropertyGroupingOrder('property-day-desc:scheduled')).toBe('desc');
        expect(getPropertyGroupingOrder('property-day-follow:scheduled')).toBe('follow');
        expect(getPropertyGroupingOrder('line-property:status')).toBe('asc');
        expect(getPropertyGroupingOrder('line-property-desc:status')).toBe('desc');
        expect(getPropertyGroupingOrder('line-property-follow:status')).toBe('follow');
        expect(getPropertyGroupingOrder('line-property-day:scheduled')).toBe('asc');
        expect(getPropertyGroupingOrder('line-property-day-desc:scheduled')).toBe('desc');
        expect(getPropertyGroupingOrder('line-property-day-follow:scheduled')).toBe('follow');
        expect(getPropertyGroupingOrder('folder')).toBeNull();

        expect(getPropertyGroupingDirection('property:status')).toBe('asc');
        expect(getPropertyGroupingDirection('property-desc:status')).toBe('desc');
        expect(getPropertyGroupingDirection('property-day:scheduled')).toBe('asc');
        expect(getPropertyGroupingDirection('property-day-desc:scheduled')).toBe('desc');
        expect(getPropertyGroupingDirection('line-property:scheduled')).toBe('asc');
        expect(getPropertyGroupingDirection('line-property-day-desc:scheduled')).toBe('desc');
        expect(getPropertyGroupingDirection('property-follow:status')).toBeNull();
        expect(getPropertyGroupingDirection('line-property-day-follow:scheduled')).toBeNull();
        expect(getPropertyGroupingDirection('folder')).toBeNull();

        expect(getPropertyGroupingGranularity('property:status')).toBe('value');
        expect(getPropertyGroupingGranularity('property-day:scheduled')).toBe('day');
        expect(getPropertyGroupingGranularity('line-property:scheduled')).toBe('value');
        expect(getPropertyGroupingGranularity('line-property-day:scheduled')).toBe('day');
        expect(getPropertyGroupingGranularity('property-day-follow:scheduled')).toBe('day');
        expect(getPropertyGroupingGranularity('line-property-follow:status')).toBe('value');
        expect(getPropertyGroupingGranularity('folder')).toBeNull();

        expect(getPropertyGroupingSource('property:status')).toBe('note');
        expect(getPropertyGroupingSource('property-day:scheduled')).toBe('note');
        expect(getPropertyGroupingSource('property-follow:status')).toBe('note');
        expect(getPropertyGroupingSource('line-property:status')).toBe('line');
        expect(getPropertyGroupingSource('line-property-day:scheduled')).toBe('line');
        expect(getPropertyGroupingSource('line-property-day-follow:scheduled')).toBe('line');
        expect(getPropertyGroupingSource('folder')).toBeNull();

        expect(createPropertyGroupingOption('status', 'desc')).toBe('property-desc:status');
        expect(createPropertyGroupingOption('status')).toBe('property:status');
        expect(createPropertyGroupingOption('status', 'follow')).toBe('property-follow:status');
        expect(createPropertyGroupingOption('scheduled', 'asc', 'day')).toBe('property-day:scheduled');
        expect(createPropertyGroupingOption('scheduled', 'desc', 'day')).toBe('property-day-desc:scheduled');
        expect(createPropertyGroupingOption('scheduled', 'follow', 'day')).toBe('property-day-follow:scheduled');
        expect(createPropertyGroupingOption('status', 'asc', 'value', 'line')).toBe('line-property:status');
        expect(createPropertyGroupingOption('scheduled', 'desc', 'day', 'line')).toBe('line-property-day-desc:scheduled');
        expect(createPropertyGroupingOption('scheduled', 'follow', 'day', 'line')).toBe('line-property-day-follow:scheduled');
    });

    it('keeps keys containing separator characters intact under both prefixes', () => {
        expect(getPropertyGroupingKey('property:-desc:odd')).toBe('-desc:odd');
        expect(getPropertyGroupingOrder('property:-desc:odd')).toBe('asc');
    });

    it('switches property sources without changing the key, order, or day granularity', () => {
        expect(replacePropertyGroupingSource('property-day-desc:Scheduled', 'line')).toBe('line-property-day-desc:Scheduled');
        expect(replacePropertyGroupingSource('property-day-follow:Scheduled', 'line')).toBe('line-property-day-follow:Scheduled');
        expect(replacePropertyGroupingSource('line-property:Parents', 'note')).toBe('property:Parents');
        expect(replacePropertyGroupingSource('line-property-follow:Parents', 'note')).toBe('property-follow:Parents');
        expect(replacePropertyGroupingSource('date', 'line')).toBeNull();
    });

    it('normalizes line source for menu display only when line properties are unavailable', () => {
        const stored = 'line-property-day-desc:Scheduled' as const;
        expect(normalizePropertyGroupingSourceForMenu(stored, true)).toBe(stored);
        expect(normalizePropertyGroupingSourceForMenu(stored, false)).toBe('property-day-desc:Scheduled');
        expect(stored).toBe('line-property-day-desc:Scheduled');
        expect(normalizePropertyGroupingSourceForMenu('date', false)).toBe('date');
    });

    it('normalizes property grouping options to trimmed canonical form', () => {
        expect(normalizeListNoteGroupingOption('property: status ')).toBe('property:status');
        expect(normalizeListNoteGroupingOption('property-desc: status ')).toBe('property-desc:status');
        expect(normalizeListNoteGroupingOption('property-follow: status ')).toBe('property-follow:status');
        expect(normalizeListNoteGroupingOption('property-day: scheduled ')).toBe('property-day:scheduled');
        expect(normalizeListNoteGroupingOption('property-day-desc: scheduled ')).toBe('property-day-desc:scheduled');
        expect(normalizeListNoteGroupingOption('property-day-follow: scheduled ')).toBe('property-day-follow:scheduled');
        expect(normalizeListNoteGroupingOption('line-property: status ')).toBe('line-property:status');
        expect(normalizeListNoteGroupingOption('line-property-day-desc: scheduled ')).toBe('line-property-day-desc:scheduled');
        expect(normalizeListNoteGroupingOption('line-property-day-follow: scheduled ')).toBe('line-property-day-follow:scheduled');
        expect(normalizeListNoteGroupingOption('property:')).toBeNull();
        expect(normalizeListNoteGroupingOption('property-desc:')).toBeNull();
        expect(normalizeListNoteGroupingOption('none')).toBe('none');
        expect(normalizeListNoteGroupingOption('date')).toBe('date');
    });

    it('rejects property encodings for the vault-wide default grouping', () => {
        expect(normalizeListNoteGroupingBaseOption('property:status')).toBeNull();
        expect(normalizeListNoteGroupingBaseOption('property-desc:status')).toBeNull();
        expect(normalizeListNoteGroupingBaseOption('property-follow:status')).toBeNull();
        expect(normalizeListNoteGroupingBaseOption('line-property:status')).toBeNull();
        expect(normalizeListNoteGroupingBaseOption('none')).toBe('none');
        expect(normalizeListNoteGroupingBaseOption('folder')).toBe('folder');
        expect(normalizeListNoteGroupingBaseOption('date')).toBe('date');
        expect(normalizeListNoteGroupingBaseOption('tags')).toBe('tags');
    });

    it('accepts complete property encodings for persisted defaults and appearances', () => {
        expect(normalizeListNoteGroupingOption('property:status')).toBe('property:status');
        expect(normalizeListNoteGroupingOption('property-desc:status')).toBe('property-desc:status');
        expect(normalizeListNoteGroupingOption('property-follow:status')).toBe('property-follow:status');
        expect(normalizeListNoteGroupingOption('property-day-follow:scheduled')).toBe('property-day-follow:scheduled');
        expect(normalizeListNoteGroupingOption('line-property-day-follow:scheduled')).toBe('line-property-day-follow:scheduled');
        expect(normalizeListNoteGroupingOption('none')).toBe('none');
        expect(normalizeListNoteGroupingOption('folder')).toBe('folder');
        expect(normalizeListNoteGroupingOption('date')).toBe('date');
    });

    it('compares property grouping options case-insensitively including direction', () => {
        expect(areListGroupingOptionsEqual('property:Status', 'property:status')).toBe(true);
        expect(areListGroupingOptionsEqual('property:status', 'property-desc:status')).toBe(false);
        expect(areListGroupingOptionsEqual('property:status', 'property-follow:status')).toBe(false);
        expect(areListGroupingOptionsEqual('property:status', 'property:genre')).toBe(false);
        expect(areListGroupingOptionsEqual('property:scheduled', 'property-day:scheduled')).toBe(false);
        expect(areListGroupingOptionsEqual('property:status', 'line-property:status')).toBe(false);
        expect(areListGroupingOptionsEqual('property:status', 'folder')).toBe(false);
        expect(areListGroupingOptionsEqual('date', 'date')).toBe(true);
    });

    it('matches grouping options of the same kind regardless of direction', () => {
        expect(areListGroupingOptionsSameKind('property:status', 'property-desc:Status')).toBe(true);
        expect(areListGroupingOptionsSameKind('property:status', 'property-follow:Status')).toBe(true);
        expect(areListGroupingOptionsSameKind('property:status', 'property:genre')).toBe(false);
        expect(areListGroupingOptionsSameKind('property:scheduled', 'property-day:scheduled')).toBe(false);
        expect(areListGroupingOptionsSameKind('property:status', 'line-property:status')).toBe(false);
        expect(areListGroupingOptionsSameKind('property-day:scheduled', 'property-day-desc:Scheduled')).toBe(true);
        expect(areListGroupingOptionsSameKind('property-day:scheduled', 'property-day-follow:Scheduled')).toBe(true);
        expect(areListGroupingOptionsSameKind('line-property-day:scheduled', 'line-property-day-desc:Scheduled')).toBe(true);
        expect(areListGroupingOptionsSameKind('line-property-day:scheduled', 'line-property-day-follow:Scheduled')).toBe(true);
        expect(areListGroupingOptionsSameKind('date', 'date')).toBe(true);
        expect(areListGroupingOptionsSameKind('property:status', 'custom')).toBe(false);
    });

    it('retains a grouping override when only one component matches the default', () => {
        expect(resolveListGroupingOverrideForDefault('property:genre', 'property:status')).toBe('property:genre');
        expect(resolveListGroupingOverrideForDefault('property-desc:status', 'property:status')).toBe('property-desc:status');
        expect(resolveListGroupingOverrideForDefault('property-follow:status', 'property:status')).toBe('property-follow:status');
    });

    it('removes a grouping override when the complete selection matches the default', () => {
        expect(resolveListGroupingOverrideForDefault('property:Status', 'property:status')).toBeUndefined();
        expect(resolveListGroupingOverrideForDefault('property-follow:Status', 'property-follow:status')).toBeUndefined();
        expect(resolveListGroupingOverrideForDefault('date', 'date')).toBeUndefined();
    });
});

describe('pruneUnavailablePropertyGroupingOverrides', () => {
    it('removes overrides for unregistered keys and keeps the rest', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertyGroupKey = 'status, genre';
        settings.folderAppearances.Projects = { groupBy: 'property:status' };
        settings.folderAppearances.Archive = { groupBy: 'property:removed' };
        settings.folderAppearances.Mixed = { groupBy: 'property:removed', mode: 'compact' };
        settings.tagAppearances.reading = { groupBy: 'date' };

        expect(pruneUnavailablePropertyGroupingOverrides(settings)).toBe(true);
        expect(settings.folderAppearances.Projects.groupBy).toBe('property:status');
        // Grouping-only records are dropped entirely; records with other fields keep those fields.
        expect(settings.folderAppearances.Archive).toBeUndefined();
        expect(settings.folderAppearances.Mixed).toEqual({ mode: 'compact' });
        expect(settings.tagAppearances.reading.groupBy).toBe('date');
    });

    it('removes overrides referencing the manual sort key', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertyGroupKey = `status, ${settings.manualSortPropertyKey}`;
        settings.folderAppearances.Projects = { groupBy: createPropertyGroupingOption(settings.manualSortPropertyKey, 'asc') };

        expect(pruneUnavailablePropertyGroupingOverrides(settings)).toBe(true);
        expect(settings.folderAppearances.Projects).toBeUndefined();
    });

    it('reports no change when every override is available', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertyGroupKey = 'status';
        settings.folderAppearances.Projects = { groupBy: 'property:Status' };

        expect(pruneUnavailablePropertyGroupingOverrides(settings)).toBe(false);
        expect(settings.folderAppearances.Projects.groupBy).toBe('property:Status');
    });

    it('retains a top-level property scope grouping by its own unregistered key', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertyGroupKey = 'genre';
        settings.propertyAppearances['key:status'] = { groupBy: 'property-follow:Status' };
        settings.propertyAppearances['value:status:done'] = { groupBy: 'property:Status' };

        expect(pruneUnavailablePropertyGroupingOverrides(settings)).toBe(true);
        expect(settings.propertyAppearances['key:status']).toEqual({ groupBy: 'property-follow:Status' });
        expect(settings.propertyAppearances['value:status:done']).toBeUndefined();
    });
});

describe('updatePropertyGroupingOverrideKeys', () => {
    it('rewrites overrides after a property rename', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.folderAppearances.Projects = { groupBy: 'property:Status' };
        settings.tagAppearances.reading = { groupBy: 'date' };

        expect(updatePropertyGroupingOverrideKeys(settings, 'status', 'State')).toBe(true);
        expect(settings.folderAppearances.Projects.groupBy).toBe('property:State');
        expect(settings.tagAppearances.reading.groupBy).toBe('date');
    });

    it('preserves the group order direction across a rename', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.folderAppearances.Projects = { groupBy: 'property-desc:Status' };

        expect(updatePropertyGroupingOverrideKeys(settings, 'status', 'State')).toBe(true);
        expect(settings.folderAppearances.Projects.groupBy).toBe('property-desc:State');
    });

    it('preserves calendar-day granularity across a rename', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.folderAppearances.Projects = { groupBy: 'property-day-desc:Scheduled' };

        expect(updatePropertyGroupingOverrideKeys(settings, 'scheduled', 'Start')).toBe(true);
        expect(settings.folderAppearances.Projects.groupBy).toBe('property-day-desc:Start');
    });

    it('preserves line-only source across a rename', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.folderAppearances.Projects = { groupBy: 'line-property-day-desc:Scheduled' };

        expect(updatePropertyGroupingOverrideKeys(settings, 'scheduled', 'Start')).toBe(true);
        expect(settings.folderAppearances.Projects.groupBy).toBe('line-property-day-desc:Start');
    });

    it('removes overrides when the property is deleted', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.folderAppearances.Projects = { groupBy: 'property:status' };
        settings.folderAppearances.Mixed = { groupBy: 'property:status', mode: 'compact' };

        expect(updatePropertyGroupingOverrideKeys(settings, 'status', null)).toBe(true);
        // Grouping-only records are dropped entirely; records with other fields keep those fields.
        expect(settings.folderAppearances.Projects).toBeUndefined();
        expect(settings.folderAppearances.Mixed).toEqual({ mode: 'compact' });
    });
});

describe('hasEffectiveCustomListGroupingForSelection', () => {
    it('does not treat a non-date fallback as custom grouping', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'date';
        settings.defaultFolderSort = 'title-asc';

        expect(hasEffectiveCustomListGroupingForSelection(settings, ItemType.FOLDER, null)).toBe(false);
    });

    it('does not treat a selection sort fallback as custom grouping', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'date';
        settings.defaultFolderSort = 'modified-desc';
        settings.folderSortOverrides.Projects = 'title-asc';

        expect(hasEffectiveCustomListGroupingForSelection(settings, ItemType.FOLDER, 'Projects')).toBe(false);
        expect(hasEffectiveCustomListGroupingForSelection(settings, ItemType.FOLDER, 'Writing')).toBe(false);
    });

    it('keeps a tag sort fallback separate from custom grouping', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'folder';
        settings.defaultFolderSort = 'modified-desc';
        settings.tagAppearances.reading = { groupBy: 'date' };
        settings.tagSortOverrides.reading = 'title-asc';

        expect(hasEffectiveCustomListGroupingForSelection(settings, ItemType.TAG, 'reading')).toBe(false);
    });

    it('keeps a property sort fallback separate from custom grouping', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'folder';
        settings.defaultFolderSort = 'modified-desc';
        settings.propertySortOverrides['property:status:active'] = 'property-asc';

        expect(hasEffectiveCustomListGroupingForSelection(settings, ItemType.PROPERTY, 'property:status:active')).toBe(false);
    });

    it('detects an explicit custom grouping override', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'none';
        settings.defaultFolderSort = 'title-asc';
        settings.folderAppearances.Projects = { groupBy: 'custom' };

        expect(hasEffectiveCustomListGroupingForSelection(settings, ItemType.FOLDER, 'Projects')).toBe(true);
    });

    it('detects custom grouping forced by manual sorting', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'folder';
        settings.defaultFolderSort = 'property-asc';
        settings.propertySortKey = settings.manualSortPropertyKey;

        expect(hasEffectiveCustomListGroupingForSelection(settings, ItemType.FOLDER, null)).toBe(true);
    });

    it('detects manual sorting in an object override', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'folder';
        settings.defaultFolderSort = 'modified-desc';
        settings.folderSortOverrides.Projects = {
            option: 'property-desc',
            propertyKey: settings.manualSortPropertyKey
        };

        expect(hasEffectiveCustomListGroupingForSelection(settings, ItemType.FOLDER, 'Projects')).toBe(true);
    });

    it('does not treat alphabetical folder grouping as custom', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'folder';
        settings.defaultFolderSort = 'modified-desc';
        settings.folderSortOverrides.Projects = 'title-asc';

        expect(hasEffectiveCustomListGroupingForSelection(settings, ItemType.FOLDER, 'Projects')).toBe(false);
    });

    it('ignores custom grouping and sort overrides owned only by source-backed Types', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.typeAppearances = {
            [TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES]: { groupBy: 'custom' },
            [TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS]: { groupBy: 'custom' }
        };
        settings.typeSortOverrides = {
            [TPS_NAVIGATOR_TYPE_IDS.BULLETS]: 'title-asc',
            [TPS_NAVIGATOR_TYPE_IDS.TABLES]: 'title-desc'
        };

        expect(hasEffectiveCustomListGrouping(settings)).toBe(false);
    });

    it('still detects custom grouping and sort overrides for file-backed Types', () => {
        const appearanceSettings = structuredClone(DEFAULT_SETTINGS);
        appearanceSettings.typeAppearances = {
            [TPS_NAVIGATOR_TYPE_IDS.NOTES]: { groupBy: 'custom' }
        };
        expect(hasEffectiveCustomListGrouping(appearanceSettings)).toBe(true);

        const sortSettings = structuredClone(DEFAULT_SETTINGS);
        sortSettings.typeSortOverrides = {
            [TPS_NAVIGATOR_TYPE_IDS.BASES]: {
                option: 'property-asc',
                propertyKey: sortSettings.manualSortPropertyKey
            }
        };
        expect(hasEffectiveCustomListGrouping(sortSettings)).toBe(true);
    });
});

describe('reconcileDefaultNoteGrouping', () => {
    it('keeps property groupings whose key is configured, matching case-insensitively', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertyGroupKey = 'Status, genre';
        settings.noteGrouping = 'property:status';

        expect(reconcileDefaultNoteGrouping(settings)).toEqual({ changed: false, reset: false });
        expect(settings.noteGrouping).toBe('property:status');
    });

    it('resets property groupings whose key is not configured', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertyGroupKey = 'genre';
        settings.noteGrouping = 'property-desc:status';

        expect(reconcileDefaultNoteGrouping(settings)).toEqual({ changed: true, reset: true });
        expect(settings.noteGrouping).toBe(DEFAULT_SETTINGS.noteGrouping);
    });

    it('resets property groupings referencing the manual sort key', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertyGroupKey = settings.manualSortPropertyKey;
        settings.noteGrouping = createPropertyGroupingOption(settings.manualSortPropertyKey, 'asc');

        expect(reconcileDefaultNoteGrouping(settings)).toEqual({ changed: true, reset: true });
        expect(settings.noteGrouping).toBe(DEFAULT_SETTINGS.noteGrouping);
    });

    it('leaves base grouping modes untouched', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'folder';

        expect(reconcileDefaultNoteGrouping(settings)).toEqual({ changed: false, reset: false });
        expect(settings.noteGrouping).toBe('folder');
    });
});

describe('updateDefaultNoteGroupingKey', () => {
    it('rewrites the default grouping key on rename and keeps the direction', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'property-desc:status';

        expect(updateDefaultNoteGroupingKey(settings, 'status', 'Stage')).toBe(true);
        expect(settings.noteGrouping).toBe('property-desc:Stage');
    });

    it('resets the default grouping when the key is deleted', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'property:status';

        expect(updateDefaultNoteGroupingKey(settings, 'status', null)).toBe(true);
        expect(settings.noteGrouping).toBe(DEFAULT_SETTINGS.noteGrouping);
    });

    it('ignores renames of other keys and base grouping modes', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.noteGrouping = 'property:status';

        expect(updateDefaultNoteGroupingKey(settings, 'genre', 'Stage')).toBe(false);
        expect(settings.noteGrouping).toBe('property:status');

        settings.noteGrouping = 'date';
        expect(updateDefaultNoteGroupingKey(settings, 'status', 'Stage')).toBe(false);
        expect(settings.noteGrouping).toBe('date');
    });
});

describe('resolvePropertyGroupingDirection', () => {
    it('borrows the sort direction for follow-sort group orders', () => {
        expect(resolvePropertyGroupingDirection('property-follow:status', 'modified-desc')).toBe('desc');
        expect(resolvePropertyGroupingDirection('property-follow:status', 'title-asc')).toBe('asc');
        expect(resolvePropertyGroupingDirection('property-follow:status', 'property-desc')).toBe('desc');
        expect(resolvePropertyGroupingDirection('line-property-day-follow:scheduled', 'title-asc')).toBe('asc');
    });

    it('returns fixed group orders unchanged regardless of the sort direction', () => {
        expect(resolvePropertyGroupingDirection('property:status', 'modified-desc')).toBe('asc');
        expect(resolvePropertyGroupingDirection('property-desc:status', 'title-asc')).toBe('desc');
    });
});

describe('updatePropertyGroupKeySetting', () => {
    it('rewrites the configured grouping list on rename and removes the key on delete', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertyGroupKey = 'status, genre';

        expect(updatePropertyGroupKeySetting(settings, 'status', 'Stage')).toBe(true);
        expect(settings.propertyGroupKey).toBe('Stage, genre');

        expect(updatePropertyGroupKeySetting(settings, 'genre', null)).toBe(true);
        expect(settings.propertyGroupKey).toBe('Stage');
    });

    it('reports no change for unknown keys and empty lists', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertyGroupKey = 'status';

        expect(updatePropertyGroupKeySetting(settings, 'genre', 'Stage')).toBe(false);
        expect(settings.propertyGroupKey).toBe('status');

        settings.propertyGroupKey = '';
        expect(updatePropertyGroupKeySetting(settings, 'status', 'Stage')).toBe(false);
    });
});
