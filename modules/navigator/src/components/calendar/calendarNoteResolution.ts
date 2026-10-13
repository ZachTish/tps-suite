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

import { TFile, normalizePath, type App, type MetadataCache } from 'obsidian';
import type { NotebookNavigatorSettings } from '../../settings/types';
import { DEFAULT_CALENDAR_CUSTOM_FILE_PATTERN, escapeMomentLiteralPath } from '../../utils/calendarCustomNotePatterns';
import { isPathInExcludedFolder } from '../../utils/fileFilters';
import {
    buildCustomCalendarFilePathForPattern,
    buildCustomCalendarMomentPattern,
    getCalendarNoteConfig,
    resolveCalendarCustomNotePathDate
} from '../../utils/calendarNotes';
import type { MomentApi, MomentInstance } from '../../utils/moment';
import { resolveDailyNoteFileDateReference, type DailyNoteSettings } from '../../utils/dailyNotes';
import type { CalendarNoteTarget, CustomCalendarNoteConfig, CustomCalendarNoteKind } from './types';

export interface CalendarNotePathResolverContext {
    config: CustomCalendarNoteConfig;
    momentPattern: string;
}

export interface ResolvedCalendarNotePath {
    folderPath: string;
    fileName: string;
    filePath: string;
}

export interface CalendarNoteRootFolderSettings {
    calendarCustomRootFolder: string;
}

/**
 * Refreshes Core Daily Note lookups after Obsidian finishes resolving metadata.
 *
 * The immediate refresh closes the window where metadata became ready between
 * the calendar's first render and this listener being registered. The caller's
 * existing scheduler coalesces it with a nearby `resolved` event.
 */
export function registerCalendarDailyNoteReadinessRefresh(
    metadataCache: Pick<MetadataCache, 'on' | 'offref'>,
    onRefresh: () => void
): () => void {
    const ref = metadataCache.on('resolved', onRefresh);
    onRefresh();
    return () => {
        metadataCache.offref(ref);
    };
}

interface ResolveCoreDailyNoteDateFromFileOptions {
    app: App;
    file: Pick<TFile, 'path' | 'basename'>;
    settings: DailyNoteSettings;
    momentApi: MomentApi;
    locale: string;
}

/**
 * Resolves an active Core Daily Note file to its date. GCM v3 is
 * authoritative for canonical and legacy files; local format parsing is used
 * only when GCM is absent.
 */
export function resolveCoreDailyNoteDateFromFile({
    app,
    file,
    settings,
    momentApi,
    locale
}: ResolveCoreDailyNoteDateFromFileOptions): MomentInstance | null {
    const providerDate = resolveDailyNoteFileDateReference(app, file);
    if (providerDate.status === 'blocked') {
        return null;
    }
    if (providerDate.status === 'ready') {
        if (!providerDate.isoDate) {
            return null;
        }
        const parsedProviderDate = momentApi(providerDate.isoDate, 'YYYY-MM-DD', locale, true);
        return parsedProviderDate.isValid() ? parsedProviderDate.startOf('day') : null;
    }

    const normalizedFilePath = normalizePath(file.path);
    const pathWithoutExtension = stripMarkdownExtension(normalizedFilePath);
    const folderPattern = escapeMomentLiteralPath(settings.folder);
    const fullPattern = folderPattern ? `${folderPattern}/${settings.format}` : settings.format;
    const parsedDate = momentApi(pathWithoutExtension, fullPattern, locale, true);
    if (!parsedDate.isValid()) {
        return null;
    }

    const normalizedFolder = normalizePath(settings.folder.trim()).replace(/^\/+|\/+$/gu, '');
    const expectedPathWithoutExtension = normalizePath(
        normalizedFolder ? `${normalizedFolder}/${parsedDate.format(settings.format)}` : parsedDate.format(settings.format)
    );
    return `${expectedPathWithoutExtension}.md` === normalizedFilePath ? parsedDate.startOf('day') : null;
}

interface ResolveCalendarNoteTargetOptions {
    existingFile: TFile | null;
    targetPath: string | null;
    hiddenFolders: string[];
    showHiddenItems: boolean;
    isExistingFileVisible: (file: TFile) => boolean;
}

interface ResolveCalendarNotePathOptions {
    kind: CustomCalendarNoteKind;
    date: MomentInstance;
    resolverContext: CalendarNotePathResolverContext;
    calendarLocale: string;
    weekLocale: string;
    customCalendarRootFolderSettings: CalendarNoteRootFolderSettings;
    momentApi: MomentApi | null;
}

interface ParseCalendarNoteDateFromPathOptions extends Omit<ResolveCalendarNotePathOptions, 'date'> {
    filePath: string;
    parseLocale: string;
}

function stripMarkdownExtension(path: string): string {
    return path.replace(/\.md$/iu, '');
}

function normalizeVaultRelativePath(path: string): string {
    return normalizePath(path).replace(/^\/+/u, '').replace(/\/+$/u, '');
}

function stripMomentLiterals(pattern: string): string {
    let result = '';
    let inLiteral = false;

    for (const character of pattern) {
        if (character === '[') {
            inLiteral = true;
            continue;
        }

        if (character === ']') {
            inLiteral = false;
            continue;
        }

        if (!inLiteral) {
            result += character;
        }
    }

    return result;
}

function hasWeekParseTokens(pattern: string): boolean {
    const tokenSource = stripMomentLiterals(pattern);
    return /[YgG]/u.test(tokenSource) && /[wW]/u.test(tokenSource);
}

function getCalendarNotePathRelativeToRoot(filePath: string, rootFolder: string): string | null {
    const normalizedPath = normalizeVaultRelativePath(filePath);
    const normalizedRootFolder = normalizeVaultRelativePath(rootFolder);

    if (!normalizedRootFolder) {
        return normalizedPath;
    }

    if (normalizedPath === normalizedRootFolder) {
        return '';
    }

    if (!normalizedPath.startsWith(`${normalizedRootFolder}/`)) {
        return null;
    }

    return normalizedPath.slice(normalizedRootFolder.length + 1);
}

function parseWeeklyCalendarNoteDateFromPath({
    filePath,
    resolverContext,
    parseLocale,
    calendarLocale,
    weekLocale,
    customCalendarRootFolderSettings,
    momentApi
}: Omit<ParseCalendarNoteDateFromPathOptions, 'momentApi'> & { momentApi: MomentApi }): MomentInstance | null {
    const pathWithoutExtension = stripMarkdownExtension(filePath);
    const relativePath = getCalendarNotePathRelativeToRoot(pathWithoutExtension, customCalendarRootFolderSettings.calendarCustomRootFolder);
    if (!relativePath) {
        return null;
    }

    const patternSegments = resolverContext.momentPattern.split('/').filter(Boolean);
    const pathSegments = relativePath.split('/').filter(Boolean);
    if (patternSegments.length !== pathSegments.length) {
        return null;
    }

    for (let startIndex = patternSegments.length - 1; startIndex >= 0; startIndex--) {
        const suffixPattern = patternSegments.slice(startIndex).join('/');
        if (!hasWeekParseTokens(suffixPattern)) {
            continue;
        }

        const suffixPath = pathSegments.slice(startIndex).join('/');
        const parsedDate = momentApi(suffixPath, suffixPattern, parseLocale, true);
        if (!parsedDate.isValid()) {
            continue;
        }

        const resolved = resolveCalendarNotePath({
            kind: 'week',
            date: parsedDate,
            resolverContext,
            calendarLocale,
            weekLocale,
            customCalendarRootFolderSettings,
            momentApi
        });
        if (resolved?.filePath === filePath) {
            return parsedDate;
        }
    }

    return null;
}

export function createCalendarNotePathResolverContext(
    kind: CustomCalendarNoteKind,
    settings: NotebookNavigatorSettings
): CalendarNotePathResolverContext {
    const config = getCalendarNoteConfig(kind, settings);
    const momentPattern = buildCustomCalendarMomentPattern(config.calendarCustomFilePattern, config.fallbackPattern);
    return { config, momentPattern };
}

export function resolveCalendarNotePath({
    kind,
    date,
    resolverContext,
    calendarLocale,
    weekLocale,
    customCalendarRootFolderSettings,
    momentApi
}: ResolveCalendarNotePathOptions): ResolvedCalendarNotePath | null {
    const { config, momentPattern } = resolverContext;
    if (!config.isPatternValid(momentPattern, momentApi)) {
        return null;
    }

    const dateForPath = resolveCalendarCustomNotePathDate(kind, date, momentPattern, calendarLocale, weekLocale);
    return buildCustomCalendarFilePathForPattern(
        dateForPath,
        customCalendarRootFolderSettings,
        config.calendarCustomFilePattern,
        config.fallbackPattern
    );
}

/**
 * Resolves the four calendar target states without discarding an existing hidden file.
 *
 * - Existing and visible: both file fields contain the file and actions may open it.
 * - Existing and hidden: only `existingFile` contains the file and actions are blocked.
 * - Missing and visible: both file fields are null and actions may create the target.
 * - Missing and hidden: both file fields are null and actions are blocked because the destination folder is hidden.
 */
export function resolveCalendarNoteTarget({
    existingFile,
    targetPath,
    hiddenFolders,
    showHiddenItems,
    isExistingFileVisible
}: ResolveCalendarNoteTargetOptions): CalendarNoteTarget {
    const isHidden =
        !showHiddenItems &&
        ((targetPath !== null && hiddenFolders.length > 0 && isPathInExcludedFolder(targetPath, hiddenFolders)) ||
            (existingFile !== null && !isExistingFileVisible(existingFile)));

    return {
        existingFile,
        visibleFile: isHidden ? null : existingFile,
        isHidden,
        targetPath
    };
}

export function parseCalendarNoteDateFromPath({
    filePath,
    kind,
    resolverContext,
    calendarLocale,
    weekLocale,
    customCalendarRootFolderSettings,
    momentApi,
    parseLocale
}: ParseCalendarNoteDateFromPathOptions): MomentInstance | null {
    if (!momentApi || !filePath.toLowerCase().endsWith('.md')) {
        return null;
    }

    const normalizedFilePath = normalizePath(filePath);
    const { config, momentPattern } = resolverContext;
    if (!config.isPatternValid(momentPattern, momentApi)) {
        return null;
    }

    if (kind === 'week') {
        return parseWeeklyCalendarNoteDateFromPath({
            filePath: normalizedFilePath,
            kind,
            resolverContext,
            calendarLocale,
            weekLocale,
            customCalendarRootFolderSettings,
            momentApi,
            parseLocale
        });
    }

    const rootFolderPattern = escapeMomentLiteralPath(customCalendarRootFolderSettings.calendarCustomRootFolder);
    const fullPattern = rootFolderPattern ? `${rootFolderPattern}/${momentPattern}` : momentPattern;
    const parsedDate = momentApi(stripMarkdownExtension(normalizedFilePath), fullPattern, parseLocale, true);
    if (!parsedDate.isValid()) {
        return null;
    }

    const resolved = resolveCalendarNotePath({
        kind,
        date: parsedDate,
        resolverContext,
        calendarLocale,
        weekLocale,
        customCalendarRootFolderSettings,
        momentApi
    });
    if (!resolved || resolved.filePath !== normalizedFilePath) {
        return null;
    }

    return parsedDate;
}

/**
 * Vault-event filtering must not rely on reverse-parsing formatted note paths: valid custom patterns can include
 * conflicting date tokens. Year-first patterns safely rule out ordinary non-year folders without reading a file.
 */
export function isConfiguredCustomCalendarNotePath({
    filePath,
    settings,
    customCalendarRootFolderSettings
}: {
    filePath: string;
    settings: NotebookNavigatorSettings;
    customCalendarRootFolderSettings: CalendarNoteRootFolderSettings;
}): boolean {
    if (!filePath.toLowerCase().endsWith('.md')) {
        return false;
    }

    const relativePath = getCalendarNotePathRelativeToRoot(filePath, customCalendarRootFolderSettings.calendarCustomRootFolder);
    if (relativePath === null) {
        return false;
    }
    const patterns = [
        settings.calendarCustomFilePattern.trim() || DEFAULT_CALENDAR_CUSTOM_FILE_PATTERN,
        settings.calendarCustomWeekPattern.trim(),
        settings.calendarCustomMonthPattern.trim(),
        settings.calendarCustomQuarterPattern.trim(),
        settings.calendarCustomYearPattern.trim()
    ].filter(Boolean);
    const allYearFirst = patterns.every(pattern => /^(?:YYYY|GGGG|gggg)(?:\/|$)/u.test(pattern));
    return !allYearFirst || /\p{Nd}/u.test(relativePath.split('/')[0] ?? '');
}

/** Filters vault events before refreshing custom-calendar year lookups. */
export function shouldRefreshCalendarForVaultFileChange({
    file,
    oldPath,
    settings,
    customCalendarRootFolderSettings,
    momentApi
}: {
    file: unknown;
    oldPath?: string;
    settings: NotebookNavigatorSettings;
    customCalendarRootFolderSettings: CalendarNoteRootFolderSettings;
    momentApi: MomentApi | null;
}): boolean {
    // Folder moves can move calendar notes without individual file rename events.
    if (!(file instanceof TFile)) {
        return true;
    }
    if (file.extension !== 'md' && !oldPath?.toLowerCase().endsWith('.md')) {
        return false;
    }
    // Daily Notes mode retains its existing provider and metadata readiness behavior.
    if (settings.calendarIntegrationMode !== 'notebook-navigator' || !momentApi) {
        return true;
    }

    const paths = oldPath ? [file.path, oldPath] : [file.path];
    return paths.some(filePath =>
        isConfiguredCustomCalendarNotePath({
            filePath,
            settings,
            customCalendarRootFolderSettings
        })
    );
}

export function shouldRefreshCalendarForGcmApiChange(mode: NotebookNavigatorSettings['calendarIntegrationMode']): boolean {
    return mode === 'daily-notes';
}
