/*
 * TPS Notebook Navigator - descriptor model for the first-class Types source.
 *
 * The navigation layer depends on these neutral descriptors, not on GCM.
 * Integrations may resolve records for any descriptor without teaching core
 * navigation about a specific entity index implementation.
 */

export const TPS_NAVIGATOR_TYPE_IDS = {
    NOTES: 'entity:note',
    CHECKBOXES: 'structural:task',
    BULLETS: 'structural:bullet',
    HEADINGS: 'structural:heading',
    CODE_BLOCKS: 'structural:code-block',
    CALLOUTS: 'structural:callout',
    BLOCKQUOTES: 'structural:blockquote',
    TABLES: 'structural:table',
    WEB_LINKS: 'structural:web-link',
    BASES: 'file:base',
    CANVAS: 'file:canvas',
    DRAWINGS: 'file:drawing',
    PDFS: 'file:pdf',
    IMAGES: 'file:image',
    AUDIO: 'file:audio',
    VIDEO: 'file:video'
} as const;

export type TpsNavigatorFileTypeId =
    | typeof TPS_NAVIGATOR_TYPE_IDS.NOTES
    | typeof TPS_NAVIGATOR_TYPE_IDS.BASES
    | typeof TPS_NAVIGATOR_TYPE_IDS.CANVAS
    | typeof TPS_NAVIGATOR_TYPE_IDS.DRAWINGS
    | typeof TPS_NAVIGATOR_TYPE_IDS.PDFS
    | typeof TPS_NAVIGATOR_TYPE_IDS.IMAGES
    | typeof TPS_NAVIGATOR_TYPE_IDS.AUDIO
    | typeof TPS_NAVIGATOR_TYPE_IDS.VIDEO;
export type TpsNavigatorGcmLineTypeId =
    typeof TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES | typeof TPS_NAVIGATOR_TYPE_IDS.BULLETS | typeof TPS_NAVIGATOR_TYPE_IDS.HEADINGS;
export type TpsNavigatorMarkdownTypeId =
    | typeof TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS
    | typeof TPS_NAVIGATOR_TYPE_IDS.CALLOUTS
    | typeof TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES
    | typeof TPS_NAVIGATOR_TYPE_IDS.TABLES
    | typeof TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS;
export type TpsNavigatorLineTypeId = TpsNavigatorGcmLineTypeId | TpsNavigatorMarkdownTypeId;
export type TpsNavigatorStructuralTypeId = TpsNavigatorFileTypeId | TpsNavigatorLineTypeId;
/** @deprecated Kind values are metadata, not Navigator Types. Kept only to parse stale IDs safely. */
export type TpsNavigatorKindTypeId = `kind:${string}`;
export type TpsNavigatorProviderTypeId = `provider:${string}:${string}`;
export type TpsNavigatorTypeId = TpsNavigatorStructuralTypeId | TpsNavigatorProviderTypeId;
export type TpsNavigatorTypeCategory = 'structure';

export const TPS_NAVIGATOR_BUILTIN_TYPE_SOURCE = 'builtin';
export const TPS_NAVIGATOR_TYPE_PROVIDER_ID_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*\/[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
export const TPS_NAVIGATOR_TYPE_COLLECTION_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,63})$/u;

export interface TpsNavigatorTypeDescriptor {
    id: TpsNavigatorTypeId;
    label: string;
    icon: string;
    category: TpsNavigatorTypeCategory;
    count: number;
    /** External collections omit counts because their rows are transient and search/visibility scoped. */
    showCount?: boolean;
    /** Present only for externally registered top-level collections. */
    providerId?: string;
    /** Provider-local collection ID, present only for external collections. */
    providerCollectionId?: string;
}

export interface TpsNavigatorTypeRecord {
    id: string;
    typeId: TpsNavigatorTypeId;
    label: string;
    sourcePath: string;
    entityType: 'file' | 'note' | 'block';
    lineKind?: 'task' | 'bullet' | 'heading' | 'code' | 'callout' | 'blockquote' | 'table' | 'web-link';
    /** One-based source line supplied by the entity index. */
    lineNumber?: number;
    /** Zero-based source column when the parser publishes an exact position. */
    columnNumber?: number;
    /** UTF-16 source offsets used only for guarded content-backed activation. */
    sourceOffset?: number;
    sourceEndOffset?: number;
    /** One-based inclusive final source line for a multi-line Markdown structure. */
    lineEndNumber?: number;
    /** Existing source block id when Obsidian assigned one; never synthesized by the Navigator. */
    blockId?: string;
    locatorKey: string;
    referenceTarget: string;
    /** Optional redacted text used for row search without exposing a complete target. */
    searchText?: string;
    /** Immutable raw inline fields supplied only for exact GCM-backed line entities. */
    properties?: Readonly<Record<string, readonly string[]>>;
    /** Live task state, present only when GCM can hydrate this task line exactly. */
    task?: TpsNavigatorTypeTaskState;
    checked?: boolean;
}

export interface TpsNavigatorTypeTaskState {
    /** Zero-based source line used by GCM's task API. */
    lineNumber: number;
    rawLine: string;
    title: string;
    checkbox: string;
    marker: string;
    status: string;
    isComplete: boolean;
    /** Exact task-local hashtags supplied by GCM, without the leading hash. */
    tags?: readonly string[];
    /** Immutable task-local inline fields supplied by GCM when available. */
    fields?: Readonly<Record<string, string>>;
    canMutateCheckbox: boolean;
    hasContextMenu: boolean;
}

export type TpsNavigatorTypesAvailability = 'loading' | 'ready' | 'unavailable' | 'error';

export interface TpsNavigatorTypesSnapshot {
    availability: TpsNavigatorTypesAvailability;
    descriptors: readonly TpsNavigatorTypeDescriptor[];
    recordsByType: ReadonlyMap<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>;
    revision: number;
    message?: string;
    /** Source keys whose current missing descriptors are authoritative. */
    authoritativeSourceKeys?: ReadonlySet<string>;
    /** Original GCM source state, independent from healthy external providers. */
    builtinAvailability?: TpsNavigatorTypesAvailability;
    builtinMessage?: string;
    /** Exact-line entity state. File-backed Types remain ready when this source is unavailable. */
    lineAvailability?: TpsNavigatorTypesAvailability;
    lineMessage?: string;
    /** Navigator-owned Markdown-section state, independent from GCM exact-line records. */
    markdownAvailability?: TpsNavigatorTypesAvailability;
    markdownMessage?: string;
}

export const TPS_NAVIGATOR_FILE_TYPES: readonly Omit<TpsNavigatorTypeDescriptor, 'count'>[] = Object.freeze([
    {
        id: TPS_NAVIGATOR_TYPE_IDS.NOTES,
        label: 'Markdown',
        icon: 'lucide-file-text',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.BASES,
        label: 'Bases',
        icon: 'lucide-table-2',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.CANVAS,
        label: 'Canvas',
        icon: 'lucide-layout-dashboard',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.DRAWINGS,
        label: 'Drawings',
        icon: 'lucide-pencil-ruler',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.PDFS,
        label: 'PDFs',
        icon: 'lucide-file-text',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.IMAGES,
        label: 'Images',
        icon: 'lucide-image',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.AUDIO,
        label: 'Audio',
        icon: 'lucide-audio-lines',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.VIDEO,
        label: 'Video',
        icon: 'lucide-video',
        category: 'structure'
    }
]);

export const TPS_NAVIGATOR_GCM_LINE_TYPES: readonly Omit<TpsNavigatorTypeDescriptor, 'count'>[] = Object.freeze([
    {
        id: TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES,
        label: 'Checkboxes',
        icon: 'lucide-square-check-big',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.BULLETS,
        label: 'Bullets',
        icon: 'lucide-list',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.HEADINGS,
        label: 'Headings',
        icon: 'lucide-heading',
        category: 'structure'
    }
]);

export const TPS_NAVIGATOR_MARKDOWN_TYPES: readonly Omit<TpsNavigatorTypeDescriptor, 'count'>[] = Object.freeze([
    {
        id: TPS_NAVIGATOR_TYPE_IDS.CODE_BLOCKS,
        label: 'Code blocks',
        icon: 'lucide-code-2',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.CALLOUTS,
        label: 'Callouts',
        icon: 'lucide-message-square-warning',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.BLOCKQUOTES,
        label: 'Blockquotes',
        icon: 'lucide-quote',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.TABLES,
        label: 'Tables',
        icon: 'lucide-table-2',
        category: 'structure'
    },
    {
        id: TPS_NAVIGATOR_TYPE_IDS.WEB_LINKS,
        label: 'Web links',
        icon: 'lucide-external-link',
        category: 'structure'
    }
]);

export const TPS_NAVIGATOR_LINE_TYPES: readonly Omit<TpsNavigatorTypeDescriptor, 'count'>[] = Object.freeze([
    ...TPS_NAVIGATOR_GCM_LINE_TYPES,
    ...TPS_NAVIGATOR_MARKDOWN_TYPES
]);

/** Stable flat display order for built-in Types. */
export const TPS_NAVIGATOR_STRUCTURAL_TYPES: readonly Omit<TpsNavigatorTypeDescriptor, 'count'>[] = Object.freeze([
    TPS_NAVIGATOR_FILE_TYPES[0],
    ...TPS_NAVIGATOR_LINE_TYPES,
    ...TPS_NAVIGATOR_FILE_TYPES.slice(1)
]);

const TPS_NAVIGATOR_FILE_TYPE_ID_SET = new Set<TpsNavigatorTypeId>(TPS_NAVIGATOR_FILE_TYPES.map(type => type.id));
const TPS_NAVIGATOR_LINE_TYPE_ID_SET = new Set<TpsNavigatorTypeId>(TPS_NAVIGATOR_LINE_TYPES.map(type => type.id));
const TPS_NAVIGATOR_STRUCTURAL_TYPE_ID_SET = new Set<TpsNavigatorTypeId>(TPS_NAVIGATOR_STRUCTURAL_TYPES.map(type => type.id));
const TPS_NAVIGATOR_GCM_LINE_TYPE_ID_SET = new Set<TpsNavigatorTypeId>(TPS_NAVIGATOR_GCM_LINE_TYPES.map(type => type.id));
const TPS_NAVIGATOR_MARKDOWN_TYPE_ID_SET = new Set<TpsNavigatorTypeId>(TPS_NAVIGATOR_MARKDOWN_TYPES.map(type => type.id));

export function isTpsNavigatorFileTypeId(typeId: unknown): typeId is TpsNavigatorFileTypeId {
    return typeof typeId === 'string' && TPS_NAVIGATOR_FILE_TYPE_ID_SET.has(typeId as TpsNavigatorTypeId);
}

export function isTpsNavigatorLineTypeId(typeId: unknown): typeId is TpsNavigatorLineTypeId {
    return typeof typeId === 'string' && TPS_NAVIGATOR_LINE_TYPE_ID_SET.has(typeId as TpsNavigatorTypeId);
}

/** Returns true for the fixed, Navigator-owned file and Markdown structure Types. */
export function isTpsNavigatorStructuralTypeId(typeId: unknown): typeId is TpsNavigatorStructuralTypeId {
    return typeof typeId === 'string' && TPS_NAVIGATOR_STRUCTURAL_TYPE_ID_SET.has(typeId as TpsNavigatorTypeId);
}

export function isTpsNavigatorGcmLineTypeId(typeId: unknown): typeId is TpsNavigatorGcmLineTypeId {
    return typeof typeId === 'string' && TPS_NAVIGATOR_GCM_LINE_TYPE_ID_SET.has(typeId as TpsNavigatorTypeId);
}

export function isTpsNavigatorMarkdownTypeId(typeId: unknown): typeId is TpsNavigatorMarkdownTypeId {
    return typeof typeId === 'string' && TPS_NAVIGATOR_MARKDOWN_TYPE_ID_SET.has(typeId as TpsNavigatorTypeId);
}

/** @deprecated Kind values are metadata, not Navigator Types. */
export function createTpsNavigatorKindTypeId(kind: string): TpsNavigatorKindTypeId | null {
    const normalized = String(kind ?? '').trim();
    if (!normalized) {
        return null;
    }
    return `kind:${encodeURIComponent(normalized)}`;
}

/** @deprecated Kind values are metadata, not Navigator Types. */
export function getTpsNavigatorKindValue(typeId: string): string | null {
    if (!typeId.startsWith('kind:')) {
        return null;
    }
    try {
        const value = decodeURIComponent(typeId.slice('kind:'.length)).trim();
        return value || null;
    } catch {
        return null;
    }
}

export interface TpsNavigatorProviderTypeIdentity {
    providerId: string;
    collectionId: string;
}

export function getTpsNavigatorProviderSourceKey(providerId: string): string {
    return `provider:${providerId}`;
}

export function createTpsNavigatorProviderTypeId(providerId: string, collectionId: string): TpsNavigatorProviderTypeId | null {
    const normalizedProviderId = String(providerId ?? '').trim();
    const normalizedCollectionId = String(collectionId ?? '').trim();
    if (
        normalizedProviderId.length > 128 ||
        !TPS_NAVIGATOR_TYPE_PROVIDER_ID_PATTERN.test(normalizedProviderId) ||
        !TPS_NAVIGATOR_TYPE_COLLECTION_ID_PATTERN.test(normalizedCollectionId)
    ) {
        return null;
    }
    return `provider:${encodeURIComponent(normalizedProviderId)}:${encodeURIComponent(normalizedCollectionId)}`;
}

export function parseTpsNavigatorProviderTypeId(typeId: string): TpsNavigatorProviderTypeIdentity | null {
    if (!typeId.startsWith('provider:')) {
        return null;
    }
    const encodedParts = typeId.slice('provider:'.length).split(':');
    if (encodedParts.length !== 2) {
        return null;
    }
    try {
        const providerId = decodeURIComponent(encodedParts[0]);
        const collectionId = decodeURIComponent(encodedParts[1]);
        const canonical = createTpsNavigatorProviderTypeId(providerId, collectionId);
        return canonical === typeId ? { providerId, collectionId } : null;
    } catch {
        return null;
    }
}

export function getTpsNavigatorTypeSourceKey(typeId: TpsNavigatorTypeId): string {
    const providerIdentity = parseTpsNavigatorProviderTypeId(typeId);
    return providerIdentity ? getTpsNavigatorProviderSourceKey(providerIdentity.providerId) : TPS_NAVIGATOR_BUILTIN_TYPE_SOURCE;
}

/**
 * Returns true only when the source that owns a missing Type has produced an
 * authoritative catalog. Unknown provider IDs remain provisional so restored
 * selections survive cross-plugin load order.
 */
export function isTpsNavigatorTypeAuthoritativelyMissing(
    snapshot: Pick<TpsNavigatorTypesSnapshot, 'availability' | 'descriptors' | 'authoritativeSourceKeys'>,
    typeId: TpsNavigatorTypeId
): boolean {
    if (snapshot.descriptors.some(descriptor => descriptor.id === typeId)) {
        return false;
    }
    if (snapshot.authoritativeSourceKeys) {
        return snapshot.authoritativeSourceKeys.has(getTpsNavigatorTypeSourceKey(typeId));
    }
    return snapshot.availability === 'ready';
}

export function isTpsNavigatorTypeId(value: unknown): value is TpsNavigatorTypeId {
    if (typeof value !== 'string') {
        return false;
    }
    if ((Object.values(TPS_NAVIGATOR_TYPE_IDS) as string[]).includes(value)) {
        return true;
    }
    return parseTpsNavigatorProviderTypeId(value) !== null;
}

/** Applies Navigator visibility rules to a raw entity-index snapshot. */
export function filterTpsNavigatorTypesSnapshot(
    snapshot: TpsNavigatorTypesSnapshot,
    visibleSourcePaths: ReadonlySet<string>
): TpsNavigatorTypesSnapshot {
    const recordsByType = new Map<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>();
    const descriptors = snapshot.descriptors.map(descriptor => {
        const records = (snapshot.recordsByType.get(descriptor.id) ?? []).filter(record => visibleSourcePaths.has(record.sourcePath));
        recordsByType.set(descriptor.id, records);
        if (descriptor.showCount === false) {
            return descriptor;
        }
        return records.length === descriptor.count ? descriptor : { ...descriptor, count: records.length };
    });

    return {
        ...snapshot,
        descriptors,
        recordsByType
    };
}
