import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { App, TFile, TFolder, type Command } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import registerNavigatorCommandHandlers from '../../src/services/commands/navigatorCommandHandlers';
import { createNoteForNavigationTarget } from '../../src/services/navigationNoteCreation';
import { resolveNavigationSearchCreation } from '../../src/services/types/searchResourceCreation';
import { getNavigationSearchQuery } from '../../src/hooks/useListPaneSearch';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { ALL_TAGS_TAG_ID, ItemType, PROPERTIES_ROOT_VIRTUAL_FOLDER_ID, TAGGED_TAG_ID, UNTAGGED_TAG_ID } from '../../src/types';
import { strings } from '../../src/i18n';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';
import type { ManualSortNewFilePlacementContext } from '../../src/utils/manualSort';
import type { NavigationSearchCreationTarget } from '../../src/services/types/searchResourceCreation';
import type { NavigatorListSnapshot } from '../../src/api/types';

/**
 * Execute the real imperative component action without mounting the unrelated
 * navigator tree. AST selection locates executable code; assertions below are
 * exclusively about observable service calls, not source text or syntax.
 */
function loadComponentCreationAction(environment: Record<string, unknown>): (openInNewTab?: boolean) => Promise<void> {
    const source = readFileSync(new URL('../../src/components/NotebookNavigatorComponent.tsx', import.meta.url), 'utf8');
    const parsed = ts.createSourceFile('NotebookNavigatorComponent.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let initializer: ts.Expression | undefined;
    function visit(node: ts.Node): void {
        if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'createNoteInSelectedFolder') {
            initializer = node.initializer;
        }
        ts.forEachChild(node, visit);
    }
    visit(parsed);
    if (!initializer) throw new Error('Component does not expose its creation action');
    const javascript = ts.transpileModule(`const action = ${initializer.getText(parsed)};`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText;
    return runInNewContext(`${javascript}\naction;`, environment) as (openInNewTab?: boolean) => Promise<void>;
}

function fixture(query: string, provider: 'internal' | 'omnisearch' = 'internal') {
    const app = new App();
    const root = app.vault.getRoot();
    const folder = new TFolder('Inbox/QA command context');
    (app.vault as unknown as { registerFolder(folder: TFolder): void }).registerFolder(folder);
    const selectedFile = new TFile('Inbox/Selected.md');
    const activeFile = new TFile('Inbox/Active.md');
    const selectionState = {
        selectionType: ItemType.FOLDER,
        selectedFolder: root,
        selectedTag: null,
        selectedProperty: null,
        selectedType: null,
        selectedFile: selectedFile as TFile | null
    };
    const snapshot: NavigatorListSnapshot = {
        navItem: { type: 'folder', folder: root, tag: null, property: null },
        search: { active: query.length > 0, query, appliedQuery: query, requestedProvider: provider, effectiveProvider: provider },
        presentation: null,
        rows: []
    };
    const manualSortContext: ManualSortNewFilePlacementContext = {
        targetType: 'folder',
        targetKey: '/',
        propertyKey: 'order',
        files: [],
        selectedFilePath: null,
        rankByPath: new Map(),
        placement: 'bottom'
    };
    const fileSystemOps = {
        createNewFile: vi.fn().mockResolvedValue(null),
        createNewFileForTag: vi.fn().mockResolvedValue(null),
        createNewFileForProperty: vi.fn().mockResolvedValue(null)
    };
    const showNotice = vi.fn();
    Object.assign(app, {
        workspace: { getActiveFile: () => activeFile, revealLeaf: vi.fn().mockResolvedValue(undefined) },
        plugins: { plugins: { 'tps-global-context-menu': { api: { ui: { presentCreatedNote: vi.fn() } } } } }
    });
    const action = loadComponentCreationAction({
        app,
        selectionState,
        listPaneRef: { current: { getListSnapshot: () => snapshot, getManualSortNewFileContext: () => manualSortContext } },
        fileSystemOps,
        createNoteForNavigationTarget,
        resolveNavigationSearchCreation,
        showNotice,
        strings,
        ItemType,
        ALL_TAGS_TAG_ID,
        TAGGED_TAG_ID,
        UNTAGGED_TAG_ID,
        PROPERTIES_ROOT_VIRTUAL_FOLDER_ID
    });
    let resolveInvocation: (() => void) | undefined;
    let rejectInvocation: ((error: unknown) => void) | undefined;
    const invocation = new Promise<void>((resolve, reject) => {
        resolveInvocation = resolve;
        rejectInvocation = reject;
    });
    const view = {
        whenReady: vi.fn(),
        navigateToFile: vi.fn(),
        navigateToFolder: vi.fn(),
        stopContentProcessing: vi.fn(),
        createNoteInSelectedFolder: (openInNewTab: boolean) => {
            const result = action(openInNewTab);
            void result.then(resolveInvocation, rejectInvocation);
            return result;
        }
    };
    const commands = new Map<string, Command>();
    const plugin = {
        app,
        settings: { ...DEFAULT_SETTINGS, createNewNotesInNewTab: true },
        getNavigatorLeaves: () => [{ view }],
        addCommand: (command: Command) => {
            commands.set(command.id, command);
            return command;
        }
    };
    registerNavigatorCommandHandlers(plugin as never);
    async function executeCommand() {
        const callback = commands.get('new-note')?.callback;
        if (!callback) throw new Error('New-note command not registered');
        callback();
        await invocation;
    }
    return {
        app,
        root,
        folder,
        selectedFile,
        activeFile,
        selectionState,
        snapshot,
        manualSortContext,
        fileSystemOps,
        showNotice,
        action,
        executeCommand
    };
}

function queryFor(selection: Partial<Parameters<typeof getNavigationSearchQuery>[0]>) {
    return (
        getNavigationSearchQuery(
            {
                selectionType: ItemType.FOLDER,
                selectedFolder: null,
                selectedTag: null,
                selectedProperty: null,
                selectedType: null,
                ...selection
            },
            false
        ) ?? ''
    );
}

describe('new-note command follows the visible root-scoped creation context', () => {
    it('creates inside the folder encoded by navigation rather than the root scope', async () => {
        const f = fixture(queryFor({ selectedFolder: new TFolder('Inbox/QA command context') }));
        await f.executeCommand();
        expect(f.fileSystemOps.createNewFile).toHaveBeenCalledExactlyOnceWith(f.folder, false, f.manualSortContext);
        expect(f.fileSystemOps.createNewFileForTag).not.toHaveBeenCalled();
        expect(f.fileSystemOps.createNewFileForProperty).not.toHaveBeenCalled();
    });

    it('uses tag creation with the selected source note and shared opening preference', async () => {
        const f = fixture(queryFor({ selectionType: ItemType.TAG, selectedTag: 'qa/creation' }));
        await f.executeCommand();
        expect(f.fileSystemOps.createNewFileForTag).toHaveBeenCalledExactlyOnceWith(
            'qa/creation',
            f.selectedFile.path,
            false,
            f.manualSortContext
        );
        expect(f.fileSystemOps.createNewFile).not.toHaveBeenCalled();
        expect(f.fileSystemOps.createNewFileForProperty).not.toHaveBeenCalled();
    });

    it.each([buildPropertyKeyNodeId('qacreate'), buildPropertyValueNodeId('qacreate', 'command')])(
        'preserves the property assignment for %s',
        async nodeId => {
            const f = fixture(queryFor({ selectionType: ItemType.PROPERTY, selectedProperty: nodeId }));
            await f.executeCommand();
            expect(f.fileSystemOps.createNewFileForProperty).toHaveBeenCalledExactlyOnceWith(
                nodeId,
                f.selectedFile.path,
                false,
                f.manualSortContext
            );
            expect(f.fileSystemOps.createNewFile).not.toHaveBeenCalled();
            expect(f.fileSystemOps.createNewFileForTag).not.toHaveBeenCalled();
        }
    );

    it.each(['unrepresentable text', '#qa/creation #qa/second'])('does not create an unmatched root note for search %s', async query => {
        const f = fixture(query);
        await f.executeCommand();
        expect(f.fileSystemOps.createNewFile).not.toHaveBeenCalled();
        expect(f.fileSystemOps.createNewFileForTag).not.toHaveBeenCalled();
        expect(f.fileSystemOps.createNewFileForProperty).not.toHaveBeenCalled();
    });

    it('does not interpret an external provider query as a guaranteed creation filter', async () => {
        const f = fixture('#qa/creation', 'omnisearch');
        await f.executeCommand();
        expect(f.fileSystemOps.createNewFile).not.toHaveBeenCalled();
        expect(f.fileSystemOps.createNewFileForTag).not.toHaveBeenCalled();
        expect(f.fileSystemOps.createNewFileForProperty).not.toHaveBeenCalled();
    });

    it('does not interpret an unavailable external provider as an internal creation filter', async () => {
        const f = fixture('#qa/creation', 'omnisearch');
        f.snapshot.search.effectiveProvider = 'internal';
        await f.executeCommand();
        expect(f.fileSystemOps.createNewFile).not.toHaveBeenCalled();
        expect(f.fileSystemOps.createNewFileForTag).not.toHaveBeenCalled();
        expect(f.fileSystemOps.createNewFileForProperty).not.toHaveBeenCalled();
    });

    it('does not fall back to root when the folder target disappeared', async () => {
        const f = fixture(queryFor({ selectedFolder: new TFolder('Inbox/Missing') }));
        await f.executeCommand();
        expect(f.fileSystemOps.createNewFile).not.toHaveBeenCalled();
        expect(f.fileSystemOps.createNewFileForTag).not.toHaveBeenCalled();
        expect(f.fileSystemOps.createNewFileForProperty).not.toHaveBeenCalled();
    });

    it('retains explicit new-tab intent when invoking the shared component action', async () => {
        const f = fixture('#qa/creation');
        await f.action(true);
        expect(f.fileSystemOps.createNewFileForTag).toHaveBeenCalledExactlyOnceWith(
            'qa/creation',
            f.selectedFile.path,
            true,
            f.manualSortContext
        );
    });

    it('uses the current query while the applied query is still debouncing', async () => {
        const f = fixture('#qa/current');
        f.snapshot.search.appliedQuery = '#qa/previous';
        await f.executeCommand();
        expect(f.fileSystemOps.createNewFileForTag).toHaveBeenCalledExactlyOnceWith(
            'qa/current',
            f.selectedFile.path,
            false,
            f.manualSortContext
        );
        expect(f.fileSystemOps.createNewFile).not.toHaveBeenCalled();
    });

    it('ignores stale query text when the search is inactive', async () => {
        const f = fixture('#qa/previous');
        f.snapshot.search.active = false;
        await f.executeCommand();
        expect(f.fileSystemOps.createNewFile).toHaveBeenCalledExactlyOnceWith(f.root, false, f.manualSortContext);
        expect(f.fileSystemOps.createNewFileForTag).not.toHaveBeenCalled();
    });

    it.each([
        '#qa/creation',
        queryFor({ selectionType: ItemType.PROPERTY, selectedProperty: buildPropertyValueNodeId('qacreate', 'command') })
    ])('uses the active note as facet source when none is selected: %s', async query => {
        const f = fixture(query);
        f.selectionState.selectedFile = null;
        await f.executeCommand();
        const create = query.startsWith('#') ? f.fileSystemOps.createNewFileForTag : f.fileSystemOps.createNewFileForProperty;
        expect(create).toHaveBeenCalledOnce();
        expect(create.mock.calls[0]?.[1]).toBe(f.activeFile.path);
        expect(f.fileSystemOps.createNewFile).not.toHaveBeenCalled();
    });

    it('retains ordinary root creation after clearing the search', async () => {
        const f = fixture('');
        await f.executeCommand();
        expect(f.fileSystemOps.createNewFile).toHaveBeenCalledExactlyOnceWith(f.root, false, f.manualSortContext);
        expect(f.fileSystemOps.createNewFileForTag).not.toHaveBeenCalled();
        expect(f.fileSystemOps.createNewFileForProperty).not.toHaveBeenCalled();
    });
});

describe('shared navigation-facet note dispatch', () => {
    it.each<NavigationSearchCreationTarget>([
        { type: 'folder', path: 'Inbox/QA command context' },
        { type: 'tag', tag: 'qa/creation' },
        { type: 'property', nodeId: buildPropertyValueNodeId('qacreate', 'command') }
    ])('passes the real creation click to the $type note creator', async target => {
        const f = fixture('');
        const origin = { anchorEl: { isConnected: true } as HTMLElement, event: { type: 'click' } as MouseEvent };
        await createNoteForNavigationTarget(f.app, f.fileSystemOps, target, f.activeFile.path, false, null, origin);
        const calls = Object.values(f.fileSystemOps).flatMap(create => create.mock.calls);
        expect(calls).toHaveLength(1);
        const [call] = calls;
        expect(call?.[call.length - 1]).toBe(origin);
    });

    it.each<NavigationSearchCreationTarget>([
        { type: 'folder', path: 'Inbox/QA command context' },
        { type: 'tag', tag: 'qa/creation' },
        { type: 'property', nodeId: buildPropertyValueNodeId('qacreate', 'command') }
    ])('retains toolbar source, destination and provider-owned manual placement for $type', async target => {
        const f = fixture('');
        await createNoteForNavigationTarget(f.app, f.fileSystemOps, target, f.activeFile.path, true);
        const calls = Object.values(f.fileSystemOps).flatMap(create => create.mock.calls);
        expect(calls).toHaveLength(1);
        if (target.type === 'folder') {
            expect(f.fileSystemOps.createNewFile).toHaveBeenCalledExactlyOnceWith(f.folder, true, undefined);
        } else if (target.type === 'tag') {
            expect(f.fileSystemOps.createNewFileForTag).toHaveBeenCalledExactlyOnceWith('qa/creation', f.activeFile.path, true, undefined);
        } else {
            expect(f.fileSystemOps.createNewFileForProperty).toHaveBeenCalledExactlyOnceWith(
                buildPropertyValueNodeId('qacreate', 'command'),
                f.activeFile.path,
                true,
                undefined
            );
        }
    });

    it('uses the existing case-insensitive folder resolver and preserves explicit absence of manual placement', async () => {
        const f = fixture('');
        await createNoteForNavigationTarget(f.app, f.fileSystemOps, { type: 'folder', path: 'inbox/qa command context' }, '', false, null);
        expect(f.fileSystemOps.createNewFile).toHaveBeenCalledExactlyOnceWith(f.folder, false, null);
    });

    it('does nothing when the folder resolver cannot find a target', async () => {
        const f = fixture('');
        await createNoteForNavigationTarget(
            f.app,
            f.fileSystemOps,
            { type: 'folder', path: 'Inbox/Missing' },
            f.activeFile.path,
            false,
            f.manualSortContext
        );
        expect(f.fileSystemOps.createNewFile).not.toHaveBeenCalled();
        expect(f.fileSystemOps.createNewFileForTag).not.toHaveBeenCalled();
        expect(f.fileSystemOps.createNewFileForProperty).not.toHaveBeenCalled();
        expect(f.showNotice).not.toHaveBeenCalled();
    });
});
