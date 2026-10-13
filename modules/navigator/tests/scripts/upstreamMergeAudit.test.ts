import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(dirname, '../../scripts/upstream-merge-audit.mjs');
const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root => rm(root, { force: true, recursive: true })));
});

function git(repository: string, args: string[]): string {
    return execFileSync('git', ['-c', 'gc.auto=0', '-c', 'maintenance.auto=0', ...args], {
        cwd: repository,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
}

async function writeFiles(repository: string, files: Record<string, string>): Promise<void> {
    await Promise.all(
        Object.entries(files).map(async ([relativePath, contents]) => {
            const absolutePath = path.join(repository, relativePath);
            await mkdir(path.dirname(absolutePath), { recursive: true });
            await writeFile(absolutePath, contents, 'utf8');
        })
    );
}

function commit(repository: string, message: string, paths: string[]): void {
    git(repository, ['add', '--', ...paths]);
    git(repository, ['commit', '--quiet', '-m', message]);
}

async function createRepository(): Promise<string> {
    const repository = await mkdtemp(path.join(os.tmpdir(), 'tps-upstream-audit-'));
    temporaryRoots.push(repository);
    git(repository, ['init', '--quiet', '--initial-branch=main']);
    git(repository, ['config', 'user.name', 'TPS Audit Test']);
    git(repository, ['config', 'user.email', 'audit@example.invalid']);
    return repository;
}

async function createDivergedRepository(): Promise<string> {
    const repository = await createRepository();
    const conflictPaths = ['styles.css', 'docs/guide.md', 'src/main.ts', 'tests/main.test.ts'];
    const quotedOverlapPath = 'docs/quoted "overlap".md';
    await writeFiles(repository, {
        'docs/guide.md': '# Guide\n\nBase documentation.\n',
        [quotedOverlapPath]: 'base\n',
        'src/main.ts': "export const value = 'base';\n",
        'styles.css': '.item {\n    color: black;\n}\n',
        'tests/main.test.ts': "const expected = 'base';\n",
        'zz-clean.txt':
            'fork-line: base\nstable: 1\nstable: 2\nstable: 3\nstable: 4\nstable: 5\nstable: 6\nstable: 7\nstable: 8\nupstream-line: base\n'
    });
    commit(repository, 'base', [...conflictPaths, quotedOverlapPath, 'zz-clean.txt']);
    git(repository, ['branch', 'upstream']);

    await writeFiles(repository, {
        'docs/guide.md': '# Guide\n\nFork documentation.\n',
        [quotedOverlapPath]: 'shared change\n',
        'src/fork-only.ts': 'export const forkOnly = true;\n',
        'src/main.ts': "export const value = 'fork';\n",
        'styles.css': '.item {\n    color: red;\n}\n',
        'tests/main.test.ts': "const expected = 'fork';\n",
        'zz-clean.txt':
            'fork-line: changed\nstable: 1\nstable: 2\nstable: 3\nstable: 4\nstable: 5\nstable: 6\nstable: 7\nstable: 8\nupstream-line: base\n'
    });
    commit(repository, 'fork changes', [...conflictPaths, quotedOverlapPath, 'src/fork-only.ts', 'zz-clean.txt']);

    git(repository, ['switch', '--quiet', 'upstream']);
    await writeFiles(repository, {
        'docs/guide.md': '# Guide\n\nUpstream documentation.\n',
        [quotedOverlapPath]: 'shared change\n',
        'src/main.ts': "export const value = 'upstream';\n",
        'src/upstream-only.ts': 'export const upstreamOnly = true;\n',
        'styles.css': '.item {\n    color: blue;\n}\n',
        'tests/main.test.ts': "const expected = 'upstream';\n",
        'zz-clean.txt':
            'fork-line: base\nstable: 1\nstable: 2\nstable: 3\nstable: 4\nstable: 5\nstable: 6\nstable: 7\nstable: 8\nupstream-line: changed\n'
    });
    commit(repository, 'upstream changes', [...conflictPaths, quotedOverlapPath, 'src/upstream-only.ts', 'zz-clean.txt']);
    git(repository, ['switch', '--quiet', 'main']);
    return repository;
}

async function createRepositoryWithoutOverlap(): Promise<string> {
    const repository = await createRepository();
    await writeFiles(repository, { 'base.txt': 'base\n' });
    commit(repository, 'base', ['base.txt']);
    git(repository, ['branch', 'upstream']);

    await writeFiles(repository, { 'fork-only.txt': 'fork\n' });
    commit(repository, 'fork change', ['fork-only.txt']);

    git(repository, ['switch', '--quiet', 'upstream']);
    await writeFiles(repository, { 'upstream-only.txt': 'upstream\n' });
    commit(repository, 'upstream change', ['upstream-only.txt']);
    git(repository, ['switch', '--quiet', 'main']);
    return repository;
}

describe('upstream merge audit', () => {
    it('reports changed-file overlap and classifies merge-tree conflicts without mutating Git state', async () => {
        const repository = await createDivergedRepository();
        const before = {
            objectCount: git(repository, ['count-objects', '-v']),
            refs: git(repository, ['show-ref']),
            status: git(repository, ['status', '--porcelain=v1'])
        };

        const result = spawnSync(process.execPath, [scriptPath, 'upstream'], {
            cwd: repository,
            encoding: 'utf8'
        });

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('target-ref="upstream"');
        expect(result.stdout).toContain('files fork=7 upstream=7 overlap=6');
        expect(result.stdout).toContain('conflicts files=4 markers=4 generated=1 docs=1 source=1 test=1 other=0');
        expect(result.stdout.split('\n').filter(line => line.startsWith('[upstream-merge-audit] overlap '))).toEqual([
            '[upstream-merge-audit] overlap category=docs conflict=true path="docs/guide.md"',
            '[upstream-merge-audit] overlap category=docs conflict=false path="docs/quoted \\"overlap\\".md"',
            '[upstream-merge-audit] overlap category=source conflict=true path="src/main.ts"',
            '[upstream-merge-audit] overlap category=generated conflict=true path="styles.css"',
            '[upstream-merge-audit] overlap category=test conflict=true path="tests/main.test.ts"',
            '[upstream-merge-audit] overlap category=other conflict=false path="zz-clean.txt"'
        ]);
        expect(result.stdout).toContain('conflict category=generated markers=1 reasons=content path="styles.css"');
        expect(result.stdout).toContain('conflict category=docs markers=1 reasons=content path="docs/guide.md"');
        expect(result.stdout).toContain('conflict category=source markers=1 reasons=content path="src/main.ts"');
        expect(result.stdout).toContain('conflict category=test markers=1 reasons=content path="tests/main.test.ts"');
        expect({
            objectCount: git(repository, ['count-objects', '-v']),
            refs: git(repository, ['show-ref']),
            status: git(repository, ['status', '--porcelain=v1'])
        }).toEqual(before);
    });

    it('requires one explicit target ref before invoking Git', () => {
        const result = spawnSync(process.execPath, [scriptPath], {
            cwd: os.tmpdir(),
            encoding: 'utf8'
        });

        expect(result.status).toBe(2);
        expect(result.stdout).toBe('');
        expect(result.stderr).toBe('Usage: node scripts/upstream-merge-audit.mjs <upstream-ref>\n');
    });

    it('emits no overlap details when the changed path sets are disjoint', async () => {
        const repository = await createRepositoryWithoutOverlap();
        const result = spawnSync(process.execPath, [scriptPath, 'upstream'], {
            cwd: repository,
            encoding: 'utf8'
        });

        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('files fork=1 upstream=1 overlap=0');
        expect(result.stdout).toContain('conflicts files=0 markers=0 generated=0 docs=0 source=0 test=0 other=0');
        expect(result.stdout).not.toContain('[upstream-merge-audit] overlap ');
    });
});
