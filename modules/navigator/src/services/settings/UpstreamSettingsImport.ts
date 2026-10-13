/*
 * TPS Notebook Navigator - Plugin for Obsidian
 * Based on Notebook Navigator by Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import type { NotebookNavigatorSettings } from '../../settings/types';
import { DEFAULT_SETTINGS } from '../../settings/defaultSettings';
import { isRecord } from '../../utils/typeGuards';
import { UPSTREAM_NOTEBOOK_NAVIGATOR_PLUGIN_ID } from '../../constants/tpsIdentity';

const UPSTREAM_NOTEBOOK_NAVIGATOR_SETTINGS_RELATIVE_PATH = `plugins/${UPSTREAM_NOTEBOOK_NAVIGATOR_PLUGIN_ID}/data.json`;

/** Resolves the only upstream resource the one-way importer is allowed to inspect. */
export function getUpstreamNotebookNavigatorSettingsPath(configDir: string): string {
    const normalizedConfigDir = configDir.replace(/\/+$/u, '');
    return `${normalizedConfigDir}/${UPSTREAM_NOTEBOOK_NAVIGATOR_SETTINGS_RELATIVE_PATH}`;
}

export interface UpstreamSettingsReadAdapter {
    exists(path: string): Promise<boolean>;
    read(path: string): Promise<string>;
}

export type PreparedUpstreamSettingsImport = { status: 'missing' } | { status: 'ready'; settingsRecord: Record<string, unknown> };

export type UpstreamSettingsImportErrorCode = 'read-failed' | 'malformed-json' | 'invalid-root';

export class UpstreamSettingsImportError extends Error {
    public readonly cause?: unknown;

    constructor(
        public readonly code: UpstreamSettingsImportErrorCode,
        message: string,
        cause?: unknown
    ) {
        super(message);
        this.name = 'UpstreamSettingsImportError';
        this.cause = cause;
    }
}

const INVALID_VALUE: unique symbol = Symbol('invalid-upstream-setting-value');
const UNSAFE_RECORD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const TPS_ONLY_SETTING_KEYS = new Set([
    'lastShownVersion',
    'tpsDataArchitectureMode',
    'tpsTypesPauseMigrationVersion',
    'tpsLinePropertyInheritanceVersion',
    'tpsTypesNavigationEnabled',
    'tpsFileTypesNavigationEnabled',
    'typeNavigationSortOrder',
    'typeAppearances',
    'typeSortOverrides',
    'rootTypeOrder',
    'tpsResourceCreationTarget',
    'tpsResourceCreationSpecificFile',
    'tpsGcmTaskRowsEnabled',
    'tpsGcmTaskRowsIncludeCompleted',
    'tpsGcmTaskRowsPerNote'
]);

interface SanitizedRecord {
    [key: string]: SanitizedValue;
}

type SanitizedValue = null | boolean | number | string | SanitizedValue[] | SanitizedRecord;

function cloneSanitizedValue(value: unknown): SanitizedValue | typeof INVALID_VALUE {
    if (value === null || typeof value === 'boolean' || typeof value === 'string') {
        return value;
    }

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : INVALID_VALUE;
    }

    if (Array.isArray(value)) {
        const cloned: SanitizedValue[] = [];
        for (const item of value) {
            const sanitized = cloneSanitizedValue(item);
            if (sanitized === INVALID_VALUE) {
                return INVALID_VALUE;
            }
            cloned.push(sanitized);
        }
        return cloned;
    }

    if (!isRecord(value)) {
        return INVALID_VALUE;
    }

    const cloned = Object.create(null) as SanitizedRecord;
    for (const [key, child] of Object.entries(value)) {
        if (UNSAFE_RECORD_KEYS.has(key)) {
            continue;
        }
        const sanitized = cloneSanitizedValue(child);
        if (sanitized !== INVALID_VALUE) {
            cloned[key] = sanitized;
        }
    }
    return cloned;
}

function isSanitizedRecord(value: unknown): value is SanitizedRecord {
    return isRecord(value);
}

function mergeSanitizedValue(currentValue: unknown, upstreamValue: SanitizedValue): SanitizedValue {
    if (!isRecord(currentValue) || !isRecord(upstreamValue)) {
        return upstreamValue;
    }

    const currentClone = cloneSanitizedValue(currentValue);
    const merged: SanitizedRecord =
        currentClone !== INVALID_VALUE && isSanitizedRecord(currentClone) ? currentClone : (Object.create(null) as SanitizedRecord);

    for (const [key, value] of Object.entries(upstreamValue)) {
        if (UNSAFE_RECORD_KEYS.has(key)) {
            continue;
        }
        merged[key] = mergeSanitizedValue(merged[key], value);
    }
    return merged;
}

/**
 * Creates a detached, structurally safe settings record for the normal settings controller to validate.
 * Only settings known to this TPS build are imported. Missing keys retain their current TPS values, nested
 * records merge recursively, and arrays replace their matching setting as independent copies.
 */
export function mergeUpstreamSettingsIntoCurrent(
    currentSettings: NotebookNavigatorSettings,
    upstreamSettings: Record<string, unknown>
): Record<string, unknown> {
    const currentClone = cloneSanitizedValue(currentSettings);
    if (currentClone === INVALID_VALUE || !isSanitizedRecord(currentClone)) {
        throw new UpstreamSettingsImportError('invalid-root', 'Current TPS Notebook Navigator settings are not a valid record.');
    }

    const merged = currentClone;
    const knownKeys = new Set(Object.keys(DEFAULT_SETTINGS));

    for (const [key, value] of Object.entries(upstreamSettings)) {
        if (!knownKeys.has(key) || UNSAFE_RECORD_KEYS.has(key) || TPS_ONLY_SETTING_KEYS.has(key)) {
            continue;
        }
        const sanitized = cloneSanitizedValue(value);
        if (sanitized === INVALID_VALUE) {
            continue;
        }
        merged[key] = mergeSanitizedValue(merged[key], sanitized);
    }

    return merged;
}

/**
 * Reads and prepares upstream settings without mutating either plugin. This function deliberately exposes only
 * read capabilities and never enumerates, writes, renames, or deletes anything in the upstream plugin folder.
 */
export async function prepareUpstreamSettingsImport(
    adapter: UpstreamSettingsReadAdapter,
    currentSettings: NotebookNavigatorSettings,
    configDir: string
): Promise<PreparedUpstreamSettingsImport> {
    const upstreamSettingsPath = getUpstreamNotebookNavigatorSettingsPath(configDir);
    let exists: boolean;
    try {
        exists = await adapter.exists(upstreamSettingsPath);
    } catch (error) {
        throw new UpstreamSettingsImportError('read-failed', 'Could not check the upstream settings file.', error);
    }

    if (!exists) {
        return { status: 'missing' };
    }

    let raw: string;
    try {
        raw = await adapter.read(upstreamSettingsPath);
    } catch (error) {
        throw new UpstreamSettingsImportError('read-failed', 'Could not read the upstream settings file.', error);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw) as unknown;
    } catch (error) {
        throw new UpstreamSettingsImportError('malformed-json', 'The upstream settings file is not valid JSON.', error);
    }

    if (!isRecord(parsed)) {
        throw new UpstreamSettingsImportError('invalid-root', 'The upstream settings file must contain a settings object.');
    }

    return {
        status: 'ready',
        settingsRecord: mergeUpstreamSettingsIntoCurrent(currentSettings, parsed)
    };
}
