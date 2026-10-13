/* TPS Notebook Navigator - nested presentation of already assembled property groups. */

import { TFile } from 'obsidian';
import { ListPaneItemType } from '../types';
import type { ListPaneItem } from '../types/virtualization';
import { casefold } from './recordUtils';
import { getPropertyValuePathParts } from './propertyTree';
import { compareByAlphaSortOrder } from './sortUtils';

interface PathGroupIdentity {
    scope: string;
    prefix: string;
    bucket: string;
}

interface PathGroupNode {
    path: string;
    label: string;
    depth: number;
    template: ListPaneItem;
    header?: ListPaneItem;
    rows: ListPaneItem[];
    files: Set<string>;
    nativeFiles: Set<string>;
    providerKeys: Set<string>;
    totalFiles: Set<string>;
    hasTotals: boolean;
    children: Map<string, PathGroupNode>;
}

function getPathGroupIdentity(item: ListPaneItem): PathGroupIdentity | null {
    if (item.type !== ListPaneItemType.HEADER || item.headerKind !== 'property' || !item.collapseKey) return null;
    const marker = item.collapseKey.lastIndexOf(';id=');
    if (marker < 0) return null;
    const groupId = decodeURIComponent(item.collapseKey.slice(marker + 4));
    const prefix = groupId.startsWith('property-path:')
        ? 'property-path:'
        : groupId.startsWith('line-property-path:')
          ? 'line-property-path:'
          : null;
    return prefix ? { scope: item.collapseKey.slice(0, marker + 4), prefix, bucket: groupId.slice(prefix.length) } : null;
}

/**
 * Runs after flat native/provider composition. Only path-mode groups are transformed;
 * their existing exact-value rows, sort order, pinning and collapse state remain owned upstream.
 */
export function nestPropertyListItems(
    listItems: ListPaneItem[],
    collapsedGroups: ReadonlySet<string>,
    direction: 'asc' | 'desc'
): ListPaneItem[] {
    if (!listItems.some(item => getPathGroupIdentity(item))) return listItems;
    const result: ListPaneItem[] = [];
    let index = 0;
    while (index < listItems.length) {
        const identity = getPathGroupIdentity(listItems[index]);
        if (!identity) {
            result.push(listItems[index++]);
            continue;
        }
        // The original spacer belongs to the first flat header, which may become a child.
        if (result[result.length - 1]?.type === ListPaneItemType.HEADER_SPACER) result.pop();
        const roots = new Map<string, PathGroupNode>();
        while (index < listItems.length) {
            const header = listItems[index];
            const nextIdentity = getPathGroupIdentity(header);
            if (!nextIdentity || nextIdentity.scope !== identity.scope || nextIdentity.prefix !== identity.prefix) break;
            index += 1;
            const rows: ListPaneItem[] = [];
            while (
                index < listItems.length &&
                listItems[index].type !== ListPaneItemType.HEADER &&
                listItems[index].type !== ListPaneItemType.BOTTOM_SPACER
            ) {
                if (listItems[index].type === ListPaneItemType.HEADER_SPACER && listItems[index + 1]?.type === ListPaneItemType.HEADER) {
                    break;
                }
                if (listItems[index].type !== ListPaneItemType.HEADER_SPACER) rows.push(listItems[index]);
                index += 1;
            }
            const label = typeof header.data === 'string' ? header.data : nextIdentity.bucket;
            // Combined lists are opaque tuples. The shared sidebar splitter protects links,
            // URLs and malformed separators; display paths preserve exact list bucket casing.
            const parts = nextIdentity.bucket.includes('\u0000')
                ? [{ displayPath: nextIdentity.bucket, name: label }]
                : getPropertyValuePathParts(label, casefold(label), label);
            let children = roots;
            parts.forEach((part, depth) => {
                const path = parts.length === 1 ? nextIdentity.bucket : part.displayPath;
                let node = children.get(path);
                if (!node) {
                    node = {
                        path,
                        label: part.name,
                        depth,
                        template: header,
                        rows: [],
                        files: new Set(),
                        nativeFiles: new Set(),
                        providerKeys: new Set(),
                        totalFiles: new Set(),
                        hasTotals: true,
                        children: new Map()
                    };
                    children.set(path, node);
                }
                header.groupFilePaths?.forEach(path => node.files.add(path));
                const nativePaths = header.groupNativeFilePaths ?? (header.groupRowKeys?.length ? [] : (header.groupFilePaths ?? []));
                nativePaths.forEach(path => node.nativeFiles.add(path));
                header.groupRowKeys?.forEach(key => node.providerKeys.add(key));
                if (header.groupTotalFilePaths) header.groupTotalFilePaths.forEach(path => node.totalFiles.add(path));
                else node.hasTotals = false;
                if (header.groupRowKeys?.length) node.hasTotals = false;
                if (depth === parts.length - 1) {
                    node.header = header;
                    node.rows = rows;
                }
                children = node.children;
            });
            if (listItems[index]?.type === ListPaneItemType.HEADER_SPACER) {
                const following = getPathGroupIdentity(listItems[index + 1]);
                if (following?.scope === identity.scope && following.prefix === identity.prefix) index += 1;
            }
        }
        const render = (nodes: Map<string, PathGroupNode>): void => {
            const ordered = Array.from(nodes.values()).sort((left, right) => {
                const leftNumeric = left.header?.groupNumericSortValue ?? null;
                const rightNumeric = right.header?.groupNumericSortValue ?? null;
                const multiplier = direction === 'desc' ? -1 : 1;
                if (leftNumeric !== null && rightNumeric !== null && leftNumeric !== rightNumeric) {
                    return multiplier * (leftNumeric < rightNumeric ? -1 : 1);
                }
                if ((leftNumeric === null) !== (rightNumeric === null)) return multiplier * (leftNumeric !== null ? -1 : 1);
                return (
                    compareByAlphaSortOrder(left.label, right.label, direction === 'desc' ? 'alpha-desc' : 'alpha-asc') ||
                    multiplier * (left.path < right.path ? -1 : 1)
                );
            });
            ordered.forEach(node => {
                const collapseKey = `${identity.scope}${encodeURIComponent(identity.prefix + node.path)}`;
                const isCollapsed = collapsedGroups.has(collapseKey);
                const key = node.header?.key ?? `nested-property-header:${collapseKey}`;
                if (result.length > 0 && result[result.length - 1]?.type !== ListPaneItemType.TOP_SPACER) {
                    result.push({ type: ListPaneItemType.HEADER_SPACER, data: '', key: `${key}-spacer-before` });
                }
                const totalFilePaths = node.hasTotals
                    ? (node.template.groupTotalFilePathsByBucket?.get(node.path) ?? Array.from(node.totalFiles))
                    : undefined;
                result.push({
                    ...(node.header ?? node.template),
                    type: ListPaneItemType.HEADER,
                    data: node.label,
                    key,
                    collapseKey,
                    isCollapsed,
                    groupDepth: node.depth,
                    groupPath: node.path.includes('\u0000') ? node.label : node.path,
                    groupBucketKey: node.path,
                    groupFilePaths: Array.from(node.files),
                    groupRowKeys: Array.from(node.providerKeys),
                    groupNativeFilePaths: Array.from(node.nativeFiles),
                    groupItemCount: node.nativeFiles.size + node.providerKeys.size,
                    groupTotalItemCount: totalFilePaths?.length,
                    groupTotalFilePaths: totalFilePaths
                });
                if (!isCollapsed) {
                    result.push(...node.rows);
                    render(node.children);
                }
            });
        };
        render(roots);
    }
    // Selection ranges use the final visible, deduplicated file order. Parent collapse
    // and sibling reordering change that order after the upstream flat pass.
    const fileIndices = new Map<string, number>();
    return result.map(item => {
        if (item.type !== ListPaneItemType.FILE || !(item.data instanceof TFile)) return item;
        const fileIndex = fileIndices.get(item.data.path) ?? fileIndices.size;
        fileIndices.set(item.data.path, fileIndex);
        return item.fileIndex === fileIndex ? item : { ...item, fileIndex };
    });
}
