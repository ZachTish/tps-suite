import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NavigationRootReorderPanel } from '../../src/components/NavigationRootReorderPanel';
import { TooltipProvider } from '../../src/context/TooltipContext';
import type { RootReorderRenderItem, SectionReorderRenderItem } from '../../src/hooks/useNavigationRootReorder';
import { NavigationSectionId } from '../../src/types';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

vi.mock('../../src/context/SettingsContext', () => ({
    useSettingsState: () => ({
        showFolderIcons: true,
        showTagIcons: true,
        showPropertyIcons: true,
        showTooltips: false
    })
}));

const sectionItems: SectionReorderRenderItem[] = [
    {
        key: NavigationSectionId.TYPES,
        sectionId: NavigationSectionId.TYPES,
        props: {
            icon: 'lucide-shapes',
            label: 'Types',
            level: 0,
            itemType: 'section',
            chevronIcon: 'lucide-chevron-down'
        }
    }
];

const typeItems: RootReorderRenderItem[] = [
    {
        key: TPS_NAVIGATOR_TYPE_IDS.NOTES,
        props: {
            icon: 'lucide-file-text',
            label: 'Notes',
            level: 1,
            itemType: 'type',
            showCount: true,
            count: '57'
        }
    },
    {
        key: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
        props: {
            icon: 'lucide-square-check-big',
            label: 'Checkboxes',
            level: 1,
            itemType: 'type',
            showCount: true,
            count: '278'
        }
    }
];

function renderPanel(sortOrder: 'catalog' | 'count-desc' = 'catalog'): string {
    return renderToStaticMarkup(
        React.createElement(
            TooltipProvider,
            null,
            React.createElement(NavigationRootReorderPanel, {
                sectionItems,
                folderItems: [],
                tagItems: [],
                propertyItems: [],
                typeItems,
                isMobile: true,
                showRootFolderSection: false,
                showRootTagSection: false,
                showRootPropertySection: false,
                showRootTypeSection: true,
                foldersSectionExpanded: false,
                tagsSectionExpanded: false,
                propertiesSectionExpanded: false,
                typesSectionExpanded: true,
                showRootFolderReset: false,
                showRootTagReset: false,
                showRootPropertyReset: false,
                typeNavigationSortOrder: sortOrder,
                resetRootTagOrderLabel: 'Reset tags',
                resetRootPropertyOrderLabel: 'Reset properties',
                onResetRootFolderOrder: vi.fn(),
                onResetRootTagOrder: vi.fn(),
                onResetRootPropertyOrder: vi.fn(),
                onReorderSections: vi.fn(),
                onReorderFolders: vi.fn(),
                onReorderTags: vi.fn(),
                onReorderProperties: vi.fn(),
                onReorderTypes: vi.fn(),
                onTypeNavigationSortOrderChange: vi.fn(),
                canReorderSections: false,
                canReorderFolders: false,
                canReorderTags: false,
                canReorderProperties: false,
                canReorderTypes: true
            })
        )
    );
}

describe('NavigationRootReorderPanel Types controls', () => {
    it('shows the complete persisted ordering selector before count-bearing Type rows', () => {
        const markup = renderPanel('count-desc');

        expect(markup).toContain('<span class="tps-nn-root-reorder-type-order-label">Type order</span>');
        expect(markup).toContain('<option value="catalog">Default order</option>');
        expect(markup).toContain('<option value="alpha-asc">Name: A to Z</option>');
        expect(markup).toContain('<option value="alpha-desc">Name: Z to A</option>');
        expect(markup).toContain('<option value="count-desc" selected="">Most items first</option>');
        expect(markup).toContain('<option value="count-asc">Fewest items first</option>');
        expect(markup).toContain('<option value="manual">Manual order</option>');
        expect(markup.indexOf('tps-nn-root-reorder-type-order')).toBeLessThan(markup.indexOf('>Notes<'));
        expect(markup).toContain('<span class="tps-nn-navitem-count">57</span>');
        expect(markup).toContain('<span class="tps-nn-navitem-count">278</span>');
    });

    it('provides labeled up/down controls and disables only the two endpoints', () => {
        const markup = renderPanel();

        expect(markup).toContain('aria-label="Move up: Notes" disabled=""');
        expect(markup).toContain('aria-label="Move down: Notes"');
        expect(markup).toContain('aria-label="Move up: Checkboxes"');
        expect(markup).toContain('aria-label="Move down: Checkboxes" disabled=""');
    });
});
