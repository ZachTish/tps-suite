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

import { describe, expect, it, vi } from 'vitest';
import type { PropertyItem, FileData } from '../src/storage/IndexedDBStorage';
import { PROPERTIES_ROOT_VIRTUAL_FOLDER_ID } from '../src/types';
import { DEFAULT_SETTINGS } from '../src/settings/defaultSettings';
import {
    canRestorePropertySelectionNodeId,
    determinePropertyToReveal,
    type PropertyTreeDatabaseLike,
    buildPropertyKeyNodeId,
    buildPropertyTreeFromFilePaths,
    buildPropertyTreeFromDatabase,
    mergeLinePropertiesIntoPropertyTree,
    buildPropertyValueNodeId,
    collectPropertyKeyFilePaths,
    collectPropertyValueFilePaths,
    createConfiguredPropertyNodeValidator,
    findPropertyValueNode,
    getDirectPropertyKeyNoteCount,
    getPropertyKeyNodeIdFromNodeId,
    getPropertyValueAncestorNodeIds,
    matchesPropertyValuePath,
    resolvePropertySelectionNodeId,
    getTotalPropertyNoteCount,
    normalizePropertyTreeValuePath,
    parsePropertyNodeId
} from '../src/utils/propertyTree';
import { setActivePropertyFields } from '../src/utils/vaultProfiles';

interface MockFile {
    path: string;
    properties: PropertyItem[] | null;
}

function createFileData(properties: PropertyItem[] | null): FileData {
    return {
        mtime: 0,
        markdownPipelineMtime: 0,
        tagsMtime: 0,
        metadataMtime: 0,
        fileThumbnailsMtime: 0,
        tags: null,
        wordCount: null,
        taskTotal: 0,
        taskUnfinished: 0,
        properties,
        previewStatus: 'unprocessed',
        featureImage: null,
        featureImageStatus: 'unprocessed',
        featureImageKey: null,
        metadata: null
    };
}

function createMockDb(files: MockFile[]): PropertyTreeDatabaseLike {
    const payload = files.map(file => ({
        path: file.path,
        data: createFileData(file.properties)
    }));

    return {
        forEachFile: (callback: (path: string, data: FileData) => void) => {
            payload.forEach(entry => callback(entry.path, entry.data));
        }
    };
}

function createLookupDb(files: MockFile[]) {
    const payload = new Map<string, FileData>();
    files.forEach(file => {
        payload.set(file.path, createFileData(file.properties));
    });

    return {
        getFile: (path: string) => payload.get(path) ?? null,
        forEachFile: () => {
            throw new Error('full database scan should not run for scoped property builds');
        }
    };
}

describe('buildPropertyTreeFromDatabase', () => {
    it('builds a large nested property branch with one metadata pass and no follow-up scans for navigation', () => {
        const files = Array.from({ length: 1_000 }, (_, index) => ({
            path: `notes/${index}.md`,
            data: createFileData([{ fieldKey: 'kind', value: `transaction/financial/${index % 2 ? 'investment' : 'ordinary'}` }])
        }));
        const forEachFile = vi.fn((callback: (path: string, data: FileData) => void) => {
            files.forEach(file => callback(file.path, file.data));
        });
        const tree = buildPropertyTreeFromDatabase({ forEachFile }, { includedPropertyKeys: new Set(['kind']) });
        const keyNode = tree.get('kind');
        expect(keyNode).toBeDefined();
        if (!keyNode) return;

        for (let index = 0; index < 20; index++) {
            expect(getTotalPropertyNoteCount(keyNode, 'transaction')).toBe(1_000);
            expect(collectPropertyValueFilePaths(keyNode, 'transaction/financial/investment').size).toBe(500);
            expect(resolvePropertySelectionNodeId(tree, buildPropertyValueNodeId('kind', 'transaction/financial'))).toBe(
                buildPropertyValueNodeId('kind', 'transaction/financial')
            );
        }
        expect(forEachFile).toHaveBeenCalledTimes(1);
    });

    it('includes configured values authored only on exact task lines', () => {
        const tree = buildPropertyTreeFromDatabase(
            createMockDb([{ path: 'Tasks.md', properties: [{ fieldKey: 'Project', value: 'App support' }] }]),
            { includedPropertyKeys: new Set(['status']) }
        );

        mergeLinePropertiesIntoPropertyTree(
            tree,
            [
                { sourcePath: 'Tasks.md', taskStatus: 'todo' },
                { sourcePath: 'Hidden.md', properties: { Status: ['blocked'] } }
            ],
            {
                includedPaths: new Set(['Tasks.md']),
                includedPropertyKeys: new Set(['status'])
            }
        );

        const statusNode = tree.get('status');
        expect(statusNode?.children.get(buildPropertyValueNodeId('status', 'todo'))?.name).toBe('todo');
        expect(statusNode?.children.get(buildPropertyValueNodeId('status', 'todo'))?.notesWithValue).toEqual(new Set(['Tasks.md']));
        expect(statusNode?.children.has(buildPropertyValueNodeId('status', 'blocked'))).toBe(false);
    });
    it('builds nested value nodes with stable full-path ids and first-seen display casing', () => {
        const db = createMockDb([
            {
                path: 'notes/a.md',
                properties: [{ fieldKey: 'Status', value: 'Work/Finished' }]
            },
            {
                path: 'notes/b.md',
                properties: [{ fieldKey: 'status', value: 'work/Started' }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['status'])
        });

        expect(Array.from(tree.keys())).toEqual(['status']);
        const keyNode = tree.get('status');
        expect(keyNode?.name).toBe('Status');
        expect(keyNode?.notesWithValue).toEqual(new Set(['notes/a.md', 'notes/b.md']));

        const workNodeId = buildPropertyValueNodeId('status', 'work');
        const workNode = keyNode?.children.get(workNodeId);
        expect(workNode?.name).toBe('Work');
        expect(workNode?.notesWithValue.size).toBe(0);
        expect(workNode?.assignmentValue).toBeUndefined();

        const finishedNodeId = buildPropertyValueNodeId('status', 'work/finished');
        const finishedNode = workNode?.children.get(finishedNodeId);
        expect(finishedNode?.name).toBe('Finished');
        expect(finishedNode?.displayPath).toBe('Work/Finished');
        expect(finishedNode?.notesWithValue).toEqual(new Set(['notes/a.md']));

        const startedNodeId = buildPropertyValueNodeId('status', 'work/started');
        const startedNode = workNode?.children.get(startedNodeId);
        expect(startedNode?.name).toBe('Started');
        expect(startedNode?.notesWithValue).toEqual(new Set(['notes/b.md']));
        expect(getPropertyValueAncestorNodeIds(keyNode!, 'work/finished')).toEqual([keyNode!.id, workNodeId]);
    });

    it('uses wiki-link display text for value node labels', () => {
        const rawValue = '[[Tech Insights/2026/Tech Insights 2026 Week 7|Tech Insights 2026 Week 7]]';
        const db = createMockDb([
            {
                path: 'notes/a.md',
                properties: [{ fieldKey: 'Status', value: rawValue }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['status'])
        });
        const keyNode = tree.get('status');
        const valueNode = keyNode?.children.get(buildPropertyValueNodeId('status', normalizePropertyTreeValuePath(rawValue)));

        expect(valueNode?.name).toBe('Tech Insights 2026 Week 7');
        expect(valueNode?.displayPath).toBe('Tech Insights 2026 Week 7');
        expect(valueNode?.assignmentValue).toBe(rawValue);
    });

    it('keeps links and URLs with slashes atomic', () => {
        const linkedValue = '[[Projects/Alpha|Projects/Alpha]]';
        const urlValue = 'https://example.com/projects/alpha';
        const markdownLinkValue = '[Project/Alpha](https://example.com/projects/alpha)';
        const tree = buildPropertyTreeFromDatabase(
            createMockDb([
                { path: 'linked.md', properties: [{ fieldKey: 'Project', value: linkedValue }] },
                { path: 'url.md', properties: [{ fieldKey: 'Project', value: urlValue }] },
                { path: 'markdown.md', properties: [{ fieldKey: 'Project', value: markdownLinkValue }] }
            ]),
            { includedPropertyKeys: new Set(['project']) }
        );
        const keyNode = tree.get('project');
        expect(keyNode).toBeDefined();
        if (!keyNode) return;

        const linkedPath = normalizePropertyTreeValuePath(linkedValue);
        const urlPath = normalizePropertyTreeValuePath(urlValue);
        const markdownPath = normalizePropertyTreeValuePath(markdownLinkValue);
        expect(keyNode.children.get(buildPropertyValueNodeId('project', linkedPath))?.name).toBe('Projects/Alpha');
        expect(keyNode.children.get(buildPropertyValueNodeId('project', urlPath))?.name).toBe(urlValue);
        expect(keyNode.children.get(buildPropertyValueNodeId('project', markdownPath))?.name).toBe('Project/Alpha');
        expect(keyNode.children.size).toBe(3);
        expect(getPropertyValueAncestorNodeIds(keyNode, urlPath)).toEqual([keyNode.id]);
        expect(matchesPropertyValuePath(linkedPath, 'projects', true, linkedValue)).toBe(false);
        expect(matchesPropertyValuePath(urlPath, 'https:', true, urlValue)).toBe(false);
    });

    it.each([['plain', 'link'], ['link', 'plain']] as const)(
        'keeps one canonical value and both note memberships when %s precedes %s',
        (first, second) => {
            const values = {
                plain: 'Projects/Alpha',
                link: '[[Projects/Alpha|Projects/Alpha]]'
            };
            const tree = buildPropertyTreeFromDatabase(
                createMockDb([
                    { path: `${first}.md`, properties: [{ fieldKey: 'Project', value: values[first] }] },
                    { path: `${second}.md`, properties: [{ fieldKey: 'Project', value: values[second] }] }
                ]),
                { includedPropertyKeys: new Set(['project']) }
            );
            const keyNode = tree.get('project');
            expect(keyNode).toBeDefined();
            if (!keyNode) return;

            const canonicalPath = normalizePropertyTreeValuePath(values.plain);
            const canonicalId = buildPropertyValueNodeId('project', canonicalPath);
            const nodes = Array.from(keyNode.children.values()).flatMap(node => [node, ...node.children.values()]);
            expect(nodes.filter(node => node.id === canonicalId)).toHaveLength(1);
            expect(collectPropertyValueFilePaths(keyNode, canonicalPath)).toEqual(new Set(['plain.md', 'link.md']));
            expect(resolvePropertySelectionNodeId(tree, canonicalId)).toBe(canonicalId);
        }
    );

    it('creates deep prefix nodes while preserving exact membership and metadata ids', () => {
        const tree = buildPropertyTreeFromDatabase(
            createMockDb([
                { path: 'food.md', properties: [{ fieldKey: 'Kind', value: 'Transaction/Food/Log' }] },
                { path: 'finance.md', properties: [{ fieldKey: 'Kind', value: 'transaction/Financial' }] }
            ]),
            { includedPropertyKeys: new Set(['kind']) }
        );
        const keyNode = tree.get('kind');
        expect(keyNode).toBeDefined();
        if (!keyNode) return;

        const transactionId = buildPropertyValueNodeId('kind', 'transaction');
        const foodId = buildPropertyValueNodeId('kind', 'transaction/food');
        const logId = buildPropertyValueNodeId('kind', 'transaction/food/log');
        const transaction = keyNode.children.get(transactionId);
        expect(transaction?.name).toBe('Transaction');
        expect(transaction?.notesWithValue.size).toBe(0);
        expect(transaction?.children.get(foodId)?.name).toBe('Food');
        expect(findPropertyValueNode(keyNode, 'transaction/food/log')?.name).toBe('Log');
        expect(findPropertyValueNode(keyNode, 'transaction/food/log')?.notesWithValue).toEqual(new Set(['food.md']));
        expect(getTotalPropertyNoteCount(keyNode, 'transaction')).toBe(2);
        expect(collectPropertyValueFilePaths(keyNode, 'transaction/food')).toEqual(new Set());
        expect(collectPropertyValueFilePaths(keyNode, 'transaction/food', true)).toEqual(new Set(['food.md']));
        expect(getPropertyValueAncestorNodeIds(keyNode, 'transaction/food/log')).toEqual([keyNode.id, transactionId, foodId]);
        expect(resolvePropertySelectionNodeId(tree, logId)).toBe(logId);

        const validator = createConfiguredPropertyNodeValidator({
            propertyFields: 'kind',
            dbFiles: [{ data: createFileData([{ fieldKey: 'Kind', value: 'Transaction/Food/Log' }]) }]
        });
        expect(validator?.(transactionId)).toBe(true);
        expect(validator?.(foodId)).toBe(true);
        expect(validator?.(logId)).toBe(true);
    });

    it('uses markdown-link display text for external value node labels', () => {
        const rawValue = '[GitHub issue](https://github.com/johansan/notebook-navigator/issues/935)';
        const db = createMockDb([
            {
                path: 'notes/a.md',
                properties: [{ fieldKey: 'Status', value: rawValue }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['status'])
        });
        const keyNode = tree.get('status');
        const valueNode = keyNode?.children.get(buildPropertyValueNodeId('status', normalizePropertyTreeValuePath(rawValue)));

        expect(valueNode?.name).toBe('GitHub issue');
        expect(valueNode?.displayPath).toBe('GitHub issue');
    });

    it('treats plain text and strict wiki-link aliases as the same canonical value', () => {
        const plainValue = 'Tech Insights 2026 Week 7';
        const wikiLinkValue = '[[Tech Insights/2026/Tech Insights 2026 Week 7|Tech Insights 2026 Week 7]]';
        const db = createMockDb([
            {
                path: 'notes/plain.md',
                properties: [{ fieldKey: 'Status', value: plainValue }]
            },
            {
                path: 'notes/wikilink.md',
                properties: [{ fieldKey: 'Status', value: wikiLinkValue }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['status'])
        });
        const keyNode = tree.get('status');
        const canonicalValueNodeId = buildPropertyValueNodeId('status', normalizePropertyTreeValuePath(plainValue));
        const canonicalValueNode = keyNode?.children.get(canonicalValueNodeId);

        expect(normalizePropertyTreeValuePath(plainValue)).toBe(normalizePropertyTreeValuePath(wikiLinkValue));
        expect(keyNode?.children.size).toBe(1);
        expect(canonicalValueNode?.notesWithValue).toEqual(new Set(['notes/plain.md', 'notes/wikilink.md']));
        expect(canonicalValueNode?.assignmentValue).toBe(wikiLinkValue);
    });

    it('respects included paths, excluded folders, and included property keys', () => {
        const db = createMockDb([
            {
                path: 'notes/keep.md',
                properties: [{ fieldKey: 'Status', value: '  Work // Done / ' }]
            },
            {
                path: 'notes/skip-key.md',
                properties: [{ fieldKey: 'Priority', value: 'High' }]
            },
            {
                path: 'archive/hidden.md',
                properties: [{ fieldKey: 'Status', value: 'Hidden/Value' }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPaths: new Set(['notes/keep.md', 'archive/hidden.md', 'notes/skip-key.md']),
            excludedFolderPatterns: ['archive'],
            includedPropertyKeys: new Set(['status'])
        });

        expect(Array.from(tree.keys())).toEqual(['status']);

        const keyNode = tree.get('status');
        expect(keyNode?.notesWithValue).toEqual(new Set(['notes/keep.md']));

        const normalizedValuePath = normalizePropertyTreeValuePath('  Work // Done / ');
        const valueNodeId = buildPropertyValueNodeId('status', normalizedValuePath);
        const valueNode = keyNode?.children.get(valueNodeId);

        expect(valueNode?.notesWithValue).toEqual(new Set(['notes/keep.md']));
        expect(valueNode?.displayPath).toBe('Work // Done /');
        expect(tree.has('priority')).toBe(false);
    });

    it('normalizes full value strings and keeps first-seen display casing', () => {
        const db = createMockDb([
            {
                path: 'notes/first.md',
                properties: [{ fieldKey: 'Status', value: '  Work // Done / ' }]
            },
            {
                path: 'notes/second.md',
                properties: [{ fieldKey: 'status', value: 'work // done /' }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['status'])
        });
        const keyNode = tree.get('status');
        const valueNode = keyNode?.children.get(buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('work // done /')));

        expect(valueNode?.name).toBe('Work // Done /');
        expect(valueNode?.displayPath).toBe('Work // Done /');
        expect(valueNode?.notesWithValue).toEqual(new Set(['notes/first.md', 'notes/second.md']));
    });

    it('normalizes included property keys before filtering', () => {
        const db = createMockDb([
            {
                path: 'notes/status.md',
                properties: [{ fieldKey: 'Status', value: 'Open' }]
            },
            {
                path: 'notes/priority.md',
                properties: [{ fieldKey: 'Priority', value: 'High' }]
            },
            {
                path: 'notes/mood.md',
                properties: [{ fieldKey: 'Mood', value: 'Calm' }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set([' status ', 'PRIORITY'])
        });

        expect(Array.from(tree.keys())).toEqual(['priority', 'status']);
        expect(tree.has('mood')).toBe(false);
    });

    it('returns an empty tree when all included property keys normalize to empty values', () => {
        const db = createMockDb([
            {
                path: 'notes/status.md',
                properties: [{ fieldKey: 'Status', value: 'Open' }]
            },
            {
                path: 'notes/priority.md',
                properties: [{ fieldKey: 'Priority', value: 'High' }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['   '])
        });

        expect(tree.size).toBe(0);
    });

    it('filters by normalized included property keys when some entries normalize to empty values', () => {
        const db = createMockDb([
            {
                path: 'notes/status.md',
                properties: [{ fieldKey: 'Status', value: 'Open' }]
            },
            {
                path: 'notes/priority.md',
                properties: [{ fieldKey: 'Priority', value: 'High' }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['   ', ' Status '])
        });

        expect(Array.from(tree.keys())).toEqual(['status']);
        expect(tree.has('priority')).toBe(false);
    });

    it('orders key nodes and value nodes deterministically', () => {
        const db = createMockDb([
            {
                path: 'notes/status-zeta.md',
                properties: [{ fieldKey: 'Status', value: 'Work/Zeta' }]
            },
            {
                path: 'notes/zeta.md',
                properties: [{ fieldKey: 'Zeta', value: 'One' }]
            },
            {
                path: 'notes/alpha.md',
                properties: [{ fieldKey: 'Alpha', value: 'Two' }]
            },
            {
                path: 'notes/status-alpha.md',
                properties: [{ fieldKey: 'status', value: 'Work/Alpha' }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['STATUS', 'zeta', 'alpha'])
        });

        expect(Array.from(tree.keys())).toEqual(['alpha', 'status', 'zeta']);

        const statusNode = tree.get('status');
        expect(statusNode).toBeDefined();
        if (!statusNode) {
            return;
        }

        const workNode = statusNode.children.get(buildPropertyValueNodeId('status', 'work'));
        expect(Array.from(statusNode.children.keys())).toEqual([buildPropertyValueNodeId('status', 'work')]);
        expect(Array.from(workNode?.children.keys() ?? [])).toEqual([
            buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('Work/Alpha')),
            buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('Work/Zeta'))
        ]);
    });

    it('builds a scoped property tree from selected file paths without scanning the full database', () => {
        const db = createLookupDb([
            {
                path: 'notes/status.md',
                properties: [{ fieldKey: 'Status', value: 'Open' }]
            },
            {
                path: 'notes/priority.md',
                properties: [{ fieldKey: 'Priority', value: 'High' }]
            },
            {
                path: 'notes/ignored.md',
                properties: [{ fieldKey: 'Mood', value: 'Calm' }]
            }
        ]);

        const tree = buildPropertyTreeFromFilePaths(db, ['notes/status.md', 'notes/priority.md'], {
            includedPropertyKeys: new Set(['status', 'priority'])
        });

        expect(Array.from(tree.keys())).toEqual(['priority', 'status']);
        expect(tree.get('status')?.notesWithValue).toEqual(new Set(['notes/status.md']));
        expect(tree.get('priority')?.notesWithValue).toEqual(new Set(['notes/priority.md']));
        expect(tree.has('mood')).toBe(false);
    });

    it('keeps key nodes for empty values without creating value nodes', () => {
        const db = createMockDb([
            {
                path: 'notes/empty.md',
                properties: [{ fieldKey: 'Status', value: '   ' }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['status'])
        });

        const keyNodeId = buildPropertyKeyNodeId('status');
        const keyNode = tree.get('status');

        expect(keyNode?.id).toBe(keyNodeId);
        expect(keyNode?.notesWithValue).toEqual(new Set(['notes/empty.md']));
        expect(keyNode?.children.size).toBe(0);
    });

    it('creates value nodes for boolean values', () => {
        const db = createMockDb([
            {
                path: 'notes/true.md',
                properties: [{ fieldKey: 'Status', value: 'true', valueKind: 'boolean' }]
            },
            {
                path: 'notes/false.md',
                properties: [{ fieldKey: 'Status', value: 'false', valueKind: 'boolean' }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['status'])
        });

        const keyNode = tree.get('status');
        expect(keyNode?.notesWithValue).toEqual(new Set(['notes/true.md', 'notes/false.md']));

        const trueNode = keyNode?.children.get(buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('true')));
        expect(trueNode?.notesWithValue).toEqual(new Set(['notes/true.md']));

        const falseNode = keyNode?.children.get(buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('false')));
        expect(falseNode?.notesWithValue).toEqual(new Set(['notes/false.md']));
    });

    it('keeps string literals "true" and "false" as value nodes', () => {
        const db = createMockDb([
            {
                path: 'notes/true-string.md',
                properties: [{ fieldKey: 'Status', value: 'true', valueKind: 'string' }]
            },
            {
                path: 'notes/false-string.md',
                properties: [{ fieldKey: 'Status', value: 'false', valueKind: 'string' }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['status'])
        });

        const keyNode = tree.get('status');
        expect(keyNode?.notesWithValue).toEqual(new Set(['notes/true-string.md', 'notes/false-string.md']));

        const trueNode = keyNode?.children.get(buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('true')));
        expect(trueNode?.notesWithValue).toEqual(new Set(['notes/true-string.md']));

        const falseNode = keyNode?.children.get(buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('false')));
        expect(falseNode?.notesWithValue).toEqual(new Set(['notes/false-string.md']));
    });
});

describe('property value matching', () => {
    it('counts unique descendant files separately from exact value files', () => {
        const db = createMockDb([
            {
                path: 'notes/a.md',
                properties: [{ fieldKey: 'Status', value: 'Work/Done' }]
            },
            {
                path: 'notes/b.md',
                properties: [{ fieldKey: 'Status', value: 'Work/Blocked' }]
            },
            {
                path: 'notes/c.md',
                properties: [
                    { fieldKey: 'Status', value: 'Work' },
                    { fieldKey: 'Status', value: 'Work/Done' }
                ]
            },
            {
                path: 'notes/d.md',
                properties: [{ fieldKey: 'Status', value: 'Personal/Home' }]
            },
            {
                path: 'notes/e.md',
                properties: [{ fieldKey: 'Status', value: '   ' }]
            },
            {
                path: 'notes/f.md',
                properties: [
                    { fieldKey: 'Status', value: 'true', valueKind: 'boolean' },
                    { fieldKey: 'Status', value: 'Work/Done' }
                ]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['status'])
        });
        const keyNode = tree.get('status');
        expect(keyNode).toBeDefined();
        if (!keyNode) {
            return;
        }

        expect(getTotalPropertyNoteCount(keyNode, normalizePropertyTreeValuePath('Work'))).toBe(4);
        expect(getTotalPropertyNoteCount(keyNode, normalizePropertyTreeValuePath('Work/Done'))).toBe(3);
        expect(getTotalPropertyNoteCount(keyNode, normalizePropertyTreeValuePath('true'))).toBe(1);

        const directPaths = collectPropertyValueFilePaths(keyNode, normalizePropertyTreeValuePath('Work'));
        expect(directPaths).toEqual(new Set(['notes/c.md']));

        const withDescendants = collectPropertyValueFilePaths(keyNode, normalizePropertyTreeValuePath('Work'), true);
        expect(withDescendants).toEqual(new Set(['notes/a.md', 'notes/b.md', 'notes/c.md', 'notes/f.md']));

        const directKeyPaths = collectPropertyKeyFilePaths(keyNode, false);
        expect(directKeyPaths).toEqual(new Set(['notes/e.md']));
        expect(getDirectPropertyKeyNoteCount(keyNode)).toBe(1);

        const allKeyPaths = collectPropertyKeyFilePaths(keyNode, true);
        expect(allKeyPaths).toEqual(new Set(['notes/a.md', 'notes/b.md', 'notes/c.md', 'notes/d.md', 'notes/e.md', 'notes/f.md']));
    });

    it('recomputes descendant totals after value-node mutations', () => {
        const db = createMockDb([
            {
                path: 'notes/a.md',
                properties: [{ fieldKey: 'Status', value: 'Work/Done' }]
            },
            {
                path: 'notes/b.md',
                properties: [{ fieldKey: 'Status', value: 'Work/Blocked' }]
            }
        ]);

        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['status'])
        });
        const keyNode = tree.get('status');
        expect(keyNode).toBeDefined();
        if (!keyNode) {
            return;
        }

        const workPath = normalizePropertyTreeValuePath('Work');
        expect(getTotalPropertyNoteCount(keyNode, workPath)).toBe(2);

        const startedNodeId = buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('Work/Started'));
        const workNode = findPropertyValueNode(keyNode, workPath);
        expect(workNode).toBeDefined();
        workNode?.children.set(startedNodeId, {
            id: startedNodeId,
            kind: 'value',
            key: 'status',
            valuePath: normalizePropertyTreeValuePath('Work/Started'),
            name: 'Started',
            displayPath: 'Work/Started',
            children: new Map(),
            notesWithValue: new Set(['notes/c.md'])
        });

        expect(getTotalPropertyNoteCount(keyNode, workPath)).toBe(3);
    });

    it('matches only exact values unless descendants are requested', () => {
        expect(matchesPropertyValuePath('entity/physical', 'entity')).toBe(false);
        expect(matchesPropertyValuePath('entity/physical', 'entity', true)).toBe(true);
        expect(matchesPropertyValuePath('entityplus/physical', 'entity', true)).toBe(false);
        expect(matchesPropertyValuePath('entity//physical', 'entity', true)).toBe(false);
    });
});

describe('property node id encoding', () => {
    it('preserves keys and values that contain "=" when building and parsing ids', () => {
        const keyId = buildPropertyKeyNodeId('status=phase');
        const valuePath = normalizePropertyTreeValuePath('work=done/blocked');
        const valueId = buildPropertyValueNodeId('status=phase', valuePath);

        expect(parsePropertyNodeId(keyId)).toEqual({ key: 'status=phase', valuePath: null });
        expect(parsePropertyNodeId(valueId)).toEqual({ key: 'status=phase', valuePath });
        expect(getPropertyKeyNodeIdFromNodeId(valueId)).toBe(keyId);
    });
});

describe('property selection resolution', () => {
    it('keeps selected boolean value nodes when the tree contains them', () => {
        const db = createMockDb([
            {
                path: 'notes/a.md',
                properties: [{ fieldKey: 'Status', value: 'true', valueKind: 'boolean' }]
            }
        ]);
        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['status'])
        });

        const valueSelection = buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('true'));
        const resolved = resolvePropertySelectionNodeId(tree, valueSelection);
        expect(resolved).toBe(valueSelection);
    });

    it('falls back to properties root when selected key does not exist', () => {
        const tree = buildPropertyTreeFromDatabase(createMockDb([]), {
            includedPropertyKeys: new Set(['status'])
        });

        const keySelection = buildPropertyKeyNodeId('status');
        const resolved = resolvePropertySelectionNodeId(tree, keySelection);
        expect(resolved).toBe(PROPERTIES_ROOT_VIRTUAL_FOLDER_ID);
    });

    it('keeps selected value node when a string literal value node exists', () => {
        const db = createMockDb([
            {
                path: 'notes/a.md',
                properties: [{ fieldKey: 'Status', value: 'true', valueKind: 'string' }]
            }
        ]);
        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['status'])
        });

        const valueSelection = buildPropertyValueNodeId('status', normalizePropertyTreeValuePath('true'));
        const resolved = resolvePropertySelectionNodeId(tree, valueSelection);
        expect(resolved).toBe(valueSelection);
    });

    it('resolves legacy wiki-link value selections to the canonical value node', () => {
        const rawValue = '[[Tech Insights/2026/Tech Insights 2026 Week 7|Tech Insights 2026 Week 7]]';
        const db = createMockDb([
            {
                path: 'notes/a.md',
                properties: [{ fieldKey: 'Status', value: rawValue }]
            }
        ]);
        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['status'])
        });

        const legacySelection = buildPropertyValueNodeId('status', rawValue.toLowerCase());
        const canonicalSelection = buildPropertyValueNodeId('status', normalizePropertyTreeValuePath(rawValue));
        const resolved = resolvePropertySelectionNodeId(tree, legacySelection);
        expect(resolved).toBe(canonicalSelection);
    });

    it('resolves NFC and NFD-equivalent property node ids to the canonical node', () => {
        const rawValue = 'Planifié';
        const db = createMockDb([
            {
                path: 'notes/a.md',
                properties: [{ fieldKey: 'Réunion', value: rawValue }]
            }
        ]);
        const tree = buildPropertyTreeFromDatabase(db, {
            includedPropertyKeys: new Set(['réunion'])
        });

        const legacySelection = 'key:Re\u0301union=Planifie\u0301';
        const canonicalSelection = buildPropertyValueNodeId('réunion', normalizePropertyTreeValuePath(rawValue));
        const resolved = resolvePropertySelectionNodeId(tree, legacySelection);
        expect(resolved).toBe(canonicalSelection);
    });
});

describe('property selection restore', () => {
    it('allows restoring properties root when properties section is shown and no fields are configured', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            showProperties: true
        };
        setActivePropertyFields(settings, '');

        expect(canRestorePropertySelectionNodeId(settings, PROPERTIES_ROOT_VIRTUAL_FOLDER_ID)).toBe(true);
    });

    it('rejects restoring properties root when properties section is hidden', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            showProperties: false
        };
        setActivePropertyFields(settings, 'status');

        expect(canRestorePropertySelectionNodeId(settings, PROPERTIES_ROOT_VIRTUAL_FOLDER_ID)).toBe(false);
    });

    it('allows restoring NFC and NFD-equivalent property node ids for configured keys', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            showProperties: true
        };
        setActivePropertyFields(settings, 'Réunion');

        expect(canRestorePropertySelectionNodeId(settings, 'key:Re\u0301union')).toBe(true);
    });
});

describe('property reveal selection', () => {
    it('keeps current property selection while file properties are not indexed yet', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            showProperties: true
        };
        setActivePropertyFields(settings, 'hideFeature');

        const selection = buildPropertyKeyNodeId('hidefeature');
        const resolved = determinePropertyToReveal(null, selection, settings, false);
        expect(resolved).toBe(selection);
    });

    it('falls back when file has no properties', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            showProperties: true
        };
        setActivePropertyFields(settings, 'hideFeature');

        const selection = buildPropertyKeyNodeId('hidefeature');
        const resolved = determinePropertyToReveal([], selection, settings, false);
        expect(resolved).toBeNull();
    });

    it('keeps a property key root selected for boolean values', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            showProperties: true
        };
        setActivePropertyFields(settings, 'finished');

        const resolved = determinePropertyToReveal(
            [{ fieldKey: 'finished', value: 'false', valueKind: 'boolean' }],
            buildPropertyKeyNodeId('finished'),
            settings,
            false
        );

        expect(resolved).toBe(buildPropertyKeyNodeId('finished'));
    });

    it('keeps a property key root selected when the file has any value for that key', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            showProperties: true
        };
        setActivePropertyFields(settings, 'status');

        const resolved = determinePropertyToReveal(
            [{ fieldKey: 'status', value: 'working', valueKind: 'string' }],
            buildPropertyKeyNodeId('status'),
            settings,
            true
        );

        expect(resolved).toBe(buildPropertyKeyNodeId('status'));
    });

    it('keeps a selected value prefix for a descendant only when descendant notes are included', () => {
        const settings = { ...DEFAULT_SETTINGS, showProperties: true };
        setActivePropertyFields(settings, 'kind');
        const parentId = buildPropertyValueNodeId('kind', 'transaction');
        const properties: PropertyItem[] = [{ fieldKey: 'kind', value: 'transaction/financial/investment' }];

        expect(determinePropertyToReveal(properties, parentId, settings, true)).toBe(parentId);
        expect(determinePropertyToReveal(properties, parentId, settings, false)).toBe(
            buildPropertyValueNodeId('kind', 'transaction/financial/investment')
        );
    });
});
