# TPS Suite development

Follow the containing test vault's AGENTS.md. This repository is the user-authorized new combined plugin; the original plugin repositories and their dirty worktrees remain independent and must not be reset or overwritten.

- `modules/` currently contains verified release source snapshots, not completed module ports. `provenance.json` pins their original public repositories and commits.
- Only `src/main.ts` may become the Obsidian plugin entry point. Do not instantiate standalone plugin classes as nested plugins or create fake registry entries to bypass dependency work.
- The build is deliberately deployment-gated until real module ports and migration acceptance are complete. Do not remove the gate merely to produce a release or UI demo.
- Update the README's implemented/remaining distinction as each real port is validated. A passing host test is not domain integration or mobile acceptance.
- Preserve device-local settings and secrets; never publish real vault settings, notes, credentials, journals, caches or identity mappings.
- Use the parent dependency helper and the suite-specific relative node_modules cache symlink.
- AI Gateway is explicitly resumed for this consolidation. Watchlist remains paused; Kanban remains retired.
- Do not run inherited deployment scripts unchanged. Adapt their build/test boundaries and retain original tests during each module port.
- Publish no numeric tag or installable release until the complete combined artifact passes the authorized plan's test-vault and device acceptance gates.
