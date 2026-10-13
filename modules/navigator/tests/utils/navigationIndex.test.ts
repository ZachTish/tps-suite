/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, expect, it } from 'vitest';
import { ItemType, NavigationPaneItemType } from '../../src/types';
import type { VirtualFolderItem } from '../../src/types/virtualization';
import { buildNavigationPathIndexMap, getNavigationIndex } from '../../src/utils/navigationIndex';

describe('Types navigation index', () => {
    it('indexes a selectable type virtual row by its type descriptor id', () => {
        const typeItem: VirtualFolderItem = {
            type: NavigationPaneItemType.VIRTUAL_FOLDER,
            data: { id: 'tps-type:kind:project', name: 'project' },
            level: 1,
            key: 'kind:project',
            typeCollectionId: 'kind:project',
            isSelectable: true,
            hasChildren: false
        };

        const index = buildNavigationPathIndexMap([typeItem]);

        expect(getNavigationIndex(index, ItemType.TYPE, 'kind:project')).toBe(0);
        expect(getNavigationIndex(index, ItemType.FOLDER, 'kind:project')).toBeUndefined();
    });
});
