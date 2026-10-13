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

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    getTpsNotebookNavigatorDatabaseName,
    TPS_NOTEBOOK_NAVIGATOR_ANDROID_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_API_CHANGED_EVENT,
    TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT,
    TPS_NOTEBOOK_NAVIGATOR_BETTER_PASTE_ICON_ID,
    TPS_NOTEBOOK_NAVIGATOR_CALENDAR_VIEW,
    TPS_NOTEBOOK_NAVIGATOR_COLOR_DRAG_MIME,
    TPS_NOTEBOOK_NAVIGATOR_DATABASE_NAMESPACE,
    TPS_NOTEBOOK_NAVIGATOR_FOLDER_NOTE_SIDEBAR_VIEW,
    TPS_NOTEBOOK_NAVIGATOR_FROSTED_FILTER_ID,
    TPS_NOTEBOOK_NAVIGATOR_ICON_ID,
    TPS_NOTEBOOK_NAVIGATOR_IOS_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_IOS_FLOATING_TOOLBARS_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_MOBILE_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID,
    TPS_NOTEBOOK_NAVIGATOR_PROPERTY_DRAG_MIME,
    TPS_NOTEBOOK_NAVIGATOR_REACT_ID_PREFIX,
    TPS_NOTEBOOK_NAVIGATOR_ROOT_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_SETTINGS_TRANSFER_ID,
    TPS_NOTEBOOK_NAVIGATOR_SHORTCUT_DRAG_MIME,
    TPS_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID,
    TPS_NOTEBOOK_NAVIGATOR_STORAGE_PREFIX,
    TPS_NOTEBOOK_NAVIGATOR_SVG_FILTERS_ID,
    TPS_NOTEBOOK_NAVIGATOR_TAG_DRAG_MIME,
    TPS_NOTEBOOK_NAVIGATOR_VIEW,
    TPS_NOTEBOOK_NAVIGATOR_VISIBLE_EVENT,
    TPS_NOTEBOOK_NAVIGATOR_VIEWPORT_EVENT,
    UPSTREAM_NOTEBOOK_NAVIGATOR_PLUGIN_ID
} from '../../src/constants/tpsIdentity';
import { API_VERSION } from '../../src/api/version';
import { STORAGE_KEYS } from '../../src/types';
import { LEGACY_STORAGE_KEYS } from '../../src/utils/localStorage';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '../..');

const upstreamGlobalIdentifiers = new Set([
    'notebook-navigator',
    'notebook-navigator-better-paste',
    'notebook-navigator-calendar',
    'notebook-navigator-folder-note-sidebar',
    'notebook-navigator-mobile',
    'notebook-navigator-android',
    'notebook-navigator-ios',
    'notebook-navigator-ios-floating-toolbars',
    'notebook-navigator-visible',
    'application/x-notebook-navigator-tag',
    'application/x-notebook-navigator-property',
    'application/x-notebook-shortcut',
    'application/x-notebook-navigator-shortcut',
    'application/x-notebook-navigator-color',
    'notebook-navigator-svg-filters',
    'notebook-navigator-frosted',
    'notebooknavigator'
]);

const tpsGlobalIdentifiers = [
    TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID,
    TPS_NOTEBOOK_NAVIGATOR_VIEW,
    TPS_NOTEBOOK_NAVIGATOR_CALENDAR_VIEW,
    TPS_NOTEBOOK_NAVIGATOR_FOLDER_NOTE_SIDEBAR_VIEW,
    TPS_NOTEBOOK_NAVIGATOR_ICON_ID,
    TPS_NOTEBOOK_NAVIGATOR_BETTER_PASTE_ICON_ID,
    TPS_NOTEBOOK_NAVIGATOR_ROOT_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_MOBILE_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_ANDROID_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_IOS_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_IOS_FLOATING_TOOLBARS_CLASS,
    TPS_NOTEBOOK_NAVIGATOR_VISIBLE_EVENT,
    TPS_NOTEBOOK_NAVIGATOR_VIEWPORT_EVENT,
    TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT,
    TPS_NOTEBOOK_NAVIGATOR_API_CHANGED_EVENT,
    TPS_NOTEBOOK_NAVIGATOR_TAG_DRAG_MIME,
    TPS_NOTEBOOK_NAVIGATOR_PROPERTY_DRAG_MIME,
    TPS_NOTEBOOK_NAVIGATOR_SHORTCUT_DRAG_MIME,
    TPS_NOTEBOOK_NAVIGATOR_COLOR_DRAG_MIME,
    TPS_NOTEBOOK_NAVIGATOR_SVG_FILTERS_ID,
    TPS_NOTEBOOK_NAVIGATOR_FROSTED_FILTER_ID,
    TPS_NOTEBOOK_NAVIGATOR_STORAGE_PREFIX,
    TPS_NOTEBOOK_NAVIGATOR_DATABASE_NAMESPACE,
    TPS_NOTEBOOK_NAVIGATOR_SETTINGS_TRANSFER_ID,
    TPS_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID,
    TPS_NOTEBOOK_NAVIGATOR_REACT_ID_PREFIX
];

async function readSourceFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const contents = await Promise.all(
        entries.map(async entry => {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                return readSourceFiles(entryPath);
            }
            if (!/\.(?:css|mjs|ts|tsx)$/.test(entry.name)) {
                return [];
            }
            return [await readFile(entryPath, 'utf8')];
        })
    );
    return contents.flat();
}

describe('TPS Notebook Navigator identity isolation', () => {
    it('ships under a manifest and package identity distinct from upstream', async () => {
        const [manifestText, packageText] = await Promise.all([
            readFile(path.join(repoRoot, 'manifest.json'), 'utf8'),
            readFile(path.join(repoRoot, 'package.json'), 'utf8')
        ]);
        const manifest = JSON.parse(manifestText) as { id: string; name: string };
        const packageJson = JSON.parse(packageText) as { name: string };

        expect(UPSTREAM_NOTEBOOK_NAVIGATOR_PLUGIN_ID).toBe('notebook-navigator');
        expect(manifest.id).toBe(TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID);
        expect(manifest.id).not.toBe(UPSTREAM_NOTEBOOK_NAVIGATOR_PLUGIN_ID);
        expect(manifest.name).toBe('TPS Notebook Navigator');
        expect(packageJson.name).toBe(TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID);
    });

    it('keeps every host-global runtime identifier outside the upstream namespace', () => {
        expect(TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT).toBe('tps:notebook-navigator-api-request');
        expect(TPS_NOTEBOOK_NAVIGATOR_API_CHANGED_EVENT).toBe('tps:notebook-navigator-api-changed');
        expect(TPS_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID).toBe('tps-notebook-navigator-style-settings');
        expect(TPS_NOTEBOOK_NAVIGATOR_SHORTCUT_DRAG_MIME).not.toBe('application/x-notebook-shortcut');
        for (const identifier of tpsGlobalIdentifiers) {
            expect(identifier).not.toHaveLength(0);
            expect(upstreamGlobalIdentifiers.has(identifier), identifier).toBe(false);
        }
    });

    it('uses fork-owned, non-overlapping local and IndexedDB storage names', () => {
        const storageKeys = Object.values(STORAGE_KEYS) as string[];
        expect(new Set(storageKeys).size).toBe(storageKeys.length);
        expect(storageKeys.every(key => key.startsWith(`${TPS_NOTEBOOK_NAVIGATOR_STORAGE_PREFIX}-`))).toBe(true);
        expect(LEGACY_STORAGE_KEYS).toEqual([`${TPS_NOTEBOOK_NAVIGATOR_STORAGE_PREFIX}-file-cache`]);
        expect(LEGACY_STORAGE_KEYS).not.toContain('notebook-navigator-file-cache');

        expect(getTpsNotebookNavigatorDatabaseName('cache', 'co-install-vault')).toBe(
            `${TPS_NOTEBOOK_NAVIGATOR_DATABASE_NAMESPACE}/cache/co-install-vault`
        );
        expect(getTpsNotebookNavigatorDatabaseName('icons', 'co-install-vault')).toBe(
            `${TPS_NOTEBOOK_NAVIGATOR_DATABASE_NAMESPACE}/icons/co-install-vault`
        );
        expect(TPS_NOTEBOOK_NAVIGATOR_DATABASE_NAMESPACE).not.toBe('notebooknavigator');
    });

    it('keeps every public API contract surface on the same version', async () => {
        const [publicApi, publicApiReadme, apiReference] = await Promise.all([
            readFile(path.join(repoRoot, 'src/api/public/notebook-navigator.d.ts'), 'utf8'),
            readFile(path.join(repoRoot, 'src/api/public/README.md'), 'utf8'),
            readFile(path.join(repoRoot, 'docs/api-reference.md'), 'utf8')
        ]);
        const version = API_VERSION.toString();

        expect(version).toBe('3.6.0');
        expect(publicApi).toContain(`Version: ${version}`);
        expect(publicApiReadme).toContain(`Current API Version: **${version}**`);
        expect(apiReference).toContain(`**Current API Version:** ${version}`);
    });

    it('keeps inherited source merge-friendly while generated runtime artifacts stay isolated', async () => {
        const [sourceFiles, main, styles] = await Promise.all([
            readSourceFiles(path.join(repoRoot, 'src')),
            readFile(path.join(repoRoot, 'main.js'), 'utf8'),
            readFile(path.join(repoRoot, 'styles.css'), 'utf8')
        ]);
        const source = sourceFiles.join('\n');

        expect(source).toMatch(/--nn-/);
        expect(source).toMatch(/(?<!tps-)nn-/);
        expect(source).toMatch(/\.notebook-navigator/);
        expect(source).not.toMatch(/--tps-nn-/);
        expect(source).not.toMatch(/(?<![\w-])tps-nn-/);
        expect(source).not.toMatch(/\.tps-notebook-navigator/);

        expect(main).not.toMatch(/--nn-/);
        expect(main).not.toMatch(/\.notebook-navigator/);
        expect(main).toContain('tps-nn-');
        expect(styles).not.toMatch(/--nn-/);
        expect(styles).not.toMatch(/(?<!tps-)nn-/);
        expect(styles).not.toMatch(/\.notebook-navigator/);
        expect(styles).toContain('.tps-notebook-navigator');
        expect(styles).toContain('--tps-nn-');
    });

    it('uses the fork id in public API, documentation, and manual QA plugin lookups', async () => {
        const [publicApi, publicApiReadme, apiReference, apiTestSuite] = await Promise.all([
            readFile(path.join(repoRoot, 'src/api/public/notebook-navigator.d.ts'), 'utf8'),
            readFile(path.join(repoRoot, 'src/api/public/README.md'), 'utf8'),
            readFile(path.join(repoRoot, 'docs/api-reference.md'), 'utf8'),
            readFile(path.join(repoRoot, 'tests/api-test-suite.js'), 'utf8')
        ]);
        const forkLookup = `plugins['${TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID}']`;

        expect(publicApi).toContain(forkLookup);
        expect(publicApiReadme).toContain(forkLookup);
        expect(apiReference).toContain(forkLookup);
        expect(apiTestSuite).toContain(forkLookup);
        expect(publicApi).not.toContain("plugins['notebook-navigator']");
        expect(publicApiReadme).not.toContain("plugins['notebook-navigator']");
        expect(apiReference).not.toContain("plugins['notebook-navigator']");
        expect(apiTestSuite).not.toContain("plugins['notebook-navigator']");
    });

    it('prefixes React-generated IDs in every TPS view root', async () => {
        const viewSources = await Promise.all([
            readFile(path.join(repoRoot, 'src/view/NotebookNavigatorView.tsx'), 'utf8'),
            readFile(path.join(repoRoot, 'src/view/NotebookNavigatorCalendarView.tsx'), 'utf8')
        ]);

        expect(TPS_NOTEBOOK_NAVIGATOR_REACT_ID_PREFIX).toBe('tps-notebook-navigator-');
        for (const source of viewSources) {
            expect(source).toContain('createRoot(container, { identifierPrefix: TPS_NOTEBOOK_NAVIGATOR_REACT_ID_PREFIX })');
            expect(source).not.toContain('createRoot(container);');
        }
    });
});
