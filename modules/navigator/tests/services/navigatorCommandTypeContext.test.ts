import { App, TFile, type Command } from 'obsidian';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import registerNavigatorCommandHandlers, {
    hasActiveTypeCommandSelection,
    resolveOpenAllFilesContext,
    selectAdjacentFileWithoutNavigatorView
} from '../../src/services/commands/navigatorCommandHandlers';
import { STORAGE_KEYS } from '../../src/types';

const storedValues = vi.hoisted(() => new Map<string, unknown>());

vi.mock('../../src/utils/localStorage', () => ({
    localStorage: {
        get: (key: string) => storedValues.get(key) ?? null,
        set: (key: string, value: unknown) => {
            storedValues.set(key, value);
            return true;
        },
        remove: (key: string) => {
            storedValues.delete(key);
            return true;
        }
    }
}));

function createTypeNavItem() {
    return {
        type: 'type',
        folder: null,
        tag: null,
        property: null,
        navigatorType: 'structural:task'
    } as const;
}

describe('navigator command Types context', () => {
    beforeEach(() => {
        storedValues.clear();
    });

    it('fails open-all-files closed instead of falling back to the active file parent', () => {
        const app = new App();
        const activeFile = new TFile('Projects/Active.md');
        (app.vault as unknown as { registerFile(file: TFile): void }).registerFile(activeFile);
        const getActiveFile = vi.fn(() => activeFile);
        Object.assign(app, { workspace: { getActiveFile } });
        const plugin = {
            app,
            api: {
                selection: {
                    getNavItem: createTypeNavItem
                }
            }
        };

        expect(resolveOpenAllFilesContext(plugin as never)).toEqual({
            selectionType: null,
            selectedFolder: null,
            selectedTag: null,
            selectedProperty: null
        });
        expect(getActiveFile).not.toHaveBeenCalled();
    });

    it.each(['next', 'previous'] as const)(
        'does not select the %s file from a fallback folder when a Type is persisted and the navigator is unmounted',
        async direction => {
            storedValues.set(STORAGE_KEYS.selectedTypeKey, 'structural:task');
            const app = new App();
            const activeFile = new TFile('Projects/Active.md');
            const getActiveFile = vi.fn(() => activeFile);
            const getLeaf = vi.fn();
            Object.assign(app, { workspace: { getActiveFile, getLeaf } });
            const plugin = {
                app,
                api: null,
                settings: {
                    tpsFileTypesNavigationEnabled: true
                },
                getUXPreferences: () => ({
                    includeDescendantNotes: false,
                    showHiddenItems: false
                }),
                tagTreeService: null,
                propertyTreeService: null
            };

            await expect(selectAdjacentFileWithoutNavigatorView(plugin as never, direction)).resolves.toBe(false);
            expect(getLeaf).not.toHaveBeenCalled();
        }
    );

    it('disables the pinned-section command for a Type without mutating the root-folder preference', () => {
        const commands = new Map<string, Command>();
        const togglePinnedGroupCollapsed = vi.fn();
        const getNavigatorLeaves = vi.fn();
        const plugin = {
            settings: {
                tpsFileTypesNavigationEnabled: true
            },
            api: {
                selection: {
                    getNavItem: createTypeNavItem
                }
            },
            addCommand: vi.fn((command: Command) => {
                commands.set(command.id, command);
                return command;
            }),
            togglePinnedGroupCollapsed,
            getNavigatorLeaves
        };

        registerNavigatorCommandHandlers(plugin as never);
        const command = commands.get('toggle-pinned-section');

        expect(command?.checkCallback?.(true)).toBe(false);
        expect(command?.checkCallback?.(false)).toBe(false);
        expect(togglePinnedGroupCollapsed).not.toHaveBeenCalled();
        expect(getNavigatorLeaves).not.toHaveBeenCalled();
    });

    it('ignores a stale mounted Type selection after Types navigation is disabled', () => {
        const plugin = {
            settings: { tpsFileTypesNavigationEnabled: false },
            api: { selection: { getNavItem: createTypeNavItem } }
        };

        expect(hasActiveTypeCommandSelection(plugin as never)).toBe(false);
    });
});
