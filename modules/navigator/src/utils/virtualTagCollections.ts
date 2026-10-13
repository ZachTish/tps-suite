/*
 * Notebook Navigator - Plugin for Obsidian
 * Copyright (c) 2025-2026 Johan Sanneblad
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { strings } from '../i18n';
import { ALL_TAGS_TAG_ID, TAGGED_TAG_ID, UNTAGGED_TAG_ID } from '../types';
import { normalizeTagPath } from './tagUtils';

// Constants for virtual tag collection identifiers
export const VIRTUAL_TAG_COLLECTION_IDS = {
    ALL: ALL_TAGS_TAG_ID,
    TAGGED: TAGGED_TAG_ID,
    UNTAGGED: UNTAGGED_TAG_ID
} as const;

// Union type of all virtual tag collection IDs
export type VirtualTagCollectionId = (typeof VIRTUAL_TAG_COLLECTION_IDS)[keyof typeof VIRTUAL_TAG_COLLECTION_IDS];

// Definition structure for a virtual tag collection
export interface VirtualTagCollectionDefinition {
    id: VirtualTagCollectionId;
    getLabel: () => string;
}

// Registry of all available virtual tag collections with their localized labels
const virtualTagCollections: Record<VirtualTagCollectionId, VirtualTagCollectionDefinition> = {
    [VIRTUAL_TAG_COLLECTION_IDS.ALL]: {
        id: VIRTUAL_TAG_COLLECTION_IDS.ALL,
        getLabel: () => strings.tagList.tags
    },
    [VIRTUAL_TAG_COLLECTION_IDS.TAGGED]: {
        id: VIRTUAL_TAG_COLLECTION_IDS.TAGGED,
        // The selectable Tags root now includes every note. Keep the older tagged-only
        // public collection visibly distinct in existing shortcuts and API navigation.
        getLabel: () => `# ${strings.tagList.tags}`
    },
    [VIRTUAL_TAG_COLLECTION_IDS.UNTAGGED]: {
        id: VIRTUAL_TAG_COLLECTION_IDS.UNTAGGED,
        getLabel: () => strings.tagList.untaggedLabel
    }
};

// Type guard to check if a value is a valid virtual tag collection ID
export function isVirtualTagCollectionId(value: string | null | undefined): value is VirtualTagCollectionId {
    if (!value) {
        return false;
    }
    return (
        value === VIRTUAL_TAG_COLLECTION_IDS.ALL ||
        value === VIRTUAL_TAG_COLLECTION_IDS.TAGGED ||
        value === VIRTUAL_TAG_COLLECTION_IDS.UNTAGGED
    );
}

/**
 * Rejects user tag paths that would create, rename, or delete a virtual collection ID.
 * Descendants are reserved too because Obsidian would synthesize the virtual ID as their root.
 */
export function isReservedVirtualTagPath(value: string | null | undefined): boolean {
    const normalized = normalizeTagPath(value);
    if (!normalized) {
        return false;
    }
    return Object.values(VIRTUAL_TAG_COLLECTION_IDS).some(id => normalized === id || normalized.startsWith(`${id}/`));
}

// Retrieves the definition for a virtual tag collection
export function getVirtualTagCollection(value: VirtualTagCollectionId): VirtualTagCollectionDefinition {
    return virtualTagCollections[value];
}
