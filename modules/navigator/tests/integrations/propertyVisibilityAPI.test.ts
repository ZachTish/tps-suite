import { describe, expect, it, vi } from 'vitest';
import { mergeGcmPropertyKeys } from '../../src/integrations/gcm/gcmPropertyCatalog';
import { createPropertyVisibilityAPI } from '../../src/api/modules/PropertyVisibilityAPI';
import { ensureVaultProfiles } from '../../src/utils/vaultProfiles';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { openGcmPropertySettings } from '../../src/integrations/gcm/gcmPropertySettings';
import type { App } from 'obsidian';

function setup() {
    const settings = structuredClone(DEFAULT_SETTINGS);
    const first = settings.vaultProfiles[0];
    first.propertyKeys = [{ key: 'Status', showInNavigation: false, showInList: true, showInFileMenu: false }];
    const second = { ...structuredClone(first), id: 'second', name: 'Second' };
    settings.vaultProfiles.push(second);
    const saveSettingsAndUpdate = vi.fn(async () => {});
    const api = createPropertyVisibilityAPI({ settings, saveSettingsAndUpdate });
    return { settings, first, second, api, saveSettingsAndUpdate };
}

describe('shared property visibility settings', () => {
    it('reads existing choices without modifying settings and returns an isolated snapshot', () => {
        const { api, first, saveSettingsAndUpdate } = setup();
        const snapshot = api.get(' status ');
        expect(snapshot).toMatchObject({ profileId: first.id, showInNavigation: false, showInList: true, showInFileMenu: false });
        snapshot.showInList = false;
        expect(api.get('status').showInList).toBe(true);
        expect(saveSettingsAndUpdate).not.toHaveBeenCalled();
    });
    it('changes only the requested surface in the active profile, preserving casing and order', async () => {
        const { api, first, second, saveSettingsAndUpdate } = setup();
        await api.set('STATUS', 'showInNavigation', true, first.id);
        expect(first.propertyKeys).toEqual([{ key: 'Status', showInNavigation: true, showInList: true, showInFileMenu: false }]);
        expect(second.propertyKeys[0].showInNavigation).toBe(false);
        expect(saveSettingsAndUpdate).toHaveBeenCalledOnce();
        await api.set('status', 'showInNavigation', true, first.id);
        expect(saveSettingsAndUpdate).toHaveBeenCalledOnce();
    });
    it('adds a previously unconfigured key without enabling unrelated surfaces', async () => {
        const { api, first } = setup();
        await api.set('scheduled', 'showInList', true, first.id);
        expect(first.propertyKeys[1]).toEqual({ key: 'scheduled', showInNavigation: false, showInList: true, showInFileMenu: false });
    });
    it('rejects edits from a stale profile without changing either profile', async () => {
        const { api, settings, first, second, saveSettingsAndUpdate } = setup();
        settings.vaultProfile = second.id;
        await expect(api.set('status', 'showInNavigation', true, first.id)).rejects.toThrow('profile changed');
        expect(saveSettingsAndUpdate).not.toHaveBeenCalled();
        expect(first.propertyKeys).toEqual(second.propertyKeys);
    });
    it('restores in-memory settings after failed persistence', async () => {
        const { api, first, settings, saveSettingsAndUpdate } = setup();
        saveSettingsAndUpdate.mockImplementation(async () => {
            ensureVaultProfiles(settings);
            throw new Error('disk full');
        });
        await expect(api.set('status', 'showInList', false, first.id)).rejects.toThrow('disk full');
        expect(first.propertyKeys[0].showInList).toBe(true);
        await expect(api.set('new', 'showInList', true, first.id)).rejects.toThrow('disk full');
        expect(first.propertyKeys).toHaveLength(1);
    });
    it('retains all-off choices through normalization, reload and catalog refresh', async () => {
        const { api, first, settings, saveSettingsAndUpdate } = setup();
        saveSettingsAndUpdate.mockImplementation(async () => {
            ensureVaultProfiles(settings);
        });
        await api.set('status', 'showInList', false, first.id);
        const reloaded = JSON.parse(JSON.stringify(settings)) as typeof settings;
        ensureVaultProfiles(reloaded);
        const entries = reloaded.vaultProfiles[0].propertyKeys;
        expect(entries).toHaveLength(1);
        expect(mergeGcmPropertyKeys(entries, [{ key: 'status' }])).toBe(entries);
        expect(entries[0]).toMatchObject({ showInNavigation: false, showInList: false, showInFileMenu: false });
    });
    it('rejects empty keys and invalid surfaces', async () => {
        const { api, first, saveSettingsAndUpdate } = setup();
        await expect(api.set(' ', 'showInList', true, first.id)).rejects.toThrow('Invalid');
        // @ts-expect-error Runtime consumers must also be validated.
        await expect(api.set('status', 'arbitrary', true, first.id)).rejects.toThrow('Invalid');
        expect(saveSettingsAndUpdate).not.toHaveBeenCalled();
    });
    it('hands configuration to GCM when available and preserves standalone fallback', () => {
        const openCustomPropertySettings = vi.fn(() => true);
        const provider = { api: { ui: { openCustomPropertySettings } } };
        const app = { plugins: { getPlugin: () => provider, plugins: { 'tps-global-context-menu': provider } } } as unknown as App;
        expect(openGcmPropertySettings(app)).toBe(true);
        expect(openCustomPropertySettings).toHaveBeenCalledOnce();
        expect(openGcmPropertySettings({ plugins: { getPlugin: () => null } } as unknown as App)).toBe(false);
    });
});
