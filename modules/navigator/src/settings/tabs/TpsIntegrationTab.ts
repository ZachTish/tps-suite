/*
 * TPS Notebook Navigator - Plugin for Obsidian
 * Based on Notebook Navigator by Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { Setting, SettingDefinitionGroup, SettingDefinitionItem } from 'obsidian';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { createGroupDefinition, createRenderDefinition } from '../nativeSettingControls';
import type { SettingsTabContext } from './SettingsTabContext';
import { showNotice } from '../../utils/noticeUtils';

export const TPS_INTEGRATION_SETTINGS_LABEL = 'TPS integration';
export const TPS_INTEGRATION_SETTINGS_DESCRIPTION = 'Browse whole-file types and import settings from the original Notebook Navigator.';

const UPSTREAM_IMPORT_COPY = {
    group: 'One-way setup',
    name: 'Import upstream Notebook Navigator settings',
    desc: "Copy recognized settings from the original plugin's data.json into TPS Notebook Navigator. The original plugin and its data remain unchanged.",
    button: 'Import upstream settings',
    confirmTitle: 'Import upstream Notebook Navigator settings?',
    confirmMessage:
        "This reads only the original plugin's data.json and copies matching settings into TPS Notebook Navigator. Existing TPS values omitted by the upstream file are kept. The original plugin is never changed.",
    confirmButton: 'Import settings',
    success: 'Upstream Notebook Navigator settings imported into TPS Notebook Navigator.',
    missing: 'No upstream Notebook Navigator settings file was found.',
    failed: 'Could not import upstream Notebook Navigator settings: {message}'
} as const;

const TYPES_NAVIGATION_COPY = {
    group: 'File types',
    name: 'Show File types',
    desc: 'Browse Markdown, Bases, Canvas and other whole-file categories. Uses file metadata only; tasks and other items inside notes are not indexed.'
} as const;

/** Builds native settings definitions for the fork-specific TPS integration destination. */
export function createTpsIntegrationSettingDefinitions(context: SettingsTabContext): SettingDefinitionItem[] {
    const typeItems: NonNullable<SettingDefinitionGroup['items']> = [
        createRenderDefinition({
            name: TYPES_NAVIGATION_COPY.name,
            desc: TYPES_NAVIGATION_COPY.desc,
            aliases: ['File types', 'Markdown', 'Bases', 'Canvas', 'PDFs', 'Images', 'Audio', 'Video'],
            render: setting => renderTpsTypesNavigationEnabledSetting(setting, context)
        })
    ];
    const setupItems: NonNullable<SettingDefinitionGroup['items']> = [
        createRenderDefinition({
            name: UPSTREAM_IMPORT_COPY.name,
            desc: UPSTREAM_IMPORT_COPY.desc,
            aliases: [UPSTREAM_IMPORT_COPY.button, 'Notebook Navigator import'],
            render: setting => renderUpstreamSettingsImportSetting(setting, context)
        })
    ];

    return [createGroupDefinition(TYPES_NAVIGATION_COPY.group, typeItems), createGroupDefinition(UPSTREAM_IMPORT_COPY.group, setupItems)];
}

/** Shared renderer for the file-type navigation control. */
export function renderTpsTypesNavigationEnabledSetting(setting: Setting, context: SettingsTabContext): void {
    const { plugin } = context;
    setting
        .setName(TYPES_NAVIGATION_COPY.name)
        .setDesc(TYPES_NAVIGATION_COPY.desc)
        .addToggle(toggle =>
            toggle.setValue(plugin.settings.tpsFileTypesNavigationEnabled).onChange(async value => {
                plugin.settings.tpsFileTypesNavigationEnabled = value;
                await plugin.saveSettingsAndUpdate();
                context.refreshSettingsDomState();
            })
        );
}

/** Shared row renderer used by both native settings pages and the legacy settings fallback. */
export function renderUpstreamSettingsImportSetting(setting: Setting, context: SettingsTabContext): void {
    const { app, plugin } = context;

    setting
        .setName(UPSTREAM_IMPORT_COPY.name)
        .setDesc(UPSTREAM_IMPORT_COPY.desc)
        .addButton(button => {
            button.setButtonText(UPSTREAM_IMPORT_COPY.button);
            button.onClick(() => {
                new ConfirmModal(
                    app,
                    UPSTREAM_IMPORT_COPY.confirmTitle,
                    UPSTREAM_IMPORT_COPY.confirmMessage,
                    async () => {
                        button.setDisabled(true);
                        try {
                            const result = await plugin.importUpstreamNotebookNavigatorSettings();
                            if (result === 'missing') {
                                showNotice(UPSTREAM_IMPORT_COPY.missing, { variant: 'warning' });
                                return;
                            }
                            showNotice(UPSTREAM_IMPORT_COPY.success, { variant: 'success' });
                        } catch (error) {
                            console.error('[TPS Notebook Navigator] Upstream settings import failed', error);
                            const message = error instanceof Error ? error.message : 'Unknown error';
                            showNotice(UPSTREAM_IMPORT_COPY.failed.replace('{message}', message), { variant: 'warning' });
                        } finally {
                            button.setDisabled(false);
                        }
                    },
                    UPSTREAM_IMPORT_COPY.confirmButton,
                    { confirmButtonClass: 'mod-cta' }
                ).open();
            });
        });
}
