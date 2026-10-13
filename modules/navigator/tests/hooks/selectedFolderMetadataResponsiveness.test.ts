import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { App, TFile, TFolder } from 'obsidian';
import type { NotebookNavigatorSettings } from '../../src/settings/types';

interface HookSlot {
    value?: unknown;
    dependencies?: readonly unknown[];
    cleanup?: () => void;
}
interface HookRun {
    slots: HookSlot[];
    cursor: number;
    dirty: boolean;
    pending: Array<() => void>;
}
const harness = vi.hoisted(() => ({
    active: null as HookRun | null,
    app: null as App | null,
    settings: null as NotebookNavigatorSettings | null,
    selection: null as Record<string, unknown> | null,
    mobile: true,
    noop: () => {},
    emptyCache: { fileData: { tagTree: new Map() } },
    preferences: { includeDescendantNotes: true },
    uiState: { singlePane: true }
}));

// Execute the actual components and their actual folder-version hook with React-like
// state, memo dependencies and effect cleanup. DOM/paint and unrelated service owners
// are mocked; folder-note resolution and its sibling metadata reads are not mocked.
vi.mock('react', async original => {
    const react = await original<typeof import('react')>();
    const slot = () => {
        const run = harness.active!;
        const index = run.cursor++;
        return { run, value: run.slots[index] ?? (run.slots[index] = {}) };
    };
    const changed = (value: HookSlot, deps: readonly unknown[]) =>
        !value.dependencies ||
        deps.length !== value.dependencies.length ||
        deps.some((dep, index) => !Object.is(dep, value.dependencies![index]));
    const memo = (fn: () => unknown, deps: readonly unknown[]) => {
        const { value } = slot();
        if (changed(value, deps)) {
            value.value = fn();
            value.dependencies = deps;
        }
        return value.value;
    };
    const hooks = {
        memo: <T>(component: T) => component,
        useMemo: memo,
        useCallback: (fn: unknown, deps: readonly unknown[]) => memo(() => fn, deps),
        useRef: (initial: unknown) => memo(() => ({ current: initial }), []),
        useState(initial: unknown) {
            const { run, value } = slot();
            if (!('value' in value)) value.value = typeof initial === 'function' ? (initial as () => unknown)() : initial;
            return [
                value.value,
                (next: unknown) => {
                    const resolved = typeof next === 'function' ? (next as (old: unknown) => unknown)(value.value) : next;
                    if (!Object.is(resolved, value.value)) {
                        value.value = resolved;
                        run.dirty = true;
                    }
                }
            ];
        },
        useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
            const { run, value } = slot();
            if (!changed(value, deps)) return;
            value.dependencies = deps;
            run.pending.push(() => {
                value.cleanup?.();
                value.cleanup = effect() || undefined;
            });
        }
    };
    return { ...react, ...hooks, default: { ...react, ...hooks } };
});
vi.mock('../../src/context/SelectionContext', () => ({
    useSelectionState: () => harness.selection,
    useSelectionDispatch: () => harness.noop
}));
vi.mock('../../src/context/ServicesContext', () => ({
    useServices: () => ({ app: harness.app, plugin: {} }),
    useCommandQueue: () => null
}));
vi.mock('../../src/context/SettingsContext', () => ({ useSettingsState: () => harness.settings }));
vi.mock('../../src/context/UXPreferencesContext', () => ({ useUXPreferences: () => harness.preferences }));
vi.mock('../../src/context/UIStateContext', () => ({ useUIState: () => harness.uiState, useUIDispatch: () => harness.noop }));
vi.mock('../../src/context/StorageContext', () => ({ useFileCache: () => harness.emptyCache }));
vi.mock('../../src/services/icons', () => ({ useIconServiceVersion: () => 0, getIconService: () => ({ renderIcon: harness.noop }) }));
vi.mock('../../src/components/ServiceIcon', () => ({ ServiceIcon: 'mock-service-icon' }));
vi.mock('../../src/components/NavigationNoteLink', () => ({ NavigationNoteLink: 'mock-navigation-note-link' }));
vi.mock('../../src/utils/paneLayout', () => ({ usesMobileChrome: () => harness.mobile }));
vi.mock('../../src/hooks/useTagNoteIndex', () => ({ useTagNoteIndex: () => undefined }));
vi.mock('../../src/utils/propertyNotes', () => ({
    usePropertyNoteIndex: () => undefined,
    getPropertyNote: () => null,
    resolvePropertyNoteFromIndex: () => null,
    openPropertyNoteFile: harness.noop,
    revealPropertyNoteInNavigator: harness.noop
}));
vi.mock('../../src/utils/folderNotes', async () => {
    const lookup = await import('../../src/utils/folderNoteLookup');
    return {
        getFolderNote: lookup.getFolderNote,
        openFolderNoteFile: harness.noop,
        revealFolderNoteInNavigator: harness.noop
    };
});
vi.mock('../../src/hooks/useListActions', () => ({
    useListActions: () => ({
        canCreateNewFile: false,
        canRevealFile: false,
        hasActiveCreationSearch: false,
        handleNewFile: harness.noop,
        handleRevealFile: harness.noop,
        handleAppearanceMenu: harness.noop,
        handleSortMenu: harness.noop,
        handleToggleDescendants: harness.noop,
        getSortIcon: () => 'arrow-down',
        hasAppearanceOrSortSelection: false,
        hasCustomSortOrGroup: false,
        hasCustomAppearance: false
    })
}));

import { ListPaneHeader } from '../../src/components/ListPaneHeader';
import { ListPaneTitleArea } from '../../src/components/ListPaneTitleArea';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { ItemType } from '../../src/types';
import { createTestTFile } from '../utils/createTestTFile';

type EventCallback = (file: TFile, oldPath?: string) => void;
interface EventRefStub {
    event: string;
    callback: EventCallback;
}
function eventSource() {
    const listeners = new Map<string, Set<EventCallback>>();
    return {
        listeners,
        on: (event: string, callback: EventCallback): EventRefStub => {
            const callbacks = listeners.get(event) ?? new Set();
            callbacks.add(callback);
            listeners.set(event, callbacks);
            return { event, callback };
        },
        offref: (ref: EventRefStub) => {
            listeners.get(ref.event)?.delete(ref.callback);
        },
        emit: (event: string, file: TFile, oldPath?: string) => {
            listeners.get(event)?.forEach(callback => callback(file, oldPath));
        }
    };
}
function render<T>(run: HookRun, callback: () => T, beforeInitialCommit?: () => void): T {
    let result!: T;
    for (let pass = 0; pass < 8; pass++) {
        harness.active = run;
        run.cursor = 0;
        run.dirty = false;
        run.pending = [];
        result = callback();
        if (pass === 0) beforeInitialCommit?.();
        run.pending.forEach(effect => effect());
        if (!run.dirty) return result;
    }
    throw Error('Unstable selected-folder consumer render');
}
const mountedRuns: HookRun[] = [];
afterEach(() => {
    mountedRuns.splice(0).forEach(run => run.slots.forEach(slot => slot.cleanup?.()));
    harness.active = null;
    vi.restoreAllMocks();
});

function fixture(
    mode: 'mobile header' | 'desktop title',
    count = 1000,
    initiallyCold = false,
    beforeInitialCommit?: (titles: Map<string, string | null>, files: TFile[]) => void
) {
    const app = new App();
    const folder = new TFolder('Projects');
    Reflect.set(folder, 'name', 'Projects');
    Reflect.set(folder, 'vault', app.vault);
    const filesByPath = new Map<string, TFile>();
    const files = Array.from({ length: count }, (_, index) => {
        const file = createTestTFile(`Projects/Note ${index}.md`);
        Reflect.set(file, 'parent', folder);
        filesByPath.set(file.path, file);
        return file;
    });
    Reflect.set(folder, 'children', files);
    const titles = new Map<string, string | null>(files.map((file, index) => [file.path, index === 0 ? 'Projects' : `Note ${index}`]));
    const coldMetadata = new Set(initiallyCold ? files : []);
    const getFileCache = vi.fn((file: TFile) =>
        coldMetadata.has(file) ? null : { frontmatter: { title: titles.has(file.path) ? titles.get(file.path) : file.basename } }
    );
    const vaultEvents = eventSource();
    const metadataEvents = eventSource();
    Object.assign(app.vault, {
        on: vaultEvents.on,
        offref: vaultEvents.offref,
        getFileByPath: (path: string) => filesByPath.get(path) ?? null,
        getFolderByPath: (path: string) => (path === folder.path ? folder : null),
        getAbstractFileByPath: (path: string) => (path === folder.path ? folder : (filesByPath.get(path) ?? null))
    });
    Object.assign(app.metadataCache, { on: metadataEvents.on, offref: metadataEvents.offref, getFileCache });
    harness.app = app;
    harness.mobile = mode === 'mobile header';
    harness.settings = { ...DEFAULT_SETTINGS, enableFolderNotes: true, enableFolderNoteLinks: true };
    harness.selection = {
        selectionType: ItemType.FOLDER,
        selectedFolder: folder,
        selectedTag: null,
        selectedProperty: null,
        selectedType: null
    };
    const run: HookRun = { slots: [], cursor: 0, dirty: false, pending: [] };
    mountedRuns.push(run);
    const callback =
        mode === 'mobile header'
            ? () =>
                  ListPaneHeader({
                      canToggleGroupExpansion: false,
                      shouldCollapseGroups: false,
                      onToggleGroupExpansion: () => false,
                      desktopTitle: folder.name,
                      breadcrumbSegments: [{ label: folder.name, isLast: true, targetType: 'folder', targetPath: folder.path }],
                      iconName: 'folder',
                      showIcon: false,
                      onResetSearchForNavigation: harness.noop,
                      onRevealFileInActualFolder: () => false
                  })
            : () => ListPaneTitleArea({ desktopTitle: folder.name });
    const renderConsumer = () => render(run, callback);
    render(run, callback, () => beforeInitialCommit?.(titles, files));
    return { app, folder, files, filesByPath, titles, coldMetadata, getFileCache, vaultEvents, metadataEvents, run, renderConsumer };
}

function containsNavigationNoteLink(node: unknown): boolean {
    if (Array.isArray(node)) return node.some(containsNavigationNoteLink);
    if (node === null || typeof node !== 'object') return false;
    const element = node as ReactElement<{ children?: unknown }>;
    return element.type === 'mock-navigation-note-link' || containsNavigationNoteLink(element.props?.children);
}

describe('selected-folder consumers body-edit invalidation', () => {
    it.each(['mobile header', 'desktop title'] as const)('does not rescan 1000 siblings after unchanged body metadata in %s', mode => {
        const f = fixture(mode);
        // One actual folder-note resolution plus one subscription-scoped title
        // observation pass on mount; no persistent/global index is introduced.
        const coldReads = f.getFileCache.mock.calls.length;
        expect(coldReads).toBe(2000);
        f.getFileCache.mockClear();
        f.renderConsumer();
        expect(f.getFileCache).not.toHaveBeenCalled();

        for (let index = 0; index < 20; index++) {
            // Sync or body edits deliver changed metadata with identical authored titles.
            f.metadataEvents.emit('changed', f.files[index + 1]);
            if (f.run.dirty) f.renderConsumer();
        }
        const siblingReads = f.getFileCache.mock.calls.length;
        process.stdout.write(
            `[selected-folder body metadata] ${JSON.stringify({ mode, siblingCount: f.files.length, coldReads, eventCount: 20, siblingReads })}\n`
        );
        // Allow one cheap identity preflight per event, not a complete sibling scan.
        expect(siblingReads).toBeLessThanOrEqual(20);
    });

    it.each(['mobile header', 'desktop title'] as const)(
        'does not rescan siblings after a single batched body metadata burst in %s',
        mode => {
            const f = fixture(mode);
            f.getFileCache.mockClear();
            for (let index = 0; index < 20; index++) {
                f.metadataEvents.emit('changed', f.files[index + 1]);
            }
            // React may batch events delivered in one task. Do not attribute one full
            // resolver pass per event to that case: render this owner only once afterward.
            if (f.run.dirty) f.renderConsumer();
            const siblingReads = f.getFileCache.mock.calls.length;
            process.stdout.write(
                `[selected-folder batched metadata] ${JSON.stringify({ mode, siblingCount: f.files.length, eventCount: 20, siblingReads })}\n`
            );
            expect(siblingReads).toBeLessThanOrEqual(20);
        }
    );

    it.each(['mobile header', 'desktop title'] as const)('still resolves title removal, addition and ambiguity in %s', mode => {
        const f = fixture(mode);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(true);
        f.titles.set(f.files[0].path, null);
        f.metadataEvents.emit('changed', f.files[0]);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(false);
        f.titles.set(f.files[1].path, 'Projects');
        f.metadataEvents.emit('changed', f.files[1]);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(true);
        f.titles.set(f.files[2].path, 'Projects');
        f.metadataEvents.emit('changed', f.files[2]);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(false);
        f.titles.set(f.files[2].path, 'No longer ambiguous');
        f.metadataEvents.emit('changed', f.files[2]);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(true);
    });

    it.each(['mobile header', 'desktop title'] as const)('ignores outside-folder metadata and releases subscriptions in %s', mode => {
        const f = fixture(mode);
        f.getFileCache.mockClear();
        f.metadataEvents.emit('changed', createTestTFile('Other/Unrelated.md'));
        expect(f.run.dirty).toBe(false);
        f.renderConsumer();
        expect(f.getFileCache).not.toHaveBeenCalled();
        expect(f.metadataEvents.listeners.get('changed')?.size).toBe(1);
        f.run.slots.forEach(slot => slot.cleanup?.());
        expect(f.metadataEvents.listeners.get('changed')?.size).toBe(0);
        expect([...f.vaultEvents.listeners.values()].every(callbacks => callbacks.size === 0)).toBe(true);
    });

    it.each(['mobile header', 'desktop title'] as const)('resolves cold metadata when its authored title becomes available in %s', mode => {
        const f = fixture(mode, 40, true);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(false);
        f.coldMetadata.delete(f.files[0]);
        f.metadataEvents.emit('changed', f.files[0]);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(true);
        f.getFileCache.mockClear();
        f.metadataEvents.emit('changed', f.files[0]);
        expect(f.run.dirty).toBe(false);
        expect(f.getFileCache).toHaveBeenCalledTimes(1);
    });

    it.each(['mobile header', 'desktop title'] as const)('compares post-subscription metadata with the rendered snapshot in %s', mode => {
        const f = fixture(mode, 40, false, (titles, files) => {
            // React's passive effect can commit after the metadata changed from
            // the values that the preceding actual consumer render resolved.
            titles.set(files[0].path, null);
        });
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(true);
        f.metadataEvents.emit('changed', f.files[0]);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(false);
        f.getFileCache.mockClear();
        f.metadataEvents.emit('changed', f.files[0]);
        expect(f.run.dirty).toBe(false);
        expect(f.getFileCache).toHaveBeenCalledTimes(1);
    });

    it.each(['mobile header', 'desktop title'] as const)(
        'cleans disabled subscriptions and resolves current titles on re-enable in %s',
        mode => {
            const f = fixture(mode, 40);
            harness.settings = { ...harness.settings!, enableFolderNoteLinks: false };
            expect(containsNavigationNoteLink(f.renderConsumer())).toBe(false);
            expect(f.metadataEvents.listeners.get('changed')?.size).toBe(0);
            expect([...f.vaultEvents.listeners.values()].every(callbacks => callbacks.size === 0)).toBe(true);
            f.getFileCache.mockClear();
            f.titles.set(f.files[0].path, 'No longer the folder note');
            f.titles.set(f.files[1].path, 'Projects');
            f.metadataEvents.emit('changed', f.files[0]);
            expect(f.run.dirty).toBe(false);
            expect(f.getFileCache).not.toHaveBeenCalled();
            harness.settings = { ...harness.settings, enableFolderNoteLinks: true };
            expect(containsNavigationNoteLink(f.renderConsumer())).toBe(true);
            expect(f.metadataEvents.listeners.get('changed')?.size).toBe(1);
            f.getFileCache.mockClear();
            f.metadataEvents.emit('changed', f.files[1]);
            expect(f.run.dirty).toBe(false);
            expect(f.getFileCache).toHaveBeenCalledTimes(1);
            f.titles.set(f.files[1].path, 'Removed while enabled');
            f.metadataEvents.emit('changed', f.files[1]);
            expect(containsNavigationNoteLink(f.renderConsumer())).toBe(false);
        }
    );

    it.each(['mobile header', 'desktop title'] as const)('resolves naming-pattern setting changes without a metadata event in %s', mode => {
        const f = fixture(mode, 40);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(true);
        harness.settings = { ...harness.settings!, folderNoteNamePattern: 'Index' };
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(false);
        f.titles.set(f.files[1].path, 'Index');
        f.metadataEvents.emit('changed', f.files[1]);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(true);
        harness.settings = { ...harness.settings, folderNoteNamePattern: '{{folder}}' };
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(true);
        f.titles.set(f.files[0].path, 'Removed after setting change');
        f.metadataEvents.emit('changed', f.files[0]);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(false);
    });

    it.each(['mobile header', 'desktop title'] as const)('preserves create/delete, rename/move and live file identity in %s', mode => {
        const f = fixture(mode, 40);
        const original = f.files[0];
        f.filesByPath.delete(original.path);
        f.files.splice(f.files.indexOf(original), 1);
        f.vaultEvents.emit('delete', original);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(false);

        const replacement = createTestTFile(original.path);
        Reflect.set(replacement, 'parent', f.folder);
        f.filesByPath.set(replacement.path, replacement);
        f.files.push(replacement);
        f.vaultEvents.emit('create', replacement);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(true);
        f.getFileCache.mockClear();
        f.metadataEvents.emit('changed', original);
        expect(f.run.dirty).toBe(false);
        expect(f.getFileCache).not.toHaveBeenCalled();

        const oldPath = replacement.path;
        f.filesByPath.delete(oldPath);
        Object.assign(replacement, createTestTFile('Projects/Renamed.md'));
        f.filesByPath.set(replacement.path, replacement);
        f.titles.set(replacement.path, 'Projects');
        f.vaultEvents.emit('rename', replacement, oldPath);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(true);

        const renamedPath = replacement.path;
        f.filesByPath.delete(renamedPath);
        Object.assign(replacement, createTestTFile('Archive/Renamed.md'));
        Reflect.set(replacement, 'parent', new TFolder('Archive'));
        f.filesByPath.set(replacement.path, replacement);
        f.files.splice(f.files.indexOf(replacement), 1);
        f.titles.set(replacement.path, 'Projects');
        f.vaultEvents.emit('rename', replacement, renamedPath);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(false);

        const outsidePath = replacement.path;
        f.filesByPath.delete(outsidePath);
        Object.assign(replacement, createTestTFile('Projects/Returned.md'));
        Reflect.set(replacement, 'parent', f.folder);
        f.filesByPath.set(replacement.path, replacement);
        f.files.push(replacement);
        f.titles.set(replacement.path, 'Projects');
        f.vaultEvents.emit('rename', replacement, outsidePath);
        expect(containsNavigationNoteLink(f.renderConsumer())).toBe(true);
    });
});
