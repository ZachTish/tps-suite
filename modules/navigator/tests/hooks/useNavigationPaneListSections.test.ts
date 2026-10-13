import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/settings/defaultSettings';
import { NavigationPaneItemType } from '../../src/types';
import type { PropertyTreeNode } from '../../src/types/storage';
import { useNavigationPaneListSections } from '../../src/hooks/navigationPane/data/useNavigationPaneListSections';
import type { NavigationPaneSourceState } from '../../src/hooks/navigationPane/data/useNavigationPaneSourceState';
import { buildPropertyKeyNodeId, buildPropertyValueNodeId } from '../../src/utils/propertyTree';

describe('property shortcut display', () => {
    it('uses the full nested value path to distinguish same-named leaves', () => {
        const key: PropertyTreeNode = {
            id: buildPropertyKeyNodeId('kind'),
            kind: 'key',
            key: 'kind',
            valuePath: null,
            name: 'kind',
            displayPath: 'kind',
            children: new Map(),
            notesWithValue: new Set()
        };
        const entity: PropertyTreeNode = {
            ...key,
            id: buildPropertyValueNodeId('kind', 'entity'),
            kind: 'value',
            valuePath: 'entity',
            name: 'entity',
            displayPath: 'entity',
            children: new Map()
        };
        const transaction: PropertyTreeNode = {
            ...entity,
            id: buildPropertyValueNodeId('kind', 'entity/transaction'),
            valuePath: 'entity/transaction',
            name: 'transaction',
            displayPath: 'entity/transaction'
        };
        entity.children.set(transaction.id, transaction);
        key.children.set(entity.id, entity);

        const settings = { ...DEFAULT_SETTINGS, showShortcuts: true, showRecentNotes: false };
        const shortcut = { type: 'property' as const, nodeId: transaction.id };
        const sourceState = {
            hiddenFileNames: [],
            hiddenFilePropertyMatcher: { hasCriteria: false },
            hiddenFileTags: [],
            hiddenFolders: [],
            hiddenMatcherHasRules: false,
            hiddenTagMatcher: null,
            metadataVisibilityVersion: 0,
            propertyTree: new Map([['kind', key]]),
            recentNotesHiddenFileMatcher: () => false,
            tagDataVersion: 0,
            tagTreeForOrdering: new Map()
        } as unknown as NavigationPaneSourceState;

        let items: ReturnType<typeof useNavigationPaneListSections>['shortcutItems'] = [];
        function Harness() {
            items = useNavigationPaneListSections({
                app: {} as never,
                settings,
                sourceState,
                hydratedShortcuts: [
                    {
                        key: `property:${transaction.id}`,
                        shortcut,
                        folder: null,
                        note: null,
                        search: null,
                        tagPath: null,
                        propertyNodeId: transaction.id,
                        isMissing: false
                    }
                ],
                recentNotes: [],
                shortcutsExpanded: true,
                recentNotesExpanded: false,
                pinShortcuts: false,
                propertiesSectionActive: true
            }).shortcutItems;
            return null;
        }

        renderToStaticMarkup(React.createElement(Harness));
        expect(items.find(item => item.type === NavigationPaneItemType.SHORTCUT_PROPERTY)).toMatchObject({
            displayName: 'entity/transaction'
        });
    });
});
