# TPS Suite

Development implementation of one modular TPS Obsidian plugin. **Not ready to install or replace standalone plugins. No combined runtime has been deployed, tagged, or released.**

## Implemented

- One Obsidian Plugin entry point and an accessible five-destination settings host. The domain settings section registry is intentionally empty until settings renderers are ported. No placeholder claims a migrated feature works.
- Independent device module selections with mandatory shared Notes core; no automatic defaults on missing/corrupt selections.
- Module-scoped configuration in the standard shared `data.json`, queued local writes, three-way conflict checks, preservation of sibling namespaces, and zero writes for unchanged saves. This is not a cross-device transaction system.
- Explicit module lifecycle contracts, validated dependency order, API readiness, disabled-module exclusion, failed-owner disposal, and synchronous stop before asynchronous drainage.
- Reviewed migration orchestration with resumable phases and failed-activation shutdown. Its IO ports are not wired to real plugin state yet. The migration is not available in the UI.
- One isolated legacy-loader guard, restored on unload, that rejects duplicate owners before their loader runs. The future host must guard all nine replaced IDs, including optional modules disabled on this device.
- Explicit rollback settings preparation using conflict-aware three-way merge; no note or state restore is performed automatically.
- Complete source snapshots from nine verified public releases with provenance and retained licensing. There are 2,737 imported files and 2,105 inventory references to settings, registrations, plugin lookups and storage.

## Source baselines

The snapshots in `modules/` are unmodified released source, not connected domain implementations. They still contain their standalone entry points, legacy lookups and retired branches. They are **not bundled** into the host. Do not activate them as nested plugins or insert fake objects into Obsidian's plugin registry. Extract explicit services and module owners before connecting them.

| Module | Release | Commit |
| --- | --- | --- |
| notes | 9.1.0 | `978dbfe763f5` |
| controller | 4.0.1 | `3021b12c0666` |
| calendar | 3.0.0 | `5bc95af2a979` |
| health | 5.1.1 | `3bad21a386a3` |
| finances | 5.0.0 | `734bc8da7579` |
| linter | 0.8.0 | `e76f134506ea` |
| navigator | 8.4.0 | `79aabf0d0f24` |
| notifier | 1.1.5 | `2ee6f3d0953e` |
| ai | 0.10.0 | `959a48eb9c75` |

`provenance.json` records complete commit IDs and original repositories. `npm run check:baseline` compares imported bytes with those Git commits in the existing local repositories. `source-inventory.json` is a location index, not proof that every dynamic control or registration has been inventoried. Regenerate with `node scripts/inventory.mjs`.

Canonical source folders contain unfinished unrelated work and were not changed. Released Health differs from local main only by later recipe regression tests/docs; Linter and Notifier also have post-release documentation differences. Integrate useful later changes deliberately rather than importing dirty checkouts.

## Settings and ownership contract

Destinations: **Notes & navigation** (default), **Calendar & reminders**, **Health**, **Finances**, **Connections & AI**. Search routes to a registered section without executing its runtime. Routes, selected sections, focus and search drafts are transient. Native buttons expose `aria-pressed`, keyboard focus is restored after navigation, and only the selected section renders. Mobile route strips scroll horizontally; controls stack and navigation is not sticky. No disclosure nesting has been added.

Module switches are device-local and apply on reload; Mac and iPhone are independent. Shared property configuration remains vault configuration. Nutrition and finance-specific fields remain separate. Existing credentials, pairings and device data stay local and retain SecretStorage references. Migration must apply original version-aware normalization before treating historical missing fields as defaults.

TishOS owns automatic calendar and bank imports. Those execution paths are excluded from the eventual suite; their codecs and display identity readers remain where needed. Existing alerts, reminder bridges and AI queues remain functional; transport redesign is outside this merge. AI Gateway is explicitly included. Watchlist remains paused and separate; Kanban remains retired. Native Markdown checkbox-marker selection is supported and is not the retired line-record model.

## Build and tests

Use the parent `prepare-dependencies.mjs` helper. `node_modules` is a relative link into `.plugin-dev-cache.nosync/tps-suite`. No runtime-owned settings or state are copied here.

- `npm test`: migration, interrupted handoff, settings conflict/no-op writes, device isolation, module lifecycle, ownership and settings UI tests.
- `npm run build`: strict TypeScript check plus host bundle in `build/main.js`.
- `npm run check:baseline`: verify the unmodified imported source snapshots.

Builds deliberately report `[runtime-deploy] target=none lane=stable ... reason=module-ports-incomplete`. There is no supported release/deploy command until the domain ports and migration IO pass integrated acceptance. The declared 0.1.0 is an unreleased development version, not a published tag.

### Validation boundaries

37 foundation tests pass. UI tests run the actual settings host with synthetic section renderers in jsdom and a minimal Obsidian control boundary; they are not full Obsidian or physical iPhone acceptance. The host compiles. Imported domain suites have not yet been run from the combined tree, and no integrated domain workflow or startup performance claim is made.

A live Obsidian 1.14.4 test-vault ownership probe produced: `blocked=true`, `legacyLoaderCalls=0`, `enabledUnchanged=true`, `restored=true`. It temporarily wrapped the actual manager, rejected a Health load before the original loader, and restored it in `finally`. It did not reload or disable any plugin or modify notes. No production changes were made.

The repository-wide whitespace check reports pre-existing whitespace/CRLF findings in imported snapshots. Those bytes are intentionally retained for baseline fidelity; the check restricted to new suite code passes. Source-byte verification passes for all 2,737 baseline files. Do not run inherited module build scripts unchanged: their original sibling deployment-helper paths need adaptation before inherited suite/build execution is valid in this combined tree.

## Remaining implementation gates

1. Extract GCM record/classification/property/atomic mutation and note-operation services from the monolithic plugin owner. Replace internal registry lookups with typed injected interfaces and explicit readiness. Keep shared indexed evidence read-only for display.
2. Connect actual settings renderers without initializing disabled modules. Inventory and validate every control/action, migrate old setting routes, and register sections with the searchable hub.
3. Port Health as the first real consumer, including food/recipe creation and mounted workout editing. The separate iPhone food-log rejection is not fixed by this foundation and still requires its underlying error.
4. Port the other domains, removing proven retired features and app-owned importer execution paths. Calendar uses React 19 and Navigator React 18; preserve isolated dependency trees during the port rather than forcing an untested upgrade.
5. Implement file/state migration IO, original version-aware settings normalization, review UI, per-device adoption, journal storage, source checks, safe stopping/drainage of old owners, command aliases, protocol/view compatibility, and reviewed rollback. Current callbacks and pure helpers do not establish these guarantees by themselves.
6. Run inherited suites and full test-vault workflows, including Sync arrivals, recurrence state, AI jobs, optional-module zero-work counts, cold starts and physical iPhone acceptance. Record reads/writes/scans separately from time.
7. Only after acceptance: version, full tests, separate final build, test deployment/reload, artifact hashes, public numeric tag and BRAT-compatible release. Production installation is separate.

## Licensing

The combined project uses GPLv3-compatible public source distribution, as requested. Navigator's GPLv3 license is retained at the root and in its module; Calendar and Linter MIT notices and other imported notices remain with their source. The dependency/assets attribution audit remains a release gate. Do not remove upstream copyright notices.
