/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    useNavigationSearchHighlights,
    type NavigationSearchHighlightsResult
} from '../../src/hooks/navigationPane/useNavigationSearchHighlights';
import { EMPTY_SEARCH_NAV_FILTER_STATE } from '../../src/types/search';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

describe('useNavigationSearchHighlights Type facets', () => {
    it('highlights included and excluded Type rows, with exclusion taking precedence', () => {
        let captured: NavigationSearchHighlightsResult | null = null;

        function Harness() {
            captured = useNavigationSearchHighlights({
                searchNavFilters: {
                    ...EMPTY_SEARCH_NAV_FILTER_STATE,
                    types: {
                        include: [TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, TPS_NAVIGATOR_TYPE_IDS.HEADINGS],
                        exclude: [TPS_NAVIGATOR_TYPE_IDS.HEADINGS]
                    }
                }
            });
            return null;
        }

        renderToStaticMarkup(React.createElement(Harness));

        expect(captured).not.toBeNull();
        if (!captured) {
            throw new Error('Expected navigation search highlights');
        }
        const result = captured as NavigationSearchHighlightsResult;
        expect(result.getTypeSearchMatch(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)).toBe('include');
        expect(result.getTypeSearchMatch(TPS_NAVIGATOR_TYPE_IDS.HEADINGS)).toBe('exclude');
        expect(result.getTypeSearchMatch(TPS_NAVIGATOR_TYPE_IDS.BULLETS)).toBeUndefined();
    });
});
