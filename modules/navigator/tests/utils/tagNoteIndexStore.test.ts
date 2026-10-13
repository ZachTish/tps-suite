/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { App, TFolder, type CachedMetadata, type EventRef, type TFile } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { getTagNote, getTagNoteIndexStore, resolveTagNoteFromIndex, TagNoteIndexStore } from '../../src/utils/tagNotes';
import { createTestTFile } from '../utils/createTestTFile';

type EventListener = (...args: unknown[]) => void;

interface EventRegistration {
    name: string;
    listener: EventListener;
}

interface TagNoteIndexHarness {
    app: App;
    metadataByPath: Map<string, CachedMetadata>;
    getMarkdownFiles: ReturnType<typeof vi.fn>;
    vaultOffref: ReturnType<typeof vi.fn>;
    metadataOffref: ReturnType<typeof vi.fn>;
    triggerVault: (name: 'create' | 'delete' | 'rename', ...args: unknown[]) => void;
    triggerMetadata: (name: 'changed' | 'resolved', ...args: unknown[]) => void;
}

function createEventRegistry(): {
    on: (name: string, listener: EventListener) => EventRef;
    offref: ReturnType<typeof vi.fn>;
    trigger: (name: string, ...args: unknown[]) => void;
} {
    const registrations = new Map<EventRef, EventRegistration>();
    const on = (name: string, listener: EventListener): EventRef => {
        const ref = {} as EventRef;
        registrations.set(ref, { name, listener });
        return ref;
    };
    const offref = vi.fn((ref: EventRef) => {
        registrations.delete(ref);
    });
    const trigger = (name: string, ...args: unknown[]) => {
        Array.from(registrations.values())
            .filter(registration => registration.name === name)
            .forEach(registration => registration.listener(...args));
    };
    return { on, offref, trigger };
}

function createHarness(): TagNoteIndexHarness {
    const app = new App();
    const metadataByPath = new Map<string, CachedMetadata>();
    const vaultEvents = createEventRegistry();
    const metadataEvents = createEventRegistry();

    Object.defineProperty(app.vault, 'on', { configurable: true, value: vaultEvents.on });
    Object.defineProperty(app.vault, 'offref', { configurable: true, value: vaultEvents.offref });
    Object.defineProperty(app.metadataCache, 'on', { configurable: true, value: metadataEvents.on });
    Object.defineProperty(app.metadataCache, 'offref', { configurable: true, value: metadataEvents.offref });
    app.metadataCache.getFileCache = file => metadataByPath.get(file.path) ?? null;

    const originalGetMarkdownFiles = app.vault.getMarkdownFiles.bind(app.vault);
    const getMarkdownFiles = vi.fn(() => originalGetMarkdownFiles());
    app.vault.getMarkdownFiles = getMarkdownFiles;

    return {
        app,
        metadataByPath,
        getMarkdownFiles,
        vaultOffref: vaultEvents.offref,
        metadataOffref: metadataEvents.offref,
        triggerVault: (name, ...args) => vaultEvents.trigger(name, ...args),
        triggerMetadata: (name, ...args) => metadataEvents.trigger(name, ...args)
    };
}

function registerMarkdownFile(harness: TagNoteIndexHarness, path: string, tags: string[] = []): TFile {
    const file = createTestTFile(path);
    (harness.app.vault as unknown as { registerFile: (target: TFile) => void }).registerFile(file);
    harness.metadataByPath.set(path, { frontmatter: { tags } });
    return file;
}

function unregisterMarkdownFile(harness: TagNoteIndexHarness, path: string): void {
    (harness.app.vault as unknown as { unregisterFile: (targetPath: string) => void }).unregisterFile(path);
    harness.metadataByPath.delete(path);
}

function renameMarkdownFile(harness: TagNoteIndexHarness, file: TFile, nextPath: string): string {
    const oldPath = file.path;
    const metadata = harness.metadataByPath.get(oldPath);
    unregisterMarkdownFile(harness, oldPath);
    (file as TFile & { setPath: (path: string) => void }).setPath(nextPath);
    (harness.app.vault as unknown as { registerFile: (target: TFile) => void }).registerFile(file);
    if (metadata) {
        harness.metadataByPath.set(nextPath, metadata);
    }
    return oldPath;
}

describe('TagNoteIndexStore lifecycle', () => {
    it('shares one store across navigator surfaces for the same app', () => {
        const app = new App();

        expect(getTagNoteIndexStore(app)).toBe(getTagNoteIndexStore(app));
        expect(getTagNoteIndexStore(new App())).not.toBe(getTagNoteIndexStore(app));
    });

    it('updates qualifying hidden notes incrementally when cached tags change', () => {
        const harness = createHarness();
        const file = registerMarkdownFile(harness, 'Hidden/Active.md');
        const store = getTagNoteIndexStore(harness.app);
        const listener = vi.fn();

        expect(resolveTagNoteFromIndex(store.getIndex(), 'projects/active', 'Projects/Active').status).toBe('missing');
        expect(harness.getMarkdownFiles).toHaveBeenCalledOnce();
        const unsubscribe = store.subscribe(listener);
        // Mirrors useSyncExternalStore's post-subscribe snapshot check and render.
        store.getIndex();
        expect(harness.getMarkdownFiles).toHaveBeenCalledTimes(2);

        const matchingMetadata = { frontmatter: { tags: ['Projects/Active'] } };
        harness.metadataByPath.set(file.path, matchingMetadata);
        harness.triggerMetadata('changed', file, '', matchingMetadata);
        harness.triggerMetadata('resolved');

        expect(listener).toHaveBeenCalledOnce();
        expect(resolveTagNoteFromIndex(store.getIndex(), 'projects/active', 'Projects/Active').file).toBe(file);
        expect(getTagNote(harness.app, 'projects/active', 'Projects/Active')).toBe(file);
        expect(harness.getMarkdownFiles).toHaveBeenCalledTimes(2);

        const nonMatchingMetadata = { frontmatter: { tags: ['Projects/Done'] } };
        harness.metadataByPath.set(file.path, nonMatchingMetadata);
        harness.triggerMetadata('changed', file, '', nonMatchingMetadata);
        harness.triggerMetadata('resolved');

        expect(listener).toHaveBeenCalledTimes(2);
        expect(resolveTagNoteFromIndex(store.getIndex(), 'projects/active', 'Projects/Active').status).toBe('missing');
        expect(harness.getMarkdownFiles).toHaveBeenCalledTimes(2);

        unsubscribe();
        expect(harness.vaultOffref).toHaveBeenCalledTimes(3);
        expect(harness.metadataOffref).toHaveBeenCalledTimes(2);
    });

    it('updates excluded note creation, deletion, and basename-changing renames without full rescans', () => {
        const harness = createHarness();
        const store = new TagNoteIndexStore(harness.app);
        const listener = vi.fn();

        store.getIndex();
        store.subscribe(listener);
        store.getIndex();

        const created = registerMarkdownFile(harness, 'Excluded/Active.md', ['Projects/Active']);
        harness.triggerVault('create', created);
        expect(resolveTagNoteFromIndex(store.getIndex(), 'projects/active', 'Projects/Active').file).toBe(created);

        unregisterMarkdownFile(harness, created.path);
        harness.triggerVault('delete', created);
        expect(resolveTagNoteFromIndex(store.getIndex(), 'projects/active', 'Projects/Active').status).toBe('missing');

        const renamed = registerMarkdownFile(harness, 'Hidden/Draft.md', ['Projects/Active']);
        harness.triggerVault('create', renamed);
        const oldPath = renameMarkdownFile(harness, renamed, 'Hidden/Active.md');
        harness.triggerVault('rename', renamed, oldPath);

        expect(resolveTagNoteFromIndex(store.getIndex(), 'projects/active', 'Projects/Active').file).toBe(renamed);
        expect(listener).toHaveBeenCalledTimes(3);
        expect(harness.getMarkdownFiles).toHaveBeenCalledTimes(2);
    });

    it('coalesces global cache and folder invalidation into lazy all-vault rebuilds', () => {
        const harness = createHarness();
        const file = registerMarkdownFile(harness, 'Hidden/Active.md');
        const store = new TagNoteIndexStore(harness.app);
        const listener = vi.fn();

        store.getIndex();
        store.subscribe(listener);
        store.getIndex();
        harness.metadataByPath.set(file.path, { frontmatter: { tags: ['Projects/Active'] } });

        harness.triggerMetadata('resolved');
        harness.triggerMetadata('resolved');
        expect(listener).toHaveBeenCalledOnce();
        expect(harness.getMarkdownFiles).toHaveBeenCalledTimes(2);

        expect(resolveTagNoteFromIndex(store.getIndex(), 'projects/active', 'Projects/Active').file).toBe(file);
        expect(harness.getMarkdownFiles).toHaveBeenCalledTimes(3);
        store.getIndex();
        expect(harness.getMarkdownFiles).toHaveBeenCalledTimes(3);

        harness.triggerVault('rename', new TFolder('Hidden'), 'Archive');
        expect(listener).toHaveBeenCalledTimes(2);
        expect(harness.getMarkdownFiles).toHaveBeenCalledTimes(3);
        store.getIndex();
        expect(harness.getMarkdownFiles).toHaveBeenCalledTimes(4);
    });
});
