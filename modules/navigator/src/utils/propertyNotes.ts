import { TFile, TFolder, type App } from 'obsidian';
import { useCallback, useSyncExternalStore } from 'react';
import { normalizePropertyNodeId, parsePropertyNodeId } from './propertyTree';
import { casefold } from './recordUtils';
import type { SelectionDispatch } from '../context/selection/types';
import { openTagNoteFile } from './tagNoteNavigation';

/** Property notes match the entire property key/value label, without requiring metadata on the note. */
export type PropertyNoteIndex = ReadonlyMap<string, readonly TFile[]>;

export function resolvePropertyNoteFromIndex(index: PropertyNoteIndex, nodeId: string): TFile | null {
    const target = parsePropertyNodeId(nodeId);
    if (!target) return null;
    const matches = index.get(casefold(target.valuePath ?? target.key));
    return matches?.length === 1 ? matches[0] : null;
}

/** One lazy, event-driven filename index per app, shared by rows, headers, and menus. */
export class PropertyNoteIndexStore {
    private listeners = new Set<() => void>();
    private files = new Map<string, TFile>();
    private index: PropertyNoteIndex | null = null;
    private dirty = true;
    private revision = 0;
    private stopEvents: (() => void) | null = null;

    constructor(private readonly app: App) {}

    getRevision = (): number => this.revision;

    getIndex(): PropertyNoteIndex {
        if (this.dirty) {
            this.files = new Map(this.app.vault.getMarkdownFiles().map(file => [file.path, file]));
            this.dirty = false;
        }
        if (!this.index) {
            const index = new Map<string, TFile[]>();
            this.files.forEach(file => {
                const key = casefold(file.basename);
                const matches = index.get(key) ?? [];
                matches.push(file);
                index.set(key, matches);
            });
            this.index = index;
        }
        return this.index;
    }

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        if (!this.stopEvents) {
            const vault = this.app.vault;
            const refs = [
                vault.on('create', file => {
                    if (file instanceof TFile && file.extension.toLowerCase() === 'md') {
                        this.files.set(file.path, file);
                        this.publish();
                    }
                }),
                vault.on('delete', file => {
                    if (this.files.delete(file.path) || file instanceof TFolder) {
                        if (file instanceof TFolder) this.dirty = true;
                        this.publish();
                    }
                }),
                vault.on('rename', (file, oldPath) => {
                    const removed = this.files.delete(oldPath);
                    if (file instanceof TFile && file.extension.toLowerCase() === 'md') {
                        this.files.set(file.path, file);
                        this.publish();
                    } else if (file instanceof TFolder || removed) {
                        if (file instanceof TFolder) this.dirty = true;
                        this.publish();
                    }
                })
            ];
            this.stopEvents = () => refs.forEach(ref => vault.offref(ref));
            this.dirty = true;
            this.publish();
        }
        return () => {
            this.listeners.delete(listener);
            if (!this.listeners.size) {
                this.stopEvents?.();
                this.stopEvents = null;
                this.dirty = true;
                this.index = null;
                this.files.clear();
            }
        };
    };

    resolve(nodeId: string): TFile | null {
        // Menus/keyboard can run without a mounted subscriber; never retain a stale snapshot then.
        if (!this.listeners.size) {
            this.dirty = true;
            this.index = null;
        }
        return resolvePropertyNoteFromIndex(this.getIndex(), nodeId);
    }

    private publish(): void {
        this.index = null;
        this.revision += 1;
        this.listeners.forEach(listener => listener());
    }
}

const stores = new WeakMap<App, PropertyNoteIndexStore>();
export function getPropertyNoteIndexStore(app: App): PropertyNoteIndexStore {
    let store = stores.get(app);
    if (!store) {
        store = new PropertyNoteIndexStore(app);
        stores.set(app, store);
    }
    return store;
}
export function getPropertyNote(app: App, nodeId: string): TFile | null {
    return getPropertyNoteIndexStore(app).resolve(nodeId);
}
export function usePropertyNoteIndex(app: App, enabled: boolean): PropertyNoteIndex | undefined {
    const store = getPropertyNoteIndexStore(app);
    const subscribe = useCallback((listener: () => void) => (enabled ? store.subscribe(listener) : () => {}), [enabled, store]);
    const getSnapshot = useCallback(() => (enabled ? store.getRevision() : -1), [enabled, store]);
    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return enabled ? store.getIndex() : undefined;
}
export function revealPropertyNoteInNavigator(dispatch: SelectionDispatch, file: TFile, nodeId: string): void {
    const targetProperty = normalizePropertyNodeId(nodeId);
    if (targetProperty) dispatch({ type: 'REVEAL_FILE', file, targetProperty, source: 'manual' });
}
/** Reuse the established navigation-note destinations and command queue. */
export function openPropertyNoteFile({
    propertyNote,
    ...options
}: Omit<Parameters<typeof openTagNoteFile>[0], 'tagNote'> & { propertyNote: TFile }): Promise<void> {
    return openTagNoteFile({ ...options, tagNote: propertyNote });
}
