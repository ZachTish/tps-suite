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

import { useEffect, useMemo, useState } from 'react';
import { TAbstractFile, TFile, TFolder, Vault, type MetadataCache } from 'obsidian';
import { getFolderNoteTitle } from '../utils/folderNoteLookup';
import { casefold } from '../utils/recordUtils';

interface UseSelectedFolderFileVersionOptions {
    includeAncestors?: boolean;
    metadataCache?: MetadataCache;
}

const WATCH_PATH_SEPARATOR = '\u0000';

function getParentPath(path: string): string {
    // Returns "/" for root-level files and the folder path for nested files.
    const separatorIndex = path.lastIndexOf('/');
    if (separatorIndex <= 0) {
        return '/';
    }

    return path.slice(0, separatorIndex);
}

export function getSelectedFolderFileWatchPaths(selectedFolder: TFolder, includeAncestors = false): Set<string> {
    const paths = new Set<string>();
    let folder: TFolder | null = selectedFolder;

    while (folder) {
        paths.add(folder.path);

        if (!includeAncestors) {
            break;
        }

        folder = folder.parent instanceof TFolder ? folder.parent : null;
    }

    return paths;
}

export function getSelectedFolderFileWatchPathSignature(selectedFolder: TFolder | null, includeAncestors: boolean): string | null {
    if (!selectedFolder) {
        return null;
    }

    return Array.from(getSelectedFolderFileWatchPaths(selectedFolder, includeAncestors)).join(WATCH_PATH_SEPARATOR);
}

function getWatchPathsFromSignature(signature: string): Set<string> {
    return new Set(signature.split(WATCH_PATH_SEPARATOR));
}

function getFolderNoteTitleContribution(file: TFile, metadataCache?: MetadataCache): string | null {
    const title = getFolderNoteTitle(file, metadataCache);
    return title === null ? null : casefold(title);
}

export function isWatchedFolderFileChange(file: TAbstractFile, watchedFolderPaths: ReadonlySet<string>, oldPath?: string): boolean {
    if (file instanceof TFolder) {
        if (typeof oldPath !== 'string') {
            return false;
        }

        return watchedFolderPaths.has(oldPath) || watchedFolderPaths.has(file.path);
    }

    // Folder notes are files; other folder create/delete events are ignored here.
    if (!(file instanceof TFile)) {
        return false;
    }

    if (watchedFolderPaths.has(getParentPath(file.path))) {
        return true;
    }

    if (typeof oldPath !== 'string') {
        return false;
    }

    return watchedFolderPaths.has(getParentPath(oldPath));
}

export function useSelectedFolderFileVersion(
    vault: Vault,
    selectedFolder: TFolder | null,
    enabled: boolean,
    options?: UseSelectedFolderFileVersionOptions
): number {
    // Monotonic counter used by memo dependencies in header/title components.
    const [version, setVersion] = useState(0);
    const metadataCache = options?.metadataCache;
    const includeAncestors = options?.includeAncestors === true;
    const watchedFolderPathSignature = getSelectedFolderFileWatchPathSignature(selectedFolder, includeAncestors);

    const observations = useMemo(() => {
        if (!enabled || !watchedFolderPathSignature) {
            return null;
        }

        const watchedFolderPaths = getWatchPathsFromSignature(watchedFolderPathSignature);
        // Only authored title changes can change folder-note identity without a
        // create/delete/rename. Retain each watched file's title contribution for
        // this subscription, including ambiguous candidates and cold metadata.
        // Seed before the consumer resolves its folder note, not in the passive
        // effect, which could observe newer titles than the displayed render.
        // One initial sibling pass avoids repeating the complete folder-note
        // resolution after every unchanged body/Sync metadata event.
        const observedTitles = new WeakMap<TFile, string | null>();
        if (metadataCache) {
            watchedFolderPaths.forEach(path => {
                const folder = vault.getFolderByPath(path);
                folder?.children.forEach(file => {
                    if (file instanceof TFile && vault.getFileByPath(file.path) === file) {
                        observedTitles.set(file, getFolderNoteTitleContribution(file, metadataCache));
                    }
                });
            });
        }
        return { watchedFolderPaths, observedTitles };
    }, [enabled, vault, metadataCache, watchedFolderPathSignature]);

    useEffect(() => {
        if (!observations) return;
        const { watchedFolderPaths, observedTitles } = observations;
        const observeCurrentFile = (file: TFile) => {
            if (!metadataCache) return;
            if (watchedFolderPaths.has(getParentPath(file.path)) && vault.getFileByPath(file.path) === file) {
                observedTitles.set(file, getFolderNoteTitleContribution(file, metadataCache));
            } else {
                observedTitles.delete(file);
            }
        };

        // Increments when direct child files are created, deleted, or renamed
        // inside watched folders, or when a watched folder is renamed.
        const handleFileChange = (file: TAbstractFile, oldPath?: string) => {
            if (!isWatchedFolderFileChange(file, watchedFolderPaths, oldPath)) {
                return;
            }

            if (file instanceof TFile) observeCurrentFile(file);
            setVersion(current => current + 1);
        };

        const createRef = vault.on('create', file => {
            handleFileChange(file);
        });
        const deleteRef = vault.on('delete', file => {
            handleFileChange(file);
        });
        const renameRef = vault.on('rename', (file, oldPath) => {
            handleFileChange(file, oldPath);
        });

        const metadataRef = metadataCache?.on('changed', file => {
            if (!isWatchedFolderFileChange(file, watchedFolderPaths) || vault.getFileByPath(file.path) !== file) {
                return;
            }
            const nextTitle = getFolderNoteTitleContribution(file, metadataCache);
            const wasObserved = observedTitles.has(file);
            const previousTitle = observedTitles.get(file);
            observedTitles.set(file, nextTitle);
            if (wasObserved && previousTitle === nextTitle) return;
            setVersion(current => current + 1);
        });

        return () => {
            if (metadataRef) metadataCache?.offref(metadataRef);
            vault.offref(createRef);
            vault.offref(deleteRef);
            vault.offref(renameRef);
        };
    }, [vault, metadataCache, observations]);

    return version;
}
