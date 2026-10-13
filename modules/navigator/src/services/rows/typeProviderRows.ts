/* TPS Notebook Navigator - pure mapping from a Types snapshot to standalone rows. */

import type { NavigatorProvidedRow } from './types';
import type { GcmTaskMenuLike } from '../../integrations/gcm/gcmTaskApi';
import type { FilterSearchTokens } from '../../utils/filterSearch';
import { filterSearchMatchesTypeFacet, parseFilterSearchTokens } from '../../utils/filterSearch';
import { evaluateTagExpression, propertyTokenMatches, tagMatchesToken } from '../../utils/filterSearchExpression';
import type { LinePropertyInheritance } from '../../hooks/useListPaneAppearance';
import { casefold, foldSearchText } from '../../utils/recordUtils';
import {
    isTpsNavigatorGcmLineTypeId,
    isTpsNavigatorMarkdownTypeId,
    type TpsNavigatorTypeId,
    type TpsNavigatorTypeRecord,
    type TpsNavigatorTypeTaskState,
    type TpsNavigatorTypesSnapshot
} from '../../types/navigatorTypes';

export interface TypeRecordActivationResult {
    readonly ok: boolean;
    readonly reason?: string;
}

export interface TypeTaskMutationResult {
    readonly ok: boolean;
    readonly reason?: string;
    readonly error?: unknown;
}

interface BuildTypeProviderRowsOptions {
    snapshot: TpsNavigatorTypesSnapshot;
    selectedType: TpsNavigatorTypeId;
    searchQuery: string;
    /** Parsed host search. Type facets are evaluated here; note metadata is scoped by allowedSourcePaths. */
    searchTokens?: FilterSearchTokens;
    /** Optional source-note scope after navigation and owning-note metadata filters. */
    allowedSourcePaths?: ReadonlySet<string>;
    /** Owning-note properties used only as the configured fallback/priority for row property search. */
    getNoteProperties?: (sourcePath: string) => Readonly<Record<string, unknown>> | undefined;
    linePropertyInheritance?: LinePropertyInheritance;
    /** Standalone Type views show source failures; mixed search sections omit them. */
    includeUnavailableStatus?: boolean;
    activate: (record: TpsNavigatorTypeRecord) => Promise<TypeRecordActivationResult>;
    setTaskCheckbox: (record: TpsNavigatorTypeRecord, checked: boolean) => Promise<TypeTaskMutationResult>;
    addTaskContextMenuItems: (menu: GcmTaskMenuLike, record: TpsNavigatorTypeRecord) => boolean;
    onActivationFailure: (record: TpsNavigatorTypeRecord, result: TypeRecordActivationResult) => void;
}

function addSearchPropertyValues(target: Map<string, string[]>, properties: Readonly<Record<string, unknown>> | undefined): void {
    Object.entries(properties ?? {}).forEach(([key, rawValue]) => {
        const normalizedKey = foldSearchText(key.trim());
        if (!normalizedKey) return;
        const values = (Array.isArray(rawValue) ? rawValue : [rawValue]).map(value => foldSearchText(String(value ?? ''))).filter(Boolean);
        target.set(normalizedKey, values);
    });
}

function buildEffectiveSearchProperties(
    rowProperties: NavigatorProvidedRow['properties'],
    noteProperties: Readonly<Record<string, unknown>> | undefined,
    inheritance: LinePropertyInheritance
): Map<string, string[]> {
    const note = new Map<string, string[]>();
    const line = new Map<string, string[]>();
    addSearchPropertyValues(note, noteProperties);
    addSearchPropertyValues(line, rowProperties);
    if (inheritance === 'none') {
        return line;
    }
    if (inheritance === 'note-first') {
        line.forEach((values, key) => {
            if (!note.has(key)) note.set(key, values);
        });
        return note;
    }
    if (inheritance === 'combine') {
        line.forEach((values, key) => note.set(key, [...new Set([...(note.get(key) ?? []), ...values])]));
        return note;
    }
    note.forEach((values, key) => {
        if (!line.has(key)) line.set(key, values);
    });
    return line;
}

function setPropertyCaseInsensitively(
    properties: Record<string, string | readonly string[]>,
    key: string,
    value: string | readonly string[]
): void {
    const normalizedKey = casefold(key);
    const matchingKeys = Object.keys(properties).filter(candidate => casefold(candidate) === normalizedKey);
    const targetKey = matchingKeys[0] ?? key;
    properties[targetKey] = value;
    matchingKeys.slice(1).forEach(duplicateKey => delete properties[duplicateKey]);
}

function buildRowProperties(
    rawProperties: Readonly<Record<string, readonly string[]>> | undefined,
    task: TpsNavigatorTypeTaskState | undefined
): NavigatorProvidedRow['properties'] | undefined {
    const properties: Record<string, string | readonly string[]> = Object.create(null) as Record<string, string | readonly string[]>;
    Object.entries(rawProperties ?? {}).forEach(([key, values]) => {
        properties[key] = Object.freeze([...values]);
    });

    Object.entries(task?.fields ?? {}).forEach(([key, value]) => {
        if (typeof value === 'string') {
            setPropertyCaseInsensitively(properties, key, value);
        }
    });

    if (task) {
        // Status is canonical task state even when a raw field or task fields record uses another casing.
        setPropertyCaseInsensitively(properties, 'status', task.status);
        // GCM publishes Markdown hashtags separately from inline fields. Keep them on the
        // row so tag/property grouping uses the exact task instead of only its owning note.
        // An empty task tag list is authoritative too. Without this overwrite, a raw
        // Tags value inherited from the owning note survives on an untagged task.
        if (task.tags) {
            setPropertyCaseInsensitively(properties, 'tags', task.tags);
        }
    }

    return Object.keys(properties).length > 0 ? Object.freeze(properties) : undefined;
}

function getRowLocalTags(task: TpsNavigatorTypeTaskState | undefined, properties: Map<string, string[]>, isTaskRow: boolean): string[] {
    const values = isTaskRow ? (task?.tags ?? []) : (properties.get('tags') ?? []);
    return values.map(tag => foldSearchText(tag.replace(/^#+/u, '').trim())).filter(Boolean);
}

function rowMatchesTagAndPropertyFacets(
    tokens: FilterSearchTokens,
    task: TpsNavigatorTypeTaskState | undefined,
    properties: Map<string, string[]>,
    isTaskRow: boolean
): boolean {
    const tags = getRowLocalTags(task, properties, isTaskRow);
    if (tokens.mode === 'tag') {
        return evaluateTagExpression(tokens.expression, tags, properties);
    }

    if (tokens.excludeTagged && tags.length > 0) {
        return false;
    }
    if (tokens.excludeTagTokens.some(token => tags.some(tag => tagMatchesToken(tag, token)))) {
        return false;
    }
    if (tokens.requireTagged && tags.length === 0) {
        return false;
    }
    if (tokens.tagTokens.some(token => !tags.some(tag => tagMatchesToken(tag, token)))) {
        return false;
    }
    if (tokens.excludePropertyTokens.some(token => propertyTokenMatches(properties, token))) {
        return false;
    }
    return tokens.propertyTokens.every(token => propertyTokenMatches(properties, token));
}

export function buildTypeProviderRows({
    snapshot,
    selectedType,
    searchQuery,
    searchTokens,
    allowedSourcePaths,
    getNoteProperties,
    linePropertyInheritance = 'none',
    includeUnavailableStatus = true,
    activate,
    setTaskCheckbox,
    addTaskContextMenuItems,
    onActivationFailure
}: BuildTypeProviderRowsOptions): NavigatorProvidedRow[] {
    const tokens = searchTokens ?? (searchQuery.trim() ? parseFilterSearchTokens(searchQuery) : null);
    if (tokens && !filterSearchMatchesTypeFacet(selectedType, tokens)) {
        return [];
    }

    const lineAvailability = snapshot.lineAvailability ?? snapshot.builtinAvailability ?? snapshot.availability;
    if (isTpsNavigatorGcmLineTypeId(selectedType) && lineAvailability !== 'ready') {
        if (!includeUnavailableStatus) {
            return [];
        }
        return [
            {
                providerId: 'tps/entity-types',
                id: `status:${lineAvailability}`,
                kind: 'tps/entity-type-status',
                label: snapshot.lineMessage ?? snapshot.builtinMessage ?? snapshot.message ?? 'Exact-line items are unavailable.',
                sourcePath: 'Types'
            }
        ];
    }
    const markdownAvailability = snapshot.markdownAvailability ?? snapshot.availability;
    if (isTpsNavigatorMarkdownTypeId(selectedType) && markdownAvailability !== 'ready') {
        if (!includeUnavailableStatus) {
            return [];
        }
        return [
            {
                providerId: 'tps/markdown-types',
                id: `status:${markdownAvailability}`,
                kind: 'tps/markdown-type-status',
                label: snapshot.markdownMessage ?? snapshot.message ?? 'Markdown structures are unavailable.',
                sourcePath: 'Types'
            }
        ];
    }

    const queryTerms = tokens ? tokens.nameTokens : searchQuery.trim().split(/\s+/u).map(foldSearchText).filter(Boolean);
    const excludedQueryTerms = tokens?.excludeNameTokens ?? [];

    return (snapshot.recordsByType.get(selectedType) ?? [])
        .filter(record => {
            if (allowedSourcePaths && !allowedSourcePaths.has(record.sourcePath)) {
                return false;
            }
            const haystack = foldSearchText(`${record.label}\n${record.sourcePath}\n${record.searchText ?? ''}`);
            if (!queryTerms.every(term => haystack.includes(term)) || !excludedQueryTerms.every(term => !haystack.includes(term))) {
                return false;
            }
            if (!tokens) {
                return true;
            }
            const task = record.lineKind === 'task' ? record.task : undefined;
            const rawProperties = isTpsNavigatorGcmLineTypeId(record.typeId) ? record.properties : undefined;
            const effectiveProperties = buildEffectiveSearchProperties(
                buildRowProperties(rawProperties, task),
                getNoteProperties?.(record.sourcePath),
                linePropertyInheritance
            );
            return rowMatchesTagAndPropertyFacets(tokens, task, effectiveProperties, record.lineKind === 'task');
        })
        .map(record => {
            const task = record.lineKind === 'task' ? record.task : undefined;
            const rawProperties =
                isTpsNavigatorGcmLineTypeId(selectedType) && isTpsNavigatorGcmLineTypeId(record.typeId) ? record.properties : undefined;
            const rowProperties = buildRowProperties(rawProperties, task);
            const sourceLocation = record.lineNumber
                ? record.lineEndNumber && record.lineEndNumber > record.lineNumber
                    ? `${record.sourcePath} · lines ${record.lineNumber}–${record.lineEndNumber}`
                    : `${record.sourcePath} · line ${record.lineNumber}`
                : record.sourcePath;
            const tooltip = record.lineNumber
                ? record.lineEndNumber && record.lineEndNumber > record.lineNumber
                    ? `Open ${record.sourcePath} at lines ${record.lineNumber}–${record.lineEndNumber}`
                    : `Open ${record.sourcePath} at line ${record.lineNumber}`
                : `Open ${record.sourcePath}`;
            return {
                providerId: 'tps/entity-types',
                id: `${selectedType}:${record.locatorKey}`,
                kind: `tps/entity-type/${record.lineKind ?? record.entityType}`,
                label: record.label,
                secondaryLabel: sourceLocation,
                tooltip,
                sourcePath: record.sourcePath,
                ...(record.lineNumber ? { sourceLineNumber: record.lineNumber - 1 } : {}),
                ...(rowProperties ? { properties: rowProperties } : {}),
                ...(task
                    ? {
                          indicator: {
                              type: 'checkbox' as const,
                              checked: task.isComplete,
                              marker: task.marker || task.checkbox,
                              ...(task.canMutateCheckbox
                                  ? {
                                        onChange: async (checked: boolean) => {
                                            const result = await setTaskCheckbox(record, checked);
                                            if (!result.ok) {
                                                throw new Error(
                                                    (result.error instanceof Error ? result.error.message : '') ||
                                                        (typeof result.error === 'string' ? result.error : '') ||
                                                        result.reason ||
                                                        'TPS Global Context Menu could not update the task.'
                                                );
                                            }
                                        }
                                    }
                                  : {})
                          }
                      }
                    : {}),
                ...(task?.hasContextMenu
                    ? {
                          contextMenu: (context: {
                              addItem: GcmTaskMenuLike['addItem'];
                              addSeparator: GcmTaskMenuLike['addSeparator'];
                          }) => {
                              addTaskContextMenuItems({ addItem: context.addItem, addSeparator: context.addSeparator }, record);
                          }
                      }
                    : {}),
                activate: async () => {
                    const result = await activate(record);
                    if (!result.ok) {
                        onActivationFailure(record, result);
                    }
                }
            } satisfies NavigatorProvidedRow;
        });
}
