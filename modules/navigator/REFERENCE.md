# Historical documentation reference

Preserved from the README at 6.1.0, during the 2026-09-16 documentation cleanup. This includes earlier release notes, detailed contracts, and historical validation claims. Earlier setup steps or limitations may have been superseded. Start with [the current README](README.md), current source, and the tagged release. Relative source links remain rooted in this repository.

---

## 6.1.0 — GCM property bridge

When GCM 2.3.0 or later is available, defined GCM keys are added to every Navigator profile’s property configuration. New keys appear in Properties navigation and file menus, without flooding list rows. Existing ordering and explicit per-key visibility win. Import is additive and case-insensitive; removing a GCM field does not delete Navigator configuration or note data. Repeated notifications are no-ops. Upstream Notebook Navigator is untouched. No new settings destination or toggle; existing property controls remain available.

Verified after test-vault reload: all 57 GCM definitions appeared in the profile property-key editor with navigation/list/file-menu controls; runtime comparison found no missing keys. Regression tests cover case-insensitive deduplication, idempotence, retained ordering/visibility, and invalid input. Existing settings routes and per-profile controls remain unchanged. Full declared npm test and a separate final npm run build are required for the versioned artifacts; the stable build deploys only shipped files to Obsidian Plugin Test Vault. Hot Reload plus explicit test-plugin reload was used for UI verification. Release notes record final validation and SHA-256 hashes. Production installation remains the user’s BRAT pull.

## 6.0.3 — Stable list ordering while typing

The visible list structure now holds its current order during an editor typing burst. After two seconds without another edit, it applies the latest indexed result once. Metadata/content indexing and row content continue updating; this is a transient presentation snapshot, not a pause in note saving. Folder/tag/property/type navigation, search, grouping, sort/settings changes, and file create/delete/rename operations release or bypass the snapshot immediately. Opening another file also releases it. Timers and subscriptions are removed on unmount.

This prevents save-driven modified-time sorting and metadata/projection rebuilds from repeatedly moving rows and triggering scroll-to-selection while typing. A real change to sorting or group membership can still move the list after typing settles. No settings, defaults, data, provider contract, namespace, or persisted schema changes. Minimum Obsidian remains 1.11.0.

Validation includes repeated typing/refresh snapshots, immediate context changes and structural releases, the full test suite, and a separate build/deployment and reload in the isolated test vault. Computer-use checks exercised continuous typing in synthetic notes with modified-time sorting: 30 presentation updates were held during the burst, with no early replacements, then the latest result applied after quiet. This patch is for the user's BRAT pull; production is untouched.

## 6.0.2 — cleaner settings copy

Removed generic settings introductions and repeated navigation/page descriptions. Existing destinations, default route, optional disclosures, control labels/options, commands/actions, conditional visibility, focus behavior, and narrow-screen layout remain unchanged. Useful guidance about consequences, ownership, credentials, and non-obvious inputs stays beside its setting; dynamic status/counts remain. This presentation patch changes no settings schema, defaults, note data, provider behavior, or automation.

Validated on 2026-09-12: source control/action/option/binding inventories preserved; full `npm test` passed (3048 tests). Separate `npm run build` deployed to the isolated test vault. Reloaded settings routes render without generic subtitles, and route navigation leaves settings unchanged. Native navigation, focus styles, and existing narrow-screen strips are retained. Release notes record exact results, route verification, and SHA-256 hashes. Minimum Obsidian remains 1.11.0. Production installation is the user's BRAT pull. Unrelated working-tree changes are excluded.

## 6.0.1 — stable sorting and icons during projection refresh

Generated sort/group fallbacks and icon/color display now retain the same last validated GCM values while projections are temporarily unprepared. Metadata bursts no longer force ordering back to filename/stored fallbacks between preparations. Removed the five-second appearance expiry that caused flashing during longer startups; the in-memory cache is capped at 4,096 files and clears on provider replacement/removal, invalid/empty results, preparation failure, and subscriber teardown. Authored values keep their existing precedence. New confirmed values apply normally; a stalled provider may leave the last generated presentation visible until it returns or disconnects.

No startup delay, persistence, IndexedDB change, note mutation, settings, commands, or namespace changes. Initial cold preparation can still cause one transition from the normal fallback; this does not promise zero motion or a sub-second startup benchmark. Regression coverage checks 40 invalidation cycles with stable property sorting, actual priority changes, 30-second pending appearance, and provider removal. Full tests, separate final build, test-vault reload/UI verification, and SHA-256 results are recorded in the release notes. Minimum Obsidian remains 1.11.0; BRAT installation is the user’s handoff.

# TPS Notebook Navigator

## 6.0.0 — File types replace Types

The Properties root now lists all visible Markdown notes, even without configured property fields or when descendant display is off. Hidden-file rules, sorting and pins still apply; property key/value children keep their existing filters. The root count uses the same all-notes scope.

File types replaces the old Types section in the same navigation position. Its categories are Markdown, Bases, Canvas, Drawings, PDFs, Images, Audio and Video. Counts and lists respect hidden-file rules, while a folder-view format restriction cannot hide a requested file category. Whole files are the smallest items. The catalog uses file metadata and cached drawing classification; it reads no file bodies and starts no task, Markdown-structure, web-link or external Type-provider index. Create/delete/rename events are batched, and subscriptions/timers stop with their consumer.

TPS integrations → File types → Show File types is enabled by default and works in native-record mode. The old Types switch stays retired, and sub-file creation settings are hidden; existing filenames, notes, tasks, recovery data and saved preferences are not rewritten to create this section. The new tpsFileTypesNavigationEnabled preference is independent of the old paused experimental switch. Existing section ordering/expansion state and file-backed Type IDs are reused. Old structural selections fall back when absent from the new catalog. Note-level task progress and the separately configured attached-task-row option are outside this replacement.

This major version retires structural/provider Type collections. The optional public Types catalog now discovers files only; external Type-provider registration is unavailable in this host. Other Navigator APIs remain unchanged. The former implementations remain as isolated source/test utilities pending a separate removal review; they are not connected to this catalog.

Validation on 2026-09-11: all 3,047 tests in 266 files passed, including a 10,000-file / 1,000-event coalescing regression and Markdown-only profile coverage. The separate production build, ESLint and TPS artifact/operational identity gates passed. Obsidian 1.14.1 loaded 6.0.0 in the isolated test vault in native-record mode. Native clicks confirmed one File types section, Base/Canvas counts and file lists, opening a Base, and opening a property-free note from Properties with descendants off. The Show File types toggle disabled and re-enabled its catalog without enabling legacy Types. Canvas editor activation was not validated because the test vault has the core Canvas plugin disabled. iOS was not tested in this change. Minimum Obsidian remains 1.11.0. Release verification and hashes are in `release-notes/6.0.0.md`.

## 5.25.1

Icon and color display retains its last validated GCM appearance during a pending refresh instead of repeatedly flashing the default icon. Retention is display-only, capped at 512 files and five seconds, and cleared on provider removal, invalid values, failed preparation or a confirmed empty result. Pending preparation is deduplicated by file. An incomplete provider preparation no longer publishes a fresh render that immediately requests the same unfinished work. Sort and group values never reuse stale data. This changes no settings, IndexedDB schema, note data, appearance precedence, navigation or command. Initial cold preparation can still show the normal fallback once; no zero-flicker or startup-time benchmark is claimed.

Validation on 2026-09-11: all 3,041 tests in 265 files passed, including pending retention, preparation deduplication, expiry/provider removal and an incomplete-preparation render-loop regression. TypeScript, formatting and TPS identity gates passed, followed by the separate production build and isolated test-vault deployment. Obsidian 1.14.1 loaded 5.25.1. With GCM 2.1.0 and a synthetic note, the saved and displayed icon/color agreed, and twelve projection invalidation/preparation cycles returned only `sparkles`, without a fallback value. Fixtures were archived and temporary rules restored. This patch requires Obsidian 1.11.0.

Validation and artifact hashes are recorded in `release-notes/5.25.1.md`.

## 5.25.0

- Folder notes now work at the vault root. The preferred root folder-name source is the literal `Vault`, so the default `{{folder}}` pattern resolves to `Vault.md`, `_{{folder}}` resolves to `_Vault.md`, and a fixed pattern such as `index` remains `index.md`. An existing root note derived from the actual vault name remains a backward-compatible fallback.
- A tag note is derived entirely from normal note data: it can be any Markdown note anywhere in the vault whose basename case-insensitively matches the tag's final authored segment and whose tag metadata—frontmatter or inline—contains that exact full tag. No tag-note ID, mapping, or hidden frontmatter property is created.
- A unique tag note opens from the tag label, a tag shortcut, the list header, or Enter activation, with the configured navigation-note open location and new-tab behavior. Linked labels are keyboard-focusable, the surrounding tag row keeps its existing select/expand behavior, and links refresh after qualifying notes are created, renamed, deleted, or retagged anywhere in the vault.
- The tag menu can explicitly create a missing tag note in the configured default new-note folder. Creation uses the exact tag-segment filename and exact full YAML tag and never silently adds a numeric suffix; a conflicting filename or multiple matching notes fails closed instead of guessing.
- The existing folder-note master switch, link switch, and open-location setting govern both folder and tag navigation notes. Folder-only template, Type assignment, hide, pin, and nearest-folder-note behavior remain folder-only, with no new persisted setting or public API change.
- Renaming a tag does not automatically rename or rewrite its tag note. The association becomes active again only when one note matches the renamed tag's full path and final segment under the same derived rule. Right-sidebar navigation-note tabs are marked only in Obsidian's workspace state so the plugin-owned tab can be reused after restart; no marker is written to the note.
- This backward-compatible feature requires no note, settings, IndexedDB, or API migration. Public API remains 3.6.0, and minimum supported Obsidian remains 1.11.0.
- Validation passes 265/265 test files and 3,038/3,038 tests, plus TypeScript, Prettier, stylelint, TPS namespace/artifact/operational-identity/string gates, ESLint with no errors, and the separate production-mode build. Obsidian 1.13.7 loaded 5.25.0 in the isolated test vault: a root `Vault.md` and a convention-matching tag note were recognized, and the tag link appeared and disappeared live as its matching note was added and moved away. The synthetic notes were moved directly to `_archive`, their QA tag was removed, the runtime setting returned to its exact pre-QA hash, and production was not accessed. Final hashes are recorded in `release-notes/5.25.0.md`.

## 5.24.0

- Integrates Notebook Navigator 3.3.4 through 3.3.6 from the exact annotated upstream `3.3.6` tag (`748f02c9`) while preserving TPS's independent plugin/view/icon/event/drag/DOM/CSS/storage/database/settings-transfer identities and its optional GCM, Types, aggregate Tags/property, and Core tag-routing behavior.
- Folder, tag, property, and supported Type scopes can now override **Date** and **Parent folder** visibility independently. Hover tooltips use the structured upstream renderer and can optionally include the same filtered, ordered, colored tag pills shown in the list.
- **None** is once again a real grouping choice instead of an alias for Custom. Custom continues to mean manual frontmatter group headers; top-level **Tags** and property-key rows keep their automatic default grouping, including untagged/blank notes and their configured top/bottom placement. Public API 3.6.0 adds `groupBy: 'none'` without changing the existing API 3.x contracts.
- Word and character counts now run only while an active appearance, target property, or visible custom group header needs them. Header dependencies update incrementally after metadata, rename, deletion, and settings changes; TPS aggregate scopes and blank property-key membership remain included.
- Multi-file drags retain every selected file on macOS, and narrow single-pane startup honors the configured starting pane instead of treating initial measurement as a dual-to-single transition.
- Folder-note naming is consolidated into one `{{folder}}` pattern setting with migration for prior fixed names. TPS template-identity filtering remains attached to the folder-note picker, and the explicit one-way upstream settings import now protects every TPS-only architecture and Type setting.
- The About area can disable automatic startup release notes, while release notes remain available manually. Minimum supported Obsidian remains 1.11.0.
- Validation passes 259/259 test files and 2,994/2,994 tests, plus TypeScript, ESLint, Prettier, stylelint, TPS namespace/artifact/operational-identity gates, the separate production-mode build, isolated test-vault deployment/reload, and side-by-side upstream/TPS UI verification. Final artifact hashes and QA details are recorded in `release-notes/5.24.0.md`; production is not accessed.

## 5.23.2

- TPS Global Context Menu's generated note icons and colors are now independent from **Use frontmatter metadata**. The default/fresh-install setting can remain off while already-mounted file rows, note shortcuts, and Recent Notes consume live GCM presentation updates.
- Authored frontmatter is still consulted only when its setting is enabled. An explicit Notebook Navigator icon or color remains authoritative over GCM's generated fallback, so this changes no user-owned appearance precedence.
- With TPS Global Context Menu 1.50.0 or newer, folder-note, Daily Note, and Notebook Navigator calendar creation use the shared exact `template` tag lifecycle: only that top-level marker is removed from a new copy before creation and rechecked after Templater, while unrelated tags and body `#template` text remain unchanged. The source template is never modified, and automatic SVG icon-reference repair skips protected template sources.
- This backward-compatible fix changes no synced setting, IndexedDB schema, or Notebook Navigator public API. It does not retrospectively rewrite existing notes. Minimum supported Obsidian remains 1.11.0.
- Focused regression coverage verifies generated icon/color fallback with authored frontmatter disabled, appearance precedence, template-copy preservation, post-Templater verification, and automatic source protection. The complete suite passed 256/256 files and 2,943/2,943 tests, followed by TypeScript, diff checks, and the separate production-mode build. Obsidian 1.13.7 loaded 5.23.2 in the isolated test vault; a GCM-generated magenta sparkle repainted live on property changes and survived a cold reload while authored frontmatter metadata remained disabled. Template lifecycle QA and final hashes are recorded in `release-notes/5.23.2.md`; production was not accessed.

## 5.23.1

- In **Daily notes** calendar mode, existing Daily Notes no longer remain missing after a cold Obsidian start when the calendar mounts before metadata indexing finishes.
- The calendar now registers for Obsidian's metadata-ready signal and immediately rechecks once after registration, closing both the before-listener and after-listener startup races. Existing vault, GCM API, and content-change refreshes remain debounced through the same calendar cache invalidation path.
- This backward-compatible fix changes no setting, note, database schema, or public API. It applies on desktop and mobile, and minimum supported Obsidian remains 1.11.0.
- Validation passed 256/256 test files and 2,936/2,936 tests, followed by the mandatory separate production build. After a cold reload of Obsidian 1.13.7 in the isolated test vault, the calendar immediately opened both a zero-byte and populated configured Daily Note without a creation prompt; all 11 Daily Note files and both tested file hashes were unchanged. Source artifacts byte-match the deployed test runtime. Production was not accessed.

## 5.23.0

- TPS Global Context Menu's generated note icon, color, and sort value are now a transient presentation overlay. Navigator consumes the version-1 presentation capability directly and never inserts those generated values into MetadataCache, the property tree, search evidence, pills, or Markdown frontmatter.
- Authored frontmatter remains authoritative, followed by an explicit Notebook Navigator appearance; generated presentation is only the final display fallback. A missing, starting, incompatible, replaced, or failing GCM provider safely falls back to normal Navigator behavior.
- Generated values participate in the file rows and configured property sort/group surfaces that need them. They deliberately do not impersonate authored manual-sort state or create a writable metadata record.
- Provider changes are batched, lifecycle-safe, and revisioned so already-mounted views refresh without a vault rewrite or indexing loop. Unmount, provider replacement, and delayed responses cannot publish stale presentation.
- This backward-compatible integration adds no setting or note migration. Minimum supported Obsidian remains 1.11.0.
- Validation passes 256/256 test files and 2,935/2,935 tests, including focused presentation precedence, isolation, lifecycle, sort, and grouping coverage. The final TypeScript/build, isolated test-vault deployment/reload, and visual verification run on the versioned artifact before publication; production is not accessed.

## 5.22.0

- Exact single-tag activations emitted by Obsidian Core now open that tag in TPS Notebook Navigator instead of replacing the current Core Search. This covers the shared Core route used by rendered Markdown, Properties tag pills, Bases tag cells, Live Preview, Graph tag nodes, and the Core Tags pane on supported Obsidian builds.
- The route reveals an existing Navigator or creates it in the left sidebar, selects the exact canonical tag, and dismisses an active Navigator Filter Search only after the tag selection succeeds. A newer tag activation supersedes any older route that is still waiting for the view.
- Ordinary free-text, compound-tag, malformed, non-string, synthetic, editable-input, and unactivated programmatic searches remain in Obsidian Search. If Navigator cannot reveal, become ready, or resolve the tag, the captured Core Search method is invoked once with its original receiver and arguments.
- The bridge capability-detects and reversibly shadows Obsidian's internal Core Search method. It follows Core instance replacements, covers already-open and newly opened popout documents, and restores only its own wrapper during unload so other plugins' wrappers are not overwritten.
- This backward-compatible feature adds no setting, public TPS API, note change, or data migration. Minimum supported Obsidian remains 1.11.0. Core Search must remain enabled because Obsidian's own tag controls do not dispatch this route while it is disabled; an exact single-tag saved Search activated by pointer or keyboard is also treated as a tag activation.
- Validation passed 255/255 test files and 2,928/2,928 tests, including 5 focused Core-routing, lifecycle, API, release-note, and artifact files with 38/38 tests. Every touched file passed Prettier and ESLint; stylelint, TPS namespace/artifact/identity checks, TypeScript, `git diff --check`, and the mandatory separate production build passed. The repository-wide checks still report the same seven historical formatting files and two unrelated baseline ESLint errors documented in 5.21.0. Obsidian 1.13.7 loaded the exact candidate in the isolated test vault: clicking a real Reading View tag selected the exact TPS tag scope, cleared an active Filter Search, kept the existing Core Search query unchanged, and never switched to the co-installed upstream Navigator. The synthetic note was moved directly to `_archive`, runtime settings were restored to their pre-QA bytes, and production was not accessed.

## 5.21.0

- Selecting the top-level **Tags** row now shows every visible Markdown note, including untagged notes, and automatically groups the list by each note's visible tags. Multi-tag notes follow the scope's separate/combine setting, hidden-tag rules remain authoritative, and attached provider/task rows use their own tags instead of inheriting the first tag group of their source note.
- Selecting a top-level property key now shows every note that contains that key, including a YAML `null` or otherwise blank value, and automatically groups the list by that property. Concrete value rows remain exact-value scopes.
- For these automatic aggregate views, **Untagged** / **No value** follows **Folder grouping: current folder files at bottom** when the scope has no explicit no-value override: off places the empty bucket first, on places it last. Manual sorting remains inside the required tag/property groups instead of silently removing them.
- Dropping a Markdown note on a property-key row writes and retains the blank key (`key: null`), including when a compatible GCM property API is enabled. Dropping on a concrete property value retains the existing typed assignment behavior; task-line drops still require a value row.
- Aggregate roots no longer expose a descendants toggle that cannot change their complete scope. The previous UI-owned Tags selection migrates once to the new all-note root, while the public tagged-only compatibility collection and saved shortcuts remain available as **# Tags**.
- Public API 3.5.0 adds `tagCollections.allId` and `groupBy: 'tags'`. The all-note Tags root and property-key roots expose the same automatic grouping through list snapshots and presentation updates; line-backed Types reject tag grouping because they render source rows rather than note instances.
- Virtual collection identifiers and descendants are reserved from tag create/rename/delete/drop paths, so `__all_tags__`, `__tagged__`, and `__untagged__` cannot become note tags accidentally.
- This backward-compatible feature changes no note schema or synced setting key. The local content index rebuilds once so previously cached blank properties become immediately discoverable. Minimum supported Obsidian remains 1.11.0. Validation and final test-vault artifact details are recorded in `release-notes/5.21.0.md`.
- Validation passed 254/254 test files and 2,913/2,913 tests, including 13 focused files and 305 aggregate/navigation/API/drag/provider checks, followed by the mandatory separate build and byte-identical test-vault deployment. Obsidian 1.13.7 reloaded 5.21.0; Tags, status/No value grouping, and a GCM-enabled blank-key drop passed installed-runtime QA. The temporary property definition was removed, synthetic notes were moved directly to `_archive`, runtime settings returned to their exact post-upgrade candidate hash, and production was not accessed.

## 5.20.2

- In **Native Markdown records** mode, a file that GCM's version-2-or-newer `nativeRecords` API verifies now uses its canonical record title when no explicit Navigator frontmatter display-name field produced a usable value. Opaque identity filenames such as `item_<uuid>` therefore remain stable on disk while task rows show their readable title.
- A strict whole wikilink title displays its alias, or its readable target basename when no alias exists. Backslash-escaped wikilink punctuation remains literal, embedded or Markdown-link syntax is not reinterpreted, and unresolved template output falls back safely to the filename.
- GCM API readiness and replacement refresh visible names, search evidence, metadata access, and title sorting—including selected file-backed Types—without persisting a cache entry or changing filenames, frontmatter, or settings. Legacy mode, ordinary files, unavailable/incompatible GCM, and unverified records retain their existing filename behavior.
- This is a backward-compatible presentation fix. Minimum supported Obsidian remains 1.11.0.
- Validation passed 253/253 test files and 2,863/2,863 tests, followed by the separate production build and byte-identical test-vault deployment. Obsidian 1.13.7 reloaded 5.20.2 and displayed an opaque native workout file by its canonical title in a reversible provider QA; both plugins returned to Legacy mode, only the expected `lastShownVersion` changed, and production was not accessed.

## 5.20.1

- Core Daily Note actions now use GCM's authoritative Daily Notes API when it is available, including legacy-path date resolution in API v3 and exact confirmed-path enforcement in API v4. A present but starting, incompatible, failed, or declining provider fails closed instead of racing a second creator; confirmations that require path binding fail closed on older providers.
- Without GCM, Navigator uses one coherent Core Daily Notes folder, format, and template snapshot. Startup placeholders, later settings changes, localized Moment digits, and concurrent same-date actions can no longer select a root lookalike or create competing files.
- Templater runs exactly once for a newly owned note. Existing notes remain byte-stable, delayed mobile creation is awaited, and failed owned output receives a non-destructive hidden EOF marker so it remains fail-closed across reloads without deleting user or Sync changes.
- Independent Notebook Navigator calendar-note mode remains intentionally independent. This patch changes only Core Daily Notes ownership and is backward compatible; minimum supported Obsidian remains 1.11.0.

## 5.20.0

- TPS template pickers now consume GCM's version-1 template identity rule when available. Calendar templates and folder-note templates can therefore be selected by tag or property key/value even when every file is stored at the vault root.
- Missing or incompatible GCM keeps the established folder-based behavior. An exact configured template path remains usable, and the integration never changes Templater's own folder setting.
- File display names now reject unresolved template expressions such as `<% ... %>` and `{{ ... }}` in a frontmatter title. The Navigator consistently shows the filename instead across visible rows, sorting, and metadata access rather than exposing a raw template program.
- This is a backward-compatible TPS integration feature with no file or settings migration. Minimum supported Obsidian remains 1.11.0.

## 5.19.0

- Adds an opt-in **Native Markdown records** TPS data architecture. In this profile Navigator operates only on real vault files: virtual Types/line rows and attached GCM task rows are forcibly disabled, and non-Markdown companion-property writes are unavailable.
- The compact dual-pane file UX, previews, properties, tags, quick actions, real-file multi-select, and visible drag previews remain available. Native record files behave like ordinary Markdown notes and can be filtered/grouped with Navigator or core Bases.
- Property drops continue to resolve GCM's property definition. List/link/tag values add and deduplicate; scalar values replace. The native profile applies these rules only to real Markdown records and never mutates non-Markdown source bytes.
- Legacy integrations remain the default and retain their existing Types, task-row, and companion behavior. Minimum supported Obsidian remains 1.11.0.

TPS Notebook Navigator is an experimental, co-installable fork of [Notebook Navigator](https://github.com/johansan/notebook-navigator). It keeps the upstream navigator available while providing a separate place for TPS integrations, provider-rendered rows, and deeper workflow control.

The fork's first integration line is based on upstream commit `2b65be66` (Notebook Navigator 3.3.0 lineage plus upstream changes through that exact commit). TPS 5.15.0 incorporated Notebook Navigator 3.3.3 at `7ae7db62`; TPS 5.24.0 advances that history-preserving base through the annotated Notebook Navigator 3.3.6 tag at `748f02c9`. The upstream project remains the source for the mature file-browser experience, documentation, translations, icon packs, and media assets. TPS-specific changes are maintained independently in this repository.

## Why this is a separate plugin

The fork is deliberately isolated so enabling, testing, disabling, or removing it cannot replace upstream Notebook Navigator or take over its runtime state.

- Plugin, view, command, icon, event, drag payload, DOM, CSS, Style Settings, local-storage, IndexedDB, and settings-transfer identities use TPS-only namespaces.
- Upstream and TPS Notebook Navigator can be enabled in the same vault and opened side by side.
- Note content, tags, frontmatter, and vault folders remain shared Obsidian data by design.
- Importing upstream settings is explicit, one-way, and read-only with respect to the upstream plugin. It never runs automatically.
- TPS integrations are optional and fail closed: disabling them restores the ordinary file-only navigator behavior.

## BRAT installation

1. In BRAT, choose **Add beta plugin**.
2. Add `ZachTish/tps-notebook-navigator` and use **Latest** for normal updates or **Frozen** to pin a numeric release.
3. Enable **TPS Notebook Navigator** in Community plugins. You can leave **Notebook Navigator** enabled.
4. Open **Settings → TPS Notebook Navigator → TPS integration** to opt into integrations or import a copy of upstream settings.

The release assets are `main.js`, `manifest.json`, and `styles.css`. The minimum supported Obsidian version is 1.11.0.

## TPS integration contract

The integration surface is intentionally modular. The navigator owns presentation and row composition; a provider owns its data and actions. Provider failures are isolated and never block the normal file list.

### Transient GCM file presentation

When TPS Global Context Menu exposes its version-1 `notebookNavigatorPresentation` capability, Navigator can show rule-generated note icons and colors and use generated property values as a fallback for property sorting and grouping without writing those values to YAML or either plugin's settings. GCM owns projection preparation and invalidation; Navigator batches unprepared visible files through `ensure(files)`, reads the prepared `{ filePath, values }` projection synchronously, and refreshes current lists when the provider revision changes. Missing, disabled, incompatible, malformed, throwing, replaced, or unloaded providers fail closed to ordinary Navigator behavior.

Precedence is intentionally narrow. While **Use frontmatter metadata** is enabled, a usable authored value in the configured frontmatter field wins, followed by an explicit per-file Navigator icon or color, then the generated projection. Disabling that setting disables only authored frontmatter appearance; explicit Navigator appearances and the read-only generated fallback remain available. Generated icon values pass through the same frontmatter compatibility decoder as authored icons. Property sort and property group read authored frontmatter first and consult the projection only when that requested field has no usable value. The configured manual-sort property is never virtualized because manual ranking remains a real YAML mutation owned by Navigator.

The projection is presentation-only. It is not merged into `FileData.metadata`, `FileData.properties`, the property tree, property pills, Filter Search evidence, note frontmatter, or persisted settings. As a result, an explicitly configured property key remains available for ordinary authored-property navigation, but a value that exists only in the GCM projection does not create a property-navigation row, pill, or search match. Existing authored values—including older values previously written by an automation—remain normal frontmatter and retain their established behavior.

The initial TPS Global Context Menu provider can optionally show individual task rows belonging to the exact files already present in the list. It does not scan unrelated folders or invent task files, and it is separate from the standard per-note task-progress bar and count. Completed-task visibility and the per-note row limit are explicit settings. TPS Global Context Menu 1.15.0 remains the completion-capability baseline; 1.18.0 is the tested baseline for this release's generic task, bullet, and heading line-property grouping. Task checkboxes complete or reopen the exact task through GCM's configured status/checkbox rules, selecting the title re-resolves and opens its source line, and right-click, mobile long-press, or **More actions** opens the same guarded GCM task menu available in Types. Desktop task rows can be dragged into an editor as their complete Markdown task line; the isolated text payload never enters Navigator's file/folder/tag mutation pipeline. With GCM 1.32.0, one or more selected TPS List/Table task rows can also be dropped onto a Navigator tag or concrete property-value row. Navigator reads GCM's versioned property definition and delegates the exact task mutation back to GCM, so list/link/tag fields add and deduplicate while scalar fields replace. Task-line drops intentionally do not target folders or an empty property key. Ordinary file multi-drag continues to support folders, tags, and properties; when GCM owns the property definition, file drops use the same list-versus-scalar rule and non-Markdown targets route through GCM's companion-property store. Custom checkbox markers remain visible instead of being flattened to a binary checkmark. Generic row providers can also add their own synchronous context-menu actions without granting the navigator access to provider internals. Older structurally compatible APIs without a safe task mutation, menu, raw-line-property, or typed item-property path degrade only that capability. If GCM is disabled, missing, incompatible, or its individual-row setting is off, the provider contributes no rows.

The visible vault root follows its own **Show files from subfolders / descendants** choice. With descendants off, it shows only files stored directly at the root; with descendants on, it traverses the complete visible vault while respecting the active profile's file-visibility, hidden-content, and excluded-descendant rules. **Search whole vault** temporarily widens root search without changing the saved root choice. With experimental Types collections enabled, the root adds canonical Checkboxes, Bullets, Headings, Code blocks, Callouts, Blockquotes, Tables, and Web links only for files in that effective scope. With Types off—the default in 5.16.0—it remains note/file-focused and does not build those source indexes. Canonical Checkboxes replace the optional attached GCM task feed when available so tasks are not duplicated; the attached feed remains a compatibility fallback. Folders, concrete tags, and concrete property values remember independent descendant choices in their existing appearance records; the List setting is only the default for a view without an override. The toolbar and command-palette toggle update the active view and do not change unrelated scopes. Resetting that view's appearance removes its override and restores inheritance from the default. Aggregate **Tags** and property-key rows define complete scopes, so their descendants toggle is hidden. **Tags** includes all visible Markdown notes and groups by visible tags; a property key includes every note where that field exists and groups by its values, including **No value** for blank/null fields. Their automatic empty bucket follows **Folder grouping: current folder files at bottom** unless that scope has an explicit no-value position. Dropping a note on the property key continues to write a blank YAML value. File-backed resources and provider rows share the same selected appearance, so **Compact** condenses attached task/provider rows as well as native file rows.

An ordinary navigation-scope action fully dismisses Filter Search, clears its immediate and debounced query, and resets any temporary whole-vault search scope before the new folder, tag, property, or Type becomes the list base. This applies to navigation-tree clicks, keyboard selection, folder/tag/property pickers, mobile ancestor breadcrumbs, clickable folder group headers, tag/property pills, navigation shortcuts, reveal-in-folder actions, and note shortcuts that reveal a different scope. Context-menu creation also resets Search when it first selects a different target scope. Existing Shift and configured modifier gestures remain additive for tag, property, and structural Type facets; they preserve the current search and do not change the navigation base. Expansion chevrons, opening context menus, alternate-tab opens, property links, failed navigation, and saved-search shortcuts do not trigger the reset.

### Types navigation

The first-class **Types** implementation is retained but its product development is paused. It is off by default and can be explicitly enabled through **TPS integration → Types collections (paused) → Enable Types collections (experimental)**. No Types code, public API, saved ordering, appearance, or creation preference has been removed. When enabled, it has the same flat built-in catalog of file formats and Markdown structures described below. Frontmatter values such as `kind` belong in **Properties** or a relational entity index; they are not file types and do not appear beneath **Types**.

- File-backed collections are **Notes**, **Bases**, **Canvas**, **Drawings**, **PDFs**, **Images**, **Audio**, and **Video**. Each supported vault file belongs to exactly one collection. Excalidraw files—including `.excalidraw.md` and Markdown files carrying Excalidraw frontmatter—belong to **Drawings**, not **Notes**.
- File-backed collections run through the ordinary Navigator file pipeline. Their results use the same `TFile` rows, appearance mode, icons, properties, previews, sort, grouping, search, selection, menus, drag behavior, and opening behavior as the normal file view.
- Like the normal file view, YAML-backed manual ranking can write only to Markdown files. Non-Markdown Types retain filename,
  title, created, and modified sorting but cannot store a manual rank in frontmatter.
- Exact-line collections are **Checkboxes**, **Bullets**, and **Headings**. TPS Global Context Menu's generic Entity Index v3 supplies their stable line locators without giving the Navigator a second Markdown parser. These rows use the native file-row visual language with a restrained line-type icon or live task checkbox, then re-resolve and open their current source line.
- Navigator-owned source-range collections are **Code blocks**, **Callouts**, **Blockquotes**, **Tables**, and **Web links**. The first four come from Obsidian's root-level `CachedMetadata.sections` without reading bodies. Because Obsidian does not publish external URLs in `CachedMetadata.links`, Web links uses a bounded local Markdown scan: at most four concurrent reads, the shared 2 MB mobile / 8 MB desktop body limit, a 10,000-link per-file guard, and an mtime-plus-size cache for unchanged files. File-backed Types publish immediately and GCM exact-line loading runs in parallel, so this scan does not hold either catalog behind body I/O. It recognizes Markdown links, angle autolinks, and bare HTTP(S) URLs while excluding YAML frontmatter, HTML comments, Obsidian `%%` comments and hidden TPS carriers, Markdown image syntax, inline/indented/fenced code, vault links, mail links, and Excalidraw Markdown. No target is requested. Each row revalidates its current source before opening the owning note at the exact line and column. Only the URL origin (`scheme://host`) is displayed or searchable; credentials, path, query, and fragment data are omitted from labels, search text, locators, and diagnostic row ids.
- Hydrated task entities in **Checkboxes** use GCM's canonical completion path with optimistic rollback. Right-click, mobile long-press, or **More actions** opens the same guarded GCM task menu. A task that cannot be matched exactly remains open-only rather than inventing state.
- Every mobile checkbox provider row has a strict visual contract, whether it is a standalone Type result or attached under a folder, shortcut, tag, property, date, or mixed-search collection: it is promoted to the same file-row presentation used by ordinary Notes. It has one title line, the same padding/icon-slot/virtual-height rhythm, and no rendered source metadata. The runtime applies native-control resets inline to the title, checkbox, and More controls; CSS repeats the constraints as progressive protection. The checkbox is the only intentional visual substitution for the normal leading file icon. Focus, selection, task completion, and context-menu behavior remain available.
- Task hydration batches cold reads across source files, then reuses a bounded per-path cache keyed by file metadata. Exact GCM and vault update paths invalidate that cache, including failed initial hydration, so unchanged vaults avoid repeated scans without leaving edited checkboxes stale.
- Every fixed source-backed collection—**Checkboxes**, **Bullets**, **Headings**, **Code blocks**, **Callouts**, **Blockquotes**, **Tables**, and **Web links**—exposes **Sort** and **Group** controls. Checkboxes, Bullets, and Headings default to their own exact GCM line properties and do not inherit owning-note frontmatter. Their shared **Property inheritance (sort and group)** control is always available for line-backed Types and offers **Do not inherit note properties** (the default), **Inherit and prioritize note properties**, **Inherit note properties but prioritize line properties**, and **Inherit and combine properties**. Existing explicitly saved inheritance choices remain unchanged. Property grouping defaults to **Show an instance in each group**, so a note or structural row with multiple values appears once in every applicable group; repeated values do not duplicate it inside one group. **Combine values into one group** preserves the earlier comma-separated bucket behavior. **No value group position** places unmatched notes or structural rows at the **Top** or **Bottom** (the default). These choices are stored with the current folder, tag, property, or Type appearance. Navigator-owned ranges and native note/file rows continue to use owning-note frontmatter. **Property · Date** buckets valid date/time values by their written local `YYYY-MM-DD`. Date grouping is available for a date sort, and **None** is the explicit ungrouped mode. **Custom** also renders source-backed rows flat because custom headers belong to files. Folder grouping, manual sorting/grouping, and display-mode/appearance editing remain file-only. External provider Types retain their provider-owned presentation.
- The create button is available for **Bases**, **Canvas**, **Checkboxes**, **Bullets**, **Headings**, **Code blocks**, **Callouts**, **Blockquotes**, **Tables**, and **Web links**. **New base** and **New canvas** reuse the ordinary folder-menu file operations, create an untitled resource at the vault root, open it, and start Obsidian's normal rename flow; Base creation is available only while the Bases core plugin is enabled. Line-backed creation atomically appends an editable scaffold and opens the inserted source position. Today's Daily Note is the default line target; when it does not exist, Navigator creates it from the configured Daily Notes folder, format, and template before inserting, and an existing blank note accepts the scaffold normally. Checkbox creation asks for a title and delegates the write to GCM so checkbox/status mappings and hidden task fields stay canonical. Other file-backed Types and external provider Types remain non-creatable until they define a safe creation contract.
- In Filter Search, `#tag`, `-#tag`, `#`, and `-#` facets on exact GCM-backed **Checkboxes**, **Bullets**, and **Headings** evaluate only the line's authoritative tags. An owning note cannot make an untagged line match, and a locally tagged line can match inside an untagged note. Nested tags and tag/property `AND`/`OR` expressions use the same row-local projection, while folder, date, extension, task-state, and the active navigation selection continue to scope source files.
- A nonempty search is the source of truth for creation. **New matching item** is enabled only when Filter Search resolves exactly one supported Type and every criterion can be written deterministically. For Checkboxes, positive `AND` tags, exact `.key=value` fields, and `.status=value` are applied through GCM; Type-only searches may reuse the selected Type's ordinary creation flow. `OR`, negative/untagged, free-text, folder/date/extension/task-state, multiple-Type, key-only/reserved-property, unsupported-Type, and Omnisearch queries leave the action visible but disabled with a reason. Search creation never falls through to folder/tag/property note creation.
- Counts and rows respect the active Navigator profile, hidden-folder/file/property/tag rules, file visibility, and the hidden-items override. Fenced examples that GCM excludes never become Navigator rows.
- **Reorder navigation** edits the flat Types list in place. **Type order** offers **Default order**, **Name: A to Z**, **Name: Z to A**, **Most items first**, **Fewest items first**, and **Manual order**. Name and count modes sort automatically as the visible catalog changes; count modes use the same visibility-filtered quantities shown beside the Type rows, while provider collections that do not publish a count stay after counted Types. The editor continues to show those counts so the active ordering is inspectable.
- Moving a Type with its up/down buttons or drag handle immediately switches the list to **Manual order**. New Types append without disturbing the saved sequence, and temporarily unavailable provider Type ids retain their positions so plugin load order does not erase the user's arrangement. **Default order** returns to the canonical catalog order without changing the public catalog itself.
- The order mode and retained manual ids persist in TPS Notebook Navigator's own `data.json`. On mobile, the order selector stacks above the Types list, rows keep touch-sized up/down controls, and the existing handle-only drag interaction avoids turning the full row into a scroll-blocking drag target. Very narrow desktop panes prioritize readable Type names by hiding counts and revealing that row's arrow controls on hover or keyboard focus.
- Exact-line, cached-range, and provider-owned rows have one transient row cursor and remain deliberately excluded from `TFile` multi-select, pinning, rename, persistence, and Navigator's file mutation drag pipeline. Hydrated task rows alone expose a desktop text drag containing the complete Markdown task line for insertion into an editor. File-backed Type results retain normal file interactions because they are real `TFile` rows. Dragging other cached source ranges is intentionally deferred until it can preserve source syntax and locators safely.
- Missing, disabled, incompatible, or incomplete GCM indexing affects only Checkboxes, Bullets, and Headings and produces a visible status row there. File-backed and cached-range collections remain available. TPS Global Context Menu 1.18.0 is the tested Entity Index v3/raw-line-property baseline; its canonical task-completion path remains backward-compatible with the 1.15.0 capability.

Turning Types collections off cancels pending catalog and hydration work, removes Types selection/search/navigation surfaces,
clears exact-line and Navigator-owned Markdown-structure/Web-link snapshots, and stops their GCM subscriptions. Properties
continues to use note frontmatter only; line-level Type properties are not merged into that tree. When neither Types nor an
attached row provider is active, row-provider scoping uses an inert empty scope instead of walking every visible note. These
limits keep the default navigator proportional to notes/files even when note bodies contain very large numbers of tasks.
Standard note task-progress bars and counts remain available because they store only per-note totals, not one Navigator row
per task.

The selected type and Types-root expansion state use TPS-namespaced local storage, participate in back/forward history and keyboard navigation, and do not alter upstream Notebook Navigator state. A stale saved `kind:*` selection is rejected immediately and safely falls back. Version 5.16.0 performs only the bounded pause migration described below; it never changes note content.

External integrations can discover fixed built-in and registered-provider descriptors through the provider-neutral public
`types` catalog, subscribe to its availability/revision changes, and navigate through `navigation.navigateToType(typeId)`.
Public API 3.6.0 adds `groupBy: 'none'` as the explicit ungrouped list mode. API 3.5.0 adds `tagCollections.allId` for the visible all-note Tags root and `groupBy: 'tags'` for note lists. The older `taggedId` remains a tagged-only compatibility scope and is labeled **# Tags** in saved shortcuts. API 3.4.0 adds `property-follow` grouping forms for note, calendar-day, and line-property views so public list
presentation updates can follow the active sort direction. API 3.3.0 adds the stable Web links id plus additive note/line
exact-value and calendar-day grouping encodings. API 3.2.0 added bounded presentation controls for fixed source-backed Types and preserves each mixed search row's owning Type
identity. API 3.1.0 added stable ids for Code blocks, Callouts, Blockquotes, and Tables. API 3.0.0 removed Kind descriptors from
discovery and navigation while retaining deprecated helpers to construct and parse legacy Kind ids during migration; active
validation and navigation reject them. The earlier API 2.7.0 also adds
`types.registerProvider(...)`: one runtime registration defines one
or more new top-level Type collections and supplies their rows through the existing guarded row DTO. TPS owns collision-free
opaque ids, visible-path enforcement, timeouts, cancellation, validation, and lifecycle cleanup; the provider owns its data,
search, activation, checkbox changes, and context-menu actions. Provider definitions and options are never persisted.

API 2.9.0 adds `menus.registerTypeMenu(...)` for selectable fixed built-in and provider-owned collection rows. Each
callback receives the opaque Type id and its current immutable catalog descriptor. Menu items must be added synchronously;
asynchronous work belongs in the item's `onClick` handler. A removed or otherwise stale collection, or a set of builders that
adds no synchronous item, leaves the menu closed instead of opening a blank or outdated surface. A Promise-returning builder,
partial builder failure, or invalid item initializer suppresses the complete Type-only menu attempt; rejected Promises are
observed and delayed additions are ignored. Real Obsidian `MenuItem` initializers still run immediately and exactly once, and
duplicate callback registrations retain independent idempotent disposers. Registrations are runtime-only and add no settings,
persisted state, or migration.

API 2.10.0 adds `menus.registerRowMenu(...)` so an integration can attach actions to the actual source-backed rows rendered
beneath notes or inside Checkboxes, Bullets, Headings, Code blocks, Callouts, Blockquotes, Tables, Web links, and provider-owned collections. The optional
pure `supports(target)` filter controls which rows expose the action affordance. A frozen target includes current `TFile`
identity, provider/row/kind identity, optional zero-based line, selected Type id, and immutable checkbox presentation without
exposing provider mutation callbacks or the host `Menu`. Row-owner actions remain first; desktop right-click, native mobile
long-press, and **More actions** use the same guarded builder. Stale files and empty or failing integrations fail closed.
Promise-returning builders invalidate the whole attempted menu, even if they add an item before their first `await`;
asynchronous work belongs inside an item's `onClick` handler.

API 2.11.0 gives every ordinary `rows` provider query its own `AbortSignal`. Superseded folder, Type, search-path,
selection, revision, and options queries stop promptly; unregister and plugin unload cancel every active invocation owned
by that provider. Each provider signal is independent, so a five-second timeout aborts only the failing provider while
healthy rows continue streaming. Lifecycle cancellation is silent and late results are ignored. The built-in GCM task
provider cooperates between its eight-path batches and commits task/scope caches only after the complete active pass, so an
obsolete scan cannot clear dirty paths, seed negative cache entries, or schedule another progressive pass. Existing
providers that ignore the additive signal remain compatible, although checking it before expensive work and after awaited
batches avoids wasted work.

API 2.12.0 makes attached and Type-backed provider rows first-class single-selection targets without pretending that they
are files. Pointer selection and Arrow/Home/End/Page navigation share one cursor with native files; Enter invokes a selected
row's optional activation exactly once. `selection.getCurrentRow()` and `row-selection-changed` expose an immutable,
callback-free source identity, while `navigation.focusRow(...)` focuses only an exact row already rendered in the current
scope and never changes scope or activates it. File and row selection are exclusive, row state is never persisted, and a
filtered, unregistered, deleted, renamed, or otherwise stale row is cleared or rejected.

API 2.13.0 adds a bounded, provider-neutral `list` namespace for integrations that need the list the user is actually
looking at. `list.getSnapshot()` pulls the first mounted TPS view's current navigation scope, immediate/applied search,
requested/effective provider, effective per-scope presentation, and composed file/provider row order without continuously
cloning large Type collections or exposing provider callbacks. `setSearch(...)` and atomic `setPresentation(...)` never
open a view and fail closed for stale views, malformed input, provider-owned Type scopes, unavailable property keys, or
incompatible presentation requests. Fixed file-backed Types expose the same presentation snapshot and per-Type sort,
grouping, and display overrides as ordinary file scopes. Fixed source-backed Types expose their effective sort and grouping;
their mixed-result rows retain a per-row `typeId`, and `setPresentation(...)` accepts their supported sort/group subset while
rejecting display mode, manual sort, and folder grouping. Null presentation fields reset only that field to its inherited
default; the optional TPS-owned Type override records require no migration.

Clicks, back/forward history, and public calls share one validator, ancestor-expansion, focus, and scroll path. Catalog DTOs
are immutable and intentionally omit GCM records, source paths, task payloads, and counts whose meaning would differ before
and after Navigator visibility filtering. Readiness and removal authority are tracked per source: a failed provider cannot
poison GCM or another provider, a late-loading provider selection is preserved, and explicit unregistration removes a stale
selection immediately. See [the API reference](docs/api-reference.md#registering-a-top-level-type-provider) for a complete
provider example.

### Settings map

The default settings surface remains the normal Notebook Navigator landing page. **TPS integration** is a top-level destination under **Configuration**, one click from that landing page.

- **Task rows** — **Show GCM tasks beneath notes** is off by default. When enabled, the same page reveals **Include completed tasks** and **Tasks per note**; there is no nested editor or second configuration page. These individual rows are independent from note task-progress bars and counts.
- **Types collections (paused)** — **Enable Types collections (experimental)** is off by default and controls the retained flat file-format and Markdown-structure catalog. Enabling it restores the existing Types navigation, search facets, API, ordering, and indexes; disabling it stops that work. Types feature development is paused.
- **Type item creation** — This group is hidden while Types collections are off, without deleting its saved values. When Types are enabled, **Create items in** defaults to **Today's daily note** and can instead target the active regular Markdown note or one configured existing Markdown note. The specific-note picker appears only while that target is selected. Daily-note creation follows Obsidian's current Daily notes folder, format, and template settings and fails before creating anything when a configured template cannot be resolved or read. Excalidraw Markdown is rejected by both filename and frontmatter.
- **Core Daily Note ownership** — In **Daily notes (core plug-in)** calendar mode, GCM's compatible `dailyNotes` v2-or-newer API is authoritative for resolving and ensuring an ISO-date Daily Note; v3's `dateForFile` also maps an active canonical or legacy file back to its calendar day. GCM v4 additionally binds a confirmation to the exact path shown by Navigator and revalidates it at GCM's mutation boundary; a constrained confirmation fails closed with an older provider rather than creating a newly configured path the user did not approve. A blocked provider, an authoritative `null`, or an exception fails closed instead of falling through to a date-looking local file. Without GCM, Navigator rereads the current Core folder, format, and template as one creation snapshot. Persisted settings provide coherent startup recovery while Core exposes structurally incomplete options or its exact blank/root/`YYYY-MM-DD` placeholder, including slow mobile hydration; any observed live runtime change permanently yields to the runtime snapshot so intentionally cleared settings cannot revive stale disk values. Synchronous lookup stays blocked until that coherent snapshot is cached, preventing an unrelated root date-shaped file from being opened. Ordinary actions use a fresh snapshot; a confirmation callback additionally refuses to create if the Core configuration or approved path changed after the prompt opened. Concurrent callers share one invariant-ISO mutation owner but retain independent confirmation guards; an unconstrained caller may retry after a constrained owner declines instead of inheriting that unrelated `null`. Creation remains serialized across provider discovery, GCM delegation, Core fallback, exact-path reservation, and Templater, and revalidates the Core snapshot immediately before reservation. Core `{{...}}` variables are rendered before the create event. Templater then runs exactly once: Navigator awaits the device's enabled auto-create hook (including delayed folder/regex templates on an initially blank note), or invokes one callable pass when that hook is off or ineligible. It never rewrites Templater output or retries residual delimiters, and it does not process mature existing notes. Only recent/pending files with positive raw-template evidence can recover from a startup race. If an owned Templater pass fails, Navigator atomically appends `<!-- tps-daily-note-template-incomplete:v1 -->` without disturbing leading YAML; that durable marker fails closed across reloads and sync—even if later bytes are appended—until the note is deliberately repaired and the marker removed. **Notebook Navigator** calendar mode remains independent and continues to use its own day/period path and template settings.
- **Calendar-created daily notes** — In Notebook Navigator calendar mode, an explicit daily template remains an override. With no override, day-note creation inherits the enabled Core Daily Notes template, applies Core date/title variables to the target date before the create event, and fails closed before creating folders or a blank note when that configured template is unavailable. Week, month, quarter, and year templates retain their existing explicit-only behavior.
- **One-way setup** — **Import upstream Notebook Navigator settings** always asks for confirmation. It reads only `.obsidian/plugins/notebook-navigator/data.json`, copies recognized upstream settings into the TPS plugin, preserves every TPS-only integration, data-architecture, Type appearance/order, and migration setting, and never writes to upstream state.

The Types toggle, pause-migration marker, Type order mode and retained manual ids, both Type-creation values, all three task-row values, and any user-created per-Type
presentation overrides persist in the TPS plugin's own `data.json`. The first upgrade to 5.16.0 turns off Types collections
and individual GCM task rows once, while retaining every Type preference and leaving task-progress display settings alone.
The migration marker prevents a later explicit opt-in from being undone on reload or sync. A one-way upstream import preserves
these TPS-only Type values. The importer, active route, disclosures, focus, and scroll position do not create extra persisted schema.
On mobile, settings use Obsidian's native stacked rows and the in-navigation Type order editor stacks its selector while
retaining touch-sized controls; the specific-note picker and optional task controls disappear when irrelevant so they do not
consume the viewport.

### Provider behavior and limits

- Provider rows are transient UI records, never fake `TFile` objects. They have one independent row cursor but do not participate in `TFile` selection, multi-select, drag, rename, persistence, or file indexes. File-backed Type collections instead use real native `TFile` rows.
- Providers are queried only for exact paths already present in the current list. Independent providers stream in as they settle, in configured order, without exceeding one global 1,000-row ceiling. During a same-scope refresh, each provider's prior rows remain visible until that provider itself settles, including empty or failed results. Large GCM lists load progressively in bounded 64-note passes, retain completed pass state for the active scope, and cache tasks per path with independent per-note limits and GCM/vault lifecycle invalidation.
- When the enabled provider-id list is empty, the provider layer returns a stable empty scope and skips the otherwise linear visible-note path walk.
- A provider exception is isolated and logged without replacing or blocking the file list.
- A mutable GCM checkbox updates optimistically, rolls back with a visible warning on failure, and refreshes from GCM's file event. Working, holding, and other custom markers render verbatim with an accessible state label. Older compatible GCM APIs retain a labeled display-only checkbox.
- Attached GCM task rows and Type-backed task rows expose the same current GCM task actions. Menu construction and source activation re-resolve the live optional API and fail closed with a visible warning when the task or capability is stale.
- Provider controls own their keyboard and context-menu events, so completing a task cannot accidentally trigger file deletion, selection, or the empty-list menu.
- A provider may expose synchronous row actions through `contextMenu(context)`. The same actions open from desktop right-click, the native mobile long-press context-menu event, or the keyboard-focusable **More actions** button. Failed, asynchronous, and empty builders are isolated and never open a blank menu.
- A separate integration may add matching actions to any current source-backed provider or Type row through
  `menus.registerRowMenu(...)`. Its optional `supports(target)` filter is reevaluated at menu open; loading/error placeholders
  and deleted source files never receive an extension target. Registered actions compose after row-owner actions through the
  same right-click, long-press, and accessible-button path.
- External providers can opt in to a selected Type collection with `supportsTypeScope: true`. They receive the opaque selected Type id and only the exact visible paths represented by the current searched Type rows; providers that do not opt in retain their previous attached-list behavior.
- A Type provider establishes a new top-level collection through `types.registerProvider(...)`. Its owner-row query receives
  the active search text, an abort signal, and every vault-file path allowed by the current Navigator visibility profile. The
  host rejects rows outside that allowlist; ordinary `supportsTypeScope` row providers may then augment only the exact paths
  represented by accepted owner rows. If both registries emit the same `providerId` plus row `id`, the owning Type row wins
  so the virtualized list cannot contain duplicate keys.
- Type-provider catalogs refresh atomically and independently. Invalid or timed-out refreshes retain that provider's last
  valid descriptors, async results are ignored after replacement/unload, and provider callbacks/options remain runtime-only.
- API lifecycle events announce each available and unavailable host instance. Long-lived owners can subscribe once and send
  a point-to-point lifecycle request, then automatically replace their registration handles after a TPS-only hot reload
  without polling, rebroadcasting a request response, or retaining provider state in Navigator. Each loaded host has one
  opaque identity, so a consumer can match teardown to the exact instance instead of ordering hosts by a wall-clock timestamp.
- TPS settings import is a copy, not synchronization. Later upstream setting changes are not mirrored unless the import is explicitly run again.
- Built-in exact-line and cached-range Type rows are a separate virtualized source rather than attached provider contributions, so they are not truncated by the attached-provider 1,000-row ceiling. External Type-provider rows retain the public provider safety ceiling. Plain-text search matches structural row labels and source paths—not block contents; Web-link rows additionally match only their sanitized URL origin. Tag, property, date, folder, and extension facets constrain the owning note. External owners receive the same query before their row ceiling. File-backed Types use the ordinary file search pipeline, while file-only advanced search operators and Omnisearch ranking do not apply to structural/provider-owned collections. The vault-path allowlist is built only for a selected Type scope or a nonempty internal search, then the mixed search reuses the already-built GCM, Obsidian metadata, and bounded Web-link indexes without starting new body reads for each query.

### Task-progress reliability

Task progress remains a note-level display feature when Types collections and individual GCM rows are off. The Markdown
pipeline uses Obsidian metadata when it can and reads a note only when exact counts still require the body. If a task-bearing
note exceeds the mobile/desktop read limit, Navigator retains its last-known counts or leaves a first-time count unknown; it
does not publish a synthetic `0 / 0`. A transient read or parse failure likewise preserves the prior value, leaves the item
eligible for retry, and publishes the recovered exact count after a successful retry.

## Keeping up with Notebook Navigator

Fork-specific integrations live in separate modules and host-global identity is centralized in `src/constants/tpsIdentity.ts`. Inherited source keeps upstream `nn-` CSS/DOM tokens so routine upstream edits merge normally; the test and production build pipelines apply the TPS namespace only at compilation and generated-style boundaries. The same build boundary isolates bundled dnd-kit described-by and live-region IDs, preventing accessibility DOM collisions when upstream and TPS views are open together. The merge-friendly source check rejects accidentally committed runtime prefixes, while the final artifact gate proves that upstream tokens cannot ship. Run `npm run upstream:audit -- <ref>` for a read-only changed-file/conflict worklist, then follow [the upstream sync guide](docs/upstream-sync.md) when merging a later Notebook Navigator tag. A public standalone checkout builds in an explicit build-only mode; the contained test-vault workspace still requires and runs its adjacent atomic runtime deployment hook.

### Merge-friendly namespace maintenance

- `scripts/tps-runtime-namespace.mjs` is the single mechanical transformation used by esbuild, Vitest, and the generated stylesheet builder.
- `npm run tps:namespace:check` verifies inherited source has not been permanently rewritten. `npm run tps:namespace` repairs accidental TPS CSS/DOM prefixes back to their upstream form after a conflict resolution.
- `npm run tps:artifacts:check` verifies the opposite boundary after a build: `main.js` and `styles.css` must contain the TPS runtime namespace and no upstream CSS/DOM namespace.
- This maintenance-only change preserves the exact 4.0.0 runtime bytes while reducing the fork diff from 303 files to 128 files against its current upstream base, including a reduction from 239 to 62 changed files under `src`.

## Release history

### 5.18.2 — popout virtual-list resize recovery

- Fixes the blank lower region that could appear after a popped-out Navigator view or its leaf grew: its
  authoritative `onResize()` recovery event now targets the view container's own window, which is the same window
  TanStack Virtual observes for its scroll element.
- Constructs the event in that owner window as well, preserving the browser-realm contract instead of relying on the
  main application's global `window`.
- Adds a two-window regression proving the popout listener receives the recovery while the primary-window listener
  does not. This backward-compatible patch changes no CSS, settings, note data, or public API and retains minimum
  Obsidian 1.11.0. Test-vault QA reloaded 5.18.2, moved Navigator into a separate popout, then expanded it after the
  startup sampler had expired; rows remained rendered through the visible bottom. Final validation and artifact hashes
  are recorded in `release-notes/5.18.2.md`.

### 5.18.1 — vault-root descendant visibility

- Lets the vault root store and honor its own **Show files from subfolders / descendants** choice instead of forcing every subfolder item into the list.
- Keeps **Search whole vault** explicitly vault-wide without changing the saved root preference.
- Adds focused root persistence, traversal, and search-scope regressions. This backward-compatible patch changes no note content and retains minimum Obsidian 1.11.0.

### 5.18.0 — per-view descendant scope

- Makes **Show files from subfolders / descendants** independent for each folder, tag, and property view instead of routing every toolbar click through one global value.
- Keeps the existing List setting as the default for untouched views. Existing vaults require no migration; a view stores an override only after its toolbar or command-palette toggle is used.
- Preserves the fixed whole-vault root behavior and keeps Type collections independent from folder descendants. Resetting a view's appearance removes its descendant override along with that view's other presentation choices.
- Adds deterministic folder/tag/property resolution, settings sanitization, command routing, and cross-view regressions. This backward-compatible minor release changes no note content and keeps minimum Obsidian 1.11.0. Final validation and artifact hashes are recorded in `release-notes/5.18.0.md`.

### 5.17.0 — typed GCM multi-item property drops

- Accepts one or more selected task rows dragged from GCM TPS List or TPS Table onto Navigator tags and concrete property-value rows, then delegates the guarded exact-line mutation to GCM.
- Uses GCM's configured field type for ordinary file drops as well: list/link/tag values add and deduplicate, scalar values replace, and non-Markdown files use GCM's companion-property store without changing source bytes.
- Task-line drops remain desktop-only and deliberately exclude folders and empty property-key rows. Without compatible GCM `itemProperties` v1, existing Navigator file drag behavior remains available and task-line drops fail closed.
- This backward-compatible minor release adds no setting or note migration. Minimum supported Obsidian remains 1.11.0. Validation details and final artifact hashes are recorded in `release-notes/5.17.0.md`.

### 5.16.1 — Predictable navigator search reset

- Selecting or revealing a folder, tag, property, or Type from the navigation tree, keyboard, picker, list breadcrumb, folder group header, pill, shortcut, toolbar, or row menu now fully dismisses the current search and clears its temporary whole-vault scope before rendering the new navigation base.
- Shift and configured modifier clicks retain their existing additive tag, property, and structural Type behavior without clearing the search. Expansion-only clicks, alternate-tab opens, and saved-search shortcuts remain independent.
- This backward-compatible patch changes no settings or note data. Minimum supported Obsidian remains 1.11.0. Validation details and final artifact hashes are recorded in `release-notes/5.16.1.md`.

### 5.16.0 — Note-focused pause and reliable filtering

- Retains the complete Types implementation and public API behind **Enable Types collections (experimental)**, while pausing Types development and making the collection off by default. A one-time upgrade disables Types and individual GCM task rows, preserves every Type preference, and lets a later explicit opt-in persist normally.
- Cancels and clears exact-line, Markdown-structure, Web-link, and GCM hydration work while Types are off. Properties remains note-frontmatter-only, and the row-provider layer skips its full visible-note scope walk when no provider is enabled. Standard per-note task-progress bars and counts stay available.
- Keeps task-progress counts unknown or last-known for oversized notes and transient read failures, then retries instead of displaying a misleading zero.
- Makes Filter Search fail closed with a visible alert for incomplete filters, unsupported mixed `AND`/`OR`, and Type facets while Types are off. Calendar date selection preserves other facets; relative dates refresh across local midnight/resume; modified files refresh active date queries.
- Validates every saved search's folder, tag, or property start location before changing navigation, provider, or query state. Invalid Filter Searches cannot be saved as new shortcuts.
- This is a backward-compatible minor release because it adds an experimental containment setting and one-time default migration while preserving all APIs, settings, and note data. Minimum supported Obsidian remains 1.11.0. Validation details and final artifact hashes are recorded in `release-notes/5.16.0.md`.

### 5.15.2 — Empty-value property roots

- Makes every property key row represent only notes where the field exists without a value, independently from the descendant toolbar setting. Notes with values remain selectable through their child value rows.
- Aligns property-key list results, counts, shortcut counts, frequency sorting, and active-note reveal with the same no-value meaning.
- Modifier-clicking a property key adds the exact empty-value filter `.key=`; the existing `.key` syntax remains the broader property-presence search.
- Dragging one or more Markdown notes onto a property key writes a bare YAML field such as `description:`. An existing scalar such as `description: true` is replaced with the empty field rather than preserved as a value. Minimum supported Obsidian remains 1.11.0.
- Validation details and final artifact hashes are recorded in `release-notes/5.15.2.md`.

### 5.15.1 — Tag-scoped Type filtering

- Fixes Shift-clicking a built-in Type after selecting a tag. The selected tag now remains the owning-note scope while the Type becomes a search facet, so Type rows such as Checkboxes include untagged task lines inside tagged notes.
- Explicit tag filters in a search continue to apply to individual line rows; only the active navigation tag keeps its normal note-level scoping behavior. Minimum supported Obsidian remains 1.11.0.
- Focused navigation/search coverage and the full 236-file / 2,697-test suite passed, alongside TypeScript, ESLint, Prettier, Stylelint, locale, namespace, operational-identity, and artifact gates. The production-mode build deployed only to the isolated test-vault runtime, which Hot Reload reloaded. With `dailynote` selected, the test-vault query `type:structural:task` showed the task from `Inbox/Daily/2026-08-02.md` beneath Checkboxes. Production was not accessed.

### 5.15.0 — Notebook Navigator 3.3.3 sync

- Integrates public upstream Notebook Navigator 3.3.3 (`7ae7db62`): per-location file-tag/property/task-progress/text-count appearance controls, configurable unfinished-task icons, calendar outside-month days, safer property creation, renamed-view/calendar fixes, and localized settings refinements.
- Adds upstream sort/group defaults and `follow` group order while preserving TPS note/line source selection, calendar-day grouping, multi-value grouping, no-value placement, structural Type appearances, Global Context Menu integration, and explicit one-way upstream-settings import.
- Updates the namespaced What’s New high-water marker so synced settings do not repeatedly show old release notes, and advances the additive TPS public API to 3.4.0 for the four `property-follow` grouping encodings.
- This is a backward-compatible minor release. Existing TPS settings and upstream co-installability remain intact; the unreleased upstream `3.3.4-1` branch is intentionally not included. Minimum supported Obsidian remains 1.11.0.
- Validation passed TypeScript, ESLint, Prettier, Stylelint, locale, namespace, operational-identity, and artifact gates plus all 236 test files / 2,695 tests. The final production bundle deployed only to the reloaded Obsidian Plugin Test Vault runtime, byte-matched its source artifacts, and preserved runtime-owned `data.json`; production was not accessed.

### 5.14.6 — Daily Note template ownership

- Custom-path day notes now inherit the enabled Core Daily Notes template when no Notebook Navigator daily-template override is selected. Explicit Notebook Navigator day and periodic templates remain authoritative and unchanged.
- Core date/title variables are rendered for the target calendar date before the file-create event. Bare `{{date}}` retains Obsidian's `YYYY-MM-DD` default independently from the custom filename, `{{title}}` uses that filename, and Templater's normal create hook sees already-rendered Core variables.
- Automatic creation recovers the saved folder, filename format, and template as one coherent snapshot while Core Daily Notes is still exposing startup defaults, ignores stale saved settings when the Core plugin is disabled, resolves extensionless paths, and validates the template before creating folders or files. Minimum supported Obsidian remains 1.11.0.
- Validation passed 15 focused regressions, all 2,600 tests, TypeScript, lint/style, namespace/identity, artifact, and operational gates, followed by a separate production build. In reloaded Obsidian 1.13.6, the real daily-note command created a custom-path note with the configured template and target-date/title variables; the original configuration was restored, QA files were archived, runtime artifacts byte-matched source, and production remained untouched.

### 5.14.5 — Obsidian-authoritative viewport lifecycle

- Fixes the late desktop path that 5.14.4 did not cover: Obsidian reliably called the view's `onResize()` after leaf activation, tab restoration, pane resizing, and window layout changes, but TPS Notebook Navigator returned immediately on desktop and never forwarded that lifecycle signal to the list virtualizer.
- Adds a TPS-namespaced viewport event scoped to the exact view instance. The list observer force-reports its current rectangle on that authoritative signal even when rounded dimensions match its last DOM sample, recovering TanStack Virtual when its internal cached rectangle—not the element's CSS height—is stale.
- Preserves the established pane flex layout, item measurements, scroll position, Compact behavior, mobile visibility handling, and persisted settings. Focused coverage reproduces a leaf growing after the bounded startup sampler has already expired, and the test-vault UI was exercised by shrinking the live leaf, waiting beyond that window, then expanding it again. Minimum supported Obsidian version remains 1.11.0.

### 5.14.4 — authoritative virtual viewport sizing

- Fixes the persistent desktop blank strip at its virtualizer boundary: the scroll element could finish growing while TanStack Virtual retained its shorter bootstrap viewport rectangle and therefore stopped mounting rows before the visible bottom.
- Replaces row remeasurement and compositor workarounds with one viewport-rect observer that reports the scroll element's real client size, watches the element and its workspace ancestors, responds to window resizes, and samples the brief initialization window for a missed flex-layout delivery.
- Removes the ineffective per-row `translateZ(0)` rule from 5.14.3; standard and Compact rows continue through the same renderer and measurement path.
- Adds focused regression coverage for a silent 400-to-680 px viewport growth, observer cleanup, and the absence of the speculative compositor rule. The root mixed-resource list was also initialized in a short test-vault window and verified after the window grew. Minimum supported Obsidian version remains 1.11.0.

### 5.14.3 — virtual-row paint invalidation

- Corrects the diagnosis behind the persistent desktop blank strip: later rows were still mounted and positioned, but Electron retained the virtual scroller's earlier raster boundary after the Obsidian leaf grew.
- Gives the small overscanned set of desktop virtual rows independent compositing layers so rows below the previous boundary repaint immediately.
- Removes the ineffective desktop grid override and duplicate viewport-remeasurement observer introduced in 5.14.1 and 5.14.2, restoring the established flex and TanStack measurement paths instead of stacking more layout state.
- Keeps mobile, vertical, and single-pane behavior unchanged and adds a generated-namespace-aware paint-contract regression. Minimum supported Obsidian version remains 1.11.0.

### 5.14.2 — virtual viewport resize correction

- Fixes the remaining failure after 5.14.1: the outer pane could fill correctly while the virtualizer continued rendering only the rows calculated for its earlier, shorter viewport.
- Gives the desktop scroll panel and scroller their own definite remaining-height grid track, then observes the actual scroller dimensions and coalesces a virtualizer remeasurement onto the next animation frame after each real size change.
- Prevents resize loops by comparing rounded width and height, preserves mobile/vertical/single-pane contracts, and adds focused viewport-change and generated-CSS coverage. Minimum supported Obsidian version remains 1.11.0.

### 5.14.1 — stable full-height list viewport

- Replaces the desktop horizontal list pane's partial percentage-height/flex workaround with explicit grid rows for the title/search chrome, scroll panel, optional calendar, and toolbar.
- Keeps the scroll panel in the complete remaining-height track when the Obsidian leaf, header, or search bar changes size, preventing the scroller from retaining an earlier shorter height and leaving a blank strip at the bottom.
- Preserves the dedicated mobile, vertical, and single-pane layouts and adds generated-namespace-aware regression coverage for the complete pane-to-scroller height contract. Minimum supported Obsidian version remains 1.11.0.

### 5.14.0 — constructible search creation

- Adds **New matching item** for Filter Searches that select one supported Type and contain only deterministic positive requirements.
- Makes `#hca AND #idea type:structural:task` create a checkbox with both task-local tags through GCM; exact status and inline field requirements are applied too.
- Gives nonempty searches authority over navigation selection so an ambiguous task search cannot accidentally create an unrelated note.
- Keeps ambiguous or unsupported searches visibly disabled with a concrete reason and adds focused planner, GCM payload, and toolbar-visibility coverage. Minimum supported Obsidian version remains 1.11.0.

### 5.13.1 — exact line-tag filtering

- Makes `type:structural:task #tag` and equivalent exact-line searches filter the task's own GCM tags instead of its owning note's tags.
- Prevents note-tag inheritance settings and grouping metadata from admitting an otherwise nonmatching line into search results.
- Preserves navigation, folder, date, extension, and task-state source constraints, plus nested tags, exclusions, untagged searches, and tag/property expressions.
- Adds focused source-scope and row-acceptance regressions. Minimum supported Obsidian version remains 1.11.0.

### 5.13.0 — Base and Canvas creation

- Adds **New base** to the Bases Type view when Obsidian's Bases core plugin is enabled.
- Adds **New canvas** to the Canvas Type view.
- Reuses the established folder-menu creation operations, creates the resource at the vault root, opens it, starts native title rename, and selects it in the Type list.
- Uses database and canvas icons instead of the generic new-note icon and adds focused routing/label coverage. Minimum supported Obsidian version remains 1.11.0.

### 5.12.1 — complete structural root aggregation

- Adds all eight canonical structural collections to the vault-root mixed view: Checkboxes, Bullets, Headings, Code blocks, Callouts, Blockquotes, Tables, and Web links.
- Uses the same visibility-filtered records, source actions, task completion, context menus, and Type section labels as dedicated Type views.
- Suppresses the optional attached GCM task feed only when canonical Checkbox rows are present, avoiding duplicates while preserving fallback behavior.
- Adds focused catalog-selection and provider-deduplication regressions. Minimum supported Obsidian version remains 1.11.0.

### 5.12.0 — complete root scope and compact provider rows

- Makes the selected vault root the mixed all-resources scope by traversing all visible subfolders, while preserving active-profile file visibility and exclusion rules.
- Shows the descendant control as active and fixed at the root; ordinary folder, tag, and property scopes retain the existing user-controlled descendant preference.
- Applies **Compact** appearance to attached task/provider rows and their virtual measurements, not only native files and standalone Type rows.
- Adds focused regressions for root-scope resolution and compact attached-row presentation. Minimum supported Obsidian version remains 1.11.0.

### 5.11.0 — task text drag and flat row chrome

- Makes hydrated task rows draggable on desktop as complete Markdown task-line text for dropping into an editor, without treating the task's source note as the dragged file.
- Applies the transparent native-control reset to attached and Type task rows so checkbox, title, and More controls cannot regain gray button backgrounds from Obsidian or a theme.
- Keeps mobile task rows one line and preserves checkbox completion, selection, source opening, and context menus. Minimum supported Obsidian version remains 1.11.0.

### 5.10.3 — attached task property grouping

- Groups optional GCM task rows in ordinary note, folder, tag, property, and shortcut lists by the task row's own local properties instead of inserting them beneath the source note after grouping.
- An untagged task from a `dailynote` note now enters **No value**; a locally tagged task enters its matching tag group. Newly task-only groups respect the configured **No value group position**.
- Adds a production-shaped regression with an untagged and `career` task sourced from a `dailynote` note. Minimum supported Obsidian version remains 1.11.0.

### 5.10.2 — legacy inheritance-default migration

- Migrates a persisted `line-first` value left by the former default to `none` once, so existing vaults actually receive task-local grouping after upgrading.
- Preserves explicitly different `note-first` and `combine` choices; users can select `line-first` again after migration. Minimum supported Obsidian version remains 1.11.0.

### 5.10.1 — untagged task grouping correction

- Treats an empty GCM task tag list as authoritative, preventing an untagged task from retaining the owning note's raw `tags` value and appearing in that note-tag group.
- Adds a regression for an untagged task whose raw record contains `dailynote`. Minimum supported Obsidian version remains 1.11.0.

### 5.10.0 — unmatched group placement

- Adds **No value group position** to the property grouping menu with **Top** and **Bottom** choices.
- Applies the saved choice to both note/file property groups and structural task/line property groups. Existing appearances default to **Bottom**.
- Adds regressions for both presentation paths, menu availability, and settings persistence. Minimum supported Obsidian version remains 1.11.0.

### 5.9.0 — task-only property grouping by default

- Makes **Do not inherit note properties** the default for Checkboxes, Bullets, and Headings, so tag/property grouping reflects only values written on the task or line.
- Keeps all three opt-in note-inheritance modes and preserves an existing explicitly saved choice.
- Shows **Property inheritance (sort and group)** in the combined sort/group menu for every line-backed Type, even when the current sort is not a property sort.
- Adds regressions for default grouping, property search, settings persistence, and menu availability. Minimum supported Obsidian version remains 1.11.0.

### 5.8.8 — attached mobile task-row promotion

- Fixes the actual branch shown in the reported iPhone screenshots: checkbox rows attached to a folder, shortcut, date, or mixed collection were still using the generic provider-row renderer, so earlier standalone-Type styling never applied.
- Any checkbox provider row is now promoted to file/Note-row presentation on mobile. The renderer, selection adjacency, separators, and virtualizer all use the same classification.
- Attached-row rendered-markup regression coverage now proves the mobile output has one title row, no source metadata, and transparent native-reset controls; desktop attached rows remain unchanged.
- No settings or note-data migration is required. Minimum supported Obsidian version remains 1.11.0.

### 5.8.7 — runtime-enforced mobile task markup

- Moves the mobile task contract out of CSS alone: structural row markup now detects Obsidian mobile at runtime, fixes the title to one row, and does not render source metadata at all.
- Applies inline native-control resets to the task title, checkbox, and More controls so gray iOS button chrome cannot survive a stale, reordered, or partially refreshed stylesheet.
- Adds a rendered-markup regression proving a nominally two-row, noncompact task becomes one line on mobile, omits its secondary label, and emits three transparent, appearance-free, shadowless controls.
- No settings or note-data migration is required. Minimum supported Obsidian version remains 1.11.0.

### 5.8.6 — enforced one-line mobile task parity

- Removes the remaining iOS/theme gray button surfaces from mobile structural rows with a complete title-button reset and narrowly scoped, cascade-resistant transparent checkbox and More controls.
- Mobile structural rows now always show one title line and no source-metadata line. Their virtual height ignores both configured multi-line titles and provider secondary labels, eliminating the invisible height that previously survived visual CSS changes.
- Documents the mobile structural-row acceptance contract in the main behavior specification and adds regression assertions for one-line truncation, hidden secondary content, transparent controls, and matching virtualization measurements.
- No settings or note-data migration is required. Minimum supported Obsidian version remains 1.11.0.

### 5.8.5 — exact mobile row parity and visible Type scope

- Makes Checkboxes and other structural Type results use the same mobile title, spacing, padding, icon-slot, and virtualization measurements as ordinary Notes; the checkbox is the only intentional leading-icon difference.
- Removes the task-only 44–48 px control floor, forced two-line wrapping, and extra content padding that made checkbox rows visibly larger than note rows.
- Opening Search while **Types / Checkboxes** is selected now immediately writes `type:structural:task` into the search bar, making the visible query the source of truth before any further text or facets are added.
- Loads the always-required English locale through the normal module path so the complete test suite can validate search activation reliably. No settings or note data migrate. Minimum supported Obsidian version remains 1.11.0.

### 5.8.4 — native note-row control reset

- Ensures task titles, source metadata, checkbox controls, and More actions blend into the same flat background as normal note rows under Obsidian and theme button rules.
- Higher-specificity file-row resets remove inherited borders, fills, shadows, and native button appearance without relying on `!important`.
- The checkbox remains the only visual replacement for the normal leading file icon. Minimum supported Obsidian version remains 1.11.0.

### 5.8.3 — quiet mobile task rows

- Removes the stacked gray card/button treatment from mobile checkbox rows and restores a clean, full-width list appearance.
- Title/source, checkbox, and More actions controls explicitly use transparent, shadowless native-reset surfaces; hover, focus, and selected states remain visible.
- Two-line title wrapping, readable source metadata, and touch-sized controls remain unchanged. Minimum supported Obsidian version remains 1.11.0.

### 5.8.2 — exact task-tag grouping

- Fixes tagged checkbox rows appearing under `None` or an owning-note tag even though the task context menu shows the task's exact tags.
- Hydrated tasks now carry GCM's task-local hashtags into the structural row `tags` property, so line-first and combined grouping use the real task values.
- Tasks without local tags still inherit note tags according to the configured inheritance mode. Minimum supported Obsidian version remains 1.11.0.

### 5.8.1 — symmetric search-bar scope synchronization

- Fixes the reverse source-of-truth path: adding a tag, property, or date while Checkboxes is selected now preserves `type:structural:task` explicitly in the search bar.
- The exact Checkboxes → `#hca` sequence now produces `type:structural:task #hca` instead of leaving the Type scope implicit.
- This backward-compatible patch changes no settings or note data. Minimum supported Obsidian version remains 1.11.0.

### 5.8.0 — search-bar navigation source of truth

- When a navigation selection is extended with a structural Type facet, the current selected tag or property value is first materialized in the search bar.
- Selecting `status = todo` and then adding Checkboxes now shows `.status=todo type:structural:task`; special Tagged and Untagged selections use `#` and `-#` respectively.
- Existing facets are detected and retained without duplication, so the visible query fully describes the displayed intersection. Minimum supported Obsidian version remains 1.11.0.

### 5.7.1 — structural row property filtering

- Fixes property selections such as `.status=todo` showing no results under **Checkboxes** even when matching tasks are counted in Properties.
- Structural Types now evaluate property clauses against each row's effective line/note properties using the selected inheritance mode instead of requiring the owning note to carry the value.
- No settings or note-data migration is required. Minimum supported Obsidian version remains 1.11.0.

### 5.7.0 — mobile task-list layout

- Makes Checkboxes and other exact-line Type results read as compact task cards on mobile instead of compressed desktop rows.
- Allows task titles to wrap to two lines, keeps source metadata legible, and gives the primary row and More actions control reliable touch targets.
- Keeps desktop presentation and task behavior unchanged. Minimum supported Obsidian version remains 1.11.0.

### 5.6.2 — selected-Type search isolation

- Keeps ordinary searches scoped to the selected Type, so filtering Checkboxes cannot inject Notes or other Type collections into the result list.
- Explicit `type:` search facets can still request a mixed-Type result surface.
- Adds focused regression coverage for ordinary and explicit multi-Type searches. Minimum supported Obsidian version remains 1.11.0.

### 5.6.1 — built-in Type row subscription repair

- Fixes populated built-in Type counts opening an empty list, including Checkboxes.
- Built-in rows and their task actions now consume the same direct shared index snapshot; external provider Types continue through the aggregate API.
- Adds focused routing regression coverage. Minimum supported Obsidian version remains 1.11.0.

### 5.6.0 — multi-value group instances

- Adds a per-view multi-value grouping choice to the Sort and Group menu.
- Defaults property grouping to one instance per value for notes, tasks, and other structural rows.
- Preserves the previous combined comma-separated group as an explicit option.
- Deduplicates repeated values within a row and gives repeated visual instances stable unique keys.
- Tested in the isolated test vault; minimum supported Obsidian version remains 1.11.0.

### 5.5.2 — populated Type selection reliability

- Fixes built-in source-backed Types such as Checkboxes showing a populated navigation count but an empty list pane after selection.
- The selected Type snapshot is already filtered by the same authoritative visibility scope used for its displayed count. Ordinary selection no longer applies a second independently memoized source allowlist that could transiently be empty or stale.
- Active Filter Search still applies its narrower owning-note source scope, preserving folder, tag, property, date, and visibility facets during search.
- This backward-compatible patch changes no settings or note data. Minimum Obsidian remains 1.11.0.

### 5.5.1 — line values in Properties

- The Properties navigation tree now includes configured property values authored on visible tasks, bullets, and headings instead of indexing only owning-note frontmatter.
- Mapped task workflow status is included even when GCM intentionally avoids writing a redundant inline `status` field, so tasks in the `todo` state expose **Status → todo**.
- Line-derived values retain the existing vault visibility rules and point back to their owning source note. Authored line Status takes precedence over the derived task status, and duplicate values collapse into one option.
- This backward-compatible patch requires TPS Global Context Menu Entity Index v3 for exact-line values. Without GCM, ordinary note-property navigation remains unchanged. Minimum Obsidian remains 1.11.0.

### 5.5.0 — structural line-property inheritance

- Fixes Checkboxes, Bullets, and Headings so their property sort and grouping resolve the line's own GCM fields by default instead of grouping every line by its owning note's frontmatter.
- Adds the shared **Property inheritance (sort and group)** selector with note-first, line-first, and combined modes. The choice is stored per structural Type and survives settings reloads.
- Combined mode de-duplicates matching note and line values before sorting/grouping; empty line values remain empty rather than silently replacing an authored value.
- Validation: all 229 test files and 2,547 tests, lint with no errors, namespace and identity gates, TypeScript production build, artifact checks, and test-vault deployment. No production vault access.

### 5.4.0 — day-grouped tasks, Type creation, and Web links

- Keeps exact GCM task, bullet, and heading fields ahead of owning-note frontmatter for property sorting, so fields such as
  task `scheduled` and canonical task `status` describe the line itself.
- Adds a per-view **Property source** grouping control for Checkboxes, Bullets, Headings, and active mixed searches. **Note
  properties** uses only owning-note frontmatter, while **Line properties** uses only exact GCM line fields; blank or missing
  line values stay in **No value** and never inherit an unrelated note value. Notes and other file rows always use frontmatter.
- Adds a separate calendar-day grouping choice for configured properties. Exact datetime grouping remains the unchanged
  default, while the day form buckets timestamps by their written local `YYYY-MM-DD`, sorts the groups chronologically, and
  keeps missing or invalid values in the trailing **No value** group. Existing per-Type views need no migration.
- Adds source-backed Type creation for Checkboxes, Bullets, Headings, Code blocks, Callouts, Blockquotes, Tables, and Web
  links. The default target is today's daily note; settings can instead select the active note or one existing Markdown
  note. A missing Daily Note is created through its configured folder, format, and template, and a blank target accepts the
  scaffold. Writes are atomic and focus the inserted source position, while Checkboxes use GCM's canonical create path.
- Adds **Web links** as a fixed, searchable Type. A bounded, stat-cached local Markdown scan indexes authored HTTP(S)
  Markdown links, angle autolinks, and bare URLs without network requests; excludes YAML, comments, hidden TPS carriers,
  Markdown images, and code; exposes only each URL origin; and revalidates the exact source before opening the owning note.
- Advances the additive public API to 3.3.0 with `types.webLinksId`, calendar-day property grouping, and explicit
  `line-property...` exact/day encodings. Historical `property...` encodings remain note-frontmatter-only. Plugin 5.4.0
  remains backward compatible with Obsidian 1.11.0 and requires no settings or note migration. Generic line-property
  grouping is coordinated with TPS Global Context Menu 1.18.0.
- Validation passed 229 test files and 2,547 tests on Node 24 plus TypeScript, formatting, ESLint, stylesheet, namespace,
  operational-identity, and artifact gates. In reloaded Obsidian 1.12.7 inside the isolated test vault, a missing Daily
  Note was created and received the Web-link scaffold, private URL paths stayed out of results while origin search worked,
  activation opened the owning source, exact task datetimes separated, day mode combined same-day tasks, Line properties
  used exact task values, and missing line values stayed in **None** without note fallback. The temporary view/settings
  were restored and both synthetic notes were moved directly to `_archive`; production was not accessed.

### 5.3.1 — full-height desktop list viewport

- Fixes a desktop horizontal-layout edge case where the list scroller could retain an intrinsic or earlier height after
  the Obsidian leaf became taller, leaving the bottom of grouped property and Type results unusable.
- Gives the horizontal list pane an explicit full-height/min-height contract and a zero-basis inner flex panel so its
  scroller grows and shrinks with the complete pane instead of stopping above the footer.
- Adds a generated-namespace-aware stylesheet regression for the pane → panel → scroller height chain. This is a
  backward-compatible patch with no settings, data, public API, or note migration; minimum Obsidian remains 1.11.0.
- Validation passed the focused 8-test stylesheet suite and the complete 226-file, 2,475-test suite, plus formatting,
  TypeScript, ESLint, stylesheet, namespace, operational-identity, and artifact gates. Obsidian 1.12.7 was reloaded only
  in the isolated test vault and the desktop list viewport was inspected after the final build; production was not
  changed.

### 5.3.0 — searchable, sortable structural Types

- Adds Sort and Group controls to Checkboxes, Bullets, Headings, Code blocks, Callouts, Blockquotes, and Tables. Source rows
  support row-title sorting plus owning-note filename, configured created/modified timestamp, and configured non-manual
  frontmatter property sorting, with missing values last; grouping is intentionally limited to compatible dates and
  configured non-manual owning-note properties, while Custom means ungrouped because custom headers are file-owned.
- Makes any nonempty internal Filter Search started from a fixed Type search the complete fixed Type catalog: native file
  matches remain ordinary rows and matching source-backed Types appear in labeled sections. Search from folders, tags, and
  properties retains that navigation scope, and every mixed structural row keeps its Type identity.
- Adds stable `type:<fixed-id>` and `-type:<fixed-id>` facets plus additive Shift-click navigation for tags, properties, and
  fixed Types. Multiple positive Types form a union while the Type dimension continues to intersect with the other filters.
- Keeps the bounded scope explicit: source rows do not gain file multi-select, drag, pinning, rename, manual/folder grouping,
  or display-mode editing; external provider Types keep their existing provider-owned presentation and search behavior.
- Advances the additive public API to 3.2.0: fixed source-backed Type scopes accept their supported sort/group subset, and
  mixed structural rows expose the fixed Type id that owns each result.
- Verification passed 385 focused tests and the complete 226-file, 2,474-test suite, plus TypeScript, formatting, ESLint,
  stylesheet, namespace, operational-identity, and artifact gates. Obsidian 1.12.7 was reloaded in the isolated test vault;
  live desktop QA confirmed the bounded structural Sort/Group menu, mixed Notes/Checkboxes/Bullets search, and direct Code
  blocks filtering. Modifier composition is covered through the exact Tag → Shift-Checkbox → Shift-Tag integration path;
  mobile interaction remains markup, shared-logic, and responsive-CSS tested rather than physical-device automated.

### 5.2.0 — customizable Types navigation order

- Adds in-place Types ordering to **Reorder navigation**, with **Default order**, **Name: A to Z**, **Name: Z to A**,
  **Most items first**, **Fewest items first**, and **Manual order** modes.
- Keeps alphabetical and quantity modes live as the visibility-filtered catalog and counts change. External provider
  collections without published counts remain after counted Types, and the editor shows current counts beside the rows.
- Adds per-Type up/down controls and desktop/mobile drag reordering; either manual action switches the active mode to
  **Manual order**. Mobile stacks the selector and uses touch-sized buttons plus handle-only dragging; very narrow desktop
  panes prioritize labels and reveal row arrows on hover or keyboard focus.
- Persists the selected mode and manual Type ids in TPS Notebook Navigator's `data.json`, preserves temporarily unavailable
  provider ids, appends newly discovered Types without disturbing saved positions, and keeps one-way upstream imports from
  overwriting the TPS-only order.
- Leaves the provider-neutral API catalog canonical and unchanged; customization affects only navigation presentation.
- Remains backward compatible with public API 3.1.0 and Obsidian 1.11.0 or newer. Existing settings need no migration;
  missing order fields use **Default order** until the user chooses another mode.
- Validated with 222 Vitest files and 2,425 tests plus TypeScript, ESLint, Prettier, stylesheet, source-namespace,
  operational-identity, and artifact-identity gates. The final production-mode build was deployed and reloaded only in the
  isolated test vault; the desktop reorder editor, selector, readable narrow-pane labels, and per-row controls were visually
  verified without changing the saved order.
- Mobile behavior is covered by component markup and responsive-style regression checks but was not automated on a real iOS
  device. Quantity order can move as live counts change, collections without a published count stay after counted Types, and
  very narrow desktop panes temporarily hide counts to preserve label and arrow space.

### 5.1.0 — more Markdown structure Types

- Adds **Code blocks**, **Callouts**, **Blockquotes**, and **Tables** directly after Headings in the flat Types catalog.
- Builds the four collections read-free from Obsidian's root-level section cache, updates only the changed path after metadata
  events, and removes or rekeys records immediately on delete and rename.
- Gives each structure row native file-list presentation, owning-note and source-range context, search, single selection,
  keyboard navigation, and guarded source activation. Rows with an existing block id follow that id when it moves; stale
  range-only locators fail closed.
- Keeps the four collections independent from GCM availability. Their transient source-range rows do not yet support drag,
  file multi-select, pinning, rename, or persistent row selection.
- Advances the additive public API to 3.1.0 with stable ids for the four collections. Plugin and API compatibility remain
  backward compatible, no setting or note migration is required, and minimum supported Obsidian remains 1.11.0.
- Regression validation covers 219 files and 2,410 tests, including parser whitelisting, root-level nesting behavior,
  read-free indexing, incremental refresh, delete/rename lifecycle, stale-locator protection, block-id movement, independent
  source availability, native row icons/ranges, API ids, and the existing full suite.

### 5.0.0 — structural Types with native file presentation

- Replaces frontmatter-driven Kind navigation with one flat built-in catalog: Notes, Checkboxes, Bullets, Headings, Bases,
  Canvas, Drawings, PDFs, Images, Audio, and Video.
- Sends file-backed Types through the ordinary Navigator file pipeline so they inherit native rows, icons, properties,
  previews, sorting, grouping, search, selection, menus, drag behavior, and opening behavior.
- Restyles exact-line Checkboxes, Bullets, and Headings to match ordinary file rows while preserving line-specific icons,
  task controls, exact-source activation, accessible actions, and mobile touch targets.
- Keeps every file-backed collection usable without GCM and limits the optional Entity Index dependency to exact-line
  content. File classification is read-free, single-pass, cached, and refreshed on relevant vault or metadata changes.
- Advances the public API to 3.0.0. The major versions reflect removal of discoverable/navigable Kind collections;
  deprecated Kind-id parsers remain only for stale-state compatibility. No settings or note-data migration is required,
  and minimum supported Obsidian remains 1.11.0.
- Adds optional per-Type sort and appearance records only when the user changes a fixed file-backed Type's presentation;
  existing settings inherit the normal defaults without migration.
- Validated with 218 Vitest files and 2,380 tests plus TypeScript, ESLint, Prettier, stylesheet, source-namespace,
  operational-identity, and artifact-identity gates. The separate final build deployed to the isolated test vault;
  Obsidian 1.12.7 was reloaded and live-checked for the complete flat catalog with no Kinds branch, native Notes and Bases,
  native-styled Checkboxes and Bullets, exact-line activation, zero-result empty state, and side-by-side upstream/TPS use.
  Production was untouched.

### 4.11.0 — controllable, selectable TPS rows

- Makes attached and Type-backed entity rows first-class transient selections, with pointer and keyboard navigation,
  Enter activation, immutable selection events, exact-row focus, and accessible current-row semantics without turning
  rows into fake files or persisted selection state.
- Adds the pull-based public `list` API for inspecting the current composed row order and safely controlling search plus
  per-scope sort, grouping, and display choices. Snapshots distinguish requested, effective, and actually applied search
  state; presentation writes validate atomically and roll back if persistence fails.
- Keeps **Types** enabled by default with Notes, Checkboxes, Bullets, Headings, and dynamic Kinds. Structural line rows
  open their exact current source line, note entities open their note, and current rows expose the same guarded menu path
  on desktop and mobile.
- Adds an operational-identity CI gate so documentation and maintenance commands cannot accidentally target upstream
  Notebook Navigator's runtime while both plugins remain installed side by side.
- Adds an opaque per-host lifecycle identity so integrations distinguish the current host's unload from a retiring host's
  late event, including same-millisecond transitions and wall-clock rollback.
- Backward-compatible minor release with no settings or note-data migration. Public API advances to 2.13.0 and minimum
  supported Obsidian remains 1.11.0.
- Validated with 215 Vitest files and 2,308 tests plus TypeScript, ESLint, Prettier, stylesheet, CSS namespace,
  operational-identity, and artifact-identity gates. The separate final build deployed byte-matching artifacts to the
  isolated test vault; Obsidian 1.12.7 was reloaded and verified for side-by-side upstream/TPS installation, every Type
  collection, exact-line activation, GCM note and task menus, and ordinary folder navigation. Runtime `data.json` stayed
  in place, with only the plugin-owned `lastShownVersion` marker advancing during reload. Production was untouched.

### 4.10.0 — cancellation-safe provider rows

- Adds query-only `NavigatorRowProviderQueryContext.signal` in public API 2.11.0 while keeping the longer-lived
  subscription context and existing provider implementations compatible.
- Cancels obsolete ordinary-row work on scope, Type, search-derived path, selection, revision, options, unregister, view
  teardown, timeout, and plugin-unload transitions. Every provider invocation owns an independent signal; supersession is
  silent, while a timeout remains an isolated provider failure.
- Makes GCM task scans transactional across the complete bounded pass. Aborted work launches no later batch, publishes no
  snapshot, writes no task or scope cache, clears no dirty path, and schedules no progressive refresh.
- Captures a provider's validated ID for its complete registration lifetime and validates replacement options before
  cancelling current work, so externally mutated objects or rejected updates cannot leak or disrupt a valid registration.
- Preserves the default-on Types hierarchy—Notes, Checkboxes, Bullets, Headings, and dynamic Kinds—and its direct note or
  exact-source-line activation behavior.
- Adds no setting, persisted state, note-data migration, or minimum-version change; Obsidian 1.11.0 remains supported.
- Validated with 208 Vitest files and 2,263 tests plus formatting, ESLint, TypeScript, stylesheet, source-namespace,
  artifact-identity, and production-build gates. Live Obsidian 1.12.7 QA confirmed the reloaded Types hierarchy,
  standalone Checkbox and Bullet collections, exact-source activation for both, and an unaffected ordinary folder list.

### 4.9.1 — fail-closed Type menu construction

- Prevents a Promise-returning Type action builder from opening a partial menu when it synchronously added an item before
  returning its Promise.
- Suppresses the complete Type-only menu attempt when a builder fails after committing an item or when an item initializer
  throws or returns a Promise; rejected Promises are observed and delayed additions remain ignored.
- Preserves immediate, exact native `MenuItem` initializer timing for every public menu hook. Composed file, folder, tag, and
  property menus keep already-committed synchronous actions and accurate separator counts instead of dropping host actions.
- Gives duplicate file, folder, tag, property, and Type callback registrations independent, idempotent disposal lifetimes.
- Requires no API-version, settings, persistence, or note-data migration and keeps the minimum supported Obsidian version at
  1.11.0.
- Validated with 208 Vitest files and 2,240 tests plus formatting, ESLint, TypeScript, stylesheet, source-namespace,
  artifact-identity, and production-build gates. Live Obsidian 1.12.7 QA confirmed an invalid async Type builder suppresses
  a healthy sibling action without consuming the event, logs the contract violation, and restores the healthy menu
  immediately after only the invalid registration is disposed.

### 4.9.0 — integration-owned result row actions

- Adds `menus.registerRowMenu(...)` in public API 2.10.0 for attached rows plus Notes, Checkboxes, Bullets, Headings,
  dynamic Kind entities, tasks, and externally owned or augmenting Type rows.
- Supplies a frozen, current-file target with provider/row/kind identity, optional zero-based source line, selected Type id,
  and immutable checkbox state while keeping mutation callbacks and the host `Menu` private.
- Adds an optional synchronous `supports(target)` filter so unrelated rows do not gain an action affordance; registration and
  disposal refresh open virtualized lists immediately.
- Composes row-owner and registered actions through the same desktop right-click, native mobile long-press, and
  keyboard-accessible **More actions** path. Stale source files, empty builders, failed items, delayed additions, and
  thrown/rejected integrations are isolated and do not open a blank menu.
- Requires no settings, persistence, or note-data migration and keeps the minimum supported Obsidian version at 1.11.0.
- Validated with 208 Vitest files and 2,232 tests plus formatting, ESLint, TypeScript, stylesheet, source-namespace,
  artifact-identity, and production-build gates. Live Obsidian 1.12.7 QA confirmed the visible Types hierarchy, exact-source
  checkbox activation, native GCM actions followed by a temporary registered action, immutable current target delivery,
  and immediate action removal after disposal.

### 4.8.0 — integration-owned Type collection actions

- Adds `menus.registerTypeMenu(...)` in public API 2.9.0 so another TPS plugin can attach actions to built-in,
  dynamic Kind, and externally registered Type collection rows without depending on navigation internals.
- Routes desktop right-click and native mobile long-press through one current descriptor lookup, including collections
  with no result rows, so providers can expose creation, capture, refresh, or configuration actions where the user is
  already browsing that Type.
- Gives each callback a frozen `{ addItem, typeId, descriptor }` context, isolates thrown and rejected failures, ignores
  delayed additions, and never opens a blank menu when no synchronous item is contributed.
- Preserves existing provider-row actions and the Types/Kinds container-menu behavior. Registrations remain runtime-only;
  no settings, persisted state, or migration is added, and minimum supported Obsidian remains 1.11.0.
- Validated with focused API, declaration, lifecycle, built-in/Kind/external routing, stale-descriptor, empty-menu,
  desktop/mobile context-event, and section-root regressions plus the full project release gates and test-vault reload.

### 4.7.1 — complete and discoverable Types navigation

- Removes the external-provider 1,000-row ceiling from built-in Notes, Checkboxes, Bullets, Headings, and GCM Kind
  collections, so their visible count and virtualized result list now describe the same complete set.
- Keeps externally owned and augmenting Type rows under the existing shared 1,000-row safety ceiling, including
  owner-first ordering and duplicate-identity protection.
- Inserts Types immediately after Folders when normalizing a legacy saved navigation order that predates Types, while
  preserving an existing custom Types placement and every other user-ordered section.
- Requires no settings, API, or note-data migration and keeps the minimum supported Obsidian version at 1.11.0.
- Validated with focused large-collection and legacy-order regressions, the full test suite, production build gates, and
  live test-vault verification of the Types placement, five-digit Bullet count, and exact-line Bullet activation.

### 4.7.0 — hot-reload-safe provider lifecycle

- Adds API `2.8.0` with `tps:notebook-navigator-api-changed` availability announcements and a guarded,
  point-to-point `tps:notebook-navigator-api-request` handshake for late-loading integrations.
- Announces unavailability before the current Rows and Types registries are disposed, then announces the replacement API
  only after startup registration completes, so long-lived providers can replace stale handles after a TPS-only reload.
- Isolates malformed, throwing, and rejected consumers from Navigator startup and shutdown; lifecycle callbacks, API state,
  and provider registrations remain runtime-only and are never persisted.
- Strengthens the co-install artifact gate around the host-global Style Settings ID and the actual upstream shortcut drag
  MIME, with fixtures that fail if either upstream identity reappears.
- Requires no settings or note-data migration and keeps the minimum supported Obsidian version at 1.11.0.
- Validated with 205 Vitest files and 2,182 tests plus formatting, ESLint, TypeScript, stylesheet, namespace, and artifact
  gates. The reloaded test vault covered the current API request and a TPS-only disable/re-enable sequence with unavailable
  and available transitions around a new API instance.

### 4.6.0 — externally owned Type collections

- Adds `types.registerProvider(...)` in public API 2.7.0 so integrations can define top-level **Types** collections and supply
  note or line rows without depending on GCM internals.
- Gives providers host-owned opaque ids, async catalog and row cancellation, five-second timeouts, deterministic ordering,
  atomic last-good refreshes, and idempotent options/unload cleanup.
- Applies Navigator visibility before rendering provider-owned rows, forwards the active Type search, hides misleading
  pre-query counts, and preserves activation, checkbox, and context-menu parity through the existing guarded row renderer.
- Tracks readiness and missing-item authority per provider so one failing integration cannot poison another, late plugin load
  cannot erase restored navigation, and explicit removal still falls back safely.
- Requires no settings or note-data migration and keeps the minimum supported Obsidian version at 1.11.0.
- Validated with 202 Vitest files and 2,169 tests plus formatting, ESLint, TypeScript, stylesheet, namespace, and artifact
  gates. The reloaded test vault covered built-in checkbox/bullet activation and an external Type provider's navigation,
  search, checkbox mutation, context-menu action, exact-line activation, and unregister fallback.

### 4.5.0 — programmatic Types control

- Adds a provider-neutral, immutable public catalog for discovering structural and dynamic Kind Type collections without
  importing or depending on GCM internals.
- Adds stable structural ids, Kind id build/parse helpers, immediate live subscriptions, and terminal readiness handling under
  API `2.6.0`.
- Adds `navigation.navigateToType(typeId)` and routes UI clicks plus back/forward history through the same guarded resolver.
- Expands **Types** and **Kinds**, preserves the requested focus mode, scrolls the target into view, and rejects missing ids only
  after a complete authoritative catalog snapshot.
- Requires no settings or note-data migration and keeps the minimum supported Obsidian version at 1.11.0.

### 4.4.0 — task control and isolation parity

- Gives attached GCM tasks the same guarded right-click, mobile long-press, and **More actions** menu as task-backed Type rows.
- Re-resolves current GCM task/menu/navigation capabilities at action time, refreshes when `taskLines` is added, replaced, or removed, and fails closed with a visible warning for stale tasks.
- Preserves custom checkbox markers such as working or holding states instead of replacing every state with blank/✓, including accessible state labels.
- Gives bundled dnd-kit described-by and live-region elements TPS-only ID prefixes so upstream and TPS Navigator views do not emit duplicate accessibility DOM IDs.
- Adds `npm run upstream:audit -- <ref>`, a deterministic read-only changed-file and merge-conflict worklist for future upstream syncs.
- Requires no settings, API, or note-data migration; public API remains 2.5.0 and minimum supported Obsidian remains 1.11.0.

### 4.3.0 — interactive and extensible Types

- Makes task-backed Type rows interactive in both **Checkboxes** and dynamic Kind collections, while unmatched or stale task entities remain safely open-only.
- Uses GCM's canonical configured completion path, validates the effective state before accepting optimistic UI, refreshes after GCM file updates, and exposes the full GCM task menu through a restricted item/separator facade.
- Batches task hydration, retains a bounded 2,048-path LRU keyed by source metadata, and invalidates exact paths on GCM events, native vault edits, and Navigator checkbox mutations so large vaults do not reread every task file on routine refreshes.
- Lets external row providers explicitly opt in to standalone Type scopes without duplicating the built-in GCM task provider or repeating contributions for notes with multiple matching entities.
- Advances the public API to 2.5.0 with `selectionType: 'type'`, opaque `selectedType`, `supportsTypeScope`, and synchronous `addSeparator()` support.
- Corrects provider-row virtualization to reserve 54 px on desktop and 57 px on mobile, with 44 px mobile checkbox, open, and More targets.
- Requires no settings or note-data migration and keeps the minimum supported Obsidian version at 1.11.0.

### 4.2.0 — first-class Types navigation

- Adds an expandable **Types** navigation section with Notes, Checkboxes, Bullets, Headings, and dynamic Kind collections from GCM Entity Index v3.
- Opens note entities directly and re-resolves line locators immediately before opening checkbox, bullet, heading, or Kind-backed line entities at their current source line.
- Applies active Navigator visibility rules to both collection counts and results, keeps selection/history/keyboard/mobile behavior native, and prevents file-only actions from mutating a virtual Types list.
- Adds the default-on **Show Types in navigation** setting without importing or overwriting it from upstream settings.
- Advances the public API to 2.4.0 with a `type` navigation item while preserving existing folder/tag/property/none result shapes.
- Requires no note or settings migration, keeps the minimum supported Obsidian version at 1.11.0, and treats GCM 1.14.0 Entity Index v3 as the tested Types baseline.
- Validated with 195 Vitest files and 2,067 tests, formatting, ESLint, TypeScript, stylesheet and TPS namespace gates, a production build deployed to the test vault, an Obsidian 1.12.7 plugin reload, and live interaction checks for every structural collection plus note-backed and line-backed Kinds.

### 4.1.0 — provider actions and resilient composition

- Advances the public Rows API to 2.3.0 with optional synchronous `contextMenu(context)` actions for any provider row.
- Opens the same guarded actions from desktop right-click, native mobile long-press, or an accessible **More actions** button without exposing the host menu to providers.
- Streams independent providers as each settles while preserving configured order and one true 1,000-row global budget.
- Retains each unresolved provider's prior rows during same-scope refreshes, preventing GCM and external rows from flickering while another provider is slow.
- Preserves GCM checkbox mutation, exact-line activation, ordinary file navigation, and the co-installable TPS/upstream identity boundary.
- Requires no settings or note-data migration and keeps the minimum supported Obsidian version at 1.11.0.

### 4.0.0 — isolated TPS fork

- Establishes a major-version identity and storage boundary from inherited Notebook Navigator 3.x releases.
- Adds the generic provider-row contract and optional TPS Global Context Menu task rows.
- Adds interactive task completion through GCM with a display-only compatibility fallback.
- Keeps large/root task lists responsive with bounded progressive loading, fair per-note allocation, lifecycle-aware refresh, and global/cache safety limits.
- Adds an explicit, one-way import for recognized upstream settings.
- Adds a repeatable upstream merge/namespace workflow so future Notebook Navigator updates can be integrated without rediscovering fork isolation rules.
- Keeps upstream and TPS instances co-installable; no production vault or upstream plugin state is mutated by installation.
- Validates the interactive provider against TPS Global Context Menu 1.13.1, including cross-plugin file identity, exact-line focus, optimistic checkbox mutation, and rollback-safe refresh behavior.
- Tested with the complete inherited Vitest suite, focused fork/integration regressions, typechecking, linting, production build, test-vault deployment/reload, and side-by-side UI QA. Exact results and artifact hashes are recorded in the GitHub release.

## Upstream feature reference

The documentation below describes the inherited Notebook Navigator feature set. Upstream translations and tutorials are available at [notebooknavigator.com](https://notebooknavigator.com/docs.html). TPS-only behavior and release verification are specified in this repository.

![Notebook Navigator Screenshot](https://github.com/johansan/notebook-navigator/blob/main/images/notebook-navigator.png?raw=true)

<!-- DOCUMENTATION_START -->

## 1 Installation

1. **Install Obsidian** - Download and install from [obsidian.md](https://obsidian.md/)
2. **Enable community plugins** - Go to Settings → Community plugins → Turn on community plugins
3. **Install BRAT** - Install the BRAT community plugin, then add `ZachTish/tps-notebook-navigator`
4. **Enable TPS Notebook Navigator** - The upstream `notebook-navigator` plugin may remain enabled at the same time
5. **Install Style Settings (optional)** - For customizing colors and appearance, install [Style Settings](https://github.com/mgmeyers/obsidian-style-settings) plugin by searching for "Style Settings" in Community plugins

<br/>

## 2 Getting started

Here is the official tutorial for learning and mastering Notebook Navigator:

[![Mastering Notebook Navigator](https://raw.githubusercontent.com/johansan/notebook-navigator/main/images/youtube-thumbnail.jpg)](https://www.youtube.com/watch?v=m2maDNtho7Y)

The video has subtitles in 21 languages.

<br/>

## 3 Security and quality

Notebook Navigator is checked with [TypeScript](https://www.typescriptlang.org/), [ESLint](https://eslint.org/) with the official [Obsidian ESLint plugin](https://github.com/obsidianmd/eslint-plugin), [Prettier](https://prettier.io/), [Vitest](https://vitest.dev/) and a production build before changes are merged. The build must complete with zero errors and zero warnings.

Security checks run through [CodeQL](https://codeql.github.com/) in the [TPS fork workflows](https://github.com/ZachTish/tps-notebook-navigator/actions). The inherited upstream implementation is also reviewed through [Notebook Navigator's public repository](https://github.com/johansan/notebook-navigator).

Notebook Navigator runs locally, but some features make documented HTTP requests for updates, downloads, and remote content. See [section 11 - Network and Diagnostics Disclosure](#11-network-and-diagnostics-disclosure) for the full list.

<br/>

## Table of contents

- [4 Documentation](#4-documentation)
- [5 Keyboard shortcuts](#5-keyboard-shortcuts)
- [6 Synced and local settings](#6-synced-and-local-settings)
- [7 Search](#7-search)
- [8 Custom hotkeys](#8-custom-hotkeys)
- [9 Commands](#9-commands)
- [10 Features](#10-features)
- [11 Network and Diagnostics Disclosure](#11-network-and-diagnostics-disclosure)
- [12 Contact](#12-contact)
- [13 Questions or issues?](#13-questions-or-issues)
- [14 License](#14-license)

<br/>

## 4 Documentation

- [**API Reference**](docs/api-reference.md) - Public API documentation. Covers metadata management, navigation control and event subscriptions for JavaScript/TypeScript developers.

- [**Theming Guide**](docs/theming-guide.md) - Guide for theme developers. Includes CSS class reference, custom
  properties, and theme examples for light and dark modes.

- [**Startup Process**](docs/startup-process.md) - Plugin initialization sequence. Cold boot vs warm boot flows,
  metadata cache resolution, deferred cleanup, and content generation pipeline. Includes Mermaid diagrams.

- [**Metadata Pipeline**](docs/metadata-pipeline.md) - Cache rebuild sequence, provider pipeline stages, and completion signals. Includes Mermaid diagrams.

- [**Storage Architecture**](docs/storage-architecture.md) - Guide to storage containers (IndexedDB, Local Storage,
  Memory Cache, Settings). Data flow patterns and usage guidelines.

- [**Rendering Architecture**](docs/rendering-architecture.md) - React component hierarchy, virtual scrolling with
  TanStack Virtual, performance optimizations, and data flow.

- [**Scroll Orchestration**](docs/scroll-orchestration.md) - How the plugin ensures accurate scrolling when tree structures change (tag visibility, settings, etc.)

- [**Service Architecture**](docs/service-architecture.md) - Business logic layer: MetadataService, FileSystemOperations, ContentProviderRegistry. Dependency injection patterns and service data flow.

- [**Upstream Sync Guide**](docs/upstream-sync.md) - Repeatable merge, namespace, isolation, and side-by-side validation workflow for later Notebook Navigator releases.

<br/>

## 5 Keyboard shortcuts

| Key                                 | Action                                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ↑/↓                                 | Navigate up/down in current pane                                                                                                                                                          |
| ←                                   | In navigation pane: collapse or go to parent<br>In list pane: switch to navigation pane                                                                                                   |
| →                                   | In navigation pane: expand or switch to list pane<br>In list pane: switch to editor                                                                                                       |
| Tab                                 | In navigation pane: switch to list pane<br>In list pane: switch to editor<br>In search field: switch to list pane                                                                         |
| Shift+Tab                           | In list pane: switch to navigation pane<br>In search field: switch to navigation pane                                                                                                     |
| Enter (macOS)<br>F2 (Windows/Linux) | Rename item inline in navigation pane or list pane                                                                                                                                        |
| Enter                               | In navigation pane: open linked folder/tag note on Windows/Linux (when enabled)<br>In list pane: open selected file on all systems (when enabled)<br>In search field: switch to list pane |
| Escape                              | In search field: close search and focus list pane                                                                                                                                         |
| PageUp/PageDown                     | Scroll up/down in navigation pane and list pane                                                                                                                                           |
| Home/End                            | Jump to first/last item in current pane                                                                                                                                                   |
| Delete<br>Backspace                 | Delete selected item                                                                                                                                                                      |
| Cmd/Ctrl+A                          | Select all notes in current folder                                                                                                                                                        |
| Cmd/Ctrl+Click                      | Toggle notes selection                                                                                                                                                                    |
| Shift+Click                         | Select a range of notes                                                                                                                                                                   |
| Shift+Home/End                      | Select from current position to first/last item                                                                                                                                           |
| Shift+↑/↓                           | Extend selection up/down                                                                                                                                                                  |
| Cmd/Ctrl+↑/↓                        | Rearrange selected files up/down in manual sort mode                                                                                                                                      |

**Note:** All keyboard shortcuts can be customized. See [section 8 - Custom hotkeys](#8-custom-hotkeys) for details on adding VIM-style navigation (h,j,k,l), alternate keys, and modifier combinations.

<br/>

## 6 Synced and local settings

Many settings in Notebook Navigator display a sync toggle — a cloud icon that switches between "Enable sync" and "Disable sync". This controls where each setting is stored and whether it is shared across devices.

### 6.1 How sync works

Obsidian plugins store their configuration in `data.json`, located at `.obsidian/plugins/tps-notebook-navigator/data.json` inside your vault folder. When you use a sync service — such as [Obsidian Sync](https://obsidian.md/sync), iCloud, GitHub, Dropbox, or Google Drive — this file is synchronized across all your devices along with the rest of your vault. Any setting saved to `data.json` will propagate to every device that syncs the vault.

<img width="606" height="48" alt="Screenshot 2026-02-18 at 22 58 05" src="https://github.com/user-attachments/assets/01d92458-1967-4008-acae-f722eee0d0a2" />

When sync is **enabled** (default) for a setting, the value is saved to `data.json` and synchronized to all devices through your sync service.

<img width="608" height="49" alt="Screenshot 2026-02-18 at 22 58 14" src="https://github.com/user-attachments/assets/f6f4c839-f8b8-42b5-be43-1cb6c78abdb3" />

<br/>

When sync is **disabled** for a setting, the value is saved to Obsidian's local storage instead. Local storage is device-specific and is not included in vault sync. The setting will have its own independent value on each device. When you disable sync for a setting, the current value is copied to local storage on the current device, and the value is removed from `data.json` to prevent it from overriding local values on other devices.

If you do not use a sync service, the sync toggle has no practical effect since `data.json` is only stored locally.

<br/>

## 7 Search

Notebook Navigator has two search modes: filter search and Omnisearch. Switch between them using the up/down arrow keys or by clicking the search icon. Combine file names, properties, tags, dates, and filters in one query (e.g., `meeting .status=active #work @thisweek`).

### 7.1 Filter search

Filters files by display name, alias, tags, properties, dates, folders, extensions, and tasks within the current folder and subfolders. Default search mode.

**File names and aliases**

- `word` - Match notes with "word" in the display name or an alias
- `word1 word2` - Require every word to match across the display name and aliases
- `-word` - Exclude notes with "word" in the display name or an alias
- `".F"` - Match text literally; a term that opens with a double quote is never interpreted as a tag, property, date, or filter (e.g., `".F"` matches names containing `.F` instead of filtering on a property)
- `-".F"` - Exclude notes with the literal text in the display name or an alias

**Tags**

- `#tag` - Include notes with tag (also matches nested tags like `#tag/subtag`)
- `#` - Include only tagged notes
- `-#tag` - Exclude notes with tag
- `-#` - Include only untagged notes
- `#tag1 #tag2` - Match both tags (implicit AND)
- `#tag1 AND #tag2` - Match both tags (explicit AND)
- `#tag1 OR #tag2` - Match either tag
- `#a OR #b AND #c` - AND has higher precedence: matches `#a`, or both `#b` and `#c`
- Shift+Click or the configured multi-select modifier adds a tag with AND. The configured modifier plus Shift adds it with OR

**Properties**

- `.key` - Include notes with a property key that starts with `key`
- `.key=` - Include notes where the exact property key exists without a value; property-key navigation uses this form when added to a multi-select search
- `.key=value` - Include notes where the property value contains `value`
- `-.key=` - Exclude notes where the exact property key exists without a value
- `."Reading Status"` - Property key with whitespace (double-quoted)
- `."Reading Status"="In Progress"` - Keys and values with whitespace must be double-quoted
- `-.key` - Exclude notes with a property key that starts with `key`
- `-.key=value` - Exclude notes where the property value contains `value`
- Shift+Click or the configured multi-select modifier adds a property with AND. The configured modifier plus Shift adds it
  with OR

**Types**

- Type facets are available only while **Enable Types collections (experimental)** is on. With Types off, a `type:` or
  `-type:` facet is invalid and shows an explanation instead of silently becoming filename text.
- `type:structural:task` - Include Checkboxes; every fixed Type uses its stable catalog id
- `-type:structural:task` - Exclude Checkboxes
- Multiple positive Type facets form one union, so `type:structural:task type:structural:heading` includes either Type
- The Type union is ANDed with tags, properties, dates, folders, extensions, and plain-text terms
- Shift+Click or the configured multi-select modifier adds a fixed Type to Filter Search. Multiple Types remain OR even when
  they are added from an AND gesture

Any nonempty internal Filter Search started from a fixed Type searches all fixed Types rather than remaining trapped in the
selected collection. Native files remain ordinary rows, while Checkboxes, Bullets, Headings, Code blocks, Callouts,
Blockquotes, Tables, and Web links appear in labeled sections. Search from a folder, tag, or property keeps that navigation scope.
Plain text matches a source row's label or source path, not its note contents; tag, property, date, folder, and extension
facets apply to the owning note, not an individual block's inline metadata. Mixed results preserve each row's Type identity
for styling, selection, context menus, and API snapshots. This mixed catalog is an internal Filter Search feature; Omnisearch
continues to return its own ranked file results. Search consumes the cached GCM, Obsidian metadata, and bounded Web-link
indexes without rereading note bodies for each query. While a mixed search is active, its Group menu can switch between
owning-note and exact GCM line properties; ordinary note/file results continue to group from frontmatter.

**Filters**

- `has:task` - Include notes with unfinished tasks
- `-has:task` - Exclude notes with unfinished tasks
- `folder:meetings` - Include notes where a folder name contains `meetings`
- `folder:/work/meetings` - Include notes only in `work/meetings` (not subfolders)
- `folder:/` - Include notes only in the vault root
- `-folder:archive` - Exclude notes where a folder name contains `archive`
- `-folder:/archive` - Exclude notes only in `archive` (not subfolders)
- `ext:md` - Include notes with extension `md` (`ext:.md` is also supported)
- `-ext:pdf` - Exclude notes with extension `pdf`
- Combine with tags, names, and dates (e.g., `folder:/work/meetings ext:md @thisweek`)

Incomplete or unsupported filter-shaped terms such as `folder:`, `ext:`, an unknown `has:` value, or an invalid date fail
closed: the list is empty, the search input is marked invalid, and a visible message explains how to fix or quote the term.
An invalid Filter Search cannot be saved as a shortcut.

**Dates**

- `@today` - Match notes from today using the default date field
- `@yesterday`, `@last7d`, `@last30d`, `@thisweek`, `@thismonth` - Relative date ranges
- `@2026-02-07` - Match a single day (also supports `@20260207`)
- `@2026` - Match a calendar year
- `@2026-02` or `@202602` - Match a calendar month
- `@2026-W05` or `@2026W05` - Match an ISO week
- `@2026-Q2` or `@2026Q2` - Match a calendar quarter
- `@13/02/2026` - Numeric formats with separators (`@07022026` follows your locale when ambiguous)
- `@2026-02-01..2026-02-07` - Match an inclusive day range (open ends supported)
- `@c:...` or `@m:...` - Target created or modified date
- `-@...` - Exclude a date match

The default date field follows the current sort order. When sorting by name, the date field is configured in Settings → Notes → Date → When sorting by name.
Calendar date selection replaces the first positive date clause, or appends one when none exists, while preserving text,
tag, property, folder, extension, task-state, negative-date, and Type facets. Relative ranges such as `@today` are recalculated
after the local day changes—including when the app resumes—and any modified file refreshes an active date query regardless
of its current sort mode.

**AND/OR behavior**

`AND` and `OR` operators work in complete tag/property-only expressions (queries that contain only `#tag`, `-#tag`, `#`, `-#`, `.key`, `-.key`, `.key=value`, or `-.key=value` filters). In an otherwise name-only search, those words remain ordinary filename or alias terms, so names such as `research and development` keep working. If an unquoted operator mixes a structured criterion with names, dates, task filters, folder filters, extension filters, or an incomplete expression, the query fails closed with a visible message. Quote `"AND"` or `"OR"` when the literal word belongs beside structured criteria.

- Operator query: `#work OR .status=started`
- Invalid mixed query: `#work OR ext:md`
- Literal filename query: `#work "OR" ext:md`

Saved searches validate their exact folder, tag, or property start location before changing the current navigation,
provider, or query. If that location was renamed or deleted, Navigator keeps the current state unchanged and shows a warning
instead of silently running the shortcut in a broader or unrelated scope.

### 7.2 Omnisearch

Full-text search across the vault, filtered to the current folder, subfolders, or selected tags. Requires the [Omnisearch](https://github.com/scambier/obsidian-omnisearch) plugin. If Omnisearch is not installed, search falls back to filter search.

Note previews show Omnisearch result excerpts instead of the default preview text.

**Known limitations**

- **Performance** - Can be slow when searching for fewer than 3 characters in large vaults
- **Path filters** - Folder scoping is sent to Omnisearch for all folder paths except names containing `"` or `,`. Folder names with non-ASCII characters require Omnisearch 1.30.0 or later. Results are always filtered to the current view after Omnisearch returns
- **Limited results** - Omnisearch returns at most 50 results. When searching in a folder, the limit covers the folder and its subfolders, so subfolder matches count toward the limit even when `Show notes from subfolders` is disabled
- **Preview text** - Note previews are replaced with Omnisearch result excerpts, which may not show the actual search match highlight if it appears elsewhere in the file

<br/>

## 8 Custom hotkeys

Edit `.obsidian/plugins/tps-notebook-navigator/data.json` to customize Notebook Navigator hotkeys. Open the file and locate the `keyboardShortcuts` section. Each entry maps an action to one or more key bindings:

```json
"pane:move-up": [ { "key": "ArrowUp", "modifiers": [] }, { "key": "K", "modifiers": [] } ]
```

Add multiple bindings per action to support alternate keys, like the `ArrowUp` and `K` example above. Combine modifiers in one entry by listing each value, for example `"modifiers": ["Mod", "Shift"]`. Keyboard sequences such as `gg` or `dd` are not supported. Reload Obsidian after editing the file.

### 8.1 Modifiers

| Modifier | Key                                       |
| -------- | ----------------------------------------- |
| `Mod`    | Cmd (macOS) / Ctrl (Win/Linux)            |
| `Alt`    | Alt / Option                              |
| `Shift`  | Shift                                     |
| `Ctrl`   | Control (prefer `Mod` for cross-platform) |

### 8.2 Available actions

| Action                            | Default key(s)                    |
| --------------------------------- | --------------------------------- |
| `pane:move-up`                    | ArrowUp                           |
| `pane:move-down`                  | ArrowDown                         |
| `pane:page-up`                    | PageUp                            |
| `pane:page-down`                  | PageDown                          |
| `pane:home`                       | Home                              |
| `pane:end`                        | End                               |
| `pane:rename`                     | Enter (macOS), F2 (Windows/Linux) |
| `pane:delete-selected`            | Delete, Backspace                 |
| `navigation:collapse-or-parent`   | ArrowLeft                         |
| `navigation:expand-or-focus-list` | ArrowRight                        |
| `navigation:focus-list`           | Tab                               |
| `list:focus-navigation`           | ArrowLeft, Shift+Tab              |
| `list:focus-editor`               | ArrowRight, Tab                   |
| `list:select-all`                 | Mod+A                             |
| `list:extend-selection-up`        | Shift+ArrowUp                     |
| `list:extend-selection-down`      | Shift+ArrowDown                   |
| `list:manual-sort-up`             | Mod+ArrowUp                       |
| `list:manual-sort-down`           | Mod+ArrowDown                     |
| `list:range-to-start`             | Shift+Home                        |
| `list:range-to-end`               | Shift+End                         |
| `search:focus-list`               | Tab, Enter                        |
| `search:focus-navigation`         | Shift+Tab                         |
| `search:close`                    | Escape                            |

<br/>

## 9 Commands

Set custom hotkeys for these commands in Obsidian's Hotkeys settings:

**View & navigation**

- `Notebook Navigator: Open` Opens Notebook Navigator in left sidebar. If already open, moves keyboard focus over to the list pane. **Suggestion:** Bind to a shortcut key like `Cmd/Ctrl+Shift+E` to move keyboard focus to the list pane - **this is essential for full keyboard navigation**
- `Notebook Navigator: Toggle left sidebar` Toggles the left sidebar. When opening, sets the left sidebar view to Notebook Navigator (unlike Obsidian's built-in "Toggle left sidebar" command which restores the previous left sidebar view)
- `Notebook Navigator: Open homepage` Opens the Notebook Navigator view and loads the homepage target configured in settings
- `Notebook Navigator: Select vault profile` Opens modal to switch between vault profiles
- `Notebook Navigator: Select vault profile 1-3` Activates a vault profile by its position. Opens the profile selection modal when no profile exists at that position
- `Notebook Navigator: Reveal file` Reveals current file in navigator. Expands parent folders and scrolls to file. This command is useful if you have the setting `Auto-reveal active note` switched off and want to reveal notes manually. **Suggestion:** Bind to a shortcut key like `Cmd/Ctrl+Shift+R` to quickly change the selected folder or tag to the current file
- `Notebook Navigator: Open all files` Opens all notes in the currently selected folder or tag. When opening 15 or more files, shows a confirmation dialog
- `Notebook Navigator: Navigate to folder` Search dialog to jump to any folder
- `Notebook Navigator: Navigate to tag` Search dialog to jump to any tag
- `Notebook Navigator: Navigate to property` Search dialog to jump to any property key or value
- `Notebook Navigator: Navigate back` Moves to the previous folder, tag, or property selection in navigator history
- `Notebook Navigator: Navigate forward` Moves to the next folder, tag, or property selection in navigator history
- `Notebook Navigator: Add to shortcuts` Adds or removes the current file, folder, tag, or property from shortcuts
- `Notebook Navigator: Open shortcut 1-9` Opens shortcut by its position in the shortcuts list
- `Notebook Navigator: Search` Opens quick search field or focuses it if already open. Search persists between sessions. **Suggestion:** Bind to a shortcut key like `Cmd/Ctrl+Shift+S` for quick file filtering
- `Notebook Navigator: Search whole vault` Selects the vault root folder and opens search with subfolders included (available when either `Show root folder` or `Show hidden items` is enabled)

**Selection**

- `Notebook Navigator: Select next file` Moves selection to the next file in the current folder or tag view. Respects custom sort order. **Suggestion:** Bind to a shortcut key like `Option+Cmd+Right` to quickly go to the next file in list
- `Notebook Navigator: Select previous file` Moves selection to the previous file in the current folder or tag view. Respects custom sort order. **Suggestion:** Bind to a shortcut key like `Option+Cmd+Left` to quickly go to the previous file in list

**Layout & display**

- `Notebook Navigator: Toggle dual pane layout` Toggle single/dual-pane layout (desktop and tablet). **Suggestion:** Bind to a shortcut key like `Cmd/Ctrl+Shift+A` to quickly switch between single-pane and dual-pane layout
- `Notebook Navigator: Toggle dual pane orientation` Toggle dual-pane orientation between horizontal and vertical
- `Notebook Navigator: Toggle descendants` Toggle subfolders / descendants notes display for folders and tags. **Suggestion:** Bind to a shortcut key like `Cmd/Ctrl+Shift+D` to quickly toggle display of notes from subfolders / descendants
- `Notebook Navigator: Toggle hidden folders, tags, and notes` Show or hide hidden folders, tags, and notes
- `Notebook Navigator: Toggle tag sort order` Toggle between alphabetical and frequency-based tag sorting
- `Notebook Navigator: Toggle tags by selection` Toggle limiting tags to those found in notes within the selected folder or property
- `Notebook Navigator: Toggle properties by selection` Toggle limiting properties to those found in notes within the selected folder or tag
- `Notebook Navigator: Toggle compact mode` Toggle list mode between standard and compact
- `Notebook Navigator: Toggle pinned section` Show or hide pinned notes in the list pane
- `Notebook Navigator: Collapse / expand all navigation items` Collapse or expand all navigation items based on the current state. When `Keep selected item expanded` is enabled (default on), all folders except the current one will be collapsed. This is handy to keep the navigation tree tidy when searching for documents
- `Notebook Navigator: Collapse / expand selected item` Collapse or expand the selected navigation item

**Calendar**

- `Notebook Navigator: Toggle calendar` Toggles calendar on or off. **Suggestion:** Bind to a shortcut key like `Cmd/Ctrl+Shift+C` to quickly show the calendar
- `Notebook Navigator: Open daily note` Opens today's daily note based on calendar settings. Creates the note if it doesn't exist
- `Notebook Navigator: Open weekly note` Opens the current weekly note. Creates the note if it doesn't exist
- `Notebook Navigator: Open monthly note` Opens the current monthly note. Creates the note if it doesn't exist
- `Notebook Navigator: Open quarterly note` Opens the current quarterly note. Creates the note if it doesn't exist
- `Notebook Navigator: Open yearly note` Opens the current yearly note. Creates the note if it doesn't exist

**File operations**

**Important:** Obsidian has no context of "current folder or tag", so when creating notes in Obsidian by default they are created in the root folder, same folder as current file, or a specific folder. When working with Notebook Navigator you always want to create new notes in the currently selected folder or tag, so the first thing you should do is bind `Cmd/Ctrl+N` to `Notebook Navigator: Create new note` so new notes are always created in the currently selected folder or tag. The same also applies to moving and deleting files. This is why you should use these commands instead of the built-in Obsidian commands when using Notebook Navigator.

- `Notebook Navigator: Create new note` Create note in currently selected folder. **Suggestion:** Bind `Cmd/Ctrl+N` to this command (unbind from Obsidian's default "Create new note" first)
- `Notebook Navigator: Create new note from template` Create note from template in currently selected folder (requires Templater)
- `Notebook Navigator: Move files` Move selected files to another folder. Selects next file in current folder
- `Notebook Navigator: Merge notes` Create one note from selected Markdown notes in the current list order
- `Notebook Navigator: Convert to folder note` Create a folder matching the file name and move the file inside as the folder note
- `Notebook Navigator: Set as folder note` Rename the active file to its folder note name
- `Notebook Navigator: Detach folder note` Detach the folder note in the selected folder and rename it
- `Notebook Navigator: Pin all folder notes` Pin all folder notes in all folders. Command is only visible when folder notes are enabled
- `Notebook Navigator: Delete files` Delete selected files. Selects next file in current folder

**Tag operations**

- `Notebook Navigator: Add tag to selected files` Dialog to add tag to selected files. Supports creating new tags
- `Notebook Navigator: Set property on selected files` Dialog to set property on selected files
- `Notebook Navigator: Remove tag from selected files` Dialog to remove specific tag. Removes immediately if only one tag
- `Notebook Navigator: Remove all tags from selected files` Clear all tags from selected files with confirmation

**Maintenance**

- `Notebook Navigator: Rebuild cache` Rebuilds the local Notebook Navigator cache. Use this if you experience missing tags, incorrect previews or missing feature images
- `Notebook Navigator: Restore default settings` Replaces the settings file with verified defaults after saving a timestamped backup. This command is only available when Notebook Navigator cannot read its settings and stops during startup

### 9.1 Command IDs

| Command ID                                              | Command name                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------- |
| `tps-notebook-navigator:open`                           | TPS Notebook Navigator: Open                                   |
| `tps-notebook-navigator:toggle-left-sidebar`            | TPS Notebook Navigator: Toggle left sidebar                    |
| `tps-notebook-navigator:open-homepage`                  | TPS Notebook Navigator: Open homepage                          |
| `tps-notebook-navigator:select-profile`                 | TPS Notebook Navigator: Select vault profile                   |
| `tps-notebook-navigator:select-profile-1`               | TPS Notebook Navigator: Select vault profile 1                 |
| `tps-notebook-navigator:select-profile-2`               | TPS Notebook Navigator: Select vault profile 2                 |
| `tps-notebook-navigator:select-profile-3`               | TPS Notebook Navigator: Select vault profile 3                 |
| `tps-notebook-navigator:reveal-file`                    | TPS Notebook Navigator: Reveal file                            |
| `tps-notebook-navigator:open-all-files`                 | TPS Notebook Navigator: Open all files                         |
| `tps-notebook-navigator:navigate-to-folder`             | TPS Notebook Navigator: Navigate to folder                     |
| `tps-notebook-navigator:navigate-to-tag`                | TPS Notebook Navigator: Navigate to tag                        |
| `tps-notebook-navigator:navigate-to-property`           | TPS Notebook Navigator: Navigate to property                   |
| `tps-notebook-navigator:navigate-back`                  | TPS Notebook Navigator: Navigate back                          |
| `tps-notebook-navigator:navigate-forward`               | TPS Notebook Navigator: Navigate forward                       |
| `tps-notebook-navigator:add-shortcut`                   | TPS Notebook Navigator: Add to shortcuts                       |
| `tps-notebook-navigator:open-shortcut-1`                | TPS Notebook Navigator: Open shortcut 1                        |
| `tps-notebook-navigator:open-shortcut-2`                | TPS Notebook Navigator: Open shortcut 2                        |
| `tps-notebook-navigator:open-shortcut-3`                | TPS Notebook Navigator: Open shortcut 3                        |
| `tps-notebook-navigator:open-shortcut-4`                | TPS Notebook Navigator: Open shortcut 4                        |
| `tps-notebook-navigator:open-shortcut-5`                | TPS Notebook Navigator: Open shortcut 5                        |
| `tps-notebook-navigator:open-shortcut-6`                | TPS Notebook Navigator: Open shortcut 6                        |
| `tps-notebook-navigator:open-shortcut-7`                | TPS Notebook Navigator: Open shortcut 7                        |
| `tps-notebook-navigator:open-shortcut-8`                | TPS Notebook Navigator: Open shortcut 8                        |
| `tps-notebook-navigator:open-shortcut-9`                | TPS Notebook Navigator: Open shortcut 9                        |
| `tps-notebook-navigator:search`                         | TPS Notebook Navigator: Search                                 |
| `tps-notebook-navigator:search-vault`                   | TPS Notebook Navigator: Search whole vault                     |
| `tps-notebook-navigator:toggle-dual-pane`               | TPS Notebook Navigator: Toggle dual pane layout                |
| `tps-notebook-navigator:toggle-dual-pane-orientation`   | TPS Notebook Navigator: Toggle dual pane orientation           |
| `tps-notebook-navigator:toggle-calendar`                | TPS Notebook Navigator: Toggle calendar                        |
| `tps-notebook-navigator:open-daily-note`                | TPS Notebook Navigator: Open daily note                        |
| `tps-notebook-navigator:open-weekly-note`               | TPS Notebook Navigator: Open weekly note                       |
| `tps-notebook-navigator:open-monthly-note`              | TPS Notebook Navigator: Open monthly note                      |
| `tps-notebook-navigator:open-quarterly-note`            | TPS Notebook Navigator: Open quarterly note                    |
| `tps-notebook-navigator:open-yearly-note`               | TPS Notebook Navigator: Open yearly note                       |
| `tps-notebook-navigator:toggle-descendants`             | TPS Notebook Navigator: Toggle descendants                     |
| `tps-notebook-navigator:toggle-hidden`                  | TPS Notebook Navigator: Toggle hidden folders, tags, and notes |
| `tps-notebook-navigator:toggle-tag-sort`                | TPS Notebook Navigator: Toggle tag sort order                  |
| `tps-notebook-navigator:toggle-tags-by-selection`       | TPS Notebook Navigator: Toggle tags by selection               |
| `tps-notebook-navigator:toggle-properties-by-selection` | TPS Notebook Navigator: Toggle properties by selection         |
| `tps-notebook-navigator:toggle-compact-mode`            | TPS Notebook Navigator: Toggle compact mode                    |
| `tps-notebook-navigator:toggle-pinned-section`          | TPS Notebook Navigator: Toggle pinned section                  |
| `tps-notebook-navigator:collapse-expand-list-groups`    | TPS Notebook Navigator: Collapse / expand all list groups      |
| `tps-notebook-navigator:collapse-expand`                | TPS Notebook Navigator: Collapse / expand all navigation items |
| `tps-notebook-navigator:collapse-expand-selected-item`  | TPS Notebook Navigator: Collapse / expand selected item        |
| `tps-notebook-navigator:new-note`                       | TPS Notebook Navigator: Create new note                        |
| `tps-notebook-navigator:new-note-from-template`         | TPS Notebook Navigator: Create new note from template          |
| `tps-notebook-navigator:move-files`                     | TPS Notebook Navigator: Move files                             |
| `tps-notebook-navigator:merge-notes`                    | TPS Notebook Navigator: Merge notes                            |
| `tps-notebook-navigator:select-next-file`               | TPS Notebook Navigator: Select next file                       |
| `tps-notebook-navigator:select-previous-file`           | TPS Notebook Navigator: Select previous file                   |
| `tps-notebook-navigator:convert-to-folder-note`         | TPS Notebook Navigator: Convert to folder note                 |
| `tps-notebook-navigator:set-as-folder-note`             | TPS Notebook Navigator: Set as folder note                     |
| `tps-notebook-navigator:detach-folder-note`             | TPS Notebook Navigator: Detach folder note                     |
| `tps-notebook-navigator:pin-all-folder-notes`           | TPS Notebook Navigator: Pin all folder notes                   |
| `tps-notebook-navigator:delete-files`                   | TPS Notebook Navigator: Delete files                           |
| `tps-notebook-navigator:add-tag`                        | TPS Notebook Navigator: Add tag to selected files              |
| `tps-notebook-navigator:set-property`                   | TPS Notebook Navigator: Set property on selected files         |
| `tps-notebook-navigator:remove-tag`                     | TPS Notebook Navigator: Remove tag from selected files         |
| `tps-notebook-navigator:remove-all-tags`                | TPS Notebook Navigator: Remove all tags from selected files    |
| `tps-notebook-navigator:rebuild-cache`                  | TPS Notebook Navigator: Rebuild cache                          |
| `tps-notebook-navigator:restore-default-settings`       | TPS Notebook Navigator: Restore default settings               |

<br/>

## 10 Features

### 10.1 Interface

- **Dual-pane layout** - Navigation pane (folders/tags/properties/types) and list pane (files or virtual entity rows)
- **Single-pane mode** - Navigation and list views with animated transitions
- **Resizable panes** - Horizontal or vertical split orientation
- **Independent UI zoom** - Scale Notebook Navigator without changing Obsidian zoom
- **Single-pane startup view** - Navigation pane or list pane
- **Multi-language support** - 21 languages with RTL layout support
- **Interface icon set** - Customizable UI icons across the plugin

### 10.2 Navigation

- **Vault profiles** - Multiple filtered views with per-profile hidden folders/tags/notes, file visibility, banner, and shortcuts
- **Shortcuts** - Notes, folders, tags, properties, and saved searches with pinning and reordering
- **Recent notes/files** - Recent items section stored per vault profile, optionally pinned with shortcuts
- **Calendar** - Daily notes calendar with day selection, feature image previews, and vertical split support
- **Folder tree** - Expand/collapse navigation with manual root folder ordering
- **Tag tree** - Hierarchical tags with configurable root tag ordering
- **Property browser** - Browse file properties organized by key and value with file counts, custom colors, icons, and drag and drop. A key row is the no-value bucket; dropping Markdown notes onto it writes a bare YAML field, while child value rows assign their exact value.
- **Types browser (paused)** - The retained experimental toggle can browse native file formats plus checkboxes, bullets, headings, code blocks, callouts, blockquotes, tables, and Web links in one flat section; it is off by default
- **Auto-reveal active file** - Folder expansion and scroll-to-selection
- **Keyboard and commands** - Configurable hotkeys, selection history back/forward commands, next/previous file commands, open shortcut 1–9 commands

### 10.3 Organization

- **Pin notes** - Keep important notes at the top of folders and tags
- **Folder and tag notes** - Open derived navigation notes from folders, the vault root, and tags; create a missing tag note from its tag menu; set/detach and pin folder notes
- **Tag operations** - Add/remove/clear tags, rename/delete tags, create note in tag, drag-and-drop tag hierarchy
- **Custom sort and grouping** - Override sort/group settings per folder, tag, property, or supported Type; None is explicitly ungrouped while Custom uses manual frontmatter group headers
- **Per-scope appearances** - Title rows, preview rows, compact mode, descendants where meaningful, plus independent Date and Parent folder visibility
- **Hidden content** - Hidden folders/tags/notes/files with patterns, frontmatter properties, and tag-based filtering per vault profile
- **Exclude folders from descendants** - Omit folders when collecting notes from subfolders, per vault profile; excluded folders stay visible and show their notes when selected
- **Color and icon system** - Folder/tag/property/file colors, icon packs, emoji/Lucide icons, frontmatter read/write, icon mapping by file name and file type category
- **Name warnings** - Warn about forbidden filesystem characters and characters that break Obsidian links when naming files and folders

### 10.4 File display

- **Note previews** - 1–5 preview lines with optional HTML stripping
- **Thumbnails** - Featured images plus auto-generated thumbnails for PDF, SVG, and drawing files stored in the metadata cache
- **External images** - Optional downloads for external images and YouTube thumbnails
- **Date grouping** - Group notes by Today, Yesterday, Previous 7 days, Previous 30 days, months, and years when sorted by date, or choose None for an ungrouped list
- **Property grouping** - Group notes by a frontmatter property value, matching group by in Obsidian Bases: notes sharing the same value collect under one header, notes without the property go into a trailing None group, and groups sort by value with natural ordering
- **Frontmatter support** - Read note names and timestamps from frontmatter fields
- **Note metadata** - Show modification date and tags in the file list
- **Task status** - Show resilient per-note task progress in standard rows and optionally replace file icons for unfinished tasks in compact or all display modes; this remains available when Types and individual GCM task rows are off
- **Custom properties** - Display frontmatter properties or word count in file list with per-folder/tag overrides and custom colors
- **Parent folder display** - Optional parent folder name and icon in the file list, with per-scope overrides
- **Structured hover tooltips** - Optional path, date/count details, and filtered tag pills in one TPS-namespaced tooltip layer
- **Compact mode** - Compact display when preview, date, and images are disabled
- **Clickable tags** - Tags in file list navigate directly to that tag

### 10.5 Productivity

- **Search** - Filter by file name, aliases, tags, properties, dates, folders, extensions, and tasks with fail-closed syntax validation, AND/OR, and exclusions
- **Omnisearch integration** - Full-text search via [Omnisearch](https://github.com/scambier/obsidian-omnisearch)
- **Drag and drop** - File moves, tagging, shortcut assignment, tag tree reparenting, spring-loaded folders
- **Context menus** - Create notes/folders/canvases/bases/drawings and run file/tag actions
- **Drawings** - Create Excalidraw and Tldraw drawings from navigation and list pane menus
- **Templates** - New note from template commands with the Templater plugin
- **File operations** - Create, rename, duplicate, move, trash files and folders
- **Filtering** - Folder/tag/note/file exclusions with patterns and frontmatter properties

<br/>

## 11 Network and Diagnostics Disclosure

Notebook Navigator runs locally, but some features make HTTP requests from Obsidian. Startup debug logging can also write a local diagnostic file in your vault.

### 11.1 Release update checks (Optional)

- **Setting:** "Check for new version on start"
- **Request:** `https://api.github.com/repos/ZachTish/tps-notebook-navigator/releases/latest`
- **Frequency:** At most once per 24 hours, on startup
- **Data:** Sends standard HTTP metadata; does not include vault content

### 11.2 Icon pack downloads (Optional)

- **Setting:** Enable an icon pack in the Icon Packs tab
- **Requests:** `https://raw.githubusercontent.com/johansan/notebook-navigator/main/icon-assets/...` (manifest, font, metadata)
- **Storage:** Stored locally in IndexedDB

### 11.3 External images, videos, and YouTube thumbnails

- **Feature images (Optional):** Controlled by the "Download external images" setting. Downloads remote images and YouTube thumbnails for feature images and stores them locally in IndexedDB.
- **Welcome modal (First launch):** Loads a YouTube thumbnail from `https://img.youtube.com/vi/<id>/...`.
- **What's new modal (On update / when opened):** Loads release banner images from `https://raw.githubusercontent.com/johansan/notebook-navigator/main/images/version-banners/<filename>` using the filename and extension declared by the release note.
- **What's new modal (On update / when opened):** Loads release videos from `https://raw.githubusercontent.com/johansan/notebook-navigator/main/images/version-banners/<id>.mp4` for release notes that include a video.
- **What's new modal (When opening a release video):** Opens release videos from `https://cdn.jsdelivr.net/gh/johansan/notebook-navigator@main/images/version-banners/<id>.mp4` so browsers can play the video directly.
- **What's new modal (On update / when opened):** Loads YouTube thumbnails from `https://img.youtube.com/vi/<id>/...` for release notes that include a YouTube link.

### 11.4 Startup debug files (Optional)

- **Setting:** "Startup debug logging"
- **Storage:** Writes a timestamped `tps-nn-debug-...md` file in the vault root, then stops after startup settles. The file may sync if the vault root is synced.
- **Data:** Includes startup timing, plugin version, minimum supported Obsidian version, platform, cache counts, queue counts, IndexedDB status, and diagnostic errors. It does not include note contents, tag names, frontmatter values, or a list of vault files.
- **Paths and identifiers:** Startup initialization, PDF diagnostics, and error cases can include the Obsidian app/vault identifier, vault-relative PDF paths, or error stack details. Review and redact the file before sharing it publicly.
- **Upload:** Notebook Navigator does not upload debug files. They are shared only if you upload, attach, or sync them outside the plugin.

### 11.5 Privacy and data handling

- Notebook Navigator does not send note content, file names, tags, or debug files to a Notebook Navigator server.
- Requests to GitHub, YouTube, and any external image host are made directly from your device and include standard HTTP metadata (IP address, user-agent, and similar).
- Downloaded icon packs and images are stored locally (IndexedDB). Recent notes/files and UI state are stored locally (Obsidian local storage).

<br/>

## 12 Contact

The original Notebook Navigator is built and maintained by [Johan Sanneblad](https://github.com/johansan/notebook-navigator). TPS Notebook Navigator is an independent experimental fork maintained in [ZachTish/tps-notebook-navigator](https://github.com/ZachTish/tps-notebook-navigator). Upstream attribution, copyright notices, and GPL licensing are preserved.

<br/>

## 13 Questions or issues?

Read the inherited [FAQ](FAQ.md) for upstream feature guidance. For TPS fork behavior, release artifacts, or integration problems, use the [TPS fork repository](https://github.com/ZachTish/tps-notebook-navigator). Report problems with unmodified upstream behavior to the [original Notebook Navigator project](https://github.com/johansan/notebook-navigator/issues).

<br/>

## 14 License

This fork is licensed under the GNU General Public License v3.0; see [LICENSE](LICENSE). It is based on GPL-licensed Notebook Navigator and retains the upstream copyright notices.
