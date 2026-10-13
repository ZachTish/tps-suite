/*
 * TPS Notebook Navigator - Plugin for Obsidian
 * Based on Notebook Navigator by Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import {
    UpstreamSettingsImportError,
    getUpstreamNotebookNavigatorSettingsPath,
    mergeUpstreamSettingsIntoCurrent,
    prepareUpstreamSettingsImport
} from '../../src/services/settings/UpstreamSettingsImport';

const TEST_CONFIG_DIR = ['.', 'obsidian'].join('');
const TEST_UPSTREAM_SETTINGS_PATH = getUpstreamNotebookNavigatorSettingsPath(TEST_CONFIG_DIR);

function createAdapter(options: { exists?: boolean; contents?: string } = {}) {
    return {
        exists: vi.fn().mockResolvedValue(options.exists ?? true),
        read: vi.fn().mockResolvedValue(options.contents ?? '{}'),
        write: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        rename: vi.fn().mockResolvedValue(undefined),
        rmdir: vi.fn().mockResolvedValue(undefined)
    };
}

describe('prepareUpstreamSettingsImport', () => {
    it('returns missing without attempting to read when upstream data.json does not exist', async () => {
        const adapter = createAdapter({ exists: false });

        await expect(prepareUpstreamSettingsImport(adapter, structuredClone(DEFAULT_SETTINGS), TEST_CONFIG_DIR)).resolves.toEqual({
            status: 'missing'
        });
        expect(adapter.exists).toHaveBeenCalledOnce();
        expect(adapter.exists).toHaveBeenCalledWith(TEST_UPSTREAM_SETTINGS_PATH);
        expect(adapter.read).not.toHaveBeenCalled();
    });

    it('rejects malformed JSON without preparing an import', async () => {
        const adapter = createAdapter({ contents: '{ not json' });

        await expect(prepareUpstreamSettingsImport(adapter, structuredClone(DEFAULT_SETTINGS), TEST_CONFIG_DIR)).rejects.toMatchObject<
            Partial<UpstreamSettingsImportError>
        >({
            name: 'UpstreamSettingsImportError',
            code: 'malformed-json'
        });
    });

    it('rejects JSON whose root is not a settings object', async () => {
        const adapter = createAdapter({ contents: '[]' });

        await expect(prepareUpstreamSettingsImport(adapter, structuredClone(DEFAULT_SETTINGS), TEST_CONFIG_DIR)).rejects.toMatchObject<
            Partial<UpstreamSettingsImportError>
        >({
            code: 'invalid-root'
        });
    });

    it('accepts a schema-compatible partial record and deeply preserves omitted TPS values', async () => {
        const current = structuredClone(DEFAULT_SETTINGS);
        current.recentNotesCount = 37;
        current.tpsDataArchitectureMode = 'native-records';
        current.tpsTypesNavigationEnabled = false;
        current.tpsTypesPauseMigrationVersion = 1;
        current.tpsLinePropertyInheritanceVersion = 1;
        current.typeNavigationSortOrder = 'manual';
        current.typeAppearances = { 'entity:note': { mode: 'compact' } };
        current.typeSortOverrides = { 'file:base': 'title-desc' };
        current.rootTypeOrder = ['structural:table', 'entity:note'];
        current.tpsResourceCreationTarget = 'specific-note';
        current.tpsResourceCreationSpecificFile = 'Inbox/Capture.md';
        current.tpsGcmTaskRowsEnabled = true;
        current.tpsGcmTaskRowsIncludeCompleted = true;
        current.tpsGcmTaskRowsPerNote = 17;
        current.lastShownVersion = '4.0.0';
        current.toolbarVisibility.list.search = true;
        current.toolbarVisibility.list.sort = false;
        const adapter = createAdapter({
            contents: JSON.stringify({
                folderSortOrder: 'alpha-desc',
                toolbarVisibility: { list: { search: false } },
                tpsDataArchitectureMode: 'legacy',
                tpsTypesNavigationEnabled: true,
                tpsTypesPauseMigrationVersion: 99,
                tpsLinePropertyInheritanceVersion: 99,
                typeNavigationSortOrder: 'alpha-desc',
                typeAppearances: { 'entity:note': { mode: 'standard' } },
                typeSortOverrides: { 'file:base': 'title-asc' },
                rootTypeOrder: ['entity:note'],
                tpsResourceCreationTarget: 'active-note',
                tpsResourceCreationSpecificFile: 'Upstream.md',
                tpsGcmTaskRowsEnabled: false,
                tpsGcmTaskRowsIncludeCompleted: false,
                tpsGcmTaskRowsPerNote: 1,
                lastShownVersion: '3.3.0',
                unknownUpstreamField: 'ignored'
            })
        });

        const result = await prepareUpstreamSettingsImport(adapter, current, TEST_CONFIG_DIR);

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') {
            throw new Error('Expected a prepared settings record');
        }
        expect(result.settingsRecord.folderSortOrder).toBe('alpha-desc');
        expect(result.settingsRecord.recentNotesCount).toBe(37);
        expect(result.settingsRecord.tpsDataArchitectureMode).toBe('native-records');
        expect(result.settingsRecord.tpsTypesNavigationEnabled).toBe(false);
        expect(result.settingsRecord.tpsTypesPauseMigrationVersion).toBe(1);
        expect(result.settingsRecord.tpsLinePropertyInheritanceVersion).toBe(1);
        expect(result.settingsRecord.typeNavigationSortOrder).toBe('manual');
        expect(result.settingsRecord.typeAppearances).toEqual({ 'entity:note': { mode: 'compact' } });
        expect(result.settingsRecord.typeSortOverrides).toEqual({ 'file:base': 'title-desc' });
        expect(result.settingsRecord.rootTypeOrder).toEqual(['structural:table', 'entity:note']);
        expect(result.settingsRecord.tpsResourceCreationTarget).toBe('specific-note');
        expect(result.settingsRecord.tpsResourceCreationSpecificFile).toBe('Inbox/Capture.md');
        expect(result.settingsRecord.tpsGcmTaskRowsEnabled).toBe(true);
        expect(result.settingsRecord.tpsGcmTaskRowsIncludeCompleted).toBe(true);
        expect(result.settingsRecord.tpsGcmTaskRowsPerNote).toBe(17);
        expect(result.settingsRecord.lastShownVersion).toBe('4.0.0');
        expect(result.settingsRecord.toolbarVisibility).toMatchObject({
            list: { search: false, sort: false }
        });
        expect(result.settingsRecord.unknownUpstreamField).toBeUndefined();
    });

    it('deep-copies imported arrays and records without mutating current or upstream settings', () => {
        const current = structuredClone(DEFAULT_SETTINGS);
        const upstream = {
            vaultProfiles: [
                {
                    ...structuredClone(DEFAULT_SETTINGS.vaultProfiles[0]),
                    name: 'Imported',
                    hiddenFolders: ['private']
                }
            ],
            homepage: { source: 'file', file: 'Home.md', createMissingPeriodicNote: false }
        };
        const currentBefore = structuredClone(current);
        const upstreamBefore = structuredClone(upstream);

        const merged = mergeUpstreamSettingsIntoCurrent(current, upstream);
        const profiles = merged.vaultProfiles as typeof upstream.vaultProfiles;
        const homepage = merged.homepage as typeof upstream.homepage;
        profiles[0].hiddenFolders.push('changed-after-import');
        homepage.file = 'Changed.md';

        expect(current).toEqual(currentBefore);
        expect(upstream).toEqual(upstreamBefore);
    });

    it('never invokes upstream mutation methods', async () => {
        const adapter = createAdapter({ contents: JSON.stringify({ folderSortOrder: 'alpha-desc' }) });

        await prepareUpstreamSettingsImport(adapter, structuredClone(DEFAULT_SETTINGS), TEST_CONFIG_DIR);

        expect(adapter.write).not.toHaveBeenCalled();
        expect(adapter.remove).not.toHaveBeenCalled();
        expect(adapter.rename).not.toHaveBeenCalled();
        expect(adapter.rmdir).not.toHaveBeenCalled();
        expect(adapter.exists).toHaveBeenCalledWith(TEST_UPSTREAM_SETTINGS_PATH);
        expect(adapter.read).toHaveBeenCalledWith(TEST_UPSTREAM_SETTINGS_PATH);
    });
});
