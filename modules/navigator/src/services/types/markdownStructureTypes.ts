/*
 * TPS Notebook Navigator - cache-aware Markdown structure Type index.
 *
 * Obsidian's metadata cache is the parser authority. Only explicitly supported
 * top-level SectionCache kinds are indexed without body reads. External web
 * links use a bounded local body scan because Obsidian does not publish them in
 * CachedMetadata.links. No discovered URL is ever requested.
 */

import { normalizePath, Platform, TFile, type App, type CachedMetadata, type Pos, type SectionCache } from 'obsidian';
import {
    TPS_NAVIGATOR_MARKDOWN_TYPES,
    TPS_NAVIGATOR_TYPE_IDS,
    isTpsNavigatorMarkdownTypeId,
    type TpsNavigatorMarkdownTypeId,
    type TpsNavigatorTypeDescriptor,
    type TpsNavigatorTypeId,
    type TpsNavigatorTypeRecord,
    type TpsNavigatorTypesSnapshot
} from '../../types/navigatorTypes';
import { hasExcalidrawFrontmatterFlagValue, isExcalidrawFile } from '../../utils/fileNameUtils';
import { LIMITS } from '../../constants/limits';
import { openMarkdownSourceLocation, type SourceLocationActivationResult } from './sourceLocation';
import { scanMarkdownWebLinks } from './markdownWebLinks';

type MarkdownStructureLineKind = 'code' | 'callout' | 'blockquote' | 'table';

interface CachePositionRange {
    readonly startLine: number;
    readonly endLine: number;
    readonly startColumn: number;
    readonly startOffset: number;
    readonly endOffset: number;
}

interface MarkdownStructureDefinition {
    readonly typeId: TpsNavigatorMarkdownTypeId;
    readonly sectionType: string;
    readonly lineKind: MarkdownStructureLineKind;
}

interface WebLinkBodyStamp {
    readonly mtime: number;
    readonly size: number;
}

const DEFINITIONS: readonly MarkdownStructureDefinition[] = Object.freeze([
    {
        typeId: TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS,
        sectionType: 'code',
        lineKind: 'code'
    },
    {
        typeId: TPS_NAVIGATOR_TYPE_IDS.CALLOUTS,
        sectionType: 'callout',
        lineKind: 'callout'
    },
    {
        typeId: TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES,
        sectionType: 'blockquote',
        lineKind: 'blockquote'
    },
    {
        typeId: TPS_NAVIGATOR_TYPE_IDS.TABLES,
        sectionType: 'table',
        lineKind: 'table'
    }
]);

const DEFINITION_BY_SECTION_TYPE = new Map(DEFINITIONS.map(definition => [definition.sectionType, definition] as const));
const WEB_LINK_READ_CONCURRENCY = 4;

export type MarkdownStructureActivationResult =
    | SourceLocationActivationResult
    | { readonly ok: false; readonly reason: 'invalid-record' | 'stale-locator' | 'read-failed'; readonly error?: unknown };

function isMarkdownNote(file: TFile, cache: CachedMetadata | null): boolean {
    return file.extension.toLocaleLowerCase() === 'md' && !isExcalidrawFile(file) && !hasExcalidrawFrontmatterFlagValue(cache?.frontmatter);
}

function getWebLinkReadLimit(): number {
    return Platform.isMobile ? LIMITS.markdown.maxReadBytes.mobile : LIMITS.markdown.maxReadBytes.desktop;
}

function canReadWebLinkBody(file: TFile): boolean {
    const fileSize = Number(file.stat?.size);
    return !Number.isFinite(fileSize) || fileSize <= getWebLinkReadLimit();
}

function canScanWebLinkBody(file: TFile, content: string): boolean {
    return canReadWebLinkBody(file) && content.length <= getWebLinkReadLimit();
}

function getWebLinkBodyStamp(file: TFile): WebLinkBodyStamp {
    const mtime = Number(file.stat?.mtime);
    const size = Number(file.stat?.size);
    return {
        mtime: Number.isFinite(mtime) ? mtime : -1,
        size: Number.isFinite(size) ? size : -1
    };
}

function webLinkBodyStampsMatch(left: WebLinkBodyStamp | undefined, right: WebLinkBodyStamp): boolean {
    return Boolean(left && left.mtime === right.mtime && left.size === right.size);
}

function getCachePositionRange(position: Pos | null | undefined): CachePositionRange | null {
    const startLine = Number(position?.start?.line);
    const startColumn = Number(position?.start?.col);
    const startOffset = Number(position?.start?.offset);
    const rawEndLine = Number(position?.end?.line);
    const rawEndColumn = Number(position?.end?.col);
    const endOffset = Number(position?.end?.offset);
    if (
        !Number.isSafeInteger(startLine) ||
        startLine < 0 ||
        !Number.isSafeInteger(startColumn) ||
        startColumn < 0 ||
        !Number.isSafeInteger(startOffset) ||
        startOffset < 0 ||
        !Number.isSafeInteger(rawEndLine) ||
        rawEndLine < startLine ||
        !Number.isSafeInteger(rawEndColumn) ||
        rawEndColumn < 0 ||
        !Number.isSafeInteger(endOffset) ||
        endOffset < startOffset
    ) {
        return null;
    }
    // Cache ranges may end at column zero on the line after the section. Treat
    // that boundary as exclusive while preserving a same-line empty section.
    const endLine = rawEndLine > startLine && rawEndColumn === 0 ? rawEndLine - 1 : rawEndLine;
    return {
        startLine: startLine + 1,
        endLine: Math.max(startLine, endLine) + 1,
        startColumn,
        startOffset,
        endOffset
    };
}

function getSectionRange(section: SectionCache): CachePositionRange | null {
    return getCachePositionRange(section.position);
}

function createLocatorKey(
    typeId: TpsNavigatorMarkdownTypeId,
    sourcePath: string,
    startLine: number,
    endLine: number,
    blockId?: string
): string {
    const normalizedBlockId = blockId?.trim();
    if (normalizedBlockId) {
        return `markdown-section-id:${encodeURIComponent(typeId)}:${encodeURIComponent(sourcePath)}:${encodeURIComponent(normalizedBlockId)}`;
    }
    return `markdown-section:${encodeURIComponent(typeId)}:${encodeURIComponent(sourcePath)}:${startLine}:${endLine}`;
}

function createWebLinkLocatorKey(sourcePath: string, startOffset: number, endOffset: number): string {
    return `markdown-link:${encodeURIComponent(sourcePath)}:${startOffset}:${endOffset}`;
}

/** Maps one authoritative metadata-cache entry to immutable source-range records. */
export function getMarkdownStructureRecordsForFile(
    file: TFile,
    cache: CachedMetadata | null,
    content?: string
): readonly TpsNavigatorTypeRecord[] {
    if (!cache || !isMarkdownNote(file, cache)) {
        return Object.freeze([]);
    }

    const records: TpsNavigatorTypeRecord[] = [];
    const sourcePath = normalizePath(file.path);
    for (const section of Array.isArray(cache.sections) ? cache.sections : []) {
        const definition = DEFINITION_BY_SECTION_TYPE.get(section.type);
        const range = definition ? getSectionRange(section) : null;
        if (!definition || !range) {
            continue;
        }
        const blockId = section.id?.trim();
        const locatorKey = createLocatorKey(definition.typeId, sourcePath, range.startLine, range.endLine, blockId);
        records.push(
            Object.freeze({
                id: locatorKey,
                typeId: definition.typeId,
                // Compact file rows hide their secondary line, so retain both
                // the owning note and source line in the primary label.
                label: `${file.basename} · line ${range.startLine}`,
                sourcePath,
                entityType: 'block',
                lineKind: definition.lineKind,
                lineNumber: range.startLine,
                ...(range.endLine > range.startLine ? { lineEndNumber: range.endLine } : {}),
                ...(blockId ? { blockId } : {}),
                locatorKey,
                referenceTarget: blockId ? `[[${sourcePath}#^${blockId}]]` : sourcePath
            })
        );
    }
    for (const link of typeof content === 'string' && canScanWebLinkBody(file, content) ? scanMarkdownWebLinks(content).matches : []) {
        const locatorKey = createWebLinkLocatorKey(sourcePath, link.startOffset, link.endOffset);
        records.push(
            Object.freeze({
                id: locatorKey,
                typeId: TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS,
                label: link.label,
                sourcePath,
                entityType: 'block',
                lineKind: 'web-link',
                lineNumber: link.lineNumber,
                columnNumber: link.columnNumber,
                sourceOffset: link.startOffset,
                sourceEndOffset: link.endOffset,
                locatorKey,
                referenceTarget: link.target,
                searchText: link.safeDisplay
            })
        );
    }
    return Object.freeze(records);
}

function compareRecords(left: TpsNavigatorTypeRecord, right: TpsNavigatorTypeRecord): number {
    return (
        left.sourcePath.localeCompare(right.sourcePath, undefined, { sensitivity: 'base' }) ||
        (left.lineNumber ?? 0) - (right.lineNumber ?? 0) ||
        (left.columnNumber ?? 0) - (right.columnNumber ?? 0) ||
        left.locatorKey.localeCompare(right.locatorKey)
    );
}

function recordsMatch(left: readonly TpsNavigatorTypeRecord[] | undefined, right: readonly TpsNavigatorTypeRecord[]): boolean {
    return Boolean(
        left &&
        left.length === right.length &&
        left.every((record, index) => {
            const candidate = right[index];
            if (!candidate) {
                return false;
            }
            return (
                record.id === candidate.id &&
                record.typeId === candidate.typeId &&
                record.label === candidate.label &&
                record.sourcePath === candidate.sourcePath &&
                record.entityType === candidate.entityType &&
                record.lineKind === candidate.lineKind &&
                record.lineNumber === candidate.lineNumber &&
                record.columnNumber === candidate.columnNumber &&
                record.sourceOffset === candidate.sourceOffset &&
                record.sourceEndOffset === candidate.sourceEndOffset &&
                record.lineEndNumber === candidate.lineEndNumber &&
                record.blockId === candidate.blockId &&
                record.locatorKey === candidate.locatorKey &&
                record.referenceTarget === candidate.referenceTarget &&
                record.searchText === candidate.searchText
            );
        })
    );
}

function getVaultMarkdownFiles(app: App): TFile[] {
    const vault = app.vault as unknown as { getMarkdownFiles?: () => TFile[]; getFiles?: () => TFile[] };
    const files = typeof vault.getMarkdownFiles === 'function' ? vault.getMarkdownFiles() : (vault.getFiles?.() ?? []);
    return files.filter(file => file.extension.toLocaleLowerCase() === 'md');
}

/** Cache-aware, path-incremental source for Navigator-owned Markdown block Types. */
export class MarkdownStructureTypesIndex {
    private readonly recordsByPath = new Map<string, readonly TpsNavigatorTypeRecord[]>();
    private readonly webLinkBodyStamps = new Map<string, WebLinkBodyStamp>();
    private readonly pathVersions = new Map<string, number>();
    private pathVersion = 0;
    private rebuildGeneration = 0;
    private revision = 0;
    private snapshot = this.buildSnapshot();

    constructor(private readonly app: App) {}

    getSnapshot(): TpsNavigatorTypesSnapshot {
        return this.snapshot;
    }

    /** Full bounded rebuild used at startup and the first metadata resolved barrier. */
    async rebuild(signal?: AbortSignal): Promise<TpsNavigatorTypesSnapshot> {
        const generation = ++this.rebuildGeneration;
        const rebuildStartVersion = this.pathVersion;
        const nextRecordsByPath = new Map<string, readonly TpsNavigatorTypeRecord[]>();
        const nextWebLinkBodyStamps = new Map<string, WebLinkBodyStamp>();
        const files = getVaultMarkdownFiles(this.app);
        let failedReadCount = 0;
        let cursor = 0;
        const worker = async (): Promise<void> => {
            while (!signal?.aborted && cursor < files.length) {
                const file = files[cursor++];
                if (!file) {
                    continue;
                }
                const path = normalizePath(file.path);
                const cache = this.app.metadataCache.getFileCache(file);
                if (!cache) {
                    const previous = this.recordsByPath.get(path);
                    if (previous) {
                        nextRecordsByPath.set(path, previous);
                    }
                    const previousStamp = this.webLinkBodyStamps.get(path);
                    if (previousStamp) {
                        nextWebLinkBodyStamps.set(path, previousStamp);
                    }
                    continue;
                }
                const bodyStamp = getWebLinkBodyStamp(file);
                const priorRecords = this.recordsByPath.get(path) ?? [];
                const priorLinks = priorRecords.filter(record => record.typeId === TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS);
                if (webLinkBodyStampsMatch(this.webLinkBodyStamps.get(path), bodyStamp)) {
                    const sections = getMarkdownStructureRecordsForFile(file, cache);
                    nextRecordsByPath.set(path, Object.freeze([...sections, ...priorLinks].sort(compareRecords)));
                    nextWebLinkBodyStamps.set(path, bodyStamp);
                    continue;
                }
                let content: string | undefined;
                const bodyTooLarge = isMarkdownNote(file, cache) && !canReadWebLinkBody(file);
                if (isMarkdownNote(file, cache) && !bodyTooLarge) {
                    try {
                        content = await this.app.vault.cachedRead(file);
                    } catch {
                        failedReadCount += 1;
                    }
                    if (signal?.aborted) {
                        return;
                    }
                }
                const currentRecords = getMarkdownStructureRecordsForFile(file, cache, content);
                if (content === undefined && !bodyTooLarge) {
                    nextRecordsByPath.set(path, Object.freeze([...currentRecords, ...priorLinks].sort(compareRecords)));
                    const previousStamp = this.webLinkBodyStamps.get(path);
                    if (previousStamp) {
                        nextWebLinkBodyStamps.set(path, previousStamp);
                    }
                } else {
                    nextRecordsByPath.set(path, currentRecords);
                    nextWebLinkBodyStamps.set(path, bodyStamp);
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(WEB_LINK_READ_CONCURRENCY, Math.max(1, files.length)) }, worker));
        if (signal?.aborted || generation !== this.rebuildGeneration) {
            return this.snapshot;
        }

        // A metadata/rename/delete event can arrive while the bounded reads are
        // in flight. Preserve every path changed after this rebuild began.
        this.pathVersions.forEach((version, path) => {
            if (version <= rebuildStartVersion) {
                return;
            }
            const current = this.recordsByPath.get(path);
            if (current) {
                nextRecordsByPath.set(path, current);
                const currentStamp = this.webLinkBodyStamps.get(path);
                if (currentStamp) {
                    nextWebLinkBodyStamps.set(path, currentStamp);
                }
            } else {
                nextRecordsByPath.delete(path);
                nextWebLinkBodyStamps.delete(path);
            }
        });
        if (failedReadCount > 0) {
            console.warn('[TPS Notebook Navigator] Web-link body scan skipped unreadable Markdown files', {
                count: failedReadCount
            });
        }
        this.recordsByPath.clear();
        nextRecordsByPath.forEach((records, path) => this.recordsByPath.set(path, records));
        this.webLinkBodyStamps.clear();
        nextWebLinkBodyStamps.forEach((stamp, path) => this.webLinkBodyStamps.set(path, stamp));
        return this.publish();
    }

    /** Cancels a pending rebuild and releases every path/body cache retained by Types. */
    clear(): TpsNavigatorTypesSnapshot {
        this.rebuildGeneration += 1;
        this.recordsByPath.clear();
        this.webLinkBodyStamps.clear();
        this.pathVersions.clear();
        this.pathVersion = 0;
        return this.publish();
    }

    /** Applies the authoritative cache and body delivered by metadataCache.changed. */
    updateFile(file: TFile, cache: CachedMetadata, content?: string): TpsNavigatorTypesSnapshot {
        const path = normalizePath(file.path);
        const currentRecords = getMarkdownStructureRecordsForFile(file, cache, content);
        const eligible = isMarkdownNote(file, cache);
        const records =
            !eligible || typeof content === 'string'
                ? currentRecords
                : Object.freeze(
                      [
                          ...currentRecords,
                          ...(this.recordsByPath.get(path) ?? []).filter(record => record.typeId === TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)
                      ].sort(compareRecords)
                  );
        if (!eligible) {
            this.webLinkBodyStamps.delete(path);
        } else if (typeof content === 'string') {
            // A body can change without changing the resulting link rows. Keep
            // the stat cache current so a later resolved rebuild does not read
            // the same body again merely because recordsMatch returns early.
            this.webLinkBodyStamps.set(path, getWebLinkBodyStamp(file));
        }
        if (recordsMatch(this.recordsByPath.get(path), records)) {
            // Even a visually identical metadata event is newer than a full
            // rebuild that may still be reading this path in the background.
            this.pathVersions.set(path, ++this.pathVersion);
            return this.snapshot;
        }
        this.recordsByPath.set(path, records);
        this.pathVersions.set(path, ++this.pathVersion);
        return this.publish();
    }

    removePath(path: string): TpsNavigatorTypesSnapshot {
        const normalizedPath = normalizePath(path);
        const removed = this.recordsByPath.delete(normalizedPath);
        this.webLinkBodyStamps.delete(normalizedPath);
        this.pathVersions.set(normalizedPath, ++this.pathVersion);
        return removed ? this.publish() : this.snapshot;
    }

    renameFile(file: TFile, oldPath: string): TpsNavigatorTypesSnapshot {
        const previousPath = normalizePath(oldPath);
        const nextPath = normalizePath(file.path);
        const previousRecords = this.recordsByPath.get(previousPath);
        const previousBodyStamp = this.webLinkBodyStamps.get(previousPath);
        const removedPreviousPath = previousPath !== nextPath && this.recordsByPath.delete(previousPath);
        if (previousPath !== nextPath) {
            this.webLinkBodyStamps.delete(previousPath);
        }
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache) {
            if (previousPath !== nextPath) {
                this.pathVersions.set(previousPath, ++this.pathVersion);
                this.pathVersions.set(nextPath, ++this.pathVersion);
            }
            return removedPreviousPath ? this.publish() : this.snapshot;
        }
        if (!isMarkdownNote(file, cache)) {
            const removedNextPath = this.recordsByPath.delete(nextPath);
            this.webLinkBodyStamps.delete(nextPath);
            this.pathVersions.set(previousPath, ++this.pathVersion);
            this.pathVersions.set(nextPath, ++this.pathVersion);
            return removedPreviousPath || removedNextPath ? this.publish() : this.snapshot;
        }
        const nextSections = getMarkdownStructureRecordsForFile(file, cache);
        const previousLinks = (previousRecords ?? [])
            .filter(record => record.typeId === TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS)
            .map(record => {
                const startOffset = record.sourceOffset;
                const endOffset = record.sourceEndOffset;
                if (!Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset)) {
                    return null;
                }
                const locatorKey = createWebLinkLocatorKey(nextPath, Number(startOffset), Number(endOffset));
                return Object.freeze({ ...record, id: locatorKey, sourcePath: nextPath, locatorKey });
            })
            .filter((record): record is TpsNavigatorTypeRecord => record !== null);
        const nextRecords = Object.freeze([...nextSections, ...previousLinks].sort(compareRecords));
        if (previousPath === nextPath && recordsMatch(previousRecords, nextRecords)) {
            return this.snapshot;
        }
        this.recordsByPath.set(nextPath, nextRecords);
        if (previousBodyStamp) {
            this.webLinkBodyStamps.set(nextPath, previousBodyStamp);
        }
        this.pathVersions.set(previousPath, ++this.pathVersion);
        this.pathVersions.set(nextPath, ++this.pathVersion);
        return this.publish();
    }

    /** Revalidates the exact cached range before opening so stale rows fail closed. */
    async activate(record: TpsNavigatorTypeRecord): Promise<MarkdownStructureActivationResult> {
        if (
            !record ||
            !isTpsNavigatorMarkdownTypeId(record.typeId) ||
            record.entityType !== 'block' ||
            !Number.isSafeInteger(record.lineNumber) ||
            Number(record.lineNumber) < 1
        ) {
            return { ok: false, reason: 'invalid-record' };
        }
        const file = this.app.vault.getFileByPath(normalizePath(record.sourcePath));
        if (!(file instanceof TFile) || file.extension.toLocaleLowerCase() !== 'md') {
            return { ok: false, reason: 'missing-file' };
        }
        let content: string | undefined;
        if (record.typeId === TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS) {
            if (!canReadWebLinkBody(file)) {
                return { ok: false, reason: 'stale-locator' };
            }
            try {
                content = await this.app.vault.cachedRead(file);
            } catch (error) {
                return { ok: false, reason: 'read-failed', error };
            }
        }
        const currentRecords = getMarkdownStructureRecordsForFile(file, this.app.metadataCache.getFileCache(file), content);
        const current = currentRecords.find(
            candidate =>
                candidate.locatorKey === record.locatorKey &&
                candidate.typeId === record.typeId &&
                candidate.referenceTarget === record.referenceTarget
        );
        if (!current?.lineNumber) {
            return { ok: false, reason: 'stale-locator' };
        }
        return openMarkdownSourceLocation(this.app, file, current.lineNumber, current.columnNumber ?? 0);
    }

    private publish(): TpsNavigatorTypesSnapshot {
        this.revision += 1;
        this.snapshot = this.buildSnapshot();
        return this.snapshot;
    }

    private buildSnapshot(): TpsNavigatorTypesSnapshot {
        const mutableRecords = new Map<TpsNavigatorMarkdownTypeId, TpsNavigatorTypeRecord[]>(
            TPS_NAVIGATOR_MARKDOWN_TYPES.map(descriptor => [descriptor.id as TpsNavigatorMarkdownTypeId, []])
        );
        this.recordsByPath.forEach(records => {
            records.forEach(record => {
                if (isTpsNavigatorMarkdownTypeId(record.typeId)) {
                    mutableRecords.get(record.typeId)?.push(record);
                }
            });
        });

        const recordsByType = new Map<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>();
        const descriptors: TpsNavigatorTypeDescriptor[] = TPS_NAVIGATOR_MARKDOWN_TYPES.map(definition => {
            const records = Object.freeze(
                [...(mutableRecords.get(definition.id as TpsNavigatorMarkdownTypeId) ?? [])].sort(compareRecords)
            );
            recordsByType.set(definition.id, records);
            return Object.freeze({ ...definition, count: records.length });
        });
        return Object.freeze({
            availability: 'ready',
            descriptors: Object.freeze(descriptors),
            recordsByType,
            revision: this.revision
        });
    }
}
