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

import { getAllTags, TFile, TFolder, type App, type CachedMetadata, type EventRef } from 'obsidian';
import { casefold } from './recordUtils';
import { hasValidTagCharacters, normalizeTagPath } from './tagUtils';
import { isReservedVirtualTagPath } from './virtualTagCollections';
import type { TagTreeNode } from '../types/storage';

export type TagNoteResolutionStatus = 'invalid' | 'missing' | 'ambiguous' | 'found';

/**
 * Result of resolving a tag note. A tag note is deliberately derived from ordinary note data:
 * it has no separate identifier or persisted association.
 */
export interface TagNoteResolution {
    status: TagNoteResolutionStatus;
    normalizedTagPath: string | null;
    displayTagPath: string | null;
    basename: string | null;
    matches: readonly TFile[];
    file: TFile | null;
}

/** Ephemeral all-vault lookup shared by rendered navigation rows. */
export interface TagNoteIndex {
    matchesByTagAndBasename: ReadonlyMap<string, readonly TFile[]>;
}

type TagNoteIndexListener = () => void;

interface TagNoteFileContribution {
    file: TFile;
    keys: ReadonlySet<string>;
}

const tagNoteIndexStores = new WeakMap<App, TagNoteIndexStore>();

function stripOptionalTagPrefix(value: string): string {
    const trimmed = value.trim();
    return trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
}

/**
 * Returns the final display segment used as a tag note's exact basename.
 */
export function resolveTagNoteBasename(displayTagPath: string): string | null {
    const unprefixed = stripOptionalTagPrefix(displayTagPath);
    if (!hasValidTagCharacters(unprefixed)) {
        return null;
    }

    const segments = unprefixed.split('/');
    const basename = segments[segments.length - 1]?.trim() ?? '';
    return basename.length > 0 ? basename : null;
}

function invalidResolution(): TagNoteResolution {
    return {
        status: 'invalid',
        normalizedTagPath: null,
        displayTagPath: null,
        basename: null,
        matches: [],
        file: null
    };
}

interface ValidTagNoteTarget {
    normalizedTagPath: string;
    displayTagPath: string;
    basename: string;
}

function resolveTagNoteTarget(tagPath: string, displayTagPath: string): ValidTagNoteTarget | null {
    const rawTagPath = stripOptionalTagPrefix(tagPath);
    const normalizedTagPath = normalizeTagPath(rawTagPath);
    if (!normalizedTagPath || !hasValidTagCharacters(rawTagPath) || isReservedVirtualTagPath(rawTagPath)) {
        return null;
    }

    const rawDisplayTagPath = stripOptionalTagPrefix(displayTagPath);
    const normalizedDisplayTagPath = normalizeTagPath(rawDisplayTagPath);
    const basename = resolveTagNoteBasename(rawDisplayTagPath);
    if (!basename || normalizedDisplayTagPath !== normalizedTagPath) {
        return null;
    }

    return { normalizedTagPath, displayTagPath: rawDisplayTagPath, basename };
}

function createIndexKey(normalizedTagPath: string, basename: string): string {
    return `${normalizedTagPath}\u0000${casefold(basename)}`;
}

function getTagNoteIndexKeys(file: TFile, metadata: CachedMetadata | null): Set<string> {
    const keys = new Set<string>();
    if (file.extension.toLowerCase() !== 'md' || !metadata) {
        return keys;
    }

    const tags = getAllTags(metadata);
    if (!tags) {
        return keys;
    }

    const normalizedFileBasename = casefold(file.basename);
    for (const tag of tags) {
        const normalizedTagPath = normalizeTagPath(tag);
        const tagBasename = resolveTagNoteBasename(tag);
        if (
            !normalizedTagPath ||
            !tagBasename ||
            isReservedVirtualTagPath(normalizedTagPath) ||
            casefold(tagBasename) !== normalizedFileBasename
        ) {
            continue;
        }

        keys.add(createIndexKey(normalizedTagPath, tagBasename));
    }

    return keys;
}

function haveSameKeys(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
    if (left.size !== right.size) {
        return false;
    }
    for (const key of left) {
        if (!right.has(key)) {
            return false;
        }
    }
    return true;
}

function createResolvedTagNoteResult(
    normalizedTagPath: string,
    displayTagPath: string,
    basename: string,
    matches: TFile[]
): TagNoteResolution {
    matches.sort((left, right) => casefold(left.path).localeCompare(casefold(right.path)));
    return {
        status: matches.length === 0 ? 'missing' : matches.length === 1 ? 'found' : 'ambiguous',
        normalizedTagPath,
        displayTagPath,
        basename,
        matches,
        file: matches.length === 1 ? (matches[0] ?? null) : null
    };
}

/**
 * Resolves a Markdown tag note by convention.
 *
 * A file is a match only when its basename equals the final display-tag segment
 * case-insensitively and its cached metadata contains that exact full tag. Parent
 * or descendant tags do not count. Multiple matches fail closed as ambiguous.
 */
export function resolveTagNote(app: App, tagPath: string, displayTagPath: string = tagPath): TagNoteResolution {
    const sharedStore = tagNoteIndexStores.get(app);
    const index = sharedStore?.hasSubscribers() ? sharedStore.getIndex() : createTagNoteIndex(app);
    return resolveTagNoteFromIndex(index, tagPath, displayTagPath);
}

/** Returns the uniquely resolved tag note, or null when none can be selected safely. */
export function getTagNote(app: App, tagPath: string, displayTagPath: string = tagPath): TFile | null {
    return resolveTagNote(app, tagPath, displayTagPath).file;
}

/** Builds one transient tag-note index from Obsidian's complete Markdown/tag cache. */
export function createTagNoteIndex(app: App): TagNoteIndex {
    const mutableMatches = new Map<string, Set<TFile>>();

    for (const file of app.vault.getMarkdownFiles()) {
        for (const key of getTagNoteIndexKeys(file, app.metadataCache.getFileCache(file))) {
            const matches = mutableMatches.get(key) ?? new Set<TFile>();
            matches.add(file);
            mutableMatches.set(key, matches);
        }
    }

    return {
        matchesByTagAndBasename: new Map(Array.from(mutableMatches, ([key, matches]) => [key, Array.from(matches)] as const))
    };
}

/**
 * Event-driven all-vault tag-note index shared by React consumers for one Obsidian app.
 *
 * Ordinary file/cache changes update only the affected Markdown contribution. Global
 * metadata resolution and folder-level structural changes invalidate the index for one
 * lazy all-vault rebuild, so render churn does not repeatedly scan the vault.
 */
export class TagNoteIndexStore {
    private readonly listeners = new Set<TagNoteIndexListener>();
    private readonly contributionsByPath = new Map<string, TagNoteFileContribution>();
    private readonly contributionPathByFile = new Map<TFile, string>();
    private readonly matchesByKey = new Map<string, Map<string, TFile>>();
    private vaultEventRefs: EventRef[] = [];
    private metadataEventRefs: EventRef[] = [];
    private snapshot: TagNoteIndex | null = null;
    private needsFullRebuild = true;
    private metadataChangedSinceLastResolved = false;
    private revision = 0;

    constructor(private readonly app: App) {}

    getRevision(): number {
        return this.revision;
    }

    hasSubscribers(): boolean {
        return this.listeners.size > 0;
    }

    getIndex(): TagNoteIndex {
        if (this.needsFullRebuild) {
            this.rebuild();
        }

        if (!this.snapshot) {
            this.snapshot = {
                matchesByTagAndBasename: new Map(
                    Array.from(this.matchesByKey, ([key, matches]) => [key, Array.from(matches.values())] as const)
                )
            };
        }
        return this.snapshot;
    }

    subscribe(listener: TagNoteIndexListener): () => void {
        const shouldStartListening = this.listeners.size === 0;
        this.listeners.add(listener);
        if (shouldStartListening) {
            this.startListening();
        }

        return () => {
            this.listeners.delete(listener);
            if (this.listeners.size === 0) {
                this.stopListening();
            }
        };
    }

    private startListening(): void {
        this.vaultEventRefs = [
            this.app.vault.on('create', file => {
                if (file instanceof TFile) {
                    this.refreshFile(file);
                }
            }),
            this.app.vault.on('delete', file => {
                if (file instanceof TFile) {
                    this.removeFile(file.path);
                } else if (file instanceof TFolder) {
                    this.invalidateAll();
                }
            }),
            this.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFile) {
                    this.renameFile(file, oldPath);
                } else if (file instanceof TFolder) {
                    this.invalidateAll();
                }
            })
        ];
        this.metadataEventRefs = [
            this.app.metadataCache.on('changed', (file, _data, cache) => {
                this.metadataChangedSinceLastResolved = true;
                this.refreshFile(file, cache);
            }),
            this.app.metadataCache.on('resolved', () => {
                // Obsidian follows ordinary per-file `changed` notifications with
                // `resolved`. The incremental update is already authoritative, so
                // do not turn every normal save into a full-vault rescan.
                if (this.metadataChangedSinceLastResolved) {
                    this.metadataChangedSinceLastResolved = false;
                    return;
                }
                this.invalidateAll();
            })
        ];

        // The first snapshot is read during render, before React attaches this
        // subscription. Revalidate once after attaching listeners so an event in
        // that gap cannot leave a stale index behind.
        this.needsFullRebuild = true;
        this.snapshot = null;
        this.revision += 1;
    }

    private stopListening(): void {
        this.vaultEventRefs.forEach(ref => this.app.vault.offref(ref));
        this.metadataEventRefs.forEach(ref => this.app.metadataCache.offref(ref));
        this.vaultEventRefs = [];
        this.metadataEventRefs = [];
        this.metadataChangedSinceLastResolved = false;

        // Events can occur while there are no mounted consumers. Force the next
        // consumer to take one fresh snapshot rather than serving stale matches.
        this.needsFullRebuild = true;
        this.snapshot = null;
    }

    private rebuild(): void {
        this.contributionsByPath.clear();
        this.contributionPathByFile.clear();
        this.matchesByKey.clear();

        for (const file of this.app.vault.getMarkdownFiles()) {
            this.addFileContribution(file, getTagNoteIndexKeys(file, this.app.metadataCache.getFileCache(file)));
        }

        this.needsFullRebuild = false;
        this.snapshot = null;
    }

    private refreshFile(file: TFile, metadata: CachedMetadata | null = this.app.metadataCache.getFileCache(file)): void {
        if (file.extension.toLowerCase() !== 'md' || this.needsFullRebuild) {
            return;
        }

        const nextKeys = getTagNoteIndexKeys(file, metadata);
        const formerPath = this.contributionPathByFile.get(file);
        const moved = formerPath !== undefined && formerPath !== file.path ? this.removeFileContribution(formerPath) : false;
        const previous = this.contributionsByPath.get(file.path);
        if (!moved && previous?.file === file && haveSameKeys(previous.keys, nextKeys)) {
            return;
        }

        const changed = this.removeFileContribution(file.path);
        this.addFileContribution(file, nextKeys);
        if (moved || changed || nextKeys.size > 0) {
            this.publishChange();
        }
    }

    private renameFile(file: TFile, oldPath: string): void {
        if (this.needsFullRebuild) {
            return;
        }

        const removed = this.removeFileContribution(oldPath);
        const nextKeys = getTagNoteIndexKeys(file, this.app.metadataCache.getFileCache(file));
        this.addFileContribution(file, nextKeys);
        if (removed || nextKeys.size > 0) {
            this.publishChange();
        }
    }

    private removeFile(path: string): void {
        if (this.needsFullRebuild || !this.removeFileContribution(path)) {
            return;
        }
        this.publishChange();
    }

    private addFileContribution(file: TFile, keys: ReadonlySet<string>): void {
        if (keys.size === 0) {
            return;
        }

        this.contributionsByPath.set(file.path, { file, keys });
        this.contributionPathByFile.set(file, file.path);
        for (const key of keys) {
            const matches = this.matchesByKey.get(key) ?? new Map<string, TFile>();
            matches.set(file.path, file);
            this.matchesByKey.set(key, matches);
        }
    }

    private removeFileContribution(path: string): boolean {
        const contribution = this.contributionsByPath.get(path);
        if (!contribution) {
            return false;
        }

        this.contributionsByPath.delete(path);
        if (this.contributionPathByFile.get(contribution.file) === path) {
            this.contributionPathByFile.delete(contribution.file);
        }
        for (const key of contribution.keys) {
            const matches = this.matchesByKey.get(key);
            if (!matches) {
                continue;
            }
            matches.delete(path);
            if (matches.size === 0) {
                this.matchesByKey.delete(key);
            }
        }
        return true;
    }

    private invalidateAll(): void {
        if (this.needsFullRebuild) {
            return;
        }
        this.needsFullRebuild = true;
        this.snapshot = null;
        this.publishChange();
    }

    private publishChange(): void {
        this.snapshot = null;
        this.revision += 1;
        this.listeners.forEach(listener => listener());
    }
}

/** Returns the shared tag-note index store for one Obsidian app instance. */
export function getTagNoteIndexStore(app: App): TagNoteIndexStore {
    const existing = tagNoteIndexStores.get(app);
    if (existing) {
        return existing;
    }

    const store = new TagNoteIndexStore(app);
    tagNoteIndexStores.set(app, store);
    return store;
}

/** Resolves one tag against a previously built all-vault index. */
export function resolveTagNoteFromIndex(index: TagNoteIndex, tagPath: string, displayTagPath: string = tagPath): TagNoteResolution {
    const target = resolveTagNoteTarget(tagPath, displayTagPath);
    if (!target) {
        return invalidResolution();
    }

    const matches = [...(index.matchesByTagAndBasename.get(createIndexKey(target.normalizedTagPath, target.basename)) ?? [])];
    return createResolvedTagNoteResult(target.normalizedTagPath, target.displayTagPath, target.basename, matches);
}

/**
 * Efficiently resolves a rendered tag-tree node without scanning the vault.
 * `notesWithTag` contains only exact memberships by TagTreeNode contract.
 */
export function resolveTagNoteForNode(app: App, tagNode: TagTreeNode, index?: TagNoteIndex): TagNoteResolution {
    if (index) {
        return resolveTagNoteFromIndex(index, tagNode.path, tagNode.displayPath);
    }

    const target = resolveTagNoteTarget(tagNode.path, tagNode.displayPath);
    if (!target) {
        return invalidResolution();
    }

    const normalizedBasename = casefold(target.basename);
    const matches: TFile[] = [];
    for (const path of tagNode.notesWithTag) {
        const file = app.vault.getFileByPath(path);
        if (file && file.extension.toLowerCase() === 'md' && casefold(file.basename) === normalizedBasename) {
            matches.push(file);
        }
    }

    return createResolvedTagNoteResult(target.normalizedTagPath, target.displayTagPath, target.basename, matches);
}

/** Returns the uniquely resolved tag note for a tree node, or null when resolution is not safe. */
export function getTagNoteForNode(app: App, tagNode: TagTreeNode, index?: TagNoteIndex): TFile | null {
    return resolveTagNoteForNode(app, tagNode, index).file;
}
