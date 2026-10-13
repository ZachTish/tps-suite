/*
 * TPS Notebook Navigator - synchronous, read-free vault file Type catalog.
 *
 * File-backed Types deliberately use only TFile metadata and Obsidian's
 * metadata cache. Classification never reads file bodies, PDFs, or binaries.
 */

import { TFile, TFolder, type App, type TAbstractFile } from 'obsidian';
import {
    TPS_NAVIGATOR_FILE_TYPES,
    TPS_NAVIGATOR_TYPE_IDS,
    type TpsNavigatorFileTypeId,
    type TpsNavigatorTypeDescriptor,
    type TpsNavigatorTypeId,
    type TpsNavigatorTypeRecord,
    type TpsNavigatorTypesSnapshot
} from '../../types/navigatorTypes';
import { hasExcalidrawFrontmatterFlagValue, isExcalidrawFile } from '../../utils/fileNameUtils';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'heif', 'bmp', 'svg', 'tif', 'tiff']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'aif', 'aiff']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'mpg', 'mpeg']);

function isExcalidrawDrawing(app: App, file: TFile): boolean {
    const extension = file.extension.toLocaleLowerCase();
    if (extension === 'excalidraw' || isExcalidrawFile(file)) {
        return true;
    }
    if (extension !== 'md') {
        return false;
    }
    const metadataCache = app.metadataCache as unknown as {
        getFileCache?: (target: TFile) => { frontmatter?: unknown } | null | undefined;
    };
    return hasExcalidrawFrontmatterFlagValue(metadataCache?.getFileCache?.(file)?.frontmatter);
}

/** Returns exactly one built-in file bucket for a supported vault file. */
export function getTpsNavigatorFileTypeId(app: App, file: TFile): TpsNavigatorFileTypeId | null {
    const extension = String(file?.extension ?? '').toLocaleLowerCase();
    if (!extension) {
        return null;
    }
    if (isExcalidrawDrawing(app, file)) {
        return TPS_NAVIGATOR_TYPE_IDS.DRAWINGS;
    }
    if (extension === 'md') {
        return TPS_NAVIGATOR_TYPE_IDS.NOTES;
    }
    if (extension === 'base') {
        return TPS_NAVIGATOR_TYPE_IDS.BASES;
    }
    if (extension === 'canvas') {
        return TPS_NAVIGATOR_TYPE_IDS.CANVAS;
    }
    if (extension === 'pdf') {
        return TPS_NAVIGATOR_TYPE_IDS.PDFS;
    }
    if (IMAGE_EXTENSIONS.has(extension)) {
        return TPS_NAVIGATOR_TYPE_IDS.IMAGES;
    }
    if (AUDIO_EXTENSIONS.has(extension)) {
        return TPS_NAVIGATOR_TYPE_IDS.AUDIO;
    }
    if (VIDEO_EXTENSIONS.has(extension)) {
        return TPS_NAVIGATOR_TYPE_IDS.VIDEO;
    }
    return null;
}

export function isFileInTpsNavigatorType(app: App, file: TFile, typeId: TpsNavigatorTypeId): boolean {
    return getTpsNavigatorFileTypeId(app, file) === typeId;
}

function toFileTypeRecord(file: TFile, typeId: TpsNavigatorFileTypeId): TpsNavigatorTypeRecord {
    return Object.freeze({
        id: `file:${file.path}`,
        typeId,
        label: file.basename || file.name || file.path,
        sourcePath: file.path,
        entityType: 'file',
        locatorKey: file.path,
        referenceTarget: file.path
    });
}

// Reuse locale setup across the entire catalog rather than once per comparison.
const fileRecordCollator = new Intl.Collator(undefined, { sensitivity: 'base' });

function compareFileRecords(left: TpsNavigatorTypeRecord, right: TpsNavigatorTypeRecord): number {
    return fileRecordCollator.compare(left.label, right.label) || fileRecordCollator.compare(left.sourcePath, right.sourcePath);
}

/** Builds one immutable snapshot from an already-resolved file set without reading file bodies. */
export function buildVaultFileTypesSnapshotFromFiles(app: App, files: readonly TFile[]): TpsNavigatorTypesSnapshot {
    const mutableRecords = new Map<TpsNavigatorTypeId, TpsNavigatorTypeRecord[]>();
    TPS_NAVIGATOR_FILE_TYPES.forEach(descriptor => mutableRecords.set(descriptor.id, []));

    for (const file of files) {
        const typeId = getTpsNavigatorFileTypeId(app, file);
        if (!typeId) {
            continue;
        }
        mutableRecords.get(typeId)?.push(toFileTypeRecord(file, typeId));
    }

    const recordsByType = new Map<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>();
    const descriptors: TpsNavigatorTypeDescriptor[] = TPS_NAVIGATOR_FILE_TYPES.map(definition => {
        const records = Object.freeze([...(mutableRecords.get(definition.id) ?? [])].sort(compareFileRecords));
        recordsByType.set(definition.id, records);
        return Object.freeze({ ...definition, count: records.length });
    });

    return Object.freeze({
        availability: 'ready',
        descriptors: Object.freeze(descriptors),
        recordsByType,
        revision: 0
    });
}

/** Builds one immutable snapshot with a single vault scan and no file reads. */
export function buildVaultFileTypesSnapshot(app: App): TpsNavigatorTypesSnapshot {
    const vault = app.vault as unknown as { getFiles?: () => TFile[] };
    const files = typeof vault?.getFiles === 'function' ? vault.getFiles() : [];
    return buildVaultFileTypesSnapshotFromFiles(app, files);
}

/** Applies one event batch to the existing catalog; unrelated files are never reclassified. */
export function updateVaultFileTypesSnapshot(
    app: App,
    snapshot: TpsNavigatorTypesSnapshot,
    paths: ReadonlyMap<string, boolean>
): TpsNavigatorTypesSnapshot {
    const folderPrefixes = [...paths].filter(([, recursive]) => recursive).map(([path]) => (path === '/' ? '' : `${path}/`));
    const affected = (path: string) => paths.has(path) || folderPrefixes.some(prefix => path.startsWith(prefix));
    const files = new Map<string, TFile>();
    const folders = new Set<TFolder>();
    const remaining: TAbstractFile[] = [];
    for (const path of paths.keys()) {
        const file = app.vault.getAbstractFileByPath(path);
        if (file) remaining.push(file);
    }
    while (remaining.length) {
        const file = remaining.pop();
        if (file instanceof TFile) files.set(file.path, file);
        else if (file instanceof TFolder && !folders.has(file)) {
            folders.add(file);
            for (const child of file.children) remaining.push(child);
        }
    }
    const replacements = new Map<string, TpsNavigatorTypeRecord>();
    for (const file of files.values()) {
        const typeId = getTpsNavigatorFileTypeId(app, file);
        if (typeId) replacements.set(file.path, toFileTypeRecord(file, typeId));
    }

    // Walk existing records once per batch, then sort each affected bucket once.
    // Unchanged records/arrays remain shared with the previous immutable snapshot.
    const changedBuckets = new Map<TpsNavigatorTypeId, TpsNavigatorTypeRecord[]>();
    for (const [typeId, records] of snapshot.recordsByType) {
        let next: TpsNavigatorTypeRecord[] | undefined;
        records.forEach((record, index) => {
            if (affected(record.sourcePath)) {
                const replacement = replacements.get(record.sourcePath);
                if (replacement?.typeId === typeId && replacement.label === record.label) {
                    replacements.delete(record.sourcePath);
                } else {
                    next ??= records.slice(0, index);
                    return;
                }
            }
            next?.push(record);
        });
        if (next) changedBuckets.set(typeId, next);
    }
    for (const record of replacements.values()) {
        let records = changedBuckets.get(record.typeId);
        if (!records) {
            records = [...(snapshot.recordsByType.get(record.typeId) ?? [])];
            changedBuckets.set(record.typeId, records);
        }
        records.push(record);
    }
    if (!changedBuckets.size) return snapshot;
    const recordsByType = new Map(snapshot.recordsByType);
    for (const [typeId, records] of changedBuckets) recordsByType.set(typeId, Object.freeze(records.sort(compareFileRecords)));
    const descriptors = snapshot.descriptors.map(descriptor => {
        const records = changedBuckets.get(descriptor.id);
        return records && records.length !== descriptor.count ? Object.freeze({ ...descriptor, count: records.length }) : descriptor;
    });
    return Object.freeze({ ...snapshot, recordsByType, descriptors: Object.freeze(descriptors) });
}
