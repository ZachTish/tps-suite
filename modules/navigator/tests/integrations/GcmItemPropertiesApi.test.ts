import { describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import { readFileSync } from 'node:fs';
import { resolveGcmFilePropertiesApi, resolveGcmFrontmatterApi, resolveGcmItemPropertiesApi } from '../../src/integrations/gcm/gcmTaskApi';

function installGcm(app: App, api: Record<string, unknown>): void {
    (app as App & { plugins: unknown }).plugins = {
        enabledPlugins: new Set(['tps-global-context-menu']),
        getPlugin: () => ({ api })
    };
}

describe('GCM item-property adapter', () => {
    it('uses only read-only property definitions and whole-file property surfaces', () => {
        const app = new App();
        const itemProperties = {
            version: 1,
            listDefinitions: vi.fn(() => []),
            resolveDefinition: vi.fn(() => null)
        };
        const frontmatter = { setValues: vi.fn(), addListValues: vi.fn() };
        const fileProperties = { version: 1, isTarget: vi.fn(), ...frontmatter };
        installGcm(app, { itemProperties, frontmatter, fileProperties });

        expect(resolveGcmItemPropertiesApi(app)).toBe(itemProperties);
        expect(resolveGcmFrontmatterApi(app)).toBe(frontmatter);
        expect(resolveGcmFilePropertiesApi(app)).toBe(fileProperties);
    });

    it('fails closed for missing methods or a disabled GCM plugin', () => {
        const app = new App();
        installGcm(app, { itemProperties: { version: 1 } });
        expect(resolveGcmItemPropertiesApi(app)).toBeNull();
        (app as App & { plugins: { enabledPlugins: Set<string> } }).plugins.enabledPlugins.clear();
        expect(resolveGcmFrontmatterApi(app)).toBeNull();
        expect(resolveGcmFilePropertiesApi(app)).toBeNull();
    });

    it('does not listen for task-line pointer drops', () => {
        const source = readFileSync(new URL('../../src/hooks/useDragAndDrop.ts', import.meta.url), 'utf8');
        expect(source).not.toContain('tps-task-line-pointer-drop');
        expect(source).not.toContain('applyToTaskLines');
    });
});
