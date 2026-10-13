/* TPS Notebook Navigator: opt-in property paths use the existing grouping scalar. */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import * as groupingTypes from '../../src/settings/types';
import {
    areListGroupingOptionsEqual,
    areListGroupingOptionsSameKind,
    getAvailablePropertyGroupKeys,
    resolvePropertyGroupingDirection,
    updateDefaultNoteGroupingKey,
    updatePropertyGroupingOverrideKeys
} from '../../src/utils/listGrouping';
import { casefold } from '../../src/utils/recordUtils';
import { parsePropertyNodeId } from '../../src/utils/propertyTree';
import { ItemType } from '../../src/types';
import { strings } from '../../src/i18n';
import { validateListPresentationUpdate } from '../../src/services/listViewState/publicListState';
import { applyNavigatorListPresentationPlan, createNavigatorListPresentationPlan } from '../../src/services/listViewState/listPresentation';
import { applyModifiedSettingsTransfer, createModifiedSettingsTransfer } from '../../src/settings/transfer';
import { buildListGroupCollapseKeyPrefix } from '../../src/utils/listGroupCollapse';

const {
    createPropertyGroupingOption,
    getPropertyGroupingKey,
    getPropertyGroupingOrder,
    getPropertyGroupingGranularity,
    getPropertyGroupingSource
} = groupingTypes;

function configuredSettings() {
    return { ...structuredClone(DEFAULT_SETTINGS), propertyGroupKey: 'Kind, Status' };
}

/** Execute the actual default row with synthetic native Setting/Dropdown DOM. */
function defaultRow(groupBy: groupingTypes.ListNoteGroupingOption) {
    const source = readFileSync(new URL('../../src/settings/tabs/ListTab.ts', import.meta.url), 'utf8');
    const parsed = ts.createSourceFile('ListTab.ts', source, ts.ScriptTarget.Latest, true);
    const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'renderNoteGroupingSetting');
    if (!declaration) throw new Error('Default grouping row is missing');
    const javascript = ts.transpileModule(declaration.getText(parsed).replace(/^export /, ''), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText;
    const render = runInNewContext(`${javascript}\nrenderNoteGroupingSetting;`, {
        ...groupingTypes,
        DEFAULT_SETTINGS,
        strings,
        getAvailablePropertyGroupKeys,
        casefold,
        appendSettingText: () => {},
        getPropertyDropdownOptionLabel: (key: string) => `Property '${key}'`,
        setElementVisible: (el: { visible: boolean }, visible: boolean) => (el.visible = visible),
        runAsyncAction: (fn: () => unknown) => fn()
    }) as (setting: unknown, context: unknown) => void;
    const settings = configuredSettings();
    settings.noteGrouping = groupBy;
    const save = vi.fn(async () => {});
    const listeners = new Map<string, () => void>();
    const controls: Array<{
        value: string;
        options: Map<string, string>;
        selectEl: { visible: boolean; attrs: Map<string, string> };
        change: (value: string) => void;
    }> = [];
    const setting = {
        descEl: { empty: () => {} },
        setName: () => setting,
        setDesc: () => setting,
        addDropdown(configure: (dropdown: unknown) => void) {
            const state = {
                value: '',
                options: new Map<string, string>(),
                selectEl: {
                    visible: true,
                    attrs: new Map<string, string>(),
                    setAttribute(name: string, value: string) {
                        this.attrs.set(name, value);
                    },
                    empty() {
                        state.options.clear();
                    },
                    createEl() {
                        return {
                            createEl(_tag: string, option: { value: string; text: string }) {
                                state.options.set(option.value, option.text);
                            }
                        };
                    }
                },
                change: (_value: string) => {}
            };
            const dropdown = {
                selectEl: state.selectEl,
                setValue(value: string) {
                    state.value = value;
                    return dropdown;
                },
                addOption(value: string, label: string) {
                    state.options.set(value, label);
                    return dropdown;
                },
                onChange(callback: (value: string) => void) {
                    state.change = callback;
                    return dropdown;
                }
            };
            controls.push(state);
            configure(dropdown);
            return setting;
        }
    };
    render(setting, {
        plugin: { settings, saveSettingsAndUpdate: save },
        registerSettingsUpdateListener: (id: string, fn: () => void) => listeners.set(id, fn)
    });
    return { settings, controls, save, listeners };
}

interface MenuItem {
    title: string;
    checked: boolean;
    disabled: boolean;
    click?: () => void;
}
/** Executes the real property-choice/order statements inside handleSortMenu. Other menu clusters/React and host Menu are outside this harness. */
function propertyMenu(groupBy: groupingTypes.ListNoteGroupingOption, lineBacked = false) {
    const source = readFileSync(new URL('../../src/hooks/useListActions.ts', import.meta.url), 'utf8');
    const parsed = ts.createSourceFile('useListActions.ts', source, ts.ScriptTarget.Latest, true);
    let callback: ts.ArrowFunction | undefined;
    function visit(node: ts.Node): void {
        if (
            ts.isVariableDeclaration(node) &&
            ts.isIdentifier(node.name) &&
            node.name.text === 'handleSortMenu' &&
            node.initializer &&
            ts.isCallExpression(node.initializer)
        ) {
            const action = node.initializer.arguments[0];
            if (action && ts.isArrowFunction(action)) callback = action;
        }
        ts.forEachChild(node, visit);
    }
    visit(parsed);
    if (!callback || !ts.isBlock(callback.body)) throw new Error('Sort/group callback is missing');
    const statements = callback.body.statements;
    const start = statements.findIndex(
        node =>
            ts.isVariableStatement(node) &&
            node.declarationList.declarations.some(d => ts.isIdentifier(d.name) && d.name.text === 'effectiveGroupPropertyKey')
    );
    const end = statements.findIndex(
        (node, i) =>
            i > start &&
            ts.isIfStatement(node) &&
            node.expression.getText(parsed) === "effectiveGroupPropertyKey !== null || effectiveMenuGroup === 'tags'"
    );
    if (start < 0 || end <= start) throw new Error('Property menu statements are missing');
    const javascript = ts.transpileModule(
        statements
            .slice(start, end)
            .map(node => node.getText(parsed))
            .join('\n'),
        {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
        }
    ).outputText;
    const items: MenuItem[] = [];
    const choices: Array<{ option: groupingTypes.ListNoteGroupingOption; title: string }> = [];
    const applied = vi.fn();
    const menu = {
        addSeparator() {},
        addItem(configure: (item: unknown) => void) {
            const state: MenuItem = { title: '', checked: false, disabled: false };
            const item = {
                setTitle(value: string) {
                    state.title = value;
                    return item;
                },
                setIcon() {
                    return item;
                },
                setChecked(value: boolean) {
                    state.checked = value;
                    return item;
                },
                setDisabled(value: boolean) {
                    state.disabled = value;
                    return item;
                },
                onClick(callback: () => void) {
                    state.click = callback;
                    return item;
                }
            };
            configure(item);
            items.push(state);
        }
    };
    runInNewContext(javascript, {
        ...groupingTypes,
        effectiveMenuGroup: groupBy,
        getAvailablePropertyGroupKeys,
        parsePropertyNodeId,
        casefold,
        settings: configuredSettings(),
        hasPropertySelection: false,
        selectionState: {},
        canChooseLinePropertySource: lineBacked,
        hasLineBackedTypeSelection: lineBacked,
        canChooseDayPropertyGrouping: true,
        isManualSortActive: false,
        preserveAggregateGrouping: false,
        menu,
        strings,
        groupingInfo: { defaultGrouping: 'property-follow:Kind' },
        sortDirectionLabels: { asc: 'Ascending', desc: 'Descending' },
        getSortFieldLabel: (_field: string, key: string) => key,
        getSortFieldMenuIcon: () => 'icon',
        addGroupOptionItem: (option: groupingTypes.ListNoteGroupingOption, title: string) => choices.push({ option, title }),
        withDefaultSuffix: (label: string) => label,
        applyGrouping: applied
    });
    return { items, choices, applied };
}

describe('nested property grouping persisted/API contract', () => {
    it.each(['asc', 'desc', 'follow'] as const)('round-trips path grouping order %s with both existing metadata sources', order => {
        for (const source of ['note', 'line'] as const) {
            const encoded = createPropertyGroupingOption(' Kind ', order, 'path', source);
            const suffix = order === 'asc' ? '' : `-${order}`;
            expect(encoded).toBe(`${source === 'line' ? 'line-' : ''}property-path${suffix}:Kind`);
            expect(getPropertyGroupingKey(encoded)).toBe('Kind');
            expect(getPropertyGroupingOrder(encoded)).toBe(order);
            expect(getPropertyGroupingGranularity(encoded)).toBe('path');
            expect(getPropertyGroupingSource(encoded)).toBe(source);
            expect(groupingTypes.normalizeListNoteGroupingOption(encoded)).toBe(encoded);
            expect(validateListPresentationUpdate({ groupBy: encoded })).toEqual({ ok: true, value: { groupBy: encoded } });
            expect(groupingTypes.replacePropertyGroupingSource(encoded, source === 'line' ? 'note' : 'line')).toBe(
                createPropertyGroupingOption('Kind', order, 'path', source === 'line' ? 'note' : 'line')
            );
        }
    });
    it('rejects malformed API paths without consulting a host or changing settings', () => {
        for (const groupBy of [
            'property-path:',
            'property-path: ',
            'property-path-desc:',
            'property-path-follow: Kind',
            'property-path-day:Kind',
            'line-property-path:'
        ]) {
            expect(validateListPresentationUpdate({ groupBy })).toEqual({ ok: false });
        }
    });
    it('keeps flat/day equality and separates hierarchy collapse state while retaining order changes', () => {
        expect(areListGroupingOptionsEqual('property-path:Kind', 'property:Kind')).toBe(false);
        expect(areListGroupingOptionsSameKind('property-path:Kind', 'property-path-desc:kind')).toBe(true);
        expect(areListGroupingOptionsSameKind('property-path:Kind', 'property-day:kind')).toBe(false);
        expect(resolvePropertyGroupingDirection('property-path-follow:Kind', 'modified-desc')).toBe('desc');
        const scope = { selectionType: ItemType.FOLDER, selectedFolderPath: '/', selectedTag: null, selectedProperty: null };
        expect(buildListGroupCollapseKeyPrefix({ ...scope, groupingMode: 'property-path:Kind' })).toBe(
            buildListGroupCollapseKeyPrefix({ ...scope, groupingMode: 'property-path-desc:Kind' })
        );
        expect(buildListGroupCollapseKeyPrefix({ ...scope, groupingMode: 'property-path:Kind' })).not.toBe(
            buildListGroupCollapseKeyPrefix({ ...scope, groupingMode: 'property:Kind' })
        );
    });
    it('preserves paths through configured-key changes, guarded public plans, and settings transfer', () => {
        const current = configuredSettings();
        current.noteGrouping = 'property-path-desc:Kind';
        current.folderAppearances.Inbox = { groupBy: 'property-path-follow:Kind', previewRows: 2 };
        const plan = createNavigatorListPresentationPlan(
            current,
            { type: ItemType.FOLDER, key: 'Inbox' },
            { groupBy: 'property-path-desc:status' }
        );
        expect(plan).not.toBeNull();
        applyNavigatorListPresentationPlan(current, plan!);
        expect(current.folderAppearances.Inbox).toEqual({ groupBy: 'property-path-desc:Status', previewRows: 2 });
        updateDefaultNoteGroupingKey(current, 'kind', 'Class');
        updatePropertyGroupingOverrideKeys(current, 'status', 'State');
        expect(current.noteGrouping).toBe('property-path-desc:Class');
        expect(current.folderAppearances.Inbox.groupBy).toBe('property-path-desc:State');
        const restored = applyModifiedSettingsTransfer(structuredClone(DEFAULT_SETTINGS), createModifiedSettingsTransfer(current, '8.3.1'));
        expect(restored.noteGrouping).toBe(current.noteGrouping);
        expect(restored.folderAppearances).toEqual(current.folderAppearances);
        expect(DEFAULT_SETTINGS.noteGrouping).toBe('date');
    });
});

describe('actual default grouping row', () => {
    it('retains base choices, offers both shapes for configured keys, and preserves order changing property or shape', () => {
        const row = defaultRow('property-path-desc:Kind');
        const [mode, order] = row.controls;
        for (const key of [
            'none',
            'custom',
            'date',
            'folder',
            'tags',
            'property-follow:Kind',
            'property-path-follow:Kind',
            'property-follow:Status',
            'property-path-follow:Status'
        ])
            expect(mode.options.has(key)).toBe(true);
        expect(mode.value).toBe('property-path-follow:Kind');
        expect(order.value).toBe('desc');
        expect(order.selectEl.visible).toBe(true);
        expect(mode.selectEl.attrs.get('aria-label')).toBe(strings.settings.items.defaultGrouping.name);
        expect(order.selectEl.attrs.get('aria-label')).toBe(strings.settings.items.defaultGroupingDirection.name);
        order.change('follow');
        expect(row.settings.noteGrouping).toBe('property-path-follow:Kind');
        mode.change('property-path-follow:Status');
        expect(row.settings.noteGrouping).toBe('property-path-follow:Status');
        mode.change('property-follow:Status');
        expect(row.settings.noteGrouping).toBe('property-follow:Status');
        mode.change('none');
        expect(row.settings.noteGrouping).toBe('none');
        expect(order.selectEl.visible).toBe(false);
        order.change('desc');
        expect(row.settings.noteGrouping).toBe('none');
    });
    it('preserves existing day/source granularity when changing order without exposing new line UI', () => {
        const row = defaultRow('line-property-day-desc:Kind');
        row.controls[1].change('asc');
        expect(row.settings.noteGrouping).toBe('line-property-day:Kind');
        expect([...row.controls[0].options.keys()].some(key => key.startsWith('line-'))).toBe(false);
    });
    it('rebuilds configured keys while preserving path selection and no-op saves', () => {
        const row = defaultRow('property-path-desc:Kind');
        row.controls[1].change('desc');
        expect(row.save).not.toHaveBeenCalled();
        row.settings.propertyGroupKey = 'kind, Other';
        row.listeners.get('list-pane-note-grouping')!();
        expect(row.controls[0].value).toBe('property-path-follow:kind');
        expect(row.controls[0].options.has('property-path-follow:Other')).toBe(true);
        expect(row.controls[0].options.has('property-path-follow:Status')).toBe(false);
    });
});

describe('actual sort/group property-choice statements', () => {
    it('offers flat/nested controls and keeps key and order when switching shape', () => {
        const menu = propertyMenu('property-desc:Kind');
        expect(menu.items.map(item => item.title.trim())).toContain('Flat values');
        expect(menu.items.map(item => item.title.trim())).toContain('Nested values');
        expect(menu.items.find(item => item.title.trim() === 'Flat values')?.checked).toBe(true);
        menu.items.find(item => item.title.trim() === 'Flat values')!.click!();
        expect(menu.applied).not.toHaveBeenCalled();
        menu.items.find(item => item.title.trim() === 'Nested values')!.click!();
        expect(menu.applied).toHaveBeenLastCalledWith('property-path-desc:Kind');
    });
    it('retains nested shape across property and order choices, and can explicitly return to flat', () => {
        const menu = propertyMenu('property-path-follow:Kind');
        expect(menu.choices).toContainEqual({ option: 'property-path-follow:Status', title: 'Status' });
        expect(menu.choices).toContainEqual({
            option: 'property-day-follow:Status',
            title: `Status · ${strings.settings.items.defaultGrouping.options.date}`
        });
        menu.items.find(item => item.title.trim() === 'Descending')!.click!();
        expect(menu.applied).toHaveBeenLastCalledWith('property-path-desc:Kind');
        menu.items.find(item => item.title.trim() === 'Flat values')!.click!();
        expect(menu.applied).toHaveBeenLastCalledWith('property-follow:Kind');
    });
    it('does not offer the shape toggle for day or retired line-backed modes', () => {
        for (const menu of [propertyMenu('property-day:Kind'), propertyMenu('line-property-path:Kind', true)]) {
            expect(menu.items.map(item => item.title.trim())).not.toContain('Nested values');
            expect(menu.items.map(item => item.title.trim())).not.toContain('Flat values');
        }
    });
});
