/* TPS Notebook Navigator - provider row accessibility and interaction rendering. */

import React from 'react';
import { Platform } from 'obsidian';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
    NavigatorProviderRow,
    type NavigatorProviderRowMenuHost,
    applyProviderCheckboxChange,
    applySelectedProviderCheckboxChange,
    consumeProviderRowMenuEvent,
    getProviderCheckboxPresentation,
    getProviderRowMenuCheckboxState,
    getProviderTypeRowIcon,
    requestProviderRowActivation,
    requestSelectedProviderRowActivation,
    routeProviderRowKeyboardPropagation,
    startProviderRowTextDrag,
    stopProviderRowKeyboardPropagation
} from '../../src/components/providerRows/NavigatorProviderRow';
import type { NavigatorRowMenuTarget } from '../../src/api/types';
import type { NavigatorProvidedRow } from '../../src/services/rows/types';
import { createTestTFile } from '../utils/createTestTFile';

function row(
    onChange?: (checked: boolean) => void | Promise<void>,
    contextMenu?: NavigatorProvidedRow['contextMenu']
): NavigatorProvidedRow {
    return {
        providerId: 'tps/tasks',
        id: 'one',
        kind: 'tps/task',
        label: 'Review navigator',
        sourcePath: 'Inbox/Tasks.md',
        contextMenu,
        indicator: {
            type: 'checkbox',
            checked: false,
            onChange
        }
    };
}

function extensionTarget(): NavigatorRowMenuTarget {
    const file = createTestTFile('Inbox/Tasks.md');
    return Object.freeze({
        providerId: 'tps/tasks',
        rowId: 'one',
        kind: 'tps/task',
        label: 'Review navigator',
        file,
        sourcePath: file.path,
        typeId: 'structural:task',
        checkbox: Object.freeze({ checked: false })
    });
}

function rowMenuHost(overrides: Partial<NavigatorProviderRowMenuHost> = {}): NavigatorProviderRowMenuHost {
    return {
        revision: 1,
        createTarget: () => extensionTarget(),
        hasExtensions: () => true,
        appendExtensions: () => true,
        ...overrides
    };
}

describe('NavigatorProviderRow', () => {
    it('drags task Markdown as text without entering the file drag pipeline', () => {
        const setData = vi.fn();
        const stopPropagation = vi.fn();
        const dataTransfer = { effectAllowed: 'all', setData } as unknown as DataTransfer;

        startProviderRowTextDrag({ dataTransfer, stopPropagation }, '- [ ] Review navigator #project');

        expect(stopPropagation).toHaveBeenCalledOnce();
        expect(dataTransfer.effectAllowed).toBe('copy');
        expect(setData).toHaveBeenCalledWith('text/plain', '- [ ] Review navigator #project');
    });

    it('marks built-in task rows as text-draggable without file drag attributes', () => {
        const markup = renderToStaticMarkup(
            React.createElement(NavigatorProviderRow, {
                row: { ...row(), dragText: '- [ ] Review navigator' }
            })
        );

        expect(markup).toContain('draggable="true"');
        expect(markup).toContain('data-provider-text-drag="true"');
        expect(markup).not.toContain('data-draggable=');
        expect(markup).not.toContain('data-drag-type=');
    });

    it('runs the first-party activation callback only for an actionable row', () => {
        const events: string[] = [];
        const activate = vi.fn(() => events.push('activate'));
        const onActivationRequested = vi.fn(() => events.push('collapse'));
        const onError = vi.fn();
        const actionableRow = { ...row(), activate };

        expect(requestProviderRowActivation(actionableRow, onActivationRequested, onError)).toBe(true);
        expect(onActivationRequested).toHaveBeenCalledOnce();
        expect(activate).toHaveBeenCalledOnce();
        expect(events).toEqual(['activate', 'collapse']);
        expect(onError).not.toHaveBeenCalled();

        onActivationRequested.mockClear();
        expect(requestProviderRowActivation(row(), onActivationRequested, onError)).toBe(false);
        expect(onActivationRequested).not.toHaveBeenCalled();
    });

    it('refuses activation and checkbox mutation when stale-row selection is rejected', async () => {
        const activate = vi.fn();
        const onChange = vi.fn();
        const onActivationRequested = vi.fn();
        const onError = vi.fn();
        const onSelectionRequested = vi.fn(() => false);

        expect(requestSelectedProviderRowActivation({ ...row(), activate }, onSelectionRequested, onActivationRequested, onError)).toBe(
            false
        );
        expect(activate).not.toHaveBeenCalled();
        expect(onActivationRequested).not.toHaveBeenCalled();

        await expect(
            applySelectedProviderCheckboxChange({
                onSelectionRequested,
                previousChecked: false,
                nextChecked: true,
                onChange,
                setDisplayedChecked: vi.fn(),
                setBusy: vi.fn(),
                onError
            })
        ).resolves.toBe(false);
        expect(onChange).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });

    it('lets the primary control bubble list-navigation keys while isolating auxiliary controls', () => {
        const stopPropagation = vi.fn();

        routeProviderRowKeyboardPropagation('primary', { stopPropagation });
        expect(stopPropagation).not.toHaveBeenCalled();

        routeProviderRowKeyboardPropagation('checkbox', { stopPropagation });
        routeProviderRowKeyboardPropagation('menu', { stopPropagation });
        expect(stopPropagation).toHaveBeenCalledTimes(2);
    });

    it('commits a successful optimistic checkbox mutation in busy-state order', async () => {
        const events: string[] = [];

        await applyProviderCheckboxChange({
            previousChecked: false,
            nextChecked: true,
            onChange: async checked => {
                events.push(`mutate:${checked}`);
            },
            setDisplayedChecked: checked => events.push(`display:${checked}`),
            setBusy: busy => events.push(`busy:${busy}`),
            onError: () => events.push('error')
        });

        expect(events).toEqual(['display:true', 'busy:true', 'mutate:true', 'busy:false']);
    });

    it('rolls back a failed optimistic checkbox mutation and reports the error', async () => {
        const events: string[] = [];
        const failure = new Error('mutation failed');

        await applyProviderCheckboxChange({
            previousChecked: false,
            nextChecked: true,
            onChange: async () => {
                throw failure;
            },
            setDisplayedChecked: checked => events.push(`display:${checked}`),
            setBusy: busy => events.push(`busy:${busy}`),
            onError: error => events.push(error === failure ? 'error:expected' : 'error:unexpected')
        });

        expect(events).toEqual(['display:true', 'busy:true', 'display:false', 'error:expected', 'busy:false']);
    });

    it('exposes the effective visible checkbox state to row-menu integrations', () => {
        const taskRow: NavigatorProvidedRow = {
            ...row(vi.fn()),
            indicator: { type: 'checkbox', checked: false, marker: '/', onChange: vi.fn() }
        };

        expect(getProviderRowMenuCheckboxState(taskRow, false)).toEqual({ checked: false, marker: '/' });
        expect(getProviderRowMenuCheckboxState(taskRow, true)).toEqual({ checked: true });
        expect(getProviderRowMenuCheckboxState({ ...taskRow, indicator: undefined }, false)).toBeNull();
    });

    it('consumes a context-menu event only after a non-empty menu is shown', () => {
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const event = { preventDefault, stopPropagation };

        expect(consumeProviderRowMenuEvent(() => false, event)).toBe(false);
        expect(preventDefault).not.toHaveBeenCalled();
        expect(stopPropagation).not.toHaveBeenCalled();

        expect(consumeProviderRowMenuEvent(() => true, event)).toBe(true);
        expect(preventDefault).toHaveBeenCalledOnce();
        expect(stopPropagation).toHaveBeenCalledOnce();
    });

    it('renders a keyboard-focusable checkbox when the provider supplies a mutation', () => {
        const markup = renderToStaticMarkup(React.createElement(NavigatorProviderRow, { row: row(vi.fn()) }));

        expect(markup).toContain('<button type="button"');
        expect(markup).toContain('role="listitem"');
        expect(markup).toContain('role="checkbox"');
        expect(markup).toContain('aria-checked="false"');
        expect(markup).toContain('aria-label="Open task. Mark task complete"');
        expect(markup).toContain('is-interactive');
        expect(markup).not.toContain('aria-readonly="true"');
    });

    it('renders the provider marker and exposes its non-binary state accessibly', () => {
        const customStateRow: NavigatorProvidedRow = {
            ...row(vi.fn()),
            indicator: {
                type: 'checkbox',
                checked: false,
                marker: '/',
                onChange: vi.fn()
            }
        };
        const markup = renderToStaticMarkup(React.createElement(NavigatorProviderRow, { row: customStateRow }));

        expect(markup).toContain('class="tps-nn-provider-row-checkbox has-marker is-interactive"');
        expect(markup).toContain('aria-label="Task state /. Mark task complete"');
        expect(markup).toContain('data-task-marker="/"');
        expect(markup).toContain('<span aria-hidden="true">/</span>');
        expect(markup).not.toContain('>\u2713</span>');
    });

    it('keeps the provider completion marker instead of replacing it with a generic checkmark', () => {
        const completedRow: NavigatorProvidedRow = {
            ...row(),
            indicator: {
                type: 'checkbox',
                checked: true,
                marker: 'x'
            }
        };
        const markup = renderToStaticMarkup(React.createElement(NavigatorProviderRow, { row: completedRow }));

        expect(markup).toContain('class="tps-nn-provider-row-checkbox is-checked has-marker"');
        expect(markup).toContain('aria-label="Completed task (x)"');
        expect(markup).toContain('data-task-marker="x"');
        expect(markup).toContain('<span aria-hidden="true">x</span>');
    });

    it('uses the binary fallback only when a provider omits a marker', () => {
        expect(getProviderCheckboxPresentation(true)).toEqual({
            marker: '✓',
            hasVisibleMarker: true,
            stateLabel: 'Completed task'
        });
        expect(getProviderCheckboxPresentation(false, ' ')).toEqual({
            marker: ' ',
            hasVisibleMarker: false,
            stateLabel: 'Open task'
        });
    });

    it('retains a display-only checkbox for providers without a mutation', () => {
        const markup = renderToStaticMarkup(React.createElement(NavigatorProviderRow, { row: row() }));

        expect(markup).toContain('<span class="tps-nn-provider-row-checkbox"');
        expect(markup).toContain('aria-readonly="true"');
        expect(markup).toContain('title="Task state is display-only"');
        expect(markup).not.toContain('is-interactive');
    });

    it('renders the single-row cursor with an accessible selected state', () => {
        const selected = renderToStaticMarkup(React.createElement(NavigatorProviderRow, { row: row(), isSelected: true }));
        const unselected = renderToStaticMarkup(React.createElement(NavigatorProviderRow, { row: row() }));

        expect(selected).toContain('class="tps-nn-provider-row is-selected"');
        expect(selected).toContain('role="listitem"');
        expect(selected).toContain('aria-current="true"');
        expect(selected).toContain('Current selection');
        expect(unselected).not.toContain('aria-current');
        expect(unselected).not.toContain('tps-nn-provider-row is-selected');
    });

    it('renders standalone Type results with the native standard file-row structure and selected chrome', () => {
        const typeRow: NavigatorProvidedRow = {
            ...row(),
            kind: 'tps/entity-type/heading',
            indicator: undefined,
            secondaryLabel: 'Inbox/Tasks.md · line 4'
        };
        const markup = renderToStaticMarkup(
            React.createElement(NavigatorProviderRow, {
                row: typeRow,
                presentation: 'type',
                isSelected: true,
                hasSelectedAbove: true,
                hasSelectedBelow: true,
                titleRows: 2
            })
        );

        expect(markup).toContain(
            'class="tps-nn-provider-row tps-nn-provider-row--type tps-nn-file tps-nn-selected tps-nn-has-selected-above tps-nn-has-selected-below"'
        );
        expect(markup).toContain('role="listitem"');
        expect(markup).toContain('aria-current="true"');
        expect(markup).toContain('class="tps-nn-file-content"');
        expect(markup).toContain('class="tps-nn-file-inner-content"');
        expect(markup).toContain('class="tps-nn-file-icon-slot"');
        expect(markup).toContain('class="tps-nn-file-icon tps-nn-provider-row-type-icon"');
        expect(markup).toContain('class="tps-nn-provider-row-open tps-nn-file-text-content"');
        expect(markup).toContain('class="tps-nn-file-name" data-title-rows="2"');
        expect(markup).toContain('class="tps-nn-file-second-line"');
        expect(markup).toContain('Inbox/Tasks.md · line 4');
        expect(markup).not.toContain('draggable=');
        expect(markup).not.toContain('data-drag');
    });

    it('uses native compact file typography without rendering a redundant secondary line', () => {
        const typeRow: NavigatorProvidedRow = {
            ...row(),
            kind: 'tps/entity-type/note',
            indicator: undefined,
            secondaryLabel: 'Inbox/Tasks.md'
        };
        const markup = renderToStaticMarkup(
            React.createElement(NavigatorProviderRow, {
                row: typeRow,
                presentation: 'type',
                isCompactMode: true,
                titleRows: Number.NaN
            })
        );

        expect(markup).toContain('tps-nn-provider-row--type tps-nn-file tps-nn-compact');
        expect(markup).toContain('class="tps-nn-provider-row-open tps-nn-compact-file-text-content"');
        expect(markup).toContain('class="tps-nn-compact-file-header"');
        expect(markup).toContain('class="tps-nn-file-name" data-title-rows="1"');
        expect(markup).toContain('aria-label="Select Review navigator in Inbox/Tasks.md"');
        expect(markup).not.toContain('tps-nn-file-second-line');
        expect(markup).not.toContain('tps-nn-provider-row-secondary');
    });

    it('enforces the one-line transparent-control contract in mobile Type markup', () => {
        const previousIsMobile = Platform.isMobile;
        Platform.isMobile = true;
        try {
            const mobileRow: NavigatorProvidedRow = {
                ...row(vi.fn(), () => undefined),
                secondaryLabel: 'Inbox/Tasks.md · line 4'
            };
            const markup = renderToStaticMarkup(
                React.createElement(NavigatorProviderRow, {
                    row: mobileRow,
                    presentation: 'attached',
                    isCompactMode: false,
                    titleRows: 2
                })
            );

            expect(markup).toContain('data-mobile-structural-row="true"');
            expect(markup).toContain('data-title-rows="1"');
            expect(markup).not.toContain('tps-nn-file-second-line');
            expect(markup).not.toContain('Inbox/Tasks.md · line 4');
            expect(markup.match(/background-color:transparent/g)).toHaveLength(3);
            expect(markup.match(/-webkit-appearance:none/g)).toHaveLength(3);
            expect(markup.match(/box-shadow:none/g)).toHaveLength(3);
        } finally {
            Platform.isMobile = previousIsMobile;
        }
    });

    it('keeps the provider checkbox in the native leading slot even when ordinary Type icons are hidden', () => {
        const markup = renderToStaticMarkup(
            React.createElement(NavigatorProviderRow, {
                row: row(vi.fn()),
                presentation: 'type',
                showTypeIcon: false
            })
        );

        expect(markup).toContain('class="tps-nn-file-icon-slot tps-nn-provider-row-checkbox-slot"');
        expect(markup).toContain('role="checkbox"');
        expect(markup).toContain('aria-checked="false"');
        expect(markup).not.toContain('tps-nn-provider-row-type-icon');
    });

    it('honors file-icon visibility for non-checkbox Type results', () => {
        const typeRow = { ...row(), indicator: undefined };
        const markup = renderToStaticMarkup(
            React.createElement(NavigatorProviderRow, {
                row: typeRow,
                presentation: 'type',
                showTypeIcon: false
            })
        );

        expect(markup).not.toContain('tps-nn-file-icon-slot');
        expect(markup).not.toContain('tps-nn-provider-row-type-icon');
    });

    it.each([
        ['tps/entity-type/base', 'lucide-database'],
        ['tps/entity-type/bullet', 'lucide-list'],
        ['tps/entity-type/code', 'lucide-code-2'],
        ['tps/entity-type/callout', 'lucide-message-square-warning'],
        ['tps/entity-type/blockquote', 'lucide-quote'],
        ['tps/entity-type/table', 'lucide-table-2'],
        ['tps/entity-type/web-link', 'lucide-external-link'],
        ['tps/entity-type/canvas', 'lucide-layout-dashboard'],
        ['tps/entity-type/task', 'lucide-square-check-big'],
        ['tps/entity-type/excalidraw', 'lucide-brush'],
        ['tps/entity-type/heading', 'lucide-heading'],
        ['tps/entity-type/image', 'lucide-image'],
        ['tps/entity-type/pdf', 'lucide-file-text'],
        ['tps/entity-type/unknown', 'lucide-file-text']
    ])('maps %s to its restrained Type-result icon', (kind, icon) => {
        expect(getProviderTypeRowIcon(kind)).toBe(icon);
    });

    it('keeps a display-only row selectable even when it has no activation callback', () => {
        const markup = renderToStaticMarkup(React.createElement(NavigatorProviderRow, { row: row() }));

        expect(markup).toContain('aria-label="Select Review navigator in Inbox/Tasks.md"');
        expect(markup).not.toContain('class="tps-nn-provider-row-open" disabled=""');
    });

    it('renders an accessible More actions button only when the provider supplies actions', () => {
        const withActions = renderToStaticMarkup(
            React.createElement(NavigatorProviderRow, {
                row: row(undefined, context => context.addItem(() => undefined))
            })
        );
        const withoutActions = renderToStaticMarkup(React.createElement(NavigatorProviderRow, { row: row() }));

        expect(withActions).toContain('class="tps-nn-provider-row-more"');
        expect(withActions).toContain('data-provider-context-menu="true"');
        expect(withActions).toContain('aria-label="More actions for Review navigator"');
        expect(withActions).toContain('aria-haspopup="menu"');
        expect(withActions).toContain('title="More actions"');
        expect(withoutActions).not.toContain('tps-nn-provider-row-more');
        expect(withoutActions).not.toContain('data-provider-context-menu');
    });

    it('renders the same accessible action affordance for matching registered row extensions', () => {
        const seenTargets: NavigatorRowMenuTarget[] = [];
        const withRegisteredActions = renderToStaticMarkup(
            React.createElement(NavigatorProviderRow, {
                row: row(),
                rowMenuHost: rowMenuHost({
                    hasExtensions: target => {
                        seenTargets.push(target);
                        return true;
                    }
                })
            })
        );
        const unsupported = renderToStaticMarkup(
            React.createElement(NavigatorProviderRow, {
                row: row(),
                rowMenuHost: rowMenuHost({ hasExtensions: () => false })
            })
        );
        const staleSource = renderToStaticMarkup(
            React.createElement(NavigatorProviderRow, {
                row: row(),
                rowMenuHost: rowMenuHost({ createTarget: () => null })
            })
        );
        const staleOwnerSource = renderToStaticMarkup(
            React.createElement(NavigatorProviderRow, {
                row: row(undefined, context => context.addItem(() => undefined)),
                rowMenuHost: rowMenuHost({ createTarget: () => null })
            })
        );

        expect(withRegisteredActions).toContain('class="tps-nn-provider-row-more"');
        expect(withRegisteredActions).toContain('data-provider-context-menu="true"');
        expect(seenTargets).toHaveLength(1);
        expect(seenTargets[0]).toMatchObject({ typeId: 'structural:task', sourcePath: 'Inbox/Tasks.md' });
        expect(unsupported).not.toContain('tps-nn-provider-row-more');
        expect(staleSource).not.toContain('tps-nn-provider-row-more');
        expect(staleOwnerSource).not.toContain('tps-nn-provider-row-more');
        expect(staleOwnerSource).not.toContain('data-provider-context-menu');
    });

    it.each(['keydown', 'keyup'])('keeps pane-level keyboard shortcuts from consuming provider control %s events', () => {
        const stopPropagation = vi.fn();

        stopProviderRowKeyboardPropagation({ stopPropagation });

        expect(stopPropagation).toHaveBeenCalledOnce();
    });
});
