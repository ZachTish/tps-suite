import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import * as operationalIdentity from '../../scripts/check-tps-operational-identity.mjs';

interface OperationalIdentityExports {
    checkTpsOperationalIdentity: (projectRoot: string) => Promise<number>;
}

const { checkTpsOperationalIdentity } = operationalIdentity as unknown as OperationalIdentityExports;
const dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(dirname, '../..');
const scriptPath = path.resolve(repositoryRoot, 'scripts/check-tps-operational-identity.mjs');
const temporaryRoots: string[] = [];
const configDirectory = ['.ob', 'sidian'].join('');
const upstreamRuntimeDirectory = `${configDirectory}/plugins/notebook-navigator`;
const upstreamWindowsRuntimeDirectory = `${configDirectory}\\plugins\\notebook-navigator`;
const upstreamSettingsPath = `${upstreamRuntimeDirectory}/data.json`;
const tpsRuntimeDirectory = `${configDirectory}/plugins/tps-notebook-navigator`;

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { force: true, recursive: true })));
});

async function createFixture(files: Record<string, string>): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), 'tps-operational-identity-'));
    temporaryRoots.push(root);
    await Promise.all(
        Object.entries(files).map(async ([relativePath, contents]) => {
            const absolutePath = path.join(root, relativePath);
            await mkdir(path.dirname(absolutePath), { recursive: true });
            await writeFile(absolutePath, contents, 'utf8');
        })
    );
    return root;
}

function runCheck(projectRoot: string) {
    return spawnSync(process.execPath, [scriptPath, '--project-root', projectRoot], { encoding: 'utf8' });
}

describe('TPS operational identity gate', () => {
    it('accepts current guidance, TPS runtime paths, and the explicit read-only upstream settings import', async () => {
        expect(await checkTpsOperationalIdentity(repositoryRoot)).toBeGreaterThan(0);

        const root = await createFixture({
            'FAQ.md': `Synced settings live in \`${tpsRuntimeDirectory}/data.json\`.\n`,
            'README.md': `**Import upstream Notebook Navigator settings** reads only \`${upstreamSettingsPath}\` and never writes to upstream state.\n`,
            'scripts/README.md': `cp main.js manifest.json styles.css ~/Vault/${tpsRuntimeDirectory}/\n`
        });

        const result = runCheck(root);
        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toMatch(/^\[TPS operational identity\] ok files=3\n$/u);
    });

    it('rejects POSIX and Windows deployment instructions that target the upstream runtime', async () => {
        const root = await createFixture({
            'scripts/README.md': `cp main.js ~/Vault/${upstreamRuntimeDirectory}/\nCopy-Item main.js C:\\Vault\\${upstreamWindowsRuntimeDirectory}\\\n`
        });

        const result = runCheck(root);
        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('scripts/README.md:1');
        expect(result.stderr).toContain('scripts/README.md:2');
    });

    it('rejects an upstream data path presented as TPS settings storage', async () => {
        const root = await createFixture({
            'FAQ.md': `Synced TPS settings live in \`${upstreamSettingsPath}\`.\n`
        });

        const result = runCheck(root);
        expect(result.status).toBe(1);
        expect(result.stdout).toBe('');
        expect(result.stderr).toContain('FAQ.md:1');
    });
});
