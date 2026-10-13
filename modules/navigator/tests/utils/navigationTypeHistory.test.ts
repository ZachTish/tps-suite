import { TFolder } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { ItemType } from '../../src/types';
import {
    createTypeSelectionFallbackAction,
    isTypeSelectionAuthoritativelyUnavailable,
    resolveTypeSelectionHistoryEntry
} from '../../src/utils/navigationTypeHistory';
import {
    createTpsNavigatorProviderTypeId,
    getTpsNavigatorProviderSourceKey,
    type TpsNavigatorTypeDescriptor
} from '../../src/types/navigatorTypes';

const TASK_DESCRIPTOR: TpsNavigatorTypeDescriptor = {
    id: 'structural:task',
    label: 'Checkboxes',
    icon: 'lucide-square-check-big',
    category: 'structure',
    count: 1
};

describe('Types navigation history', () => {
    it('skips valid Type history entries while Types navigation is disabled', () => {
        const entry = { type: ItemType.TYPE, value: 'structural:task' } as const;

        expect(resolveTypeSelectionHistoryEntry(entry, false)).toBeNull();
        expect(resolveTypeSelectionHistoryEntry(entry, true)).toEqual(entry);
    });

    it('always skips legacy Kind history entries while retaining an active built-in Type', () => {
        const retiredKind = { type: ItemType.TYPE, value: 'kind:Project' } as const;
        const current = { type: ItemType.TYPE, value: 'structural:task' } as const;
        const readySnapshot = { availability: 'ready', descriptors: [TASK_DESCRIPTOR] } as const;

        expect(resolveTypeSelectionHistoryEntry(current, true, readySnapshot)).toEqual(current);

        for (const availability of ['loading', 'unavailable', 'error', 'ready'] as const) {
            expect(resolveTypeSelectionHistoryEntry(retiredKind, true, { availability, descriptors: [] })).toBeNull();
        }
    });

    it('waits for the owning provider to become authoritative before rejecting a missing provider Type', () => {
        const providerTypeId = createTpsNavigatorProviderTypeId('example/entities', 'projects')!;
        const externallyReadySnapshot = {
            availability: 'ready',
            descriptors: [],
            authoritativeSourceKeys: new Set<string>()
        } as const;

        expect(isTypeSelectionAuthoritativelyUnavailable(externallyReadySnapshot, providerTypeId)).toBe(false);
        expect(
            isTypeSelectionAuthoritativelyUnavailable(
                {
                    ...externallyReadySnapshot,
                    authoritativeSourceKeys: new Set([getTpsNavigatorProviderSourceKey('example/entities')])
                },
                providerTypeId
            )
        ).toBe(true);
    });

    it('replaces an unavailable Type selection instead of adding another history entry', () => {
        const root = new TFolder('/');

        expect(createTypeSelectionFallbackAction(root)).toEqual({
            type: 'SET_SELECTED_FOLDER',
            folder: root,
            historyBehavior: 'replace'
        });
    });
});
