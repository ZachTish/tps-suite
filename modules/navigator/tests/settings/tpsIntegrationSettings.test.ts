/* TPS Notebook Navigator - whole-file integration settings regression coverage. */

import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/i18n', () => ({
    strings: {
        common: { cancel: 'Cancel', delete: 'Delete', restoreDefault: 'Restore default' }
    }
}));

import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { createTpsIntegrationSettingDefinitions, renderTpsTypesNavigationEnabledSetting } from '../../src/settings/tabs/TpsIntegrationTab';
import type { SettingsTabContext } from '../../src/settings/tabs/SettingsTabContext';
import { getMarkdownPipelineContentTypes, hasMarkdownTaskConsumer } from '../../src/utils/markdownPipelineContentTypes';

function createContext(): SettingsTabContext {
    return {
        plugin: {
            settings: structuredClone(DEFAULT_SETTINGS),
            saveSettingsAndUpdate: vi.fn().mockResolvedValue(undefined)
        },
        refreshSettingsDomState: vi.fn()
    } as unknown as SettingsTabContext;
}

describe('TPS integration settings', () => {
    it('shows only whole-file navigation and one-way import controls', () => {
        const definitions = createTpsIntegrationSettingDefinitions(createContext()) as Array<Record<string, unknown>>;
        expect(definitions.map(group => group.heading)).toEqual(['File types', 'One-way setup']);
        expect((definitions[0].items as Array<Record<string, unknown>>).map(item => item.name)).toEqual(['Show File types']);
        expect((definitions[1].items as Array<Record<string, unknown>>).map(item => item.name)).toEqual([
            'Import upstream Notebook Navigator settings'
        ]);
        expect((definitions[0].items as Array<Record<string, unknown>>)[0].desc).toContain('whole-file categories');
    });

    it('defaults to native records with task rows disabled while keeping read-only note task progress', () => {
        expect(DEFAULT_SETTINGS.tpsDataArchitectureMode).toBe('native-records');
        expect(DEFAULT_SETTINGS.tpsTypesNavigationEnabled).toBe(false);
        expect(DEFAULT_SETTINGS.tpsGcmTaskRowsEnabled).toBe(false);
        expect(hasMarkdownTaskConsumer(DEFAULT_SETTINGS)).toBe(true);
        expect(getMarkdownPipelineContentTypes(DEFAULT_SETTINGS)).toContain('tasks');
    });

    it('persists the file-type visibility toggle', async () => {
        const context = createContext();
        const saveSettingsAndUpdate = vi.fn().mockResolvedValue(undefined);
        const refreshSettingsDomState = vi.fn();
        context.plugin.saveSettingsAndUpdate = saveSettingsAndUpdate;
        context.refreshSettingsDomState = refreshSettingsDomState;
        let handleChange: ((value: boolean) => Promise<void>) | undefined;
        const toggle = {
            setValue: vi.fn().mockReturnThis(),
            onChange: vi.fn((callback: (value: boolean) => Promise<void>) => {
                handleChange = callback;
                return toggle;
            })
        };
        const setting = {
            setName: vi.fn().mockReturnThis(),
            setDesc: vi.fn().mockReturnThis(),
            addToggle: vi.fn((render: (control: typeof toggle) => void) => {
                render(toggle);
                return setting;
            })
        };

        renderTpsTypesNavigationEnabledSetting(setting as never, context);
        expect(toggle.setValue).toHaveBeenCalledWith(true);
        await handleChange?.(false);
        expect(context.plugin.settings.tpsFileTypesNavigationEnabled).toBe(false);
        expect(saveSettingsAndUpdate).toHaveBeenCalledOnce();
        expect(refreshSettingsDomState).toHaveBeenCalledOnce();
    });
});
