/*
 * TPS Notebook Navigator - Plugin for Obsidian
 * Based on Notebook Navigator by Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { createSettingGroupFactory } from '../../settingGroups';
import { renderTpsTypesNavigationEnabledSetting, renderUpstreamSettingsImportSetting } from '../TpsIntegrationTab';
import type { SettingsTabContext } from '../SettingsTabContext';

/** Legacy renderer for the fork-specific TPS integration destination. */
export function renderTpsIntegrationTab(context: SettingsTabContext): void {
    const createGroup = createSettingGroupFactory(context.containerEl);
    const typesGroup = createGroup('File types');
    const setupGroup = createGroup('One-way setup');

    typesGroup.addSetting(setting => renderTpsTypesNavigationEnabledSetting(setting, context));
    setupGroup.addSetting(setting => renderUpstreamSettingsImportSetting(setting, context));
}
