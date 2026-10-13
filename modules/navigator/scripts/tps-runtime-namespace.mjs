/*
 * TPS Notebook Navigator - merge-friendly runtime namespace transform.
 *
 * Inherited source deliberately keeps Notebook Navigator's upstream CSS/DOM
 * tokens. Build and test transforms apply the TPS namespace at module-load
 * boundaries, while generated styles are transformed after concatenation.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

const upstreamShortPrefix = ['n', 'n-'].join('');
const upstreamRootSelector = ['.notebook', '-navigator'].join('');
const forkShortPrefix = 'tps-nn-';
const forkRootSelector = '.tps-notebook-navigator';
const upstreamDndKitDescribedByPrefix = 'DndDescribedBy';
const upstreamDndKitLiveRegionPrefix = 'DndLiveRegion';
export const TPS_DND_KIT_DESCRIBED_BY_PREFIX = 'tps-notebook-navigator-dnd-described-by';
export const TPS_DND_KIT_LIVE_REGION_PREFIX = 'tps-notebook-navigator-dnd-live-region';
const scriptModuleExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);

function isPathInside(parentPath, candidatePath) {
    const relative = path.relative(parentPath, candidatePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function loaderForPath(filePath) {
    const extension = path.extname(filePath);
    if (extension === '.tsx') {
        return 'tsx';
    }
    if (extension === '.ts' || extension === '.mts' || extension === '.cts') {
        return 'ts';
    }
    if (extension === '.jsx') {
        return 'jsx';
    }
    return 'js';
}

/** @param {string} filePath */
export function isDndKitCoreModulePath(filePath) {
    const normalizedPath = filePath.replaceAll('\\', '/');
    const pathWithLeadingSlash = normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`;
    return pathWithLeadingSlash.includes('/node_modules/@dnd-kit/core/');
}

export function applyTpsRuntimeNamespace(source) {
    const shortPrefixPattern = new RegExp(`(?<!tps-)${upstreamShortPrefix}`, 'gu');
    return source.replace(shortPrefixPattern, forkShortPrefix).replaceAll(upstreamRootSelector, forkRootSelector);
}

/** @param {string} source */
export function applyTpsDndKitAccessibilityNamespace(source) {
    return source
        .replaceAll(upstreamDndKitDescribedByPrefix, TPS_DND_KIT_DESCRIBED_BY_PREFIX)
        .replaceAll(upstreamDndKitLiveRegionPrefix, TPS_DND_KIT_LIVE_REGION_PREFIX);
}

export function createTpsRuntimeNamespaceEsbuildPlugin(projectRoot) {
    const sourceRoot = path.resolve(projectRoot, 'src');

    return {
        name: 'tps-runtime-namespace',
        setup(build) {
            build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async args => {
                const isInheritedSource = isPathInside(sourceRoot, args.path);
                const isDndKitCoreModule = isDndKitCoreModulePath(args.path);
                if ((!isInheritedSource && !isDndKitCoreModule) || !scriptModuleExtensions.has(path.extname(args.path))) {
                    return null;
                }
                const source = await fs.readFile(args.path, 'utf8');
                return {
                    contents: isDndKitCoreModule ? applyTpsDndKitAccessibilityNamespace(source) : applyTpsRuntimeNamespace(source),
                    loader: loaderForPath(args.path)
                };
            });
        }
    };
}

export function createTpsRuntimeNamespaceVitePlugin(projectRoot) {
    const sourceRoot = path.resolve(projectRoot, 'src');

    return {
        name: 'tps-runtime-namespace',
        enforce: 'pre',
        transform(source, id) {
            const filePath = id.split('?', 1)[0];
            if (!filePath || !scriptModuleExtensions.has(path.extname(filePath))) {
                return null;
            }
            const isInheritedSource = isPathInside(sourceRoot, filePath);
            const isDndKitCoreModule = isDndKitCoreModulePath(filePath);
            if (!isInheritedSource && !isDndKitCoreModule) {
                return null;
            }
            const transformed = isDndKitCoreModule ? applyTpsDndKitAccessibilityNamespace(source) : applyTpsRuntimeNamespace(source);
            return transformed === source ? null : { code: transformed, map: null };
        }
    };
}
