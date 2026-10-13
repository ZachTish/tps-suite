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

import { App, Plugin, TFile } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATER_PLUGIN_ID } from '../../src/constants/pluginIds';
import {
    createCalendarMarkdownFile,
    resolveCalendarTemplateSelection,
    type CalendarTemplateSelection
} from '../../src/utils/calendarNotes';
import type { NotebookNavigatorSettings } from '../../src/settings/types';
import { resetMomentApiCacheForTests, type MomentApi, type MomentInstance, type MomentLocaleData } from '../../src/utils/moment';
import { createTestTFile } from './createTestTFile';

interface TestVaultMethods {
    registerFile(file: TFile): void;
}

type TestTemplaterCreateFn = (
    template: TFile | string,
    folder?: unknown,
    filename?: string,
    openNewNote?: boolean
) => TFile | Promise<TFile | undefined> | undefined;

class TestTemplaterPlugin extends Plugin {
    templater: {
        create_new_note_from_template: TestTemplaterCreateFn;
    };

    constructor(app: App, createNoteFromTemplate: TestTemplaterCreateFn) {
        super(app, {
            id: TEMPLATER_PLUGIN_ID,
            name: 'Templater',
            author: 'Test',
            version: '1.0.0',
            minAppVersion: '1.0.0',
            description: 'Test plugin'
        });

        this.templater = {
            create_new_note_from_template: createNoteFromTemplate
        };
    }
}

function getTestVault(app: App): App['vault'] & TestVaultMethods {
    return app.vault as App['vault'] & TestVaultMethods;
}

function registerTemplater(app: App, createNoteFromTemplate: TestTemplaterCreateFn): void {
    const appWithPlugins = app as App & { plugins: { plugins: Record<string, Plugin> } };
    appWithPlugins.plugins = {
        plugins: {
            [TEMPLATER_PLUGIN_ID]: new TestTemplaterPlugin(app, createNoteFromTemplate)
        }
    };
}

function registerTemplateLifecycle(app: App, prepareInstanceSource: (source: string) => string | null): void {
    const appWithPlugins = app as App & { plugins: { plugins: Record<string, unknown> } };
    appWithPlugins.plugins = {
        plugins: {
            ...(appWithPlugins.plugins?.plugins ?? {}),
            'tps-global-context-menu': {
                api: {
                    templates: {
                        version: 1,
                        getMode: () => 'tag',
                        matches: () => false,
                        prepareInstanceSource
                    }
                }
            }
        }
    };
}

function createTemplateMoment(): MomentInstance {
    const localeData: MomentLocaleData = {
        firstDayOfWeek: () => 0,
        weekdaysMin: () => [],
        weekdaysShort: () => []
    };
    const value: MomentInstance = {
        clone: () => createTemplateMoment(),
        format: format => {
            if (format === 'YYYY-MM-DD') return '2026-08-10';
            if (format === 'YYYY/MM/DD') return '2026/08/10';
            if (format === 'HH:mm') return '00:00';
            return format ?? '';
        },
        isValid: () => true,
        locale: () => value,
        localeData: () => localeData,
        startOf: () => value,
        endOf: () => value,
        add: () => value,
        subtract: () => value,
        diff: () => 0,
        week: () => 33,
        weekYear: () => 2026,
        isoWeek: () => 33,
        isoWeekYear: () => 2026,
        month: () => 7,
        year: () => 2026,
        date: () => 10,
        set: () => value,
        get: () => 0,
        toDate: () => new Date('2026-08-10T00:00:00Z')
    };
    return value;
}

function installTemplateMoment(): void {
    const momentApi = (() => createTemplateMoment()) as MomentApi;
    momentApi.locales = () => ['en'];
    momentApi.locale = () => 'en';
    momentApi.fn = {};
    momentApi.utc = () => ({});
    vi.stubGlobal('window', { moment: momentApi });
    resetMomentApiCacheForTests();
}

describe('calendar note creation', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        resetMomentApiCacheForTests();
    });

    it('inherits the saved Core Daily Notes template for custom daily paths', async () => {
        const app = new App();
        Object.assign(app, {
            internalPlugins: {
                getPluginById: vi.fn(() => ({
                    enabled: true,
                    instance: { options: { folder: '', format: 'YYYY-MM-DD', template: '' } }
                }))
            }
        });
        Object.assign(app.vault.adapter, {
            read: vi.fn(async () => JSON.stringify({ format: 'YYYY/YYYYMMDD', template: 'Templates/Daily' }))
        });
        Object.assign(app.vault, { configDir: ['.ob', 'sidian'].join('') });
        const settings = { calendarCustomFileTemplate: null } as NotebookNavigatorSettings;

        await expect(resolveCalendarTemplateSelection(app, 'day', settings)).resolves.toEqual({
            path: 'Templates/Daily',
            source: 'core-daily',
            dateFormat: 'YYYY/YYYYMMDD'
        });
    });

    it('keeps an explicit Notebook Navigator daily template ahead of Core Daily Notes', async () => {
        const app = new App();
        const settings = { calendarCustomFileTemplate: 'Templates/Custom Day' } as NotebookNavigatorSettings;

        await expect(resolveCalendarTemplateSelection(app, 'day', settings)).resolves.toEqual({
            path: 'Templates/Custom Day',
            source: 'explicit',
            dateFormat: null
        });
    });

    it('keeps independent Notebook Navigator calendar creation out of GCM Daily Notes', async () => {
        const app = new App();
        const createdFile = createTestTFile('2026-08-10.md');
        const ensureForIsoDate = vi.fn(async () => null);
        const createNewMarkdownFile = vi.fn(async () => createdFile);
        Object.assign(app, {
            plugins: {
                enabledPlugins: new Set(['tps-global-context-menu']),
                plugins: {
                    'tps-global-context-menu': {
                        api: {
                            dailyNotes: {
                                version: 2,
                                findForIsoDate: vi.fn(() => null),
                                pathForIsoDate: vi.fn(() => '2026-08-10.md'),
                                ensureForIsoDate
                            }
                        }
                    }
                }
            }
        });
        app.fileManager.createNewMarkdownFile = createNewMarkdownFile;

        await expect(createCalendarMarkdownFile(app, '/', '2026-08-10.md')).resolves.toBe(createdFile);
        expect(createNewMarkdownFile).toHaveBeenCalledWith(app.vault.getRoot(), '2026-08-10');
        expect(ensureForIsoDate).not.toHaveBeenCalled();
    });

    it('uses Templater directly when a configured template file is available', async () => {
        const app = new App();
        const templateFile = createTestTFile('Templates/Daily.md');
        const createdFile = createTestTFile('Daily/2026-06-06.md');
        const createNoteFromTemplate = vi.fn(async () => createdFile);
        const createNewMarkdownFile = vi.fn();

        getTestVault(app).registerFile(templateFile);
        registerTemplater(app, createNoteFromTemplate);
        app.fileManager.createNewMarkdownFile = createNewMarkdownFile;

        const created = await createCalendarMarkdownFile(app, '/', '2026-06-06.md', templateFile.path);

        expect(created).toBe(createdFile);
        expect(createNoteFromTemplate).toHaveBeenCalledWith(templateFile, app.vault.getRoot(), '2026-06-06', false);
        expect(createNewMarkdownFile).not.toHaveBeenCalled();
    });

    it('copies template content when Templater is unavailable', async () => {
        const app = new App();
        const templateFile = createTestTFile('Templates/Daily.md');
        const createdFile = createTestTFile('Daily/2026-06-06.md');
        const templateContent = '---\ncreated: <% tp.file.creation_date("YYYY-MM-DD") %>\n---\n';
        const createNewMarkdownFile = vi.fn(async () => createdFile);
        const read = vi.fn(async () => templateContent);
        const modify = vi.fn(async () => undefined);

        getTestVault(app).registerFile(templateFile);
        app.fileManager.createNewMarkdownFile = createNewMarkdownFile;
        app.vault.read = read;
        app.vault.modify = modify;

        const created = await createCalendarMarkdownFile(app, '/', '2026-06-06.md', templateFile.path);

        expect(created).toBe(createdFile);
        expect(createNewMarkdownFile).toHaveBeenCalledWith(app.vault.getRoot(), '2026-06-06');
        expect(read).toHaveBeenCalledWith(templateFile);
        expect(modify).toHaveBeenCalledWith(createdFile, templateContent);
    });

    it('fails closed before creating a calendar note when template preparation is rejected', async () => {
        const app = new App();
        const templateFile = createTestTFile('Templates/Daily.md');
        const createNewMarkdownFile = vi.fn();

        getTestVault(app).registerFile(templateFile);
        registerTemplateLifecycle(app, () => null);
        app.fileManager.createNewMarkdownFile = createNewMarkdownFile;
        app.vault.read = vi.fn(async () => '---\ntags: [template]\n---\n');

        await expect(createCalendarMarkdownFile(app, '/', '2026-06-06.md', templateFile.path)).rejects.toThrow(
            'Template source could not be prepared safely'
        );
        expect(createNewMarkdownFile).not.toHaveBeenCalled();
    });

    it('resolves an explicit extensionless template path before creating', async () => {
        const app = new App();
        const templateFile = createTestTFile('Templates/Daily.md');
        const createdFile = createTestTFile('Daily/2026-06-06.md');
        const templateContent = '# Daily template\n';
        const createNewMarkdownFile = vi.fn(async () => createdFile);
        const read = vi.fn(async () => templateContent);
        const modify = vi.fn(async () => undefined);

        getTestVault(app).registerFile(templateFile);
        app.fileManager.createNewMarkdownFile = createNewMarkdownFile;
        app.vault.read = read;
        app.vault.modify = modify;

        await expect(createCalendarMarkdownFile(app, '/', '2026-06-06.md', 'Templates/Daily')).resolves.toBe(createdFile);
        expect(read).toHaveBeenCalledWith(templateFile);
        expect(modify).toHaveBeenCalledWith(createdFile, templateContent);
    });

    it('renders inherited Daily Notes tokens before creating a custom-path note', async () => {
        const app = new App();
        const templateFile = createTestTFile('Templates/Daily.md');
        const createdFile = createTestTFile('20260810.md');
        let createdContent = '';
        const create = vi.fn(async (_path: string, content: string) => {
            createdContent = content;
            return createdFile;
        });
        const templateContent = [
            '---',
            'tags: [template, keep]',
            '---',
            'scheduled: "{{date}} 00:00:00"',
            'title: "{{title}}"',
            'formatted: "{{date:YYYY/MM/DD}}"',
            '<% tp.file.creation_date() %>',
            '#template'
        ].join('\n');
        const selection: CalendarTemplateSelection = {
            path: 'Templates/Daily',
            source: 'core-daily',
            dateFormat: 'YYYY/YYYYMMDD'
        };
        const targetDate = createTemplateMoment();
        installTemplateMoment();
        getTestVault(app).registerFile(templateFile);
        registerTemplateLifecycle(app, source => source.replace('template, ', ''));
        Object.assign(app.vault, {
            read: vi.fn(async () => templateContent),
            create,
            process: vi.fn(async (_file: TFile, processor: (source: string) => string) => {
                createdContent = processor(createdContent);
                return createdContent;
            })
        });

        await expect(createCalendarMarkdownFile(app, '/', '20260810.md', selection, targetDate)).resolves.toBe(createdFile);
        expect(create).toHaveBeenCalledWith(
            '20260810.md',
            [
                '---',
                'tags: [keep]',
                '---',
                'scheduled: "2026-08-10 00:00:00"',
                'title: "20260810"',
                'formatted: "2026/08/10"',
                '<% tp.file.creation_date() %>',
                '#template'
            ].join('\n')
        );
        expect(createdContent).not.toContain('template, ');
    });

    it('does not render Daily Notes tokens in an explicit periodic template', async () => {
        const app = new App();
        const templateFile = createTestTFile('Templates/Weekly.md');
        const createdFile = createTestTFile('2026-W33.md');
        const templateContent = '# Week {{date}}\n';
        const createNewMarkdownFile = vi.fn(async () => createdFile);
        const modify = vi.fn(async () => undefined);
        getTestVault(app).registerFile(templateFile);
        app.fileManager.createNewMarkdownFile = createNewMarkdownFile;
        Object.assign(app.vault, { read: vi.fn(async () => templateContent), modify });

        await createCalendarMarkdownFile(
            app,
            '/',
            '2026-W33.md',
            { path: templateFile.path, source: 'explicit', dateFormat: null },
            createTemplateMoment()
        );

        expect(modify).toHaveBeenCalledWith(createdFile, templateContent);
    });

    it('validates an inherited template before creating calendar folders', async () => {
        const app = new App();
        const createFolder = vi.fn();
        Object.assign(app.vault, { createFolder });

        await expect(
            createCalendarMarkdownFile(
                app,
                'New/Nested',
                '20260810.md',
                { path: 'Templates/Missing', source: 'core-daily', dateFormat: 'YYYY-MM-DD' },
                createTemplateMoment()
            )
        ).rejects.toThrow('Configured calendar template was not found');
        expect(createFolder).not.toHaveBeenCalled();
    });
});
