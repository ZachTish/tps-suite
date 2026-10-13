#!/usr/bin/env node
/*
 * Prevents committed operational guidance from targeting the co-installed
 * upstream Notebook Navigator runtime or settings. The one explicit,
 * read-only upstream settings import reference remains permitted.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(dirname, '..');
const topLevelFiles = ['FAQ.md', 'README.md'];
const scanRoots = ['.github', 'docs', 'scripts'];
const operationalExtensions = new Set(['.cjs', '.js', '.json', '.md', '.mjs', '.ps1', '.sh', '.yaml', '.yml']);
const upstreamPluginDirectory = ['plugins', 'notebook-navigator'].join('/');
const upstreamSettingsPath = ['.obsidian', upstreamPluginDirectory, 'data.json'].join('/');

function usage() {
    return 'Usage: node scripts/check-tps-operational-identity.mjs [--project-root <path>]';
}

function parseArgs(argv) {
    if (argv.length === 0) {
        return defaultProjectRoot;
    }
    if (argv.length === 2 && argv[0] === '--project-root' && argv[1]) {
        return path.resolve(argv[1]);
    }
    if (argv.length === 1 && argv[0].startsWith('--project-root=') && argv[0].length > '--project-root='.length) {
        return path.resolve(argv[0].slice('--project-root='.length));
    }
    throw new Error(usage());
}

function normalizePath(filePath) {
    return filePath.split(path.sep).join(path.posix.sep);
}

async function collectOperationalFiles(root, projectRoot) {
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
            files.push(...(await collectOperationalFiles(absolutePath, projectRoot)));
            continue;
        }
        if (!entry.isFile() || !operationalExtensions.has(path.extname(entry.name))) {
            continue;
        }
        files.push({
            absolutePath,
            relativePath: normalizePath(path.relative(projectRoot, absolutePath))
        });
    }
    return files;
}

async function readTopLevelFile(projectRoot, relativePath) {
    const absolutePath = path.join(projectRoot, relativePath);
    try {
        const stat = await fs.stat(absolutePath);
        return stat.isFile() ? { absolutePath, relativePath } : null;
    } catch (error) {
        if (error && typeof error === 'object' && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

function removeAllowedReadOnlyImportReference(relativePath, line) {
    if (
        relativePath === 'README.md' &&
        line.includes('Import upstream Notebook Navigator settings') &&
        line.includes(`reads only \`${upstreamSettingsPath}\``) &&
        line.includes('never writes to upstream state')
    ) {
        return line.replace(upstreamSettingsPath, '');
    }
    return line;
}

export function findTpsOperationalIdentityViolations(documents) {
    const violations = [];
    const orderedDocuments = [...documents].sort((left, right) => left.relativePath.localeCompare(right.relativePath));

    for (const document of orderedDocuments) {
        const lines = document.contents.split(/\r?\n/u);
        lines.forEach((line, index) => {
            const normalizedLine = line.replaceAll('\\', '/');
            const guardedLine = removeAllowedReadOnlyImportReference(document.relativePath, normalizedLine);
            if (guardedLine.includes(upstreamPluginDirectory)) {
                violations.push({ line: index + 1, path: document.relativePath });
            }
        });
    }

    return violations;
}

export function assertTpsOperationalIdentity(documents) {
    const violations = findTpsOperationalIdentityViolations(documents);
    if (violations.length > 0) {
        const locations = violations.map(violation => `- ${violation.path}:${violation.line}`).join('\n');
        throw new Error(
            `[TPS operational identity] committed guidance must not target the upstream Notebook Navigator runtime or settings:\n${locations}`
        );
    }
    return documents.length;
}

export async function checkTpsOperationalIdentity(projectRoot = defaultProjectRoot) {
    const [topLevelEntries, nestedEntries] = await Promise.all([
        Promise.all(topLevelFiles.map(relativePath => readTopLevelFile(projectRoot, relativePath))),
        Promise.all(scanRoots.map(rootName => collectOperationalFiles(path.join(projectRoot, rootName), projectRoot)))
    ]);
    const files = [...topLevelEntries.filter(Boolean), ...nestedEntries.flat()].sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath)
    );
    const documents = await Promise.all(
        files.map(async file => ({
            contents: await fs.readFile(file.absolutePath, 'utf8'),
            relativePath: file.relativePath
        }))
    );
    return assertTpsOperationalIdentity(documents);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const projectRoot = parseArgs(process.argv.slice(2));
        const fileCount = await checkTpsOperationalIdentity(projectRoot);
        console.log(`[TPS operational identity] ok files=${fileCount}`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = error instanceof Error && error.message === usage() ? 2 : 1;
    }
}
