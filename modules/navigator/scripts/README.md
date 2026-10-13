# Scripts

Utility scripts for building, releasing, and maintaining the Notebook Navigator plugin.

## build.sh / build.ps1

The main build script that ensures code quality before deployment.

**Usage:**

```bash
./scripts/build.sh
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build.ps1
```

**Features:**

- Generates icon constants from `icon.svg`
- Runs ESLint to check for code quality issues
- Runs Stylelint and regenerates `styles.css`
- Checks for unused localization keys and locale schema mismatches
- Validates TypeScript types
- Checks for unused imports and dead code
- Formats code with Prettier
- Runs unit tests
- Builds the plugin using esbuild
- **Aborts before bundling or deployment if ANY errors or warnings are found**
- Calls an optional local deployment script after a successful build (`build.sh` runs `build-local.sh`; `build.ps1` prefers `build-local.ps1` and falls back to `build-local.sh` when Bash is available)

**Requirements:**

- The build MUST complete with zero errors and zero warnings
- The build summary must show "✅ No warnings"
- Any lint, localization, type-check, test, or warning failure will abort the deployment
- Node.js `>=24.0.0` is required by `package.json`

## build-icons.mjs

Generates `src/constants/notebookNavigatorIcon.ts` from `icon.svg`.

**Usage:**

```bash
npm run build:icons
```

**Features:**

- Extracts the inner SVG content expected by Obsidian `addIcon()`
- Adds current-color stroke handling
- Writes the generated TypeScript icon constants file only when content changes

## build-styles.mjs

Generates `styles.css` from the source CSS entry point and section files.

**Usage:**

```bash
npm run build:styles
```

**Features:**

- Reads import order from `src/styles/index.css`
- Concatenates files from `src/styles/sections/*`
- Validates theming variables, defaults, grouping, ordering, Style Settings exclusions, and the complete example against
  `docs/theming-guide.md`
- Writes the generated `styles.css` file only when content changes
- Used by `npm run build`, `npm run lint:styles`, and `./scripts/build.sh`

## Release tooling

The inherited release script and npm version hook are intentionally removed. They assumed upstream branch names and GitHub Actions assets that do not exist in the contained TPS workspace and could publish inconsistent version metadata.

TPS releases are prepared deliberately: align `manifest.json`, `package.json`, the package-lock root metadata, and `versions.json`; rerun the full tests and separate contained production build; validate the deployed test artifact; then publish an exact numeric GitHub tag and BRAT assets. Do not use `npm version` as a release shortcut.

Standalone GitHub checkouts can run formatting, tests, TypeScript, ESLint, Stylelint, the namespace audit, and the production bundle build. Standalone builds explicitly report `target=none lane=standalone`; only the contained test-vault workspace can load the adjacent atomic runtime deployment helper.

## tps-namespace.mjs and runtime identity

Keeps inherited source in its merge-friendly upstream CSS/DOM namespace. Runtime JavaScript, tests, and generated CSS use the shared transform in `tps-runtime-namespace.mjs`.

```bash
npm run tps:namespace        # Restore accidental TPS prefixes to upstream source tokens
npm run tps:namespace:check  # Report committed runtime-prefix drift without changing files
```

The transform is idempotent and intentionally does not change manifest IDs, storage keys, URLs, or integration behavior. At the bundle boundary, the shared runtime helper also gives `@dnd-kit/core` described-by and live-region elements TPS-only ID prefixes so a co-installed upstream instance cannot own the same accessibility DOM IDs. The artifact check enforces both prefixes, the TPS-only Style Settings block ID in source and generated CSS, and the absence of the real upstream shortcut drag MIME. Follow [the upstream sync guide](../docs/upstream-sync.md) and review every generated diff.

## check-tps-operational-identity.mjs

Rejects committed documentation, workflow, or script guidance that writes or deploys to the co-installed upstream Notebook Navigator runtime or settings path. The explicit, confirmed, read-only upstream settings import documented in the main README is the sole allowed upstream runtime-path reference.

```bash
npm run tps:operational-identity:check
```

## upstream-merge-audit.mjs

Builds a read-only worklist before an upstream merge:

```bash
npm run upstream:audit -- upstream/main
npm run upstream:audit -- 3.4.0
```

The command resolves the merge base, compares changed files on both sides, lists every overlapping path in deterministic path order, simulates `git merge-tree`, and classifies overlaps and conflicting files as generated, documentation, source, test, or other work. Each overlap reports whether the simulated merge found a syntactic or structural conflict. `conflict=false` still requires semantic review; it does not mean the two changes are behaviorally compatible. The audit also reports conflict marker blocks. It never fetches, checks out, merges, updates refs, or writes the worktree; fetch the intended ref separately before auditing it.

## gitdump.sh

Generates git diff snapshots for code review and backup purposes.

**Usage:**

```bash
./scripts/gitdump.sh
```

**Options:**

1. **Uncommitted changes** - Shows staged and unstaged changes
2. **Current branch vs main** - Shows all changes from main branch
3. **Current state vs before specific commit** - Shows changes since a specific commit

**Output:**

- Creates timestamped diff files in the parent directory
- File format: `{folder_name}_{type}_{timestamp}.txt`
- Useful for quick code reviews or sharing changes

## mdReleaseNotes.js

Converts release notes from TypeScript format to Markdown for GitHub releases.

**Usage:**

```bash
node scripts/mdReleaseNotes.js            # Print latest release notes
node scripts/mdReleaseNotes.js 3.2.2      # Print release notes for a specific version
```

**Features:**

- Reads release notes from `src/releaseNotes.ts`
- Defaults to the latest release notes entry
- Accepts a version argument, with or without a leading `v`
- Converts TypeScript object format to clean Markdown
- Outputs formatted release notes ready for GitHub release descriptions
- Automatically used by the release process

## build-local.sh / build-local.ps1 (Optional)

Custom local deployment script (ignored by git and not committed to the repository).

**Purpose:**

- Deploy built plugin to your local Obsidian vault
- Automatically called after a successful `build.sh` or `build.ps1` run if present
- `build-local.sh` is used by `build.sh` on macOS/Linux and as the `build.ps1` fallback when Bash is available
- `build-local.ps1` is preferred by `build.ps1` on Windows
- Already ignored by `.gitignore` to keep vault paths private

**Example:**

```bash
#!/bin/bash
# Copy only release artifacts to a development vault; preserve its data.json.
cp main.js manifest.json styles.css ~/Documents/ObsidianVault/.obsidian/plugins/tps-notebook-navigator/
```

## check-unused-strings.mjs

Finds unused i18n keys in `src/i18n/locales/en.ts` by scanning for `strings.<keyPath>` usage across `src` (excluding `src/i18n/locales`). Also validates that every locale file matches the English locale shape.

```bash
npm run check:strings
node scripts/check-unused-strings.mjs          # Report and prompt before removing unused keys
node scripts/check-unused-strings.mjs --check  # Exit non-zero if unused keys or locale shape issues exist
node scripts/check-unused-strings.mjs --fix    # Remove unused keys without prompting
node scripts/check-unused-strings.mjs --project-root /path/to/project-root
```

`npm run build` runs `npm run check:strings` before TypeScript validation and bundling. This also covers the main build scripts and release workflow.

To keep an intentionally dynamic key, add an allowlist comment:

```ts
// unused-strings keep settings.items.example
```

## check-unused-css.mjs

Builds the expected generated CSS from `src/styles/index.css` in memory, checks whether `styles.css` is stale, and scans `src` for unused plugin CSS classes and variables.

```bash
node scripts/check-unused-css.mjs          # Report unused CSS and stale generated CSS
node scripts/check-unused-css.mjs --check  # Exit non-zero if stale CSS or unused CSS exists
node scripts/check-unused-css.mjs --fix    # Regenerate stale styles.css, then check unused CSS
node scripts/check-unused-css.mjs --project-root /path/to/project-root
```

To keep intentional dynamic CSS usage, add an allowlist comment:

```css
/* unused-css keep nn-dynamic-class --nn-dynamic-variable */
```

## update-icon-packs.sh

Runs the icon pack updater from `icon-assets/scripts/update-icon-packs.ts`.

**Usage:**

```bash
./scripts/update-icon-packs.sh                     # Update all packs
./scripts/update-icon-packs.sh --check-only        # Check for updates without applying them
./scripts/update-icon-packs.sh --force             # Force updates
./scripts/update-icon-packs.sh --generate-only     # Regenerate bundled manifest files from local icon-assets
./scripts/update-icon-packs.sh phosphor --force    # Update a specific pack
```

**Features:**

- Uses `npx tsx` to run the TypeScript updater
- Supports updating all packs or selected pack IDs
- Supports check-only, forced update, and local manifest regeneration modes
