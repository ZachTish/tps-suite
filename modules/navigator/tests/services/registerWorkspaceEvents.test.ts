import { App, TFile, TFolder } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type NotebookNavigatorPlugin from '../../src/main';
import registerWorkspaceEvents from '../../src/services/workspace/registerWorkspaceEvents';
import * as vaultIcons from '../../src/services/icons/providers/VaultIconProvider';
import * as asyncActions from '../../src/utils/async';
import { createTestTFile } from '../utils/createTestTFile';

const iconService = vi.hoisted(() => ({
    notifyIconAssetsChanged: vi.fn(),
    invalidateIconValidationCache: vi.fn()
}));

vi.mock('../../src/services/icons', () => ({ getIconService: () => iconService }));

function createHarness() {
    const handlers = new Map<string, (file: unknown) => void>();
    const disposers: (() => void)[] = [];
    let shuttingDown = false;
    const vault = {
        on: vi.fn((event: string, callback: (file: unknown) => void) => {
            handlers.set(event, callback);
            return callback;
        }),
        getFiles: vi.fn(() => [] as TFile[]),
        read: vi.fn(),
        cachedRead: vi.fn(),
        create: vi.fn(),
        modify: vi.fn()
    };
    const plugin = {
        app: { vault, workspace: { on: vi.fn(), getActiveFile: () => null } },
        register: (dispose: () => void) => disposers.push(dispose),
        registerEvent: vi.fn(),
        addRibbonIcon: vi.fn(),
        isShuttingDown: () => shuttingDown
    } as unknown as NotebookNavigatorPlugin;
    registerWorkspaceEvents(plugin);
    return {
        vault,
        emit: (event: string, file: unknown) => {
            const handler = handlers.get(event);
            if (!handler) throw new Error(`Missing registered ${event} handler`);
            handler(file);
        },
        shutdown: () => {
            shuttingDown = true;
        },
        dispose: () => disposers.forEach(dispose => dispose())
    };
}

describe('registered vault icon event ownership', () => {
    let actionSpy: ReturnType<typeof vi.spyOn<typeof asyncActions, 'runAsyncAction'>>;
    let invalidateSpy: ReturnType<typeof vi.spyOn<typeof vaultIcons, 'invalidateVaultIconSvgCache'>>;
    let createSpy: ReturnType<typeof vi.spyOn<typeof vaultIcons, 'updateVaultIconListCacheForCreate'>>;
    let promiseResults: number;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        promiseResults = 0;
        const runAsyncAction = asyncActions.runAsyncAction;
        actionSpy = vi.spyOn(asyncActions, 'runAsyncAction').mockImplementation((action, options) =>
            runAsyncAction(() => {
                const result = action();
                if (asyncActions.isPromiseLike(result)) promiseResults += 1;
                return result;
            }, options)
        );
        invalidateSpy = vi.spyOn(vaultIcons, 'invalidateVaultIconSvgCache');
        createSpy = vi.spyOn(vaultIcons, 'updateVaultIconListCacheForCreate');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it.each(['create', 'modify'])('rejects 4,049 ordinary Markdown %s events before asynchronous work', event => {
        const harness = createHarness();
        for (let index = 0; index < 4049; index += 1) {
            harness.emit(event, createTestTFile(`Inbox/Note ${index}.md`));
        }
        expect(actionSpy).not.toHaveBeenCalled();
        expect(promiseResults).toBe(0);
        expect(createSpy).not.toHaveBeenCalled();
        expect(invalidateSpy).not.toHaveBeenCalled();
        expect(iconService.invalidateIconValidationCache).not.toHaveBeenCalled();
        expect(iconService.notifyIconAssetsChanged).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
        expect(harness.vault.getFiles).not.toHaveBeenCalled();
        expect(harness.vault.read).not.toHaveBeenCalled();
        expect(harness.vault.cachedRead).not.toHaveBeenCalled();
        expect(harness.vault.create).not.toHaveBeenCalled();
        expect(harness.vault.modify).not.toHaveBeenCalled();
    });

    it('rejects folders, other assets and file-shaped objects before asynchronous work', () => {
        const harness = createHarness();
        const ineligible = [
            new TFolder('Icons/folder.svg'),
            { path: 'Icons/not-a-TFile.svg', extension: 'svg' },
            createTestTFile('Icons/photo.png'),
            createTestTFile('Inbox/Table.base'),
            createTestTFile('Inbox/Board.canvas')
        ];
        for (const file of ineligible) {
            harness.emit('create', file);
            harness.emit('modify', file);
        }
        expect(actionSpy).not.toHaveBeenCalled();
        expect(invalidateSpy).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('keeps SVG creates synchronous, updates the existing list and batches one notification', () => {
        const harness = createHarness();
        const provider = new vaultIcons.VaultIconProvider({ vault: harness.vault } as unknown as App);
        expect(provider.getAll()).toEqual([]);
        const icons = Array.from({ length: 200 }, (_, index) => createTestTFile(`Icons/Symbol ${index}.SVG`));
        for (const file of icons) {
            harness.emit('create', file);
            harness.emit('modify', file);
        }
        expect(actionSpy).toHaveBeenCalledTimes(400);
        expect(promiseResults).toBe(0);
        expect(createSpy).toHaveBeenCalledTimes(200);
        expect(invalidateSpy).toHaveBeenCalledTimes(400);
        expect(iconService.invalidateIconValidationCache).toHaveBeenCalledTimes(200);
        expect(
            provider
                .getAll()
                .map(icon => icon.id)
                .sort()
        ).toEqual(icons.map(file => file.path).sort());
        expect(harness.vault.getFiles).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(1);
        expect(iconService.notifyIconAssetsChanged).not.toHaveBeenCalled();
        vi.advanceTimersByTime(50);
        expect(iconService.notifyIconAssetsChanged).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
        expect(harness.vault.read).not.toHaveBeenCalled();
        expect(harness.vault.cachedRead).not.toHaveBeenCalled();
        expect(harness.vault.create).not.toHaveBeenCalled();
        expect(harness.vault.modify).not.toHaveBeenCalled();
    });

    it('modifying an SVG invalidates only that SVG and retains the existing debounce', () => {
        const harness = createHarness();
        const icon = createTestTFile('Icons/current.svg');
        harness.emit('modify', icon);
        expect(actionSpy).toHaveBeenCalledTimes(1);
        expect(promiseResults).toBe(0);
        expect(invalidateSpy).toHaveBeenCalledExactlyOnceWith(icon.path);
        expect(createSpy).not.toHaveBeenCalled();
        expect(iconService.invalidateIconValidationCache).not.toHaveBeenCalled();
        vi.advanceTimersByTime(50);
        expect(iconService.notifyIconAssetsChanged).toHaveBeenCalledTimes(1);
        harness.emit('modify', icon);
        vi.advanceTimersByTime(50);
        expect(iconService.notifyIconAssetsChanged).toHaveBeenCalledTimes(2);
    });

    it('rejects create and modify events while shutting down without scheduling work', () => {
        const harness = createHarness();
        harness.shutdown();
        const icon = createTestTFile('Icons/closed.svg');
        harness.emit('create', icon);
        harness.emit('modify', icon);
        expect(actionSpy).not.toHaveBeenCalled();
        expect(invalidateSpy).not.toHaveBeenCalled();
        expect(createSpy).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('disposal cancels the one existing icon notification timer', () => {
        const harness = createHarness();
        harness.emit('modify', createTestTFile('Icons/pending.svg'));
        expect(vi.getTimerCount()).toBe(1);
        harness.shutdown();
        harness.dispose();
        vi.runAllTimers();
        expect(vi.getTimerCount()).toBe(0);
        expect(iconService.notifyIconAssetsChanged).not.toHaveBeenCalled();
    });

    it.each(['create', 'modify'])('preserves error handling for synchronous SVG %s failures', async event => {
        const harness = createHarness();
        const error = new Error('Synthetic icon cache failure');
        invalidateSpy.mockImplementationOnce(() => {
            throw error;
        });
        const report = vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => harness.emit(event, createTestTFile('Icons/error.svg'))).not.toThrow();
        await Promise.resolve();
        expect(actionSpy).toHaveBeenCalledTimes(1);
        expect(report).toHaveBeenCalledExactlyOnceWith('Unhandled async action error', error);
        expect(vi.getTimerCount()).toBe(0);
    });
});
