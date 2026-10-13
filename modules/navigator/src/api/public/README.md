# Public API Type Definitions

This folder contains TypeScript type definitions for external plugin developers who want to integrate with the TPS
Notebook Navigator API.

## Files

### `notebook-navigator.d.ts`

Complete TypeScript type definitions for the Notebook Navigator API.

**For Plugin Developers:**

1. Download this file to your plugin project
2. Import the types in your code:
   ```typescript
   import type { NotebookNavigatorAPI } from './notebook-navigator';
   ```
3. Use with the API:
   ```typescript
   const nn = app.plugins.plugins['tps-notebook-navigator']?.api as NotebookNavigatorAPI | undefined;
   if (!nn) {
     return;
   }
   ```
4. Call `await nn.whenReady()` before storage-backed reads or tag/property navigation that depends on the storage mirror.
   Call `await nn.types.whenReady()` when you need an available aggregate Type catalog before Type navigation. File-backed
   Types stay ready without TPS Global Context Menu; GCM governs only exact-line Checkboxes, Bullets, and Headings rows.
   Navigator-owned Code blocks, Callouts, Blockquotes, and Tables use Obsidian's root-level Markdown section cache instead;
   Web links use a bounded, local Markdown-body scan because Obsidian's link cache does not publish external URLs. That scan
   includes authored HTTP(S) Markdown links, angle autolinks, and bare URLs, reuses unchanged bodies by file stat, excludes
   code and images, and never requests a discovered target. File Types publish before it completes, while GCM line loading
   proceeds concurrently.
   Registered providers publish independently, so subscribe when you need to wait for one provider's descriptor.
5. Long-lived provider integrations should subscribe to `tps:notebook-navigator-api-changed` and send a point-to-point
   `tps:notebook-navigator-api-request` after subscribing. The documented
   [lifecycle pattern](../../../docs/api-reference.md#host-api-lifecycle) automatically tears down old registration handles
   and reacquires the new API after a TPS-only reload. Match unavailable events by their opaque `hostInstanceId`; timestamps
   are diagnostic only and are not a safe host-ordering key.
6. Use `nn.menus.registerTypeMenu(...)` to add synchronous actions to fixed built-in file/structure and provider-owned Type
   collection menus. The frozen context contains the opaque current Type id and its immutable current descriptor. Add items
   synchronously and perform asynchronous work inside each item's `onClick` handler. Initializers receive the real native
   item immediately; stale and empty menus fail closed, while any partially built invalid Type menu is suppressed instead of
   being shown. Rejected Promises are observed and delayed additions are ignored.
7. Use `nn.menus.registerRowMenu(...)` to add actions to matching attached or file-backed, structural/task, and provider-owned
   result rows. Its optional synchronous `supports(target)` filter controls which rows show the accessible action affordance.
   The frozen target contains current file identity, Type scope, optional zero-based line, and checkbox presentation;
   re-resolve mutable line content before writing. Builders and item initializers must be synchronous; a Promise-returning
   builder invalidates that attempted menu, so perform asynchronous work only inside an item's `onClick` handler.
8. Row providers receive a query-only `AbortSignal` in `getRows`. Check it before costly work and after awaited batches;
   TPS aborts obsolete queries on supersession, options changes, unregister, timeout, and unload. Keep `subscribe` tied to
   its returned cleanup instead—the subscription context intentionally has no query signal.
9. Provider rows use one transient cursor that is exclusive with native file selection. Read it with
   `nn.selection.getCurrentRow()`, subscribe to `row-selection-changed`, or call `nn.navigation.focusRow(...)` with the exact
   current identity. Focus fails closed when the row is not already rendered and never changes scope or activates the row.
10. Use `nn.list.getSnapshot()` for a pull-based view of the first mounted TPS Navigator list. `setSearch(...)` and
    `setPresentation(...)` act on that same view, never open one, and return `false` for stale, unsupported, or invalid
    requests. Presentation updates are atomic. Fixed file-backed Types support the ordinary file controls; fixed
    source-backed Types support their bounded sort/group subset and reject display mode, manual sort, and folder grouping.
    `groupBy: 'none'` is available to render an ungrouped note list, and `groupBy: 'tags'` is available for note lists. The
    `nn.tagCollections.allId` scope inherits tag grouping, while a
    top-level property-key scope inherits grouping by its own key even when that key is not in the global grouping list;
    setting a different grouping stores a per-scope override.
    `nn.tagCollections.taggedId` remains a tagged-only compatibility scope for existing shortcuts and does not represent a
    separate visible tree row.
    Their `property-follow...` forms follow the active sort direction, including exact/day/path and line-property variants.
    Opt-in nested property values use `property-path:<key>`, `property-path-desc:<key>` or
    `property-path-follow:<key>` in both configured/effective grouping snapshots; existing flat/day defaults are unchanged.
    Historical `property...` grouping forms read owning-note frontmatter; the additive `line-property...` exact/day
    forms read only inline row fields and never fall back to the note. Line-only grouping is accepted on folders, tags,
    properties, file-backed Types, and GCM line Types so it can drive mixed structural searches. Standalone
    Navigator-owned range Types and external provider Types reject it.
    External provider Types remain provider-owned. Mixed structural search rows expose their owning fixed `typeId`.

## Public Surface

`notebook-navigator.d.ts` mirrors the runtime API exposed at
`app.plugins.plugins['tps-notebook-navigator']?.api`.

- Core methods: `getVersion()`, `isStorageReady()`, `whenReady()`, `on(...)`, `once(...)`, `off(...)`
- Namespaces: `metadata`, `navigation`, `selection`, `menus`, `tagCollections`, `propertyNodes`, `rows`, `types`, `list`
- Exported types: metadata records and updates, navigation and selection state, pin contexts, tag collections, property
  nodes, Type-catalog snapshots and providers, file/folder/tag/property/Type menu extension contexts, transient row
  providers, query cancellation contexts, row selection/focus identities, row context-menu actions, event names, lifecycle
  request/change payloads, list search/presentation controls and callback-free snapshots, and event payloads

The fixed flat Types catalog uses `entity:note`, `structural:task`, `structural:bullet`, `structural:heading`,
`structural:code-block`, `structural:callout`, `structural:blockquote`, `structural:table`, `structural:web-link`, `file:base`, `file:canvas`,
`file:drawing`, `file:pdf`, `file:image`, `file:audio`, and `file:video`. Kind is frontmatter metadata and no
Kind descriptor is emitted or navigable. Deprecated `buildKind(...)` constructs a legacy id and `parseKind(...)` recognizes
one so callers can migrate stale state; `isType(...)` and navigation reject Kind ids. For external Type providers,
`allowedVaultFilePaths` contains exact visible vault-file paths rather than only Markdown paths.

Type and row menu registrations are runtime-only. They add no settings, persisted callback state, or migration. The complete
target shapes and fail-closed behavior are documented in the [Menus API](../../../docs/api-reference.md#menus-api).

**For Maintainers:**

- This file must be kept in sync with the actual API implementation
- Keep the version in the file header, this README, and `src/api/version.ts` aligned when making API changes
- The declaration file is the TypeScript compatibility contract for external users
- Full behavior notes live in `docs/api-reference.md`

## Version

Current API Version: **3.6.0**

## Documentation

Full API documentation: [docs/api-reference.md](../../../docs/api-reference.md)
