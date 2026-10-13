/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { Platform } from 'obsidian';
import { getNavigationSearchModifierOperator, getTagSearchModifierOperator } from '../../src/utils/tagUtils';

const testPlatform = Platform as typeof Platform & { isMacOS?: boolean };
const originalIsMacOS = testPlatform.isMacOS;
const originalIsMobile = testPlatform.isMobile;
const originalIsTablet = testPlatform.isTablet;

const event = (overrides: Partial<{ altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}) => ({
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides
});

afterEach(() => {
    testPlatform.isMacOS = originalIsMacOS;
    testPlatform.isMobile = originalIsMobile;
    testPlatform.isTablet = originalIsTablet;
});

describe('getNavigationSearchModifierOperator', () => {
    it('uses Shift alone to add an AND facet', () => {
        testPlatform.isMobile = false;
        expect(getNavigationSearchModifierOperator(event({ shiftKey: true }), 'cmdCtrl')).toBe('AND');
    });

    it('uses the configured modifier alone for AND and modifier plus Shift for OR', () => {
        testPlatform.isMobile = false;
        testPlatform.isMacOS = true;

        expect(getNavigationSearchModifierOperator(event({ metaKey: true }), 'cmdCtrl')).toBe('AND');
        expect(getNavigationSearchModifierOperator(event({ metaKey: true, shiftKey: true }), 'cmdCtrl')).toBe('OR');
        expect(getNavigationSearchModifierOperator(event({ altKey: true }), 'optionAlt')).toBe('AND');
        expect(getNavigationSearchModifierOperator(event({ altKey: true, shiftKey: true }), 'optionAlt')).toBe('OR');
    });

    it('ignores an unmodified click and all modifier clicks on phones', () => {
        testPlatform.isMobile = false;
        expect(getNavigationSearchModifierOperator(event(), 'cmdCtrl')).toBeNull();

        testPlatform.isMobile = true;
        testPlatform.isTablet = false;
        expect(getNavigationSearchModifierOperator(event({ shiftKey: true }), 'cmdCtrl')).toBeNull();
        expect(getNavigationSearchModifierOperator(event({ metaKey: true, shiftKey: true }), 'cmdCtrl')).toBeNull();
    });

    it('keeps the existing tag helper as a compatible alias', () => {
        testPlatform.isMobile = false;
        expect(getTagSearchModifierOperator(event({ shiftKey: true }), 'cmdCtrl')).toBe('AND');
    });
});
