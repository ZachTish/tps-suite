#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const GENERATED_PATHS = new Set(['main.js', 'styles.css', 'src/constants/notebookNavigatorIcon.ts']);
const CATEGORY_ORDER = ['generated', 'docs', 'source', 'test', 'other'];
const MERGE_TREE_SECTIONS = new Set([
    'added in both',
    'added in local',
    'added in remote',
    'changed in both',
    'merged',
    'removed in local',
    'removed in remote'
]);

function usage() {
    return 'Usage: node scripts/upstream-merge-audit.mjs <upstream-ref>';
}

function formatCommandError(error) {
    if (!error || typeof error !== 'object') {
        return String(error);
    }

    const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : error.stderr;
    if (typeof stderr === 'string' && stderr.trim()) {
        return stderr.trim();
    }
    return error.message ?? String(error);
}

function runGit(args, { binary = false } = {}) {
    const readOnlyArgs = ['-c', 'gc.auto=0', '-c', 'maintenance.auto=0', ...args];
    try {
        return execFileSync('git', readOnlyArgs, {
            cwd: process.cwd(),
            encoding: binary ? null : 'utf8',
            maxBuffer: 64 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe']
        });
    } catch (error) {
        throw new Error(`git ${args[0]} failed: ${formatCommandError(error)}`);
    }
}

function readCommit(ref) {
    return runGit(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]).trim();
}

function readChangedFiles(base, target) {
    const output = runGit(['diff', '--name-only', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', `${base}..${target}`, '--'], {
        binary: true
    });
    return new Set(output.toString('utf8').split('\0').filter(Boolean));
}

function compareText(left, right) {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}

function classifyPath(filePath) {
    const normalizedPath = filePath.replaceAll('\\', '/');
    if (GENERATED_PATHS.has(normalizedPath)) {
        return 'generated';
    }
    if (
        normalizedPath.startsWith('docs/') ||
        normalizedPath.startsWith('release-notes/') ||
        normalizedPath === 'README.md' ||
        normalizedPath === 'FAQ.md' ||
        normalizedPath.endsWith('.md')
    ) {
        return 'docs';
    }
    if (normalizedPath.startsWith('tests/') || /(?:^|\/)[^/]+\.(?:spec|test)\.[^/]+$/u.test(normalizedPath)) {
        return 'test';
    }
    if (normalizedPath.startsWith('src/')) {
        return 'source';
    }
    return 'other';
}

function entryPath(entries) {
    return entries.our?.path ?? entries.their?.path ?? entries.base?.path ?? null;
}

function structuralConflictReasons(section, entries, binaryConflict) {
    const reasons = [];
    const base = entries.base;
    const ours = entries.our;
    const theirs = entries.their;

    if (section === 'added in both' && ours && theirs && ours.oid !== theirs.oid) {
        reasons.push('add/add');
    }
    if (section === 'removed in remote' && base && ours && base.oid !== ours.oid) {
        reasons.push('modify/delete');
    }
    if (section === 'removed in local' && base && theirs && base.oid !== theirs.oid) {
        reasons.push('modify/delete');
    }
    if (
        section === 'changed in both' &&
        base &&
        ours &&
        theirs &&
        ours.mode !== theirs.mode &&
        ours.mode !== base.mode &&
        theirs.mode !== base.mode
    ) {
        reasons.push('mode');
    }
    if (binaryConflict) {
        reasons.push('binary');
    }
    return reasons;
}

function parseMergeTreeConflicts(output) {
    const conflictsByPath = new Map();
    let current = null;

    function finishCurrent() {
        if (!current) {
            return;
        }

        const filePath = entryPath(current.entries);
        const structuralReasons = structuralConflictReasons(current.section, current.entries, current.binaryConflict);
        const reasons = current.markerBlocks > 0 ? ['content', ...structuralReasons] : structuralReasons;
        if (!filePath || reasons.length === 0) {
            current = null;
            return;
        }

        const existing = conflictsByPath.get(filePath) ?? {
            markerBlocks: 0,
            path: filePath,
            reasons: new Set()
        };
        existing.markerBlocks += current.markerBlocks;
        reasons.forEach(reason => existing.reasons.add(reason));
        conflictsByPath.set(filePath, existing);
        current = null;
    }

    for (const line of output.split(/\r?\n/u)) {
        if (MERGE_TREE_SECTIONS.has(line)) {
            finishCurrent();
            current = {
                binaryConflict: false,
                entries: {},
                markerBlocks: 0,
                section: line
            };
            continue;
        }
        if (!current) {
            continue;
        }

        const entryMatch = /^  (base|our|their)\s+(\d+)\s+([0-9a-f]+)\s+(.+)$/u.exec(line);
        if (entryMatch) {
            const [, side, mode, oid, filePath] = entryMatch;
            current.entries[side] = { mode, oid, path: filePath };
            continue;
        }
        if (/^\+<<<<<<< /u.test(line)) {
            current.markerBlocks += 1;
        }
        if (/Binary files .* differ/u.test(line)) {
            current.binaryConflict = true;
        }
    }
    finishCurrent();

    return [...conflictsByPath.values()]
        .map(conflict => ({
            category: classifyPath(conflict.path),
            markerBlocks: conflict.markerBlocks,
            path: conflict.path,
            reasons: [...conflict.reasons].sort(compareText)
        }))
        .sort((left, right) => {
            const categoryDifference = CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category);
            return categoryDifference || compareText(left.path, right.path);
        });
}

function audit(targetRef) {
    const head = readCommit('HEAD');
    const target = readCommit(targetRef);
    const mergeBase = runGit(['merge-base', head, target]).trim();
    if (!mergeBase) {
        throw new Error(`HEAD and ${targetRef} do not have a merge base.`);
    }

    const forkFiles = readChangedFiles(mergeBase, head);
    const upstreamFiles = readChangedFiles(mergeBase, target);
    const overlap = [...forkFiles].filter(filePath => upstreamFiles.has(filePath)).sort(compareText);
    const mergeTree = runGit(['-c', 'merge.conflictStyle=merge', '-c', 'core.quotePath=false', 'merge-tree', mergeBase, head, target]);
    const conflicts = parseMergeTreeConflicts(mergeTree);
    const conflictPaths = new Set(conflicts.map(conflict => conflict.path));
    const categoryCounts = Object.fromEntries(CATEGORY_ORDER.map(category => [category, 0]));
    conflicts.forEach(conflict => {
        categoryCounts[conflict.category] += 1;
    });
    const markerBlocks = conflicts.reduce((total, conflict) => total + conflict.markerBlocks, 0);

    console.log(`[upstream-merge-audit] target-ref=${JSON.stringify(targetRef)} target=${target}`);
    console.log(`[upstream-merge-audit] head=${head} merge-base=${mergeBase}`);
    console.log(`[upstream-merge-audit] files fork=${forkFiles.size} upstream=${upstreamFiles.size} overlap=${overlap.length}`);
    console.log(
        `[upstream-merge-audit] conflicts files=${conflicts.length} markers=${markerBlocks} generated=${categoryCounts.generated} docs=${categoryCounts.docs} source=${categoryCounts.source} test=${categoryCounts.test} other=${categoryCounts.other}`
    );
    overlap.forEach(filePath => {
        console.log(
            `[upstream-merge-audit] overlap category=${classifyPath(filePath)} conflict=${conflictPaths.has(filePath)} path=${JSON.stringify(filePath)}`
        );
    });
    conflicts.forEach(conflict => {
        console.log(
            `[upstream-merge-audit] conflict category=${conflict.category} markers=${conflict.markerBlocks} reasons=${conflict.reasons.join(',')} path=${JSON.stringify(conflict.path)}`
        );
    });
}

const args = process.argv.slice(2);
if (args.length !== 1 || args[0] === '--help' || args[0] === '-h') {
    const helpRequested = args.length === 1 && (args[0] === '--help' || args[0] === '-h');
    console[helpRequested ? 'log' : 'error'](usage());
    process.exitCode = helpRequested ? 0 : 2;
} else {
    try {
        audit(args[0]);
    } catch (error) {
        console.error(`[upstream-merge-audit] error: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    }
}
