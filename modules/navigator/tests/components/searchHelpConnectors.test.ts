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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveFilterSearchConnectorHelpSection } from '../../src/i18n/filterSearchHelp';

describe('Filter Search connector help', () => {
    it.each([false, true])('replaces stale localized items while preserving the localized title (Types=%s)', enabled => {
        const staleLocalizedSection = {
            title: 'Localized AND/OR title',
            items: ['When filters are present, AND and OR are matched as words.']
        };

        const resolved = resolveFilterSearchConnectorHelpSection(staleLocalizedSection, enabled);
        const displayedGuidance = resolved.items.join(' ');

        expect(resolved.title).toBe(staleLocalizedSection.title);
        expect(displayedGuidance).not.toMatch(/matched as words/iu);
        expect(displayedGuidance).toContain('name-only searches');
        expect(displayedGuidance).toContain('makes the query invalid');
        expect(displayedGuidance.includes('`type:` facet')).toBe(enabled);
    });

    it('routes the runtime help modal through the authoritative connector guidance', () => {
        const source = readFileSync(new URL('../../src/components/SearchInput.tsx', import.meta.url), 'utf8');
        expect(source).toContain('resolveFilterSearchConnectorHelpSection(connectors, settings.tpsTypesNavigationEnabled)');
    });
});
