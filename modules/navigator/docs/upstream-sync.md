# Syncing TPS Notebook Navigator with upstream

TPS Notebook Navigator intentionally keeps the original Notebook Navigator as an independent, co-installable plugin. Optional TPS behavior stays in separate modules under `src/integrations`, `src/services/rows`, and `src/settings/tabs/TpsIntegration*`. Inherited source retains upstream CSS/DOM tokens; the TPS namespace is applied only when tests load source, esbuild bundles JavaScript, and the stylesheet builder writes the release artifact. This removes mechanical namespace edits from normal upstream conflict resolution.

## One-time remote setup

The canonical upstream project is `https://github.com/johansan/notebook-navigator.git`. Add it as `upstream` when a fresh checkout has only the TPS `origin` remote:

```bash
git remote add upstream https://github.com/johansan/notebook-navigator.git
git fetch --tags origin upstream
```

Never point `origin` at upstream. Do not rebase or force-push the shared TPS `main` branch.

## Update workflow

1. Start from a clean, current TPS `main` and create a short-lived branch such as `sync/upstream-3.4.0`.
2. Fetch both remotes, then run `npm run upstream:audit -- <upstream-ref>`. The audit is read-only: it resolves the merge base, reports fork/upstream/overlap file counts, lists every overlapping path in deterministic order, simulates `git merge-tree`, and classifies exact generated, documentation, source, test, and other overlaps and conflicts. Treat `conflict=false` overlaps as semantic-review work even though the simulated merge found no syntactic or structural conflict. The audit does not fetch, merge, write refs, or change the worktree.
3. Merge the audited upstream tag or commit with `--no-commit`. Record that exact upstream ref in the eventual commit and release notes.
4. Resolve behavioral conflicts before adding new TPS behavior. Keep the TPS manifest ID, view IDs, storage/IndexedDB namespaces, events, drag types, API lookup, settings-transfer ID, and update URL. Keep inherited `nn-` and `.notebook-navigator` CSS/DOM tokens in source; do not hand-prefix them during conflict resolution.
5. Run `npm run tps:namespace:check`. If it reports a mechanically prefixed source file, run `npm run tps:namespace` to restore the upstream token form and review that narrow repair.
6. Regenerate `styles.css` rather than hand-merging that generated artifact. The stylesheet builder and esbuild both use `scripts/tps-runtime-namespace.mjs`, and Vitest applies that same transform to imported source.
7. Run the focused identity, transform, import, and row-provider tests. Then run the full test, type, lint, formatting, style, contained build, deployment, artifact-identity, and operational-identity gates.
8. Verify both `notebook-navigator` and `tps-notebook-navigator` remain enabled together, use separate settings/storage, and can open their own views. Never automatically import or mutate upstream settings.

## Conflict map

- `src/constants/tpsIdentity.ts` is the source of truth for host-global fork identifiers.
- `tests/constants/tpsIdentity.test.ts` detects namespace and storage regressions, including the global Style Settings ID and the real upstream shortcut drag MIME.
- `scripts/upstream-merge-audit.mjs` produces a deterministic read-only conflict worklist before any merge mutation.
- `scripts/tps-runtime-namespace.mjs` owns the one-way source-to-runtime CSS/DOM transform shared by esbuild, Vitest, and generated styles. It also rewrites only bundled `@dnd-kit/core` accessibility ID prefixes so co-installed upstream and TPS views cannot emit duplicate described-by or live-region IDs.
- `scripts/tps-namespace.mjs` restores accidentally committed runtime prefixes to merge-friendly upstream source tokens.
- `scripts/check-tps-artifacts.mjs` verifies the TPS Style Settings block in both source and generated CSS and rejects upstream host-global identifiers in the final bundle.
- `scripts/check-tps-operational-identity.mjs` rejects committed deploy or settings guidance aimed at the upstream runtime while allowing only the documented explicit, read-only upstream settings import.
- `src/services/settings/UpstreamSettingsImport.ts` remains explicit, confirmed, read-only toward upstream, and one-way into TPS settings.
- `src/services/rows` owns generic transient row composition; `src/integrations/gcm` is an optional adapter with no hard dependency.
- `esbuild.config.mjs` applies the runtime namespace before bundling and uses the test-vault-owned deployment helper only in the contained development workspace. Standalone source checks deliberately do not deploy.

If an upstream release changes any of these surfaces, update the central constant or adapter and its focused regression test instead of scattering a second fork-specific path through upstream code.
