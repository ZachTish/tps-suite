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

import { App, MenuItem, TFile, TFolder } from 'obsidian';
import type { NotebookNavigatorAPI } from './NotebookNavigatorAPI';

/**
 * Notebook Navigator Public API Types
 *
 * These types are exposed to external plugins through the API.
 * The API consistently uses Obsidian's native types (TFile, TFolder)
 * rather than string paths for better type safety and integration.
 */

// ============================================================================
// COMMON TYPES
// ============================================================================

/**
 * Short icon provider prefixes used by Notebook Navigator frontmatter values.
 */
export type IconProviderPrefix = 'bi' | 'fas' | 'mi' | 'ph' | 'ra' | 'si';

/**
 * Typed short-provider icon input format used in frontmatter.
 * Bare Lucide slugs and bare emoji are accepted as plain strings.
 */
export type IconString = `${IconProviderPrefix}-${string}`;

/**
 * Icon input type accepted by public API setters.
 * Setters parse the same icon value format Notebook Navigator writes to frontmatter.
 */
export type IconInput = string;

/**
 * Icon value returned by public API getters and events.
 * Supported icons use the same value format as frontmatter: Lucide slug,
 * short provider-prefixed slug, or bare emoji.
 */
export type IconValue = string;

/**
 * Aggregate tag collection scope ids used by tag navigation and filtering.
 */
export type TagCollectionId = '__all_tags__' | '__tagged__' | '__untagged__';

// ============================================================================
// TPS HOST API LIFECYCLE
// ============================================================================

/** Current host API state published through `tps:notebook-navigator-api-changed`. */
export interface TpsNotebookNavigatorApiChangedPayload {
    readonly source: 'tps-notebook-navigator';
    readonly sourcePluginId: 'tps-notebook-navigator';
    /** Opaque identity shared by every payload from one loaded host instance. */
    readonly hostInstanceId: string;
    readonly timestamp: number;
    readonly available: boolean;
    readonly pluginVersion: string;
    readonly apiVersion: string | null;
    readonly api: NotebookNavigatorAPI | null;
}

/**
 * Point-to-point request published through `tps:notebook-navigator-api-request`.
 * The host invokes `respond` synchronously instead of rebroadcasting its state.
 */
export interface TpsNotebookNavigatorApiRequestPayload {
    /** ID of the plugin requesting the current API state. */
    readonly sourcePluginId: string;
    readonly timestamp: number;
    readonly respond: (payload: TpsNotebookNavigatorApiChangedPayload) => void;
}

// ============================================================================
// NAVIGATOR TYPES CATALOG (TPS FORK)
// ============================================================================

/** Availability of the optional first-class Types catalog. */
export type NavigatorTypesAvailability = 'disabled' | 'loading' | 'ready' | 'unavailable' | 'error';

/** Provider-neutral descriptor for one fixed file/structure or registered-provider Type collection. */
export interface NavigatorTypeDescriptor {
    /** Opaque ID accepted by Type navigation helpers. */
    readonly id: string;
    readonly label: string;
    readonly icon: string;
    /** Flat catalog category. Kind is frontmatter metadata and is not a Navigator Type. */
    readonly category: 'structure';
    /** Stable owner ID for a collection registered by another plugin. */
    readonly providerId?: string;
    /** Provider-local collection ID for a collection registered by another plugin. */
    readonly providerCollectionId?: string;
}

/** Immutable discovery snapshot for the first-class Types catalog. */
export interface NavigatorTypesSnapshot {
    readonly availability: NavigatorTypesAvailability;
    readonly descriptors: readonly NavigatorTypeDescriptor[];
    readonly revision: number;
    readonly message?: string;
}

/** Listener used by the Types catalog subscription API. */
export type NavigatorTypesListener = (snapshot: NavigatorTypesSnapshot) => void;

/** Immutable options owned by the plugin that registers a Type provider. */
export type NavigatorTypeProviderOptions = Readonly<Record<string, unknown>>;

/** One top-level Type collection exposed by an external provider. */
export interface NavigatorTypeCollectionDefinition {
    /** Stable provider-local lowercase slug. */
    readonly id: string;
    readonly label: string;
    readonly icon: string;
}

export interface NavigatorTypeProviderContext {
    readonly app: App;
}

export interface NavigatorTypeProviderQueryContext extends NavigatorTypeProviderContext {
    /** Aborted when a query is superseded, times out, unregisters, or unloads. */
    readonly signal: AbortSignal;
}

export interface NavigatorTypeRowsContext extends NavigatorTypeProviderQueryContext {
    /** Canonical host-owned Type ID selected in the Navigator. */
    readonly typeId: string;
    readonly searchQuery: string;
    /** Exact visible vault-file paths the provider may return rows for. */
    readonly allowedVaultFilePaths: readonly string[];
}

/**
 * Establishes one or more top-level Type collections and supplies their rows.
 * Returned rows use the same guarded DTO as the ordinary Rows API.
 */
export interface NavigatorTypeProvider {
    /** Stable namespaced ID in `vendor/name` form. */
    readonly id: string;
    getCollections(
        context: NavigatorTypeProviderQueryContext,
        options: NavigatorTypeProviderOptions
    ): Promise<readonly NavigatorTypeCollectionDefinition[]> | readonly NavigatorTypeCollectionDefinition[];
    getRows(
        collectionId: string,
        context: NavigatorTypeRowsContext,
        options: NavigatorTypeProviderOptions
    ): Promise<readonly NavigatorRowDefinition[]> | readonly NavigatorRowDefinition[];
    subscribe?(context: NavigatorTypeProviderContext, options: NavigatorTypeProviderOptions, invalidate: () => void): (() => void) | void;
}

export interface NavigatorTypeProviderRegistration {
    readonly id: string;
    /** Build the canonical ID for a valid local slug while this handle is active. */
    getTypeId(collectionId: string): string | null;
    /** Replace active options and refresh every open TPS Navigator view. */
    updateOptions(options: NavigatorTypeProviderOptions): void;
    /** Disable and unregister this provider. Safe to call repeatedly. */
    unregister(): void;
}

// ============================================================================
// TRANSIENT ROW PROVIDERS (TPS FORK)
// ============================================================================

export type NavigatorRowSelectionType = 'file' | 'folder' | 'tag' | 'property' | 'type';
export type NavigatorRowProviderOptions = Readonly<Record<string, unknown>>;

export interface NavigatorRowScope {
    /** Exact visible vault-file paths represented by native rows in the current list. */
    readonly visibleFilePaths: readonly string[];
    readonly selectionType: NavigatorRowSelectionType | null;
    readonly selectedFolderPath: string | null;
    readonly selectedTag: string | null;
    readonly selectedProperty: string | null;
    /** Opaque fixed built-in or registered-provider collection ID when `selectionType` is `type`. */
    readonly selectedType: string | null;
}

export interface NavigatorRowProviderContext {
    readonly app: App;
    readonly scope: NavigatorRowScope;
}

export interface NavigatorRowProviderQueryContext extends NavigatorRowProviderContext {
    /** Aborted when a query is superseded, times out, unregisters, or unloads. */
    readonly signal: AbortSignal;
}

export interface NavigatorRowCheckboxIndicator {
    readonly type: 'checkbox';
    readonly checked: boolean;
    /** Source checkbox marker rendered verbatim, including non-binary task states such as `/` or `>`. */
    readonly marker?: string;
    /** Optional mutation. Omit it to render a display-only checkbox. */
    readonly onChange?: (checked: boolean) => void | Promise<void>;
}

/** Immutable identity and menu builder exposed when a provider row requests actions. */
export interface NavigatorRowContextMenuContext {
    readonly providerId: string;
    readonly rowId: string;
    readonly kind: string;
    readonly sourcePath: string;
    readonly sourceLineNumber?: number;
    /** Add menu items synchronously. Async work belongs inside each item's onClick handler. */
    readonly addItem: (cb: (item: MenuItem) => void) => void;
    /** Add a separator synchronously between provider-owned menu groups. */
    readonly addSeparator: () => void;
}

export interface NavigatorRowDefinition {
    /** Provider-local transient ID. */
    readonly id: string;
    /** Namespaced presentation kind, such as `example/task`. */
    readonly kind: string;
    readonly label: string;
    readonly secondaryLabel?: string;
    readonly tooltip?: string;
    /** Must exactly match one of `scope.visibleFilePaths`. */
    readonly sourcePath: string;
    /** Optional zero-based source line. */
    readonly sourceLineNumber?: number;
    /** Optional row-local values used when an attached row participates in property grouping. */
    readonly properties?: Readonly<Record<string, string | number | boolean | readonly (string | number | boolean)[]>>;
    readonly indicator?: NavigatorRowCheckboxIndicator;
    readonly activate?: () => void | Promise<void>;
    /** Optional synchronous builder for right-click, long-press, and keyboard-accessible row actions. */
    readonly contextMenu?: (context: NavigatorRowContextMenuContext) => void;
}

export interface NavigatorRowProvider {
    /** Stable namespaced ID in `vendor/name` form. */
    readonly id: string;
    /**
     * Opt in to standalone Type scopes. Providers without this flag retain the
     * pre-Type attached-row behavior and are never queried from a Type list.
     */
    readonly supportsTypeScope?: boolean;
    getRows(
        context: NavigatorRowProviderQueryContext,
        options: NavigatorRowProviderOptions
    ): Promise<readonly NavigatorRowDefinition[]> | readonly NavigatorRowDefinition[];
    subscribe?(context: NavigatorRowProviderContext, options: NavigatorRowProviderOptions, invalidate: () => void): (() => void) | void;
}

/**
 * Exact source-backed identity used to focus one currently rendered provider row.
 * Optional guards are checked when supplied; this reference never causes a scope change.
 */
export interface NavigatorRowFocusTarget {
    readonly providerId: string;
    readonly rowId: string;
    readonly sourcePath: string;
    readonly sourceLineNumber?: number;
    /** Opaque owning/selected Type id, or null for an ordinary row attached beneath a note. */
    readonly typeId?: string | null;
    /** Optional presentation-kind guard for callers retaining a prior selection snapshot. */
    readonly kind?: string;
}

/** Immutable identity for the one transient or Type-backed row selected in the list pane. */
export interface NavigatorRowSelection {
    readonly providerId: string;
    readonly rowId: string;
    readonly kind: string;
    readonly label: string;
    readonly file: TFile;
    readonly sourcePath: string;
    readonly sourceLineNumber?: number;
    /** Opaque selected Type id, or null when the row is attached beneath a note. */
    readonly typeId: string | null;
}

// ============================================================================
// CURRENT LIST VIEW (TPS FORK)
// ============================================================================

export type NavigatorListSearchProvider = 'internal' | 'omnisearch';

export type NavigatorListSortOption =
    | 'modified-desc'
    | 'modified-asc'
    | 'created-desc'
    | 'created-asc'
    | 'title-asc'
    | 'title-desc'
    | 'filename-asc'
    | 'filename-desc'
    | 'property-asc'
    | 'property-desc';

export interface NavigatorListSortSpec {
    readonly option: NavigatorListSortOption;
    /** Required for property sorting and omitted for every other sort. */
    readonly propertyKey?: string;
}

export type NavigatorListGrouping =
    | 'none'
    | 'custom'
    | 'date'
    | 'folder'
    | 'tags'
    | `property:${string}`
    | `property-desc:${string}`
    | `property-follow:${string}`
    | `property-path:${string}`
    | `property-path-desc:${string}`
    | `property-path-follow:${string}`
    | `property-day:${string}`
    | `property-day-desc:${string}`
    | `property-day-follow:${string}`
    | `line-property:${string}`
    | `line-property-desc:${string}`
    | `line-property-follow:${string}`
    | `line-property-path:${string}`
    | `line-property-path-desc:${string}`
    | `line-property-path-follow:${string}`
    | `line-property-day:${string}`
    | `line-property-day-desc:${string}`
    | `line-property-day-follow:${string}`;
export type NavigatorListDisplayMode = 'standard' | 'compact';

/** Guarded update for the search owned by the primary mounted TPS Navigator view. */
export interface NavigatorListSearchUpdate {
    readonly active?: boolean;
    readonly query?: string;
    readonly provider?: NavigatorListSearchProvider;
    /** Focus the search input after applying the update. Defaults to false. */
    readonly focus?: boolean;
}

/** Atomic, per-scope list presentation update. Null resets one field to its inherited default. */
export interface NavigatorListPresentationUpdate {
    readonly sort?: NavigatorListSortSpec | null;
    readonly groupBy?: NavigatorListGrouping | null;
    readonly displayMode?: NavigatorListDisplayMode | null;
}

export interface NavigatorListSearchState {
    readonly active: boolean;
    /** Current search-input value. */
    readonly query: string;
    /** Debounced query that produced the current row snapshot. */
    readonly appliedQuery: string;
    readonly requestedProvider: NavigatorListSearchProvider;
    readonly effectiveProvider: NavigatorListSearchProvider;
}

export interface NavigatorListSortState {
    readonly option: NavigatorListSortOption;
    readonly propertyKey: string | null;
    readonly source: 'default' | 'scope';
}

export interface NavigatorListGroupingState {
    /** Saved/default grouping before compatibility coercion by the active sort. */
    readonly configured: NavigatorListGrouping;
    /** Grouping that produced the current row snapshot. */
    readonly effective: NavigatorListGrouping;
    readonly source: 'default' | 'scope';
}

export interface NavigatorListDisplayModeState {
    readonly value: NavigatorListDisplayMode;
    readonly source: 'default' | 'scope';
}

export interface NavigatorListPresentationState {
    readonly sort: NavigatorListSortState;
    readonly grouping: NavigatorListGroupingState;
    readonly displayMode: NavigatorListDisplayModeState;
}

export interface NavigatorVisibleFileRow {
    readonly type: 'file';
    readonly file: TFile;
    readonly path: string;
    readonly pinned: boolean;
}

/** Callback-free provider row in its current composed list position. */
export interface NavigatorVisibleProviderRow {
    readonly type: 'provider';
    readonly providerId: string;
    readonly rowId: string;
    readonly kind: string;
    readonly label: string;
    readonly secondaryLabel?: string;
    readonly sourcePath: string;
    readonly sourceLineNumber?: number;
    /** Opaque selected Type id, or null for a row attached beneath a note. */
    readonly typeId: string | null;
    /** Null for a non-source-backed loading or error placeholder. */
    readonly file: TFile | null;
}

export type NavigatorVisibleListRow = NavigatorVisibleFileRow | NavigatorVisibleProviderRow;

/** Pull-based immutable snapshot of the primary mounted TPS Navigator list. */
export interface NavigatorListSnapshot {
    readonly navItem: NavItem;
    readonly search: NavigatorListSearchState;
    /** Null only for external provider Type scopes or scopes without presentation controls. */
    readonly presentation: NavigatorListPresentationState | null;
    /** Renderable file/provider order after scope, search, and collapsed-group filtering. */
    readonly rows: readonly NavigatorVisibleListRow[];
}

// ============================================================================
// METADATA TYPES
// ============================================================================

/**
 * Metadata for customizing folder appearance in the navigator
 */
export interface FolderMetadata {
    /** CSS color value (hex, rgb, hsl, named colors) */
    color?: string;
    /** CSS background color value */
    backgroundColor?: string;
    /** Normalized icon identifier stored by the plugin */
    icon?: IconValue;
}

/**
 * Metadata for customizing tag appearance in the navigator
 */
export interface TagMetadata {
    /** CSS color value (hex, rgb, hsl, named colors) */
    color?: string;
    /** CSS background color value */
    backgroundColor?: string;
    /** Normalized icon identifier stored by the plugin */
    icon?: IconValue;
}

/**
 * Metadata for customizing property node appearance in the navigator
 */
export interface PropertyMetadata {
    /** CSS color value (hex, rgb, hsl, named colors) */
    color?: string;
    /** CSS background color value */
    backgroundColor?: string;
    /** Normalized icon identifier stored by the plugin */
    icon?: IconValue;
}

/**
 * Metadata update payload for folders
 */
export interface FolderMetadataUpdate {
    /** CSS color value. Use null to clear the stored value. */
    color?: string | null;
    /** CSS background color value. Use null to clear the stored value. */
    backgroundColor?: string | null;
    /** Canonical icon input. Use null to clear the stored value. */
    icon?: IconInput | null;
}

/**
 * Metadata update payload for tags
 */
export interface TagMetadataUpdate {
    /** CSS color value. Use null to clear the stored value. */
    color?: string | null;
    /** CSS background color value. Use null to clear the stored value. */
    backgroundColor?: string | null;
    /** Canonical icon input. Use null to clear the stored value. */
    icon?: IconInput | null;
}

/**
 * Metadata update payload for property nodes
 */
export interface PropertyMetadataUpdate {
    /** CSS color value. Use null to clear the stored value. */
    color?: string | null;
    /** CSS background color value. Use null to clear the stored value. */
    backgroundColor?: string | null;
    /** Canonical icon input. Use null to clear the stored value. */
    icon?: IconInput | null;
}

// ============================================================================
// PIN CONTEXT TYPES
// ============================================================================

/**
 * Context where a note can be pinned
 * - 'folder': Pin appears when viewing folders
 * - 'tag': Pin appears when viewing tags
 * - 'property': Pin appears when viewing properties
 * - 'all': Pin appears in folder, tag, and property views
 */
export type PinContext = 'folder' | 'tag' | 'property' | 'all';

/**
 * Type alias for the Map structure returned by the API for pinned notes
 * Maps file paths to their pinning context states
 */
export type Pinned = Map<string, Readonly<{ folder: boolean; tag: boolean; property: boolean }>>;

// ============================================================================
// EVENTS
// ============================================================================

/**
 * All available event types that can be subscribed to
 */
export type NotebookNavigatorEventType = keyof NotebookNavigatorEvents;

/**
 * Event payload definitions for each event type
 */
export interface NotebookNavigatorEvents {
    /** Fired when the storage system is ready for queries */
    'storage-ready': void;

    /** Fired when the navigation selection changes (folder, tag, property, or nothing) */
    'nav-item-changed': {
        item: NavItem;
    };

    /** Fired when selection changes in the list pane */
    'selection-changed': {
        state: SelectionState;
    };

    /** Fired when the selected transient or Type-backed row changes. */
    'row-selection-changed': {
        readonly row: NavigatorRowSelection | null;
    };

    /** Fired when pinned files change */
    'pinned-files-changed': {
        /** All currently pinned files with their context information as a Map */
        files: Readonly<Pinned>;
    };

    /** Fired when folder metadata changes */
    'folder-changed': {
        folder: TFolder;
        metadata: FolderMetadata | null;
    };

    /** Fired when tag metadata changes */
    'tag-changed': {
        tag: string;
        metadata: TagMetadata | null;
    };

    /** Fired when property metadata changes */
    'property-changed': {
        nodeId: string;
        metadata: PropertyMetadata | null;
    };
}

// ============================================================================
// SELECTION STATE
// ============================================================================

export type NavItemType = 'folder' | 'tag' | 'property' | 'type' | 'none';

/**
 * Currently selected navigation item (folder, tag, property, TPS type, or none).
 *
 * `property` uses the property tree node id (`properties-root` for the section root,
 * or `key:<normalizedKey>` / `key:<normalizedKey>=<normalizedValuePath>` for key/value nodes).
 */
export type NavItem =
    | { type: 'folder'; folder: TFolder; tag: null; property: null }
    | { type: 'tag'; folder: null; tag: string; property: null }
    | { type: 'property'; folder: null; tag: null; property: string }
    | { type: 'type'; folder: null; tag: null; property: null; navigatorType: string }
    | { type: 'none'; folder: null; tag: null; property: null };

/**
 * Current file selection state
 */
export interface SelectionState {
    /** Array of currently selected files */
    files: readonly TFile[];
    /** The file that has keyboard focus (can be null) */
    focused: TFile | null;
}

export type FileMenuSelectionMode = 'single' | 'multiple';

export interface FileMenuExtensionContext {
    /** Add a menu item (must be called synchronously during menu construction) */
    addItem: (cb: (item: MenuItem) => void) => void;
    /** The file the menu was opened on */
    file: TFile;
    selection: {
        /** Effective selection mode for this menu */
        mode: FileMenuSelectionMode;
        /** Snapshot of files for this menu */
        files: readonly TFile[];
    };
}

export interface FolderMenuExtensionContext {
    /** Add a menu item (must be called synchronously during menu construction) */
    addItem: (cb: (item: MenuItem) => void) => void;
    /** The folder the menu was opened on */
    folder: TFolder;
}

export interface TagMenuExtensionContext {
    /** Add a menu item (must be called synchronously during menu construction) */
    addItem: (cb: (item: MenuItem) => void) => void;
    /** Canonical tag path, or an aggregate tag collection scope id */
    tag: string;
}

export interface PropertyMenuExtensionContext {
    /** Add a menu item (must be called synchronously during menu construction) */
    addItem: (cb: (item: MenuItem) => void) => void;
    /** Property node id for the menu target */
    nodeId: string;
}

export interface TypeMenuExtensionContext {
    /** Add a menu item (must be called synchronously during menu construction) */
    readonly addItem: (cb: (item: MenuItem) => void) => void;
    /** Opaque current Type id for the collection the menu was opened on */
    readonly typeId: string;
    /** Immutable current descriptor for the collection */
    readonly descriptor: NavigatorTypeDescriptor;
}

/** Immutable checkbox presentation exposed to row-menu integrations. */
export interface NavigatorRowMenuCheckboxState {
    readonly checked: boolean;
    readonly marker?: string;
}

/**
 * Current, host-validated target for a transient or Type-backed row menu.
 * `sourceLineNumber` is zero-based and describes the rendered row snapshot;
 * integrations must re-resolve mutable line content before writing.
 */
export interface NavigatorRowMenuTarget {
    readonly providerId: string;
    readonly rowId: string;
    readonly kind: string;
    readonly label: string;
    readonly file: TFile;
    readonly sourcePath: string;
    readonly sourceLineNumber?: number;
    /** Opaque selected Type id, or null when the row is attached beneath a note. */
    readonly typeId: string | null;
    readonly checkbox: NavigatorRowMenuCheckboxState | null;
}

/** Optional pure filter used to keep row actions off unrelated rows. */
export interface NavigatorRowMenuExtensionOptions {
    readonly supports?: (target: NavigatorRowMenuTarget) => boolean;
}

/** Context passed while registered row-menu items are built synchronously. */
export interface NavigatorRowMenuExtensionContext {
    readonly addItem: (cb: (item: MenuItem) => void) => void;
    readonly addSeparator: () => void;
    readonly target: NavigatorRowMenuTarget;
}

export type PropertyNodeParts =
    | {
          /** Root node returned for `propertyNodes.rootId` */
          kind: 'root';
          key: null;
          valuePath: null;
      }
    | {
          /** Key node without a value path */
          kind: 'key';
          /** Normalized property key */
          key: string;
          valuePath: null;
      }
    | {
          /** Key/value node */
          kind: 'value';
          /** Normalized property key */
          key: string;
          /** Normalized value path */
          valuePath: string;
      };
