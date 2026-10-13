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
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import {
    applyModifiedSettingsTransfer,
    createModifiedSettingsTransfer,
    createSettingsTransferBaseName,
    createSettingsTransferFilename
} from '../../src/settings/transfer';

describe('createSettingsTransferFilename', () => {
    it('formats settings transfer filenames with a sortable local timestamp', () => {
        const date = new Date(2026, 6, 3, 14, 22, 33);

        expect(createSettingsTransferBaseName(date)).toBe('tps-notebook-navigator-settings_20260703-142233');
        expect(createSettingsTransferFilename(date)).toBe('tps-notebook-navigator-settings_20260703-142233.json');
    });
});

describe('createModifiedSettingsTransfer', () => {
    // propertyGroupKey is always exported: its absence marks pre-split exports, so import can
    // seed the grouping list from the sorting list without misreading an intentionally empty list.
    it('returns an envelope with only the always-exported keys when settings match defaults', () => {
        expect(createModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), '3.2.3')).toEqual({
            plugin: 'tps-notebook-navigator',
            pluginVersion: '3.2.3',
            settings: { propertyGroupKey: '' }
        });
    });

    it('ignores legacy top-level keys that are not part of current settings', () => {
        const settings = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, unknown>;
        settings.defaultListAppearance = 'slim';
        settings.fileIconColors = {};
        settings.numRecentNotes = 3;

        expect(createModifiedSettingsTransfer(settings as unknown as typeof DEFAULT_SETTINGS, '3.2.3').settings).toEqual({
            propertyGroupKey: ''
        });
    });

    it('exports only transferable settings that differ from defaults', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.folderSortOrder = 'alpha-desc';
        settings.searchProvider = 'omnisearch';

        expect(createModifiedSettingsTransfer(settings, '3.2.3').settings).toEqual({
            folderSortOrder: 'alpha-desc',
            propertyGroupKey: ''
        });
    });

    it('exports a configured grouping property list', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertyGroupKey = 'status, genre';

        expect(createModifiedSettingsTransfer(settings, '3.2.3').settings).toEqual({
            propertyGroupKey: 'status, genre'
        });
    });

    it('excludes the shared release marker from exports', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.lastShownVersion = '3.3.2';

        expect(createModifiedSettingsTransfer(settings, '3.3.2').settings).toEqual({
            propertyGroupKey: ''
        });
    });

    it('round-trips the Types navigation sort mode and retained manual order', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.typeNavigationSortOrder = 'manual';
        settings.rootTypeOrder = ['structural:table', 'provider:example%2Frelations:projects'];

        const transferData = createModifiedSettingsTransfer(settings, '5.2.0');
        expect(transferData.settings).toEqual({
            typeNavigationSortOrder: 'manual',
            rootTypeOrder: ['structural:table', 'provider:example%2Frelations:projects'],
            // Post-split exports always include this key, even when it retains its default.
            propertyGroupKey: ''
        });

        const restored = applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), transferData);
        expect(restored.typeNavigationSortOrder).toBe('manual');
        expect(restored.rootTypeOrder).toEqual(['structural:table', 'provider:example%2Frelations:projects']);
    });

    it('round-trips the Type resource creation target and specific-note path', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.tpsResourceCreationTarget = 'specific-note';
        settings.tpsResourceCreationSpecificFile = 'Inbox/Capture.md';

        const transferData = createModifiedSettingsTransfer(settings, '5.3.1');
        expect(transferData.settings).toEqual({
            tpsResourceCreationTarget: 'specific-note',
            tpsResourceCreationSpecificFile: 'Inbox/Capture.md',
            propertyGroupKey: ''
        });

        const restored = applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), transferData);
        expect(restored.tpsResourceCreationTarget).toBe('specific-note');
        expect(restored.tpsResourceCreationSpecificFile).toBe('Inbox/Capture.md');
    });
});

describe('applyModifiedSettingsTransfer', () => {
    it('applies imported changes onto defaults while preserving non-transferable values from current settings', () => {
        const currentSettings = structuredClone(DEFAULT_SETTINGS);
        currentSettings.folderSortOrder = 'alpha-desc';
        currentSettings.searchProvider = 'omnisearch';

        const nextSettings = applyModifiedSettingsTransfer(currentSettings, {
            tagSortOrder: 'frequency-desc'
        });

        expect(nextSettings.folderSortOrder).toBe(DEFAULT_SETTINGS.folderSortOrder);
        expect(nextSettings.tagSortOrder).toBe('frequency-desc');
        expect(nextSettings.searchProvider).toBe('omnisearch');
    });

    it('keeps the current release marker when an import contains an older value', () => {
        const currentSettings = structuredClone(DEFAULT_SETTINGS);
        currentSettings.lastShownVersion = '3.3.2';

        const nextSettings = applyModifiedSettingsTransfer(currentSettings, {
            tagSortOrder: 'frequency-desc',
            lastShownVersion: '3.1.0'
        });

        expect(nextSettings.lastShownVersion).toBe('3.3.2');
    });

    it('rejects non-object transfer payloads', () => {
        expect(() => applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), 'invalid')).toThrow(
            'Settings import must be a JSON object.'
        );
    });

    it('accepts an empty bare legacy diff', () => {
        const currentSettings = structuredClone(DEFAULT_SETTINGS);
        currentSettings.searchProvider = 'omnisearch';

        const nextSettings = applyModifiedSettingsTransfer(currentSettings, {});

        expect(nextSettings.folderSortOrder).toBe(DEFAULT_SETTINGS.folderSortOrder);
        expect(nextSettings.searchProvider).toBe('omnisearch');
    });

    it('unwraps enveloped exports produced by createModifiedSettingsTransfer', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.folderSortOrder = 'alpha-desc';

        const transferData = createModifiedSettingsTransfer(settings, '3.2.3');
        const nextSettings = applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), transferData);

        expect(nextSettings.folderSortOrder).toBe('alpha-desc');
    });

    it('migrates a fixed folder note name from exports created before the settings were combined', () => {
        const nextSettings = applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), {
            plugin: 'tps-notebook-navigator',
            pluginVersion: '3.3.3',
            settings: { folderNoteName: 'index' }
        });

        expect(nextSettings.folderNoteNamePattern).toBe('index');
        expect(nextSettings).not.toHaveProperty('folderNoteName');
    });

    it('rejects upstream envelopes so they can only enter through the explicit one-way import', () => {
        expect(() =>
            applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), {
                plugin: 'notebook-navigator',
                pluginVersion: '3.3.3',
                settings: { folderNoteName: 'index' }
            })
        ).toThrow('Not a Notebook Navigator settings export.');
    });

    it('seeds the grouping property list from the sorting list for pre-split exports', () => {
        // Pre-split TPS exports never contain propertyGroupKey; the enveloped and bare forms both seed.
        const enveloped = applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), {
            plugin: 'tps-notebook-navigator',
            pluginVersion: '3.3.0',
            settings: { propertySortKey: 'status, priority' }
        });
        expect(enveloped.propertySortKey).toBe('status, priority');
        expect(enveloped.propertyGroupKey).toBe('status, priority');

        const bare = applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), { propertySortKey: 'status' });
        expect(bare.propertyGroupKey).toBe('status');
    });

    it('keeps an intentionally empty grouping list from post-split exports', () => {
        const settings = structuredClone(DEFAULT_SETTINGS);
        settings.propertySortKey = 'status, priority';
        settings.propertyGroupKey = '';

        const transferData = createModifiedSettingsTransfer(settings, '3.3.1');
        const nextSettings = applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), transferData);

        expect(nextSettings.propertySortKey).toBe('status, priority');
        expect(nextSettings.propertyGroupKey).toBe('');
    });

    it('rejects envelopes from other plugins', () => {
        expect(() =>
            applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), {
                plugin: 'other-plugin',
                settings: { folderSortOrder: 'alpha-desc' }
            })
        ).toThrow('Not a Notebook Navigator settings export.');
    });

    it('rejects envelopes without a settings object', () => {
        expect(() =>
            applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), {
                plugin: 'tps-notebook-navigator',
                pluginVersion: '3.2.3'
            })
        ).toThrow('Settings import must contain a settings object.');
    });

    it('rejects bare objects without a transferable settings key', () => {
        expect(() =>
            applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), {
                unrelated: true
            })
        ).toThrow('Settings import must contain Notebook Navigator settings.');
    });

    it('rejects bare objects with only non-transferable settings', () => {
        expect(() =>
            applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), {
                searchProvider: 'omnisearch'
            })
        ).toThrow('Settings import must contain Notebook Navigator settings.');
    });

    it('rejects envelopes without a transferable settings key', () => {
        expect(() =>
            applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), {
                plugin: 'tps-notebook-navigator',
                pluginVersion: '3.2.3',
                settings: { unrelated: true }
            })
        ).toThrow('Settings import must contain Notebook Navigator settings.');
    });

    it('ignores unknown top-level keys during import', () => {
        const nextSettings = applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), {
            defaultListAppearance: 'slim',
            folderSortOrder: 'alpha-desc'
        });

        expect(nextSettings.defaultListAppearance).toBeUndefined();
        expect(nextSettings.folderSortOrder).toBe('alpha-desc');
    });

    it('does not retain unknown top-level keys from current settings during import overwrite', () => {
        const currentSettings = structuredClone(DEFAULT_SETTINGS) as typeof DEFAULT_SETTINGS & Record<string, unknown>;
        currentSettings.searchProvider = 'omnisearch';
        currentSettings.legacyField = { stale: true };

        const nextSettings = applyModifiedSettingsTransfer(currentSettings, {
            folderSortOrder: 'alpha-desc'
        });

        expect(nextSettings.legacyField).toBeUndefined();
        expect(nextSettings.searchProvider).toBe('omnisearch');
        expect(nextSettings.folderSortOrder).toBe('alpha-desc');
    });

    it('rejects invalid values for nullable string settings during import', () => {
        const nextSettings = applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), {
            homepage: { bad: true },
            folderNoteTemplate: 123
        });

        expect(nextSettings.homepage).toEqual(DEFAULT_SETTINGS.homepage);
        expect(nextSettings.folderNoteTemplate).toBeNull();
    });

    it('rejects invalid values for nested nullable string settings during import', () => {
        const nextSettings = applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), {
            vaultProfiles: [
                {
                    ...structuredClone(DEFAULT_SETTINGS.vaultProfiles[0]),
                    navigationBanner: { bad: true }
                }
            ]
        });

        const profiles = nextSettings.vaultProfiles as { navigationBanner: unknown }[];
        expect(profiles[0]?.navigationBanner).toBeNull();
    });
});
