/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import {
    canTpsAutomaticallyMutateFile,
    canTpsAutomaticallyMutateFrontmatter,
    canTpsAutomaticallyMutateSource,
    getTpsTemplateIdentificationMode,
    getTpsTemplateIdentityApi,
    isTpsTemplateFile,
    prepareTpsTemplateInstanceSource,
    sanitizeTpsTemplateInstanceFile
} from '../../src/utils/tpsTemplateIdentity';
import { createTestTFile } from './createTestTFile';

function createApp(templates: unknown): App {
    return {
        plugins: {
            plugins: {
                'tps-global-context-menu': {
                    api: { templates }
                }
            }
        }
    } as unknown as App;
}

describe('TPS template identity integration', () => {
    it('uses the versioned GCM template contract', () => {
        const file = createTestTFile('Daily Note Template.md');
        const app = createApp({
            version: 1,
            getMode: () => 'property',
            matches: (candidate: TFile) => candidate.path === file.path
        });

        expect(getTpsTemplateIdentityApi(app)?.getMode()).toBe('property');
        expect(isTpsTemplateFile(app, file)).toBe(true);
        expect(isTpsTemplateFile(app, createTestTFile('Ordinary.md'))).toBe(false);
    });

    it('returns null when GCM does not expose template identity so legacy folder discovery remains available', () => {
        const app = { plugins: { plugins: {} } } as unknown as App;
        expect(getTpsTemplateIdentityApi(app)).toBeNull();
        expect(isTpsTemplateFile(app, createTestTFile('Legacy.md'))).toBeNull();
    });

    it('capability-detects raw mutation guards and exact instance preparation', async () => {
        const file = createTestTFile('Created.md');
        let source = '---\ntags: [template, keep]\n---\n#template\n';
        const app = createApp({
            version: 1,
            getMode: () => 'tag',
            matches: () => false,
            canAutomaticallyMutate: async (candidate: TFile) => candidate.path !== file.path,
            canAutomaticallyMutateSource: (value: string) => !value.includes('tags: [template'),
            canAutomaticallyMutateFrontmatter: (frontmatter: Record<string, unknown>) =>
                !Array.isArray(frontmatter.tags) || !frontmatter.tags.includes('template'),
            prepareInstanceSource: (value: string) => value.replace('template, ', '')
        });
        Object.assign(app, {
            vault: {
                process: async (_file: TFile, processor: (value: string) => string) => {
                    source = processor(source);
                    return source;
                }
            }
        });

        await expect(canTpsAutomaticallyMutateFile(app, file)).resolves.toBe(false);
        expect(canTpsAutomaticallyMutateSource(app, source)).toBe(false);
        expect(canTpsAutomaticallyMutateFrontmatter(app, { tags: ['template'] })).toBe(false);
        expect(prepareTpsTemplateInstanceSource(app, source)).toBe('---\ntags: [keep]\n---\n#template\n');
        await expect(sanitizeTpsTemplateInstanceFile(app, file)).resolves.toBe(true);
        expect(source).toBe('---\ntags: [keep]\n---\n#template\n');
    });

    it('rejects incompatible versions and contains provider exceptions', () => {
        const incompatible = createApp({ version: 2, getMode: () => 'property', matches: () => true });
        expect(getTpsTemplateIdentityApi(incompatible)).toBeNull();

        const throwing = createApp({
            version: 1,
            getMode: () => {
                throw new Error('provider unavailable');
            },
            matches: () => {
                throw new Error('provider unavailable');
            }
        });
        expect(getTpsTemplateIdentificationMode(throwing)).toBeNull();
        expect(isTpsTemplateFile(throwing, createTestTFile('Template.md'))).toBe(false);
    });
});
