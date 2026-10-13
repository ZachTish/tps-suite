/*
 * TPS Notebook Navigator - display-name adapter for GCM native records.
 *
 * Native records can deliberately use opaque, identity-stable filenames. This
 * adapter keeps the ordinary frontmatter-name setting authoritative, then asks
 * GCM to verify and canonicalize a record before using its required title as a
 * presentation-only fallback.
 */

import type { App, TFile } from 'obsidian';
import { TPS_GCM_API_CHANGED_EVENT, TPS_GCM_API_REQUEST_EVENT, TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID } from '../../constants/tpsIdentity';
import type { NotebookNavigatorSettings } from '../../settings/types';
import { containsUnresolvedTemplateExpression, getFileDisplayName } from '../../utils/fileNameUtils';
import { getPathBaseName } from '../../utils/pathUtils';
import { isRecord } from '../../utils/typeGuards';
import { resolveGcmNativeRecordsApi } from './gcmTaskApi';

interface GcmWorkspaceEventSource {
    on(name: string, callback: (payload: unknown) => void): unknown;
    offref(ref: unknown): void;
    trigger?(name: string, payload: unknown): void;
}

const WIKILINK_ESCAPABLE_CHARACTERS = '\\|#^[]';

function isSupportedWikiLinkEscape(value: string, index: number): boolean {
    return value[index] === '\\' && index + 1 < value.length && WIKILINK_ESCAPABLE_CHARACTERS.includes(value[index + 1]);
}

function unescapeWikiLinkDisplayText(value: string): string {
    let result = '';
    for (let index = 0; index < value.length; index += 1) {
        if (isSupportedWikiLinkEscape(value, index)) {
            result += value[index + 1];
            index += 1;
            continue;
        }
        result += value[index];
    }
    return result;
}

function findUnescapedWikiLinkCharacter(value: string, characters: string): number {
    for (let index = 0; index < value.length; index += 1) {
        if (isSupportedWikiLinkEscape(value, index)) {
            index += 1;
            continue;
        }
        if (characters.includes(value[index])) {
            return index;
        }
    }
    return -1;
}

function isEscapedByBackslashRun(value: string, index: number): boolean {
    let backslashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
        backslashCount += 1;
    }
    return backslashCount % 2 === 1;
}

function getStrictWholeWikiLinkDisplayText(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed.startsWith('[[') || !trimmed.endsWith(']]') || isEscapedByBackslashRun(trimmed, trimmed.length - 2)) {
        return null;
    }

    const inner = trimmed.slice(2, -2).trim();
    if (!inner || inner.includes('\n') || inner.includes('\r')) {
        return null;
    }

    const pipeIndex = findUnescapedWikiLinkCharacter(inner, '|');
    const rawTarget = (pipeIndex === -1 ? inner : inner.slice(0, pipeIndex)).trim();
    const rawAlias = pipeIndex === -1 ? '' : inner.slice(pipeIndex + 1).trim();
    if (!rawTarget || findUnescapedWikiLinkCharacter(rawTarget, '[]') !== -1 || findUnescapedWikiLinkCharacter(rawAlias, '[]|') !== -1) {
        return null;
    }

    const alias = unescapeWikiLinkDisplayText(rawAlias).trim();
    if (alias) {
        return alias;
    }

    const subpathIndex = findUnescapedWikiLinkCharacter(rawTarget, '#^');
    const rawFileTarget = (subpathIndex === -1 ? rawTarget : rawTarget.slice(0, subpathIndex)).trim();
    if (rawFileTarget) {
        const fileTarget = unescapeWikiLinkDisplayText(rawFileTarget).trim();
        const basename = getPathBaseName(fileTarget).replace(/\.md$/iu, '').trim();
        return basename || null;
    }

    const rawSameNoteSubpath = subpathIndex === -1 ? '' : rawTarget.slice(subpathIndex + 1).trim();
    const sameNoteSubpath = unescapeWikiLinkDisplayText(rawSameNoteSubpath).trim();
    return sameNoteSubpath || null;
}

export function resolveGcmNativeRecordDisplayName(app: App, file: TFile): string | null {
    if (file.extension.toLocaleLowerCase() !== 'md') {
        return null;
    }

    const api = resolveGcmNativeRecordsApi(app);
    if (!api) {
        return null;
    }

    try {
        if (api.getMode() !== 'native-records') {
            return null;
        }

        const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
        const inspection = api.inspect(frontmatter);
        if (
            !isRecord(inspection) ||
            typeof inspection.id !== 'string' ||
            !inspection.id.trim() ||
            typeof inspection.kind !== 'string' ||
            !inspection.kind.trim() ||
            typeof inspection.schemaVersion !== 'number' ||
            !Number.isSafeInteger(inspection.schemaVersion) ||
            inspection.schemaVersion < 1 ||
            !isRecord(inspection.frontmatter)
        ) {
            return null;
        }

        const rawTitle = inspection.frontmatter.title;
        if (typeof rawTitle !== 'string') {
            return null;
        }

        const title = rawTitle.trim();
        if (!title || containsUnresolvedTemplateExpression(title)) {
            return null;
        }

        const wikiLinkDisplayText = getStrictWholeWikiLinkDisplayText(title);
        const displayName = (wikiLinkDisplayText ?? title).trim();
        return displayName && !containsUnresolvedTemplateExpression(displayName) ? displayName : null;
    } catch {
        return null;
    }
}

export function getFileDisplayNameWithGcmNativeFallback(
    app: App,
    file: TFile,
    cachedData: { fn?: string } | undefined,
    settings: NotebookNavigatorSettings
): string {
    const configuredName = cachedData?.fn;
    if (configuredName && settings.useFrontmatterMetadata && !containsUnresolvedTemplateExpression(configuredName)) {
        return configuredName;
    }

    if (settings.tpsDataArchitectureMode === 'native-records') {
        const nativeRecordName = resolveGcmNativeRecordDisplayName(app, file);
        if (nativeRecordName) {
            return nativeRecordName;
        }
    }

    return getFileDisplayName(file, cachedData, settings);
}

/**
 * Invalidates presentation consumers when GCM starts, stops, or replaces its
 * public API. Native titles are read live and are never persisted in NN's
 * metadata cache, so a callback revision is sufficient to refresh rows,
 * search evidence, and title sorting.
 */
export function subscribeGcmNativeRecordApiLifecycle(app: App, onChange: () => void): () => void {
    const eventSource = app.workspace as unknown as Partial<GcmWorkspaceEventSource>;
    if (typeof eventSource.on !== 'function' || typeof eventSource.offref !== 'function') {
        return () => undefined;
    }

    let ref: unknown;
    try {
        ref = eventSource.on(TPS_GCM_API_CHANGED_EVENT, onChange);
    } catch {
        return () => undefined;
    }

    try {
        eventSource.trigger?.(TPS_GCM_API_REQUEST_EVENT, {
            sourcePluginId: TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID,
            requester: TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID,
            timestamp: Date.now()
        });
    } catch {
        // A lifecycle request is opportunistic. The installed listener still
        // observes later GCM load, unload, and replacement announcements.
    }

    return () => {
        try {
            eventSource.offref?.(ref);
        } catch {
            // Optional integrations must never interfere with Navigator unload.
        }
    };
}
