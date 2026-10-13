/* TPS Notebook Navigator - file-backed Type creation routing. */

import { TFolder } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import {
    createTpsNavigatorFileResource,
    getTpsFileResourceCreationActionLabel,
    isTpsNavigatorCreatableFileTypeId
} from '../../src/services/types/fileResourceCreation';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';
import { createTestTFile } from '../utils/createTestTFile';

describe('file-backed Type creation', () => {
    it('advertises only Bases and Canvas with specific action labels', () => {
        expect(isTpsNavigatorCreatableFileTypeId(TPS_NAVIGATOR_TYPE_IDS.BASES)).toBe(true);
        expect(isTpsNavigatorCreatableFileTypeId(TPS_NAVIGATOR_TYPE_IDS.CANVAS)).toBe(true);
        expect(isTpsNavigatorCreatableFileTypeId(TPS_NAVIGATOR_TYPE_IDS.NOTES)).toBe(false);
        expect(getTpsFileResourceCreationActionLabel(TPS_NAVIGATOR_TYPE_IDS.BASES)).toBe('New base');
        expect(getTpsFileResourceCreationActionLabel(TPS_NAVIGATOR_TYPE_IDS.CANVAS)).toBe('New canvas');
        expect(getTpsFileResourceCreationActionLabel(TPS_NAVIGATOR_TYPE_IDS.PDFS)).toBeNull();
    });

    it('routes each Type through the existing native file operation', async () => {
        const root = new TFolder();
        Reflect.set(root, 'path', '/');
        const base = createTestTFile('Untitled.base');
        const canvas = createTestTFile('Untitled.canvas');
        const operations = {
            createBase: vi.fn(async () => base),
            createCanvas: vi.fn(async () => canvas)
        };

        await expect(createTpsNavigatorFileResource(TPS_NAVIGATOR_TYPE_IDS.BASES, root, operations)).resolves.toBe(base);
        await expect(createTpsNavigatorFileResource(TPS_NAVIGATOR_TYPE_IDS.CANVAS, root, operations)).resolves.toBe(canvas);
        await expect(createTpsNavigatorFileResource(TPS_NAVIGATOR_TYPE_IDS.NOTES, root, operations)).resolves.toBeNull();
        expect(operations.createBase).toHaveBeenCalledOnce();
        expect(operations.createBase).toHaveBeenCalledWith(root);
        expect(operations.createCanvas).toHaveBeenCalledOnce();
        expect(operations.createCanvas).toHaveBeenCalledWith(root);
    });
});
