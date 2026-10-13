/* TPS Notebook Navigator - merge-friendly source/runtime namespace tests. */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import * as runtimeNamespace from '../../scripts/tps-runtime-namespace.mjs';

interface DndKitNamespaceExports {
    applyTpsDndKitAccessibilityNamespace: (source: string) => string;
    isDndKitCoreModulePath: (filePath: string) => boolean;
    TPS_DND_KIT_DESCRIBED_BY_PREFIX: string;
    TPS_DND_KIT_LIVE_REGION_PREFIX: string;
}

const {
    applyTpsDndKitAccessibilityNamespace,
    applyTpsRuntimeNamespace,
    isDndKitCoreModulePath,
    TPS_DND_KIT_DESCRIBED_BY_PREFIX,
    TPS_DND_KIT_LIVE_REGION_PREFIX
} = runtimeNamespace as typeof runtimeNamespace & DndKitNamespaceExports;

const dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(dirname, '../../scripts/tps-namespace.mjs');
const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function createFixture(): Promise<{ root: string; sourcePath: string }> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'tps-navigator-namespace-'));
    temporaryRoots.push(root);
    const sourceDirectory = path.join(root, 'src');
    await mkdir(sourceDirectory, { recursive: true });
    const sourcePath = path.join(sourceDirectory, 'Example.tsx');
    await writeFile(
        sourcePath,
        ["const root = '.tps-notebook-navigator';", "const className = 'tps-nn-file-row';", "const upstream = 'nn-file-row';"].join('\n'),
        'utf8'
    );
    return { root, sourcePath };
}

function runScript(root: string, mode: '--check' | '--write') {
    return spawnSync(process.execPath, [scriptPath, mode, '--project-root', root], { encoding: 'utf8' });
}

describe('TPS runtime namespace boundary', () => {
    it('reports committed runtime namespace tokens without changing source in check mode', async () => {
        const fixture = await createFixture();
        const before = await readFile(fixture.sourcePath, 'utf8');

        const result = runScript(fixture.root, '--check');

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('src/Example.tsx');
        expect(await readFile(fixture.sourcePath, 'utf8')).toBe(before);
    });

    it('restores only fork runtime tokens to their merge-friendly source form and is idempotent', async () => {
        const fixture = await createFixture();

        expect(runScript(fixture.root, '--write').status).toBe(0);
        const rewritten = await readFile(fixture.sourcePath, 'utf8');
        expect(rewritten).toContain('.notebook-navigator');
        expect(rewritten).not.toContain('.tps-notebook-navigator');
        expect(rewritten.match(/(?<!tps-)nn-file-row/gu)).toHaveLength(2);

        const secondRun = runScript(fixture.root, '--check');
        expect(secondRun.status).toBe(0);
        expect(secondRun.stdout).toContain('TPS source namespace is merge-friendly.');
    });

    it('restores every script module extension supported by the runtime transform', async () => {
        const root = await mkdtemp(path.join(os.tmpdir(), 'tps-navigator-namespace-extensions-'));
        temporaryRoots.push(root);
        const sourceDirectory = path.join(root, 'src');
        await mkdir(sourceDirectory, { recursive: true });
        const extensions = ['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx'];
        const sourcePaths = extensions.map(extension => path.join(sourceDirectory, `Example${extension}`));

        await Promise.all(sourcePaths.map(sourcePath => writeFile(sourcePath, "export const row = 'tps-nn-provider-row';\n", 'utf8')));

        expect(runScript(root, '--write').status).toBe(0);
        const restoredSources = await Promise.all(sourcePaths.map(sourcePath => readFile(sourcePath, 'utf8')));
        expect(restoredSources).toEqual(extensions.map(() => "export const row = 'nn-provider-row';\n"));
        expect(runScript(root, '--check').status).toBe(0);
    });

    it('applies the TPS runtime namespace exactly once', () => {
        const source = [
            "const root = '.notebook-navigator';",
            "const className = 'nn-file-row';",
            "const alreadyNamespaced = 'tps-nn-provider-row';"
        ].join('\n');

        const transformed = applyTpsRuntimeNamespace(source);

        expect(transformed).toContain('.tps-notebook-navigator');
        expect(transformed).toContain('tps-nn-file-row');
        expect(transformed).toContain('tps-nn-provider-row');
        expect(applyTpsRuntimeNamespace(transformed)).toBe(transformed);
    });

    it('isolates bundled dnd-kit accessibility IDs without rewriting other dependencies', () => {
        const source = [
            'const describedById = useUniqueId("DndDescribedBy", id);',
            'const liveRegionId = useUniqueId("DndLiveRegion");'
        ].join('\n');

        const transformed = applyTpsDndKitAccessibilityNamespace(source);

        expect(transformed).toContain(`useUniqueId("${TPS_DND_KIT_DESCRIBED_BY_PREFIX}", id)`);
        expect(transformed).toContain(`useUniqueId("${TPS_DND_KIT_LIVE_REGION_PREFIX}")`);
        expect(transformed).not.toContain('DndDescribedBy');
        expect(transformed).not.toContain('DndLiveRegion');
        expect(applyTpsDndKitAccessibilityNamespace(transformed)).toBe(transformed);
        expect(applyTpsRuntimeNamespace(source)).toBe(source);

        expect(isDndKitCoreModulePath('/workspace/node_modules/@dnd-kit/core/dist/core.esm.js')).toBe(true);
        expect(isDndKitCoreModulePath('C:\\workspace\\node_modules\\@dnd-kit\\core\\dist\\core.esm.js')).toBe(true);
        expect(isDndKitCoreModulePath('node_modules/@dnd-kit/core/dist/core.esm.js')).toBe(true);
        expect(isDndKitCoreModulePath('/workspace/node_modules/@dnd-kit/sortable/dist/sortable.esm.js')).toBe(false);
        expect(isDndKitCoreModulePath('/workspace/src/vendor/dnd-kit/core.esm.js')).toBe(false);
    });
});
