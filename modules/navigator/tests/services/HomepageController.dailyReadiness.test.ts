import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { App, type WorkspaceLeaf } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type NotebookNavigatorPlugin from '../../src/main';
import HomepageController from '../../src/services/workspace/HomepageController';
import type WorkspaceCoordinator from '../../src/services/workspace/WorkspaceCoordinator';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../src/constants/tpsIdentity';
import { runAsyncAction } from '../../src/utils/async';
import { resetMomentApiCacheForTests } from '../../src/utils/moment';
import * as noticeUtils from '../../src/utils/noticeUtils';
import { createTestTFile } from '../utils/createTestTFile';

vi.mock('obsidian', async importOriginal => ({
    ...(await importOriginal<typeof import('obsidian')>()),
    FileView: class {}
}));

/** Execute the existing registered GCM event callback, with unrelated catalog work stubbed. */
function loadGcmReadyCallback(plugin: NotebookNavigatorPlugin, importGcmProperties: () => Promise<void>, pending: Promise<unknown>[]) {
    const source = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
    const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    let callback: ts.Expression | undefined;
    function visit(node: ts.Node): void {
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === 'on' &&
            ts.isStringLiteral(node.arguments[0]) &&
            node.arguments[0].text === 'tps:gcm-api-changed'
        ) {
            callback = node.arguments[1];
        }
        ts.forEachChild(node, visit);
    }
    visit(parsed);
    if (!callback) throw new Error('The existing GCM readiness listener is missing');
    const javascript = ts.transpileModule(`function createCallback() { return ${callback.getText(parsed)}; }`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText;
    const createCallback = runInNewContext(`${javascript}\ncreateCallback;`, {
        importGcmProperties,
        runAsyncAction: (action: () => Promise<unknown>) =>
            runAsyncAction(() => {
                const operation = action();
                pending.push(operation);
                return operation;
            })
    }) as (this: NotebookNavigatorPlugin) => () => void;
    return createCallback.call(plugin);
}

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => {
        resolve = done;
    });
    return { promise, resolve };
}

function fixture(options: { existing?: boolean; createMissing?: boolean; provider?: 'blocked' | 'ready' | 'absent' | 'disabled' } = {}) {
    const date = {
        clone() {
            return { ...this };
        },
        format: () => '2026-10-09',
        locale() {
            return this;
        },
        startOf() {
            return this;
        },
        isValid: () => true,
        year: () => 2026,
        month: () => 9,
        date: () => 9
    };
    const moment = Object.assign(() => ({ ...date }), { fn: {}, utc: () => ({}), locales: () => ['en'], locale: () => 'en' });
    vi.stubGlobal('window', { moment });
    resetMomentApiCacheForTests();
    const app = new App();
    const corePath = 'Daily/2026-10-09.md';
    const existingFile = createTestTFile(corePath);
    const files = new Map(options.existing === false ? [] : [[corePath, existingFile]]);
    const source = new Map(options.existing === false ? [] : [[corePath, 'Preserved daily body\n']]);
    const io = {
        lookup: vi.fn((path: string) => files.get(path) ?? null),
        read: vi.fn(async (file: { path: string }) => source.get(file.path) ?? ''),
        cachedRead: vi.fn(async (file: { path: string }) => source.get(file.path) ?? ''),
        adapterRead: vi.fn(async () => ''),
        inventory: vi.fn(() => Array.from(files.values())),
        create: vi.fn(async (path: string, contents: string) => {
            const file = createTestTFile(path);
            files.set(path, file);
            source.set(path, contents);
            return file;
        }),
        modify: vi.fn(),
        process: vi.fn(),
        createFolder: vi.fn()
    };
    Object.assign(app.vault, {
        getAbstractFileByPath: io.lookup,
        getMarkdownFiles: io.inventory,
        getAllLoadedFiles: io.inventory,
        read: io.read,
        cachedRead: io.cachedRead,
        create: io.create,
        modify: io.modify,
        process: io.process,
        createFolder: io.createFolder
    });
    Object.assign(app.vault.adapter, { read: io.adapterRead });
    const openLinkText = vi.fn(async (_path: string, _source: string, _newLeaf: boolean) => {});
    Object.assign(app, {
        internalPlugins: {
            getPluginById: () => ({ enabled: true, instance: { options: { folder: 'Daily', format: 'YYYY-MM-DD', template: '' } } })
        },
        workspace: { getLeavesOfType: () => [] as WorkspaceLeaf[], openLinkText }
    });
    const provider: { api?: { dailyNotes: typeof dailyNotes } } = {};
    const dailyNotes = {
        version: 4,
        findForIsoDate: vi.fn(() => files.get(corePath) ?? null),
        pathForIsoDate: vi.fn(() => corePath),
        ensureForIsoDate: vi.fn(async () => files.get(corePath) ?? null)
    };
    const enabledPlugins = new Set(
        options.provider === 'absent' || options.provider === 'disabled' ? [] : [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]
    );
    const plugins = options.provider === 'absent' ? {} : { [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]: provider };
    Object.assign(app, { plugins: { enabledPlugins, plugins } });
    if (options.provider === 'ready' || options.provider === 'disabled') provider.api = { dailyNotes };
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.homepage = { source: 'daily-note', file: null, createMissingPeriodicNote: options.createMissing !== false };
    settings.calendarIntegrationMode = 'daily-notes';
    settings.calendarLocale = 'en';
    settings.autoRevealActiveFile = true;
    settings.startView = 'files';
    let shutdown = false;
    const plugin = { app, settings, isShuttingDown: () => shutdown } as unknown as NotebookNavigatorPlugin;
    const revealFileInNearestFolder = vi.fn();
    const activateNavigatorView = vi.fn(async () => null);
    const controller = new HomepageController(plugin, {
        revealFileInNearestFolder,
        activateNavigatorView
    } as unknown as WorkspaceCoordinator);
    Object.assign(plugin, { homepageController: controller });
    const pending: Promise<unknown>[] = [];
    const catalog = vi.fn(async () => {});
    const fireReady = loadGcmReadyCallback(plugin, catalog, pending);
    const notices = vi.spyOn(noticeUtils, 'showNotice');
    async function settleEvents() {
        await Promise.all(pending.splice(0));
    }
    function assertNoSourceWork() {
        for (const operation of Object.values(io)) expect(operation).not.toHaveBeenCalled();
        expect(dailyNotes.findForIsoDate).not.toHaveBeenCalled();
        expect(dailyNotes.ensureForIsoDate).not.toHaveBeenCalled();
        expect(openLinkText).not.toHaveBeenCalled();
        expect(notices).not.toHaveBeenCalled();
    }
    return {
        controller,
        settings,
        files,
        source,
        io,
        dailyNotes,
        existingFile,
        openLinkText,
        revealFileInNearestFolder,
        activateNavigatorView,
        notices,
        catalog,
        fireReady,
        settleEvents,
        assertNoSourceWork,
        publishReady: () => {
            provider.api = { dailyNotes };
        },
        shutdown: () => {
            shutdown = true;
        }
    };
}

afterEach(() => {
    resetMomentApiCacheForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('Daily Note homepage provider readiness', () => {
    it.each([
        { existing: true, createMissing: true },
        { existing: false, createMissing: true },
        { existing: true, createMissing: false },
        { existing: false, createMissing: false }
    ])('keeps blocked startup and 100 blocked announcements free of source work: %j', async options => {
        const test = fixture(options);
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        for (let index = 0; index < 100; index++) test.fireReady();
        await test.settleEvents();
        test.assertNoSourceWork();
        expect(test.catalog).toHaveBeenCalledTimes(100);
    });

    it('opens an existing note once across overlapping ready announcements, without creating or changing its body', async () => {
        const test = fixture();
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        test.publishReady();
        const opening = deferred<void>();
        test.openLinkText.mockImplementation(() => opening.promise);
        for (let index = 0; index < 100; index++) test.fireReady();
        await Promise.resolve();
        await Promise.resolve();
        expect(test.openLinkText).toHaveBeenCalledTimes(1);
        opening.resolve();
        await test.settleEvents();
        expect(test.dailyNotes.findForIsoDate).toHaveBeenCalledTimes(1);
        expect(test.dailyNotes.ensureForIsoDate).not.toHaveBeenCalled();
        expect(test.source.get(test.existingFile.path)).toBe('Preserved daily body\n');
        for (const operation of Object.values(test.io)) expect(operation).not.toHaveBeenCalled();
        expect(test.notices).not.toHaveBeenCalled();
    });

    it('ensures a missing note once and opens only the final provider file across overlapping announcements', async () => {
        const test = fixture({ existing: false });
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        const finalFile = createTestTFile('Journal/2026-10-09.md');
        const creation = deferred<typeof finalFile>();
        test.dailyNotes.ensureForIsoDate.mockImplementation(() => creation.promise);
        test.publishReady();
        for (let index = 0; index < 100; index++) test.fireReady();
        creation.resolve(finalFile);
        await test.settleEvents();
        expect(test.dailyNotes.ensureForIsoDate).toHaveBeenCalledTimes(1);
        expect(test.dailyNotes.ensureForIsoDate).toHaveBeenCalledWith('2026-10-09');
        expect(test.openLinkText).toHaveBeenCalledExactlyOnceWith(finalFile.path, '', false);
        for (const operation of Object.values(test.io)) expect(operation).not.toHaveBeenCalled();
        expect(test.notices).not.toHaveBeenCalled();
    });

    it('opens an existing note even when missing-note creation is disabled', async () => {
        const test = fixture({ createMissing: false });
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        test.publishReady();
        test.fireReady();
        await test.settleEvents();
        expect(test.openLinkText).toHaveBeenCalledExactlyOnceWith(test.existingFile.path, '', false);
        expect(test.dailyNotes.ensureForIsoDate).not.toHaveBeenCalled();
    });

    it('leaves a missing note uncreated when creation is disabled after the blocked request', async () => {
        const test = fixture({ existing: false });
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        test.settings.homepage.createMissingPeriodicNote = false;
        test.publishReady();
        test.fireReady();
        await test.settleEvents();
        expect(test.dailyNotes.findForIsoDate).toHaveBeenCalledTimes(1);
        expect(test.dailyNotes.ensureForIsoDate).not.toHaveBeenCalled();
        expect(test.openLinkText).not.toHaveBeenCalled();
        expect(test.notices).not.toHaveBeenCalled();
    });

    it('does not consume a pending command on ready announcements before layout', async () => {
        const test = fixture();
        test.settings.autoRevealActiveFile = false;
        await test.controller.open('command');
        test.publishReady();
        for (let index = 0; index < 20; index++) test.fireReady();
        await test.settleEvents();
        test.assertNoSourceWork();
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        expect(test.openLinkText).toHaveBeenCalledTimes(1);
        expect(test.revealFileInNearestFolder).toHaveBeenCalledWith(test.existingFile, expect.objectContaining({ source: 'manual' }));
        test.fireReady();
        await test.settleEvents();
        expect(test.openLinkText).toHaveBeenCalledTimes(1);
    });

    it('preserves command precedence over later blocked startup requests', async () => {
        const test = fixture();
        test.settings.autoRevealActiveFile = false;
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        await test.controller.open('command');
        await test.controller.open('startup');
        test.assertNoSourceWork();
        test.publishReady();
        test.fireReady();
        await test.settleEvents();
        expect(test.openLinkText).toHaveBeenCalledTimes(1);
        expect(test.revealFileInNearestFolder).toHaveBeenCalledWith(test.existingFile, expect.objectContaining({ source: 'manual' }));
    });

    it('consumes a suspended startup request when an explicit command proceeds before a readiness announcement', async () => {
        const test = fixture();
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        test.publishReady();
        await expect(test.controller.open('command')).resolves.toBe(true);
        for (let index = 0; index < 20; index++) test.fireReady();
        await test.settleEvents();
        expect(test.openLinkText).toHaveBeenCalledTimes(1);
        expect(test.dailyNotes.findForIsoDate).toHaveBeenCalledTimes(1);
        expect(test.dailyNotes.ensureForIsoDate).not.toHaveBeenCalled();
        expect(test.revealFileInNearestFolder).toHaveBeenCalledWith(test.existingFile, expect.objectContaining({ source: 'manual' }));
    });

    it('waits for first-launch Navigator activation and does not open twice if readiness arrives during activation', async () => {
        const test = fixture();
        await test.controller.open('command');
        const activation = deferred<null>();
        test.activateNavigatorView.mockImplementation(() => activation.promise);
        const startup = test.controller.handleWorkspaceReady({ shouldActivateOnStartup: true });
        test.publishReady();
        for (let index = 0; index < 20; index++) test.fireReady();
        await test.settleEvents();
        test.assertNoSourceWork();
        activation.resolve(null);
        await startup;
        expect(test.openLinkText).toHaveBeenCalledTimes(1);
        test.fireReady();
        await test.settleEvents();
        expect(test.openLinkText).toHaveBeenCalledTimes(1);
    });

    it('does not let a slow catalog import delay the pending homepage', async () => {
        const test = fixture();
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        const catalog = deferred<void>();
        test.catalog.mockImplementation(() => catalog.promise);
        test.publishReady();
        test.fireReady();
        await Promise.resolve();
        await Promise.resolve();
        expect(test.openLinkText).toHaveBeenCalledTimes(1);
        catalog.resolve();
        await test.settleEvents();
        test.fireReady();
        await test.settleEvents();
        expect(test.openLinkText).toHaveBeenCalledTimes(1);
    });

    it('does not lose the pending homepage if catalog import fails', async () => {
        const test = fixture();
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        const error = new Error('Synthetic catalog failure');
        const reportError = vi.spyOn(console, 'error').mockImplementation(() => {});
        test.catalog.mockRejectedValueOnce(error);
        test.publishReady();
        test.fireReady();
        await expect(test.settleEvents()).rejects.toBe(error);
        expect(reportError).toHaveBeenCalledWith('Unhandled async action error', error);
        expect(test.openLinkText).toHaveBeenCalledTimes(1);
        test.fireReady();
        await test.settleEvents();
        expect(test.openLinkText).toHaveBeenCalledTimes(1);
    });

    it('uses current homepage settings when the pending request becomes runnable', async () => {
        const test = fixture();
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        const homepage = createTestTFile('Inbox/Current home.md');
        test.files.set(homepage.path, homepage);
        test.settings.homepage.source = 'file';
        test.settings.homepage.file = homepage.path;
        test.publishReady();
        test.fireReady();
        await test.settleEvents();
        expect(test.openLinkText).toHaveBeenCalledExactlyOnceWith(homepage.path, '', false);
        expect(test.dailyNotes.findForIsoDate).not.toHaveBeenCalled();
        expect(test.dailyNotes.ensureForIsoDate).not.toHaveBeenCalled();
    });

    it('does not open a retired homepage when its setting changes to none', async () => {
        const test = fixture();
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        test.settings.homepage.source = 'none';
        test.publishReady();
        test.fireReady();
        await test.settleEvents();
        test.assertNoSourceWork();
    });

    it('retains the early-ready normal route without reopening on later announcements', async () => {
        const test = fixture({ provider: 'ready' });
        test.fireReady();
        await test.settleEvents();
        test.assertNoSourceWork();
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        for (let index = 0; index < 100; index++) test.fireReady();
        await test.settleEvents();
        expect(test.openLinkText).toHaveBeenCalledTimes(1);
        expect(test.dailyNotes.findForIsoDate).toHaveBeenCalledTimes(1);
        expect(test.dailyNotes.ensureForIsoDate).not.toHaveBeenCalled();
    });

    it.each(['absent', 'disabled'] as const)('retains standalone Core lookup when GCM is %s', async provider => {
        const test = fixture({ provider });
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        for (let index = 0; index < 20; index++) test.fireReady();
        await test.settleEvents();
        expect(test.io.lookup).toHaveBeenCalledExactlyOnceWith(test.existingFile.path);
        expect(test.openLinkText).toHaveBeenCalledExactlyOnceWith(test.existingFile.path, '', false);
        expect(test.dailyNotes.findForIsoDate).not.toHaveBeenCalled();
        expect(test.dailyNotes.ensureForIsoDate).not.toHaveBeenCalled();
        expect(test.io.read).not.toHaveBeenCalled();
        expect(test.io.create).not.toHaveBeenCalled();
    });

    it('does not restart a completed provider creation that returned null', async () => {
        const test = fixture({ existing: false });
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        test.publishReady();
        test.fireReady();
        await test.settleEvents();
        for (let index = 0; index < 20; index++) test.fireReady();
        await test.settleEvents();
        expect(test.dailyNotes.ensureForIsoDate).toHaveBeenCalledTimes(1);
        expect(test.openLinkText).not.toHaveBeenCalled();
    });

    it('does not flush a pending request after shutdown', async () => {
        const test = fixture();
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        test.shutdown();
        test.publishReady();
        for (let index = 0; index < 20; index++) test.fireReady();
        await test.settleEvents();
        test.assertNoSourceWork();
    });

    it('does not reveal or open a note returned by an already-entered creation after shutdown', async () => {
        const test = fixture({ existing: false });
        await test.controller.handleWorkspaceReady({ shouldActivateOnStartup: false });
        const finalFile = createTestTFile('Journal/2026-10-09.md');
        const creation = deferred<typeof finalFile>();
        test.dailyNotes.ensureForIsoDate.mockImplementation(() => creation.promise);
        test.publishReady();
        test.fireReady();
        await vi.waitFor(() => expect(test.dailyNotes.ensureForIsoDate).toHaveBeenCalledTimes(1));
        test.shutdown();
        creation.resolve(finalFile);
        await test.settleEvents();
        expect(test.dailyNotes.ensureForIsoDate).toHaveBeenCalledTimes(1);
        expect(test.openLinkText).not.toHaveBeenCalled();
        expect(test.revealFileInNearestFolder).not.toHaveBeenCalled();
        expect(test.notices).not.toHaveBeenCalled();
        for (const operation of Object.values(test.io)) expect(operation).not.toHaveBeenCalled();
    });

    it('does not start the homepage if shutdown occurs during first-launch activation', async () => {
        const test = fixture({ provider: 'ready' });
        const activation = deferred<null>();
        test.activateNavigatorView.mockImplementation(() => activation.promise);
        const startup = test.controller.handleWorkspaceReady({ shouldActivateOnStartup: true });
        test.shutdown();
        activation.resolve(null);
        await startup;
        test.fireReady();
        await test.settleEvents();
        test.assertNoSourceWork();
    });
});
