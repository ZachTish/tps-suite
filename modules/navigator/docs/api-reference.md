# TPS Notebook Navigator API Reference

Updated: September 2, 2026

TPS Notebook Navigator exposes a public API for other plugins and scripts to interact with navigator features and register transient provider rows.

**Current API Version:** 3.6.0

## Table of Contents

- [Quick Start](#quick-start)
- [API Overview](#api-overview)
- [Host API Lifecycle](#host-api-lifecycle)
- [Metadata API](#metadata-api)
  - [Folder, Tag, and Property Metadata](#folder-tag-and-property-metadata)
  - [Pinned Files](#pinned-files)
- [Navigation API](#navigation-api)
- [Types Catalog API](#types-catalog-api)
- [Tag Collections API](#tag-collections-api)
- [Property Nodes API](#property-nodes-api)
- [Rows API](#rows-api)
- [List API](#list-api)
- [Selection API](#selection-api)
- [Menus API](#menus-api)
- [Events](#events)
- [Core API Methods](#core-api-methods)
- [TypeScript Support](#typescript-support)
- [Changelog](#changelog)

## Quick Start

### Accessing the API

The TPS Notebook Navigator API is available at runtime through the Obsidian app object. The plugin manifest id is
`tps-notebook-navigator`; the current manifest requires Obsidian `1.11.0` or newer and sets `isDesktopOnly` to `false`.

Here's a practical example using Templater:

```javascript
<%* // Templater script to pin the current file in TPS Notebook Navigator
const nn = app.plugins.plugins['tps-notebook-navigator']?.api;

if (nn) {
  // Pin the current file in folder, tag, and property contexts
  const file = tp.config.target_file;
  await nn.metadata.pin(file);
  new Notice('File pinned in Notebook Navigator');
}
%>
```

Or set a folder color based on the current date:

```javascript
<%* // Set folder color based on day of week
const nn = app.plugins.plugins['tps-notebook-navigator']?.api;
if (nn) {
  const folder = tp.config.target_file.parent;
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'];
  const dayColor = colors[new Date().getDay()];

  await nn.metadata.setFolderMeta(folder, { color: dayColor });
}
%>
```

## API Overview

The API provides nine main namespaces:

- **`metadata`** - Folder, tag, and property node colors/icons, and pinned files
- **`navigation`** - Navigate to files in the navigator
- **`types`** - Discover fixed file and Markdown-structure collections plus registered-provider collections
- **`tagCollections`** - Work with the all-notes, tagged-only, and untagged aggregate tag scopes
- **`propertyNodes`** - Build and parse property node ids
- **`rows`** - Register transient rows and actions beneath owning note files
- **`list`** - Pull or control the current composed list in the primary mounted TPS view
- **`selection`** - Query current selection state
- **`menus`** - Add items to Notebook Navigator context menus

### Public surface

The supported public surface is the API described in this document and in `src/api/public/notebook-navigator.d.ts`. The
runtime `api` object may contain additional methods and properties; treat them as internal.

### Stability policy

- The documented API and `src/api/public/notebook-navigator.d.ts` are the compatibility contract.
- API version `3.x` is additive-only. New methods, events, and type exports may be added without a major version bump.
- Breaking changes to documented members require a major version bump.
- Undocumented runtime properties may change without notice.

Core methods:

- **`getVersion()`** - Get the API version string
- **`isStorageReady()`** - Check if the initial storage bootstrap is complete
- **`whenReady()`** - Resolve when the initial storage bootstrap completes

## Host API Lifecycle

Long-lived integrations should not retain a provider registration across a TPS Notebook Navigator-only reload. API 2.8.0
publishes two TPS-namespaced workspace events so an owner can tear down the old handle and register against each new API
instance without polling private plugin state:

- `tps:notebook-navigator-api-changed` announces a fully initialized API and announces unavailability before its Rows and
  Types registries are disposed. The immutable payload contains `source`, `sourcePluginId`, `hostInstanceId`, `timestamp`,
  `available`, `pluginVersion`, `apiVersion`, and `api`; unavailable payloads always use `api: null` and `apiVersion: null`.
  `hostInstanceId` is opaque and remains stable for one loaded host, so consumers can ignore a retiring host's late
  unavailable event after a replacement is already active without relying on wall-clock ordering.
- `tps:notebook-navigator-api-request` accepts a `TpsNotebookNavigatorApiRequestPayload`. The host invokes its guarded
  `respond` callback synchronously with the current state, so a late-loading owner receives only its own response rather than
  causing a global change rebroadcast.

Subscribe before requesting to close the load-order race. This reusable pattern automatically reacquires the API and replaces
both Rows and Types registrations after a TPS-only reload:

```typescript
import type {
  NavigatorTypeProvider,
  NavigatorTypeProviderRegistration,
  NotebookNavigatorAPI,
  TpsNotebookNavigatorApiChangedPayload,
  TpsNotebookNavigatorApiRequestPayload
} from './notebook-navigator';

const API_CHANGED = 'tps:notebook-navigator-api-changed';
const API_REQUEST = 'tps:notebook-navigator-api-request';
let currentApi: NotebookNavigatorAPI | null = null;
let currentHostInstanceId: string | null = null;
let typeRegistration: NavigatorTypeProviderRegistration | null = null;

const provider: NavigatorTypeProvider = createMyTypeProvider();
const acceptApi = (state: TpsNotebookNavigatorApiChangedPayload): void => {
  if (state.sourcePluginId !== 'tps-notebook-navigator') {
    return;
  }

  if (!state.available) {
    if (state.hostInstanceId !== currentHostInstanceId) return;
    typeRegistration?.unregister();
    typeRegistration = null;
    currentApi = null;
    currentHostInstanceId = null;
    return;
  }
  if (!state.api || !state.apiVersion?.startsWith('3.')) return;
  if (state.hostInstanceId === currentHostInstanceId && state.api === currentApi) return;

  typeRegistration?.unregister();
  typeRegistration = null;
  currentApi = state.api;
  currentHostInstanceId = state.hostInstanceId;
  typeRegistration = currentApi.types.registerProvider(provider);
};

this.registerEvent(app.workspace.on(API_CHANGED, payload => {
  acceptApi(payload as TpsNotebookNavigatorApiChangedPayload);
}));
app.workspace.trigger(API_REQUEST, {
  sourcePluginId: this.manifest.id,
  timestamp: Date.now(),
  respond: acceptApi
} satisfies TpsNotebookNavigatorApiRequestPayload);
this.register(() => {
  typeRegistration?.unregister();
  typeRegistration = null;
  currentApi = null;
  currentHostInstanceId = null;
});
```

Malformed requests are ignored. Throwing or rejected responders and change listeners are isolated so they cannot interrupt
Navigator startup or shutdown. Lifecycle callbacks and registrations are runtime-only and never enter settings or global
persistence.

## Metadata API

Customize folder, tag, and property node appearance, manage pinned files.

### Runtime Behavior

- **Icon input format**: Setter methods parse the same icon value format Notebook Navigator writes to frontmatter.
  Use `IconString` when you want compile-time validation for short provider-prefixed values such as `ph-folder`,
  `bi-alarm`, `fas-user`, `mi-crop_16_9`, `ra-harpoon-trident`, and `si-github`. Lucide icons use bare slugs such as
  `folder-open`. Emoji icons use bare emoji such as `📁`.
- **Legacy Iconize input**: Setter methods also accept supported legacy Iconize compact IDs such as `LiHome`,
  `PhAppleLogo`, `FasUser`, `MiCrop169`, and `SiGithub`. These values are normalized before saving and are returned in
  frontmatter format, not Iconize format.
- **Icon output format**: `FolderMetadata.icon`, `TagMetadata.icon`, and `PropertyMetadata.icon` use `IconValue`
  because returned values are normalized strings. Supported icons are returned in the same format Notebook Navigator
  writes to frontmatter: Lucide slug (`folder-open`), short provider-prefixed slug (`ph-folder`), or bare emoji (`📁`).
  Supported providers are not returned with colon-separated IDs.
- **Icon normalization**: Icon values are normalized before saving (for example, short provider values are converted to
  the internal render ID, redundant external-provider prefixes like `ph-` and `ra-` are stripped, and `material-icons`
  identifiers are stored as snake case internally).
- **Unsupported providers**: Setter methods ignore values outside the frontmatter icon format and supported legacy
  Iconize compact IDs. Existing unsupported or malformed settings values may be returned unchanged.
- **Color values**: Folder color and background updates use the folder metadata service in normal runtime. The service
  accepts common CSS color formats and named colors; invalid folder color values are ignored. Tag and property color
  values are saved as provided. Invalid tag or property CSS colors will not render correctly but won't throw errors.
- **Tag normalization**: The `getTagMeta()` and `setTagMeta()` methods automatically normalize tags:
  - Both `'work'` and `'#work'` are accepted as input
  - Tags are case-insensitive: `'#Work'` and `'#work'` refer to the same tag
  - Tags are stored internally without the '#' prefix as lowercase paths
- **Property node normalization**: The `getPropertyMeta()` and `setPropertyMeta()` methods normalize property node ids:
  - Both key ids (`'key:Status'`) and key/value ids (`'key:Status=Done'`) are accepted
  - Keys and values are normalized to lowercase
  - Metadata is stored under canonical node ids (`'key:status'`, `'key:status=done'`)

### Folder, Tag, and Property Metadata

| Method                        | Description                          | Returns                  |
| ----------------------------- | ------------------------------------ | ------------------------ |
| `getFolderMeta(folder)`       | Get all folder metadata              | `FolderMetadata \| null` |
| `setFolderMeta(folder, meta)` | Set folder metadata (partial update) | `Promise<void>`          |
| `getTagMeta(tag)`             | Get all tag metadata                 | `TagMetadata \| null`    |
| `setTagMeta(tag, meta)`       | Set tag metadata (partial update)    | `Promise<void>`          |
| `getPropertyMeta(nodeId)`     | Get all property node metadata       | `PropertyMetadata \| null` |
| `setPropertyMeta(nodeId, meta)` | Set property node metadata (partial update) | `Promise<void>`          |

`setFolderMeta()`, `setTagMeta()`, and `setPropertyMeta()` use `FolderMetadataUpdate`,
`TagMetadataUpdate`, and `PropertyMetadataUpdate`.

When `useFrontmatterMetadata` is enabled, `getFolderMeta()` resolves current folder display data through
`MetadataService`. `setFolderMeta()` writes through `metadataService.setFolderStyle(...)` whenever `MetadataService` is
available, so folder updates can write folder-note frontmatter when frontmatter metadata and folder notes are enabled,
or settings otherwise. Folder metadata can therefore reflect folder-note frontmatter, not only the raw settings maps.

#### Property Update Behavior

When using `setFolderMeta`, `setTagMeta`, or `setPropertyMeta`, partial updates follow this pattern:

- **`color: 'red'`** - Sets the color to red
- **`color: null`** - Clears the color (removes the property)
- **`color: undefined`** or property not present - Leaves the color unchanged

This applies to all metadata properties (color, backgroundColor, icon). Only properties explicitly included in the
update object are modified.

### Pinned Files

Notes can be pinned in different contexts - they appear at the top of the file list when viewing folders, tags, or properties.

#### Pin Methods

| Method                     | Description                                         | Returns            |
| -------------------------- | --------------------------------------------------- | ------------------ |
| `pin(file, context?)`      | Pin a file (defaults to 'all' - all contexts)       | `Promise<void>`    |
| `unpin(file, context?)`    | Unpin a file (defaults to 'all' - all contexts)     | `Promise<void>`    |
| `isPinned(file, context?)` | Check if pinned (no context = any, 'all' = all)     | `boolean`          |
| `getPinned()`              | Get all pinned files with their context information | `Readonly<Pinned>` |

#### Understanding Pin Contexts

Pinned notes behave differently depending on the current view:

- **Folder Context**: When viewing folders in the navigator, only notes pinned in the 'folder' context appear at the top
- **Tag Context**: When viewing tags, only notes pinned in the 'tag' context appear at the top
- **Property Context**: When viewing properties, only notes pinned in the 'property' context appear at the top
- **Multiple Contexts**: A note can be pinned in multiple contexts and appears at the top in each matching view
- **Default Behavior**: Pin/unpin operations default to 'all' (folder, tag, and property contexts)

This supports separate pinned sets for folder, tag, and property views.

```typescript
// Set folder appearance
const folder = app.vault.getFolderByPath('Projects');
if (folder) {
  await nn.metadata.setFolderMeta(folder, {
    color: '#FF5733', // Hex, or 'red', 'rgb(255, 87, 51)', 'hsl(9, 100%, 60%)'
    backgroundColor: '#FFF3E0', // Light background color
    icon: 'folder-open'
  });

  // Update only specific properties (other properties unchanged)
  await nn.metadata.setFolderMeta(folder, { color: 'blue' });
}

// Pin a file
const file = app.workspace.getActiveFile();
if (file) {
  await nn.metadata.pin(file); // Pins in folder, tag, and property contexts by default

  // Or pin in specific context
  await nn.metadata.pin(file, 'folder');

  // Check if pinned
  if (nn.metadata.isPinned(file, 'folder')) {
    console.log('Pinned in folder context');
  }
}

// Get all pinned files with context info
const pinned = nn.metadata.getPinned();
// Returns: Map<string, { folder: boolean, tag: boolean, property: boolean }>
// Example: Map { "Notes/todo.md" => { folder: true, tag: false, property: true }, ... }

// Iterate over pinned files
for (const [path, context] of pinned) {
  if (context.folder) {
    console.log(`${path} is pinned in folder view`);
  }
}
```

## Navigation API

| Method                     | Description                            | Returns         |
| -------------------------- | -------------------------------------- | --------------- |
| `reveal(file)`             | Reveal and select file in navigator    | `Promise<boolean>` |
| `navigateToFolder(folder)` | Select a folder in the navigation pane | `Promise<boolean>` |
| `navigateToTag(tag)`       | Select a tag in the navigation pane    | `Promise<boolean>` |
| `navigateToProperty(nodeId)` | Select a property node in navigation | `Promise<boolean>` |
| `navigateToType(typeId)` | Select a discovered Type collection | `Promise<boolean>` |
| `focusRow(target)` | Focus one exact row already rendered in the current scope | `Promise<boolean>` |

### Reveal Behavior

When calling `reveal(file)`:

- **Accepts either a `TFile` or a file path string**
- **Opens the Notebook Navigator view** if it is not already open
- **Switches to the file's parent folder** in the navigation pane
- **Expands parent folders** as needed to make the folder visible
- **Selects and focuses the file** in the file list
- **Switches to file list view** if in single-pane mode
- **Returns `false`** if the file path cannot be resolved
- **Returns `false`** if the navigator view cannot be opened or does not become ready
- **Returns `false`** if the file is hidden while Show hidden items is off
- **Keeps the current folder, tag, or property context** when a hidden file cannot be revealed
- **May still select the file as fallback** when a hidden file cannot be revealed

```typescript
// Navigate to active file
const activeFile = app.workspace.getActiveFile();
if (activeFile) {
  await nn.navigation.reveal(activeFile);
  // File is selected in its parent folder when reveal succeeds
}
```

### Folder Navigation Behavior

When calling `navigateToFolder(folder)`:

- Opens the Notebook Navigator view if it is not already open
- Selects the folder in the navigation pane
- Expands parent folders to make the folder visible
- Preserves navigation focus in single-pane mode
- Accepts either a `TFolder` or a folder path string
- Returns `false` if the folder path cannot be resolved
- Returns `false` if the navigator view cannot be opened or does not become ready

### Tag Navigation Behavior

When calling `navigateToTag(tag)`:

- Accepts `'work'`, `'#work'`, and aggregate tag collection ids from `nn.tagCollections`
- `allId` selects the visible all-note **Tags** root; `taggedId` retains the tagged-only compatibility scope used by existing shortcuts and does not correspond to a separate tree row
- Requires tag data to be available (`storage-ready`)
- Expands the tags root when "All tags" is enabled and collapsed
- Expands parent tags for hierarchical tags (e.g. `'parent/child'`)
- Preserves navigation focus in single-pane mode
- Returns `false` if a real tag is not present in the current tag tree
- Returns `false` if the navigator view cannot be opened or does not become ready

### Property Navigation Behavior

When calling `navigateToProperty(nodeId)`:

- Accepts `nn.propertyNodes.rootId`, property key ids, and key/value node ids (e.g. `'key:status'`, `'key:status=done'`)
- Normalizes node ids to canonical lowercase form before selection
- Expands the properties root when "All properties" is enabled and collapsed
- Expands the parent key node for key/value selections when needed
- Preserves navigation focus in single-pane mode
- Returns `false` if a key or key/value target is not present in the current property tree
- Returns `false` if the navigator view cannot be opened or does not become ready

```typescript
// Wait for storage if needed, then navigate
await nn.whenReady();

await nn.navigation.navigateToTag('#work');
await nn.navigation.navigateToProperty('key:status=done');
```

### Type Navigation Behavior

When calling `navigateToType(typeId)`:

- Use a descriptor id returned by `nn.types.getSnapshot()` or a stable helper such as `nn.types.checkboxesId`.
- Opens and waits for the TPS Navigator view, expands the **Types** ancestor, records ordinary navigation history, requests
  the selected row into view, and preserves navigation focus.
- Returns `false` when Types are disabled, the id is malformed, the view cannot mount, or a complete `ready` catalog proves
  the collection no longer exists.
- A syntactically valid fixed or provider id remains provisional while its relevant source is not authoritative, so transient
  startup or provider failure cannot destroy restored navigation state. Await `nn.types.whenReady()` when the caller needs a
  non-loading aggregate state first; provider-specific consumers should subscribe until their descriptor appears.
- Legacy `kind:` ids remain syntax-compatible only long enough to discard or replace stale state safely. Kind descriptors are
  not emitted or navigable once the built-in catalog is authoritative.

```typescript
const catalog = await nn.types.whenReady();
if (catalog.availability === 'ready') {
  const bases = catalog.descriptors.find(descriptor => descriptor.id === nn.types.basesId);
  if (bases) {
    await nn.navigation.navigateToType(bases.id);
  }
}
```

### Provider Row Focus Behavior

`focusRow(target)` accepts a source-backed `NavigatorRowFocusTarget` with required `providerId`, `rowId`, and `sourcePath`.
Optional `sourceLineNumber`, `typeId`, and `kind` values act as stale-reference guards. The method opens and waits for the
TPS Navigator view, but it does not select a folder, tag, property, or Type and does not invoke the row's `activate`
callback. It returns `false` when the target is malformed, its source no longer exists, its provider or row is absent, its
optional guards no longer match, or filtering means the exact row is not currently rendered.

```typescript
const row = nn.selection.getCurrentRow();
if (row) {
  await nn.navigation.focusRow({
    providerId: row.providerId,
    rowId: row.rowId,
    sourcePath: row.sourcePath,
    sourceLineNumber: row.sourceLineNumber,
    typeId: row.typeId,
    kind: row.kind
  });
}
```

## Tag Collections API

Helpers for aggregate tag collection scopes used by tag menus and navigation. The all-notes collection is the visible Tags root; the tagged-only compatibility collection remains addressable without rendering a separate tree row.

| Method | Description | Returns |
| ------ | ----------- | ------- |
| `allId` | Collection id for every visible Markdown note and the visible Tags root | `'__all_tags__'` |
| `taggedId` | Tagged-only compatibility collection id; saved shortcuts remain supported, but it is not a separate tree row | `'__tagged__'` |
| `untaggedId` | Collection id for notes without tags | `'__untagged__'` |
| `isCollection(tag)` | Check whether a tag target is an aggregate collection id | `boolean` |
| `getLabel(tag)` | Current localized label for an aggregate collection id | `string` |

```typescript
nn.menus.registerTagMenu(({ tag, addItem }) => {
  if (!nn.tagCollections.isCollection(tag)) {
    return;
  }

  addItem(item => {
    item.setTitle(`Handle ${nn.tagCollections.getLabel(tag)}`);
  });
});
```

## Property Nodes API

Helpers for building and parsing canonical property node ids.

| Method | Description | Returns |
| ------ | ----------- | ------- |
| `rootId` | Property root node id | `'properties-root'` |
| `buildKey(key)` | Build a canonical key node id | `string \| null` |
| `buildValue(key, valuePath)` | Build a canonical key/value node id | `string \| null` |
| `parse(nodeId)` | Parse a property node id | `PropertyNodeParts \| null` |
| `normalize(nodeId)` | Normalize a property node id | `string \| null` |

```typescript
const statusKey = nn.propertyNodes.buildKey('Status');
const doneValue = nn.propertyNodes.buildValue('Status', 'Done');
const parsed = nn.propertyNodes.parse('key:Status=Done');
const root = nn.propertyNodes.parse(nn.propertyNodes.rootId);
```

## Types Catalog API

The Types catalog is the provider-neutral view of the fixed flat file and Markdown-structure collections plus every externally
registered collection shown in the navigation pane. Kind is frontmatter metadata, so the catalog does not emit or navigate
Kind descriptors. Reading the catalog does not expose GCM records, task payloads, note paths, internal maps, or ambiguous
pre-visibility counts. `registerProvider(...)` lets an integration establish a new top-level Type scope and reuse the
Navigator's guarded row renderer.

The API catalog remains canonical regardless of the user's navigation presentation. **Reorder navigation** can display
Types in Default, A–Z, Z–A, Most items, Fewest items, or Manual order, but `getSnapshot()`, `subscribe()`, and `whenReady()`
continue to return the provider-neutral catalog sequence. Quantity sorting uses internal visibility-filtered counts that the
public descriptors intentionally omit, and `navigation.navigateToType(typeId)` addresses the stable id rather than a display
position.

| Member | Description | Returns |
| ------ | ----------- | ------- |
| `notesId` | Stable Notes collection id | `'entity:note'` |
| `checkboxesId` | Stable Checkboxes collection id | `'structural:task'` |
| `bulletsId` | Stable Bullets collection id | `'structural:bullet'` |
| `headingsId` | Stable Headings collection id | `'structural:heading'` |
| `codeBlocksId` | Stable Code blocks collection id | `'structural:code-block'` |
| `calloutsId` | Stable Callouts collection id | `'structural:callout'` |
| `blockquotesId` | Stable Blockquotes collection id | `'structural:blockquote'` |
| `tablesId` | Stable Tables collection id | `'structural:table'` |
| `webLinksId` | Stable Web links collection id | `'structural:web-link'` |
| `basesId` | Stable Bases collection id | `'file:base'` |
| `canvasId` | Stable Canvas collection id | `'file:canvas'` |
| `drawingsId` | Stable Drawings collection id | `'file:drawing'` |
| `pdfsId` | Stable PDFs collection id | `'file:pdf'` |
| `imagesId` | Stable Images collection id | `'file:image'` |
| `audioId` | Stable Audio collection id | `'file:audio'` |
| `videoId` | Stable Video collection id | `'file:video'` |
| `buildKind(kind)` | **Deprecated.** Build a stale Kind id for legacy-state compatibility only | `string \| null` |
| `parseKind(typeId)` | **Deprecated.** Parse a stale Kind id for legacy-state compatibility only | `string \| null` |
| `isType(value)` | Validate a fixed or canonical provider Type id; legacy Kind syntax returns `false` | `boolean` |
| `registerProvider(provider, options?)` | Register top-level Type collections and their rows | `NavigatorTypeProviderRegistration` |
| `getSnapshot()` | Read the latest immutable catalog state | `NavigatorTypesSnapshot` |
| `subscribe(listener)` | Receive the current state immediately and subsequent changes | `() => void` |
| `whenReady()` | Wait for any non-loading success or guarded failure state | `Promise<NavigatorTypesSnapshot>` |

The canonical built-in catalog order is Notes, Checkboxes, Bullets, Headings, Code blocks, Callouts, Blockquotes, Tables,
Web links, Bases, Canvas, Drawings, PDFs, Images, Audio, and Video. Registered provider descriptors follow the built-ins in registry
order. A customized navigation order is a display-only projection and does not rewrite this sequence. Notes, Bases, Canvas,
Drawings, PDFs, Images, Audio, and Video are file-backed; Checkboxes, Bullets, and Headings are GCM exact-line collections;
Code blocks, Callouts, Blockquotes, and Tables are Navigator-owned cached-range collections built from Obsidian's root-level
Markdown section metadata. Web links are a Navigator-owned source-range collection built by scanning local Markdown bodies
for authored HTTP(S) Markdown links, angle autolinks, and bare URLs. Obsidian's `CachedMetadata.links` is not used for this
collection because it does not publish external URLs.

Availability is `disabled`, `loading`, `ready`, `unavailable`, or `error`. File-backed and cached-range built-ins keep the
aggregate catalog ready without TPS Global Context Menu; GCM availability governs only Checkboxes, Bullets, and Headings.
Readiness is source- and provider-isolated, so
one failing external provider cannot remove other collections. `subscribe()` shares source subscriptions and returns an
idempotent disposer. Snapshots, descriptor arrays, and descriptors are frozen; `getSnapshot()` returns the same object while
its sources are unchanged. Plugin unload resolves pending readiness waits with `unavailable` and closes every provider
subscription. Deprecated `parseKind(...)` can recognize legacy syntax, but `isType(...)` returns `false` and that id is
never discoverable, restorable, or navigable.

Code blocks, Callouts, Blockquotes, and Tables are a strict whitelist over Obsidian's root-level
`CachedMetadata.sections` and require no body reads. Web links use a bounded local scan with at most four concurrent reads,
the shared 2 MB mobile / 8 MB desktop Markdown read limit, a 10,000-record per-file guard, and an mtime-plus-size cache that
avoids rereading unchanged files. File-backed Types publish before this scan completes, and optional GCM exact-line loading
runs concurrently with it. The first metadata `resolved` barrier performs one full bounded rebuild; `changed`, `rename`, and
`delete` then update individual paths. A non-string `changed` payload and a transient read failure preserve the
last known links; an oversized body fails closed without a read. Excalidraw Markdown, YAML frontmatter, HTML comments,
Obsidian `%%` comments and hidden TPS carriers, fenced and inline code, indented code, Markdown image syntax, vault links,
and non-HTTP(S) targets are excluded. No discovered target is requested.

All Navigator-owned structure rows are searchable by their owning-note/line label and source path, selectable with the
transient row cursor, and guarded on activation against their current source. Web-link rows additionally display and search
only the sanitized URL origin (`scheme://host`), open the owning note at the exact rescanned line and column, and omit URL
credentials, path, query, and fragment data from labels, search text, locators, and diagnostic row ids. They do not navigate
to or fetch the external target.
These rows are not `TFile` rows and therefore do not initially support file drag,
multi-select, pinning, rename, or persistent selection.

All eight fixed source-backed Types—Checkboxes, Bullets, Headings, Code blocks, Callouts, Blockquotes, Tables, and Web links—support
host-owned Sort and Group controls. Sort can use the row title or the owning note's filename, configured created/modified
timestamp, or a configured non-manual property. GCM task, bullet, and heading rows resolve their exact line fields first,
including `scheduled` and canonical task `status`, and fall back to owning-note frontmatter only when the line field is absent. Missing
values stay last in both sort directions, and missing-value groups stay last. Date grouping is available only with a date
sort. Historical `property:<key>` / `property-desc:<key>` grouping remains note-frontmatter-only; its
`property-day:<key>` / `property-day-desc:<key>` forms bucket that note value by local calendar day. Each property, day,
and line variant also accepts a `-follow` form that orders groups with the active sort direction. Source-backed views can
instead select line-only grouping for GCM Checkboxes, Bullets, and Headings—or their sections in an active mixed search—with
`line-property:<key>` / `line-property-desc:<key>` or calendar-day `line-property-day:<key>` /
`line-property-day-desc:<key>`; append `-follow` to either prefix when group order should follow the active sort. Line-only grouping never falls back to the owning note, so an absent or blank inline field
lands in No value; Navigator-owned ranges have no inline-property contract and also remain in No value. Native file rows
always group from frontmatter. `none` is the explicit ungrouped presentation. `custom` also renders source-backed rows flat
because custom-header ownership is file-based. Manual sort, folder/manual grouping, and display-mode/appearance editing remain unsupported.
External provider Types keep their existing provider-owned presentation.

Internal Filter Search accepts canonical `type:<fixed-id>` and `-type:<fixed-id>` facets, for example
`type:structural:task` and `-type:structural:heading`. Multiple positive Types are always OR; that Type dimension is ANDed
with all other search facets. Any nonempty internal query started from a fixed Type lifts that Type scope and searches the
complete fixed catalog; search from folders, tags, and properties keeps that navigation scope. Native files remain ordinary
rows and matching source-backed Types appear in labeled sections. Plain text matches the row label or source path, not note
contents, while tag, property, date, folder, and extension terms apply to the owning note rather than block-local metadata.
Shift-click or the configured multi-select modifier adds a tag, property, or fixed Type with AND; the configured modifier
plus Shift adds a tag or property with OR. Multiple Types remain an OR union regardless of the navigation gesture.

The visibility-derived vault allowlist is computed only for a Type scope or nonempty internal search. Aggregation then uses
the cached GCM entity, Obsidian metadata, and bounded Web-link indexes without starting fresh body reads for each query.

```typescript
const stop = nn.types.subscribe(snapshot => {
  if (snapshot.availability !== 'ready') {
    return;
  }
  console.table(snapshot.descriptors.map(({ id, label, category }) => ({ id, label, category })));
});

await nn.navigation.navigateToType(nn.types.checkboxesId);
// Later, for example during your plugin unload:
stop();
```

### Registering a top-level Type provider

A Type provider owns both its collection catalog and the rows that establish each collection's scope. Provider ids use
`vendor/name`; collection ids are provider-local lowercase slugs. TPS Notebook Navigator creates collision-free opaque ids
such as `provider:example%2Frelations:projects`. External collections appear directly beneath **Types**, omit navigation
counts, and remain independent from GCM availability. Their public descriptor keeps `category: 'structure'` for flat root
placement and identifies its true owner through `providerId` and `providerCollectionId`.

```typescript
import type { NavigatorTypeProvider, NotebookNavigatorAPI } from './notebook-navigator';

const nn = app.plugins.plugins['tps-notebook-navigator']?.api as NotebookNavigatorAPI | undefined;
if (!nn) {
  return;
}

const provider: NavigatorTypeProvider = {
  id: 'example/relations',
  getCollections: () => [
    { id: 'projects', label: 'Projects', icon: 'lucide-folder-kanban' },
    { id: 'contexts', label: 'Contexts', icon: 'lucide-at-sign' }
  ],
  async getRows(collectionId, { app, searchQuery, allowedVaultFilePaths, signal }) {
    const allowed = new Set(allowedVaultFilePaths);
    const entities = await loadExampleEntities(collectionId, { signal });
    const query = searchQuery.trim().toLocaleLowerCase();

    return entities
      .filter(entity => allowed.has(entity.sourcePath))
      .filter(entity => !query || entity.label.toLocaleLowerCase().includes(query))
      .map(entity => ({
        id: entity.id,
        kind: `example/${collectionId}`,
        label: entity.label,
        secondaryLabel: entity.sourcePath,
        sourcePath: entity.sourcePath,
        sourceLineNumber: entity.sourceLineNumber,
        activate: () => openExampleEntity(app, entity),
        contextMenu: context => addExampleActions(context, entity)
      }));
  },
  subscribe(_context, _options, invalidate) {
    return exampleIndex.subscribe(invalidate);
  }
};

const registration = nn.types.registerProvider(provider, { includeArchived: false });
const projectsTypeId = registration.getTypeId('projects');
if (projectsTypeId) {
  await nn.navigation.navigateToType(projectsTypeId);
}

// Replace options and refresh the provider without changing its order.
registration.updateOptions({ includeArchived: true });

// Call during the owning plugin's unload path. It is idempotent.
registration.unregister();
```

Provider safeguards:

- Catalog and row queries receive an `AbortSignal` and have a five-second host timeout. Late results after options changes,
  unregistration, or unload are ignored.
- Catalog refreshes are atomic. Duplicate or malformed collection definitions leave the provider's last good catalog intact.
- `allowedVaultFilePaths` is the exact allowlist of visible vault-file paths after active-profile and hidden-item filtering.
  It may include Markdown notes, Bases, canvases, PDFs, drawings, images, audio, video, and other visible vault files. Returned
  rows outside it are discarded by the host, as are malformed and duplicate provider-local row ids.
- `searchQuery` is supplied to the owning provider so it can search before the global 1,000-row safety ceiling.
- Row `activate`, checkbox `indicator`, and `contextMenu` callbacks use the same renderer and safety boundaries as Rows API
  contributions.
- Provider definitions, callbacks, options, and registration order are runtime-only. TPS Notebook Navigator never persists
  them to `data.json`.
- Registrations belong to the current host API instance. Use the [Host API Lifecycle](#host-api-lifecycle) subscription and
  point-to-point request pattern to replace handles automatically after a TPS-only hot reload.
- A provider invalidation refreshes both its catalog and rows. A later failure retains the last valid catalog; an explicit
  unregister removes its collections immediately.

## Rows API

Register transient records that render directly beneath their owning Markdown notes. Registration activates the provider immediately in every open TPS navigator view and returns an idempotent handle.

| Method | Description | Returns |
| ------ | ----------- | ------- |
| `registerProvider(provider, options?)` | Register and activate one namespaced row provider | `NavigatorRowProviderRegistration` |
| `registration.updateOptions(options)` | Replace that provider's immutable option snapshot and refresh open views | `void` |
| `registration.unregister()` | Disable and unregister the provider; safe to call repeatedly | `void` |

Provider requirements and safeguards:

- `provider.id` uses `vendor/name` form and must be unique.
- `sourcePath` must exactly match a path in `context.scope.visibleFilePaths`; orphan rows are discarded. Ordinary
  folder/tag/property scopes contain Markdown paths, while a fixed file-backed Type scope can contain any supported visible
  vault-file path.
- Row IDs are provider-local. Rows have one transient cursor but never enter `TFile` selection, multi-select, drag, rename,
  persistence, or file indexes.
- `activate` may open or focus the provider-owned record.
- A checkbox `indicator.onChange(checked)` is optional. Without it, the checkbox is explicitly display-only.
- `indicator.marker` preserves the provider's source marker verbatim. Non-binary states such as `/` or `>` remain visible and are included in the checkbox's accessible state label; omitting it uses the normal blank/check fallback.
- `contextMenu(context)` may synchronously add row actions and separators. It receives an immutable provider/row identity plus guarded `addItem(...)` and `addSeparator()` functions, never the host `Menu` object.
- Row actions open from right-click, the native mobile long-press `contextmenu` event, or the accessible **More actions** button. Empty, throwing, and Promise-returning builders do not open a menu.
- A provider can subscribe to its own data source and call `invalidate()` when rows need to be queried again.
- Every `getRows` invocation receives its own `signal`. Check it before expensive work and after each awaited batch. TPS
  aborts it when the scope, search-derived paths, selection, provider revision, or options are superseded; when the provider
  unregisters; at the five-second timeout; and when the view or plugin unloads. Supersession is silent and late results are
  ignored, while a timeout remains an isolated provider failure.
- `subscribe` deliberately receives the signal-free `NavigatorRowProviderContext`; its returned cleanup owns that longer
  lifecycle. Calling `invalidate()` aborts the current query before the replacement revision begins.
- Set `supportsTypeScope: true` to opt in when a standalone Type collection is selected. The scope then reports `selectionType: 'type'`, its opaque `selectedType`, and the deduplicated visible source paths represented by the searched native Type rows. Providers without the flag are never subscribed or queried in Type scope.
- Provider failures, malformed results, timeouts, and oversized result sets are isolated from the ordinary file list. Each
  provider receives an independent signal, so one timeout never aborts a healthy sibling.

```typescript
import type { NotebookNavigatorAPI, NavigatorRowProvider } from './notebook-navigator';

const nn = app.plugins.plugins['tps-notebook-navigator']?.api as NotebookNavigatorAPI | undefined;
if (!nn) {
  return;
}

const provider: NavigatorRowProvider = {
  id: 'example/tasks',
  supportsTypeScope: true,
  async getRows({ scope, signal }) {
    if (signal.aborted) {
      return [];
    }
    return scope.visibleFilePaths.map(path => ({
      id: `${path}:review`,
      kind: 'example/task',
      label: 'Review note',
      sourcePath: path,
      indicator: {
        type: 'checkbox',
        checked: false,
        onChange: async checked => {
          await updateExampleTask(path, checked);
        }
      },
      activate: async () => {
        await openExampleTask(path);
      },
      contextMenu({ providerId, rowId, sourcePath, addItem, addSeparator }) {
        addItem(item => {
          item.setTitle('Open provider record').onClick(() => {
            void openProviderRecord({ providerId, rowId, sourcePath });
          });
        });
        addSeparator();
        addItem(item => item.setTitle('Inspect source').onClick(() => void inspectSource(sourcePath)));
      }
    }));
  }
};

const registration = nn.rows.registerProvider(provider, { limit: 5 });
this.register(() => registration.unregister());
```

## List API

The `list` namespace is a bounded, pull-based view contract. It always targets the first currently mounted TPS Notebook
Navigator leaf. It never opens a view; all three methods return `null` or `false` when no compatible view is mounted, while
the view is not ready, or when that primary leaf changes during the readiness wait.

```typescript
const snapshot = await nn.list.getSnapshot();
if (snapshot) {
  for (const row of snapshot.rows) {
    console.log(row.type === 'file' ? row.path : `${row.typeId ?? 'attached'}:${row.providerId}:${row.rowId}`);
  }
}

await nn.list.setSearch({ query: 'status:working', provider: 'internal' });
await nn.list.setPresentation({
  sort: { option: 'property-asc', propertyKey: 'priority' },
  groupBy: 'property:status',
  displayMode: 'compact'
});
```

`getSnapshot()` returns the current navigation item, immediate and applied search strings, requested and effective search
providers, effective sort/group/display state, and the renderable file/provider row order after scope, search, and
collapsed-group filtering. Headers and spacers are omitted. Fixed file-backed Types return their native file-list
presentation; fixed source-backed Types return their effective supported sort/group presentation; external provider Type
collections return `presentation: null` because their owner controls row order. Every provider row exposes `typeId`: mixed
structural search results carry their own fixed Type id, a row inside one selected Type carries that selected/owning Type,
and an ordinary row attached beneath a note uses `null`. The snapshot, nested DTOs, and row array are frozen; referenced
`TFile`/`TFolder` instances are native Obsidian objects and can become stale. Re-resolve `sourcePath` immediately before a
mutation. Provider rows expose identity and presentation only—activation, checkbox mutation, context-menu builders,
tooltips, and provider records are never returned. A provider loading/error placeholder can have `file: null`.

`setSearch(update)` applies the query immediately rather than waiting for keyboard debounce. `query` or `focus: true`
activates search; `null` or `{ active: false }` clears and closes it. Contradictory input such as an inactive non-empty query
fails closed. Omnisearch can be requested, while the next snapshot's `effectiveProvider` reports whether it actually
produced the current rows. When the effective provider is `internal`, a nonempty query started from a fixed Type searches all
fixed Types and appends the matching source-backed sections described above. Omnisearch retains its own ranked file-only
result contract.

`setPresentation(update)` validates every supplied field before one settings transaction. It works for folder, tag,
property, and every fixed built-in Type scope. Fixed source-backed Types accept title, filename, configured created/modified,
and configured non-manual property sort plus compatible date/property/ungrouped (`none`) grouping. `groupBy: 'custom'`
continues to select manual frontmatter group headers, while `groupBy: 'tags'`
groups note files by their visible tags and keeps notes without a visible tag in a separate group. Property grouping may
request owning-note values with `property:` / `property-desc:` and `property-day:` / `property-day-desc:`; each also has a
`-follow` form that tracks sort direction. Line-only `line-property:` / `line-property-desc:` and `line-property-day:` /
`line-property-day-desc:` forms likewise accept `-follow` and are accepted on folder,
tag, property, file-backed Type, and GCM line-Type targets so the same saved presentation can govern their active mixed
structural searches. Standalone Navigator-owned range Types reject line-only grouping because they have no inline-property
contract. A property grouping key must normally be configured; the selected key itself is also valid when the target is a
top-level property-key scope. Fixed source-backed Types reject display mode, manual sort, and
folder/manual grouping. External provider Type and none scopes remain unsupported. All scopes reject the manual-rank
property, unconfigured property sort/group keys, and an explicitly requested date grouping with a non-date sort. Each
`null` field removes only that per-scope override and inherits the current default. Values equal to inherited defaults are
normalized away, unrelated appearance fields are preserved, and any invalid field rejects the whole request without a
partial write. There is no list subscription: integrations pull snapshots when they need them so large provider
collections are not cloned continuously.

The aggregate `nn.tagCollections.allId` scope inherits `tags` grouping. A top-level property-key scope inherits
`property-follow:<selected-key>` grouping, so its group order follows the active sort direction. Passing those inherited
values clears a redundant override; passing another valid grouping stores an explicit override for that scope.

The presentation snapshot keeps its stable three-field shape. For a source-backed Type, `displayMode` reports the inherited
default for compatibility, but source rows use their fixed native presentation and `setPresentation({ displayMode: ... })`
is rejected.

## Selection API

Query the current selection state in the navigator.

`getNavItem()`, `getCurrent()`, and `getCurrentRow()` return the navigator's most recently known state. Navigation and file
selection are restored from localStorage on startup; row selection is deliberately transient and starts as `null` after a
reload.

When `navItem.type === 'tag'`, `navItem.tag` can be either a canonical tag path or an aggregate tag collection id
(`'__all_tags__'`, `'__tagged__'`, or `'__untagged__'`).

When `navItem.type === 'type'`, `navItem.navigatorType` is a fixed file or structural id such as `entity:note`,
`structural:task`, `structural:code-block`, or `file:pdf`, or a canonical id for an externally registered provider collection. Current snapshots emit
no Kind descriptors, Type menus never invoke for Kind, and navigation does not select Kind ids. Stale legacy `kind:`
selections are rejected immediately and replaced safely. Existing NavItem variants do not gain extra fields.

| Method            | Description                                                | Returns                         |
| ----------------- | ---------------------------------------------------------- | ------------------------------- |
| `getNavItem()`    | Get selected folder, tag, property, or TPS type             | `NavItem`                       |
| `getCurrent()`    | Get current native file selection state                     | `SelectionState`                |
| `getCurrentRow()` | Get the immutable selected row, or `null` when none exists  | `NavigatorRowSelection \| null` |

```typescript
// Check what's selected
const navItem = nn.selection.getNavItem();
if (navItem.type === 'folder') {
  console.log('Folder selected:', navItem.folder.path);
} else if (navItem.type === 'tag') {
  console.log('Tag selected:', navItem.tag);
} else if (navItem.type === 'property') {
  console.log('Property selected:', navItem.property);
} else if (navItem.type === 'type') {
  console.log('TPS type selected:', navItem.navigatorType);
} else {
  console.log('Nothing selected in navigation pane');
}

// Get selected files
const { files, focused } = nn.selection.getCurrent();

// Row and native file selection are mutually exclusive.
const row = nn.selection.getCurrentRow();
```

## Menus API

Register callbacks that add items to Notebook Navigator's file, folder, tag, property, selectable Type collection, and
source-backed row context menus.

File and folder menu hooks are available in API version 1.2.0. Tag and property menu hooks are available in API version 2.0.0.
Type collection menu hooks are available in API version 2.9.0. Transient and Type-result row hooks are available in API
version 2.10.0.

| Method                           | Description                                  | Returns      |
| -------------------------------- | -------------------------------------------- | ------------ |
| `registerFileMenu(callback)`     | Add items to the file context menu           | `() => void` |
| `registerFolderMenu(callback)`   | Add items to the folder context menu         | `() => void` |
| `registerTagMenu(callback)`      | Add items to the tag context menu            | `() => void` |
| `registerPropertyMenu(callback)` | Add items to the property context menu       | `() => void` |
| `registerTypeMenu(callback)`     | Add items to a Type collection context menu  | `() => void` |
| `registerRowMenu(callback, options?)` | Add actions to matching result rows     | `() => void` |

Callbacks run synchronously during menu construction. Each `addItem(...)` initializer runs immediately, exactly once, with
the real Obsidian `MenuItem` before `addItem(...)` returns; this preserves native submenu and object-identity behavior. Add
menu items synchronously and do async work in `onClick` handlers. Registering the same callback more than once creates
independent registrations, and each returned disposer removes only its own registration.

File, folder, tag, and property actions are composed into a menu that also contains Navigator-owned actions. If a builder
returns a Promise after synchronously adding an item, that already-committed native item remains in the composed menu and is
included in separator placement; the contract violation is logged, rejection is observed, and later additions are ignored.
Obsidian exposes no supported removal API for a committed `MenuItem`, so integrations must keep both the builder and item
initializer synchronous. This differs from the extension-only Type menu policy below, where TPS can suppress the complete
attempt.

### File context menu

The file callback receives the clicked file and the effective selection for this menu:

- `context.addItem(...)` - Add a menu item
- `context.file` - The file the menu was opened on
- `context.selection.mode` - `'multiple'` when multiple files are selected and the menu was opened on a selected file
- `context.selection.files` - Snapshot of files for this menu (`'single'` uses `[file]`)

Single selection example:

```typescript
import type { NotebookNavigatorAPI } from './notebook-navigator';

const nn = app.plugins.plugins['tps-notebook-navigator']?.api as Partial<NotebookNavigatorAPI> | undefined;

const dispose = nn?.menus?.registerFileMenu(({ addItem, file, selection }) => {
  if (selection.mode !== 'single') {
    return;
  }

  if (file.extension !== 'md') {
    return;
  }

  addItem(item => {
    item.setTitle('My action').setIcon('lucide-wand').onClick(() => {
      console.log('Clicked', file.path);
    });
  });
});

// If dispose is defined, call dispose() when your plugin unloads
```

Multiple selection example:

```typescript
const dispose = nn?.menus?.registerFileMenu(({ addItem, selection }) => {
  if (selection.mode !== 'multiple') {
    return;
  }

  addItem(item => {
    item.setTitle('My batch action').setIcon('lucide-list-check').onClick(() => {
      console.log('Selected files', selection.files.map(f => f.path));
    });
  });
});
```

### Folder context menu

The folder callback receives:

- `context.addItem(...)` - Add a menu item
- `context.folder` - The folder the menu was opened on

```typescript
const dispose = nn?.menus?.registerFolderMenu(({ addItem, folder }) => {
  addItem(item => {
    item.setTitle('My folder action').setIcon('lucide-folder').onClick(() => {
      console.log('Folder', folder.path);
    });
  });
});
```

### Tag and property context menus

- `registerTagMenu(callback)` receives `context.tag`
- Use `nn.tagCollections.isCollection(context.tag)` to detect aggregate collection scopes
- `registerPropertyMenu(callback)` receives `context.nodeId`

### Type collection context menu

`registerTypeMenu(callback)` applies to every selectable collection beneath **Types**: Notes, Checkboxes, Bullets, Headings,
Code blocks, Callouts, Blockquotes, Tables, Web links, Bases, Canvas, Drawings, PDFs, Images, Audio, Video, and collections registered by an external Type provider. The **Types**
root is a container rather than a collection and does not invoke this hook. No Kind collection is emitted.

The callback receives a frozen context with:

- `context.addItem(...)` - Add a menu item synchronously during this menu build
- `context.typeId` - The opaque id of the selected collection
- `context.descriptor` - A current immutable catalog descriptor containing `id`, `label`, `icon`, `category`, and optional
  `providerId` and `providerCollectionId` ownership fields

```typescript
const dispose = nn?.menus?.registerTypeMenu(({ addItem, typeId, descriptor }) => {
  addItem(item => {
    item.setTitle(`Open ${descriptor.label}`).setIcon(descriptor.icon).onClick(async () => {
      // The navigation helper revalidates the opaque id when the action runs.
      await nn.navigation.navigateToType(typeId);
    });
  });
});

// Call dispose() during the owning plugin's unload path. It is idempotent.
```

The registration callback and `addItem(...)` calls must remain synchronous. Returning a Promise is treated as an invalid
builder; place asynchronous work inside `onClick` instead. TPS resolves the descriptor from the latest catalog snapshot when
the menu is requested. If the collection has already disappeared, no callback runs. If the registered builders add no
synchronous item, TPS does not consume the context-menu event or open a blank menu. Because this menu contains only extension
actions, a Promise-returning builder, a builder that throws after committing a partial item, or a failed/Promise-returning
item initializer invalidates the complete attempted menu: the event remains unconsumed and no partial surface is shown. A
builder that throws before adding anything is isolated so other healthy actions can still open. Rejected Promises are always
observed, and additions attempted after synchronous construction are ignored. The descriptor is a menu-build snapshot, so an
action that depends on continued existence should revalidate `typeId` when clicked.

Type menu registrations are runtime-only. They do not add a setting, write `data.json`, persist callback state, or require a
settings migration.

### Result row context menu

`registerRowMenu(callback, options?)` applies to source-backed transient rows wherever they render: beneath a native file in
a normal or file-backed Type list, in the Checkboxes, Bullets, Headings, Code blocks, Callouts, Blockquotes, Tables, and Web links collections, and in collections or
augmenting rows registered by another provider. Loading/error placeholders and rows whose source file no longer exists fail
closed.

The callback receives a frozen context with guarded `addItem(...)` and `addSeparator()` functions plus an immutable
`target` snapshot:

- `providerId`, `rowId`, and `kind` identify the row owner and its provider-local record
- `label`, `file`, and `sourcePath` describe the current exact source file
- `sourceLineNumber` is the optional zero-based rendered-row location
- `typeId` is the opaque selected collection id, or `null` when the row is attached beneath a note
- `checkbox` is either `null` or the immutable `{ checked, marker? }` state currently presented to the user, including an
  optimistic checkbox change that is still awaiting its provider refresh

`sourceLineNumber` can become stale after an edit. An action that writes line content must use its owning plugin's current
locator/index to re-resolve the record when clicked rather than treating the rendered line number as a mutation key.

```typescript
const dispose = nn?.menus?.registerRowMenu(
  ({ addItem, target }) => {
    addItem(item => {
      item.setTitle('Open source').setIcon('lucide-external-link').onClick(async () => {
        const currentFile = app.vault.getFileByPath(target.sourcePath);
        if (currentFile) {
          await app.workspace.getLeaf(false).openFile(currentFile);
        }
      });
    });
  },
  {
    // Keep the keyboard-accessible More actions affordance off unrelated rows.
    supports: target => target.kind === 'tps/entity-type/bullet'
  }
);
```

The optional `supports(target)` callback is a synchronous, side-effect-free filter. It is checked both while rendering the
**More actions** affordance and again when a menu opens. Omit it when the action applies to every source-backed row. A
throwing or Promise-returning filter is isolated and treated as unsupported; rejected filters are observed and logged.

Row-owner actions run before registered actions. Integrations can call `addSeparator()` when they need a group boundary;
leading, trailing, and duplicate separators are normalized. Desktop right-click, native mobile long-press, and the
keyboard-focusable **More actions** button use the same builder. Empty, throwing, rejected, or delayed builders do not open a
blank menu. A throwing builder is isolated so another synchronous builder can still contribute. A Promise-returning builder
invalidates the entire attempted menu, including when it adds an item before its first `await`; rejected Promises are
observed, and delayed additions are ignored. An item initializer receives Obsidian's real `MenuItem` synchronously and
exactly once; if that initializer fails, the entire attempted menu stays closed so a blank or partially configured host menu
is never shown. A row whose source or matching registration disappears between render and the gesture does not consume the
native context-menu event.

Row menu registrations and filters are runtime-only. They do not persist callbacks, write settings, or modify source notes.

## Events

Subscribe to navigator events to react to user actions.

Tag strings in events use canonical form (no `#` prefix, lowercase path) for real tags. Some tag events may also use
aggregate tag collection ids (`'__all_tags__'`, `'__tagged__'`, or `'__untagged__'`). Property node ids use canonical lowercase node ids.

| Event                  | Payload                                         | Description                  |
| ---------------------- | ----------------------------------------------- | ---------------------------- |
| `storage-ready`        | `void`                                          | Storage system is ready      |
| `nav-item-changed`     | `{ item: NavItem }`                             | Navigation selection changed |
| `selection-changed`    | `{ state: SelectionState }`                     | Selection changed            |
| `row-selection-changed` | `{ row: NavigatorRowSelection \| null }`       | Transient row cursor changed |
| `pinned-files-changed` | `{ files: Readonly<Pinned> }`                   | Pinned files changed         |
| `folder-changed`       | `{ folder: TFolder, metadata: FolderMetadata \| null }` | Folder metadata changed |
| `tag-changed`          | `{ tag: string, metadata: TagMetadata \| null }`        | Tag metadata changed    |
| `property-changed`     | `{ nodeId: string, metadata: PropertyMetadata \| null }` | Property metadata changed |

```typescript
// Subscribe to pin changes
nn.on('pinned-files-changed', ({ files }) => {
  console.log(`Total pinned files: ${files.size}`);
  for (const [path, context] of files) {
    console.log(`${path} - folder: ${context.folder}, tag: ${context.tag}`);
  }
});

// Use 'once' for one-time events (auto-unsubscribes)
nn.once('storage-ready', () => {
  // Wait for storage to be ready before storage-backed navigation/tag/property lookups
  console.log('Storage is ready - initial mirror bootstrap is complete');
  // No need to unsubscribe, it's handled automatically
});

// Use 'on' for persistent listeners
const navRef = nn.on('nav-item-changed', ({ item }) => {
  if (item.type === 'folder') {
    console.log('Folder selected:', item.folder.path);
  } else if (item.type === 'tag') {
    console.log('Tag selected:', item.tag);
  } else if (item.type === 'property') {
    console.log('Property selected:', item.property);
  } else if (item.type === 'type') {
    console.log('TPS type selected:', item.navigatorType);
  } else {
    console.log('Navigation selection cleared');
  }
});

const selectionRef = nn.on('selection-changed', ({ state }) => {
  // TypeScript knows 'state' is SelectionState with files and focused
  console.log(`${state.files.length} files selected`);
});

// Unsubscribe from persistent listeners
nn.off(navRef);
nn.off(selectionRef);
```

## Core API Methods

| Method                                                                                                       | Description                                      | Returns    |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ---------- |
| `getVersion()`                                                                                               | Get API version                                  | `string`   |
| `isStorageReady()`                                                                                           | Check if initial storage bootstrap is complete   | `boolean`  |
| `whenReady()`                                                                                                | Resolve when the initial storage bootstrap completes | `Promise<void>` |
| `on<T extends NotebookNavigatorEventType>(event: T, callback: (data: NotebookNavigatorEvents[T]) => void)`   | Subscribe to typed event                         | `EventRef` |
| `once<T extends NotebookNavigatorEventType>(event: T, callback: (data: NotebookNavigatorEvents[T]) => void)` | Subscribe once (auto-unsubscribes after trigger) | `EventRef` |
| `off(ref)`                                                                                                   | Unsubscribe from event                           | `void`     |

## TypeScript Support

Since Obsidian plugins don't export types like npm packages, you have two options:

### Option 1: With Type Definitions (Recommended)

Download the TypeScript definitions file:

**[📄 notebook-navigator.d.ts](https://github.com/ZachTish/tps-notebook-navigator/blob/main/src/api/public/notebook-navigator.d.ts)**

Save it to your plugin project and import:

```typescript
import type { NotebookNavigatorAPI, IconString } from './notebook-navigator';

const nn = app.plugins.plugins['tps-notebook-navigator']?.api as NotebookNavigatorAPI | undefined;
if (!nn) {
  return;
}

await nn.whenReady();

const folder = app.vault.getFolderByPath('Projects');
if (!folder) {
  return;
}

// Icon strings are type-checked at compile time
const icon: IconString = 'ph-folder';
await nn.metadata.setFolderMeta(folder, { color: '#FF5733', icon });

// Events have full type inference
nn.on('selection-changed', ({ state }) => {
  console.log(state.files.length);
});
```

### Option 2: Without Type Definitions

```javascript
// Works without type definitions
const nn = app.plugins.plugins['tps-notebook-navigator']?.api;
if (nn) {
  // Wait for storage if you need storage-backed navigation/tag/property reads
  await nn.whenReady();

  const folder = app.vault.getFolderByPath('Projects');
  if (!folder) {
    return;
  }

  await nn.metadata.setFolderMeta(folder, { color: '#FF5733' });
}
```

### Type Safety Features

The type definitions provide:

- **Template literal types** for short provider frontmatter icon input (`IconString`)
- **Typed event names and payloads** (`NotebookNavigatorEventType`, `NotebookNavigatorEvents`)
- **Readonly return types** (selected files arrays, pinned map)
- **Menu extension context types** (file, folder, tag, property, Type collection, and source-backed row menus)
- **Transient row provider types** (scope, rows, checkbox mutation, subscription, and registration handles)

**Note**: These type checks are compile-time only. At runtime, the API is permissive and accepts any values (see Runtime
Behavior sections for each API).

## Changelog

### Version 3.6.0 (2026-09-02)

- Added `groupBy: 'none'` to List API presentation updates and snapshots for an explicitly ungrouped note list
- Preserved every existing grouping encoding and TPS aggregate Tags/property-key default
- Kept the rest of the API 3.x surface unchanged

### Version 3.5.0 (2026-08-27)

- Added `tagCollections.allId` for the top-level all-visible-Markdown tag scope
- Added `groupBy: 'tags'` to List API presentation updates and snapshots
- Made List API override normalization selection-aware: the all-notes tag scope inherits tag grouping, and top-level
  property-key scopes inherit grouping by their own key without requiring that key in the global grouping list
- Preserved the existing tagged-only and untagged collection ids and all other API 3.x contracts

### Version 3.4.0 (2026-08-10)

- Added `property-follow`, `property-day-follow`, `line-property-follow`, and `line-property-day-follow` grouping encodings
  to the public List API, mirroring the upstream 3.3.3 group-order behavior
- Preserved all 3.x Type, provider, menu, navigation, and snapshot contracts

### Version 3.3.0 (2026-08-03)

- Added the fixed `structural:web-link` Type and stable `types.webLinksId` getter
- Added note-frontmatter and GCM line-local exact/day grouping encodings; historical `property...` forms retain note
  semantics, while additive `line-property...` forms never fall back
- Kept exact GCM task, bullet, and heading fields authoritative for property sorting before owning-note frontmatter fallback
- Indexed authored HTTP(S) links outside YAML/comments/images/code without network requests, with guarded exact source locations
- Exposed only each URL origin and kept credentials, path, query, and fragments out of labels, search text, locators, and
  diagnostic row ids
- Preserved API 3.x compatibility: existing Type ids, providers, menus, navigation, and snapshots are unchanged

### Version 3.2.0 (2026-08-02)

- Added bounded `list.setPresentation(...)` support for fixed source-backed Type scopes, including row-title and owning-note
  sort fields plus compatible date/property/ungrouped grouping
- Added per-row fixed `typeId` identity to mixed structural search snapshots
- Preserved API 3.x compatibility; display mode, manual/folder grouping, and external provider presentation remain unsupported

### Version 3.1.0 (2026-08-02)

- Added stable `codeBlocksId`, `calloutsId`, `blockquotesId`, and `tablesId` getters for the four new built-in collections
- Kept these Navigator-owned cached-range collections available independently from GCM exact-line readiness
- Preserved API 3.x compatibility: existing Type ids, provider contracts, menus, navigation, and snapshots are unchanged

### Version 3.0.0 (2026-08-01)

- Replaced dynamic Kind collections with a fixed flat catalog: Notes, Checkboxes, Bullets, Headings, Bases, Canvas, Drawings,
  PDFs, Images, Audio, and Video
- Added native file-backed Types while keeping the built-in catalog ready without optional GCM; GCM now governs only
  exact-line Checkboxes, Bullets, and Headings rows
- Added native sort, grouping, display controls, public presentation snapshots, and optional per-Type overrides for fixed
  file-backed Types; metadata edits refresh property-based order and grouping immediately
- Stopped emitting and navigating Kind descriptors; deprecated `buildKind(...)` and `parseKind(...)`, and retained legacy
  Kind parsers only so stale state can be recognized and rejected safely; `isType(...)` now returns `false` for Kind ids
- Broadened external Type-provider `allowedVaultFilePaths` from visible Markdown paths to exact visible vault-file paths

### Version 2.13.0 (2026-08-01)

- Added pull-based `list.getSnapshot()` for the primary mounted view's navigation, search, presentation, and composed rows
- Added guarded `list.setSearch(...)` with immediate applied-query state and requested/effective provider reporting
- Added atomic per-scope `list.setPresentation(...)` with field resets, default normalization, and Type/manual-sort rejection
- Kept snapshots immutable and callback-free, omitted virtual headers/spacers, and avoided continuous cloning or subscriptions

### Version 2.12.0 (2026-08-01)

- Added single selection for attached and Type-backed provider rows with selected CSS and ARIA state
- Included provider rows in Arrow, Home, End, and Page navigation; Enter invokes an optional row activation exactly once
- Added immutable `selection.getCurrentRow()` snapshots and `row-selection-changed` events without exposing provider callbacks
- Added guarded `navigation.focusRow(...)` for an exact row already rendered in the current scope, without navigation or activation side effects
- Kept row and file selection exclusive and cleared transient row state on scope, provider, filter, source, manual-sort, and unload changes

### Version 2.11.0 (2026-08-01)

- Added query-only `NavigatorRowProviderQueryContext.signal` without changing the longer-lived subscription context
- Abort superseded ordinary-row work on scope, selection, search-derived paths, revision, options, unregister, timeout,
  view teardown, and plugin unload
- Give every provider invocation an independent signal; timeouts remain isolated failures while lifecycle cancellation is silent
- Prevent late provider results and GCM task scans from publishing snapshots, populating caches, clearing dirty paths, or
  scheduling progressive work after cancellation

### Version 2.10.0 (2026-08-01)

- Added `menus.registerRowMenu(callback, options?)` for attached, structural, Kind, task, and provider-owned result rows
- Added immutable current-file, Type-scope, line, and checkbox target snapshots without exposing row mutation callbacks or the host menu
- Added an optional guarded `supports(target)` filter so integrations can keep action affordances off unrelated rows
- Unified registered actions with row-owner right-click, native long-press, and accessible **More actions** routing
- Kept stale sources, empty builders, delayed additions, and thrown/rejected integration failures isolated and fail closed

### Version 2.9.0 (2026-08-01)

- Added `menus.registerTypeMenu(callback)` for built-in, dynamic Kind, and provider-owned Type collection rows
- Added a frozen `TypeMenuExtensionContext` with the opaque current Type id and immutable current catalog descriptor
- Kept menu construction synchronous, isolated thrown/rejected failures, and failed closed for stale or empty collections
- Kept registrations runtime-only with no settings, persistence, or migration change

### Version 2.8.0 (2026-08-01)

- Added namespaced API availability and unavailability announcements for safe provider teardown and rebinding
- Added a guarded point-to-point synchronous request responder so late-loading integrations acquire only their own response
- Added typed lifecycle payloads with host identity, plugin/API versions, timestamp, availability, and nullable API
- Kept lifecycle state runtime-only with no settings, provider, or global persistence

### Version 2.7.0 (2026-08-01)

- Added `types.registerProvider(provider, options?)` for runtime-owned top-level Type collections and rows
- Added host-owned provider Type ids, provider-origin descriptor fields, async catalog cancellation, isolated readiness, and
  idempotent registration handles
- Added visibility-bound owner-row queries with search text, abort signals, timeouts, row validation, activation, checkbox,
  and context-menu parity
- Preserved late-loading external Type selections until their own provider becomes authoritative; explicit removal still
  replaces stale navigation safely

### Version 2.6.0 (2026-07-31)

- Added the immutable `types` catalog namespace with structural ids, Kind id helpers, live discovery, subscription, and readiness
- Added `navigation.navigateToType(typeId)` with shared validation, ancestor expansion, history, focus, and scroll behavior
- Added the explicit `disabled` catalog state without exposing GCM records, source paths, task payloads, or provider counts
- Preserved provisional valid Type selections during transient loading or integration failure; a complete `ready` snapshot is authoritative

### Version 2.5.0 (2026-07-31)

- Added additive Type row scopes with `selectionType: 'type'` and opaque `selectedType`
- Added explicit `NavigatorRowProvider.supportsTypeScope` opt-in; existing providers remain attached-list-only
- Added synchronous `addSeparator()` to the guarded provider-row context-menu surface
- Type-capable providers receive only exact paths represented by the current visible and searched native Type rows

### Version 2.4.0 (2026-07-31)

- Added the additive `type` variant to `NavItem` and `nav-item-changed`
- Added `navigatorType` on that variant for structural and dynamic Kind collection ids
- Preserved the exact runtime and TypeScript shapes of existing folder, tag, property, and none variants

### Version 2.3.0 (2026-07-31)

- Added optional synchronous `NavigatorRowDefinition.contextMenu(context)` builders
- Added immutable provider-row action identity with guarded `addItem(...)` access
- Added right-click, native long-press, and accessible **More actions** entry points
- Promise-returning, throwing, and empty builders are isolated and never open blank menus

### Version 2.2.0 (2026-07-31)

- Added `rows.registerProvider(provider, options?)`
- Added transient row scope, provider, registration, activation, and checkbox-indicator types
- Added optional mutable checkbox indicators; omitting `onChange` keeps a checkbox display-only
- Provider registrations now refresh open views when options change and unregister automatically on plugin unload

### Version 2.0.0 (2026-03-07)

- Added `whenReady()`
- Added `tagCollections` helper namespace
- Added `propertyNodes` helper namespace
- `propertyNodes.parse(rootId)` returns a root descriptor
- Added `NavItem.type`
- Added `navigation.reveal(filePath)` and `navigation.navigateToFolder(folderPath)` support
- Changed navigation methods to return `Promise<boolean>`
- Added `FolderMetadataUpdate`, `TagMetadataUpdate`, and `PropertyMetadataUpdate`
- Added `menus.registerTagMenu(callback)`
- Added `menus.registerPropertyMenu(callback)`
- Changed `folder-changed`, `tag-changed`, and `property-changed` to allow `metadata: null`

### Version 1.3.0 (2026-02-14)

- Added `metadata.getPropertyMeta(nodeId)`
- Added `metadata.setPropertyMeta(nodeId, meta)`
- Added `navigation.navigateToProperty(nodeId)`
- Added `property-changed` event

### Version 1.2.0 (2025-12-22)

- Added `navigation.navigateToFolder(folder)`
- Added `navigation.navigateToTag(tag)`
- Added `menus.registerFileMenu(callback)`
- Added `menus.registerFolderMenu(callback)`

### Version 1.0.1 (2025-09-16)

- Added `backgroundColor` property to `FolderMetadata` and `TagMetadata` interfaces

### Version 1.0.0 (2025-09-15)

- Initial public API release
