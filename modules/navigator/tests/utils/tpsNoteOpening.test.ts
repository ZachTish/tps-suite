import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { getTpsNoteOpeningApi, legacyNewNoteTabPreference, presentCreatedNote } from '../../src/utils/tpsNoteOpening';
import { createTestTFile } from './createTestTFile';

function createApp(ui?: unknown): App {
    return {
        workspace: { getMostRecentLeaf: () => ({ id: 'origin' }) },
        plugins: { plugins: { 'tps-global-context-menu': { api: { ui } } } }
    } as unknown as App;
}

describe('shared note creation presentation', () => {
    it('falls back for older or disabled GCM', async () => {
        const app = createApp({ openEditableNotePreview: vi.fn() });
        expect(getTpsNoteOpeningApi(app)).toBeNull();
        expect(legacyNewNoteTabPreference(app, true)).toBe(true);
        expect(await presentCreatedNote(app, createTestTFile('Note.md'))).toBe(false);
    });
    it('replaces the legacy default while retaining explicit new-tab requests', async () => {
        const present = vi.fn().mockResolvedValue(true);
        const app = createApp({ presentCreatedNote: present });
        expect(legacyNewNoteTabPreference(app, true)).toBe(false);
        expect(await presentCreatedNote(app, createTestTFile('Note.md'))).toBe(true);
        expect(present).toHaveBeenLastCalledWith({
            filePath: 'Note.md',
            sourcePluginId: 'tps-notebook-navigator',
            sourceLeaf: { id: 'origin' },
            renameTitle: true
        });
        await presentCreatedNote(app, createTestTFile('Note.md'), true, false);
        expect(present.mock.lastCall?.[0]).toMatchObject({ explicitDestination: 'tab', renameTitle: false });
    });
    it('does not intercept non-markdown resources or background creation', async () => {
        const present = vi.fn().mockResolvedValue(true);
        expect(await presentCreatedNote(createApp({ presentCreatedNote: present }), createTestTFile('Canvas.canvas'))).toBe(false);
        expect(present).not.toHaveBeenCalled();
    });
    it('passes a connected creation click to the shared native page preview owner', async () => {
        const present = vi.fn().mockResolvedValue(true);
        const app = createApp({ presentCreatedNote: present });
        const anchorEl = { isConnected: true } as HTMLElement;
        const event = { type: 'click' } as MouseEvent;
        await presentCreatedNote(app, createTestTFile('Note.md'), false, true, { anchorEl, event });
        expect(present.mock.lastCall?.[0]).toMatchObject({ anchorEl, event });

        await presentCreatedNote(app, createTestTFile('Note.md'), false, true, {
            anchorEl: { isConnected: false } as HTMLElement,
            event
        });
        expect(present.mock.lastCall?.[0]).not.toHaveProperty('anchorEl');
        expect(present.mock.lastCall?.[0]).not.toHaveProperty('event');
    });
    it('provides a settings handoff using the API owner as receiver', () => {
        const ui = { presentCreatedNote: vi.fn(), openNoteOpeningSettings: vi.fn() };
        getTpsNoteOpeningApi(createApp(ui))?.openSettings?.();
        expect(ui.openNoteOpeningSettings).toHaveBeenCalledOnce();
    });
});
