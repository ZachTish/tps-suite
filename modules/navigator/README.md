# TPS Notebook Navigator

A separately namespaced TPS fork of Notebook Navigator, with shared GCM properties, entity integration, and stable list presentation.

## 8.4.0 — Nested property groups in the file list

In **Change sort and group**, group by a property, then choose **Nested values**. Values such as `transaction/financial/investment` appear under `transaction` → `financial` → `investment`. **Settings → TPS Notebook Navigator → List pane → Default grouping** also offers `Property ‘key’ · Nested` for each configured grouping key. Add the key under **Grouping properties** if it is missing. Flat values and calendar-day grouping retain their existing defaults. The implicit grouping of a top-level Properties key remains flat unless a per-scope override is selected.

Parent counts use unique descendant notes and provider-row identities; a note with several values appears in each exact-value group, while its shared parent counts it once. Parent collapse hides the subtree, child collapse survives reopening its parent, and the existing reveal/expand-all owners remain in use. Final visible file indices follow the deduplicated list order for range selection. No-value placement, pinning and existing per-group file sorting are preserved. Links, URLs, malformed slash paths and combined-value tuples remain atomic, using the same splitter as the navigation Properties tree.

Group labels show the local segment, with full paths in their tooltips, collapse-button accessible names and sticky headers. Logical depth is retained, but visual indentation stops increasing after four levels to protect narrow/mobile layouts. File rows keep their existing width and measurement. No new settings route or disclosure is added: List pane owns the global default, and the native sort/group menu owns the view override. Native buttons retain expanded state and keyboard focus behavior. Mixed provider groups omit unfiltered search denominators when their source does not supply a trustworthy total.

This is an additive **minor** release. Nested presentation is serialized in the existing `groupBy` field as `property-path:<key>`, `property-path-desc:<key>` or `property-path-follow:<key>`. The public list snapshot reports these in configured/effective grouping; source-preserving `line-property-path` encodings remain accepted without adding line UI. There is no migration or new persisted field, cache, listener, writer, timer or scan. The pure hierarchy pass follows the existing native/provider composition and uses already collected metadata/memberships. Unfiltered descendant memberships are collected only in nested mode by the existing count pass. Minimum Obsidian stays **1.11.0**.

Final versioned validation passes **3,454/3,454 tests in 292 files**, including 40 new regressions, under Node 24.19.0. Full ESLint has zero errors and the existing 26 warnings; style lint, namespace, artifact/operational identity, scoped formatting, TypeScript and string/locale gates pass. The ordinary stable build deploys only to Obsidian Plugin Test Vault, and a targeted reload verifies 8.4.0 with all eight active TPS consumers enabled. Actual menu/default-setting, hierarchy counts, parent/child collapse, search totals and descending ordering pass foreground macOS/Obsidian 1.14.4 QA. Twenty installed collapse/expand actions make zero raw/cached reads, write attempts or vault inventories. Six synthetic notes are archived unchanged; saved preferences and presentation are restored through the retained settings owner. Recorded TPS data matches baseline, with only Navigator's existing version acknowledgement differing. No production files are touched.

Detailed operation counts, timing limits and shipped hashes are recorded in [8.4.0 release notes](release-notes/8.4.0.md). Physical iPhone presentation and production installation are separate from test-vault acceptance; the public numeric release is the user's BRAT handoff.

## 8.3.1 — Match property frequency to displayed counts

Properties frequency sorting now uses the same unique-note count shown beside each property label. Previously it counted only notes without an indexed child value, so numeric properties could sort above properties such as `kind` and `status` despite their smaller displayed totals. Both frequency directions reuse `node.notesWithValue.size` from the existing scoped property tree. Alphabetical/manual ordering, child-value overrides, visibility rules, settings, defaults and persistence ownership remain unchanged. No reads, scans, writers, caches or background work are added.

Eleven new regressions cover numeric/string/list values, duplicate memberships, empty/zero counts, both frequency directions, alphabetical/manual modes, scoped selection, disabled count consumers, changed memberships and unchanged/event bursts. Three baseline failures reproduce the mismatch. Final validation passes **62/62 focused checks** and **3,414/3,414 tests in 289 files** under Node 24.19.0; full ESLint has zero errors and the existing 26 warnings. Source-hook bursts perform zero raw/cached reads, writes or inventories; a three-note scoped case makes three indexed lookups. Effects and host presentation are mocked, so these are owner-level counts rather than installed-pipeline measurements.

The ordinary stable build deploys only to Obsidian Plugin Test Vault, and a targeted reload verifies 8.3.1 with all eight active TPS consumers enabled. Installed foreground macOS/Obsidian 1.14.4 QA verifies both actual frequency menus: descending shows `kind` 4,134, `quantity` 3,633, `status` 324, then `scheduled` 318; ascending starts with zero-count labels, then one-count labels. Test preferences and presentation are restored through their existing owners. Recorded TPS runtime data matches baseline; Navigator matches after normalizing only its existing `lastShownVersion` acknowledgement. No notes are created or changed. Physical iPhone presentation, minimum-version acceptance, end-to-end operation counts and latency are not measured. [8.3.1 release notes](release-notes/8.3.1.md) record validation and artifact hashes. This is a backward-compatible **patch**, with minimum Obsidian **1.11.0** unchanged; production installation remains the user's BRAT pull.

Shortcuts retain their existing ownership: each Navigator vault profile saves its list in plugin `data.json`, and incoming settings refresh the list. This release does not change shortcut syncing. Devices must receive the same plugin configuration and select the intended Navigator profile; the phone's received configuration and the reported sync cause remain unverified.

## 8.3.0 — Sort navigation labels from section menus

Right-click **File types** or **Properties** in the navigation pane and choose **Change sort order**. Both menus offer A to Z, Z to A, and frequency in either direction. File types also offers its existing catalog/default order. **Reorder navigation** opens the existing drag-order editor, including mobile touch handles; File types also has labeled up/down controls. This orders navigation labels rather than the note list.

The controls reuse `typeNavigationSortOrder`, `rootTypeOrder`, `propertySortOrder`, and `rootPropertyOrder`. An explicit automatic Properties choice clears its manual root order so that the selected sort is actually used; the existing property preference writer retains local/synced behavior. File types keeps its saved manual order while automatic modes are active. Properties uses its existing global navigation sort, including default value ordering; per-property child-sort overrides remain authoritative. No defaults, schema, migration, note mutation, indexing layer, polling or background work are added. Settings navigation and layout remain unchanged; the new menus have one native submenu and close before acting on mobile. General remains the settings default route.

Validation and shipped hashes are recorded in [8.3.0 release notes](release-notes/8.3.0.md). Minimum Obsidian remains **1.11.0**. This additive **minor** release is a test-vault/BRAT handoff; production installation and physical iPhone verification remain separate.

Final versioned validation passes **35/35 new menu regressions**, **21/21 adjacent ordering/preference checks**, and **3,403/3,403 tests in 288 files** under Node 24.19.0. A 50-menu source-test burst performs zero vault reads, writes or inventories. Tests cover every mode/checkmark, live settings after replacement, no-op selections, manual handoff, and local/synced persistence ownership. Full ESLint has zero errors and the existing 26 warnings; style lint, namespace/artifact/operational identity, scoped formatting, TypeScript and string/locale gates pass. The ordinary stable build deploys only to Obsidian Plugin Test Vault, and a targeted reload verifies 8.3.0 with all eight active TPS consumers enabled.

Installed foreground macOS/Obsidian 1.14.4 QA uses both actual section menus: Properties Z to A changes the visible labels, frequency updates its existing preference, and Reorder navigation opens the existing editor; File types Z to A displays Video through Audio in reverse alphabetical order. Real saved preferences are verified and then restored, along with expansion/search presentation. Other recorded TPS data remains byte-identical; Navigator's only remaining data change is its existing lastShownVersion acknowledgement. No notes, provider settings or production files are changed. Native mobile submenu dismissal is regression-covered, but physical iPhone presentation and latency are not measured.

## 8.2.7 — Wait for the Daily Note provider at startup

An enabled GCM that is still starting has not answered Daily Note identity. Navigator's Daily Note homepage now retains its existing pending request instead of treating the unavailable lookup as a missing note and displaying **Unable to create daily note**. The already registered `tps:gcm-api-changed` event resumes the request once. Later announcements do not reopen the note or repeat creation; an explicit homepage command consumes an older deferred request. The existing generic creation safety and GCM's sole creation authority are unchanged.

The change uses the existing pending trigger and listener, with no new timer, poller, state store, fallback creator, repair, settings, defaults, or migration. Non-Daily homepages and absent/disabled GCM keep their existing routes. Catalog import and homepage continuation retain independent error handling. First-launch activation finishes before pending homepage requests become eligible; shutdown prevents a late open. The configured template and Templater script remain unchanged.

Twenty-three focused regressions execute the real controller and the extracted existing event callback. The unchanged baseline reproduces the false creation failure for an existing Daily Note, with no template invocation. One hundred blocked announcements perform zero source lookups, body reads, inventories, mutation attempts or notices; one hundred ready announcements open an existing note once with zero ensure calls, while a missing note delegates one ensure and opens the final returned file. Source tests use a synthetic vault/provider and mock host presentation; installed TEST verification and full-suite results are recorded in [8.2.7 release notes](release-notes/8.2.7.md). Minimum Obsidian remains 1.11.0; physical iPhone verification and production installation are separate from test-vault acceptance.

Final versioned validation passes **82/82 focused checks** and **3,368/3,368 tests in 287 files** under Node 24.19.0. Full ESLint has zero errors and the existing 26 warnings; style lint, namespace/artifact/operational identity, scoped formatting, TypeScript, string/locale and ordinary build checks pass. The stable build deployed only to Obsidian Plugin Test Vault; the targeted reload verified Navigator 8.2.7 with GCM 8.1.1 and all eight active TPS consumers enabled.

Installed foreground verification used controlled GCM readiness with a real synthetic note, Navigator controller and workspace event listener. Twenty blocked announcements performed zero raw/cached reads, inventories or mutation attempts and showed no Daily Note error. Twenty ready announcements found/opened the existing note once, with zero ensure calls and unchanged body. The 8.2.6 baseline showed the exact failure and never resumed. The initial candidate harness overlapped manual initialization with the newly loaded plugin's own layout callback; the final controlled run waits for that initialization before exercising readiness. A separate real foreground renderer reload used Core daily startup and Navigator Daily Note homepage together with a pre-existing target and empty template; real GCM discovery completed and the correct Daily Note opened with its body unchanged and no pending request. This is correctness verification, not a full quit/reopen, production latency or physical-phone measurement. Temporary defaults and hooks were restored, owned fixtures archived byte-identically, and recorded runtime settings remained byte-identical.

## 8.2.6 — Use Obsidian note Rename

Ordinary Markdown **Rename note** now opens Obsidian's native file rename dialog for the exact selected file. The list context menu, configured Enter/F2 rename action, modal fallback and manual-sort keyboard action use the same owner. Navigator does not construct a title input, focus or scroll the row, issue an active-note command, read note source, or write frontmatter while opening the dialog. Obsidian owns validation, cancellation, filename conflicts and link updates. Its private `fileManager.promptForFileRename` was verified against local Obsidian 1.14.4; the method is feature-detected, and an unavailable or failing prompt shows a clear Notice without a custom fallback. Its Promise resolves when the dialog opens, not when the user commits; subsequent committed filename-to-title propagation belongs to GCM's rename owner.

A separately configured non-title display property, resolved through the existing ordered `frontmatterNameField` list, retains its inline/modal property editor. Folder renaming, folder-note detachment and already-collected programmatic filename/resource renames keep their existing routes and extension handling. Ordinary Markdown drawing Rename also uses the core dialog, which displays the actual drawing basename (including `.excalidraw` when present) and preserves the file extension through core validation; the programmatic drawing-suffix owner is unchanged. No setting, stored state, listener, queue, timer, cache, migration or background repair is added. Historical 6.4.2 title-first UI behavior below is superseded for ordinary Rename; direct programmatic property mutation remains available to its existing callers.

Fifteen new regressions execute the real file service and extracted ListPane rename callback with synthetic files/settings; core dialog UI, commit and actual cancellation are outside those source tests. The unchanged 8.2.5 baseline fails ten checks and passes five controls. A prompt resolving without a committed rename, missing metadata, inactive exact targets, unsupported/failing prompts, configured-property exceptions and twenty repeated native opens are covered, including zero source reads, inventories, frontmatter writes or custom editors. The focused rename matrix passes **31/31**, and the final versioned full suite passes **3,345/3,345 in 286 files** under Node 24.19.0. Full ESLint reports zero errors and the same 26 existing warnings; style lint, TPS namespace, artifact/operational identity and scoped source/test formatting checks pass. TypeScript/string/locale validation and the separate ordinary build pass, deploying only to Obsidian Plugin Test Vault. The targeted reload verified **8.2.6** with GCM **8.1.1** and all eight active TPS consumers enabled.

Installed foreground QA invoked **Rename note** from the actual Navigator context menu. Core showed its **Note title** dialog with the filename selected; Save committed one filename rename and GCM's existing owner propagated one native-record title update in the User role. No custom title action ran, and the note body remained intact. Combined-consumer counts were four raw reads, eight cached reads, two inventories and one atomic process; these include downstream consumers, while opening the dialog itself performs zero source work in Navigator. GCM inline-title save/cancel, detached-window cancellation, untouched keyboard focus/blur and newly created `Untitled.md` propagation also passed. Creation used the vault API, followed by actual core dialog keyboard input. This is interaction/correctness verification, not a latency or physical-mobile measurement. Temporary hooks were removed, the original note/dashboard restored and owned fixtures archived byte-identically. Runtime settings remained unchanged except Navigator's existing `lastShownVersion` acknowledgement. [8.2.6 release notes](release-notes/8.2.6.md) include hashes and validation boundaries; the numeric release is ready for BRAT, with no production installation claimed.

## 8.2.5 — Skip Markdown icon-event work

The existing vault `create` and `modify` listeners reject shutdown, non-file and non-SVG events before entering `runAsyncAction`. Eligible SVG cache updates remain synchronous inside that existing error-handling owner. The same icon-list/SVG caches, validation invalidation and single 50 ms asset notification timer are retained; ordinary Markdown events create no action promise or icon notification. Rename/delete ownership, note indexing, boot metadata events, settings, commands and namespaces are unchanged. No listener, cache, state, poller, writer or migration is added.

Nine regressions execute the actual registered event handlers and async wrapper, with a synthetic vault, stubbed icon-service notifications and fake browser timers. The unchanged 8.2.4 baseline fails six checks and passes three controls. A burst of 4,049 Markdown creates previously entered the wrapper 4,049 times; the same modify burst did the same. Both now make zero wrapper calls, promises, timers, inventories, reads or writes. Two hundred eligible SVG create/modify pairs retain the actual icon-list updates and one batched notification, with zero callback promises. Folder/asset/type guards, shutdown, disposal and error reporting remain covered. These are source-owner operation counts, not a startup latency or physical-mobile measurement.

The final versioned full suite passes all **3,330 tests in 285 files** under Node 24.19.0. Full ESLint reports zero errors and the same 26 existing warnings; namespace, artifact, operational-identity, scoped source/test formatting and TypeScript/string checks pass. Build-only checks reported `target=none reason=TPS_NO_DEPLOY`; a separate ordinary build then deployed only to **Obsidian Plugin Test Vault**, and the TEST renderer reload verified **8.2.5** with all eight active TPS consumers enabled.

Five 30-second foreground warm-start captures of the combined TPS candidates measured median initial-body milestones **10.868 → 8.514 seconds**, GCM readiness **14.886 → 9.187**, and Health readiness **15.123 → 9.471**. Aggregate startup reads increased: raw **36 → 44**, cached **34 → 73–74**; recorded repeated inventories remained **three**. One baseline CPU sample and one quiet candidate sample recorded Navigator self CPU **1,494 → 780 ms**, Controller **406 → 26 ms**, and its named debounce callback **367 → 0 ms**. The baseline resumed a test process during capture, so these CPU samples support attribution but are not controlled timing evidence. Neither warm run showed Navigator bootstrap additions/updates/removals or preview/image regeneration; this patch does not remove a demonstrated cache rebuild. These are combined warm TEST results, not an isolated Navigator, full cold-start, production, physical-mobile or first-input speed claim.

Health/GCM/Finance/Calendar/Linter data remained byte-identical. Controller persisted only its previously missing existing attachmentSync default; sync-request runtime state may change normally. Navigator's only data change was its existing `lastShownVersion` acknowledgement; restoring that field to baseline **8.2.4** reproduced the original data hash. The combined synthetic nutrition check restored temporary mappings and instrumentation, preserved the original leaf and archived its two fixtures byte-identically. [8.2.5 release notes](release-notes/8.2.5.md) record artifact hashes and validation boundaries. The numeric release is ready for the user’s BRAT pull; no production installation is claimed.

Current release: **8.4.0** · Obsidian 1.11.0+ · Desktop and mobile. [Release notes](release-notes/8.4.0.md) record validation status and the BRAT handoff boundary.

## 8.2.4 — Skip unused navigation Properties counts

The shared tree hook now receives the existing navigation-pane visibility
predicate. Only its aggregate Properties count is deferred when navigation is
hidden; the trees, root ordering, nested rows and file-list pill colors still
calculate on their existing paths. The existing downstream count hook retains
the last visible count map. Revealing navigation or enabling Properties/counts
queries current files and visibility rules, including additions, deletions,
hidden folders, frontmatter and tags. A Properties-root shortcut is also a count
consumer while the pane is visible. This is pane visibility, not window focus or
document visibility. No cache, state, listener, timer, writer, public API,
setting/default or migration is added.

Fourteen actual-hook regressions execute the shared tree/count/file-pill hooks
and file finder with synthetic inventories and metadata plus retained React
memo/ref/effect semantics. Eight fail on the unchanged 8.2.3 baseline. With
1,000 notes and a frontmatter visibility rule, twenty hidden source-state
updates previously made twenty inventories and 40,000 metadata lookups; the
candidate makes zero of either. Tests retain current visible totals, show-hidden
behavior, enable/reveal transitions, root and shortcut-only consumers, nested
property ordering and file-pill data identity. Ordinary unchanged rerenders
already make no inventories, and legitimate coalesced storage tag-tree rebuilds
remain unchanged. The source-attributed installed trace motivating this change
captured one such tag rebuild followed by the unused aggregate Properties scan;
it did not show a scan on every ordinary tab switch.

The installed 8.2.3 baseline, with navigation already hidden, separately
reproduced two aggregate Properties scans on note creation and two on the first
body edit. Two later edits and idle controls were already zero. Pass-through
inventory call stacks matched the unique compiled aggregate memo range, while
all saved settings/data, loaded plugin identities, navigation and leaf state
remained unchanged. The UUID fixture was byte-checked and archived. This is an
event-owned unused count, not a claim that every note navigation scans the vault.
The same six-phase 8.2.4 check made zero aggregate Properties scans in every
phase: four unused scans were removed. Necessary refreshes remained: one
all-files inventory on creation and one Markdown inventory on the first edit.
The thirteen-phase Live Preview smoke check passed six tab switches and two
remounts with 24 food rows and 39 activity rows, zero errors, observed long tasks
or navigation mutation attempts. It made no all-files inventories and one
Markdown inventory on the first activity mount. Saved data/settings, active
workout and view state were preserved; fixtures were byte-checked and archived.

All 3,321 tests in 284 files pass under Node 24.19.0. Full ESLint has zero errors
and 26 existing warnings; style lint, TypeScript, locale, namespace, artifact,
operational-identity and scoped source/test formatting checks pass. Build-only
validation preceded the ordinary Test-vault build and targeted plugin reload.
The separate post-documentation build preserves the tested artifact bytes and
all eight plugins' saved data/settings. No additional reload is needed when the
artifacts are identical. Validation details and shipped SHA-256 hashes are in
[8.2.4 release notes](release-notes/8.2.4.md).
These synthetic operation counts and the hidden, unfocused warm
desktop traces do not prove physical iPhone, Windows, foreground paint or
production latency. Production remains untouched.

## 8.2.3 — Skip unused navigation Tags counts

The Tags collection count no longer enumerates the vault while navigation is
hidden in single-pane mode, Tags are disabled, or note counts are disabled. Its
consumer now uses the same visibility/enabling guard as the existing rendered
counts. Hidden navigation retains the existing last count map; opening navigation
or enabling Tags/counts reads current files and visibility rules. This is pane
visibility, not window focus or document visibility.

Visible counts keep the existing file finder, including tagged and untagged
notes, hidden folders, file tags and frontmatter-property exclusions. Folder,
property and descendant count behavior is unchanged. No cache, timer, listener,
writer, API, settings key/default, migration or persistent state is added.

Eleven actual-hook regressions use synthetic inventory and metadata with retained
React memo/ref/effect semantics; DOM and paint are outside this harness. Across
twenty version bursts with 1,000 notes, each unconsumed mode previously enumerated
the inventory twenty times. It now performs zero inventory or metadata reads.
Hidden-to-visible catch-up, enable/disable transitions, create/delete changes,
folder/frontmatter/tag visibility rules and visible aggregate counts are covered.
The focused run passes 27 checks including adjacent existing tests. All 3,307
tests in 283 files pass under Node 24.19.0. Full ESLint has zero errors and 26
existing warnings; style lint, TypeScript, locale, namespace, artifact and
operational-identity checks pass. The separate production-mode build deployed
only byte-changed runtime artifacts to the Test vault; the TEST renderer reload
confirmed 8.2.3. With navigation already hidden and Tags/counts enabled, creation
and the first body edit each performed one aggregate Tags inventory query in
8.2.2 and zero in 8.2.3. Later body edits and idle controls were already zero.
Other Navigator refreshes remain unchanged. The installed daily-note flow
passed thirteen phases with six tab switches and two remounts, retaining Health
Live Preview widgets without mutation attempts or observed errors/long tasks.
Settings, saved data and navigation state were preserved; fixtures were
byte-checked and archived. This was a hidden, unfocused warm desktop API flow,
not cold startup or physical input/paint. Full evidence boundaries and shipped
artifact hashes are in [8.2.3 release notes](release-notes/8.2.3.md).

This backward-compatible patch retains Obsidian 1.11.0 and saved settings. These
operation counts do not prove physical iPhone, Windows or production input
latency; broader responsiveness remains a separate investigation. Production
installation remains the user's BRAT pull.

## 8.2.2 — Skip image lookups when row estimates cannot change

Standard, unpinned file rows can now estimate their height without reading the
record index or drawing metadata when image state cannot change the answer.
The existing geometry calculator compares the no-image, image and missing-image
layouts. The shortcut requires images enabled, previews/tags/property rows/task
progress disabled, and an existing date or parent-folder line. It applies only
when all three computed heights are identical; no layout arithmetic or fixed
pixel threshold is duplicated.

Actual title measurement remains on the live metadata path. Short measured
titles, pinned or compact rows, previews, pills, task progress, missing metadata
lines and image-sensitive heights retain their existing behavior. Same-mtime
Excalidraw/Tldraw changes and companion images remain current. This does not stop
the virtualizer's unmeasured-tail rebuilds; it removes unnecessary per-row work
inside eligible estimates. No cache, index, timer, listener, setting, migration
or note writer is added.

The 117 focused checks include 27 new actual-hook/TanStack regressions, with
React effects, DOM and unrelated service contexts mocked. Across 1,000 rows and
six measured-tail changes, the unchanged resolver performs 6,554 metadata and
6,554 record lookups; the shortcut performs zero of either. All row keys,
positions and sizes agree across seven geometry snapshots. Desktop/mobile and
custom metrics, image states, guard exclusions and measured-title freshness are
covered. All 3,296 tests in 282 files pass under Node 24.19.0; full ESLint has
zero errors and 26 existing warnings. TypeScript, locale, namespace, artifact
and operational-identity gates pass. The final build deployed only to the Test
vault, followed by a scoped reload confirming 8.2.2. In the installed 15,000-row
list, observed unmeasured-tail rebuilds used 14,350 metadata lookups before and
seven after. These are per-rebuild observations, not equivalent frame-time
trials: rebuilds occurred in different tab phases in a hidden, unfocused window.
Live Preview Health widgets remained connected; navigation attempted no note
mutations, settings were unchanged, and synthetic fixtures were archived.
Full evidence boundaries and hashes are in
[8.2.2 release notes](release-notes/8.2.2.md).

This is a backward-compatible patch with Obsidian 1.11.0 and saved settings
unchanged. Synthetic operation counts are not physical scrolling or input
latency; iPhone, Windows and production responsiveness remain unverified.

## 8.2.1 — Keep ordinary edits out of folder-header resolution

The selected-folder header, desktop title and nearest-folder-note consumer no
longer invalidate their folder-note lookup after every body-only metadata event.
The existing subscription compares the changed note's valid authored title with
its prior contribution. Real title additions/removals, ambiguous matches,
creates, deletes, renames, moves and cold metadata still refresh their existing
owners. Folder-note settings retain their normal memo dependencies; no note,
settings schema, notification rule or public API changes.

The subscription holds only weak file/title observations for watched folders and
releases them on cleanup. It seeds current sibling titles during the same render
as the folder-note lookup, adding one cold
metadata-only pass in exchange for removing repeated sibling scans. It is not a
persistent index, background watcher, delayed repair or note writer. Unchanged
body events still read that one file's title; actual list sorting and other
consumers retain their own refresh behavior.

The rendered snapshot also preserves title changes received by the listener
after a delayed initial effect attaches; a newer effect-time baseline cannot
silently hide that change.

Focused actual-component regressions (DOM and unrelated contexts mocked) compare
1,000 siblings and twenty separately rendered body changes: 20,000 sibling reads
become twenty changed-file reads. One synchronous twenty-event burst previously
coalesced to one 1,000-read scan, not twenty scans. Initial owner mounting changes
from 1,000 to 2,000 metadata reads; unchanged rerenders do none. Full suite,
installed Test-vault verification, limitations and hashes are recorded in
[8.2.1 release notes](release-notes/8.2.1.md). This backward-compatible patch keeps
Obsidian 1.11.0 and all saved settings. Production installation and physical
iPhone responsiveness remain separate from the BRAT release.

## Install with BRAT

Add `ZachTish/tps-notebook-navigator` to BRAT. Use manual updates with `Latest`, or freeze an exact numeric tag for a controlled rollout. Each release supplies `main.js`, `manifest.json`, and `styles.css`; release notes record validation and artifact hashes. A published release is not evidence that any device has installed it.

## Install and use the TPS fork

Install this repository, **ZachTish/tps-notebook-navigator**, through BRAT. Its plugin ID is `tps-notebook-navigator`; it is co-installable with upstream `notebook-navigator`. This repository's releases are not upstream releases.

Upstream-settings import is an explicit, one-way, read-only import. It does not modify upstream settings or share plugin/view/command/storage identities. Existing note data is not copied into another vault.

## TPS integration

Navigator delegates new-note presentation to GCM's shared **Obsidian Page Preview / open in editor / stay** preference. It does not own or present an editable hover card. Toolbar creation passes its click and connected button to GCM so desktop Preview opens through Obsidian's native Page Preview; GCM uses a native editor fallback on mobile. Command and other creation routes still delegate to the same preference without a click origin.

- **Whole-note mode (8.0.0).** Navigator creates and navigates notes and file-backed Types such as Bases and Canvas. Its New action, Filter Search, and keyboard creation path do not create checkboxes, bullets, headings, code blocks, callouts, blockquotes, tables, or web-link lines. The built-in GCM task-row provider and task-line drag/drop writer are disconnected. GCM task-line controls require an explicit `supportsTaskLineMutation: true` capability, so GCM 6.0.0's disabled capability remains display-only if a dormant adapter is called directly. Navigator's own active line writers are retired. External row providers retain their API and own any row actions; Health-owned read-only Daily Macros and Activity widgets remain available. Note task counts/progress remain read-only displays. Property drops still edit whole-note Markdown frontmatter; configured list values append without discarding existing entries, and asset companion properties are not written.
- The TPS integration settings destination now contains **File types → Show File types** and **One-way setup → Import upstream Notebook Navigator settings**, with no nested disclosure. The existing native settings page and legacy mobile/older-Obsidian renderer use the same two groups. General remains the default settings route. The previous data-architecture selector, line-creation target, and attached-task-row controls are absent. Existing `tpsDataArchitectureMode`, `tpsResourceCreationTarget`, and task-row keys remain in stored settings for compatibility; loading or importing settings fixes the mode to `native-records` and keeps attached task rows off. No note migration or background repair runs.
- GCM 2.3.0+ publishes configured property keys. Navigator 6.1.0+ adds them to each vault profile's property configuration. Existing ordering and per-key visibility remain authoritative; repeated imports do nothing.
- New keys appear in Properties navigation and file menus without adding every value to list rows. Removing a GCM field does not erase Navigator preferences or note data.
- Property sort/group changes retain the active editor's position while typing and commit on save/blur. Presentation refreshes preserve authored note fields.
- New note from a property value (including a sole-property Filter Search or shortcut) uses GCM's configured property definition: a list field starts as a one-element YAML list, while scalar fields keep a scalar value and key-only selection keeps an empty value. The selected property is in the initial note payload, so no follow-up frontmatter write is needed. Without an available GCM list definition, the existing scalar behavior is retained.
- File types, folders, tags, properties, shortcuts, and views use their existing Navigator settings. Local appearance preferences retain their per-device persistence controls.

## Selection filtering (6.2.1)

**Filter tags by selection** and **Filter properties by selection** now both follow the selected folder, tag, or property key/value. Previously each switch ignored its own section, silently restoring the full tree when selecting a tag or property there. Enabled trees contain only tags, property keys, and values occurring on notes in that selection. Existing visibility and descendant rules still apply. Empty selections stay empty; disabling either switch restores that section independently. Global ordering is retained while the displayed tree is filtered.

These controls follow navigation selection, not the active note or search text. Tags and Properties roots represent the full visible note collection. Types retain their existing unscoped behavior. No settings keys, defaults, stored state, API, or layout changes are required; Obsidian 1.11.0+ remains supported. This is a backward-compatible patch to the existing filtering controls.

Validation: all 3,067 tests in 269 files passed, including folder, tag, property-key/value and empty scopes, matching values and tag memberships, global ordering, and disabled filters. Full ESLint passed with 24 existing advisory warnings; TypeScript, namespace, artifact, and operational-identity checks passed. A separate production-mode build deployed to the test vault and the plugin was explicitly reloaded. In Obsidian 1.14.2, synthetic notes confirmed selected-tag and selected-property filtering, scoped counts, and independent off/on commands restoring the unrelated tag/closed value. QA settings were restored and fixtures archived. The initial fresh-worktree test run lacked generated main.js; rebuilding and rerunning the full suite resolved both artifact-test failures. Final hashes are in the public release notes. iOS hardware is not tested; production installation remains the user's BRAT pull.

## Property notes (6.2.0)

Enable **Folders & navigation notes → Enable folder, tag and property notes** and **Names open matching notes**. Property key and value labels link to a unique Markdown filename anywhere in the vault, case-insensitively: `status` → `status.md`, and `project: xyz` → `xyz.md`. The destination need not contain the property, tags, or any frontmatter. Scalar and list values use the same property-tree labels. Names with spaces work. Matching uses the whole label; partial names, folder-path suffixes, aliases, and duplicate filenames are not guessed. Wiki-link values use their existing property-tree display label, not a new link-target resolver. No notes or properties are created or rewritten.

Click a linked name to open its note; click the icon/row to filter as before. Links appear in Properties, property shortcuts (including renamed shortcuts), and the selected list title. Enter on a selected property or focused link opens its note; middle-click opens a new tab. The existing navigation-note destination supports current tab, new tab, and right sidebar. **Open property note** in the context menu remains available when name links are off. Missing or ambiguous matches remain ordinary filter rows. File creation, rename, deletion, and folder moves refresh links without reloading. The shared transient filename index attaches vault listeners only while used; ordinary body edits do not trigger filename scans.

This additive minor release preserves settings keys/defaults, property filtering, note counts, and upstream isolation. No new destination, disclosure, schema field, migration, or mobile-specific layout is added; existing responsive rows and accessible note links are reused. No separate property-note creation/template action is included. Obsidian 1.11.0+ remains supported.

Validation: focused filename/index lifecycle, interaction, and existing tag-note/accessibility regressions; full declared tests; separate production-mode build and test-vault deployment. All 3,061 tests in 269 files passed. Native UI checks in Obsidian 1.14.1 confirmed key/value name activation, the context-menu action, preserved property scope and note bodies, and live duplicate/rename handling. Temporary preferences were restored and fixtures archived. The final artifact was explicitly reloaded after refreshing Obsidian’s cached manifest. Scoped and full ESLint, TypeScript, namespace, artifact, and operational-identity checks are recorded with SHA-256 hashes in the release notes. Pre-existing GCM catalog and artifact-test typing errors were corrected without changing the valid catalog contract; remaining lint warnings are existing advisory warnings. iOS hardware was not tested. Production updates remain the user's BRAT pull.

## Documentation and attribution

See [the preserved TPS and upstream reference](REFERENCE.md) for keyboard shortcuts, search syntax, appearance configuration, API links, import details, and historical release notes. Some entries describe earlier releases; use the current manifest and tagged release for compatibility.

This fork builds on [johansan/notebook-navigator](https://github.com/johansan/notebook-navigator). Upstream attribution and licensing remain in [LICENSE](LICENSE) and the reference. Report TPS-specific integration issues to this repository; verify upstream-only reports against upstream first.

## Development and repository policy

`main` is the stable source line. Numeric tags identify immutable released artifacts. This fork has no maintained `optimization` lane. Imported upstream topic branches are not TPS release channels.

The supported build lives inside `Obsidian Plugin Test Vault/Plugin Development`, with `TPS-Notebook-Navigator (Dev)` as the mapped stable source. These repositories depend on adjacent shared tooling including `deploy-runtime.mjs`; a standalone clone is not currently self-contained.

From the contained workspace, prepare dependencies using the shared helper, then run tests and a separate final build:

```sh
# From Plugin Development:
node ./prepare-dependencies.mjs "TPS-Notebook-Navigator (Dev)"
cd "TPS-Notebook-Navigator (Dev)"
npm test
npm run build
```

Dependencies stay in the vault's `.plugin-dev-cache.nosync` through a relative `node_modules` symlink. Use a clean, current checkout; preserve unrelated changes and never build an old dirty worktree into the test runtime. Stable builds deploy only shipped artifacts to the test vault. Optimization builds are build-only. Runtime `data.json`, secrets, caches, and session state never belong in Git.

Documentation-only maintenance does not create a new plugin version. Published release tags and assets are preserved. Do not rely on legacy version/release scripts without reviewing their current behavior. Production updates remain the user's BRAT handoff.

For prior feature details and release-specific evidence, see [REFERENCE.md](REFERENCE.md) and [GitHub releases](https://github.com/ZachTish/tps-notebook-navigator/releases). The September 16 cleanup changes documentation and repository metadata, not shipped behavior.

## 6.3.0 — Shared note creation opening (2026-09-20)

With TPS Global Context Menu 2.5.0+, new Markdown notes follow GCM's **Menus & surfaces → Note opening** preview/open/stay preference. Folder, tag, and property New note actions, Navigator's New note command, tag-note creation and ordinary Markdown folder-note creation use the shared post-creation API. Tag/property writes and manual-sort placement still finish before presentation. Explicit new-tab and special folder-note sidebar/split destinations keep their requested destination. Background `openFile: false` creation, existing-note navigation, periodic home/daily navigation, independent Templater commands, and non-Markdown resources retain their existing behavior.

Appearance & behavior replaces **Open new notes in new tab** with **After creating a note → Configure note opening** when the new GCM API exists. The legacy `createNewNotesInNewTab` key is retained for GCM's one-time migration and older/disabled-GCM fallback, but no longer overrides the shared preference. No Navigator schema migration or new persisted UI state is needed. All TPS namespace boundaries remain intact.

`utils/tpsNoteOpening.ts` feature-detects GCM's additive `api.ui.presentCreatedNote` and `openNoteOpeningSettings`. The handler receives only the created file path, source plugin ID, originating leaf, rename intent, and an explicit destination when requested. Provider errors acknowledge creation without triggering a second opening. Focused tests cover missing/old GCM, legacy-default suppression, explicit new-tab intent, non-Markdown fallback, and settings handoff. Full validation is `npm test`, `npm run lint`, and a separate `npm run build`, with shared-helper deployment and plugin reload in Obsidian Plugin Test Vault. Physical iPhone acceptance remains for the user's BRAT pull. Minimum Obsidian stays 1.11.0; this backward-compatible minor feature requires GCM 2.5.0 for the shared behavior.

Final validation: all 3,071 tests across 270 files passed; lint passed with 24 pre-existing warnings and no errors. The separate production build passed string/locale/type checks and deployed to the test vault. After the 6.3.0 reload, Navigator’s New note showed the shared name-focused preview while the embedded Calendar remained active. The settings handoff reached GCM’s Note opening controls. QA preferences were restored and synthetic files archived.


## 6.4.0 — Folder notes follow titles (2026-09-20)

Folder notes resolve by the direct child note's nonempty Markdown `title` property, independent of its filename and the display-name-field setting. Title keys and matching values are case-insensitive; surrounding title whitespace is ignored. Untitled notes, invalid/list/template-placeholder titles, Canvas, and Base files retain filename lookup. A valid title supersedes a stale matching filename. Duplicate matching titles within the folder do not select an arbitrary file. Lookup stays within the folder; nested notes do not become a parent's folder note.

The existing folder-note name pattern remains in effect. The root checks `Vault` first, then the actual vault name, so a root note titled `TishOS v0.2` may have an unrelated filename. Root display aliases do not redefine identity. Folder-note links still require folder notes and links enabled. Title lookup works independently of automatic filename syncing or GCM installation; GCM 2.5.1 separately corrects case-only title-to-filename syncing when Auto-rename is enabled.

Tree rows, headers, keyboard/menu actions, sidebar opening, recents, list hiding, counts, and folder styling all use the same metadata-aware resolver. Metadata changes refresh existing folder-note links without a reload. Counts resolve once per folder rather than scanning siblings per file. Explicit linking and folder renaming preserve an authored title's folder-note role; conversion derives the folder name from the title, and creation aligns a template's existing title with the intended folder note. No new settings or persisted UI schema are introduced. A title that deliberately differs from its folder-pattern name is no longer that folder's note; use a matching title to retain that role.

Regression coverage includes unrelated filenames, root/nested names and patterns, capitalization, metadata-only identity changes, missing/invalid titles, duplicate titles, and legacy filename fallback. Validation uses `npm test`, `npm run lint`, namespace/artifact/operational identity checks, and a separate `npm run build`, deployed only to Obsidian Plugin Test Vault and reloaded with the plugin command. Minimum Obsidian remains 1.11.0. This backward-compatible title lookup capability is a minor release; physical iPhone acceptance and the production BRAT pull remain user-owned.

Test-vault UI validation on 2026-09-20: with Auto-rename disabled, `Inbox/Title Folder QA 20260920/id-note.md` gained the folder link solely from its title. Navigator hid it from the list, reduced the count, and opened that exact file from the underlined tree label. Editing the title away removed the link and restored the file/count without reload. The GCM title dialog then renamed a separate `TishOS V0.2.md` fixture to `TishOS v0.2.md` on this Mac's case-insensitive filesystem, retaining the body. Temporary folder-note/auto-rename preferences were restored and fixtures archived. The final build/reload and artifact checks are recorded in the release notes.

## 6.4.1 — Faster file-type catalog sorting

File-type catalog sorting reuses one locale comparator instead of initializing locale comparison for every pair of records. This removes a measured main-thread hotspot when files are created, renamed or deleted in a large vault. Ordering remains base-sensitive by label, with the same path tie-breaker; numeric ordering, labels, type membership and immutable snapshots are unchanged. The existing 100 ms event batching and read-free metadata catalog remain.

No settings, defaults, navigation routes, namespace or stored state change. This is a backward-compatible performance patch. Regression coverage compares accented names, case, numeric text and path ties with the previous comparator, alongside the existing 10,000-file event-batching test. Full tests/lint, a separate final build, test-vault deployment/reload and measured QA are recorded in the release notes. Minimum Obsidian stays 1.11.0; production remains the user's BRAT pull.

Installed CPU sampling of a synthetic file creation plus six note opens measured the catalog refresh at approximately 832 ms before and 26 ms after this change. This is one local diagnostic comparison, not an overall speed or device guarantee. All 3,079 tests across 270 files passed, including a run on Node 24.19.0; ESLint passed with 24 existing advisory warnings. Namespace, artifact and operational identity checks passed. Test deployment and explicit reload used only Obsidian Plugin Test Vault. QA fixtures were archived, temporary runtime probes removed, and original navigation restored. No settings were saved or outbound automation enabled. See release notes for final artifact hashes.


## Immediate note renaming (6.4.2)

With GCM available, right-click **Rename note**, its inline editor, its dialog fallback and the manual-sort keyboard rename update the note's `title` through GCM's existing `api.updateFrontmatter`. Previously the default filename route changed only the file path; the subsequent title sync depended on Controller background authority and did not run on User/mobile devices. An installed test-vault reproduction immediately after creation, before metadata existed, produced `Renamed immediately.md` with `title: Untitled`.

The explicit title update now reads current source through GCM, without waiting for metadata or background events. GCM's Auto-rename setting determines whether the filename follows the new title; its creation-grace bypass, filename ownership and collision rules remain authoritative. The rename input uses the current title when metadata is available, otherwise the filename. Unchanged or blank submissions do nothing. Cancelled/rejected/failed writes cannot fall through to a filename-only rename. No watcher, delayed repair, retry, migration or persisted preference was added. Separately configured non-title display-name fields, folder-note detachment and non-Markdown filenames retain their existing behavior. Without GCM's update capability, Navigator uses its existing standalone configuration.

Focused regression coverage exercises missing metadata, explicit title ownership, zero-result/cancel/error handling, unchanged submissions, title prefill, dialog parity, custom display fields, standalone operation and non-Markdown/detachment paths. Required validation is the full Vitest suite, ESLint, namespace and operational-identity checks, a separate final TypeScript/production build with test deployment, targeted plugin reload and installed immediate-rename verification. Results and artifact hashes are in [6.4.2 release notes](release-notes/6.4.2.md). Minimum Obsidian remains 1.11.0. GCM 3.3.3 is the tested integration version; no GCM runtime change is required. Physical iPhone acceptance and the production BRAT update remain separate.


Validation on 2026-09-25: all 3,089 tests across 270 files passed, including 16 focused rename tests. Full ESLint passed with the same 24 existing advisory warnings and zero errors; namespace, operational-identity, artifact, unused-string and TypeScript checks passed. Installed 6.4.1 reproduced the mismatch before metadata existed on a User-role device. Installed 6.4.2 changed both filename and title through the same immediate operation and preserved the body. The actual New note → right-click → Rename note UI sequence also produced matching filename/title. Final production build deployed only to the test vault, followed by targeted Navigator reload. GCM settings remained byte-identical; Navigator recorded its normal version acknowledgement, and no user preferences were manually changed. Fixtures were archived directly and prior Navigator folder selection restored. Production remains untouched.

## 6.5.0 — Navigator visibility in Custom properties

Navigator's Properties configuration button, section-menu action, and property-key settings action open GCM's Rules & fields → Custom fields destination. Tags, ADOLink, PR Link, all other existing definitions, and note frontmatter remain unchanged. This release adds controls; it does not apply the proposed taxonomy or remove Health fields.

Each GCM property editor shows three Navigator toggles: navigation tree, populated note-list values, and file context menu. These edit only the active Navigator profile, whose name is shown beside the controls. Global Navigator section/list switches still govern their surfaces. Existing per-profile visibility and ordering remain authoritative; missing keys are added only when edited, with unrelated surfaces off. Existing catalog import behavior is unchanged. Removing a GCM definition does not erase Navigator preferences or note data. Navigator-only keys can be managed here by adding a matching GCM custom property.

GCM 3.4.0 publishes `api.ui.openCustomPropertySettings(): boolean`; Navigator 6.5.0 publishes `api.propertyVisibility` v1 with `get(key)` and `set(key, surface, visible, expectedProfileId)`. The three surfaces are `showInNavigation`, `showInList`, and `showInFileMenu`. GCM hosts the controls; Navigator validates and persists its existing profile settings. There is no mirrored visibility configuration, migration, note writer, new watcher or background automation. Stale-profile edits fail before mutation. Failed saves restore in-memory visibility and surface the error.

The handoff clears only transient property search/type filters and focuses the property search. No destination or nested disclosure is added: controls sit inside the existing single expanded property editor and reuse the responsive native Setting/toggle layout. Navigator retains its original configuration modal with missing/older GCM; GCM shows the required Navigator version when its adapter is unavailable. Upstream Notebook Navigator is never addressed.

Validation: focused adapter tests cover existing values, profile isolation, casing/order, new keys, no-op writes, stale profiles, save failure and missing providers. The full suites, final builds and installed test-vault UI verification are recorded in this release's notes. This is a backward-compatible minor feature, ready for a BRAT pull after publication; production installation and physical iPhone acceptance are separate.

Explicit all-off property entries now survive Navigator normalization and the standalone modal, so a later catalog refresh cannot re-enable a deliberately hidden key. Installed QA used Navigator’s Configure property keys action to open GCM, expanded Status, changed visibility using the native toggles, reloaded Navigator with every surface off, and confirmed the persisted all-off entry. Original test-profile keys were restored; GCM custom-property definitions were unchanged. No notes were created or modified. Controls reuse the existing responsive native settings layout; physical iPhone testing remains outstanding.

All 3,097 tests across 271 files passed. ESLint passed with 24 existing advisory warnings and no errors. Namespace, operational identity, artifact identity, string/locale and TypeScript checks passed. Final artifacts were deployed only to Obsidian Plugin Test Vault and reloaded with the targeted plugin command. Release notes contain SHA-256 hashes.


## 6.5.1 — Title rows are a maximum

Choosing two or three title rows now reserves only the lines a note title actually uses. Short titles stay on one line; longer titles wrap up to the existing limit and then truncate. The same behavior applies to standard and compact note lists and existing per-folder appearance overrides. Previews, dates, tags, properties and thumbnail minimum heights retain their existing space. There is no new setting or migration, and no note data changes.

The virtual list previously reserved the configured maximum for every title despite CSS already clamping only when necessary. It now measures the title through the virtualizer's existing ResizeObserver and feeds that height into the existing row-size calculation. Renames, pane resizing and font changes update the measured height. Existing settings/content invalidation remeasures mounted titles even during scrolling; otherwise clearing cached row sizes could leave short titles at the maximum estimate. Unmounted notes retain the maximum estimate until measured. Provider-generated non-file rows keep their existing sizing.

Regression coverage includes standard/compact short→wrapped→short titles, previews/dates/property rows, thumbnail floors, mobile and fractional line metrics, and unmeasured titles. Installed test-vault QA on 2026-09-26 verified 36/56 px standard rows for one/two-line titles, 28/48 px compact rows, one/two/three-row limits, renaming in both directions, and switching between narrow dual panes and a wider single pane. Settings were restored and synthetic fixtures archived directly. Physical iPhone validation remains separate.

Validation and SHA-256 hashes are recorded in [6.5.1 release notes](release-notes/6.5.1.md). Required validation includes the full Vitest suite, ESLint, style lint, identity checks, a separate final production build deployed only to the test vault, and a targeted Navigator reload. Minimum Obsidian remains 1.11.0. This patch is ready for the user's BRAT pull after publication; production installation is separate.


## 7.0.0 — Navigation searches the vault root

Selecting a folder, tag, property key/value or file/structural Type now fills the visible Filter Search field and returns the list scope to the vault root. Selecting Tags or Properties roots clears the filter. Clearing the field or closing Search shows the whole visible vault, including descendants regardless of the subfolder toggle. The descendant toggle is hidden for the always-recursive root; folder inclusion is visible in the query. Existing hidden-item and file-visibility preferences still apply. Ordinary file rows continue opening notes.

Examples: a tag becomes `#work`, a property becomes `.status=todo`, and Bases becomes `type:file:base`. Folder clicks become `folder:"/Projects"` for direct children or `folder:"/Projects/**"` for a subtree, according to that folder's existing descendant preference. The new `/**` suffix matches the folder and its children without matching sibling prefixes; exact and segment folder filters retain their previous syntax. Selecting a different tree item replaces the current query; existing modifier-click search composition remains available.

The existing search hook consumes navigation before paint, uses the existing selection dispatch to root the list, and keeps the clicked target in navigation history without adding a root entry. Tree highlighting, scrolling, arrow keys and rename/open actions use that existing history cursor independently of the root list scope. Search text is the only active filter. No watcher, persisted schema, note migration or duplicate filter store is added. Sort and appearance now use the root's settings; saved per-scope overrides remain stored. Public selection/list snapshots report the root, with criteria in `search.query`. This intentional change to navigation/API semantics warrants a major release. Minimum Obsidian remains 1.11.0.

Saved searches with a start folder/tag/property materialize that location in the visible query and run from the root; unavailable targets still fail closed. Such searches use Navigator Filter Search so the generated facets are executable. Saved searches without a start constraint retain their chosen provider. Search terms for structural Types continue using existing row-local semantics.

New note from a single folder, tag or property search reuses that facet's existing creation writer. Explicit Type searches retain their existing resource creation flow. Mixed, negative, text and ambiguous searches keep their creation restrictions; clearing Search restores ordinary root note creation. No new automatic properties are introduced.

Regression coverage covers navigation serialization, aggregate roots, property values, Types, quoted paths, subtree boundaries/exclusions, root recursion and creation eligibility. Installed test-vault QA exercises navigation and clear/erase/close, direct versus recursive folders, saved start targets, note creation with the selected tag, and final reload. Original test settings are restored and synthetic fixtures archived directly. Full tests, lint, identity checks, final build/deploy/reload and artifact hashes are recorded in [7.0.0 release notes](release-notes/7.0.0.md). Physical iPhone acceptance and the production BRAT update remain separate.


## 7.0.1 — Keep note titles beside their icons

Fixes overlapping titles and icons in compact and standard file lists. The intrinsic-title measurement added in 6.5.1 uses `data-index`; an older generic CSS rule incorrectly positioned every indexed descendant as an entire virtual row. Removing that redundant rule leaves only the existing explicit virtual-row classes responsible for positioning. Titles and inline rename fields remain in their text column, and short versus wrapped title heights still use the same measurement path. Navigation rows, group headers, providers and scroll positioning retain their explicit wrapper styles.

No settings, note data, tag classifications, APIs or mobile preferences change. Minimum Obsidian remains 1.11.0. A focused regression protects the separation between measurement attributes and positioned row classes; the existing title-height tests cover short/wrapped titles, compact rows and mobile metrics. Validation and artifact hashes are recorded in [7.0.1 release notes](release-notes/7.0.1.md). Production installation remains the user's BRAT pull.


Installed test-vault verification on 2026-09-27 reproduced `position: absolute` on file titles before the fix, then confirmed `position: static` after targeted Navigator reload. Rendered standard and compact probes both retained a 6 px icon-to-title gap, measured short titles at 20 px and wrapped titles at 40 px, and kept virtual wrappers absolutely positioned. A current app screenshot confirmed that titles and preview/metadata text no longer overlap. The probe removed its temporary DOM and did not create notes or change preferences; runtime settings stayed byte-identical. All 3,144 tests in 271 files, style lint, TypeScript, locale, namespace and artifact/operational identity checks passed. ESLint reported zero errors and the existing 24 advisory warnings. The final build deployed only to Obsidian Plugin Test Vault. Physical iPhone verification remains separate.

## 7.0.2 — Faster navigation and complete facet note creation

Ordinary navigation no longer builds a searchable title/alias map for every note. Empty search, tag/property/folder/type/date filters without name clauses, and Omnisearch do not consume that map, so they now skip its full-list title resolution and metadata listener. Previously each list refresh could ask GCM to inspect every native record merely to build unused search names, blocking the same UI thread that opens and renders notes.

Positive or excluded name clauses still activate the existing map. Metadata changes update the affected note's title and aliases while search is active; clearing search releases the listener, and reactivation reads current names. Visible row titles, title sorting, aliases, search results, GCM identity validation, and note-opening behavior retain their contracts. No new cache, poller, setting, storage field, or migration is introduced.

Creating a note from a tag or property now includes that facet in the initial file content passed to Obsidian's existing Markdown creation API. Previously Navigator created an empty file, then performed a second frontmatter write and continued opening the note even if that assignment failed. Creation observers now see the selected nested tag or typed property value immediately. Property key roots still produce a present key with a null value. Default folder resolution, unique naming, creation hooks, manual-sort placement and the shared GCM presentation route are unchanged. Failed creation does not present an incomplete note; no repair or retry is added.

Regression checks execute the hook's effects and count work: a 1,000-note startup and repeated empty-search/list refreshes make zero display-name inspections and zero search-metadata reads; name search builds once, then one changed note adds one lookup. Alias matching, negative name clauses, structural-only filters, clearing/reactivating search, and Omnisearch are covered. The 23 focused search checks and full suite of 3,157 tests in 273 files passed. ESLint reported zero errors and the existing 24 advisory warnings; TypeScript, locale, namespace and artifact/operational identity checks passed.

Installed test-vault QA on 2026-09-27 compared four opens of two unchanged notes in the same Navigator selection/search state, with 10,256 notes indexed. With the combined GCM 3.6.2 and Navigator 7.0.2 fixes, GCM identity inspections fell from 72,849 to 448. The four measured opens changed from 15/550/504/19 ms to 20/29/24/20 ms. Maximum observed timer delay changed from 2,900 ms to 904 ms, but the test window was backgrounded with timer throttling enabled; that metric does not prove a CPU stall. These measurements do not establish production or iPhone timings, and opening-call duration is not an end-to-end rendering guarantee.

A separate post-fix repeat with the test window visible and focused measured opens of 42/11/15/11 ms, 594 identity inspections, at most 18 ms drift on a 100 ms timer, and no PerformanceObserver long tasks during the roughly six-second capture. A warm plugin reload measured 266 ms with zero vault body-read or write calls; this was a plugin reload in the backgrounded window, not a full Obsidian cold start.

After reloading the final build, installed creation QA called the real Navigator file-system operations for tag, property and folder creation with the real GCM registry. Each route made one Markdown creation call, one vault create and one presentation call, with no follow-up frontmatter/process/modify write from creation. The selected nested tag and synthetic property were present in the initial API and vault payloads and parsed correctly in metadata. Immediate test body edits survived 4.5 seconds of settling; configured preview opened for all three routes. Temporary Inbox fixtures were archived directly, wrappers and list state restored, and runtime settings preserved. This covered installed creation APIs, not toolbar-command gestures or a physical iPhone.

The final versioned build was deployed and Navigator reloaded only in Obsidian Plugin Test Vault. A separate build after documentation changes confirmed byte-identical runtime artifacts and preserved runtime settings. Release details and SHA-256 hashes are in [7.0.2 release notes](release-notes/7.0.2.md). Minimum Obsidian remains 1.11.0. Production installation and physical iPhone acceptance remain the user's BRAT pull.

## 7.0.3 — Keep appearance refreshes out of list indexing

Generated GCM icons and colors refresh mounted rows without invalidating the display-name getter, full selection scan, text/alias search map, date grouping or virtualizer item keys. Previously completion of an appearance batch—including preparation of newly visible rows while scrolling—changed the name callback's identity and rebuilt those unrelated results. The existing transient presentation revision now travels explicitly to visible row props. Non-manual property sorting and property grouping still consume that revision because they can use generated values; authored/manual ordering stays authoritative. Actual title metadata, provider lifecycle, settings and owning list events retain their existing refresh paths.

No new cache, listener, timer, persisted setting, migration, note writer or public API is introduced. The focused regression exercises the real Storage provider and list/search hooks, with storage startup and optional provider boundaries mocked: one mount plus 20 appearance batches over 1,000 notes previously derived the full candidate list 21 times; it now derives once for empty, text and tag queries, with zero additional name inspections and stable list-item identity. Tests also cover one-note title changes, alias lookup, API replacement, settings changes, explicit list refresh, live appearance values, generated property sorting/grouping and manual-property exclusions.

Installed test-vault QA on 2026-09-27 compared 7.0.2 and 7.0.3 in the actual full list. Ten synthetic appearance notifications with no search reduced metadata lookups from 103,170 to 640 and identity inspections from 360 to 320; median measured batch time changed from 50.75 to 19.7 ms. With the text query `QA`, metadata lookups fell from 219,200 to 620 and identity inspections from 103,630 to 310; median time changed from 409 to 18.8 ms. The query contained 670 rows in both runs; the empty lists contained approximately 11,000 rows (11,009 before and 11,011 after). These are synthetic notifications delivered through the installed integration, not physical scroll/input gestures or a native-Obsidian acceptance result.

A separate 12-step programmatic scroll through the real list reduced metadata lookups from 339,517 to 218,905 and median sampled time from 80.4 to 58.05 ms. Identity inspections changed from 1,819 to 1,889; scrolling still performs substantial metadata work. Both captures recorded zero concurrent vault events and no PerformanceObserver long tasks. These small diagnostic samples establish improvement in the targeted cascade, not a guarantee of overall performance, production speed, iPhone behavior or native-equivalent latency. Generated property ordering still consumes the coarse presentation revision, and actual membership/name/date changes still use their owning refresh paths.

Validation: 26 focused checks and the full 3,165-test suite in 274 files passed. Full ESLint reported zero errors and the same 24 existing advisory warnings; TypeScript, locale, namespace and artifact/operational-identity checks passed. The tested artifact was deployed and reloaded only in Obsidian Plugin Test Vault. A separate final production build after documentation updates verified byte-identical artifacts and preserved runtime settings. Version 7.0.3 is a backward-compatible patch with Obsidian 1.11.0+ unchanged. Release details and SHA-256 hashes are in [7.0.3 release notes](release-notes/7.0.3.md); production installation remains the user's BRAT pull.


## 7.0.4 — Avoid repeated provider checks during scrolling

Ordinary Markdown notes now bypass drawing-provider enumeration and flag parsing when current Obsidian metadata contains neither drawing flag and the filename does not designate a drawing. Every present flag, including null, empty and unsupported values, continues through the original provider truthiness rules. Filename drawings, excluded drawings, companion images and theme-specific selection retain their behavior. Metadata is still read live on every estimate: same-mtime frontmatter changes take effect immediately even while Navigator's existing property-index update is buffered.

This correction adds no cache, generation state, observer, timer, setting, persistent field, writer or repair. The virtualizer still measures actual title height, preserving one-line titles under the two-line maximum and drawing/property-row geometry. The generic unmeasured-tail walk and live metadata lookups remain; this release targets repeated provider work inside that path.

A focused regression runs the actual TanStack Virtualizer over 1,000 notes and 24 measured title-size changes. Before the fix it repeated the ordinary-note provider flag check 18,400 times; afterward it skips those checks, with identical total and individual row geometry against a reference that exercises the full provider path. Metadata lookups remain unchanged. Regression coverage also executes the actual storage metadata-event handler and checks both drawing keys before its 100ms reindexing buffer flushes, with unchanged file mtime and stale indexed properties. Cold/stale/reset data, filename renames, flag truthiness, excluded drawings, missing/theme-specific companion images and content/settings changes remain covered. The 58 focused checks and full 3,180 tests in 275 files passed. Full ESLint reported zero errors and the same 24 existing advisory warnings; source TypeScript, locale, namespace and artifact/operational-identity checks passed.

Installed test-vault profiling on 2026-09-27 compared two 24-step programmatic scroll captures per version, with GCM 3.6.5 unchanged, a focused foreground window, the same 426px list width, and a plugin reload plus five-second settling period before each capture. Mean sampled active CPU time fell from 995.7 ms in 7.0.3 to 866.2 ms in 7.0.4 (about 13%). Drawing-provider inclusive CPU fell from 344.3 to 239.5 ms; the provider-loop portion fell from 170.8 to 62.8 ms. Inclusive measurements overlap and must not be added. Live metadata lookups and the generic virtualizer tail walk remain.

Release-note overlays were present during these captures: they profiled the underlying installed list programmatically, not unobstructed user scrolling. The two paint medians changed from 54.65/53.0 ms to 50.5/53.2 ms, with no observed long tasks in either version. These small samples support a reduction in the targeted CPU branch, not a strong visible-latency, production, iPhone or native-equivalent performance claim. After dismissing the accumulated release dialogs, installed visual inspection of the live list and a page scroll down/up showed correct row/title/path spacing, without observed overlaps or blank rows. Closing the dialogs advanced only the existing `lastShownVersion` marker from 7.0.1 to 7.0.4; all other Navigator settings were unchanged. The versioned artifact was deployed and Navigator reloaded only in Obsidian Plugin Test Vault. A separate final production build after documentation changes verified byte-identical artifacts. Version 7.0.4 is a backward-compatible patch; minimum Obsidian remains 1.11.0. Release details and SHA-256 hashes are in [7.0.4 release notes](release-notes/7.0.4.md); production installation remains the user's BRAT pull.


## 7.0.5 — Reuse search names when the list reorders

With internal title/alias search active, editing or renaming one note no longer resolves every candidate's display name again merely because the list received a new file array. The existing search-name map retains entries for the same file objects and paths, resolves additions and replacements, and drops departed paths. Its existing metadata listener updates the changed note's name and aliases. Replacing the display-name getter or metadata source still rebuilds all active names; clearing name search, switching to structural-only filters, or using Omnisearch releases the unused map and listener.

Membership reconciliation keeps the source file object in each existing entry so deleting and recreating a note at the same path cannot inherit its old name or aliases. Changed events and new entries pass their already-available Obsidian metadata to the existing display-name getter. This preserves fresh configured titles even when file mtime is unchanged and Navigator's persisted metadata still contains the previous title. Callers without supplied metadata retain the normal cached display route; native identity validation and authored-title precedence remain unchanged.

This is a backward-compatible performance patch, with no new cache, listener, timer, writer, setting, migration or public API. Candidate collection, modified-date and title/property sorting, pinning, grouping, visibility and note creation/opening retain their owners. Actual list ordering and membership changes still perform their existing work. Minimum Obsidian remains 1.11.0.

A regression with 1,000 notes and 20 unchanged body metadata events followed by modified-order array refreshes reproduces 20,020 name inspections before the fix and requires only 20 afterward. Same-membership refreshes perform zero name/alias metadata lookups and retain map identity. Tests cover real title/alias updates, additions/removals, rename events before list membership catches up, same-path replacement, getter and metadata-source replacement, clearing/reactivating search, Omnisearch, and same-mtime configured-title freshness through the real Storage provider/list hook.

For the combined edit improvement, use GCM 3.6.5 or newer alongside this release. Older GCM builds may announce API replacement on ordinary edits, which correctly invalidates the name resolver and limits entry reuse. This is guidance, not a new hard dependency or setting change.

Validation under Node 24.19.0 and npm 10.9.2: 26 focused checks and all 3,189 tests in 275 files passed. Full ESLint reported zero errors and the existing 24 advisory warnings; scoped final lint, formatting, namespace, artifact and operational-identity checks passed. The separate production-mode build passed TypeScript and locale checks, then the same artifact was deployed and explicitly reloaded only in Obsidian Plugin Test Vault. A separate final normal build after documentation updates verified byte-identical artifacts and reported the test runtime unchanged. Release details and SHA-256 hashes are in [7.0.5 release notes](release-notes/7.0.5.md).

Installed test-vault QA on 2026-09-27 kept GCM 3.6.5 and the internal text query `QA` unchanged. Six body edits made 112 native-record inspections and 1,471 metadata accesses on the first capture, then 42–43 inspections and 713–714 metadata accesses per warm capture; the preceding baseline was about 10,413 inspections and 22,071 metadata accesses per edit. Each capture had one fixture modify event, no API publications or blocked query calls, and preserved body content and search state. These counters include other necessary display work; the unit regression isolates the search-map owner.

Twelve title saves in the real title dialog reduced native-record inspections from 31,668–31,810 to 569–659 per save, including settling. Every save selected the existing title, preserved the body, and produced exactly one modify and one rename with matching title/filename. No API publications or post-change long tasks were observed. Median writer and two-frame visible-update times changed from 138.2/150.5 ms to 123.95/137.45 ms; these are descriptive small-sample timings, not a comparable percentage of native Obsidian performance. One baseline sample lost foreground focus and was excluded from the timing comparison. The after captures remained visible and focused.

An actual Navigator toolbar creation gesture then opened the configured preview with Untitled selected. Typing a title and pressing Enter updated its filename and focused the body; typing body text and dismissing the preview preserved that body exactly once. The flow had one create, two modifies (title and body), one rename, matching final title/filename, no writes outside the fixture, unchanged probe settings and restored instrumentation. The initial QA setup expected a folder selection rather than the current root-plus-folder-query route; the corrected setup exercised the existing route without a plugin change. The four exact QA folders, including the empty setup fixture, were moved directly to the test vault's archive. Six runtime settings files remained byte-identical; Navigator differed only in its existing lastShownVersion marker, from 7.0.1 in the saved baseline to 7.0.5. No other Navigator setting changed and no configuration migration was performed.

These results establish reduced redundant search work in the installed test vault. They do not establish cold-start, production, physical iPhone or native-equivalent performance. Production installation and physical iPhone acceptance remain the user's BRAT pull.


## 7.0.6 — Update the file-type catalog from changed files

File creation, rename and deletion now update the existing immutable file-type snapshot in the existing 100 ms event batch. The batch resolves and classifies only affected live files, walks existing records once, and sorts each changed bucket once. Folder events include descendants, overlapping paths are classified once, and rapid rename/delete/recreate operations use the final live files. Unaffected records and bucket arrays retain their identity. The initial subscription and re-enabling the feature still build one full snapshot.

The file-type store also owns one metadata-change subscription while enabled and subscribed. It queues only actual Markdown Notes/Drawings classification differences using the existing drawing-flag rules. Ordinary title/body metadata changes do not queue a timer, enumerate files, read metadata again, publish a snapshot or read note bodies. Cold metadata can move a newly created note into Drawings when its flag becomes available; intrinsic drawing filenames retain their classification. Disabling or releasing the last subscriber removes every store listener and clears the pending batch.

The change fixes the source of a measured post-rename scan: the former timer rebuilt the complete catalog after any file event, including metadata classification of every Markdown note. It also gives drawing-frontmatter edits their owning invalidation event instead of leaving classification stale until a later file operation. The pending path collection exists only until the current batch flushes; no persistent index, cache, extra timer, settings, migration, writer or repair is added. File type IDs, sorting, API snapshots, navigation behavior and minimum Obsidian 1.11.0 are unchanged. This is a backward-compatible patch.

Focused tests reproduce the previous whole-vault refresh and compare resulting snapshots with the unchanged full builder. A single rename among 1,000 notes now makes one classification lookup and zero vault enumerations; a 1,000-rename burst among 10,000 notes makes 1,000 lookups and one publication. A burst of 1,000 unchanged metadata events makes zero classification lookups, enumerations, timers or publications. Folder moves/deletion/recreation, extension changes, drawing flag truthiness, same-path replacement, late stale events, cold metadata before and after a create batch, immutable records and subscription cleanup are covered. All 28 focused checks and all 3,202 versioned tests in 275 files pass under Node 24.19.0. Full ESLint has zero errors and the existing 24 advisory warnings; TypeScript, locale, formatting, namespace, artifact and operational-identity checks pass. The separate final production build deployed byte-changed main.js/manifest.json to the test vault; named disable/loadManifest/enable verified installed 7.0.6. The final documentation rebuild retained identical artifacts. See [7.0.6 release notes](release-notes/7.0.6.md) for hashes and BRAT handoff.

The actual foreground Navigator right-click → Rename flow, with GCM held at 3.6.9, reduced post-save metadata accesses from 10,574 to 174 (98.4%). Save duration remained comparable at 79.4 versus 81.7 ms; the removed catalog work occurred after the save. Both samples preserved title, filename and body, with one modify/rename/completion event and no observed long tasks or outside note mutations. A separate installed check reproduced 7.0.5’s stale drawing classification and verified Notes → Drawings → Notes on 7.0.6. Hooks and original note/search were restored and fixtures archived. Dismissing the update notice changed only lastShownVersion (7.0.5 → 7.0.6); other Navigator settings and six other plugin settings were unchanged. This verifies reduced redundant work and drawing freshness in the test vault, not cold-start, production, physical iPhone or native-equivalent speed. The user owns the production BRAT pull.


## 7.0.7 — New note command follows the visible navigation filter

Navigator's **New note** command now uses the current folder, tag, or property search created by root-scoped navigation, just as the toolbar does. Previously the command used the root selection and created an unmatched ordinary note even when a tag or property was selected. The existing strict navigation-search resolver determines the target; both entry points dispatch through the same existing folder/tag/property creation services. Tag/property payloads and shared GCM presentation remain owned by those services.

Creation follows the current search text during debounce, ignores stale text after search is closed, and rejects text/composite, Type-resource, or external-provider searches that cannot be represented as one navigation-facet note. Missing folders do not fall back to root. Clearing search retains ordinary folder/root creation. Type-resource creation stays with the toolbar's existing resource action; this patch does not turn New note into a generic New item command. Source-note resolution still prefers the selected note, then the active note. Explicit new-tab intent and each caller's existing manual-sort context/provider behavior are preserved.

This backward-compatible patch adds no persisted settings, migration, cache, watcher, timer, extra creator, or post-create writer. Minimum Obsidian remains 1.11.0. Before the source correction, the actual registered-command regression harness failed 10 assertions while two ordinary/inactive-search controls passed. The focused coverage also checks debouncing, provider fallback, unavailable folders, explicit destination and shared dispatch. An installed 7.0.6 probe intercepted the actual command and toolbar before creation: the same tag search called ordinary root creation from the command and tag creation from the toolbar, with no file writes or settings changes. Node 24.19.0/npm 10.9.2 validation passes all 3,222 tests in 276 files, including 20 focused cases. Full ESLint has zero errors and 24 existing advisory warnings; stylelint, TypeScript, formatting, namespace, artifact and operational-identity checks pass. A normal production build deployed to the test vault and named disable/loadManifest/enable verified installed 7.0.7. In foreground Obsidian 1.14.2, actual command-palette and toolbar actions agreed for Inbox, a tag, an existing property key and value; text/composite searches attempted no creation. Ten marked interception checks passed with zero vault events. The real command created one Inbox note with one handled GCM preview, selected the initial title, saved the replacement title, moved focus to the body on Enter, and preserved the body after Dismiss and settlement: one create, one rename and two modifies, with no outside mutations. The fixture was archived directly; hooks, prior note/search/scroll and fullscreen were restored. Six other plugin settings files remained byte-identical; Navigator changed only its existing lastShownVersion from 7.0.6 to 7.0.7. See [release notes](release-notes/7.0.7.md) for the tested artifact hashes and BRAT handoff. One unarmed setup using an absent synthetic property was rejected by existing selection validation; its canceled root request is retained separately from the successful existing-property cases. A foreground-window interruption occurred before body entry, and the vault guard prevented input in the other window; the test resumed only after returning to the named test vault. These are functional checks, not click-to-paint or speed measurements. No production or physical iPhone claim is made.


## 7.0.8 — Clear search without the typing delay

Clearing the search field now immediately releases its applied filter through the existing search effect. The Clear search button, its keyboard activation and deleting the final character all use this same empty-query path. Nonempty typing retains its 100 ms debounce. The existing effect cleanup cancels pending text, so it cannot restore an obsolete filter after clearing; search stays open and focused, and root-scoped navigation is unchanged.

The previous clear button used the normal text setter and waited the full keyboard debounce before restoring rows. Installed foreground captures took 168–220 ms, including that 100 ms wait. This patch removes only the unnecessary wait; it adds no state, cache, listener, timer, property or settings change. It does not optimize initial name indexing or full-list row estimation. Minimum Obsidian remains 1.11.0.

Nine hook regressions execute real state/effect logic with dependency cleanup and fake browser timers; unrelated context services and the midnight clock are mocked. Five checks fail against the previous implementation. Coverage includes name/tag/property clearing, pending input cancellation, a typing burst with one live timer, repeated empty actions, typing after clearing, deactivation and unmount. Full validation, installed results and hashes are recorded in [7.0.8 release notes](release-notes/7.0.8.md).


Installed foreground verification in Obsidian 1.14.2 kept the relevant consumers enabled and used actual text input and Clear search clicks. Three matching name/tag/property clear samples changed from 188.1/184.5/167.5 ms on 7.0.7 to 90.6/66.0/64.4 ms on 7.0.8. Readiness means two observed animation frames with the expected rows, not compositor paint. Nonempty typing stayed comparable at 262.5/132.5/139.5 ms after the final input versus 270.9/129.0/143.3 ms before. Each query returned exactly three synthetic notes, and clearing restored all 11,371 file rows. All six actions retained foreground focus, generated zero mutation events or observed long tasks, and preserved fixture content. Initial title search and root-list estimation still perform substantial metadata work; removing their costs is outside this patch.

All 3,231 tests in 277 files pass under Node 24.19.0/npm 10.9.2. Full ESLint has zero errors and the existing 24 advisory warnings; stylelint, formatting, TypeScript, locale, namespace and artifact/operational-identity checks pass. The test-only unsafe function-call lint errors from the first run were corrected and the full tests/lint rerun. A separate normal production build deployed main.js/manifest.json to the test vault and named disable/loadManifest/enable verified 7.0.8. Hooks were removed, fixtures archived directly and prior note/search restored. Five settings files remained identical during QA; across the reload, Navigator changed only its existing lastShownVersion marker. The final documentation build retained identical tested artifacts. This is a small installed test-vault comparison, not cold-start, production, mobile or native-Obsidian parity evidence. The user owns the BRAT pull.


## 7.0.9 — Skip inactive custom-header discovery

Navigator no longer scans Markdown files for custom-header word-count consumers when no configured list can render custom groups. The existing effective-grouping resolver includes default grouping, manual-sort rules, and folder/tag/property/file-type overrides. Startup, metadata changes, renames and deletes skip this unused index. Normal word/character counts and active custom headers keep their existing behavior.

Disabling the last custom-group context discards its existing consumer snapshots. Enabling one uses current metadata, including notes edited, moved or deleted while disabled. The existing settings publication invalidates the grouping decision after in-place edits. No new cache, listener, timer, retry, schema, setting or writer is introduced. This is a backward-compatible patch; minimum Obsidian remains 1.11.0.

Three regression cases failed before the fix: inactive startup/event bursts, disabled-to-enabled changes, and global word counts without inactive header discovery. The focused suite additionally retains active-header metadata readiness, overrides, appearance counts, incremental edits, folder operations and cache-only rendering. All 100 focused and 3,234 full checks pass. ESLint has zero errors and the existing 24 advisory warnings; style, locale, TypeScript, namespace and artifact/operational identity checks pass. The separate production build deployed to Test and a named reload loaded 7.0.9. A full-suite foreground warm-start pair removed the three inactive-header scans (nine total Markdown enumerations before, six after); metadata lookups fell from 265,117 to 231,209. Raw reads, cached reads and adapter operations were unchanged. The unique note body and current Navigator list were verified. These whole-window counts are separate from latency: body readiness was 2,726/2,674 ms in one before/after pair, not a native baseline, cold-process or physical-iPhone result. Settings/artifact preservation, archived fixture verification and diagnostic cleanup are recorded in [7.0.9 release notes](release-notes/7.0.9.md). Production installation remains the user's BRAT pull.

## 7.0.10 — Avoid Unicode normalization for ASCII identifiers

The shared case-insensitive identifier helper now skips NFC normalization for ASCII strings, including frontmatter keys inspected while locating a folder note by title. ASCII strings are already NFC, so trimming, lowercase matching, first-matching-key order, and authored folder-note identity remain unchanged. Non-ASCII strings still use NFC before lowercasing, preserving composed/decomposed Unicode matches. The existing folder-note lookup still scans sibling notes when a list refresh needs to resolve identity; this change removes the measured normalization work inside that scan without adding a cache, listener, setting, note writer, or migration.

Focused regressions check ordered duplicate-case keys, Unicode-equivalent keys, repeated scans across 120 unchanged sibling notes, and a title added then removed. The repeated ASCII scan performs zero NFC calls. All 3,237 versioned repository tests passed under Node 24.19.0; TypeScript and formatting checks passed. Full ESLint found zero errors and the same 24 existing advisory warnings. A test-vault folder selection with the changed code rendered the expected file list. A temporary `String.normalize` observer counted zero ASCII NFC calls from TPS Notebook Navigator during that selection; 76 calls came from Obsidian core. The observer was removed immediately after measurement. The final 7.0.10 build deployed only the plugin runtime to the test vault; its `data.json` was unchanged across build. Reloading showed the normal What's New notice, and dismissing that notice recorded `lastShownVersion: 7.0.10` in runtime-owned data. The synthetic QA files were moved to `_archive` with their bytes verified. This does not measure physical-iPhone or production latency. Release details are in [7.0.10 release notes](release-notes/7.0.10.md).

## 7.0.11 — Skip unrelated calendar refreshes

In Notebook Navigator calendar mode, a Markdown create, delete, or rename refreshes calendar note targets when its current or former path is inside the configured calendar root and could belong to a configured pattern. If every enabled pattern begins with a standalone `YYYY`, `gggg`, or `GGGG` segment, a path whose first relative segment has no decimal digit is skipped. This keeps ordinary `Inbox` note bursts from clearing the day-target cache and resolving every day in the right-sidebar year panel. The check is deliberately conservative: a note such as `2026/Project.md` may trigger an extra refresh, and a literal-first pattern may allow unrelated Markdown inside the calendar root to refresh. Exact reverse parsing cannot safely reject those paths because valid Moment formatting patterns need not parse back to their original date.

GCM API reannouncements after metadata edits leave the independent custom calendar alone. Folder moves retain a full refresh because Obsidian may move child notes without separate file events; renames check both paths, including a former Markdown path when the new extension changes. The existing 120 ms batching coalesces relevant bursts. Daily Notes integration and GCM provider readiness retain their existing refresh behavior. Calendar metadata-driven titles, task/image indicators, and profile visibility keep their own event paths. No setting, schema field, cache, watcher, writer, or migration is added. Focused regressions cover 100 unrelated `Inbox` create/rename/delete sequences, 100 GCM metadata reannouncements, generated day/week/month/quarter/year paths, literal-first patterns, localized digits, numeric-folder false positives, folder moves, extension changes, and both rename directions. All 53 focused and 3,250 full tests passed; TypeScript, locale, namespace, artifact, and operational-identity checks passed. Full ESLint had zero errors and 26 advisory warnings, including two from the new test's direct Moment import. The production build deployed `main.js` to the Test runtime and a guarded reload loaded 7.0.11; runtime `data.json` stayed byte-identical. With the installed left-sidebar September calendar visible, an unrelated Inbox create and rename each caused zero calendar day-path lookups. The synthetic note was moved directly to `_archive`. An existing July 20 daily note still opened from the calendar, and the prior calendar visibility and selected note were restored. This is an operation-count and functional check, not a physical-iPhone or cold-start timing claim. Minimum Obsidian remains 1.11.0. Release details are in [7.0.11 release notes](release-notes/7.0.11.md).

## 7.0.12 — Skip icon metadata for controls that are hidden

File rows resolve drawing preview metadata only when the effective list appearance shows images. Compact mode already hides images, so this removes a metadata lookup on every mounted compact row without changing the standard image layout, Excalidraw/Tldraw detection, or live same-mtime drawing metadata updates. File rows also skip drag-preview fallback icon resolution when native dragging is unavailable on mobile or explicitly disabled by the list. Draggable desktop rows retain the same frontmatter-sensitive icon behavior. There is no setting, stored state, listener, cache, writer, migration, or extra render path.

In the installed 7.0.11 Test vault, a foreground four-page compact scroll produced 172 drawing-source metadata lookups from mounted `FileItem` rows even though the view showed no images. The same call site produced zero on installed 7.0.12 with 46 compact rows mounted. Those probes sampled different idle/background activity, so their total metadata calls and timings are not comparable. The drag fallback guard is most relevant to iPhone, where native row dragging is disabled; physical-iPhone latency remains unmeasured. The standard-mode virtual row estimator still reads current metadata when images are enabled, because a same-mtime drawing flag can change before the existing buffered index update. The current-version warm desktop opening comparison measured eight Navigator clicks at 41.95 ms median and eight core Quick Switcher suggestion clicks at 44.8 ms median with the full plugin suite enabled; those pre-7.0.12 values are context, not a measured gain from this patch. The 46 focused drawing/icon tests and all 3,250 repository tests passed; TypeScript, namespace, artifact/operational identity, and targeted source formatting checks passed. Full ESLint had zero errors and 26 existing warnings. Repository-wide Prettier remains failing on pre-existing README and other files; this release leaves that unrelated formatting intact. The final production build deployed only `main.js` and `manifest.json` to the Test runtime; a guarded reload confirmed 7.0.12, and the original standard appearance was restored after QA. See [7.0.12 release notes](release-notes/7.0.12.md) for hashes and the BRAT handoff.

## 8.0.0 — Whole-note navigation and creation

Navigator's built-in New action now creates complete files only: Markdown notes through the existing folder, tag, property and search routes, plus file-backed Base and Canvas Types. Selecting or searching a line Type cannot create a task, bullet, heading or other Markdown fragment. The first-party GCM task-row provider and task-line property drop listener are removed. The saved legacy architecture and task-row flags cannot re-enable them; settings load and import force native records and disable line-Type navigation and attached task rows. Whole-file property drops still write Markdown frontmatter through Obsidian; configured list values append without replacing existing entries. No note body is migrated or repaired.

TPS integration has two groups: **File types**, containing **Show File types**, and **One-way setup**, containing **Import upstream Notebook Navigator settings**. General remains the default route. There is no disclosure inside this destination, no new persisted UI state, and the native settings page and older/mobile renderer expose the same two controls. The retired architecture, line-creation destination and task-row settings remain as compatibility keys only. The file-type toggle still controls whole-file navigation. Existing accessibility and responsive settings controls are reused; the installed Test-vault settings surface was checked on desktop, while physical-iPhone layout remains unverified.

The generic external row and Type-provider APIs remain available. Their owners decide which rows to show and whether to attach actions. Health owns the read-only Daily Macros and Activity widgets. Navigator's dormant GCM task adapter accepts task-line mutation and menu actions only when the corresponding GCM API explicitly reports `supportsTaskLineMutation: true`; GCM 6.0.0 reports false. Note task counts and progress indicators remain read-only. This removal of first-party line creation and attached task-row behavior is a major version; minimum Obsidian stays 1.11.0.

Focused zero-write coverage checks that line-Type Filter Search creation is rejected, no built-in GCM row provider or task-line drop listener is installed, GCM's disabled capability cannot invoke task mutators or menus, and whole-note property drops do not call GCM companion writers. All 3,209 tests across 273 files pass. ESLint has zero errors and 26 existing advisory warnings; TypeScript, stylelint, locale, TPS namespace, artifact and operational-identity checks pass. The final 8.0.0 build is installed in the Test vault, byte-identical to the tested assets. After a scoped reload, the installed settings surface showed only File types and One-way setup. With GCM 6.0.0, Navigator's New note showed Obsidian's core Page Preview; clicking the note body entered its editor and persisted a change to the created file. QA files were archived and original preferences restored. [8.0.0 release notes](release-notes/8.0.0.md) record hashes and the BRAT handoff. Production remains untouched; the user owns any later BRAT pull.

## 8.0.1 — Keep body-only metadata updates out of navigation work

Navigator no longer treats every Obsidian metadata-cache change as a structural folder or scoped tag/property change. An unchanged note body update does not bump the navigation file version, rebuild scoped tag/property trees, or invalidate folder-note exclusions and cached folder labels. Folder-note identity is compared only when the changed file was an observed folder note or could become one through its filename or authored title. Real title-driven identity changes still refresh folder visibility and labels; IndexedDB content-change notifications continue to own tag, property, folder style, and configured display-name updates. File creation, deletion, and rename still refresh their affected navigation scopes.

The change adds no settings, schema migration, writer, timer, or vault scan. Minimum Obsidian remains 1.11.0. Focused operation-count tests cover 20-event body-only bursts, active folder notes, title addition/removal, same-path display-name changes, and tag/property updates. Full test-vault validation and artifact hashes are recorded in [8.0.1 release notes](release-notes/8.0.1.md); production installation remains the user's BRAT pull.

## 8.0.2 — Create configured list properties as lists

When New note is used on a property value, Navigator now checks GCM's configured property type before publishing the note. A list property writes its selected value as a one-element YAML list in the initial file content. This applies to the Properties tree, property shortcuts and a sole-property Filter Search such as `.kind=task/todo`. Previously these creation routes wrote a scalar even though dropping that same value onto an existing note already used GCM's list type. Key-only selection still creates an empty property; selector, checkbox and unconfigured fields retain their prior scalar/boolean behavior. No post-create repair, settings field, note migration or extra writer is added.

This is a backward-compatible patch with the same minimum Obsidian 1.11.0. Focused tests cover configured lists under different key names, an empty list key, unchanged scalar creation, atomic initial payloads, and slash-valued property searches. Full validation and Test-vault verification are recorded in [8.0.2 release notes](release-notes/8.0.2.md). Production installation remains the user's BRAT pull.

## 8.1.0 — Nested property values

The Properties tree now presents plain slash-delimited values as segments, like nested tags. For example, `kind: entity/food/transaction` appears as **kind → entity → food → transaction**. Parent rows are virtual unless a note actually has that parent value; no frontmatter is rewritten. Each row keeps its full value path as its identity, so existing shortcuts, colors, icons, selection, drag/drop, and note creation still address the intended value. Clicking a parent follows the existing **Include descendant notes** preference; turning that preference off selects only notes authored with the exact parent value. Property values that are links or URLs stay one row instead of being split at their slashes.

Tree expansion, keyboard navigation, reveal, counts, ordering, property menus, shortcuts, and selected-list breadcrumbs now follow actual parent rows. The same hierarchy is available on mobile without a new settings control or persisted schema. Synthetic parents can be selected and used to create a note with that parent value; they do not themselves modify existing notes. Property-note name matching retains its existing full-value convention, so a nested value does not automatically link to a note named only after its final segment. Typed property searches retain their existing substring behavior; navigation-generated filters use the selected node's scope.

The change adds no writer, watcher, migration, or additional vault scan. It is a backward-compatible minor release with the same Obsidian 1.11.0 minimum. Tests, Test-vault validation, and artifact hashes are recorded in [8.1.0 release notes](release-notes/8.1.0.md). A production update is separate from the Test-vault build.

## 8.2.0 — Wildcards in hidden-note property rules

**Display filters → Hide notes with property rules** accepts a single `*` at either edge of a property value. `kind=transaction*` (or `kind: transaction*`) hides notes whose `kind` starts with `transaction`, including values such as `transaction/financial/investment`. `kind=*example` hides values ending in `example`. `kind=transaction/*` matches descendants without matching bare `transaction` or `transactional`. Matching checks every scalar or list entry case-insensitively. A rule with no `*` remains exact, while a key-only rule still matches whenever that property exists.

These rules hide matching notes throughout Navigator; they do not edit frontmatter or alter the property hierarchy. Only one leading or trailing wildcard is supported; a bare `*`, multiple wildcards, and mid-value wildcards are ignored. `transaction*` also matches a hypothetical `transactional` value, so use `transaction/*` when only descendants should match. The existing vault-profile setting, its responsive mobile control, and stored schema are unchanged. The matcher compiles configured rules once and uses Obsidian's metadata cache while indexing, with no note reads or writes. Focused and full validation, installed Test-vault verification, and artifact hashes are recorded in [8.2.0 release notes](release-notes/8.2.0.md). Minimum Obsidian remains 1.11.0.

<!-- Startup implementation verification: 2026-10-08 -->

Installed foreground interaction QA also clicked Navigator New note in a unique Inbox scope, opened the created item through normal Navigator selection, typed with the native keyboard and saved. Exactly one note was created; the visible body and saved source contained the typed marker. The trace counted 16 raw reads, 31 cached reads, one inventory, two process attempts and one modify across setup/creation/navigation/input inspection. The original leaf/query were restored and the owned fixture was archived byte-identically. This is a correctness check, not first-input latency or a controlled navigation benchmark.

Final post-documentation verification: the separate ordinary production build passed, reported `target=test` with unchanged runtime bytes, and retained the already-loaded and QA-verified numeric version. Public release artifacts must match the SHA-256 receipt above. Production installation, full quit/reopen and vault-close/reopen comparisons, single-versus-two-window production profiling, first-use input latency and physical mobile acceptance remain rollout verification gates.
