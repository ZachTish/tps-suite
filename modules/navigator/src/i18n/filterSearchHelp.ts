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

interface ConnectorHelpSection {
    title: string;
    items: string[];
}

const FILTER_SEARCH_CONNECTOR_HELP_ITEMS = [
    '`AND` and `OR` are operators in tag/property expressions.',
    'In name-only searches, unquoted `AND` and `OR` remain literal file-name or alias terms (for example: `research and development`).',
    'Outside name-only searches and tag/property expressions, an unquoted `AND` or `OR` makes the query invalid (for example: `#work OR ext:md`, `@today OR @yesterday`, or `meeting OR #work`).',
    'Example operator query: `#work OR .status=started`.',
    'Quote a connector to use it as name text alongside a filter (for example: `"OR" #roadmap`).'
];

const FILTER_SEARCH_TYPE_CONNECTOR_HELP_ITEM = 'An orthogonal `type:` facet does not change the operators in a tag/property expression.';

/** Returns the authoritative connector behavior shown by Filter Search help in every locale. */
export function getFilterSearchConnectorHelpItems(typesNavigationEnabled: boolean): string[] {
    if (!typesNavigationEnabled) {
        return FILTER_SEARCH_CONNECTOR_HELP_ITEMS.slice();
    }

    return [FILTER_SEARCH_CONNECTOR_HELP_ITEMS[0], FILTER_SEARCH_TYPE_CONNECTOR_HELP_ITEM, ...FILTER_SEARCH_CONNECTOR_HELP_ITEMS.slice(1)];
}

/** Keeps the translated section title while replacing potentially stale localized behavior copy. */
export function resolveFilterSearchConnectorHelpSection(
    localizedSection: ConnectorHelpSection,
    typesNavigationEnabled: boolean
): ConnectorHelpSection {
    return {
        title: localizedSection.title,
        items: getFilterSearchConnectorHelpItems(typesNavigationEnabled)
    };
}
