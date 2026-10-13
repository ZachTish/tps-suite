import { App, TFile, TFolder } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActiveProfileState } from '../../src/context/SettingsContext';
import { useFolderNavigationSourceState } from '../../src/hooks/useFolderNavigationSourceState';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import type { MetadataService } from '../../src/services/MetadataService';

const { stateSetters, getFolderNoteMock, dbContentListeners } = vi.hoisted(() => ({
    stateSetters: [] as Array<ReturnType<typeof vi.fn>>,
    getFolderNoteMock: vi.fn(),
    dbContentListeners: [] as Array<(changes: unknown[]) => void>
}));

vi.mock('react', () => ({
    useCallback: (callback: unknown) => callback,
    useEffect: (callback: () => void) => callback(),
    useMemo: (callback: () => unknown) => callback(),
    useRef: (value: unknown) => ({ current: value }),
    useState: (initial: unknown) => {
        const setter = vi.fn();
        stateSetters.push(setter);
        return [typeof initial === 'function' ? (initial as () => unknown)() : initial, setter] as const;
    }
}));

vi.mock('obsidian', async importOriginal => ({
    ...(await importOriginal<typeof import('obsidian')>()),
    debounce: (callback: (...args: unknown[]) => void) => Object.assign(callback, { cancel: vi.fn() })
}));

vi.mock('../../src/hooks/useRootFolderOrder', () => ({
    useRootFolderOrder: () => ({
        rootFolders: [],
        rootLevelFolders: [],
        rootFolderOrderMap: new Map(),
        missingRootFolderPaths: []
    })
}));

vi.mock('../../src/storage/fileOperations', () => {
    const db = {
        onContentChange: (listener: (changes: unknown[]) => void) => {
            dbContentListeners.push(listener);
            return () => {};
        },
        getFile: () => ({ tags: [] })
    };
    return { getDBInstance: () => db, getDBInstanceOrNull: () => db };
});

vi.mock('../../src/utils/folderNoteLookup', async importOriginal => ({
    ...(await importOriginal<typeof import('../../src/utils/folderNoteLookup')>()),
    getFolderNote: getFolderNoteMock
}));

describe('useFolderNavigationSourceState metadata navigation work', () => {
    beforeEach(() => {
        stateSetters.length = 0;
        dbContentListeners.length = 0;
        getFolderNoteMock.mockReset();
    });

    it('skips body-only metadata bursts while preserving identity and tag/property changes', () => {
        const app = new App();
        const folder = new TFolder('Projects');
        Reflect.set(folder, 'name', 'Projects');
        app.vault.getFolderByPath = vi.fn((path: string) => (path === folder.path ? folder : null));
        const folderNote = new TFile('Projects/Projects.md');
        const aliasNote = new TFile('Projects/Alias.md');
        const ordinaryNote = new TFile('Projects/Ordinary.md');
        let activeFolderNote = folderNote;
        getFolderNoteMock.mockImplementation(() => activeFolderNote);
        let aliasHasMatchingTitle = true;
        app.metadataCache.getFileCache = vi.fn((file: TFile) =>
            file.path === aliasNote.path && aliasHasMatchingTitle ? { frontmatter: { title: 'Projects' } } : null
        );
        let metadataChanged: (file: TFile) => void = () => {};
        Reflect.set(app.metadataCache, 'on', (_event: string, listener: (file: TFile) => void) => {
            metadataChanged = listener;
            return {};
        });

        const metadataService = {
            getFolderDisplayVersion: () => 0,
            getFolderDisplayNameVersion: () => 0,
            subscribeToFolderDisplayChanges: () => () => {},
            subscribeToFolderDisplayNameChanges: () => () => {}
        } as unknown as MetadataService;
        const activeProfile = {
            hiddenFolders: [],
            hiddenFileProperties: [],
            hiddenFileNames: [],
            hiddenFileTags: ['private']
        } as unknown as ActiveProfileState;
        const source = useFolderNavigationSourceState({
            app,
            settings: { ...DEFAULT_SETTINGS, enableFolderNotes: true },
            activeProfile,
            metadataService,
            showHiddenItems: false
        });
        expect(source.folderExclusionByFolderNote).toBeDefined();
        source.folderExclusionByFolderNote?.(folder);
        getFolderNoteMock.mockClear();

        for (let index = 0; index < 20; index += 1) metadataChanged(ordinaryNote);
        expect(getFolderNoteMock).toHaveBeenCalledTimes(0);
        for (let index = 0; index < 20; index += 1) metadataChanged(folderNote);
        expect(stateSetters[0]).toHaveBeenCalledTimes(0); // folder exclusions
        expect(stateSetters[1]).toHaveBeenCalledTimes(0); // scoped file selection

        activeFolderNote = aliasNote;
        metadataChanged(aliasNote);
        expect(stateSetters[0]).toHaveBeenCalledTimes(1);
        expect(stateSetters[1]).toHaveBeenCalledTimes(0);
        metadataChanged(aliasNote);
        expect(stateSetters[0]).toHaveBeenCalledTimes(1);

        aliasHasMatchingTitle = false;
        activeFolderNote = folderNote;
        metadataChanged(aliasNote);
        expect(stateSetters[0]).toHaveBeenCalledTimes(2);

        dbContentListeners[0]([{ path: ordinaryNote.path, changes: { tags: ['work'], properties: [] } }]);
        expect(stateSetters[7]).toHaveBeenCalledTimes(1); // scoped tags
        expect(stateSetters[8]).toHaveBeenCalledTimes(1); // scoped properties
    });
});
