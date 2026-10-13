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

import { App, Plugin, TFile, TFolder } from 'obsidian';
import { TEMPLATER_PLUGIN_ID } from '../constants/pluginIds';
import { getPluginById, getRecordValue, isRecord } from './typeGuards';

export type TemplaterCreateNewNoteFromTemplateFn = (folder?: TFolder) => void | Promise<void>;
export type TemplaterCreateNoteFromTemplateFn = (
    template: TFile | string,
    folder?: TFolder | string,
    filename?: string,
    openNewNote?: boolean
) => Promise<TFile | undefined>;
export type TemplaterOverwriteFileCommandsFn = (file: TFile, activeFile?: boolean) => Promise<void>;

export interface TemplaterFileCreationProcessor {
    /**
     * `auto` means Templater owns its file-create hook. Notebook Navigator
     * waits for that hook and must not invoke the processor a second time.
     */
    mode: 'auto' | 'manual';
    finish(file: TFile, createStartedAt: number): Promise<void>;
}

const TEMPLATER_CREATE_HOOK_DELAY_MS = 300;
const TEMPLATER_CREATE_HOOK_SETTLE_BUFFER_MS = 100;
const TEMPLATER_CREATE_HOOK_POLL_MS = 25;
const TEMPLATER_CREATE_HOOK_TIMEOUT_MS = 5_000;

type TemplaterCreateNoteFromTemplateApiFn = (
    template: TFile | string,
    folder?: TFolder | string,
    filename?: string,
    openNewNote?: boolean
) => TFile | Promise<TFile | undefined> | undefined;

interface TemplaterFuzzySuggesterApi {
    create_new_note_from_template: TemplaterCreateNewNoteFromTemplateFn;
}

interface TemplaterCoreApi {
    create_new_note_from_template: TemplaterCreateNoteFromTemplateApiFn;
    overwrite_file_commands?: (file: TFile, activeFile?: boolean) => void | Promise<void>;
}

interface TemplaterFuzzySuggesterPluginApi extends Plugin {
    fuzzy_suggester: TemplaterFuzzySuggesterApi;
}

interface TemplaterCorePluginApi extends Plugin {
    templater: TemplaterCoreApi;
}

function normalizeFolderPath(value: unknown): string {
    return typeof value === 'string' ? value.trim().replace(/^\/+|\/+$/gu, '') : '';
}

function getTemplaterSettings(plugin: Plugin): Record<string, unknown> {
    const directSettings = getRecordValue(plugin, 'settings');
    if (isRecord(directSettings)) {
        return directSettings;
    }

    const templater = getRecordValue(plugin, 'templater');
    const ownerPlugin = isRecord(templater) ? getRecordValue(templater, 'plugin') : null;
    const ownerSettings = isRecord(ownerPlugin) ? getRecordValue(ownerPlugin, 'settings') : null;
    return isRecord(ownerSettings) ? ownerSettings : {};
}

function isTemplaterAutoCreateEnabled(app: App, plugin: Plugin): boolean {
    try {
        const localSettings: unknown = app.loadLocalStorage('templater-local-settings');
        if (isRecord(localSettings)) {
            const localValue = getRecordValue(localSettings, 'trigger_on_file_creation');
            if (typeof localValue === 'boolean') {
                return localValue;
            }
        }
    } catch {
        // Fall back to Templater's legacy synchronized setting.
    }

    return getRecordValue(getTemplaterSettings(plugin), 'trigger_on_file_creation') === true;
}

function isTemplaterAutoCreateEligible(filePath: string, plugin: Plugin): boolean {
    const settings = getTemplaterSettings(plugin);
    const templateFolder = normalizeFolderPath(getRecordValue(settings, 'templates_folder'));
    // Mirror Templater's current create-hook guards exactly. Boundary-aware
    // matching here would disagree on lookalike paths and could wait for a
    // hook that Templater intentionally skipped.
    if (templateFolder && filePath.includes(templateFolder)) {
        return false;
    }

    const ignoredFolders = getRecordValue(settings, 'ignore_folders_on_creation');
    if (!Array.isArray(ignoredFolders)) {
        return true;
    }

    return !(ignoredFolders as unknown[]).some((entry: unknown) => {
        const folder = isRecord(entry) ? getRecordValue(entry, 'folder') : entry;
        const ignoredPath = normalizeFolderPath(folder);
        return Boolean(ignoredPath && filePath.startsWith(ignoredPath));
    });
}

async function delay(milliseconds: number): Promise<void> {
    await new Promise<void>(resolve => {
        window.setTimeout(resolve, Math.max(0, milliseconds));
    });
}

async function waitForTemplaterAutoCreate(app: App, file: TFile, createStartedAt: number): Promise<void> {
    const settleAfter = createStartedAt + TEMPLATER_CREATE_HOOK_DELAY_MS + TEMPLATER_CREATE_HOOK_SETTLE_BUFFER_MS;
    const initialWait = settleAfter - Date.now();
    if (initialWait > 0) {
        await delay(initialWait);
    }

    const deadline = Date.now() + TEMPLATER_CREATE_HOOK_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const plugin = getPluginById(app, TEMPLATER_PLUGIN_ID);
        if (!plugin) {
            throw new Error('Templater became unavailable while processing the Daily Note template.');
        }
        const templater = getRecordValue(plugin, 'templater');
        const pendingFiles = isRecord(templater) ? getRecordValue(templater, 'files_with_pending_templates') : null;
        const hasPendingFile =
            isRecord(pendingFiles) && typeof pendingFiles.has === 'function'
                ? Boolean(pendingFiles.has.call(pendingFiles, file.path))
                : false;
        if (!hasPendingFile) {
            // The create hook is delayed by Templater. Once its delay and
            // settle buffer have elapsed and the path is no longer pending,
            // the hook owns the result even if its output intentionally
            // contains a literal <% ... %> example.
            return;
        }
        await delay(TEMPLATER_CREATE_HOOK_POLL_MS);
    }

    throw new Error('Templater did not finish its Daily Note file-create hook before the timeout.');
}

export function isTemplaterFileCreationPending(app: App, filePath: string): boolean {
    const plugin = getPluginById(app, TEMPLATER_PLUGIN_ID);
    const templater = plugin ? getRecordValue(plugin, 'templater') : null;
    const pendingFiles = isRecord(templater) ? getRecordValue(templater, 'files_with_pending_templates') : null;
    return isRecord(pendingFiles) && typeof pendingFiles.has === 'function'
        ? Boolean(pendingFiles.has.call(pendingFiles, filePath))
        : false;
}

function isTemplaterFuzzySuggesterPlugin(plugin: Plugin | null): plugin is TemplaterFuzzySuggesterPluginApi {
    if (!plugin) {
        return false;
    }

    const fuzzySuggester = getRecordValue(plugin, 'fuzzy_suggester');
    if (!isRecord(fuzzySuggester)) {
        return false;
    }

    const createNewNoteFromTemplate = getRecordValue(fuzzySuggester, 'create_new_note_from_template');
    return typeof createNewNoteFromTemplate === 'function';
}

function isTemplaterCorePlugin(plugin: Plugin | null): plugin is TemplaterCorePluginApi {
    if (!plugin) {
        return false;
    }

    const templater = getRecordValue(plugin, 'templater');
    if (!isRecord(templater)) {
        return false;
    }

    const createNoteFromTemplate = getRecordValue(templater, 'create_new_note_from_template');
    return typeof createNoteFromTemplate === 'function';
}

export function getTemplaterCreateNewNoteFromTemplate(app: App): TemplaterCreateNewNoteFromTemplateFn | null {
    if (!isTemplaterFuzzySuggesterPlugin(getPluginById(app, TEMPLATER_PLUGIN_ID))) {
        return null;
    }

    return (folder?: TFolder) => {
        const plugin = getPluginById(app, TEMPLATER_PLUGIN_ID);
        if (!isTemplaterFuzzySuggesterPlugin(plugin)) {
            return;
        }

        return plugin.fuzzy_suggester.create_new_note_from_template(folder);
    };
}

export function getTemplaterCreateNoteFromTemplate(app: App): TemplaterCreateNoteFromTemplateFn | null {
    if (!isTemplaterCorePlugin(getPluginById(app, TEMPLATER_PLUGIN_ID))) {
        return null;
    }

    return async (template: TFile | string, folder?: TFolder | string, filename?: string, openNewNote?: boolean) => {
        const plugin = getPluginById(app, TEMPLATER_PLUGIN_ID);
        if (!isTemplaterCorePlugin(plugin)) {
            return undefined;
        }

        return await plugin.templater.create_new_note_from_template(template, folder, filename, openNewNote);
    };
}

export function getTemplaterOverwriteFileCommands(app: App): TemplaterOverwriteFileCommandsFn | null {
    const plugin = getPluginById(app, TEMPLATER_PLUGIN_ID);
    if (!plugin) {
        return null;
    }

    const templater = getRecordValue(plugin, 'templater');
    if (!isRecord(templater)) {
        return null;
    }
    const overwriteFileCommands = getRecordValue(templater, 'overwrite_file_commands');
    if (typeof overwriteFileCommands !== 'function') {
        return null;
    }

    return async (file: TFile, activeFile = false) => {
        const currentPlugin = getPluginById(app, TEMPLATER_PLUGIN_ID);
        if (!currentPlugin) {
            throw new Error('Templater became unavailable before processing the Daily Note template.');
        }
        const currentTemplater = getRecordValue(currentPlugin, 'templater');
        if (!isRecord(currentTemplater)) {
            throw new Error('Templater became unavailable before processing the Daily Note template.');
        }
        const currentOverwrite = getRecordValue(currentTemplater, 'overwrite_file_commands');
        if (typeof currentOverwrite !== 'function') {
            throw new Error('Templater became unavailable before processing the Daily Note template.');
        }
        await currentOverwrite.call(currentTemplater, file, activeFile);
    };
}

/**
 * Returns one execution owner for an exact-path file creation. Device-local
 * auto-create settings are honored when available; otherwise Navigator runs
 * one explicit callable Templater pass. The returned processor never retries
 * based on residual delimiter text.
 */
export function getTemplaterFileCreationProcessor(app: App, targetPath: string): TemplaterFileCreationProcessor | null {
    const plugin = getPluginById(app, TEMPLATER_PLUGIN_ID);
    const overwriteFileCommands = getTemplaterOverwriteFileCommands(app);
    if (!plugin || !overwriteFileCommands) {
        return null;
    }

    const autoCreate =
        isTemplaterFileCreationPending(app, targetPath) ||
        (isTemplaterAutoCreateEnabled(app, plugin) && isTemplaterAutoCreateEligible(targetPath, plugin));
    if (autoCreate) {
        return {
            mode: 'auto',
            finish: (file, createStartedAt) => waitForTemplaterAutoCreate(app, file, createStartedAt)
        };
    }

    return {
        mode: 'manual',
        finish: async file => {
            await overwriteFileCommands(file, false);
        }
    };
}

/** Returns only the passive auto-create owner, without opting a blank file into a manual Templater pass. */
export function getTemplaterAutoFileCreationProcessor(app: App, targetPath: string): TemplaterFileCreationProcessor | null {
    const plugin = getPluginById(app, TEMPLATER_PLUGIN_ID);
    if (
        !plugin ||
        !getTemplaterOverwriteFileCommands(app) ||
        !isTemplaterAutoCreateEnabled(app, plugin) ||
        !isTemplaterAutoCreateEligible(targetPath, plugin)
    ) {
        return null;
    }

    return {
        mode: 'auto',
        finish: (file, createStartedAt) => waitForTemplaterAutoCreate(app, file, createStartedAt)
    };
}
