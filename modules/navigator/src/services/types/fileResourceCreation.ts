/* TPS Notebook Navigator - native file creation for file-backed Type collections. */

import type { TFile, TFolder } from 'obsidian';
import { TPS_NAVIGATOR_TYPE_IDS, type TpsNavigatorTypeId } from '../../types/navigatorTypes';

export interface TpsFileResourceCreationOperations {
    createBase(parent: TFolder): Promise<TFile | null>;
    createCanvas(parent: TFolder): Promise<TFile | null>;
}

export function isTpsNavigatorCreatableFileTypeId(typeId: unknown): boolean {
    return typeId === TPS_NAVIGATOR_TYPE_IDS.BASES || typeId === TPS_NAVIGATOR_TYPE_IDS.CANVAS;
}

export function getTpsFileResourceCreationActionLabel(typeId: TpsNavigatorTypeId | null): string | null {
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.BASES) {
        return 'New base';
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.CANVAS) {
        return 'New canvas';
    }
    return null;
}

/** Reuse FileSystemService so Type creation has the same content, opening, rename, and error behavior as folder menus. */
export async function createTpsNavigatorFileResource(
    typeId: TpsNavigatorTypeId | null,
    parent: TFolder,
    operations: TpsFileResourceCreationOperations
): Promise<TFile | null> {
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.BASES) {
        return operations.createBase(parent);
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.CANVAS) {
        return operations.createCanvas(parent);
    }
    return null;
}
