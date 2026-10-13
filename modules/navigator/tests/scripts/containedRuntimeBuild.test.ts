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

import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveRuntimeDeployPlugin } from '../../scripts/runtime-deploy-plugin.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '../..');
const temporaryRoots: string[] = [];

interface CheckoutFixtureOptions {
    contained?: boolean;
    helper?: boolean;
    marker?: boolean;
}

afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function createCheckoutFixture({ contained = false, helper = false, marker = contained }: CheckoutFixtureOptions = {}) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'tps-navigator-runtime-build-'));
    temporaryRoots.push(root);
    const developmentRoot = contained ? path.join(root, 'Obsidian Plugin Test Vault', 'Plugin Development') : root;
    const repository = path.join(developmentRoot, 'TPS-Notebook-Navigator');
    await mkdir(repository, { recursive: true });
    if (marker) {
        await writeFile(
            path.join(developmentRoot, 'workspace-paths.mjs'),
            "throw new Error('The marker must never execute during build resolution.');\n",
            'utf8'
        );
    }
    if (helper) {
        await writeFile(
            path.join(developmentRoot, 'deploy-runtime.mjs'),
            [
                'export function runtimeDeployPlugin(sourceFolder) {',
                '    return { name: `fixture-deploy-${sourceFolder}`, setup() {} };',
                '}',
                ''
            ].join('\n'),
            'utf8'
        );
    }
    return {
        configUrl: pathToFileURL(path.join(repository, 'esbuild.config.mjs')),
        repository
    };
}

describe('contained runtime build', () => {
    it('derives its move-safe source folder and deploys through the shared test-runtime hook', async () => {
        const config = await readFile(path.join(repoRoot, 'esbuild.config.mjs'), 'utf8');

        expect(config).toContain("import { resolveRuntimeDeployPlugin } from './scripts/runtime-deploy-plugin.mjs';");
        expect(config).toContain("import { createTpsRuntimeNamespaceEsbuildPlugin } from './scripts/tps-runtime-namespace.mjs';");
        expect(config).toContain('const projectRoot = dirname(fileURLToPath(import.meta.url));');
        expect(config).toContain('basename(projectRoot)');
        expect(config).toContain('await resolveRuntimeDeployPlugin(sourceFolder, import.meta.url)');
        expect(config).toContain('plugins: [createTpsRuntimeNamespaceEsbuildPlugin(projectRoot), runtimeDeployPlugin]');
        expect(config).not.toContain("from '../deploy-runtime.mjs'");
        expect(config).not.toContain(`Obsidian Plugin Test Vault/${['.ob', 'sidian'].join('')}/plugins`);
        expect(config).not.toContain('TishOS v0.1');

        // A public standalone checkout can run source-quality tests without the
        // vault-owned deployment helper. In the contained development layout,
        // require that helper so the mandatory local build cannot silently lose
        // its atomic test-runtime deployment step.
        if (path.basename(path.dirname(repoRoot)) === 'Plugin Development') {
            await expect(access(path.resolve(repoRoot, '../deploy-runtime.mjs'))).resolves.toBeUndefined();
        }
    });

    it('uses the contained deployment hook when the shared workspace files are present', async () => {
        const fixture = await createCheckoutFixture({ contained: true, helper: true });

        const plugin = await resolveRuntimeDeployPlugin('TPS-Notebook-Navigator (Dev)', fixture.configUrl);

        expect(plugin.name).toBe('fixture-deploy-TPS-Notebook-Navigator (Dev)');
    });

    it('fails closed when a contained workspace loses its deployment helper', async () => {
        const fixture = await createCheckoutFixture({ contained: true });

        await expect(resolveRuntimeDeployPlugin('TPS-Notebook-Navigator (Dev)', fixture.configUrl)).rejects.toThrow(
            'Contained TPS workspace is missing its runtime deployment helper'
        );
    });

    it('builds without deployment in a public standalone checkout', async () => {
        const fixture = await createCheckoutFixture({ helper: true });
        const plugin = await resolveRuntimeDeployPlugin('TPS-Notebook-Navigator', fixture.configUrl);
        const hooks: Array<(result: { errors: unknown[] }) => void> = [];
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        plugin.setup({
            onEnd(callback: (result: { errors: unknown[] }) => void) {
                hooks.push(callback);
            }
        });
        hooks[0]?.({ errors: [] });

        expect(plugin.name).toBe('tps-standalone-build-only');
        expect(log).toHaveBeenCalledWith('[runtime-deploy] target=none lane=standalone TPS-Notebook-Navigator: build-only');
    });

    it('does not trust or execute a marker and helper outside the contained directory shape', async () => {
        const fixture = await createCheckoutFixture({ helper: true, marker: true });

        const plugin = await resolveRuntimeDeployPlugin('TPS-Notebook-Navigator', fixture.configUrl);

        expect(plugin.name).toBe('tps-standalone-build-only');
    });

    it('retains build-only optimization semantics without the contained helper', async () => {
        const fixture = await createCheckoutFixture();
        const plugin = await resolveRuntimeDeployPlugin('TPS-Notebook-Navigator (Optimize)', fixture.configUrl);
        const hooks: Array<(result: { errors: unknown[] }) => void> = [];
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

        plugin.setup({
            onEnd(callback: (result: { errors: unknown[] }) => void) {
                hooks.push(callback);
            }
        });
        hooks[0]?.({ errors: [] });

        expect(log).toHaveBeenCalledWith('[runtime-deploy] target=none lane=optimization TPS-Notebook-Navigator (Optimize): build-only');
    });

    it('does not retain the inherited standalone release workflow', async () => {
        const inheritedReleaseWorkflow = path.join(repoRoot, '.github/workflows/release.yml');

        await expect(access(inheritedReleaseWorkflow)).rejects.toMatchObject({ code: 'ENOENT' });
    });
});
