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
import { describe, it, expect } from 'vitest';
import {
    buildSearchNavFilterState,
    parseFilterSearchTokens,
    fileMatchesDateFilterTokens,
    fileMatchesFilterTokens,
    filterSearchHasActiveCriteria,
    filterSearchMatchesTypeFacet,
    findFilterSearchNameMatch,
    getFileFilterSearchMatch,
    updateFilterQueryWithTag,
    updateFilterQueryWithDateToken,
    updateFilterQueryWithProperty,
    updateFilterQueryWithType,
    updateFilterQueryWithTypeSelection
} from '../../src/utils/filterSearch';
import { buildPropertyValueNodeId } from '../../src/utils/propertyTree';
import { foldSearchText } from '../../src/utils/recordUtils';
import { createTpsNavigatorProviderTypeId, TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

const sortTokens = (values: string[]) => [...values].sort();

const createLocalDate = (year: number, monthIndex: number, day: number): Date => {
    const date = new Date(0);
    date.setFullYear(year, monthIndex, day);
    date.setHours(0, 0, 0, 0);
    return date;
};

describe('parseFilterSearchTokens', () => {
    it('returns neutral tokens for blank queries', () => {
        const tokens = parseFilterSearchTokens('');
        expect(tokens.mode).toBe('filter');
        expect(tokens.expression).toHaveLength(0);
        expect(tokens.hasInclusions).toBe(false);
        expect(tokens.requiresTags).toBe(false);
        expect(tokens.allRequireTags).toBe(false);
        expect(tokens.requireUnfinishedTasks).toBe(false);
        expect(tokens.excludeUnfinishedTasks).toBe(false);
        expect(tokens.includedTagTokens).toEqual([]);
        expect(tokens.nameTokens).toEqual([]);
        expect(tokens.tagTokens).toEqual([]);
        expect(tokens.dateRanges).toEqual([]);
        expect(tokens.requireTagged).toBe(false);
        expect(tokens.includeUntagged).toBe(false);
        expect(tokens.excludeNameTokens).toEqual([]);
        expect(tokens.excludeTagTokens).toEqual([]);
        expect(tokens.folderTokens).toEqual([]);
        expect(tokens.excludeFolderTokens).toEqual([]);
        expect(tokens.extensionTokens).toEqual([]);
        expect(tokens.excludeExtensionTokens).toEqual([]);
        expect(tokens.typeTokens).toEqual([]);
        expect(tokens.excludeTypeTokens).toEqual([]);
        expect(tokens.excludeDateRanges).toEqual([]);
        expect(tokens.excludeTagged).toBe(false);
    });

    it('parses name tokens without tags', () => {
        const tokens = parseFilterSearchTokens('Platform note');
        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(true);
        expect(tokens.requiresTags).toBe(false);
        expect(tokens.allRequireTags).toBe(false);
        expect(tokens.includedTagTokens).toEqual([]);
        expect(tokens.nameTokens).toEqual(['platform', 'note']);
        expect(tokens.tagTokens).toEqual([]);
        expect(tokens.requireTagged).toBe(false);
        expect(tokens.includeUntagged).toBe(false);
    });

    it('folds diacritics in search token parsing', () => {
        const tokens = parseFilterSearchTokens('canción #Música folder:/Notas/Rápidas ext:ḾD .Estadó=acción');
        expect(tokens.mode).toBe('filter');
        expect(tokens.nameTokens).toEqual(['cancion']);
        expect(tokens.tagTokens).toEqual(['musica']);
        expect(tokens.folderTokens).toEqual([{ mode: 'exact', value: 'notas/rapidas' }]);
        expect(tokens.extensionTokens).toEqual(['md']);
        expect(tokens.propertyTokens).toEqual([{ key: 'estado', value: 'accion' }]);
    });

    it('treats diacritic-folded connector words as literal tokens', () => {
        const tokens = parseFilterSearchTokens('#alpha ånd #beta');
        expect(tokens.mode).toBe('filter');
        expect(tokens.tagTokens).toEqual(['alpha', 'beta']);
        expect(tokens.nameTokens).toEqual(['and']);
    });

    it('treats diacritic-folded OR tokens as literal tokens', () => {
        const tokens = parseFilterSearchTokens('#alpha ör #beta');
        expect(tokens.mode).toBe('filter');
        expect(tokens.tagTokens).toEqual(['alpha', 'beta']);
        expect(tokens.nameTokens).toEqual(['or']);
    });

    it('parses tag tokens combined with name tokens', () => {
        const tokens = parseFilterSearchTokens('#yta plat');
        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(true);
        expect(tokens.requiresTags).toBe(true);
        expect(tokens.allRequireTags).toBe(true);
        expect(tokens.includedTagTokens).toEqual(['yta']);
        expect(tokens.tagTokens).toEqual(['yta']);
        expect(tokens.nameTokens).toEqual(['plat']);
        expect(tokens.requireTagged).toBe(true);
        expect(tokens.includeUntagged).toBe(false);
    });

    it('fails closed when explicit AND is mixed with name and tag criteria', () => {
        const tokens = parseFilterSearchTokens('#yta and plat');
        expect(tokens.mode).toBe('filter');
        expect(tokens.invalidReason).toBe('mixed-logical-operator');
        expect(tokens.nameTokens).toEqual([]);
        expect(tokens.includedTagTokens).toEqual([]);
        expect(fileMatchesFilterTokens('and', ['yta'], tokens)).toBe(false);
    });

    it('collects tag tokens when OR connectors appear between tokens', () => {
        const tokens = parseFilterSearchTokens('#alpha OR #beta');
        expect(tokens.mode).toBe('tag');
        expect(tokens.expression.length).toBeGreaterThan(0);
        expect(tokens.requiresTags).toBe(true);
        expect(tokens.allRequireTags).toBe(true);
        expect(sortTokens(tokens.includedTagTokens)).toEqual(['alpha', 'beta']);
        expect(sortTokens(tokens.tagTokens)).toEqual(['alpha', 'beta']);
        expect(tokens.nameTokens).toEqual([]);
        expect(tokens.requireTagged).toBe(false);
        expect(tokens.includeUntagged).toBe(false);
    });

    it('treats standalone OR as literal name text', () => {
        const tokens = parseFilterSearchTokens('OR');
        expect(tokens.mode).toBe('filter');
        expect(tokens.invalidReason).toBeNull();
        expect(tokens.nameTokens).toEqual(['or']);
        expect(fileMatchesFilterTokens('project or roadmap', [], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('roadmap', [], tokens)).toBe(false);
    });

    it('treats standalone AND as literal name text', () => {
        const tokens = parseFilterSearchTokens('AND');
        expect(tokens.mode).toBe('filter');
        expect(tokens.invalidReason).toBeNull();
        expect(tokens.nameTokens).toEqual(['and']);
        expect(fileMatchesFilterTokens('research and development', [], tokens)).toBe(true);
    });

    it('keeps trailing connectors literal in name-only queries', () => {
        const tokens = parseFilterSearchTokens('openai and');
        expect(tokens.invalidReason).toBeNull();
        expect(sortTokens(tokens.nameTokens)).toEqual(['and', 'openai']);
    });

    it('keeps leading connectors literal in name-only queries', () => {
        const tokens = parseFilterSearchTokens('or openai');
        expect(tokens.invalidReason).toBeNull();
        expect(sortTokens(tokens.nameTokens)).toEqual(['openai', 'or']);
    });

    it('sets requireTagged when query is only hash', () => {
        const tokens = parseFilterSearchTokens('#');
        expect(tokens.mode).toBe('tag');
        expect(tokens.requiresTags).toBe(true);
        expect(tokens.allRequireTags).toBe(true);
        expect(tokens.includedTagTokens).toEqual([]);
        expect(tokens.requireTagged).toBe(true);
        expect(tokens.includeUntagged).toBe(false);
    });

    it('fails closed when an OR expression mixes a name with a tag', () => {
        const tokens = parseFilterSearchTokens('plan OR #alpha');
        expect(tokens.invalidReason).toBe('mixed-logical-operator');
        expect(fileMatchesFilterTokens('plan or', ['alpha'], tokens)).toBe(false);
    });

    it('applies tag mode precedence when only tags and connectors are present', () => {
        const tokens = parseFilterSearchTokens('#tag1 OR #tag2 AND #tag3');
        expect(tokens.mode).toBe('tag');
        expect(tokens.requiresTags).toBe(true);
        expect(tokens.allRequireTags).toBe(true);
        expect(sortTokens(tokens.includedTagTokens)).toEqual(['tag1', 'tag2', 'tag3']);
        expect(tokens.includeUntagged).toBe(false);
    });

    it('marks untagged inclusion when -# appears in tag expressions', () => {
        const tokens = parseFilterSearchTokens('#alpha OR -#');
        expect(tokens.mode).toBe('tag');
        expect(tokens.includeUntagged).toBe(true);
        expect(tokens.excludeTagged).toBe(false);
        expect(tokens.includedTagTokens).toEqual(['alpha']);
    });

    it('drops dangling connectors before exclusion tokens', () => {
        const tokens = parseFilterSearchTokens('#alpha OR -#beta');
        expect(tokens.mode).toBe('tag');
        expect(tokens.requiresTags).toBe(true);
        expect(tokens.excludeTagTokens).toEqual(['beta']);
        expect(tokens.excludeTagged).toBe(false);
        expect(tokens.includedTagTokens).toEqual(['alpha']);
        expect(tokens.includeUntagged).toBe(false);
    });

    it('drops dangling connectors before the first inclusion token', () => {
        const tokens = parseFilterSearchTokens('-#beta OR #alpha');
        expect(tokens.mode).toBe('tag');
        expect(tokens.requiresTags).toBe(true);
        expect(sortTokens(tokens.includedTagTokens)).toEqual(['alpha']);
        expect(tokens.includeUntagged).toBe(false);
    });

    it('keeps tag mode for negated tag-only expressions', () => {
        const tokens = parseFilterSearchTokens('-#alpha OR -#beta');
        expect(tokens.mode).toBe('tag');
        expect(tokens.requiresTags).toBe(true);
        expect(tokens.includedTagTokens).toEqual([]);
        expect(tokens.excludeTagTokens).toEqual(['alpha', 'beta']);
        expect(tokens.excludeTagged).toBe(false);
        expect(tokens.includeUntagged).toBe(false);
    });

    it('parses dash-prefixed negated name tokens', () => {
        const tokens = parseFilterSearchTokens('-draft');
        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(false);
        expect(tokens.excludeNameTokens).toEqual(['draft']);
    });

    it('parses dash-prefixed negated tag tokens', () => {
        const tokens = parseFilterSearchTokens('-#yta');
        expect(tokens.mode).toBe('tag');
        expect(tokens.excludeTagTokens).toEqual(['yta']);
        expect(tokens.excludeTagged).toBe(false);
    });

    it('treats bang-prefixed name tokens as literal text', () => {
        const tokens = parseFilterSearchTokens('!draft');
        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(true);
        expect(tokens.nameTokens).toEqual(['!draft']);
        expect(tokens.excludeNameTokens).toEqual([]);
    });

    it('treats bang-prefixed tag tokens as literal text', () => {
        const tokens = parseFilterSearchTokens('!#yta');
        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(true);
        expect(tokens.nameTokens).toEqual(['!#yta']);
        expect(tokens.excludeTagTokens).toEqual([]);
    });

    it('marks untagged inclusion when -# appears with name tokens', () => {
        const tokens = parseFilterSearchTokens('plat -#');
        expect(tokens.mode).toBe('filter');
        expect(tokens.includeUntagged).toBe(true);
        expect(tokens.excludeTagged).toBe(true);
    });

    it('parses negated tagged requirement', () => {
        const tokens = parseFilterSearchTokens('-#');
        expect(tokens.mode).toBe('tag');
        expect(tokens.excludeTagged).toBe(false);
        expect(tokens.includeUntagged).toBe(true);
    });

    it('parses ISO date tokens with @ prefix', () => {
        const tokens = parseFilterSearchTokens('@2026-02-04');
        expect(tokens.mode).toBe('filter');
        expect(tokens.dateRanges).toHaveLength(1);
        expect(tokens.excludeDateRanges).toEqual([]);

        const range = tokens.dateRanges[0];
        expect(range.field).toBe('default');
        expect(range.startMs).toBe(new Date(2026, 1, 4).getTime());
        expect(range.endMs).toBe(new Date(2026, 1, 5).getTime());
    });

    it('resolves relative dates from the supplied local-day reference', () => {
        const first = parseFilterSearchTokens('@today', { referenceDate: new Date(2026, 7, 12, 18) });
        const next = parseFilterSearchTokens('@today', { referenceDate: new Date(2026, 7, 13, 8) });

        expect(first.dateRanges[0]).toEqual({
            field: 'default',
            startMs: new Date(2026, 7, 12).getTime(),
            endMs: new Date(2026, 7, 13).getTime()
        });
        expect(next.dateRanges[0]).toEqual({
            field: 'default',
            startMs: new Date(2026, 7, 13).getTime(),
            endMs: new Date(2026, 7, 14).getTime()
        });
    });

    it('parses year date tokens with @ prefix', () => {
        const tokens = parseFilterSearchTokens('@2026');
        expect(tokens.mode).toBe('filter');
        expect(tokens.dateRanges).toHaveLength(1);
        expect(tokens.excludeDateRanges).toEqual([]);

        const range = tokens.dateRanges[0];
        expect(range.field).toBe('default');
        expect(range.startMs).toBe(new Date(2026, 0, 1).getTime());
        expect(range.endMs).toBe(new Date(2027, 0, 1).getTime());
    });

    it('parses three-digit year date tokens with @ prefix', () => {
        const tokens = parseFilterSearchTokens('@999');
        expect(tokens.mode).toBe('filter');
        expect(tokens.dateRanges).toHaveLength(1);
        expect(tokens.excludeDateRanges).toEqual([]);

        const range = tokens.dateRanges[0];
        expect(range.field).toBe('default');
        expect(range.startMs).toBe(createLocalDate(999, 0, 1).getTime());
        expect(range.endMs).toBe(createLocalDate(1000, 0, 1).getTime());
    });

    it('parses zero-padded pre-1000 year date tokens with @ prefix', () => {
        const tokens = parseFilterSearchTokens('@0999');
        expect(tokens.mode).toBe('filter');
        expect(tokens.dateRanges).toHaveLength(1);

        const range = tokens.dateRanges[0];
        expect(range.startMs).toBe(createLocalDate(999, 0, 1).getTime());
        expect(range.endMs).toBe(createLocalDate(1000, 0, 1).getTime());
    });

    it('parses year/month date tokens with @ prefix', () => {
        const tokens = parseFilterSearchTokens('@2026-02');
        expect(tokens.mode).toBe('filter');
        expect(tokens.dateRanges).toHaveLength(1);
        expect(tokens.excludeDateRanges).toEqual([]);

        const range = tokens.dateRanges[0];
        expect(range.field).toBe('default');
        expect(range.startMs).toBe(new Date(2026, 1, 1).getTime());
        expect(range.endMs).toBe(new Date(2026, 2, 1).getTime());
    });

    it('parses pre-1000 year/month date tokens with @ prefix', () => {
        const tokens = parseFilterSearchTokens('@999-02');
        expect(tokens.mode).toBe('filter');
        expect(tokens.dateRanges).toHaveLength(1);
        expect(tokens.excludeDateRanges).toEqual([]);

        const range = tokens.dateRanges[0];
        expect(range.startMs).toBe(createLocalDate(999, 1, 1).getTime());
        expect(range.endMs).toBe(createLocalDate(999, 2, 1).getTime());
    });

    it('parses year/week date tokens with @ prefix', () => {
        const tokens = parseFilterSearchTokens('@2026-W05');
        expect(tokens.mode).toBe('filter');
        expect(tokens.dateRanges).toHaveLength(1);
        expect(tokens.excludeDateRanges).toEqual([]);

        const range = tokens.dateRanges[0];
        expect(range.field).toBe('default');
        expect(range.startMs).toBe(new Date(2026, 0, 26).getTime());
        expect(range.endMs).toBe(new Date(2026, 1, 2).getTime());
    });

    it('parses year/quarter date tokens with @ prefix', () => {
        const tokens = parseFilterSearchTokens('@2026-Q2');
        expect(tokens.mode).toBe('filter');
        expect(tokens.dateRanges).toHaveLength(1);
        expect(tokens.excludeDateRanges).toEqual([]);

        const range = tokens.dateRanges[0];
        expect(range.field).toBe('default');
        expect(range.startMs).toBe(new Date(2026, 3, 1).getTime());
        expect(range.endMs).toBe(new Date(2026, 6, 1).getTime());
    });

    it('parses compact date tokens with @ prefix', () => {
        const tokens = parseFilterSearchTokens('@20260204');
        expect(tokens.mode).toBe('filter');
        expect(tokens.dateRanges).toHaveLength(1);
        expect(tokens.excludeDateRanges).toEqual([]);

        const range = tokens.dateRanges[0];
        expect(range.field).toBe('default');
        expect(range.startMs).toBe(new Date(2026, 1, 4).getTime());
        expect(range.endMs).toBe(new Date(2026, 1, 5).getTime());
    });

    it('parses day/month/year date tokens with @ prefix', () => {
        const tokens = parseFilterSearchTokens('@13/02/2026');
        expect(tokens.mode).toBe('filter');
        expect(tokens.dateRanges).toHaveLength(1);
        expect(tokens.excludeDateRanges).toEqual([]);

        const range = tokens.dateRanges[0];
        expect(range.field).toBe('default');
        expect(range.startMs).toBe(new Date(2026, 1, 13).getTime());
        expect(range.endMs).toBe(new Date(2026, 1, 14).getTime());
    });

    it('parses pre-1000 day date tokens with separators', () => {
        const tokens = parseFilterSearchTokens('@999-02-13');
        expect(tokens.mode).toBe('filter');
        expect(tokens.dateRanges).toHaveLength(1);
        expect(tokens.excludeDateRanges).toEqual([]);

        const range = tokens.dateRanges[0];
        expect(range.startMs).toBe(createLocalDate(999, 1, 13).getTime());
        expect(range.endMs).toBe(createLocalDate(999, 1, 14).getTime());
    });

    it('parses date ranges using .. with open ends', () => {
        const upperBound = parseFilterSearchTokens('@..2026-02-04');
        expect(upperBound.mode).toBe('filter');
        expect(upperBound.dateRanges).toHaveLength(1);
        expect(upperBound.dateRanges[0].startMs).toBeNull();
        expect(upperBound.dateRanges[0].endMs).toBe(new Date(2026, 1, 5).getTime());

        const lowerBound = parseFilterSearchTokens('@2026-02-01..');
        expect(lowerBound.mode).toBe('filter');
        expect(lowerBound.dateRanges).toHaveLength(1);
        expect(lowerBound.dateRanges[0].startMs).toBe(new Date(2026, 1, 1).getTime());
        expect(lowerBound.dateRanges[0].endMs).toBeNull();
    });

    it('parses dash-prefixed negated date filters', () => {
        const tokens = parseFilterSearchTokens('-@2026-02-04');
        expect(tokens.mode).toBe('filter');
        expect(tokens.dateRanges).toEqual([]);
        expect(tokens.excludeDateRanges).toHaveLength(1);
        expect(tokens.excludeDateRanges[0].endMs).toBe(new Date(2026, 1, 5).getTime());
    });

    it('treats bang-prefixed date tokens as literal text', () => {
        const tokens = parseFilterSearchTokens('!@2026-02-04');
        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(true);
        expect(tokens.nameTokens).toEqual(['!@2026-02-04']);
        expect(tokens.dateRanges).toEqual([]);
        expect(tokens.excludeDateRanges).toEqual([]);
    });

    it('parses unfinished task filter tokens', () => {
        const tokens = parseFilterSearchTokens('has:task');
        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(true);
        expect(tokens.requireUnfinishedTasks).toBe(true);
        expect(tokens.excludeUnfinishedTasks).toBe(false);
    });

    it('parses folder filter tokens', () => {
        const tokens = parseFilterSearchTokens('has:task folder:meetings');
        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(true);
        expect(tokens.requireUnfinishedTasks).toBe(true);
        expect(tokens.folderTokens).toEqual([{ mode: 'segment', value: 'meetings' }]);
        expect(tokens.excludeFolderTokens).toEqual([]);
    });

    it('parses exact folder filter tokens with leading slash', () => {
        const tokens = parseFilterSearchTokens('folder:/archive/2025');
        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(true);
        expect(tokens.folderTokens).toEqual([{ mode: 'exact', value: 'archive/2025' }]);
        expect(tokens.excludeFolderTokens).toEqual([]);
    });

    it('parses negated exact folder filter tokens', () => {
        const tokens = parseFilterSearchTokens('-folder:/archive/2025');
        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(false);
        expect(tokens.folderTokens).toEqual([]);
        expect(tokens.excludeFolderTokens).toEqual([{ mode: 'exact', value: 'archive/2025' }]);
    });

    it('normalizes slash variants in exact folder filter tokens', () => {
        const tokens = parseFilterSearchTokens('folder:/work\\meetings/');
        expect(tokens.mode).toBe('filter');
        expect(tokens.folderTokens).toEqual([{ mode: 'exact', value: 'work/meetings' }]);
    });

    it('parses root folder filter tokens', () => {
        const tokens = parseFilterSearchTokens('folder:/');
        expect(tokens.mode).toBe('filter');
        expect(tokens.folderTokens).toEqual([{ mode: 'exact', value: '' }]);
    });

    it('fails closed for segment folder filters containing slashes', () => {
        const tokens = parseFilterSearchTokens('folder:team/meetings');
        expect(tokens.invalidReason).toBe('malformed-filter');
    });

    it('fails closed when OR is mixed with a folder filter', () => {
        const tokens = parseFilterSearchTokens('#alpha OR folder:meetings');
        expect(tokens.invalidReason).toBe('mixed-logical-operator');
    });

    it('fails closed when a tag/property connector is mixed with an extension filter', () => {
        const tokens = parseFilterSearchTokens('#work OR ext:md');
        expect(tokens.invalidReason).toBe('mixed-logical-operator');
        expect(fileMatchesFilterTokens('work or notes', ['work'], tokens)).toBe(false);
    });

    it('parses extension filter tokens', () => {
        const tokens = parseFilterSearchTokens('ext:.md');
        expect(tokens.mode).toBe('filter');
        expect(tokens.extensionTokens).toEqual(['md']);
        expect(tokens.excludeExtensionTokens).toEqual([]);
    });

    it('normalizes extension filter tokens with multiple dots', () => {
        const tokens = parseFilterSearchTokens('ext:tar.gz');
        expect(tokens.mode).toBe('filter');
        expect(tokens.extensionTokens).toEqual(['gz']);
        expect(tokens.excludeExtensionTokens).toEqual([]);
    });

    it('parses negated extension filter tokens', () => {
        const tokens = parseFilterSearchTokens('-ext:pdf');
        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(false);
        expect(tokens.extensionTokens).toEqual([]);
        expect(tokens.excludeExtensionTokens).toEqual(['pdf']);
    });

    it('fails closed for partial extension filter tokens', () => {
        const tokens = parseFilterSearchTokens('ext:');
        expect(tokens.invalidReason).toBe('malformed-filter');
    });

    it('parses negated unfinished task filter tokens', () => {
        const tokens = parseFilterSearchTokens('-has:task');
        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(false);
        expect(tokens.requireUnfinishedTasks).toBe(false);
        expect(tokens.excludeUnfinishedTasks).toBe(true);
    });

    it('treats bang-prefixed unfinished task tokens as literal text', () => {
        const tokens = parseFilterSearchTokens('!has:task');
        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(true);
        expect(tokens.nameTokens).toEqual(['!has:task']);
        expect(tokens.requireUnfinishedTasks).toBe(false);
        expect(tokens.excludeUnfinishedTasks).toBe(false);
    });

    it('fails closed when OR is mixed with task filters', () => {
        const tokens = parseFilterSearchTokens('#alpha OR #beta has:task');
        expect(tokens.invalidReason).toBe('mixed-logical-operator');
    });

    it('fails closed when AND is mixed with task filters', () => {
        const tokens = parseFilterSearchTokens('#alpha AND has:task');
        expect(tokens.invalidReason).toBe('mixed-logical-operator');
    });

    it('fails closed when OR is mixed with a date filter', () => {
        const tokens = parseFilterSearchTokens('#alpha OR #beta @2026-02-04');
        expect(tokens.invalidReason).toBe('mixed-logical-operator');
    });

    it('treats non-date @ tokens as literal name tokens', () => {
        const tokens = parseFilterSearchTokens('@john');
        expect(tokens.mode).toBe('filter');
        expect(tokens.nameTokens).toEqual(['@john']);
        expect(tokens.dateRanges).toEqual([]);
    });

    it('fails closed for partial @ tokens that look like date filters', () => {
        const tokens = parseFilterSearchTokens('@to');
        expect(tokens.invalidReason).toBe('malformed-filter');
        expect(filterSearchHasActiveCriteria(tokens)).toBe(true);
        expect(fileMatchesFilterTokens('anything', [], tokens)).toBe(false);
    });

    it('fails closed for partial folder filter tokens', () => {
        const tokens = parseFilterSearchTokens('folder:');
        expect(tokens.invalidReason).toBe('malformed-filter');
        expect(fileMatchesFilterTokens('folder', [], tokens)).toBe(false);
    });
});

describe('buildSearchNavFilterState', () => {
    it('tracks implicit and explicit operators for included tags', () => {
        const state = buildSearchNavFilterState('#alpha #beta OR #gamma');

        expect(state.tags.include).toEqual(['alpha', 'beta', 'gamma']);
        expect(state.tags.includeOperators).toEqual({
            beta: 'AND',
            gamma: 'OR'
        });
        expect(state.properties.includeOperators).toEqual({});
    });

    it('tracks operators for included properties in expression mode', () => {
        const state = buildSearchNavFilterState('#alpha AND .status=started OR .status=finished');

        expect(state.tags.includeOperators).toEqual({});
        expect(state.properties.includeOperators).toEqual({
            [buildPropertyValueNodeId('status', 'started')]: 'AND',
            [buildPropertyValueNodeId('status', 'finished')]: 'OR'
        });
    });

    it('tracks canonical included and excluded Types', () => {
        const state = buildSearchNavFilterState(`type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES} -type:${TPS_NAVIGATOR_TYPE_IDS.HEADINGS}`);

        expect(state.types).toEqual({
            include: [TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES],
            exclude: [TPS_NAVIGATOR_TYPE_IDS.HEADINGS]
        });
    });
});

describe('updateFilterQueryWithDateToken', () => {
    it('replaces only the positive date clause and preserves every other criterion', () => {
        expect(updateFilterQueryWithDateToken('meeting #work .status=active folder:/projects ext:md @today -@2025', '@2026-08-12')).toEqual(
            {
                query: 'meeting #work .status=active folder:/projects ext:md @2026-08-12 -@2025',
                changed: true
            }
        );
    });

    it('appends a date clause when none exists and preserves quoted literal date text', () => {
        expect(updateFilterQueryWithDateToken('"@today" #work', '@thisweek').query).toBe('"@today" #work @thisweek');
    });

    it('rejects malformed replacement tokens without changing the query', () => {
        expect(updateFilterQueryWithDateToken('meeting @today', '@not-a-date')).toEqual({
            query: 'meeting @today',
            changed: false
        });
    });
});

describe('Type search facets', () => {
    it('parses canonical built-in Types and ORs multiple positive Types within the dimension', () => {
        const tokens = parseFilterSearchTokens(
            `type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES} type:${TPS_NAVIGATOR_TYPE_IDS.BULLETS} type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES}`
        );

        expect(tokens.mode).toBe('filter');
        expect(tokens.hasInclusions).toBe(true);
        expect(tokens.nameTokens).toEqual([]);
        expect(tokens.typeTokens).toEqual([TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, TPS_NAVIGATOR_TYPE_IDS.BULLETS]);
        expect(filterSearchMatchesTypeFacet(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, tokens)).toBe(true);
        expect(filterSearchMatchesTypeFacet(TPS_NAVIGATOR_TYPE_IDS.BULLETS, tokens)).toBe(true);
        expect(filterSearchMatchesTypeFacet(TPS_NAVIGATOR_TYPE_IDS.HEADINGS, tokens)).toBe(false);
    });

    it('rejects external provider facets because host search cannot aggregate provider-owned collections', () => {
        const providerType = createTpsNavigatorProviderTypeId('acme/entities', 'projects');
        expect(providerType).not.toBeNull();
        const tokens = parseFilterSearchTokens(`type:${providerType} -type:${providerType}`);

        expect(tokens.invalidReason).toBe('malformed-filter');
        expect(tokens.typeTokens).toEqual([]);
        expect(tokens.excludeTypeTokens).toEqual([]);
        expect(filterSearchHasActiveCriteria(tokens)).toBe(true);
        expect(updateFilterQueryWithType('#alpha', providerType!)).toEqual({
            query: '#alpha',
            action: 'removed',
            changed: false
        });
    });

    it('keeps Type facets orthogonal to tag/property expression semantics', () => {
        const tokens = parseFilterSearchTokens(`#alpha OR .status=working type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES}`);

        expect(tokens.mode).toBe('tag');
        expect(tokens.typeTokens).toEqual([TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES]);
        expect(fileMatchesFilterTokens(foldSearchText('Anything'), ['alpha'], tokens)).toBe(true);
        expect(filterSearchMatchesTypeFacet(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, tokens)).toBe(true);
        expect(filterSearchMatchesTypeFacet(TPS_NAVIGATOR_TYPE_IDS.BULLETS, tokens)).toBe(false);
    });

    it('fails closed for incomplete or noncanonical Type filters while preserving quoted literals', () => {
        const invalid = parseFilterSearchTokens('type:checkboxes type:');
        expect(invalid.invalidReason).toBe('malformed-filter');
        expect(invalid.typeTokens).toEqual([]);
        expect(invalid.nameTokens).toEqual([]);

        const literal = parseFilterSearchTokens('"type:structural:task"');
        expect(literal.typeTokens).toEqual([]);
        expect(literal.nameTokens).toEqual(['type:structural:task']);
    });

    it('fails closed with a diagnostic when Type syntax is used while Types navigation is paused', () => {
        const query = `type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES} -type:${TPS_NAVIGATOR_TYPE_IDS.HEADINGS}`;
        const tokens = parseFilterSearchTokens(query, { typesNavigationEnabled: false });

        expect(tokens.invalidReason).toBe('types-disabled');
        expect(tokens.invalidToken).toBe(`type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES}`);
        expect(tokens.typeTokens).toEqual([]);
        expect(tokens.excludeTypeTokens).toEqual([]);
        expect(tokens.nameTokens).toEqual([]);
        expect(tokens.excludeNameTokens).toEqual([]);
        expect(filterSearchHasActiveCriteria(tokens)).toBe(true);
        expect(fileMatchesFilterTokens(`type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES}`, [], tokens)).toBe(false);
        expect(buildSearchNavFilterState(query, { typesNavigationEnabled: false }).types).toEqual({ include: [], exclude: [] });
    });

    it('toggles Types without changing tag expression connectors', () => {
        const added = updateFilterQueryWithType('#alpha OR #beta', TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES);
        expect(added).toEqual({
            query: `#alpha OR #beta type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES}`,
            action: 'added',
            changed: true
        });

        const secondType = updateFilterQueryWithType(added.query, TPS_NAVIGATOR_TYPE_IDS.BULLETS);
        expect(secondType.query).toBe(`#alpha OR #beta type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES} type:${TPS_NAVIGATOR_TYPE_IDS.BULLETS}`);

        const removed = updateFilterQueryWithType(secondType.query, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES);
        expect(removed.query).toBe(`#alpha OR #beta type:${TPS_NAVIGATOR_TYPE_IDS.BULLETS}`);
        expect(removed.action).toBe('removed');
    });

    it('builds the requested tag, Checkbox, then tag additive sequence', () => {
        const firstTag = updateFilterQueryWithTag('', 'shopping', 'AND');
        const checkbox = updateFilterQueryWithType(firstTag.query, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES);
        const secondTag = updateFilterQueryWithTag(checkbox.query, 'errands', 'AND');

        expect(secondTag.query).toBe(`#shopping AND #errands type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES}`);
        const tokens = parseFilterSearchTokens(secondTag.query);
        expect(tokens.mode).toBe('tag');
        expect(tokens.includedTagTokens).toEqual(['shopping', 'errands']);
        expect(tokens.typeTokens).toEqual([TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES]);
    });

    it('preserves the selected fixed Type as the first union member when Shift-adding another Type', () => {
        const result = updateFilterQueryWithTypeSelection('#shopping', TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, TPS_NAVIGATOR_TYPE_IDS.NOTES);

        expect(result.query).toBe(`#shopping type:${TPS_NAVIGATOR_TYPE_IDS.NOTES} type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES}`);
        expect(parseFilterSearchTokens(result.query).typeTokens).toEqual([TPS_NAVIGATOR_TYPE_IDS.NOTES, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES]);
    });

    it('keeps Type facets outside connector cleanup when tags are added and removed', () => {
        const withTag = updateFilterQueryWithTag(`#alpha type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES}`, 'beta', 'AND');
        expect(withTag.query).toBe(`#alpha AND #beta type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES}`);

        const withoutFirstTag = updateFilterQueryWithTag(withTag.query, 'alpha', 'AND');
        expect(withoutFirstTag.query).toBe(`#beta type:${TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES}`);
        const reparsed = parseFilterSearchTokens(withoutFirstTag.query);
        expect(reparsed.mode).toBe('tag');
        expect(reparsed.typeTokens).toEqual([TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES]);
    });

    it('does not mutate the query for an invalid Type id', () => {
        expect(updateFilterQueryWithType('#alpha', 'checkboxes')).toEqual({
            query: '#alpha',
            action: 'removed',
            changed: false
        });
    });
});

describe('updateFilterQueryWithTag', () => {
    it('adds a tag to an empty query', () => {
        const result = updateFilterQueryWithTag('', 'project/alpha', 'AND');
        expect(result.query).toBe('#project/alpha');
        expect(result.action).toBe('added');
        expect(result.changed).toBe(true);
    });

    it('removes an existing tag and cleans connectors', () => {
        const result = updateFilterQueryWithTag('#project/alpha AND #status/green', 'status/green', 'AND');
        expect(result.query).toBe('#project/alpha');
        expect(result.action).toBe('removed');
        expect(result.changed).toBe(true);
    });

    it('switches connector when toggling the same tag twice', () => {
        const first = updateFilterQueryWithTag('#project/alpha', 'status/green', 'OR');
        expect(first.query).toBe('#project/alpha OR #status/green');
        expect(first.action).toBe('added');
        expect(first.changed).toBe(true);

        const second = updateFilterQueryWithTag(first.query, 'status/green', 'OR');
        expect(second.query).toBe('#project/alpha');
        expect(second.action).toBe('removed');
        expect(second.changed).toBe(true);
    });

    it('normalizes duplicate connectors when removing a middle tag', () => {
        const result = updateFilterQueryWithTag('#alpha OR #beta OR #gamma', 'beta', 'OR');
        expect(result.query).toBe('#alpha OR #gamma');
        expect(result.action).toBe('removed');
        expect(result.changed).toBe(true);
    });

    it('matches tags case-insensitively', () => {
        const result = updateFilterQueryWithTag('#Alpha and #beta', 'alpha', 'AND');
        expect(result.query).toBe('#beta');
        expect(result.action).toBe('removed');
        expect(result.changed).toBe(true);
    });

    it('matches tags with folded diacritics when toggling', () => {
        const result = updateFilterQueryWithTag('#Canción and #beta', 'cancion', 'AND');
        expect(result.query).toBe('#beta');
        expect(result.action).toBe('removed');
        expect(result.changed).toBe(true);
    });

    it('appends tags without connector operators in mixed queries', () => {
        const result = updateFilterQueryWithTag('#project/alpha @2026-02-04', 'status/green', 'OR');
        expect(result.query).toBe('#project/alpha @2026-02-04 #status/green');
        expect(result.action).toBe('added');
        expect(result.changed).toBe(true);
    });

    it('removes tags in mixed queries without pruning literal connector words', () => {
        const result = updateFilterQueryWithTag('meeting and #project/alpha @today', 'project/alpha', 'AND');
        expect(result.query).toBe('meeting and @today');
        expect(result.action).toBe('removed');
        expect(result.changed).toBe(true);
    });
});

describe('fileMatchesFilterTokens', () => {
    it('matches when no tokens are provided', () => {
        const tokens = parseFilterSearchTokens('');
        expect(fileMatchesFilterTokens('platform', [], tokens)).toBe(true);
    });

    it('matches name tokens using substring comparison', () => {
        const tokens = parseFilterSearchTokens('plat form');
        expect(fileMatchesFilterTokens('platform notes', [], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note list', [], tokens)).toBe(false);
    });

    it('matches name tokens against aliases', () => {
        const tokens = parseFilterSearchTokens('nn');

        expect(
            fileMatchesFilterTokens('notebook navigator', [], tokens, {
                hasUnfinishedTasks: false,
                foldedAliases: ['nn']
            })
        ).toBe(true);
    });

    it('returns alias coverage from the file acceptance pass', () => {
        const tokens = parseFilterSearchTokens('notebook navigator');

        expect(
            getFileFilterSearchMatch('notebook', [], tokens, {
                hasUnfinishedTasks: false,
                foldedAliases: ['navigator']
            })
        ).toEqual({ matches: true, nameMatch: { aliasIndexes: [0] } });
    });

    it('requires every name token to match across the display name and aliases', () => {
        const tokens = parseFilterSearchTokens('notebook navigator');

        expect(
            fileMatchesFilterTokens('project note', [], tokens, {
                hasUnfinishedTasks: false,
                foldedAliases: ['notebook navigator']
            })
        ).toBe(true);
        expect(
            fileMatchesFilterTokens('project note', [], tokens, {
                hasUnfinishedTasks: false,
                foldedAliases: ['notebook', 'navigator']
            })
        ).toBe(true);
        expect(
            fileMatchesFilterTokens('notebook', [], tokens, {
                hasUnfinishedTasks: false,
                foldedAliases: ['navigator']
            })
        ).toBe(true);
    });

    it('reports only the aliases needed to cover tokens missing from the display name', () => {
        expect(findFilterSearchNameMatch('notebook navigator', ['nn'], ['notebook'])).toEqual({ aliasIndexes: [] });
        expect(findFilterSearchNameMatch('project note', ['nn', 'notebook navigator'], ['notebook'])).toEqual({
            aliasIndexes: [1]
        });
        expect(findFilterSearchNameMatch('project note', ['notebook', 'navigator'], ['notebook', 'navigator'])).toEqual({
            aliasIndexes: [0, 1]
        });
        expect(findFilterSearchNameMatch('notebook', ['navigator'], ['notebook', 'navigator'])).toEqual({
            aliasIndexes: [0]
        });
        expect(findFilterSearchNameMatch('project note', ['notebook', 'notebook navigator'], ['notebook', 'navigator'])).toEqual({
            aliasIndexes: [1]
        });
        expect(findFilterSearchNameMatch('project note', ['notebook'], ['notebook', 'navigator'])).toBeNull();
    });

    it('removes aliases made redundant by later coverage choices', () => {
        expect(
            findFilterSearchNameMatch(
                '',
                ['alpha beta gamma delta', 'alpha beta gamma epsilon', 'delta zeta'],
                ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta']
            )
        ).toEqual({ aliasIndexes: [1, 2] });
    });

    it('applies name exclusions to aliases', () => {
        const tokens = parseFilterSearchTokens('notebook -nn');

        expect(
            fileMatchesFilterTokens('notebook navigator', [], tokens, {
                hasUnfinishedTasks: false,
                foldedAliases: ['nn']
            })
        ).toBe(false);
    });

    it('matches folded name, tag, and folder values', () => {
        const tokens = parseFilterSearchTokens('cancion #muzyka folder:/notatki/swiat');
        expect(
            fileMatchesFilterTokens(foldSearchText('Canción plan'), [foldSearchText('Múzyka')], tokens, {
                hasUnfinishedTasks: false,
                foldedFolderPath: foldSearchText('Notatki/Świat')
            })
        ).toBe(true);
    });

    it('keeps non-Latin combining marks distinct in name matching', () => {
        const markedName = foldSearchText('مُدَرِّس');
        const unmarkedName = foldSearchText('مدرس');

        const markedTokens = parseFilterSearchTokens(markedName);
        const unmarkedTokens = parseFilterSearchTokens(unmarkedName);

        expect(fileMatchesFilterTokens(markedName, [], markedTokens)).toBe(true);
        expect(fileMatchesFilterTokens(markedName, [], unmarkedTokens)).toBe(false);
    });

    it('keeps compatibility-equivalent forms distinct in name matching', () => {
        const eszettName = foldSearchText('Straße');
        const ligatureName = foldSearchText('ﬁle note');
        const fullWidthName = foldSearchText('ＡＢＣ plan');

        expect(fileMatchesFilterTokens(eszettName, [], parseFilterSearchTokens('strasse'))).toBe(false);
        expect(fileMatchesFilterTokens(ligatureName, [], parseFilterSearchTokens('file'))).toBe(false);
        expect(fileMatchesFilterTokens(fullWidthName, [], parseFilterSearchTokens('abc'))).toBe(false);
    });

    it('matches tag tokens using prefix comparison', () => {
        const tokens = parseFilterSearchTokens('#yta');
        expect(fileMatchesFilterTokens('platform', ['yta'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('platform', ['yta-helper'], tokens)).toBe(false);
        expect(fileMatchesFilterTokens('platform', ['yta/roadmap'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('platform', ['inbox'], tokens)).toBe(false);
    });

    it('requires both name and tag tokens when both are present', () => {
        const tokens = parseFilterSearchTokens('#yta plat');
        expect(fileMatchesFilterTokens('platform plan', ['yta'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('roadmap plan', ['projects/mytag'], tokens)).toBe(false);
        expect(fileMatchesFilterTokens('platform plan', ['archive'], tokens)).toBe(false);
    });

    it('preserves connectors as literal terms in name-only queries', () => {
        const tokens = parseFilterSearchTokens('alpha OR beta');
        expect(tokens.mode).toBe('filter');
        expect(tokens.invalidReason).toBeNull();
        expect(sortTokens(tokens.nameTokens)).toEqual(['alpha', 'beta', 'or']);
        expect(fileMatchesFilterTokens('alpha or beta notes', [], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('alpha beta notes', [], tokens)).toBe(false);

        const prose = parseFilterSearchTokens('research and development');
        expect(prose.invalidReason).toBeNull();
        expect(sortTokens(prose.nameTokens)).toEqual(['and', 'development', 'research']);
        expect(fileMatchesFilterTokens('research and development', [], prose)).toBe(true);
    });

    it('supports OR semantics when only tag operands are present', () => {
        const tokens = parseFilterSearchTokens('#alpha OR #beta');
        expect(tokens.mode).toBe('tag');
        expect(fileMatchesFilterTokens('note', ['alpha'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note', ['beta'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note', ['alpha/project'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note', ['gamma'], tokens)).toBe(false);
    });

    it('matches descendant tags in tag mode', () => {
        const tokens = parseFilterSearchTokens('#ai');
        expect(tokens.mode).toBe('tag');
        expect(fileMatchesFilterTokens('note', ['ai'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note', ['ai/help'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note', ['ai-helper'], tokens)).toBe(false);
    });

    it('fails closed for mixed name/tag OR queries', () => {
        const tokens = parseFilterSearchTokens('#alpha OR plan');
        expect(tokens.mode).toBe('filter');
        expect(tokens.invalidReason).toBe('mixed-logical-operator');
        expect(fileMatchesFilterTokens('project or plan', ['alpha'], tokens)).toBe(false);
        expect(fileMatchesFilterTokens('project or plan', [], tokens)).toBe(false);
    });

    it('matches untagged notes when using -# operand in tag mode', () => {
        const tokens = parseFilterSearchTokens('#alpha OR -#');
        expect(tokens.mode).toBe('tag');
        expect(fileMatchesFilterTokens('note', ['alpha'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note', [], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note', ['beta'], tokens)).toBe(false);
    });

    it('evaluates AND before OR for complex tag expressions', () => {
        const tokens = parseFilterSearchTokens('#tag1 OR #tag2 AND #tag3 OR #tag4 AND #tag5 AND #tag6');

        expect(fileMatchesFilterTokens('note', ['tag1'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note', ['tag2', 'tag3'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note', ['tag4', 'tag5', 'tag6'], tokens)).toBe(true);

        expect(fileMatchesFilterTokens('note', ['tag2'], tokens)).toBe(false);
        expect(fileMatchesFilterTokens('note', ['tag4', 'tag5'], tokens)).toBe(false);
    });

    it('supports OR tag queries combined with exclusion clauses', () => {
        const tokens = parseFilterSearchTokens('#alpha OR -#beta');
        expect(tokens.mode).toBe('tag');
        expect(fileMatchesFilterTokens('note', ['alpha'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note', ['beta'], tokens)).toBe(false);
        expect(fileMatchesFilterTokens('note', [], tokens)).toBe(true);
    });

    it('matches when exclusions precede an OR branch', () => {
        const tokens = parseFilterSearchTokens('-#beta OR #alpha');
        expect(tokens.mode).toBe('tag');
        expect(fileMatchesFilterTokens('note', ['alpha'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note', ['beta'], tokens)).toBe(false);
        expect(fileMatchesFilterTokens('note', [], tokens)).toBe(true);
    });

    it('evaluates OR logic for negated tag-only expressions', () => {
        const tokens = parseFilterSearchTokens('-#alpha OR -#beta');
        expect(tokens.mode).toBe('tag');
        expect(fileMatchesFilterTokens('note', ['alpha'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note', ['beta'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('note', ['alpha', 'beta'], tokens)).toBe(false);
        expect(fileMatchesFilterTokens('note', [], tokens)).toBe(true);
    });

    it('requires tags when query is only hash', () => {
        const tokens = parseFilterSearchTokens('#');
        expect(fileMatchesFilterTokens('platform plan', ['projects/mytag'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('platform plan', [], tokens)).toBe(false);
    });

    it('excludes files with matching name tokens', () => {
        const tokens = parseFilterSearchTokens('plat -draft');
        expect(fileMatchesFilterTokens('platform plan', [], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('platform draft', [], tokens)).toBe(false);
    });

    it('excludes tagged files when -# is used', () => {
        const tokens = parseFilterSearchTokens('-#');
        expect(fileMatchesFilterTokens('platform plan', [], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('platform plan', ['projects/mytag'], tokens)).toBe(false);
    });

    it('excludes files with specific tags when -#tag is used', () => {
        const tokens = parseFilterSearchTokens('-#yta');
        expect(fileMatchesFilterTokens('platform plan', [], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('platform plan', ['mytag'], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('platform plan', ['yta'], tokens)).toBe(false);
        expect(fileMatchesFilterTokens('platform plan', ['yta/roadmap'], tokens)).toBe(false);
    });

    it('handles mixed include and exclude tokens', () => {
        const tokens = parseFilterSearchTokens('plat -draft -#yta');
        expect(fileMatchesFilterTokens('platform plan', [], tokens)).toBe(true);
        expect(fileMatchesFilterTokens('platform draft', [], tokens)).toBe(false);
        expect(fileMatchesFilterTokens('platform plan', ['yta'], tokens)).toBe(false);
    });

    it('filters notes with unfinished tasks', () => {
        const tokens = parseFilterSearchTokens('has:task');
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: true })).toBe(true);
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: false })).toBe(false);
    });

    it('filters notes without unfinished tasks using dash negation', () => {
        const tokens = parseFilterSearchTokens('-has:task');
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: false })).toBe(true);
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: true })).toBe(false);
    });

    it('filters notes by included folder tokens', () => {
        const tokens = parseFilterSearchTokens('folder:meetings');
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: false, foldedFolderPath: 'work/meetings' })).toBe(
            true
        );
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: false, foldedFolderPath: 'work/projects' })).toBe(
            false
        );
        expect(
            fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: false, foldedFolderPath: 'notes/team-meetings' })
        ).toBe(true);
    });

    it('filters notes by excluded folder tokens', () => {
        const tokens = parseFilterSearchTokens('-folder:archive');
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: false, foldedFolderPath: 'notes/archive' })).toBe(
            false
        );
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: false, foldedFolderPath: 'notes/current' })).toBe(
            true
        );
    });

    it('filters notes by exact folder path tokens', () => {
        const tokens = parseFilterSearchTokens('folder:/work/meetings');
        expect(
            fileMatchesFilterTokens('platform plan', [], tokens, {
                hasUnfinishedTasks: false,
                foldedFolderPath: 'work/meetings'
            })
        ).toBe(true);
        expect(
            fileMatchesFilterTokens('platform plan', [], tokens, {
                hasUnfinishedTasks: false,
                foldedFolderPath: 'work/meetings/weekly'
            })
        ).toBe(false);
        expect(
            fileMatchesFilterTokens('platform plan', [], tokens, {
                hasUnfinishedTasks: false,
                foldedFolderPath: 'notes/work/meetings'
            })
        ).toBe(false);
    });

    it('filters root notes with folder:/', () => {
        const tokens = parseFilterSearchTokens('folder:/');
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: false, foldedFolderPath: '' })).toBe(true);
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: false, foldedFolderPath: 'work/meetings' })).toBe(
            false
        );
    });

    it('filters notes by included extension tokens', () => {
        const tokens = parseFilterSearchTokens('ext:md');
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: false, foldedExtension: 'md' })).toBe(true);
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: false, foldedExtension: 'pdf' })).toBe(false);
    });

    it('filters notes by excluded extension tokens', () => {
        const tokens = parseFilterSearchTokens('-ext:pdf');
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: false, foldedExtension: 'md' })).toBe(true);
        expect(fileMatchesFilterTokens('platform plan', [], tokens, { hasUnfinishedTasks: false, foldedExtension: 'pdf' })).toBe(false);
    });

    it('fails closed when OR and unfinished-task filters are mixed with tags', () => {
        const tokens = parseFilterSearchTokens('#alpha OR #beta has:task');
        expect(tokens.mode).toBe('filter');
        expect(tokens.invalidReason).toBe('mixed-logical-operator');
        expect(fileMatchesFilterTokens('note or entry', ['alpha', 'beta'], tokens, { hasUnfinishedTasks: true })).toBe(false);
        expect(fileMatchesFilterTokens('note entry', ['alpha', 'beta'], tokens, { hasUnfinishedTasks: true })).toBe(false);
        expect(fileMatchesFilterTokens('note or entry', ['alpha'], tokens, { hasUnfinishedTasks: true })).toBe(false);
        expect(fileMatchesFilterTokens('note or entry', ['alpha', 'beta'], tokens, { hasUnfinishedTasks: false })).toBe(false);
    });
});

describe('fileMatchesDateFilterTokens', () => {
    it('matches timestamps inside @YYYY-MM-DD day filters using the default date field', () => {
        const tokens = parseFilterSearchTokens('@2026-02-04');
        const timestamp = new Date(2026, 1, 4, 12, 0, 0).getTime();

        expect(fileMatchesDateFilterTokens({ created: 0, modified: timestamp, defaultField: 'modified' }, tokens)).toBe(true);
        expect(
            fileMatchesDateFilterTokens(
                { created: 0, modified: new Date(2026, 1, 5, 12, 0, 0).getTime(), defaultField: 'modified' },
                tokens
            )
        ).toBe(false);
    });

    it('matches timestamps inside three-digit year filters', () => {
        const tokens = parseFilterSearchTokens('@999');
        const timestamp = createLocalDate(999, 6, 1).getTime();

        expect(fileMatchesDateFilterTokens({ created: 0, modified: timestamp, defaultField: 'modified' }, tokens)).toBe(true);
        expect(
            fileMatchesDateFilterTokens({ created: 0, modified: createLocalDate(1000, 0, 1).getTime(), defaultField: 'modified' }, tokens)
        ).toBe(false);
    });

    it('matches @c: filters against created timestamps', () => {
        const tokens = parseFilterSearchTokens('@c:2026-02-04');
        const createdTimestamp = new Date(2026, 1, 4, 9, 0, 0).getTime();
        const modifiedTimestamp = new Date(2026, 1, 6, 9, 0, 0).getTime();

        expect(
            fileMatchesDateFilterTokens({ created: createdTimestamp, modified: modifiedTimestamp, defaultField: 'modified' }, tokens)
        ).toBe(true);
    });

    it('excludes timestamps that match -@ ranges', () => {
        const tokens = parseFilterSearchTokens('-@2026-02-04');
        const timestamp = new Date(2026, 1, 4, 12, 0, 0).getTime();

        expect(fileMatchesDateFilterTokens({ created: 0, modified: timestamp, defaultField: 'modified' }, tokens)).toBe(false);
        expect(
            fileMatchesDateFilterTokens(
                { created: 0, modified: new Date(2026, 1, 5, 12, 0, 0).getTime(), defaultField: 'modified' },
                tokens
            )
        ).toBe(true);
    });
});

describe('quoted literal search terms', () => {
    it('parses a quoted leading-dot term as a name token instead of a property filter', () => {
        const tokens = parseFilterSearchTokens('".F"');
        expect(tokens.mode).toBe('filter');
        expect(tokens.nameTokens).toEqual(['.f']);
        expect(tokens.propertyTokens).toEqual([]);
        expect(tokens.requiresProperties).toBe(false);
    });

    it('parses -"..." as a literal name exclusion', () => {
        const tokens = parseFilterSearchTokens('-".F"');
        expect(tokens.excludeNameTokens).toEqual(['.f']);
        expect(tokens.nameTokens).toEqual([]);
        expect(tokens.excludePropertyTokens).toEqual([]);
    });

    it('keeps a quoted leading minus inside the literal text', () => {
        const tokens = parseFilterSearchTokens('"-.F"');
        expect(tokens.nameTokens).toEqual(['-.f']);
        expect(tokens.excludeNameTokens).toEqual([]);
        expect(tokens.excludePropertyTokens).toEqual([]);
    });

    it('treats quoted filter syntax as literal name text', () => {
        expect(parseFilterSearchTokens('"#work"').nameTokens).toEqual(['#work']);
        expect(parseFilterSearchTokens('"#work"').requireTagged).toBe(false);
        expect(parseFilterSearchTokens('"@today"').dateRanges).toEqual([]);
        expect(parseFilterSearchTokens('"@today"').nameTokens).toEqual(['@today']);
        expect(parseFilterSearchTokens('"has:task"').requireUnfinishedTasks).toBe(false);
        expect(parseFilterSearchTokens('"has:task"').nameTokens).toEqual(['has:task']);
        expect(parseFilterSearchTokens('"folder:work"').folderTokens).toEqual([]);
        expect(parseFilterSearchTokens('"folder:work"').nameTokens).toEqual(['folder:work']);
        expect(parseFilterSearchTokens('"ext:md"').extensionTokens).toEqual([]);
        expect(parseFilterSearchTokens('"ext:md"').nameTokens).toEqual(['ext:md']);
    });

    it('keeps property filters with quoted keys when the quote is not at the start of the term', () => {
        const tokens = parseFilterSearchTokens('."Reading Status"');
        expect(tokens.propertyTokens).toEqual([{ key: 'reading status', value: null }]);
        expect(tokens.nameTokens).toEqual([]);
    });

    it('forces filter mode when a quoted connector appears between tags', () => {
        const literalConnector = parseFilterSearchTokens('#a "AND" #b');
        expect(literalConnector.mode).toBe('filter');
        expect(literalConnector.nameTokens).toEqual(['and']);
        expect(sortTokens(literalConnector.tagTokens)).toEqual(['a', 'b']);

        const operatorConnector = parseFilterSearchTokens('#a AND #b');
        expect(operatorConnector.mode).toBe('tag');
    });

    it('treats an unterminated opening quote as a literal term while typing', () => {
        const tokens = parseFilterSearchTokens('".F');
        expect(tokens.nameTokens).toEqual(['.f']);
        expect(tokens.propertyTokens).toEqual([]);
    });

    it('folds diacritics in literal terms', () => {
        expect(parseFilterSearchTokens('"É.F"').nameTokens).toEqual(['e.f']);
    });

    it('matches and excludes file names by literal terms', () => {
        const includeTokens = parseFilterSearchTokens('".F"');
        expect(fileMatchesFilterTokens(foldSearchText('Report.F'), [], includeTokens)).toBe(true);
        expect(fileMatchesFilterTokens(foldSearchText('Report'), [], includeTokens)).toBe(false);

        const excludeTokens = parseFilterSearchTokens('-".F"');
        expect(fileMatchesFilterTokens(foldSearchText('Report.F'), [], excludeTokens)).toBe(false);
        expect(fileMatchesFilterTokens(foldSearchText('Report'), [], excludeTokens)).toBe(true);
    });

    it('excludes literal terms from navigation highlight state', () => {
        const state = buildSearchNavFilterState('"#work" ".status"');
        expect(state.tags.include).toEqual([]);
        expect(state.properties.include).toEqual([]);
    });

    it('adds a tag filter instead of removing a matching literal term', () => {
        const result = updateFilterQueryWithTag('"#work"', 'work', 'AND');
        expect(result.action).toBe('added');
        expect(result.query).toBe('"#work" #work');
    });

    it('adds a property filter instead of removing a matching literal term', () => {
        const result = updateFilterQueryWithProperty('".status"', 'status', null, 'AND');
        expect(result.action).toBe('added');
        expect(result.query).toBe('".status" .status');
    });

    it('preserves literal quotes when toggling tags in the same query', () => {
        const added = updateFilterQueryWithTag('".F"', 'work', 'AND');
        expect(added.query).toBe('".F" #work');

        const removed = updateFilterQueryWithTag('".F" #work', 'work', 'AND');
        expect(removed.action).toBe('removed');
        expect(removed.query).toBe('".F"');
    });

    it('preserves negated literal quotes through query mutations', () => {
        const result = updateFilterQueryWithTag('-".F"', 'work', 'AND');
        expect(result.query).toBe('-".F" #work');
    });

    it('does not insert connectors when a literal term makes the query mixed', () => {
        const result = updateFilterQueryWithTag('".F" #a', 'b', 'AND');
        expect(result.query).toBe('".F" #a #b');
    });

    it('preserves literal quotes when removing a property filter', () => {
        const result = updateFilterQueryWithProperty('".F" .status', 'status', null, 'AND');
        expect(result.action).toBe('removed');
        expect(result.query).toBe('".F"');
    });

    it('keeps the folder prefix outside the quotes when a mutation re-serializes the query', () => {
        const result = updateFilterQueryWithTag('folder:"my folder"', 'work', 'AND');
        expect(result.query).toBe('folder:"my folder" #work');

        const tokens = parseFilterSearchTokens(result.query);
        expect(tokens.folderTokens).toEqual([{ mode: 'segment', value: 'my folder' }]);
        expect(tokens.nameTokens).toEqual([]);
    });

    it('keeps negated folder filters through query mutations', () => {
        const result = updateFilterQueryWithTag('-folder:"my folder"', 'work', 'AND');
        expect(result.query).toBe('-folder:"my folder" #work');

        const tokens = parseFilterSearchTokens(result.query);
        expect(tokens.excludeFolderTokens).toEqual([{ mode: 'segment', value: 'my folder' }]);
        expect(tokens.excludeNameTokens).toEqual([]);
    });

    it('keeps folder filters with backslashes in the payload through query mutations', () => {
        // Backslashes normalize to path separators, so the raw payload round-trips escaped
        // while the parsed token keeps its exact path value.
        const result = updateFilterQueryWithTag('folder:"/my\\\\folder"', 'work', 'AND');
        expect(result.query).toBe('folder:"/my\\\\folder" #work');

        const tokens = parseFilterSearchTokens(result.query);
        expect(tokens.folderTokens).toEqual([{ mode: 'exact', value: 'my/folder' }]);
    });
});

describe('folder subtree filters', () => {
    it.each(['folder:/work/meetings/**', 'folder:"/work/meetings/**"'])(
        'matches descendants without matching sibling prefixes: %s',
        query => {
            const tokens = parseFilterSearchTokens(query);
            expect(tokens.invalidReason).toBeNull();
            expect(tokens.folderTokens).toEqual([{ mode: 'subtree', value: 'work/meetings' }]);
            for (const [path, expected] of [
                ['work/meetings', true],
                ['work/meetings/weekly', true],
                ['work/meetings-old', false],
                ['other/work/meetings', false],
                ['', false]
            ] as const) {
                expect(fileMatchesFilterTokens('note', [], tokens, { hasUnfinishedTasks: false, foldedFolderPath: path })).toBe(expected);
            }
        }
    );

    it('supports subtree exclusions and quoted paths with spaces', () => {
        const tokens = parseFilterSearchTokens('-folder:"/my projects/**"');
        expect(fileMatchesFilterTokens('note', [], tokens, { hasUnfinishedTasks: false, foldedFolderPath: 'my projects/sub' })).toBe(false);
        expect(fileMatchesFilterTokens('note', [], tokens, { hasUnfinishedTasks: false, foldedFolderPath: 'my projects-old' })).toBe(true);
    });
});
