/* TPS Notebook Navigator - visible, fail-closed Filter Search diagnostics. */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getInvalidFilterSearchMessage } from '../../src/components/SearchInput';
import { filterListPaneFiles } from '../../src/hooks/listPaneData/searchPipeline';
import { parseFilterSearchTokens } from '../../src/utils/filterSearch';

describe('invalid Filter Search state', () => {
    it.each([
        ['malformed-filter', 'incomplete or invalid'],
        ['mixed-logical-operator', 'AND and OR'],
        ['invalid-logical-expression', 'each side'],
        ['types-disabled', 'Types collections are turned off']
    ] as const)('provides visible guidance for %s', (reason, phrase) => {
        expect(getInvalidFilterSearchMessage(reason)).toContain(phrase);
    });

    it('fails closed through the list search pipeline instead of returning the scope', () => {
        const file = {
            path: 'Notes/Anything.md',
            basename: 'Anything',
            extension: 'md',
            parent: { path: 'Notes' },
            stat: { ctime: 0, mtime: 0 }
        };
        const tokens = parseFilterSearchTokens('folder:');

        const result = filterListPaneFiles({
            app: {} as never,
            baseFiles: [file] as never,
            getDB: () => ({ getFile: () => null }) as never,
            getFileTimestamps: () => ({ created: 0, modified: 0 }),
            omnisearchResult: null,
            searchTokens: tokens,
            searchableNames: new Map([[file.path, { foldedDisplayName: 'anything', aliases: [], foldedAliases: [] }]]),
            settings: { alphabeticalDateMode: 'modified' },
            sortOption: 'title-asc',
            trimmedQuery: 'folder:',
            useOmnisearch: false
        });

        expect(tokens.invalidReason).toBe('malformed-filter');
        expect(result.files).toEqual([]);
    });

    it('wires the visible error as an accessible invalid input and live alert', () => {
        const source = readFileSync(new URL('../../src/components/SearchInput.tsx', import.meta.url), 'utf8');
        expect(source).toContain('aria-invalid={invalidMessage ? true : undefined}');
        expect(source).toContain('aria-describedby={invalidMessage');
        expect(source).toContain('id={invalidMessageId} className="nn-search-query-error" role="alert"');
    });

    it('lets the mobile search header grow to contain the visible error', () => {
        const source = readFileSync(new URL('../../src/styles/sections/ui-search.css', import.meta.url), 'utf8');
        expect(source).toContain('.notebook-navigator-mobile .nn-search-bar-container.nn-search-bar-visible.nn-search-bar-invalid');
        expect(source).toContain('.notebook-navigator-mobile .nn-search-bar-invalid .nn-search-input-wrapper');
        expect(source).toContain('.notebook-navigator-mobile .nn-search-bar-invalid .nn-search-input-container');
        expect(source).toMatch(/nn-search-input-container\s*\{\s*height:\s*auto;/u);
    });
});
