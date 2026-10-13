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

import { TFile, type TFolder, type MetadataCache, normalizePath } from 'obsidian';
import { FOLDER_NOTE_TYPE_EXTENSIONS } from '../types/folderNote';
import { containsUnresolvedTemplateExpression, EXCALIDRAW_BASENAME_SUFFIX, isExcalidrawFile, stripExcalidrawSuffix } from './fileNameUtils';
import { casefold, findMatchingRecordKey } from './recordUtils';
import { type FolderNoteNameSettings, resolveFolderNoteName } from './folderNoteName';

// Lookup-only helpers used by startup services. Creation and opening behavior stays in folderNotes.ts.

/**
 * Settings required for detecting folder notes
 */
export interface FolderNoteDetectionSettings extends FolderNoteNameSettings {
    enableFolderNotes: boolean;
}

/**
 * Extracts folder note detection settings from a larger settings object.
 */
export function getFolderNoteDetectionSettings(settings: FolderNoteDetectionSettings): FolderNoteDetectionSettings {
    return {
        enableFolderNotes: settings.enableFolderNotes,
        folderNoteNamePattern: settings.folderNoteNamePattern
    };
}

/** A valid authored title is identity; untitled/non-Markdown notes retain filename lookup. */
export function getFolderNoteTitle(file: TFile, metadataCache?: Pick<MetadataCache, 'getFileCache'>): string | null {
    if (file.extension !== 'md') return null;
    const frontmatter = metadataCache?.getFileCache(file)?.frontmatter;
    if (!frontmatter) return null;
    const key = findMatchingRecordKey(frontmatter, 'title');
    const value: unknown = key ? frontmatter[key] : undefined;
    if (typeof value !== 'string' || !value.trim() || containsUnresolvedTemplateExpression(value)) return null;
    return value.trim();
}

/** Set of file extensions that are valid for folder notes */
const SUPPORTED_FOLDER_NOTE_EXTENSIONS = new Set<string>(Object.values(FOLDER_NOTE_TYPE_EXTENSIONS));

interface RootFolderNoteVault {
    getName?: () => string;
}

export function resolveRootFolderNoteSourceName(_folder: TFolder, _vaultOverride?: RootFolderNoteVault): string {
    // Keep the root convention stable across vault renames and custom display names.
    // The arguments remain part of the public helper signature for existing callers.
    return 'Vault';
}

/**
 * Returns the preferred root source name followed by the pre-5.25 vault-name
 * convention when it differs. New notes use `Vault`; lookup keeps existing
 * root folder notes working without a rename migration.
 */
export function resolveRootFolderNoteSourceNames(folder: TFolder, vaultOverride?: RootFolderNoteVault): string[] {
    const sourceNames = [resolveRootFolderNoteSourceName(folder, vaultOverride)];
    const vault = vaultOverride ?? (folder as TFolder & { vault?: RootFolderNoteVault }).vault;
    const vaultName = typeof vault?.getName === 'function' ? vault.getName().trim() : '';
    const folderName = typeof folder.name === 'string' ? folder.name.trim() : '';
    const legacyName = vaultName || (folderName !== '/' ? folderName : '');

    if (legacyName && !sourceNames.includes(legacyName)) {
        sourceNames.push(legacyName);
    }

    return sourceNames;
}

/** Preferred and backward-compatible candidate names for one folder. */
export function resolveFolderNoteNamesForFolder(folder: TFolder, settings: FolderNoteNameSettings): string[] {
    const sourceNames = folder.path === '/' ? resolveRootFolderNoteSourceNames(folder) : [folder.name];
    return [...new Set(sourceNames.map(sourceName => resolveFolderNoteName(sourceName, settings)))];
}

export function resolveFolderNoteNameForFolder(folder: TFolder, settings: FolderNoteNameSettings): string {
    return resolveFolderNoteNamesForFolder(folder, settings)[0] ?? resolveFolderNoteName('Vault', settings);
}

/** Cheap preflight before resolving a folder note after one file's metadata changes. */
export function couldMetadataChangeFolderNoteIdentity(
    file: TFile,
    folder: TFolder,
    settings: FolderNoteDetectionSettings,
    metadataCache: Pick<MetadataCache, 'getFileCache'>,
    previousFolderNotePath: string | null
): boolean {
    if (!settings.enableFolderNotes || !SUPPORTED_FOLDER_NOTE_EXTENSIONS.has(file.extension)) return false;
    if (file.path === previousFolderNotePath) return true;

    const title = getFolderNoteTitle(file, metadataCache);
    return resolveFolderNoteNamesForFolder(folder, settings).some(expectedName => {
        return (
            (title !== null && casefold(title) === casefold(expectedName)) ||
            file.basename === expectedName ||
            (file.extension === 'md' && file.basename === `${expectedName}${EXCALIDRAW_BASENAME_SUFFIX}`)
        );
    });
}

/**
 * Checks if a file extension is supported for folder notes
 * @param extension - The file extension to check
 * @returns True if the extension is supported
 */
export function isSupportedFolderNoteExtension(extension: string): boolean {
    return SUPPORTED_FOLDER_NOTE_EXTENSIONS.has(extension);
}

/**
 * Gets the folder note for a folder if it exists
 * @param folder - The folder to check for a folder note
 * @param settings - Settings for folder note detection
 * @returns The folder note file or null if not found
 */
function getFolderNoteForExpectedName(
    folder: TFolder,
    expectedName: string,
    metadataCache?: Pick<MetadataCache, 'getFileCache'>
): TFile | null {
    const titleMatches: TFile[] = [];
    for (const child of folder.children ?? []) {
        if (!(child instanceof TFile) || child.parent?.path !== folder.path) continue;
        const title = getFolderNoteTitle(child, metadataCache);
        if (title !== null && casefold(title) === casefold(expectedName)) titleMatches.push(child);
    }
    // Do not silently choose between two notes with the same authored title.
    if (titleMatches.length > 0) return titleMatches.length === 1 ? titleMatches[0] : null;

    const prefix = folder.path === '/' ? '' : `${folder.path}/`;
    const exactCandidates: TFile[] = [];

    for (const extension of Object.values(FOLDER_NOTE_TYPE_EXTENSIONS)) {
        const candidatePath = normalizePath(`${prefix}${expectedName}.${extension}`);
        const candidate = folder.vault.getAbstractFileByPath(candidatePath);

        if (!(candidate instanceof TFile) || candidate.parent?.path !== folder.path) {
            continue;
        }

        if (!SUPPORTED_FOLDER_NOTE_EXTENSIONS.has(candidate.extension)) {
            continue;
        }

        if (candidate.basename === expectedName && !getFolderNoteTitle(candidate, metadataCache)) {
            exactCandidates.push(candidate);
        }
    }

    let excalidrawCandidate: TFile | null = null;
    const excalidrawPath = normalizePath(`${prefix}${expectedName}${EXCALIDRAW_BASENAME_SUFFIX}.md`);
    const abstractExcalidrawCandidate = folder.vault.getAbstractFileByPath(excalidrawPath);
    if (abstractExcalidrawCandidate instanceof TFile && abstractExcalidrawCandidate.parent?.path === folder.path) {
        if (
            !getFolderNoteTitle(abstractExcalidrawCandidate, metadataCache) &&
            isExcalidrawFile(abstractExcalidrawCandidate) &&
            stripExcalidrawSuffix(abstractExcalidrawCandidate.basename) === expectedName
        ) {
            excalidrawCandidate = abstractExcalidrawCandidate;
        }
    }

    if (exactCandidates.length === 1) {
        return exactCandidates[0];
    }

    if (exactCandidates.length > 1) {
        const candidatePaths = new Set<string>(exactCandidates.map(candidate => candidate.path));
        for (const child of folder.children ?? []) {
            if (!(child instanceof TFile)) {
                continue;
            }

            if (child.parent?.path !== folder.path) {
                continue;
            }

            if (!candidatePaths.has(child.path)) {
                continue;
            }

            return child;
        }

        return exactCandidates[0] ?? null;
    }

    return excalidrawCandidate;
}

export function getFolderNote(
    folder: TFolder,
    settings: FolderNoteDetectionSettings,
    metadataCache?: Pick<MetadataCache, 'getFileCache'>
): TFile | null {
    if (!settings.enableFolderNotes) {
        return null;
    }

    for (const expectedName of resolveFolderNoteNamesForFolder(folder, settings)) {
        const folderNote = getFolderNoteForExpectedName(folder, expectedName, metadataCache);
        if (folderNote) {
            return folderNote;
        }
    }

    return null;
}

/**
 * Checks if a file is a folder note for a given folder
 * @param file - The file to check
 * @param folder - The folder to check against
 * @param settings - Settings for folder note detection
 * @returns True if the file is a folder note for the given folder
 */
export function isFolderNote(
    file: TFile,
    folder: TFolder,
    settings: FolderNoteDetectionSettings,
    metadataCache?: Pick<MetadataCache, 'getFileCache'>
): boolean {
    if (!settings.enableFolderNotes) {
        return false;
    }

    if (!SUPPORTED_FOLDER_NOTE_EXTENSIONS.has(file.extension)) {
        return false;
    }

    if (file.parent?.path !== folder.path) {
        return false;
    }

    // A folder has one active folder note. This keeps the preferred root `Vault`
    // convention exclusive when a legacy vault-name note is also present and
    // preserves the normal extension/Excalidraw precedence from getFolderNote().
    return getFolderNote(folder, settings, metadataCache)?.path === file.path;
}
