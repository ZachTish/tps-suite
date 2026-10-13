/* TPS Notebook Navigator - Type-mode calendar and mobile activation isolation. */

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
    isVaultRootResourceScope,
    resolveIncludeDescendantResources,
    resolveRenderedPropertyGroupingForSelection,
    shouldShowListCreateButton,
    shouldCollapseMobileDrawerForTypeProviderActivation,
    supportsDayPropertyGroupingForSelection,
    supportsCalendarInteractionsForSelection,
    supportsLinePropertyGroupingSourceForSelection,
    supportsListSortAndGroupingForSelection,
    supportsNativeListPresentationForSelection
} from '../../src/components/listPane/typeModeRuntime';
import { ItemType } from '../../src/types';
import { createTpsNavigatorProviderTypeId, TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

describe('Type-mode list runtime behavior', () => {
    it('keeps the vault root recursive after search is cleared, regardless of descendant visibility', () => {
        expect(isVaultRootResourceScope(ItemType.FOLDER, '/')).toBe(true);
        expect(isVaultRootResourceScope(ItemType.FOLDER, 'Projects')).toBe(false);
        expect(isVaultRootResourceScope(ItemType.TYPE, '/')).toBe(false);

        expect(
            resolveIncludeDescendantResources({
                selectionType: ItemType.FOLDER,
                selectedFolderPath: '/',
                includeDescendants: false
            })
        ).toBe(true);
        expect(
            resolveIncludeDescendantResources({
                selectionType: ItemType.FOLDER,
                selectedFolderPath: 'Projects',
                includeDescendants: false
            })
        ).toBe(false);
        expect(
            resolveIncludeDescendantResources({
                selectionType: ItemType.FOLDER,
                selectedFolderPath: 'Projects',
                includeDescendants: true
            })
        ).toBe(true);
        expect(
            resolveIncludeDescendantResources({
                selectionType: ItemType.FOLDER,
                selectedFolderPath: '/',
                includeDescendants: false,
                forceWholeVaultSearch: true
            })
        ).toBe(true);
    });

    it('exposes no-inheritance as the single default-capable sort/group menu choice', async () => {
        const source = await readFile('src/hooks/useListActions.ts', 'utf8');

        expect(source.match(/Do not inherit note properties/g)).toHaveLength(1);
        expect(source).toContain("['none', 'Do not inherit note properties']");
        expect(source).toContain("item.setTitle('Property inheritance (sort and group)')");
        expect(source).toContain("item.setTitle('No value group position')");
        expect(source).toContain("(['top', 'bottom'] as const)");
    });

    it('keeps required aggregate grouping available during manual sort without exposing latent ordinary overrides', async () => {
        const source = await readFile('src/hooks/useListActions.ts', 'utf8');

        expect(source).toContain('isManualSortActive && !preserveAggregateGrouping');
        expect(source).toMatch(/addGroupOptionItem\([\s\S]*?'tags'[\s\S]*?isManualSortActive && !preserveAggregateGrouping[\s\S]*?\);/u);
    });

    it('disables calendar interactions only for Type selections', () => {
        expect(supportsCalendarInteractionsForSelection(ItemType.TYPE)).toBe(false);
        expect(supportsCalendarInteractionsForSelection(ItemType.FOLDER)).toBe(true);
        expect(supportsCalendarInteractionsForSelection(ItemType.TAG)).toBe(true);
        expect(supportsCalendarInteractionsForSelection(ItemType.PROPERTY)).toBe(true);
        expect(supportsCalendarInteractionsForSelection(null)).toBe(true);
    });

    it('collapses the drawer only for Type activations on mobile', () => {
        expect(shouldCollapseMobileDrawerForTypeProviderActivation(ItemType.TYPE, true)).toBe(true);
        expect(shouldCollapseMobileDrawerForTypeProviderActivation(ItemType.TYPE, false)).toBe(false);
        expect(shouldCollapseMobileDrawerForTypeProviderActivation(ItemType.FOLDER, true)).toBe(false);
        expect(shouldCollapseMobileDrawerForTypeProviderActivation(null, true)).toBe(false);
    });

    it('exposes native presentation controls only for file-backed Type selections', () => {
        const providerType = createTpsNavigatorProviderTypeId('example/entities', 'contexts');

        expect(supportsNativeListPresentationForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.NOTES)).toBe(true);
        expect(supportsNativeListPresentationForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.PDFS)).toBe(true);
        expect(supportsNativeListPresentationForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)).toBe(false);
        expect(supportsNativeListPresentationForSelection(ItemType.TYPE, providerType)).toBe(false);
        expect(supportsNativeListPresentationForSelection(ItemType.TYPE, null)).toBe(false);
        expect(supportsNativeListPresentationForSelection(ItemType.FOLDER, null)).toBe(true);
    });

    it('exposes sort and group controls for every fixed Type but not external providers', () => {
        const providerType = createTpsNavigatorProviderTypeId('example/entities', 'contexts');

        expect(supportsListSortAndGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.NOTES)).toBe(true);
        expect(supportsListSortAndGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)).toBe(true);
        expect(supportsListSortAndGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS)).toBe(true);
        expect(supportsListSortAndGroupingForSelection(ItemType.TYPE, providerType)).toBe(false);
        expect(supportsListSortAndGroupingForSelection(ItemType.TYPE, null)).toBe(false);
        expect(supportsListSortAndGroupingForSelection(ItemType.TAG, null)).toBe(true);
    });

    it('offers line-property source only for exact GCM rows or an active mixed structural search', () => {
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, false)).toBe(true);
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.BULLETS, false)).toBe(true);
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.HEADINGS, false)).toBe(true);
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS, false)).toBe(false);
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.NOTES, false)).toBe(false);
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.FOLDER, null, true)).toBe(true);
        expect(supportsLinePropertyGroupingSourceForSelection(ItemType.TAG, null, true)).toBe(true);
    });

    it('keeps a latent line source across the mixed-search close and reopen transition while reporting rendered note grouping', () => {
        const configured = 'line-property-day:scheduled' as const;

        expect(resolveRenderedPropertyGroupingForSelection(ItemType.FOLDER, null, configured, true)).toBe(configured);
        expect(resolveRenderedPropertyGroupingForSelection(ItemType.FOLDER, null, configured, false)).toBe('property-day:scheduled');
        expect(resolveRenderedPropertyGroupingForSelection(ItemType.FOLDER, null, configured, true)).toBe(configured);

        expect(resolveRenderedPropertyGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS, configured, false)).toBe(
            'property-day:scheduled'
        );
        expect(resolveRenderedPropertyGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, configured, false)).toBe(
            configured
        );
    });

    it('limits Tags grouping to file-backed Types', () => {
        expect(resolveRenderedPropertyGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, 'tags', false)).toBe('custom');
        expect(resolveRenderedPropertyGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.NOTES, 'tags', false)).toBe('tags');
        expect(resolveRenderedPropertyGroupingForSelection(ItemType.TAG, null, 'tags', false)).toBe('tags');
    });

    it('offers day property buckets for standalone line Types and active mixed structural search scopes', () => {
        expect(supportsDayPropertyGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS, false)).toBe(true);
        expect(supportsDayPropertyGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS, false)).toBe(true);
        expect(supportsDayPropertyGroupingForSelection(ItemType.TYPE, TPS_NAVIGATOR_TYPE_IDS.NOTES, false)).toBe(false);
        expect(supportsDayPropertyGroupingForSelection(ItemType.PROPERTY, null, true)).toBe(true);
    });

    it('shows the shared desktop/mobile create control only for creatable Type selections', () => {
        expect(shouldShowListCreateButton(ItemType.TYPE, true, true)).toBe(true);
        expect(shouldShowListCreateButton(ItemType.TYPE, false, true)).toBe(false);
        expect(shouldShowListCreateButton(ItemType.FOLDER, false, true)).toBe(true);
        expect(shouldShowListCreateButton(ItemType.TAG, false, true)).toBe(true);
        expect(shouldShowListCreateButton(ItemType.TYPE, false, true, true)).toBe(true);
        expect(shouldShowListCreateButton(ItemType.TYPE, true, false)).toBe(false);
    });

    it('binds provider wrappers to their virtual height without task-only mobile control sizing', async () => {
        const css = await readFile('src/styles/sections/list-provider-rows.css', 'utf8');
        const wrapperRule = css.match(/\.nn-virtual-provider-row\s*\{([^}]*)\}/u)?.[1];

        expect(wrapperRule).toMatch(/height:\s*var\(--item-height\)\s*;/u);
        expect(css).not.toMatch(/\.notebook-navigator-mobile\s+\.nn-provider-row-(?:checkbox|open|more)\s*\{/u);
    });

    it('uses ordinary file-row geometry and typography for mobile Type task rows', async () => {
        const css = await readFile('src/styles/sections/list-provider-rows.css', 'utf8');
        const mobileOpenRule = css.match(
            /\.notebook-navigator-mobile\s+\.nn-provider-row--type\s+button\.nn-provider-row-open\s*\{([^}]*)\}/u
        )?.[1];
        const mobileTitleRule = css.match(/\.notebook-navigator-mobile\s+\.nn-provider-row--type\s+\.nn-file-name\s*\{([^}]*)\}/u)?.[1];
        const mobileSecondLineRule = css.match(
            /\.notebook-navigator-mobile\s+\.nn-provider-row--type\s+\.nn-file-second-line\s*\{([^}]*)\}/u
        )?.[1];

        expect(css).toContain('.notebook-navigator-mobile .nn-provider-row--type {');
        expect(css).toContain('width: 100%;');
        expect(css).toContain('background: transparent;');
        expect(css).not.toContain('-webkit-line-clamp: 2;');
        expect(css).not.toContain('overflow-wrap: anywhere;');
        expect(mobileOpenRule).toMatch(/all:\s*unset\s*;/u);
        expect(mobileOpenRule).toMatch(/background:\s*transparent\s*!important\s*;/u);
        expect(mobileOpenRule).toMatch(/box-shadow:\s*none\s*!important\s*;/u);
        expect(mobileTitleRule).toMatch(/white-space:\s*nowrap\s*;/u);
        expect(mobileTitleRule).toMatch(/-webkit-line-clamp:\s*1\s*;/u);
        expect(mobileSecondLineRule).toMatch(/display:\s*none\s*;/u);
        expect(css).toContain('.nn-provider-row--type button.nn-provider-row-checkbox {');
        expect(css).toContain('.nn-provider-row--type button.nn-provider-row-more {');
    });

    it('keeps standalone Type rows on native file chrome while preserving restrained provider controls', async () => {
        const css = await readFile('src/styles/sections/list-provider-rows.css', 'utf8');
        const typeRowRule = css.match(/\.nn-provider-row--type\s*\{([^}]*)\}/u)?.[1];
        const typeOpenRule = css.match(/\.nn-provider-row--type\s+button\.nn-provider-row-open\s*\{([^}]*)\}/u)?.[1];
        const typeSecondaryRule = css.match(/(?:^|\n)\.nn-provider-row--type\s+\.nn-provider-row-secondary\s*\{([^}]*)\}/u)?.[1];
        const selectedTypeSecondaryRule = css.match(/\.nn-file\.nn-selected\s+\.nn-provider-row-secondary\s*\{([^}]*)\}/u)?.[1];
        const checkboxSlotRule = css.match(/\.nn-provider-row--type\s+\.nn-provider-row-checkbox-slot\s*\{([^}]*)\}/u)?.[1];

        expect(typeRowRule).not.toMatch(/display:\s*flex/u);
        expect(typeRowRule).not.toMatch(/padding:/u);
        expect(typeRowRule).not.toMatch(/border(?:-bottom)?:/u);
        expect(typeOpenRule).toMatch(/gap:\s*0\s*;/u);
        expect(typeOpenRule).toMatch(/border-radius:\s*0(?:\s*!important)?\s*;/u);
        expect(typeOpenRule).toMatch(/background:\s*transparent(?:\s*!important)?\s*;/u);
        expect(typeOpenRule).toMatch(/box-shadow:\s*none(?:\s*!important)?\s*;/u);
        expect(typeOpenRule).toMatch(/appearance:\s*none(?:\s*!important)?\s*;/u);
        expect(typeSecondaryRule).toMatch(/var\(--nn-theme-file-parent-color\)/u);
        expect(typeSecondaryRule).toMatch(/var\(--nn-file-single-text-line-height\)/u);
        expect(selectedTypeSecondaryRule).toMatch(/var\(--nn-selected-file-parent-color\)/u);
        expect(checkboxSlotRule).toMatch(/width:\s*var\(--nn-file-title-line-height\)\s*;/u);
        expect(checkboxSlotRule).toMatch(/flex-basis:\s*var\(--nn-file-title-line-height\)\s*;/u);
    });
});
