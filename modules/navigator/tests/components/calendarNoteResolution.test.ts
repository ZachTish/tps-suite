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

import { App, TFile, TFolder } from 'obsidian';
import moment from 'moment';
import { describe, expect, test, vi } from 'vitest';
import {
    createCalendarNotePathResolverContext,
    isConfiguredCustomCalendarNotePath,
    parseCalendarNoteDateFromPath,
    registerCalendarDailyNoteReadinessRefresh,
    resolveCalendarNotePath,
    resolveCalendarNoteTarget,
    resolveCoreDailyNoteDateFromFile,
    shouldRefreshCalendarForGcmApiChange,
    shouldRefreshCalendarForVaultFileChange
} from '../../src/components/calendar/calendarNoteResolution';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../src/constants/tpsIdentity';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { MomentApi, MomentInstance, MomentLocaleData } from '../../src/utils/moment';
import { createTestTFile } from '../utils/createTestTFile';

function createFakeMoment(
    formatMap?: Record<string, string>,
    options?: {
        isValid?: boolean;
    }
): MomentInstance {
    const localeData: MomentLocaleData = {
        firstDayOfWeek: () => 1,
        weekdaysMin: () => [],
        weekdaysShort: () => []
    };

    const stub: MomentInstance = {
        clone: () => createFakeMoment(formatMap, options),
        format: (format?: string) => (format ? (formatMap?.[format] ?? format) : ''),
        isValid: () => options?.isValid ?? true,
        locale: () => stub,
        localeData: () => localeData,
        startOf: () => stub,
        endOf: () => stub,
        add: () => stub,
        subtract: () => stub,
        diff: () => 0,
        week: () => 25,
        weekYear: () => 2026,
        isoWeek: () => 25,
        isoWeekYear: () => 2026,
        month: () => 5,
        year: () => 2026,
        date: () => 14,
        set: () => stub,
        get: () => 0,
        toDate: () => new Date('2026-06-14T00:00:00Z')
    };

    return stub;
}

function createMomentApi(parsedByKey: Record<string, Record<string, string>>): MomentApi {
    const momentApi = ((input?: string | number | Date, format?: unknown): MomentInstance => {
        if (typeof input === 'string' && format === 'YYYY-MM-DD') {
            return createFakeMoment({ 'YYYY-MM-DD': input });
        }

        if (typeof input === 'string' && typeof format === 'string') {
            const formatMap = parsedByKey[`${format}::${input}`];
            if (formatMap) {
                return createFakeMoment(formatMap);
            }
        }

        return createFakeMoment(undefined, { isValid: false });
    }) as MomentApi;

    momentApi.locales = () => ['en'];
    momentApi.locale = () => 'en';
    momentApi.fn = {};
    momentApi.utc = () => ({});

    return momentApi;
}

function registerGcmDailyNotes(app: App, dailyNotes: Record<string, unknown>): void {
    Object.assign(app, {
        plugins: {
            enabledPlugins: new Set([TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]),
            plugins: { [TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID]: { api: { dailyNotes } } }
        }
    });
}

function createGcmDailyNotes(overrides: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        version: 3,
        findForIsoDate: vi.fn(() => null),
        dateForFile: vi.fn(() => null),
        pathForIsoDate: vi.fn(() => null),
        ensureForIsoDate: vi.fn(async () => null),
        ...overrides
    };
}

describe('calendar note resolution', () => {
    test('skips year refreshes for an unrelated burst while keeping configured custom notes live', () => {
        const settings = { ...DEFAULT_SETTINGS, calendarIntegrationMode: 'notebook-navigator' as const };
        const momentApi = createMomentApi({});
        const momentCalls = Object.assign(vi.fn(momentApi), momentApi);
        const base = {
            settings,
            customCalendarRootFolderSettings: { calendarCustomRootFolder: '' },
            momentApi: momentCalls,
            locale: 'en'
        };
        const cachedDayTargets = new Map([['2026-08-03', '2026/20260803.md']]);
        const onRefresh = vi.fn(() => cachedDayTargets.clear());
        const applyVaultEvent = (file: unknown, oldPath?: string) => {
            if (shouldRefreshCalendarForVaultFileChange({ ...base, file, oldPath })) {
                onRefresh();
            }
        };

        for (let index = 0; index < 100; index++) {
            const file = createTestTFile(`Inbox/Withdrawal QA ${index}.md`);
            applyVaultEvent(file); // create
            applyVaultEvent(file, `Inbox/Previous QA ${index}.md`); // rename
            applyVaultEvent(file); // delete
        }
        expect(onRefresh).not.toHaveBeenCalled();
        expect(cachedDayTargets.size).toBe(1);
        expect(momentCalls).not.toHaveBeenCalled();
        for (let index = 0; index < 100; index++) {
            // GCM can reannounce its API after an unrelated metadata edit.
            if (shouldRefreshCalendarForGcmApiChange(settings.calendarIntegrationMode)) {
                onRefresh();
            }
        }
        expect(onRefresh).not.toHaveBeenCalled();
        expect(cachedDayTargets.size).toBe(1);
        expect(isConfiguredCustomCalendarNotePath({ ...base, filePath: '2026/20260803.md' })).toBe(true);
        expect(isConfiguredCustomCalendarNotePath({ ...base, filePath: '2026/202608.md' })).toBe(true);
        expect(isConfiguredCustomCalendarNotePath({ ...base, filePath: '2026/W32.md' })).toBe(true);
        expect(isConfiguredCustomCalendarNotePath({ ...base, filePath: '2026/Q3.md' })).toBe(true);
        expect(isConfiguredCustomCalendarNotePath({ ...base, filePath: '2026.md' })).toBe(true);
        expect(isConfiguredCustomCalendarNotePath({ ...base, filePath: '2026/20260803-copy.md' })).toBe(true);
        expect(isConfiguredCustomCalendarNotePath({ ...base, filePath: '2026/Project.md' })).toBe(true);
        expect(isConfiguredCustomCalendarNotePath({ ...base, filePath: 'Inbox/2026/Project.md' })).toBe(false);
        expect(
            isConfiguredCustomCalendarNotePath({
                ...base,
                filePath: '2026/20260803.md',
                settings: { ...settings, calendarCustomFilePattern: '' }
            })
        ).toBe(true);

        // One refresh per relevant event is still coalesced by Calendar's existing scheduler.
        applyVaultEvent(createTestTFile('2026/20260803.md')); // create
        expect(cachedDayTargets.size).toBe(0);
        applyVaultEvent(createTestTFile('2026/202608.md')); // create a month note
        applyVaultEvent(createTestTFile('2026/20260803.md')); // delete
        applyVaultEvent(createTestTFile('Inbox/Moved.md'), '2026/20260803.md'); // rename out
        applyVaultEvent(createTestTFile('2026/20260803.md'), 'Inbox/Moved.md'); // rename in
        expect(onRefresh).toHaveBeenCalledTimes(5);
        expect(momentCalls).not.toHaveBeenCalled();
    });

    test('preserves folder moves, Daily Notes mode, and Markdown extension changes', () => {
        const settings = { ...DEFAULT_SETTINGS, calendarIntegrationMode: 'notebook-navigator' as const };
        const momentApi = createMomentApi({
            'YYYY/YYYYMMDD::2026/20260803': {
                YYYY: '2026',
                YYYYMMDD: '20260803',
                'YYYY/YYYYMMDD': '2026/20260803'
            }
        });
        const base = {
            settings,
            customCalendarRootFolderSettings: { calendarCustomRootFolder: '' },
            momentApi,
            locale: 'en'
        };

        expect(shouldRefreshCalendarForVaultFileChange({ ...base, file: new TFolder('2026') })).toBe(true);
        expect(
            shouldRefreshCalendarForVaultFileChange({ ...base, file: new TFile('2026/20260803.txt'), oldPath: '2026/20260803.md' })
        ).toBe(true);
        expect(shouldRefreshCalendarForVaultFileChange({ ...base, file: new TFile('Inbox/Other.txt'), oldPath: 'Inbox/Other.md' })).toBe(
            false
        );
        expect(
            shouldRefreshCalendarForVaultFileChange({
                ...base,
                file: new TFile('Inbox/Other.md'),
                settings: { ...settings, calendarIntegrationMode: 'daily-notes' }
            })
        ).toBe(true);
        expect(shouldRefreshCalendarForGcmApiChange('daily-notes')).toBe(true);
        expect(shouldRefreshCalendarForVaultFileChange({ ...base, file: new TFile('Inbox/Other.md'), momentApi: null })).toBe(true);
    });

    test('conservatively refreshes literal-first patterns and accepts localized year digits', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            calendarIntegrationMode: 'notebook-navigator' as const,
            calendarCustomFilePattern: '[Daily]/YYYYMMDD',
            calendarCustomWeekPattern: '',
            calendarCustomMonthPattern: '',
            calendarCustomQuarterPattern: '',
            calendarCustomYearPattern: ''
        };
        const momentApi = createMomentApi({});
        const base = {
            settings,
            customCalendarRootFolderSettings: { calendarCustomRootFolder: '' },
            momentApi,
            locale: 'en'
        };

        expect(isConfiguredCustomCalendarNotePath({ ...base, filePath: 'Daily/20260803.md' })).toBe(true);
        expect(isConfiguredCustomCalendarNotePath({ ...base, filePath: 'Daily/Other.md' })).toBe(true);
        expect(
            isConfiguredCustomCalendarNotePath({
                ...base,
                filePath: 'Daily/Other.md',
                customCalendarRootFolderSettings: { calendarCustomRootFolder: 'Periodic' }
            })
        ).toBe(false);
        expect(
            isConfiguredCustomCalendarNotePath({
                ...base,
                settings: { ...settings, calendarCustomFilePattern: 'YYYY/YYYYMMDD' },
                filePath: '٢٠٢٦/٢٠٢٦٠٨٠٣.md'
            })
        ).toBe(true);
        expect(
            isConfiguredCustomCalendarNotePath({
                ...base,
                settings: { ...DEFAULT_SETTINGS, calendarCustomMonthPattern: '[Monthly]/YYYY-MM' },
                filePath: 'Inbox/Other.md'
            })
        ).toBe(true);
    });

    test.each([
        {
            name: 'day with quarter token',
            kind: 'day' as const,
            settingsPatch: { calendarCustomFilePattern: 'YYYY-MM-DD/[Q]Q' },
            date: '2026-06-19',
            relativePath: '2026-06-19/Q2.md'
        },
        {
            name: 'month with locale week-year',
            kind: 'month' as const,
            settingsPatch: { calendarCustomMonthPattern: 'gggg/MM' },
            date: '2027-02-17',
            relativePath: '2027/02.md'
        },
        {
            name: 'quarter with locale week-year',
            kind: 'quarter' as const,
            settingsPatch: { calendarCustomQuarterPattern: 'gggg/[Q]Q' },
            date: '2027-04-03',
            relativePath: '2027/Q2.md'
        },
        {
            name: 'year with mixed year tokens',
            kind: 'year' as const,
            settingsPatch: { calendarCustomYearPattern: 'gggg/YYYY' },
            date: '2020-12-31',
            relativePath: '2021/2020.md'
        }
    ])('refreshes generated $name paths on create, delete, and either rename direction', ({ kind, settingsPatch, date, relativePath }) => {
        const settings = { ...DEFAULT_SETTINGS, ...settingsPatch, calendarIntegrationMode: 'notebook-navigator' as const };
        const momentApi = moment as unknown as MomentApi;
        const customCalendarRootFolderSettings = { calendarCustomRootFolder: 'Periodic' };
        const filePath = resolveCalendarNotePath({
            kind,
            date: moment(date, 'YYYY-MM-DD', true),
            resolverContext: createCalendarNotePathResolverContext(kind, settings),
            calendarLocale: 'en',
            weekLocale: 'en',
            customCalendarRootFolderSettings,
            momentApi
        })?.filePath;

        expect(filePath).toBe(`Periodic/${relativePath}`);
        const base = { settings, customCalendarRootFolderSettings, momentApi, locale: 'en' };
        const file = createTestTFile(filePath!);
        expect(shouldRefreshCalendarForVaultFileChange({ ...base, file })).toBe(true); // create
        expect(shouldRefreshCalendarForVaultFileChange({ ...base, file })).toBe(true); // delete
        expect(shouldRefreshCalendarForVaultFileChange({ ...base, file: createTestTFile('Inbox/Moved.md'), oldPath: filePath })).toBe(true);
        expect(shouldRefreshCalendarForVaultFileChange({ ...base, file, oldPath: 'Inbox/Moved.md' })).toBe(true);
        expect(shouldRefreshCalendarForVaultFileChange({ ...base, file: createTestTFile(`Outside/${relativePath}`) })).toBe(false);
    });

    test('refreshes cached Daily Note misses across startup metadata readiness and unregisters cleanly', () => {
        const eventRef = { id: 'calendar-daily-note-readiness' };
        const listeners = new Map<object, () => void>();
        const metadataCache = {
            on: vi.fn((name: string, listener: () => void) => {
                expect(name).toBe('resolved');
                listeners.set(eventRef, listener);
                return eventRef;
            }),
            offref: vi.fn((ref: object) => {
                listeners.delete(ref);
            })
        };
        const cachedMisses = new Map([['2026-08-03', null]]);
        const onRefresh = vi.fn(() => {
            cachedMisses.clear();
        });

        const cleanup = registerCalendarDailyNoteReadinessRefresh(metadataCache, onRefresh);

        expect(onRefresh).toHaveBeenCalledTimes(1);
        expect(cachedMisses.size).toBe(0);

        cachedMisses.set('2026-08-03', null);
        listeners.forEach(listener => listener());
        expect(onRefresh).toHaveBeenCalledTimes(2);
        expect(cachedMisses.size).toBe(0);

        cleanup();
        expect(metadataCache.offref).toHaveBeenCalledOnce();
        expect(metadataCache.offref).toHaveBeenCalledWith(eventRef);
        listeners.forEach(listener => listener());
        expect(onRefresh).toHaveBeenCalledTimes(2);
    });

    test('uses GCM v3 reverse identity for an active legacy Daily Note path', () => {
        const app = new App();
        const existingFile = createTestTFile('Legacy/Mon, Aug 03 2026.md');
        const dateForFile = vi.fn(() => '2026-08-03');
        registerGcmDailyNotes(app, createGcmDailyNotes({ dateForFile }));

        const result = resolveCoreDailyNoteDateFromFile({
            app,
            file: existingFile,
            settings: { folder: 'Current', format: 'YYYY-MM-DD', template: '' },
            momentApi: createMomentApi({}),
            locale: 'en'
        });

        expect(result?.format('YYYY-MM-DD')).toBe('2026-08-03');
        expect(dateForFile).toHaveBeenCalledWith(existingFile);
    });

    test('fails closed on GCM v3 null instead of locally parsing the active file', () => {
        const app = new App();
        const existingFile = createTestTFile('Daily/2026-08-03.md');
        registerGcmDailyNotes(app, createGcmDailyNotes());

        expect(
            resolveCoreDailyNoteDateFromFile({
                app,
                file: existingFile,
                settings: { folder: 'Daily', format: 'YYYY-MM-DD', template: '' },
                momentApi: createMomentApi({
                    '[Daily]/YYYY-MM-DD::Daily/2026-08-03': { 'YYYY-MM-DD': '2026-08-03' }
                }),
                locale: 'en'
            })
        ).toBeNull();
    });

    test('fails closed when an enabled GCM provider has no v3 reverse capability', () => {
        const app = new App();
        const existingFile = createTestTFile('Daily/2026-08-03.md');
        registerGcmDailyNotes(app, createGcmDailyNotes({ version: 2, dateForFile: undefined }));

        expect(
            resolveCoreDailyNoteDateFromFile({
                app,
                file: existingFile,
                settings: { folder: 'Daily', format: 'YYYY-MM-DD', template: '' },
                momentApi: createMomentApi({
                    '[Daily]/YYYY-MM-DD::Daily/2026-08-03': { 'YYYY-MM-DD': '2026-08-03' }
                }),
                locale: 'en'
            })
        ).toBeNull();
    });

    test('locally parses the exact active Core path only when GCM is absent', () => {
        const app = new App();
        const existingFile = createTestTFile('Daily/2026-08-03.md');
        const result = resolveCoreDailyNoteDateFromFile({
            app,
            file: existingFile,
            settings: { folder: 'Daily', format: 'YYYY-MM-DD', template: '' },
            momentApi: createMomentApi({
                '[Daily]/YYYY-MM-DD::Daily/2026-08-03': { 'YYYY-MM-DD': '2026-08-03' }
            }),
            locale: 'en'
        });

        expect(result?.format('YYYY-MM-DD')).toBe('2026-08-03');
    });

    test('re-resolves the current GCM API after its capability changes', () => {
        const app = new App();
        const existingFile = createTestTFile('Legacy/20260803.md');
        const firstApi = createGcmDailyNotes();
        registerGcmDailyNotes(app, firstApi);
        const options = {
            app,
            file: existingFile,
            settings: { folder: 'Daily', format: 'YYYY-MM-DD', template: '' },
            momentApi: createMomentApi({}),
            locale: 'en'
        };

        expect(resolveCoreDailyNoteDateFromFile(options)).toBeNull();
        const secondApi = createGcmDailyNotes({ dateForFile: vi.fn(() => '2026-08-03') });
        registerGcmDailyNotes(app, secondApi);
        expect(resolveCoreDailyNoteDateFromFile(options)?.format('YYYY-MM-DD')).toBe('2026-08-03');
    });

    test('retains an existing note while hiding it from a profile-hidden folder', () => {
        const existingFile = createTestTFile('Personal/Journal/2026-07-18.md');

        const target = resolveCalendarNoteTarget({
            existingFile,
            targetPath: existingFile.path,
            hiddenFolders: ['/Personal/Journal'],
            showHiddenItems: false,
            isExistingFileVisible: () => true
        });

        expect(target).toEqual({
            existingFile,
            visibleFile: null,
            isHidden: true,
            targetPath: existingFile.path
        });
    });

    test('blocks creation when a missing calendar note targets a profile-hidden folder', () => {
        const target = resolveCalendarNoteTarget({
            existingFile: null,
            targetPath: 'Personal/Journal/2026-07-19.md',
            hiddenFolders: ['/Personal/Journal'],
            showHiddenItems: false,
            isExistingFileVisible: () => true
        });

        expect(target).toEqual({
            existingFile: null,
            visibleFile: null,
            isHidden: true,
            targetPath: 'Personal/Journal/2026-07-19.md'
        });
    });

    test('shows profile-hidden calendar targets while hidden items are enabled', () => {
        const existingFile = createTestTFile('Personal/Journal/2026-07-18.md');

        const target = resolveCalendarNoteTarget({
            existingFile,
            targetPath: existingFile.path,
            hiddenFolders: ['/Personal/Journal'],
            showHiddenItems: true,
            isExistingFileVisible: () => false
        });

        expect(target).toEqual({
            existingFile,
            visibleFile: existingFile,
            isHidden: false,
            targetPath: existingFile.path
        });
    });

    test('hides an existing calendar note excluded by another profile file rule', () => {
        const existingFile = createTestTFile('Journal/2026-07-18.md');

        const target = resolveCalendarNoteTarget({
            existingFile,
            targetPath: existingFile.path,
            hiddenFolders: [],
            showHiddenItems: false,
            isExistingFileVisible: () => false
        });

        expect(target.existingFile).toBe(existingFile);
        expect(target.visibleFile).toBeNull();
        expect(target.isHidden).toBe(true);
    });

    test('parses a month note path when it round-trips through the configured pattern', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            calendarCustomMonthPattern: 'YYYY/YYYY-MM'
        };
        const filePath = 'Periodic/2026/2026-04.md';
        const resolverContext = createCalendarNotePathResolverContext('month', settings);
        const momentApi = createMomentApi({
            '[Periodic]/YYYY/YYYY-MM::Periodic/2026/2026-04': {
                YYYY: '2026',
                'YYYY-MM': '2026-04',
                'YYYY-MM-DD': '2026-04-01'
            }
        });

        const parsedDate = parseCalendarNoteDateFromPath({
            filePath,
            kind: 'month',
            resolverContext,
            calendarLocale: 'en',
            weekLocale: 'en',
            customCalendarRootFolderSettings: { calendarCustomRootFolder: 'Periodic' },
            momentApi,
            parseLocale: 'en'
        });

        expect(parsedDate).not.toBeNull();
        expect(parsedDate?.format('YYYY-MM-DD')).toBe('2026-04-01');
    });

    test('parses a nested weekly note path when the full path mixes month and quarter folders', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            calendarCustomWeekPattern: 'YYYY/YYYY-[Q]Q/YYYY-MM/YYYY-[W]ww/YYYY-[W]ww'
        };
        const filePath = 'Periodic/2026/2026-Q2/2026-06/2026-W25/2026-W25.md';
        const resolverContext = createCalendarNotePathResolverContext('week', settings);
        const momentApi = createMomentApi({
            'YYYY-[W]ww::2026-W25': {
                YYYY: '2026',
                'YYYY-[Q]Q': '2026-Q2',
                'YYYY-MM': '2026-06',
                'YYYY/YYYY-[Q]Q/YYYY-MM/YYYY-[W]ww': '2026/2026-Q2/2026-06/2026-W25',
                'YYYY-[W]ww': '2026-W25',
                'YYYY-MM-DD': '2026-06-14'
            }
        });

        const parsedDate = parseCalendarNoteDateFromPath({
            filePath,
            kind: 'week',
            resolverContext,
            calendarLocale: 'en',
            weekLocale: 'en',
            customCalendarRootFolderSettings: { calendarCustomRootFolder: 'Periodic' },
            momentApi,
            parseLocale: 'en'
        });

        expect(parsedDate).not.toBeNull();
        expect(parsedDate?.format('YYYY-MM-DD')).toBe('2026-06-14');
    });

    test('refreshes a configured weekly note at a calendar-year and week-year boundary', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            calendarIntegrationMode: 'notebook-navigator' as const,
            calendarCustomWeekPattern: 'YYYY/YYYY-[Q]Q/YYYY-MM/YYYY-[W]ww/YYYY-[W]ww'
        };
        const momentApi = moment as unknown as MomentApi;
        const customCalendarRootFolderSettings = { calendarCustomRootFolder: 'Periodic' };
        const resolverContext = createCalendarNotePathResolverContext('week', settings);
        const filePath = resolveCalendarNotePath({
            kind: 'week',
            date: moment('2020-12-31', 'YYYY-MM-DD', true),
            resolverContext,
            calendarLocale: 'en',
            weekLocale: 'en',
            customCalendarRootFolderSettings,
            momentApi
        })?.filePath;

        expect(filePath).toBe('Periodic/2020/2020-Q4/2020-12/2020-W01/2020-W01.md');
        const base = { settings, customCalendarRootFolderSettings, momentApi, locale: 'en' };
        expect(shouldRefreshCalendarForVaultFileChange({ ...base, file: createTestTFile(filePath!) })).toBe(true);
        expect(shouldRefreshCalendarForVaultFileChange({ ...base, file: createTestTFile('Inbox/Moved.md'), oldPath: filePath })).toBe(true);
        expect(
            shouldRefreshCalendarForVaultFileChange({
                ...base,
                file: createTestTFile('Periodic/2020/2020-Q4/2020-12/2020-W01/Unrelated.md')
            })
        ).toBe(true);
    });

    test.each([
        ['locale week year', 'gggg/MM/[W]ww', '2021/12/W01'],
        ['ISO week year', 'GGGG/MM/[W]WW', '2020/12/W53'],
        ['literal-first ISO week year', '[Weekly]/GGGG/MM/[W]WW', 'Weekly/2020/12/W53'],
        ['date token that renders folders', 'gggg/L/[W]ww', '2021/12/27/2020/W01'],
        ['literal Markdown extension', 'gggg/[W]ww[.md]', '2021/W01']
    ])('refreshes generated %s paths without relying on strict reverse parsing', (_description, pattern, relativePath) => {
        const settings = {
            ...DEFAULT_SETTINGS,
            calendarIntegrationMode: 'notebook-navigator' as const,
            calendarCustomWeekPattern: pattern
        };
        const momentApi = moment as unknown as MomentApi;
        const customCalendarRootFolderSettings = { calendarCustomRootFolder: 'Periodic' };
        const resolverContext = createCalendarNotePathResolverContext('week', settings);
        const filePath = resolveCalendarNotePath({
            kind: 'week',
            date: moment('2020-12-31', 'YYYY-MM-DD', true),
            resolverContext,
            calendarLocale: 'en',
            weekLocale: 'en',
            customCalendarRootFolderSettings,
            momentApi
        })?.filePath;

        expect(filePath).toBe(`Periodic/${relativePath}.md`);
        const base = { settings, customCalendarRootFolderSettings, momentApi, locale: 'en' };
        expect(shouldRefreshCalendarForVaultFileChange({ ...base, file: createTestTFile(filePath!) })).toBe(true);
        expect(shouldRefreshCalendarForVaultFileChange({ ...base, file: createTestTFile('Inbox/Moved.md'), oldPath: filePath })).toBe(true);
        expect(shouldRefreshCalendarForVaultFileChange({ ...base, file: createTestTFile(filePath!), oldPath: 'Inbox/Moved.md' })).toBe(
            true
        );
        expect(
            shouldRefreshCalendarForVaultFileChange({
                ...base,
                file: createTestTFile(`Periodic/${relativePath.replace(/W\d+$/u, 'Unrelated')}.md`)
            })
        ).toBe(true);
    });

    test('returns null when a nested weekly note path does not resolve back to the same month folder', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            calendarCustomWeekPattern: 'YYYY/YYYY-[Q]Q/YYYY-MM/YYYY-[W]ww/YYYY-[W]ww'
        };
        const filePath = 'Periodic/2026/2026-Q2/2026-05/2026-W25/2026-W25.md';
        const resolverContext = createCalendarNotePathResolverContext('week', settings);
        const momentApi = createMomentApi({
            'YYYY-[W]ww::2026-W25': {
                YYYY: '2026',
                'YYYY-[Q]Q': '2026-Q2',
                'YYYY-MM': '2026-06',
                'YYYY/YYYY-[Q]Q/YYYY-MM/YYYY-[W]ww': '2026/2026-Q2/2026-06/2026-W25',
                'YYYY-[W]ww': '2026-W25',
                'YYYY-MM-DD': '2026-06-14'
            }
        });

        const parsedDate = parseCalendarNoteDateFromPath({
            filePath,
            kind: 'week',
            resolverContext,
            calendarLocale: 'en',
            weekLocale: 'en',
            customCalendarRootFolderSettings: { calendarCustomRootFolder: 'Periodic' },
            momentApi,
            parseLocale: 'en'
        });

        expect(parsedDate).toBeNull();
    });
});
