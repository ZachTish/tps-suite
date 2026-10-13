import { describe, expect, it, vi } from 'vitest';
import type { ExpansionAction } from '../../src/context/ExpansionContext';
import type { SelectionAction } from '../../src/context/SelectionContext';
import type { ContentPane } from '../../src/context/UIStateContext';
import { TYPES_ROOT_VIRTUAL_FOLDER_ID } from '../../src/types';
import {
    TPS_NAVIGATOR_STRUCTURAL_TYPES,
    TPS_NAVIGATOR_TYPE_IDS,
    createTpsNavigatorProviderTypeId,
    getTpsNavigatorProviderSourceKey,
    type TpsNavigatorTypeDescriptor,
    type TpsNavigatorTypesAvailability
} from '../../src/types/navigatorTypes';
import { navigateToType, type TypeNavigationEnvironment } from '../../src/utils/typeNavigation';

function descriptor(id: TpsNavigatorTypeDescriptor['id']): TpsNavigatorTypeDescriptor {
    const structural = TPS_NAVIGATOR_STRUCTURAL_TYPES.find(candidate => candidate.id === id);
    return {
        id,
        label: structural?.label ?? 'Project / Client',
        icon: structural?.icon ?? 'lucide-box',
        category: 'structure',
        count: 1
    };
}

function createEnvironment(options?: {
    enabled?: boolean;
    availability?: TpsNavigatorTypesAvailability;
    descriptors?: readonly TpsNavigatorTypeDescriptor[];
    expanded?: readonly string[];
    authoritativeSourceKeys?: ReadonlySet<string>;
}) {
    const expansionDispatch = vi.fn<(action: ExpansionAction) => void>();
    const selectionDispatch = vi.fn<(action: SelectionAction) => void>();
    const activatePane = vi.fn<(target: ContentPane) => void>();
    const requestScroll = vi.fn<TypeNavigationEnvironment['requestScroll']>();
    const env: TypeNavigationEnvironment = {
        enabled: options?.enabled ?? true,
        snapshot: {
            availability: options?.availability ?? 'ready',
            descriptors: options?.descriptors ?? [descriptor(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)],
            authoritativeSourceKeys: options?.authoritativeSourceKeys
        },
        expandedVirtualFolders: new Set(options?.expanded ?? []),
        expansionDispatch,
        selectionDispatch,
        activatePane,
        requestScroll
    };

    return { env, expansionDispatch, selectionDispatch, activatePane, requestScroll };
}

describe('navigateToType', () => {
    it('rejects disabled, malformed, and authoritatively missing collections without side effects', () => {
        const disabled = createEnvironment({ enabled: false });
        const malformed = createEnvironment();
        const missing = createEnvironment({ descriptors: [] });

        expect(navigateToType(disabled.env, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)).toBeNull();
        expect(navigateToType(malformed.env, 'kind:%')).toBeNull();
        expect(navigateToType(missing.env, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)).toBeNull();

        for (const result of [disabled, malformed, missing]) {
            expect(result.expansionDispatch).not.toHaveBeenCalled();
            expect(result.selectionDispatch).not.toHaveBeenCalled();
            expect(result.activatePane).not.toHaveBeenCalled();
            expect(result.requestScroll).not.toHaveBeenCalled();
        }
    });

    it.each<TpsNavigatorTypesAvailability>(['loading', 'unavailable', 'error'])(
        'allows a syntactically valid provisional collection while the snapshot is %s',
        availability => {
            const { env, selectionDispatch } = createEnvironment({ availability, descriptors: [] });

            expect(navigateToType(env, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES)).toBe(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES);
            expect(selectionDispatch).toHaveBeenCalledWith({
                type: 'SET_SELECTED_TYPE',
                typeId: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
                source: undefined,
                historyIndex: undefined
            });
        }
    );

    it.each<TpsNavigatorTypesAvailability>(['loading', 'unavailable', 'error', 'ready'])(
        'rejects legacy Kind syntax without side effects while the snapshot is %s',
        availability => {
            const result = createEnvironment({ availability, descriptors: [] });

            expect(navigateToType(result.env, 'kind:Project%20%2F%20Client', { source: 'manual', historyIndex: 3 })).toBeNull();
            expect(result.expansionDispatch).not.toHaveBeenCalled();
            expect(result.selectionDispatch).not.toHaveBeenCalled();
            expect(result.activatePane).not.toHaveBeenCalled();
            expect(result.requestScroll).not.toHaveBeenCalled();
        }
    );

    it('expands only the Types root for a structural collection and can focus files', () => {
        const { env, expansionDispatch, activatePane } = createEnvironment();

        expect(
            navigateToType(env, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, {
                preserveNavigationFocus: false
            })
        ).toBe(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES);
        expect(expansionDispatch).toHaveBeenCalledWith({
            type: 'SET_EXPANDED_VIRTUAL_FOLDERS',
            folders: new Set([TYPES_ROOT_VIRTUAL_FOLDER_ID])
        });
        expect(activatePane).toHaveBeenCalledWith('files');
    });

    it('keeps late provider selections provisional but rejects them after their owner becomes authoritative', () => {
        const providerTypeId = createTpsNavigatorProviderTypeId('example/entities', 'projects')!;
        const provisional = createEnvironment({
            descriptors: [],
            authoritativeSourceKeys: new Set(['builtin'])
        });
        expect(navigateToType(provisional.env, providerTypeId)).toBe(providerTypeId);
        expect(provisional.expansionDispatch).toHaveBeenCalledWith({
            type: 'SET_EXPANDED_VIRTUAL_FOLDERS',
            folders: new Set([TYPES_ROOT_VIRTUAL_FOLDER_ID])
        });

        const removed = createEnvironment({
            descriptors: [],
            authoritativeSourceKeys: new Set(['builtin', getTpsNavigatorProviderSourceKey('example/entities')])
        });
        expect(navigateToType(removed.env, providerTypeId)).toBeNull();
        expect(removed.selectionDispatch).not.toHaveBeenCalled();
    });

    it('avoids redundant expansion and honors skipFocus and skipScroll', () => {
        const { env, expansionDispatch, selectionDispatch, activatePane, requestScroll } = createEnvironment({
            expanded: [TYPES_ROOT_VIRTUAL_FOLDER_ID]
        });

        expect(
            navigateToType(env, TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES, {
                skipFocus: true,
                skipScroll: true,
                source: 'shortcut'
            })
        ).toBe(TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES);
        expect(expansionDispatch).not.toHaveBeenCalled();
        expect(selectionDispatch).toHaveBeenCalledWith({
            type: 'SET_SELECTED_TYPE',
            typeId: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
            source: 'shortcut',
            historyIndex: undefined
        });
        expect(activatePane).not.toHaveBeenCalled();
        expect(requestScroll).not.toHaveBeenCalled();
    });
});
