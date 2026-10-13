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

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { strings } from '../i18n';
import { resolveGcmDailyNotesApi } from '../integrations/gcm/gcmDailyNotesApi';
import { getInternalPlugin } from './typeGuards';
import { isPlainObjectRecordValue, isStringRecordValue } from './recordUtils';
import { getMomentApi, type MomentInstance } from './moment';
import { showNotice } from './noticeUtils';
import {
    getTemplaterAutoFileCreationProcessor,
    getTemplaterFileCreationProcessor,
    isTemplaterFileCreationPending,
    type TemplaterFileCreationProcessor
} from './templaterIntegration';
import { prepareTpsTemplateInstanceSource, sanitizeTpsTemplateInstanceFile } from './tpsTemplateIdentity';

const DAILY_NOTES_PLUGIN_ID = 'daily-notes';
const DEFAULT_DAILY_NOTE_FORMAT = 'YYYY-MM-DD';
const TEMPLATER_COMMAND_PATTERN = /<%[\s\S]*?%>/u;
const RECENT_DAILY_NOTE_CREATION_WINDOW_MS = 10_000;
const INCOMPLETE_DAILY_NOTE_TEMPLATE_MARKER = '<!-- tps-daily-note-template-incomplete:v1 -->';

interface PendingDailyNoteCreate {
    promise: Promise<TFile | null>;
    constrained: boolean;
}

const pendingDailyNoteCreates = new WeakMap<App, Map<string, PendingDailyNoteCreate>>();
const coherentDailyNoteSettingsCache = new WeakMap<App, DailyNoteSettings>();

interface DailyNoteRuntimeObservation {
    signature: string;
    startupRecoveryAllowed: boolean;
}

const dailyNoteRuntimeObservations = new WeakMap<App, DailyNoteRuntimeObservation>();

interface FailedOwnedDailyNote {
    file: TFile;
    unchangedContents: string;
}

const failedOwnedDailyNoteFiles = new WeakMap<App, Map<string, FailedOwnedDailyNote>>();

export interface DailyNoteSettings {
    folder: string;
    format: string;
    template: string;
}

export type DailyNoteReference = { status: 'blocked'; file: null; path: null } | { status: 'ready'; file: TFile | null; path: string };

export type DailyNoteFileDateReference =
    { status: 'absent'; isoDate: null } | { status: 'blocked'; isoDate: null } | { status: 'ready'; isoDate: string | null };

export interface CreateDailyNoteOptions {
    /**
     * A render-time Core snapshot to enforce after a confirmation dialog.
     * Ordinary callers omit this so creation owns a fresh Core snapshot.
     */
    expectedSettings?: DailyNoteSettings;
    /**
     * The exact target shown or otherwise approved by a preflight-sensitive
     * caller. GCM v4 and the standalone creator both revalidate this path at
     * their mutation boundary.
     */
    expectedPath?: string;
}

interface DailyNotesInternalPlugin {
    enabled?: boolean;
    instance?: {
        options?: unknown;
    };
}

export interface ConfiguredDailyNoteTemplate {
    path: string;
    dateFormat: string;
}

interface DailyNoteTemplateInfo {
    file: TFile | null;
    contents: string;
    foldInfo: unknown;
}

interface FoldManager {
    load: (file: TFile) => unknown;
    save: (file: TFile, foldInfo: unknown) => void;
}

type DailyNotesDeltaUnit = 'y' | 'Q' | 'M' | 'm' | 'w' | 'd' | 'h' | 's';

/** Normalizes date/time delta units used in daily note templates to moment-compatible units */
function normalizeDailyNotesDeltaUnit(value: string): DailyNotesDeltaUnit | null {
    switch (value) {
        case 'y':
        case 'Y':
            return 'y';
        case 'q':
        case 'Q':
            return 'Q';
        case 'm':
            return 'm';
        case 'M':
            return 'M';
        case 'w':
        case 'W':
            return 'w';
        case 'd':
            return 'd';
        case 'h':
        case 'H':
            return 'h';
        case 's':
        case 'S':
            return 's';
        default:
            return null;
    }
}

function isFoldManager(value: unknown): value is FoldManager {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return typeof record.load === 'function' && typeof record.save === 'function';
}

function getFoldManager(app: App): FoldManager | null {
    const maybe = (app as unknown as { foldManager?: unknown }).foldManager;
    return isFoldManager(maybe) ? maybe : null;
}

function sanitizeDailyNoteSettings(options: unknown): DailyNoteSettings {
    const record = isPlainObjectRecordValue(options) ? options : null;

    const folderRaw = record ? record['folder'] : undefined;
    const formatRaw = record ? record['format'] : undefined;
    const templateRaw = record ? record['template'] : undefined;

    const folder = isStringRecordValue(folderRaw) ? folderRaw.trim() : '';
    const template = isStringRecordValue(templateRaw) ? templateRaw.trim() : '';

    const format = isStringRecordValue(formatRaw) && formatRaw.trim() ? formatRaw.trim() : DEFAULT_DAILY_NOTE_FORMAT;

    return { folder, format, template };
}

function hasCompleteDailyNoteRuntimeOptions(options: unknown): boolean {
    if (!isPlainObjectRecordValue(options)) {
        return false;
    }
    return (
        typeof options['folder'] === 'string' &&
        typeof options['format'] === 'string' &&
        options['format'].trim().length > 0 &&
        typeof options['template'] === 'string'
    );
}

function getDailyNoteRuntimeSignature(options: unknown): string {
    if (!isPlainObjectRecordValue(options)) {
        return `incomplete:${typeof options}`;
    }
    return JSON.stringify([
        typeof options['folder'],
        options['folder'],
        typeof options['format'],
        options['format'],
        typeof options['template'],
        options['template']
    ]);
}

function isExactCoreStartupDefault(settings: DailyNoteSettings): boolean {
    return settings.folder === '' && settings.format === DEFAULT_DAILY_NOTE_FORMAT && settings.template === '';
}

function observeDailyNoteRuntimeOptions(
    app: App,
    options: unknown
): { runtime: DailyNoteSettings; complete: boolean; startupRecoveryAllowed: boolean } {
    const runtime = sanitizeDailyNoteSettings(options);
    const complete = hasCompleteDailyNoteRuntimeOptions(options);
    const signature = getDailyNoteRuntimeSignature(options);
    let observation = dailyNoteRuntimeObservations.get(app);
    if (!observation) {
        const startupShape = !complete || isExactCoreStartupDefault(runtime);
        observation = {
            signature,
            startupRecoveryAllowed: startupShape
        };
        dailyNoteRuntimeObservations.set(app, observation);
    } else if (observation.signature !== signature) {
        // Once live Core options change, including an intentional transition
        // to a blank/default template, persisted startup recovery is disabled
        // for the rest of this app session.
        observation.signature = signature;
        observation.startupRecoveryAllowed = false;
        coherentDailyNoteSettingsCache.delete(app);
    }

    return { runtime, complete, startupRecoveryAllowed: observation.startupRecoveryAllowed };
}

export function getDailyNoteSettings(app: App): DailyNoteSettings | null {
    // The Daily Notes core plugin isn't part of the public plugin API; we read its internal options defensively.
    const plugin = getInternalPlugin<DailyNotesInternalPlugin>(app, DAILY_NOTES_PLUGIN_ID);
    if (!plugin || plugin.enabled !== true) {
        return null;
    }

    const options = plugin.instance?.options;
    const observation = observeDailyNoteRuntimeOptions(app, options);
    if (observation.complete && (!isExactCoreStartupDefault(observation.runtime) || !observation.startupRecoveryAllowed)) {
        coherentDailyNoteSettingsCache.set(app, observation.runtime);
        return observation.runtime;
    }

    // Sync callers must not resolve the initial root/YYYY-MM-DD startup
    // lookalike before the persisted coherent snapshot has been read.
    return coherentDailyNoteSettingsCache.get(app) ?? null;
}

async function readPersistedDailyNoteSettings(app: App): Promise<DailyNoteSettings | null> {
    try {
        const configDir = app.vault.configDir.trim();
        if (!configDir) {
            return null;
        }
        const adapter = app.vault.adapter as unknown as { read?(path: string): Promise<string> };
        if (typeof adapter.read !== 'function') {
            return null;
        }
        const raw = await adapter.read(normalizePath(`${configDir}/daily-notes.json`));
        const parsed: unknown = JSON.parse(raw);
        return isPlainObjectRecordValue(parsed) ? sanitizeDailyNoteSettings(parsed) : null;
    } catch {
        return null;
    }
}

/**
 * Returns one coherent creation snapshot. When Core is still exposing a blank
 * startup template but disk already has a configured template, the matching
 * persisted folder and format travel with that template.
 */
export async function getConfiguredDailyNoteSettings(app: App): Promise<DailyNoteSettings | null> {
    const plugin = getInternalPlugin<DailyNotesInternalPlugin>(app, DAILY_NOTES_PLUGIN_ID);
    if (!plugin || plugin.enabled !== true) {
        return null;
    }

    const runtimeOptions = plugin.instance?.options;
    const observation = observeDailyNoteRuntimeOptions(app, runtimeOptions);
    if (observation.complete && (!isExactCoreStartupDefault(observation.runtime) || !observation.startupRecoveryAllowed)) {
        coherentDailyNoteSettingsCache.set(app, observation.runtime);
        return observation.runtime;
    }

    if (!observation.startupRecoveryAllowed) {
        return null;
    }

    const cached = coherentDailyNoteSettingsCache.get(app);
    if (cached) {
        return cached;
    }

    // Persisted settings are startup recovery for an incomplete
    // runtime object or Core's exact blank/root/default placeholder. Folder,
    // format, and template travel as one coherent snapshot.
    const persisted = await readPersistedDailyNoteSettings(app);
    if (persisted) {
        coherentDailyNoteSettingsCache.set(app, persisted);
    }
    return persisted;
}

/**
 * Resolves the configured Core Daily Notes template even during the startup
 * window where the internal plugin instance still exposes blank defaults.
 * The persisted setting is authoritative whenever the runtime value is empty.
 */
export async function getConfiguredDailyNoteTemplate(app: App): Promise<ConfiguredDailyNoteTemplate | null> {
    const settings = await getConfiguredDailyNoteSettings(app);
    return settings?.template ? { path: settings.template, dateFormat: settings.format } : null;
}

export async function getConfiguredDailyNoteTemplatePath(app: App): Promise<string | null> {
    return (await getConfiguredDailyNoteTemplate(app))?.path ?? null;
}

export function getDailyNoteFilename(date: MomentInstance, settings: DailyNoteSettings): string {
    const title = formatDailyNoteTitle(date, settings.format);
    return `${title}.md`;
}

export function getDailyNotePath(date: MomentInstance, settings: DailyNoteSettings): string {
    // Daily Notes uses `folder` + `format` to build a path; normalizePath handles leading/trailing slashes.
    const formatted = date.format(settings.format);
    const combined = settings.folder ? `${settings.folder}/${formatted}` : formatted;
    const normalized = normalizePath(combined);
    return normalized.endsWith('.md') ? normalized : `${normalized}.md`;
}

function formatDailyNoteTitle(date: MomentInstance, format: string): string {
    const formatted = date.format(format);
    const basename = formatted.split('/').pop() ?? formatted;
    return basename.replace(/\.md$/i, '');
}

function formatInvariantIsoDate(date: MomentInstance): string {
    const year = date.year();
    const month = date.month() + 1;
    const day = date.date();
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function resolveDailyNoteReference(app: App, date: MomentInstance, settings: DailyNoteSettings): DailyNoteReference {
    const gcmResolution = resolveGcmDailyNotesApi(app);
    if (gcmResolution.status === 'blocked') {
        return { status: 'blocked', file: null, path: null };
    }
    if (gcmResolution.status === 'ready') {
        const gcmDailyNotes = gcmResolution.api;
        const isoDate = formatInvariantIsoDate(date);
        try {
            // GCM owns both canonical and supported legacy Daily Note identity.
            // Its null result is authoritative: falling through could select a
            // date-looking record and create a duplicate on the next action.
            const file = gcmDailyNotes.findForIsoDate(isoDate);
            const path = file?.path ?? gcmDailyNotes.pathForIsoDate(isoDate);
            return path ? { status: 'ready', file, path } : { status: 'blocked', file: null, path: null };
        } catch (error) {
            console.warn('[TPS Notebook Navigator] GCM Daily Note resolution failed closed', { isoDate, error });
            return { status: 'blocked', file: null, path: null };
        }
    }

    const path = getDailyNotePath(date, settings);
    const file = app.vault.getAbstractFileByPath(path);
    return { status: 'ready', file: file instanceof TFile ? file : null, path };
}

export function getDailyNoteFile(app: App, date: MomentInstance, settings: DailyNoteSettings): TFile | null {
    const reference = resolveDailyNoteReference(app, date, settings);
    return reference.status === 'ready' ? reference.file : null;
}

/**
 * Resolves a file back to its canonical Daily Note ISO date. GCM v3 owns
 * legacy identity when present; a blocked or authoritative null provider
 * result never falls through to filename parsing.
 */
export function resolveDailyNoteFileDateReference(app: App, file: Pick<TFile, 'path' | 'basename'>): DailyNoteFileDateReference {
    const gcmResolution = resolveGcmDailyNotesApi(app);
    if (gcmResolution.status === 'absent') {
        return { status: 'absent', isoDate: null };
    }
    if (gcmResolution.status === 'blocked') {
        return { status: 'blocked', isoDate: null };
    }

    const { api } = gcmResolution;
    if (api.version < 3 || !api.dateForFile) {
        return { status: 'blocked', isoDate: null };
    }

    try {
        const isoDate = api.dateForFile(file);
        return {
            status: 'ready',
            isoDate: isoDate && /^\d{4}-\d{2}-\d{2}$/u.test(isoDate) ? isoDate : null
        };
    } catch (error) {
        console.warn('[TPS Notebook Navigator] GCM Daily Note reverse resolution failed closed', {
            path: file.path,
            error
        });
        return { status: 'blocked', isoDate: null };
    }
}

async function ensureFolderExists(app: App, path: string): Promise<void> {
    // Create intermediate folders for the note path (no-op if the note is in the vault root).
    const normalized = normalizePath(path);
    const parts = normalized.split('/').filter(Boolean);
    parts.pop();

    if (parts.length === 0) {
        return;
    }

    let current = '';
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        const existing = app.vault.getAbstractFileByPath(current);
        if (!existing) {
            await app.vault.createFolder(current);
            continue;
        }
        if (!(existing instanceof TFolder)) {
            throw new Error(`Cannot create daily note folder "${current}": path exists and is not a folder.`);
        }
    }
}

async function readTemplateInfo(app: App, templatePath: string): Promise<DailyNoteTemplateInfo | null> {
    const normalized = normalizePath(templatePath);
    if (!normalized || normalized === '/') {
        return { file: null, contents: '', foldInfo: null };
    }

    try {
        // Templates are resolved the same way Obsidian does in other contexts: first matching linkpath destination.
        const templateFile = app.metadataCache.getFirstLinkpathDest(normalized, '');
        if (!templateFile) {
            console.warn(`Daily note template could not be resolved: "${normalized}"`);
            showNotice(strings.dailyNotes.templateReadFailed);
            return null;
        }

        const contents = await app.vault.cachedRead(templateFile);
        // Preserve fold state from the template (best-effort) so new notes look like the template.
        const foldManager = getFoldManager(app);
        let foldInfo: unknown = null;
        try {
            foldInfo = foldManager?.load(templateFile) ?? null;
        } catch {
            // Fold state is optional presentation metadata. A corrupt or
            // unavailable fold store must not invalidate a readable template.
        }
        return { file: templateFile, contents, foldInfo };
    } catch (error) {
        console.error(`Failed to read the daily note template "${normalized}"`, error);
        showNotice(strings.dailyNotes.templateReadFailed);
        return null;
    }
}

async function finishCreatedDailyNoteContent(
    app: App,
    file: TFile,
    templaterProcessor: TemplaterFileCreationProcessor,
    createStartedAt: number,
    preparedInput?: string
): Promise<void> {
    // The execution owner was chosen before exact-path creation. Auto mode
    // awaits Templater's hook; manual mode invokes one pass. Core variables
    // were already rendered before creation, and output is never rewritten or
    // retried based on residual delimiter text.
    await templaterProcessor.finish(file, createStartedAt);
    if (preparedInput !== undefined) {
        const processedContents = await app.vault.read(file);
        if (processedContents === preparedInput) {
            throw new Error('Templater finished without changing the prepared Daily Note template.');
        }
    }
}

function rememberFailedOwnedDailyNote(app: App, path: string, file: TFile, unchangedContents: string): void {
    let failedByPath = failedOwnedDailyNoteFiles.get(app);
    if (!failedByPath) {
        failedByPath = new Map<string, FailedOwnedDailyNote>();
        failedOwnedDailyNoteFiles.set(app, failedByPath);
    }
    failedByPath.set(path, { file, unchangedContents });
}

function forgetFailedOwnedDailyNote(app: App, path: string, file?: TFile): void {
    const failedByPath = failedOwnedDailyNoteFiles.get(app);
    if (!failedByPath) {
        return;
    }
    if (!file || failedByPath.get(path)?.file === file) {
        failedByPath.delete(path);
    }
}

function hasIncompleteDailyNoteTemplateMarker(contents: string): boolean {
    return contents.includes(INCOMPLETE_DAILY_NOTE_TEMPLATE_MARKER);
}

function appendIncompleteDailyNoteTemplateMarker(contents: string): string {
    const separator = !contents || contents.endsWith('\n') ? '' : '\n';
    return `${contents}${separator}${INCOMPLETE_DAILY_NOTE_TEMPLATE_MARKER}\n`;
}

async function markFailedOwnedDailyNote(app: App, file: TFile, path: string, preparedInput: string): Promise<void> {
    rememberFailedOwnedDailyNote(app, path, file, preparedInput);
    try {
        const current = app.vault.getAbstractFileByPath(path);
        if (current !== file) {
            return;
        }
        const currentContents = await app.vault.read(file);
        rememberFailedOwnedDailyNote(app, path, file, currentContents);
        // A failed Templater pass may have written partial output. Use those
        // exact bytes as the compare-and-set fingerprint too.
        let markerWritten = false;
        await app.vault.process(file, latestContents => {
            if (latestContents !== currentContents) {
                return latestContents;
            }
            markerWritten = true;
            return hasIncompleteDailyNoteTemplateMarker(latestContents)
                ? latestContents
                : appendIncompleteDailyNoteTemplateMarker(latestContents);
        });
        if (markerWritten) {
            // The file now carries durable, sync-safe failure evidence. The
            // WeakMap remains only a fallback when read/process is unavailable.
            forgetFailedOwnedDailyNote(app, path, file);
        }
    } catch {
        // Keep the in-memory fingerprint. A later request in this session must
        // not return the failed file if durable marking was unavailable.
    }
}

type ExistingDailyNoteSettlement = 'settled' | 'unchanged' | 'failed';

async function sanitizeSettledDailyNote(app: App, file: TFile): Promise<ExistingDailyNoteSettlement> {
    return (await sanitizeTpsTemplateInstanceFile(app, file)) ? 'settled' : 'failed';
}

async function settleExistingDailyNoteIfNeeded(
    app: App,
    file: TFile,
    date: MomentInstance,
    settings: DailyNoteSettings,
    externalCollision: boolean
): Promise<ExistingDailyNoteSettlement> {
    const timestamps = [file.stat.ctime, file.stat.mtime].filter(value => Number.isFinite(value) && value > 0 && value <= Date.now());
    const createdAt = timestamps.length > 0 ? Math.max(...timestamps) : 0;
    const isRecent = createdAt > 0 && Date.now() - createdAt <= RECENT_DAILY_NOTE_CREATION_WINDOW_MS;
    const isPending = isTemplaterFileCreationPending(app, file.path);
    let currentContents: string;
    try {
        currentContents = await app.vault.read(file);
    } catch {
        return 'failed';
    }
    if (hasIncompleteDailyNoteTemplateMarker(currentContents)) {
        return 'failed';
    }
    if (!settings.template) {
        if (!isPending && !isRecent) {
            return 'settled';
        }
        const autoProcessor = isPending
            ? getTemplaterFileCreationProcessor(app, file.path)
            : getTemplaterAutoFileCreationProcessor(app, file.path);
        if (!autoProcessor) {
            return isPending ? 'failed' : await sanitizeSettledDailyNote(app, file);
        }
        try {
            await finishCreatedDailyNoteContent(app, file, autoProcessor, createdAt || Date.now());
            return await sanitizeSettledDailyNote(app, file);
        } catch {
            return 'failed';
        }
    }
    if (!externalCollision && !isRecent && !isPending) {
        return 'unchanged';
    }

    const passiveProcessor = isPending
        ? getTemplaterFileCreationProcessor(app, file.path)
        : isRecent
          ? getTemplaterAutoFileCreationProcessor(app, file.path)
          : null;
    if (passiveProcessor) {
        try {
            await finishCreatedDailyNoteContent(
                app,
                file,
                passiveProcessor,
                createdAt || Date.now(),
                TEMPLATER_COMMAND_PATTERN.test(currentContents) ? currentContents : undefined
            );
            return await sanitizeSettledDailyNote(app, file);
        } catch {
            return 'failed';
        }
    }
    if (!TEMPLATER_COMMAND_PATTERN.test(currentContents)) {
        return await sanitizeSettledDailyNote(app, file);
    }
    const templateInfo = await readTemplateInfo(app, settings.template);
    if (!templateInfo || !TEMPLATER_COMMAND_PATTERN.test(templateInfo.contents)) {
        return externalCollision || isRecent || isPending ? 'failed' : 'unchanged';
    }

    const noteTitle = formatDailyNoteTitle(date, settings.format);
    const sanitizedTemplateContents = prepareTpsTemplateInstanceSource(app, templateInfo.contents);
    if (sanitizedTemplateContents === null) {
        return 'failed';
    }
    const templateInstanceContents = sanitizedTemplateContents ?? templateInfo.contents;
    const originalCoreRenderedTemplate = renderDailyNoteTemplate(templateInfo.contents, date, noteTitle, settings.format);
    const coreRenderedTemplate = renderDailyNoteTemplate(templateInstanceContents, date, noteTitle, settings.format);
    const matchesRawTemplate =
        currentContents === templateInfo.contents ||
        currentContents === originalCoreRenderedTemplate ||
        currentContents === templateInstanceContents ||
        currentContents === coreRenderedTemplate;
    if (!matchesRawTemplate) {
        // A mature pre-existing note remains untouched. For an external
        // collision, changed bytes with no pending hook are positive evidence
        // that the winning creator already completed its pass, even if that
        // pass intentionally emitted a literal delimiter.
        return externalCollision ? await sanitizeSettledDailyNote(app, file) : 'unchanged';
    }
    if (!isRecent) {
        return externalCollision ? 'failed' : 'unchanged';
    }

    const processor = getTemplaterFileCreationProcessor(app, file.path);
    if (!processor) {
        return 'failed';
    }
    try {
        if (currentContents !== coreRenderedTemplate) {
            await app.vault.modify(file, coreRenderedTemplate);
        }
        await finishCreatedDailyNoteContent(app, file, processor, createdAt || Date.now(), coreRenderedTemplate);
        return await sanitizeSettledDailyNote(app, file);
    } catch {
        return 'failed';
    }
}

export function renderDailyNoteTemplate(template: string, date: MomentInstance, noteTitle: string, format: string): string {
    if (!template) {
        return '';
    }

    const momentApi = getMomentApi();
    if (!momentApi) {
        return template;
    }

    const now = momentApi();
    const time = now.format('HH:mm');

    // Support a small subset of Obsidian's template tokens commonly used with Daily Notes.
    // - Basic tokens: {{date}}, {{time}}, {{title}}
    // - Relative tokens: {{yesterday}}, {{tomorrow}}
    // - Calculated tokens: {{date +1d:YYYY-MM-DD}} / {{time -2h:HH:mm}}
    return template
        .replace(/{{\s*date\s*}}/gi, date.format(DEFAULT_DAILY_NOTE_FORMAT))
        .replace(/{{\s*time\s*}}/gi, time)
        .replace(/{{\s*title\s*}}/gi, noteTitle)
        .replace(
            /{{\s*(date|time)\s*(([+-]\d+)([yQmwdhs]))?\s*(:.+?)?}}/gi,
            (
                _match,
                timeOrDate: string,
                _calcGroup: string | undefined,
                deltaRaw: string | undefined,
                unitRaw: string | undefined,
                formatRaw: string | undefined
            ) => {
                const isTimeToken = timeOrDate.toLowerCase() === 'time';
                const currentDate = date.clone().set({
                    hour: now.get('hour'),
                    minute: now.get('minute'),
                    second: now.get('second')
                });

                const deltaUnit = unitRaw ? normalizeDailyNotesDeltaUnit(unitRaw) : null;
                if (deltaRaw && deltaUnit) {
                    currentDate.add(Number.parseInt(deltaRaw, 10), deltaUnit);
                }

                if (formatRaw) {
                    return currentDate.format(formatRaw.substring(1).trim());
                }

                return isTimeToken ? currentDate.format('HH:mm') : formatDailyNoteTitle(currentDate, format);
            }
        )
        .replace(/{{\s*yesterday\s*}}/gi, formatDailyNoteTitle(date.clone().subtract(1, 'day'), format))
        .replace(/{{\s*tomorrow\s*}}/gi, formatDailyNoteTitle(date.clone().add(1, 'day'), format));
}

function dailyNoteSettingsMatch(left: DailyNoteSettings, right: DailyNoteSettings): boolean {
    return left.folder === right.folder && left.format === right.format && left.template === right.template;
}

function normalizeExpectedDailyNotePath(path: string): string | null {
    const trimmed = path.trim().replace(/^\/+/, '');
    if (!trimmed) {
        return null;
    }
    return normalizePath(trimmed);
}

function hasDailyNotePreflightConstraint(options: CreateDailyNoteOptions): boolean {
    return options.expectedSettings !== undefined || options.expectedPath !== undefined;
}

async function validateJoinedDailyNoteResult(
    app: App,
    date: MomentInstance,
    isoDate: string,
    options: CreateDailyNoteOptions,
    file: TFile | null
): Promise<TFile | null> {
    if (!hasDailyNotePreflightConstraint(options)) {
        return file;
    }

    let currentSettings: DailyNoteSettings | null = null;
    if (options.expectedSettings) {
        currentSettings = await getConfiguredDailyNoteSettings(app);
        if (!currentSettings || !dailyNoteSettingsMatch(currentSettings, options.expectedSettings)) {
            console.warn('[TPS Notebook Navigator] Core Daily Notes changed while joining confirmed creation; failed closed', { isoDate });
            showNotice(strings.dailyNotes.createFailed);
            return null;
        }
    }

    let expectedPath = options.expectedPath === undefined ? null : normalizeExpectedDailyNotePath(options.expectedPath);
    if (options.expectedPath !== undefined && !expectedPath) {
        console.warn('[TPS Notebook Navigator] Joined Daily Note confirmation has an invalid target; failed closed', { isoDate });
        showNotice(strings.dailyNotes.createFailed);
        return null;
    }

    if (!expectedPath && options.expectedSettings) {
        const gcmResolution = resolveGcmDailyNotesApi(app);
        if (gcmResolution.status !== 'absent') {
            console.warn('[TPS Notebook Navigator] Joined GCM Daily Note confirmation has no authoritative target; failed closed', {
                isoDate
            });
            showNotice(strings.dailyNotes.createFailed);
            return null;
        }
        expectedPath = getDailyNotePath(date, currentSettings ?? options.expectedSettings);
    }

    if (file && expectedPath && normalizePath(file.path) !== expectedPath) {
        console.warn("[TPS Notebook Navigator] Shared Daily Note result differs from this caller's confirmed target; failed closed", {
            isoDate,
            expectedPath,
            actualPath: file.path
        });
        showNotice(strings.dailyNotes.createFailed);
        return null;
    }

    return file;
}

export async function createDailyNote(app: App, date: MomentInstance, options: CreateDailyNoteOptions = {}): Promise<TFile | null> {
    const isoDate = formatInvariantIsoDate(date);
    let byIsoDate = pendingDailyNoteCreates.get(app);
    if (!byIsoDate) {
        byIsoDate = new Map<string, PendingDailyNoteCreate>();
        pendingDailyNoteCreates.set(app, byIsoDate);
    }
    const pending = byIsoDate.get(isoDate);
    if (pending) {
        const file = await pending.promise;
        if (!file && pending.constrained && !hasDailyNotePreflightConstraint(options)) {
            // The first owner may have declined only because its confirmed
            // preflight no longer matched. Once its gate is deterministically
            // released, an ordinary caller is allowed to become the next
            // owner rather than inheriting that unrelated confirmation.
            return await createDailyNote(app, date, options);
        }
        return await validateJoinedDailyNoteResult(app, date, isoDate, options, file);
    }

    // The invariant date gate owns provider discovery, confirmation checks,
    // Core snapshot resolution, exact-path reservation, and Templater. A GCM
    // startup transition therefore cannot race a standalone creator for the
    // same logical day.
    const operation = createDailyNoteForIsoDate(app, date, options, isoDate);
    const sharedPromise = operation.finally(() => {
        if (byIsoDate.get(isoDate)?.promise === sharedPromise) {
            byIsoDate.delete(isoDate);
        }
    });
    byIsoDate.set(isoDate, {
        promise: sharedPromise,
        constrained: hasDailyNotePreflightConstraint(options)
    });
    return await sharedPromise;
}

async function createDailyNoteForIsoDate(
    app: App,
    date: MomentInstance,
    options: CreateDailyNoteOptions,
    isoDate: string
): Promise<TFile | null> {
    const expectedPath = options.expectedPath === undefined ? null : normalizeExpectedDailyNotePath(options.expectedPath);
    if (options.expectedPath !== undefined && !expectedPath) {
        console.warn('[TPS Notebook Navigator] Confirmed Daily Note path is invalid; failed closed', { isoDate });
        showNotice(strings.dailyNotes.createFailed);
        return null;
    }

    let confirmedSettings: DailyNoteSettings | null = null;
    if (options.expectedSettings) {
        const currentSettings = await getConfiguredDailyNoteSettings(app);
        if (!currentSettings || !dailyNoteSettingsMatch(currentSettings, options.expectedSettings)) {
            console.warn('[TPS Notebook Navigator] Core Daily Notes changed before confirmed creation; failed closed');
            showNotice(strings.dailyNotes.createFailed);
            return null;
        }
        confirmedSettings = currentSettings;
    }

    const gcmResolution = resolveGcmDailyNotesApi(app);
    if (gcmResolution.status === 'blocked') {
        console.warn('[TPS Notebook Navigator] GCM Daily Note provider is enabled but not ready; creation failed closed', { isoDate });
        showNotice(strings.dailyNotes.createFailed);
        return null;
    }
    if (gcmResolution.status === 'ready') {
        const gcmDailyNotes = gcmResolution.api;
        if (options.expectedSettings && !expectedPath) {
            console.warn('[TPS Notebook Navigator] Confirmed GCM Daily Note creation has no authoritative target; failed closed', {
                isoDate
            });
            showNotice(strings.dailyNotes.createFailed);
            return null;
        }
        if (expectedPath && gcmDailyNotes.version < 4) {
            console.warn('[TPS Notebook Navigator] GCM Daily Note provider cannot enforce the confirmed target; creation failed closed', {
                isoDate,
                providerVersion: gcmDailyNotes.version
            });
            showNotice(strings.dailyNotes.createFailed);
            return null;
        }
        try {
            // GCM is authoritative whenever the compatible capability is
            // present. A null result must not fall through to a second creator.
            const file = expectedPath
                ? await gcmDailyNotes.ensureForIsoDate(isoDate, { expectedPath })
                : await gcmDailyNotes.ensureForIsoDate(isoDate);
            if (file && expectedPath && normalizePath(file.path) !== expectedPath) {
                console.warn('[TPS Notebook Navigator] GCM returned a different Daily Note than the confirmed target; failed closed', {
                    isoDate,
                    expectedPath,
                    actualPath: file.path
                });
                showNotice(strings.dailyNotes.createFailed);
                return null;
            }
            return file;
        } catch (error) {
            console.warn('[TPS Notebook Navigator] GCM Daily Note creation failed closed', { isoDate, error });
            showNotice(strings.dailyNotes.createFailed);
            return null;
        }
    }

    // Ordinary creation always owns a fresh coherent Core snapshot. Only a
    // caller that explicitly supplied expectedSettings above is bound to a
    // render-time confirmation snapshot.
    const configuredSettings = confirmedSettings ?? (await getConfiguredDailyNoteSettings(app));
    if (!configuredSettings) {
        console.warn('[TPS Notebook Navigator] Core Daily Notes is unavailable; creation failed closed');
        showNotice(strings.dailyNotes.createFailed);
        return null;
    }
    const path = getDailyNotePath(date, configuredSettings);
    if (expectedPath && path !== expectedPath) {
        console.warn('[TPS Notebook Navigator] Core Daily Notes target changed after preflight; creation failed closed', {
            isoDate,
            expectedPath,
            actualPath: path
        });
        showNotice(strings.dailyNotes.createFailed);
        return null;
    }
    return await (async (): Promise<TFile | null> => {
        const existing = app.vault.getAbstractFileByPath(path);
        if (existing instanceof TFile) {
            const failedOwned = failedOwnedDailyNoteFiles.get(app)?.get(path);
            if (failedOwned?.file === existing) {
                try {
                    if ((await app.vault.read(existing)) === failedOwned.unchangedContents) {
                        console.warn('[TPS Notebook Navigator] Previously failed owned Daily Note remains unresolved; failed closed', {
                            path
                        });
                        showNotice(strings.dailyNotes.createFailed);
                        return null;
                    }
                    // A user or another successful processor changed the
                    // failed bytes. Stop treating this exact file as the raw
                    // artifact from our failed attempt.
                    forgetFailedOwnedDailyNote(app, path, existing);
                } catch {
                    console.warn('[TPS Notebook Navigator] Previously failed owned Daily Note could not be verified; failed closed', {
                        path
                    });
                    showNotice(strings.dailyNotes.createFailed);
                    return null;
                }
            }
            if (failedOwned) {
                forgetFailedOwnedDailyNote(app, path);
            }
            // Existing user content is authoritative. The one narrow recovery
            // case is a just-created file whose bytes still exactly match the
            // configured raw template (a Core/Templater startup race).
            const settlement = await settleExistingDailyNoteIfNeeded(app, existing, date, configuredSettings, false);
            if (settlement === 'failed') {
                console.warn('[TPS Notebook Navigator] Recent Daily Note template recovery failed closed', { path });
                showNotice(strings.dailyNotes.createFailed);
                return null;
            }
            return existing;
        }
        if (failedOwnedDailyNoteFiles.get(app)?.has(path)) {
            forgetFailedOwnedDailyNote(app, path);
        }

        try {
            // A configured template is part of the creation contract. Resolve and read it before
            // creating folders or the note so a stale template path cannot silently produce a blank daily note.
            const templateInfo = await readTemplateInfo(app, configuredSettings.template);
            if (!templateInfo) {
                return null;
            }
            const { file: templateFile, contents: templateContents, foldInfo } = templateInfo;
            const noteTitle = formatDailyNoteTitle(date, configuredSettings.format);
            const sanitizedTemplateContents = prepareTpsTemplateInstanceSource(app, templateContents);
            if (sanitizedTemplateContents === null) {
                console.warn('[TPS Notebook Navigator] Daily Note template could not be prepared safely', {
                    path,
                    template: templateFile?.path ?? configuredSettings.template
                });
                showNotice(strings.dailyNotes.createFailed);
                return null;
            }
            const templateInstanceContents = sanitizedTemplateContents ?? templateContents;
            const hasTemplaterCommands = TEMPLATER_COMMAND_PATTERN.test(templateInstanceContents);
            const preparedTemplateContents = renderDailyNoteTemplate(templateInstanceContents, date, noteTitle, configuredSettings.format);
            const templaterProcessor = hasTemplaterCommands
                ? getTemplaterFileCreationProcessor(app, path)
                : getTemplaterAutoFileCreationProcessor(app, path);
            if (hasTemplaterCommands && !templaterProcessor) {
                console.warn('[TPS Notebook Navigator] Daily Note template requires Templater, but no callable processor is available', {
                    path,
                    template: templateFile?.path ?? configuredSettings.template
                });
                showNotice(strings.dailyNotes.createFailed);
                return null;
            }
            await ensureFolderExists(app, path);

            const reservationSettings = await getConfiguredDailyNoteSettings(app);
            if (!reservationSettings || !dailyNoteSettingsMatch(reservationSettings, configuredSettings)) {
                console.warn('[TPS Notebook Navigator] Core Daily Notes changed before exact-path reservation; failed closed', {
                    isoDate
                });
                showNotice(strings.dailyNotes.createFailed);
                return null;
            }

            const raced = app.vault.getAbstractFileByPath(path);
            if (raced instanceof TFile) {
                const settlement = await settleExistingDailyNoteIfNeeded(app, raced, date, configuredSettings, true);
                if (settlement === 'failed') {
                    console.warn('[TPS Notebook Navigator] External Daily Note creator did not settle before return', { path });
                    showNotice(strings.dailyNotes.createFailed);
                    return null;
                }
                return raced;
            }

            let createdFile: TFile;
            let createCompletedAt: number;
            try {
                // Exact-path vault creation is the atomic reservation. It
                // cannot silently choose Templater's " 1.md" collision path.
                createdFile = await app.vault.create(path, preparedTemplateContents);
                // Anchor Templater's delayed hook grace period to completion
                // of the potentially slow vault write, not to the time before
                // an iCloud-backed create began.
                createCompletedAt = Date.now();
            } catch (error) {
                const concurrent = app.vault.getAbstractFileByPath(path);
                if (concurrent instanceof TFile) {
                    const settlement = await settleExistingDailyNoteIfNeeded(app, concurrent, date, configuredSettings, true);
                    if (settlement === 'failed') {
                        console.warn('[TPS Notebook Navigator] Colliding Daily Note creator did not settle before return', { path });
                        showNotice(strings.dailyNotes.createFailed);
                        return null;
                    }
                    return concurrent;
                }
                throw error;
            }

            if (templaterProcessor) {
                try {
                    await finishCreatedDailyNoteContent(
                        app,
                        createdFile,
                        templaterProcessor,
                        createCompletedAt,
                        hasTemplaterCommands ? preparedTemplateContents : undefined
                    );
                } catch (error) {
                    await markFailedOwnedDailyNote(app, createdFile, path, preparedTemplateContents);
                    throw error;
                }
            }
            if (!(await sanitizeTpsTemplateInstanceFile(app, createdFile))) {
                await markFailedOwnedDailyNote(app, createdFile, path, preparedTemplateContents);
                throw new Error('Daily Note output could not be verified as a non-template instance');
            }
            forgetFailedOwnedDailyNote(app, path, createdFile);
            if (foldInfo) {
                try {
                    const foldManager = getFoldManager(app);
                    foldManager?.save(createdFile, foldInfo);
                } catch {
                    // ignore
                }
            }
            return createdFile;
        } catch (error) {
            console.error(`Failed to create daily note "${path}"`, error);
            showNotice(strings.dailyNotes.createFailed);
            return null;
        }
    })();
}
