import { describe, expect, it } from 'vitest';
import { DEFAULT_NAVIGATION_SECTION_ORDER, NavigationSectionId, type NavigationSectionId as NavigationSection } from '../../src/types';
import {
    mergeNavigationSectionOrder,
    normalizeNavigationSectionOrderInput,
    sanitizeNavigationSectionOrder
} from '../../src/utils/navigationSections';

const { SHORTCUTS, RECENT, FOLDERS, TYPES, TAGS, PROPERTIES } = NavigationSectionId;

describe('navigation section order normalization', () => {
    it('inserts Types after Folders when upgrading a legacy saved order', () => {
        expect(normalizeNavigationSectionOrderInput([SHORTCUTS, RECENT, FOLDERS, TAGS, PROPERTIES])).toEqual(
            DEFAULT_NAVIGATION_SECTION_ORDER
        );
    });

    it('inserts Types after Folders without reordering a customized legacy order', () => {
        expect(sanitizeNavigationSectionOrder([TAGS, FOLDERS, PROPERTIES, RECENT, SHORTCUTS])).toEqual([
            TAGS,
            FOLDERS,
            TYPES,
            PROPERTIES,
            RECENT,
            SHORTCUTS
        ]);
    });

    it('preserves an existing customized Types placement', () => {
        const customizedOrder = [PROPERTIES, TYPES, SHORTCUTS, TAGS, FOLDERS, RECENT];

        expect(sanitizeNavigationSectionOrder(customizedOrder)).toEqual(customizedOrder);
    });

    it('filters malformed and duplicate saved entries before anchoring a missing Types section', () => {
        expect(normalizeNavigationSectionOrderInput([TAGS, TAGS, 'unknown', FOLDERS, null, PROPERTIES])).toEqual([
            TAGS,
            FOLDERS,
            TYPES,
            PROPERTIES,
            SHORTCUTS,
            RECENT
        ]);
    });

    it('keeps the first valid Types placement when saved input contains duplicates', () => {
        expect(normalizeNavigationSectionOrderInput([TYPES, TAGS, TYPES, FOLDERS, PROPERTIES, SHORTCUTS, RECENT])).toEqual([
            TYPES,
            TAGS,
            FOLDERS,
            PROPERTIES,
            SHORTCUTS,
            RECENT
        ]);
    });

    it('uses the default order for an empty saved array', () => {
        expect(normalizeNavigationSectionOrderInput([])).toEqual(DEFAULT_NAVIGATION_SECTION_ORDER);
    });

    it('anchors Types after Folders when merging against an incomplete legacy order', () => {
        const previous = [SHORTCUTS, FOLDERS, TAGS, PROPERTIES, RECENT] as NavigationSection[];

        expect(mergeNavigationSectionOrder([TAGS, FOLDERS], previous)).toEqual([TAGS, FOLDERS, TYPES, SHORTCUTS, PROPERTIES, RECENT]);
    });
});
