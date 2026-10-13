/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { TFolder } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { getRootFolderNoteCandidatePaths, getTpsNavigatorTypeTitleData } from '../../src/hooks/useListPaneTitle';
import { createTpsNavigatorProviderTypeId } from '../../src/types/navigatorTypes';

describe('getTpsNavigatorTypeTitleData', () => {
    it('uses the structural descriptor label and icon', () => {
        expect(getTpsNavigatorTypeTitleData('structural:task')).toEqual({
            label: 'Checkboxes',
            icon: 'lucide-square-check-big'
        });
    });

    it('uses a generic fallback for an unavailable provider descriptor', () => {
        const typeId = createTpsNavigatorProviderTypeId('example/entities', 'missing')!;

        expect(getTpsNavigatorTypeTitleData(typeId)).toEqual({
            label: 'File types',
            icon: 'lucide-box'
        });
    });

    it('uses the active descriptor for an external provider collection', () => {
        const typeId = createTpsNavigatorProviderTypeId('example/entities', 'projects')!;
        expect(
            getTpsNavigatorTypeTitleData(typeId, [
                {
                    id: typeId,
                    label: 'Active projects',
                    icon: 'lucide-folder-kanban',
                    category: 'structure',
                    count: 0,
                    showCount: false,
                    providerId: 'example/entities',
                    providerCollectionId: 'projects'
                }
            ])
        ).toEqual({ label: 'Active projects', icon: 'lucide-folder-kanban' });
    });
});

describe('root folder note title watchers', () => {
    it('watches stable Vault candidates and the legacy root folder name', () => {
        const root = new TFolder('/') as TFolder & { name: string };
        root.name = 'Shared Scratch';

        expect(
            Array.from(
                getRootFolderNoteCandidatePaths(root, {
                    folderNoteNamePattern: ''
                })
            )
        ).toEqual([
            'Vault.md',
            'Vault.canvas',
            'Vault.base',
            'Vault.excalidraw.md',
            'Shared Scratch.md',
            'Shared Scratch.canvas',
            'Shared Scratch.base',
            'Shared Scratch.excalidraw.md'
        ]);
    });

    it('applies the configured folder token pattern to Vault candidates', () => {
        const root = new TFolder('/');

        expect(
            Array.from(
                getRootFolderNoteCandidatePaths(root, {
                    folderNoteNamePattern: '_{{folder}}'
                })
            )
        ).toEqual(['_Vault.md', '_Vault.canvas', '_Vault.base', '_Vault.excalidraw.md']);
    });
});
