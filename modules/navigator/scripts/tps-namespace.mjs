#!/usr/bin/env node
/*
 * Keeps inherited source merge-friendly by restoring upstream CSS/DOM tokens.
 * Runtime and test builds apply the TPS namespace through
 * tps-runtime-namespace.mjs instead of committing mechanical rewrites across
 * the upstream source tree.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(dirname, '..');
const sourceExtensions = new Set(['.cjs', '.css', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const scanRoots = ['src'];

const upstreamShortPrefix = ['n', 'n-'].join('');
const upstreamRootSelector = ['.notebook', '-navigator'].join('');
const forkShortPrefix = 'tps-nn-';
const forkRootSelector = '.tps-notebook-navigator';

function parseArgs(argv) {
    let mode = 'check';
    let projectRoot = defaultProjectRoot;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--check') {
            mode = 'check';
            continue;
        }
        if (arg === '--write') {
            mode = 'write';
            continue;
        }
        if (arg === '--project-root') {
            const value = argv[index + 1];
            if (!value) {
                throw new Error('Missing value for --project-root.');
            }
            projectRoot = path.resolve(value);
            index += 1;
            continue;
        }
        if (arg.startsWith('--project-root=')) {
            projectRoot = path.resolve(arg.slice('--project-root='.length));
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }

    return { mode, projectRoot };
}

async function collectFiles(root, projectRoot) {
    let entries;
    try {
        entries = await fs.readdir(root, { withFileTypes: true });
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') {
            return [];
        }
        throw error;
    }

    const files = [];
    for (const entry of entries) {
        const absolutePath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await collectFiles(absolutePath, projectRoot)));
            continue;
        }
        if (!sourceExtensions.has(path.extname(entry.name))) {
            continue;
        }
        const relativePath = path.relative(projectRoot, absolutePath).split(path.sep).join(path.posix.sep);
        files.push({ absolutePath, relativePath });
    }
    return files;
}

function restoreUpstreamNamespace(source) {
    return source.replaceAll(forkShortPrefix, upstreamShortPrefix).replaceAll(forkRootSelector, upstreamRootSelector);
}

const { mode, projectRoot } = parseArgs(process.argv.slice(2));
const files = (await Promise.all(scanRoots.map(rootName => collectFiles(path.join(projectRoot, rootName), projectRoot)))).flat();
const changedPaths = [];

for (const file of files) {
    const source = await fs.readFile(file.absolutePath, 'utf8');
    const mergeFriendly = restoreUpstreamNamespace(source);
    if (mergeFriendly === source) {
        continue;
    }
    changedPaths.push(file.relativePath);
    if (mode === 'write') {
        await fs.writeFile(file.absolutePath, mergeFriendly, 'utf8');
    }
}

if (changedPaths.length === 0) {
    console.log('TPS source namespace is merge-friendly.');
} else if (mode === 'write') {
    console.log(`Restored upstream namespace tokens in ${changedPaths.length} source file(s):`);
    changedPaths.forEach(filePath => console.log(`- ${filePath}`));
} else {
    console.error('Committed TPS runtime namespace tokens must be restored to their upstream source form in:');
    changedPaths.forEach(filePath => console.error(`- ${filePath}`));
    process.exitCode = 1;
}
