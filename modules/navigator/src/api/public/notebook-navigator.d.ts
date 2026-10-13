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

/**
 * Notebook Navigator Plugin API Type Definitions
 * Version: 3.6.0
 *
 * Download this file to your Obsidian plugin project to get TypeScript support
 * for the Notebook Navigator API.
 *
 * Usage:
 * ```typescript
 * import type { NotebookNavigatorAPI } from './notebook-navigator';
 *
 * const nn = app.plugins.plugins['tps-notebook-navigator']?.api as NotebookNavigatorAPI | undefined;
 * if (nn) {
 *   const folder = app.vault.getFolderByPath('Projects');
 *   if (folder) {
 *     await nn.metadata.setFolderMeta(folder, { icon: 'folder-star' });
 *   }
 * }
 * ```
 */

import { App, EventRef, MenuItem, TFile, TFolder } from 'obsidian';

// Core types

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

/** Point-to-point request published through `tps:notebook-navigator-api-request`. */
export interface TpsNotebookNavigatorApiRequestPayload {
    /** ID of the plugin requesting the current API state. */
    readonly sourcePluginId: string;
    readonly timestamp: number;
    /** Invoked synchronously with only the requesting consumer's response. */
    readonly respond: (payload: TpsNotebookNavigatorApiChangedPayload) => void;
}

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

export type NavigatorTypeProviderOptions = Readonly<Record<string, unknown>>;

export interface NavigatorTypeCollectionDefinition {
    readonly id: string;
    readonly label: string;
    readonly icon: string;
}

export interface NavigatorTypeProviderContext {
    readonly app: App;
}

export interface NavigatorTypeProviderQueryContext extends NavigatorTypeProviderContext {
    readonly signal: AbortSignal;
}

export interface NavigatorTypeRowsContext extends NavigatorTypeProviderQueryContext {
    readonly typeId: string;
    readonly searchQuery: string;
    /** Exact visible vault-file paths the provider may return rows for. */
    readonly allowedVaultFilePaths: readonly string[];
}

export interface NavigatorTypeProvider {
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
    getTypeId(collectionId: string): string | null;
    updateOptions(options: NavigatorTypeProviderOptions): void;
    unregister(): void;
}

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
    readonly id: string;
    readonly kind: string;
    readonly label: string;
    readonly secondaryLabel?: string;
    readonly tooltip?: string;
    readonly sourcePath: string;
    readonly sourceLineNumber?: number;
    readonly indicator?: NavigatorRowCheckboxIndicator;
    readonly activate?: () => void | Promise<void>;
    /** Optional synchronous builder for right-click, long-press, and keyboard-accessible row actions. */
    readonly contextMenu?: (context: NavigatorRowContextMenuContext) => void;
}

export interface NavigatorRowProvider {
    readonly id: string;
    /** Opt in to standalone rows when a Type collection is selected. */
    readonly supportsTypeScope?: boolean;
    getRows(
        context: NavigatorRowProviderQueryContext,
        options: NavigatorRowProviderOptions
    ): Promise<readonly NavigatorRowDefinition[]> | readonly NavigatorRowDefinition[];
    subscribe?(context: NavigatorRowProviderContext, options: NavigatorRowProviderOptions, invalidate: () => void): (() => void) | void;
}

export interface NavigatorRowProviderRegistration {
    readonly id: string;
    updateOptions(options: NavigatorRowProviderOptions): void;
    unregister(): void;
}

/** Exact source-backed identity used to focus one currently rendered provider row. */
export interface NavigatorRowFocusTarget {
    readonly providerId: string;
    readonly rowId: string;
    readonly sourcePath: string;
    readonly sourceLineNumber?: number;
    /** Opaque selected Type id, or null for a row attached beneath a note. */
    readonly typeId?: string | null;
    /** Optional presentation-kind guard. */
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
    /** Opaque owning/selected Type id, or null for an ordinary row attached beneath a note. */
    readonly typeId: string | null;
}

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
export interface NavigatorListSearchUpdate {
    readonly active?: boolean;
    readonly query?: string;
    readonly provider?: NavigatorListSearchProvider;
    readonly focus?: boolean;
}
export interface NavigatorListPresentationUpdate {
    readonly sort?: NavigatorListSortSpec | null;
    readonly groupBy?: NavigatorListGrouping | null;
    readonly displayMode?: NavigatorListDisplayMode | null;
}
export interface NavigatorListSearchState {
    readonly active: boolean;
    readonly query: string;
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
    readonly configured: NavigatorListGrouping;
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
export interface NavigatorVisibleProviderRow {
    readonly type: 'provider';
    readonly providerId: string;
    readonly rowId: string;
    readonly kind: string;
    readonly label: string;
    readonly secondaryLabel?: string;
    readonly sourcePath: string;
    readonly sourceLineNumber?: number;
    readonly typeId: string | null;
    readonly file: TFile | null;
}
export type NavigatorVisibleListRow = NavigatorVisibleFileRow | NavigatorVisibleProviderRow;
export interface NavigatorListSnapshot {
    readonly navItem: NavItem;
    readonly search: NavigatorListSearchState;
    /** Null only for external provider Type scopes or scopes without presentation controls. */
    readonly presentation: NavigatorListPresentationState | null;
    readonly rows: readonly NavigatorVisibleListRow[];
}

/**
 * Metadata associated with a folder
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
 * Metadata associated with a tag
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
 * Metadata associated with a property node
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

/**
 * Currently selected navigation item (folder, tag, property, TPS type, or none).
 *
 * `property` uses the property tree node id (`properties-root` for the section root,
 * or `key:<normalizedKey>` / `key:<normalizedKey>=<normalizedValuePath>` for key/value nodes).
 */
export type NavItemType = 'folder' | 'tag' | 'property' | 'type' | 'none';

export type NavItem =
    | { type: 'folder'; folder: TFolder; tag: null; property: null }
    | { type: 'tag'; folder: null; tag: string; property: null }
    | { type: 'property'; folder: null; tag: null; property: string }
    | { type: 'type'; folder: null; tag: null; property: null; navigatorType: string }
    | { type: 'none'; folder: null; tag: null; property: null };

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

/**
 * Current file selection state in the navigator
 */
export interface SelectionState {
    /** Array of currently selected files */
    files: readonly TFile[];
    /** The file that has keyboard focus (can be null) */
    focused: TFile | null;
}

/**
 * Selection mode for file context menu extensions.
 *
 * - `single`: Menu opened on a single file (context.selection.files is `[file]`)
 * - `multiple`: Menu opened on a selected file while multiple files are selected
 */
export type FileMenuSelectionMode = 'single' | 'multiple';

export interface FileMenuExtensionContext {
    /** Add a menu item (must be called synchronously during menu construction) */
    addItem(cb: (item: MenuItem) => void): void;
    /** The file the menu was opened on */
    file: TFile;
    selection: {
        /** Effective selection mode for this menu */
        mode: FileMenuSelectionMode;
        /** Snapshot of files for this menu (single mode uses `[file]`) */
        files: readonly TFile[];
    };
}

export interface FolderMenuExtensionContext {
    /** Add a menu item (must be called synchronously during menu construction) */
    addItem(cb: (item: MenuItem) => void): void;
    /** The folder the menu was opened on */
    folder: TFolder;
}

export interface TagMenuExtensionContext {
    /** Add a menu item (must be called synchronously during menu construction) */
    addItem(cb: (item: MenuItem) => void): void;
    /** Canonical tag path, or an aggregate tag collection scope id */
    tag: string;
}

export interface PropertyMenuExtensionContext {
    /** Add a menu item (must be called synchronously during menu construction) */
    addItem(cb: (item: MenuItem) => void): void;
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

/** Current, host-validated transient or Type-backed row target. */
export interface NavigatorRowMenuTarget {
    readonly providerId: string;
    readonly rowId: string;
    readonly kind: string;
    readonly label: string;
    readonly file: TFile;
    readonly sourcePath: string;
    /** Zero-based rendered-row snapshot; re-resolve mutable line content before writing. */
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

/** Dispose function returned by menu registration methods */
export type MenuExtensionDispose = () => void;

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

/**
 * Main Notebook Navigator API interface
 * @version 3.6.0
 */
export interface NotebookNavigatorAPI {
    /** TPS profile-owned visibility settings, exposed for GCM's property editor. */
    readonly propertyVisibility: {
        readonly version: 1;
        get(key: string): {
            profileId: string;
            profileName: string;
            showInNavigation: boolean;
            showInList: boolean;
            showInFileMenu: boolean;
        };
        set(
            key: string,
            surface: 'showInNavigation' | 'showInList' | 'showInFileMenu',
            visible: boolean,
            expectedProfileId: string
        ): Promise<ReturnType<NotebookNavigatorAPI['propertyVisibility']['get']>>;
    };

    /** Get the API version string */
    getVersion(): string;

    /** Check if the initial storage bootstrap has completed */
    isStorageReady(): boolean;
    /** Resolve when the initial storage bootstrap completes */
    whenReady(): Promise<void>;

    /** Metadata operations for folders, tags, property nodes, and pinned files */
    metadata: {
        // Folder metadata
        /** Get all metadata for a folder */
        getFolderMeta(folder: TFolder): FolderMetadata | null;
        /** Set folder metadata (color and/or icon). Pass null to clear a property */
        setFolderMeta(folder: TFolder, meta: FolderMetadataUpdate): Promise<void>;

        // Tag metadata
        /** Get all metadata for a tag */
        getTagMeta(tag: string): TagMetadata | null;
        /** Set tag metadata (color and/or icon). Pass null to clear a property */
        setTagMeta(tag: string, meta: TagMetadataUpdate): Promise<void>;

        // Property metadata
        /** Get all metadata for a property node */
        getPropertyMeta(nodeId: string): PropertyMetadata | null;
        /** Set property metadata (color and/or icon). Pass null to clear a property */
        setPropertyMeta(nodeId: string, meta: PropertyMetadataUpdate): Promise<void>;

        // Pinned files
        /** Get all pinned files with their context information as a Map */
        getPinned(): Readonly<Pinned>;
        /** Check if a file is pinned (no context = any, 'all' = all contexts) */
        isPinned(file: TFile, context?: PinContext): boolean;
        /** Pin a file (defaults to 'all' - all contexts) */
        pin(file: TFile, context?: PinContext): Promise<void>;
        /** Unpin a file (defaults to 'all' - all contexts) */
        unpin(file: TFile, context?: PinContext): Promise<void>;
    };

    /** Navigation operations */
    navigation: {
        /** Reveal and select a file in the navigator. Returns false when the file cannot be revealed, including hidden files while hidden items are off. */
        reveal(file: TFile | string): Promise<boolean>;
        /** Select a folder in the navigator navigation pane */
        navigateToFolder(folder: TFolder | string): Promise<boolean>;
        /** Select a tag in the navigator navigation pane (e.g. '#work' or 'work'). Requires tag data to be available (`storage-ready`). */
        navigateToTag(tag: string): Promise<boolean>;
        /** Select a property node in the navigator navigation pane (e.g. 'key:status' or 'key:status=done'). */
        navigateToProperty(nodeId: string): Promise<boolean>;
        /** Select any built-in file/structure or registered-provider collection discovered through `types`. */
        navigateToType(typeId: string): Promise<boolean>;
        /** Focus an exact currently rendered row without changing scope or activating it. */
        focusRow(target: NavigatorRowFocusTarget): Promise<boolean>;
    };

    /** Discover and address built-in file/structure and registered-provider Type collections. */
    types: {
        readonly notesId: 'entity:note';
        readonly checkboxesId: 'structural:task';
        readonly bulletsId: 'structural:bullet';
        readonly headingsId: 'structural:heading';
        readonly codeBlocksId: 'structural:code-block';
        readonly calloutsId: 'structural:callout';
        readonly blockquotesId: 'structural:blockquote';
        readonly tablesId: 'structural:table';
        readonly webLinksId: 'structural:web-link';
        readonly basesId: 'file:base';
        readonly canvasId: 'file:canvas';
        readonly drawingsId: 'file:drawing';
        readonly pdfsId: 'file:pdf';
        readonly imagesId: 'file:image';
        readonly audioId: 'file:audio';
        readonly videoId: 'file:video';
        /** @deprecated Kind is frontmatter metadata and is no longer published in Types. */
        buildKind(kind: string): string | null;
        /** @deprecated Parses stale Kind ids for compatibility only. */
        parseKind(typeId: string): string | null;
        /** Check whether a value is a fixed or canonical provider Type id. Legacy Kind ids return false. */
        isType(typeId: unknown): boolean;
        /** Register runtime-owned top-level collections and their guarded rows. */
        registerProvider(provider: NavigatorTypeProvider, options?: NavigatorTypeProviderOptions): NavigatorTypeProviderRegistration;
        /** Read the latest immutable provider-neutral catalog snapshot. */
        getSnapshot(): NavigatorTypesSnapshot;
        /** Receive the current snapshot immediately and every later catalog change. */
        subscribe(listener: NavigatorTypesListener): () => void;
        /** Resolve when the catalog reaches a non-loading success or guarded failure state. */
        whenReady(): Promise<NavigatorTypesSnapshot>;
    };

    /** Pull and control the primary mounted list without opening a Navigator view. */
    list: {
        getSnapshot(): Promise<NavigatorListSnapshot | null>;
        setSearch(update: NavigatorListSearchUpdate | null): Promise<boolean>;
        setPresentation(update: NavigatorListPresentationUpdate): Promise<boolean>;
    };

    /** Query current selection state */
    selection: {
        /** Get the currently selected folder, tag, property, or none in navigation pane */
        getNavItem(): NavItem;
        /** Get current file selection state */
        getCurrent(): SelectionState;
        /** Get the current immutable provider-row selection, or null when file selection owns the cursor. */
        getCurrentRow(): NavigatorRowSelection | null;
    };

    /** Helpers for aggregate tag collection scopes used by tag menus and navigation */
    tagCollections: {
        /** Collection id for every visible Markdown note; this is the visible Tags root */
        readonly allId: TagCollectionId;
        /** Tagged-only compatibility collection id; it has no separate tree row */
        readonly taggedId: TagCollectionId;
        /** Collection id for notes without tags */
        readonly untaggedId: TagCollectionId;
        /** Check whether a tag target is an aggregate collection id */
        isCollection(tag: string | null | undefined): tag is TagCollectionId;
        /** Current localized label for an aggregate collection id */
        getLabel(tag: TagCollectionId): string;
    };

    /** Helpers for building and parsing public property node ids */
    propertyNodes: {
        /** Property root node id used by navigation APIs */
        readonly rootId: 'properties-root';
        /** Build a canonical key node id */
        buildKey(key: string): string | null;
        /** Build a canonical key/value node id */
        buildValue(key: string, valuePath: string): string | null;
        /** Parse a property node id into normalized parts */
        parse(nodeId: string): PropertyNodeParts | null;
        /** Normalize a property node id to canonical form */
        normalize(nodeId: string): string | null;
    };

    /** Register immediately active transient rows beneath owning note files. */
    rows: {
        registerProvider(provider: NavigatorRowProvider, options?: NavigatorRowProviderOptions): NavigatorRowProviderRegistration;
    };

    /** Menu extensions for Notebook Navigator context menus (callbacks run synchronously during menu construction) */
    menus: {
        /** Register items for the file context menu */
        registerFileMenu(callback: (context: FileMenuExtensionContext) => void): MenuExtensionDispose;
        /** Register items for the folder context menu */
        registerFolderMenu(callback: (context: FolderMenuExtensionContext) => void): MenuExtensionDispose;
        /** Register items for the tag context menu */
        registerTagMenu(callback: (context: TagMenuExtensionContext) => void): MenuExtensionDispose;
        /** Register items for the property context menu */
        registerPropertyMenu(callback: (context: PropertyMenuExtensionContext) => void): MenuExtensionDispose;
        /** Register items for a fixed built-in or provider-owned Type collection context menu */
        registerTypeMenu(callback: (context: TypeMenuExtensionContext) => void): MenuExtensionDispose;
        /** Register actions for matching attached, fixed-Type, task, and provider-owned rows */
        registerRowMenu(
            callback: (context: NavigatorRowMenuExtensionContext) => void,
            options?: NavigatorRowMenuExtensionOptions
        ): MenuExtensionDispose;
    };

    // Event subscription
    /** Subscribe to navigator events with type safety */
    on<T extends NotebookNavigatorEventType>(event: T, callback: (data: NotebookNavigatorEvents[T]) => void): EventRef;
    /** Subscribe to an event only once - automatically unsubscribes after first trigger */
    once<T extends NotebookNavigatorEventType>(event: T, callback: (data: NotebookNavigatorEvents[T]) => void): EventRef;
    /** Unsubscribe from an event */
    off(ref: EventRef): void;
}
