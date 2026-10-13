/*
 * TPS Notebook Navigator - optional GCM entity-index adapter.
 *
 * This module intentionally depends only on GCM's structural public API. The
 * navigator remains usable when GCM is absent, disabled, outdated, or unable
 * to finish indexing a Markdown source.
 */

import { normalizePath, type App, type TFile } from 'obsidian';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../constants/tpsIdentity';
import {
    TPS_NAVIGATOR_GCM_LINE_TYPES,
    TPS_NAVIGATOR_TYPE_IDS,
    isTpsNavigatorTypeId,
    type TpsNavigatorTypeDescriptor,
    type TpsNavigatorTypeId,
    type TpsNavigatorTypeRecord,
    type TpsNavigatorTypesSnapshot
} from '../../types/navigatorTypes';
import { openMarkdownSourceLocation } from '../../services/types/sourceLocation';
import {
    isGcmTaskRecord,
    resolveGcmTaskApiFromPluginApi,
    resolveGcmTaskCheckboxesApiFromPluginApi,
    resolveGcmTaskLinesApiFromPluginApi,
    type GcmTaskApiLike,
    type GcmTaskCheckboxesApiLike,
    type GcmTaskLinesApiLike,
    type GcmTaskMenuLike,
    type GcmTaskMutationResultLike,
    type GcmTaskRecordLike
} from './gcmTaskApi';

export const GCM_ENTITY_INDEX_API_VERSION = 3;

const EMPTY_DESCRIPTORS = Object.freeze([]) as readonly TpsNavigatorTypeDescriptor[];
const EMPTY_RECORDS_BY_TYPE = new Map<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>();
const EMPTY_TASKS_BY_LOCATOR = new Map<string, GcmTaskRecordLike>();
export const GCM_TYPE_TASK_QUERY_PATHS_PER_BATCH = 64;
export const GCM_TYPE_TASK_QUERY_CONCURRENCY = 4;
export const GCM_TYPE_TASK_CACHE_MAX_PATHS = 2_048;
const GCM_TYPE_TASK_METADATA_MAX_PATHS = GCM_TYPE_TASK_CACHE_MAX_PATHS * 2;

interface TaskHydrationCacheEntry {
    readonly fingerprint: string;
    readonly tasks: readonly GcmTaskRecordLike[];
}

interface TaskHydrationRequest {
    readonly path: string;
    readonly fingerprint: string;
    readonly generation: number;
}

export type GcmEntityIndexEntityType = 'note' | 'block';
export type GcmEntityIndexLineKind = 'task' | 'bullet' | 'heading';

export interface GcmEntityIndexRecordLike {
    readonly id: string;
    readonly path: string;
    readonly name: string;
    readonly displayName: string;
    readonly basename: string;
    readonly dimensions: Readonly<Record<string, readonly string[]>>;
    /** Optional raw inline fields, published only for block-backed records. */
    readonly lineProperties?: Readonly<Record<string, readonly string[]>>;
    readonly sourcePath: string;
    readonly entityType: GcmEntityIndexEntityType;
    readonly subpath: string;
    readonly blockId: string;
    readonly lineKind?: GcmEntityIndexLineKind;
    /** One-based source line supplied by GCM. */
    readonly lineNumber?: number;
    readonly referenceState: 'ready' | 'provisional';
    readonly locatorKey: string;
    readonly referenceTarget: string;
}

export interface GcmEntityIndexDimensionPredicateLike {
    anyOf?: string | readonly string[];
    allOf?: string | readonly string[];
    noneOf?: string | readonly string[];
}

export type GcmEntityIndexFilterLike = Readonly<
    Record<string, string | readonly string[] | GcmEntityIndexDimensionPredicateLike | null | undefined>
>;

export interface GcmEntityIndexQueryLike {
    allOf?: GcmEntityIndexFilterLike;
    anyOf?: GcmEntityIndexFilterLike;
    noneOf?: GcmEntityIndexFilterLike;
    dimensions?: GcmEntityIndexFilterLike;
    search?: string;
    entityTypes?: GcmEntityIndexEntityType | readonly GcmEntityIndexEntityType[];
    lineKinds?: GcmEntityIndexLineKind | readonly GcmEntityIndexLineKind[];
    limit?: number;
}

export interface GcmEntityIndexApiLike {
    readonly version: 3;
    queryAsync(query?: GcmEntityIndexQueryLike): Promise<readonly unknown[]>;
    ensureReady(): Promise<void>;
    getByLocator(locator: string): unknown;
    getRevision(): number;
    onChanged(listener: (revision: number) => void): () => void;
}

export type GcmEntityIndexIssueCode =
    'gcm-unavailable' | 'gcm-incompatible' | 'entity-index-incomplete' | 'entity-index-error' | 'invalid-type';

export interface GcmEntityIndexIssue {
    readonly code: GcmEntityIndexIssueCode;
    readonly message: string;
    readonly failedPaths?: readonly string[];
    readonly cause?: unknown;
}

export interface GcmEntityTypeIndexSnapshot extends TpsNavigatorTypesSnapshot {
    readonly issue?: GcmEntityIndexIssue;
}

export type GcmEntityTypeQueryResult =
    | {
          readonly ok: true;
          readonly typeId: TpsNavigatorTypeId;
          readonly records: readonly TpsNavigatorTypeRecord[];
          readonly revision: number;
      }
    | {
          readonly ok: false;
          readonly typeId: TpsNavigatorTypeId;
          readonly issue: GcmEntityIndexIssue;
      };

export type GcmEntityActivationFailureReason =
    | 'gcm-unavailable'
    | 'invalid-record'
    | 'stale-locator'
    | 'missing-file'
    | 'workspace-unavailable'
    | 'editor-unavailable'
    | 'open-failed';

export type GcmEntityActivationResult =
    | {
          readonly ok: true;
          readonly sourcePath: string;
          /** One-based source line, omitted for note-backed entities. */
          readonly lineNumber?: number;
      }
    | {
          readonly ok: false;
          readonly reason: GcmEntityActivationFailureReason;
          readonly error?: unknown;
      };

export type GcmEntityIndexRevisionListener = (revision: number) => void;

export type GcmEntityTaskMutationResult =
    | { readonly ok: true }
    | {
          readonly ok: false;
          readonly reason: 'invalid-record' | 'gcm-unavailable' | 'stale-locator' | 'missing-file' | 'task-unavailable' | 'mutation-failed';
          readonly error?: unknown;
      };

export interface GcmApiChangedPayloadLike {
    readonly source: 'tps-global-context-menu';
    readonly sourcePluginId: string;
    readonly available: boolean;
    readonly api: unknown;
    readonly entityIndexVersion?: number | null;
}

interface WorkspaceLeafLike {
    openFile(file: TFile, options?: { state?: { mode?: string }; active?: boolean }): Promise<void>;
}

interface WorkspaceLike {
    getLeaf(newLeaf?: boolean): WorkspaceLeafLike;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function isCallable(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === 'function';
}

export function isGcmEntityIndexApiLike(value: unknown): value is GcmEntityIndexApiLike {
    if (!isRecord(value) || value.version !== GCM_ENTITY_INDEX_API_VERSION) {
        return false;
    }
    return (
        isCallable(value.queryAsync) &&
        isCallable(value.ensureReady) &&
        isCallable(value.getByLocator) &&
        isCallable(value.getRevision) &&
        isCallable(value.onChanged)
    );
}

function isGcmApiChangedPayload(value: unknown): value is GcmApiChangedPayloadLike {
    return (
        isRecord(value) &&
        value.source === 'tps-global-context-menu' &&
        value.sourcePluginId === TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID &&
        typeof value.available === 'boolean' &&
        (value.api === null || isRecord(value.api))
    );
}

/** Resolves only the exact Entity Index v3 API from GCM's public change-event payload. */
export function resolveGcmEntityIndexApi(payload: unknown): GcmEntityIndexApiLike | null {
    if (!isGcmApiChangedPayload(payload) || payload.available !== true || !isRecord(payload.api)) {
        return null;
    }
    return isGcmEntityIndexApiLike(payload.api.entityIndex) ? payload.api.entityIndex : null;
}

function isLineKind(value: unknown): value is GcmEntityIndexLineKind {
    return value === 'task' || value === 'bullet' || value === 'heading';
}

function isStringArray(value: unknown): value is readonly string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isDimensions(value: unknown): value is Readonly<Record<string, readonly string[]>> {
    return isRecord(value) && Object.values(value).every(isStringArray);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value) || Array.isArray(value)) {
        return false;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function isLineProperties(value: unknown): value is Readonly<Record<string, readonly string[]>> {
    return isPlainRecord(value) && Object.values(value).every(isStringArray);
}

export function isGcmEntityIndexRecord(value: unknown): value is GcmEntityIndexRecordLike {
    if (!isRecord(value)) {
        return false;
    }
    const entityType = value.entityType;
    const lineNumber = value.lineNumber;
    if (
        typeof value.id !== 'string' ||
        typeof value.path !== 'string' ||
        typeof value.name !== 'string' ||
        typeof value.displayName !== 'string' ||
        typeof value.basename !== 'string' ||
        !isDimensions(value.dimensions) ||
        (value.lineProperties !== undefined && !isLineProperties(value.lineProperties)) ||
        typeof value.sourcePath !== 'string' ||
        !value.sourcePath.trim() ||
        (entityType !== 'note' && entityType !== 'block') ||
        typeof value.subpath !== 'string' ||
        typeof value.blockId !== 'string' ||
        (value.referenceState !== 'ready' && value.referenceState !== 'provisional') ||
        typeof value.locatorKey !== 'string' ||
        !value.locatorKey.trim() ||
        typeof value.referenceTarget !== 'string'
    ) {
        return false;
    }
    if (value.lineKind !== undefined && !isLineKind(value.lineKind)) {
        return false;
    }
    if (lineNumber !== undefined && (!Number.isSafeInteger(lineNumber) || Number(lineNumber) < 1)) {
        return false;
    }
    if (entityType === 'block' && (!isLineKind(value.lineKind) || !Number.isSafeInteger(lineNumber) || Number(lineNumber) < 1)) {
        return false;
    }
    if (entityType !== 'block' && value.lineProperties !== undefined) {
        return false;
    }
    return true;
}

function getStructuralTypeId(record: GcmEntityIndexRecordLike): TpsNavigatorTypeId | null {
    if (record.lineKind === 'task') {
        return TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES;
    }
    if (record.lineKind === 'bullet') {
        return TPS_NAVIGATOR_TYPE_IDS.BULLETS;
    }
    if (record.lineKind === 'heading') {
        return TPS_NAVIGATOR_TYPE_IDS.HEADINGS;
    }
    return null;
}

function matchesType(record: GcmEntityIndexRecordLike, typeId: TpsNavigatorTypeId): boolean {
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.NOTES) {
        return record.entityType === 'note';
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES) {
        return record.entityType === 'block' && record.lineKind === 'task';
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.BULLETS) {
        return record.entityType === 'block' && record.lineKind === 'bullet';
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.HEADINGS) {
        return record.entityType === 'block' && record.lineKind === 'heading';
    }
    return false;
}

function copyTaskFields(fields: unknown): Readonly<Record<string, string>> | undefined {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        return undefined;
    }

    const copy: Record<string, string> = Object.create(null) as Record<string, string>;
    Object.keys(fields).forEach(key => {
        const value = (fields as Record<string, unknown>)[key];
        if (typeof value === 'string') {
            copy[key] = value;
        }
    });
    return Object.freeze(copy);
}

function copyLineProperties(
    properties: Readonly<Record<string, readonly string[]>> | undefined
): Readonly<Record<string, readonly string[]>> | undefined {
    if (!properties) {
        return undefined;
    }

    const copy: Record<string, readonly string[]> = Object.create(null) as Record<string, readonly string[]>;
    Object.entries(properties).forEach(([key, values]) => {
        copy[key] = Object.freeze([...values]);
    });
    return Object.keys(copy).length > 0 ? Object.freeze(copy) : undefined;
}

function toNavigatorRecord(
    record: GcmEntityIndexRecordLike,
    typeId: TpsNavigatorTypeId,
    task: GcmTaskRecordLike | undefined,
    capabilities: { canMutateCheckbox: boolean; hasContextMenu: boolean }
): TpsNavigatorTypeRecord {
    const label = record.displayName.trim() || record.name.trim() || record.basename.trim() || record.sourcePath;
    const taskFields = copyTaskFields(task?.fields);
    const properties = copyLineProperties(record.lineProperties);
    return Object.freeze({
        id: record.id,
        typeId,
        label,
        sourcePath: record.sourcePath,
        entityType: record.entityType,
        ...(record.lineKind ? { lineKind: record.lineKind } : {}),
        ...(record.lineNumber !== undefined ? { lineNumber: record.lineNumber } : {}),
        locatorKey: record.locatorKey,
        referenceTarget: record.referenceTarget,
        ...(properties ? { properties } : {}),
        ...(task
            ? {
                  task: Object.freeze({
                      lineNumber: task.lineNumber,
                      rawLine: task.rawLine,
                      title: task.title,
                      checkbox: task.checkbox,
                      marker: task.marker,
                      status: task.status,
                      isComplete: task.isComplete,
                      tags: Object.freeze([...task.tags]),
                      ...(taskFields !== undefined ? { fields: taskFields } : {}),
                      canMutateCheckbox: capabilities.canMutateCheckbox,
                      hasContextMenu: capabilities.hasContextMenu
                  }),
                  checked: task.isComplete
              }
            : {})
    });
}

function compareNavigatorRecords(left: TpsNavigatorTypeRecord, right: TpsNavigatorTypeRecord): number {
    return (
        left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }) ||
        left.sourcePath.localeCompare(right.sourcePath, undefined, { sensitivity: 'base' }) ||
        (left.lineNumber ?? 0) - (right.lineNumber ?? 0) ||
        left.id.localeCompare(right.id)
    );
}

function asRecordArray(value: readonly unknown[]): readonly GcmEntityIndexRecordLike[] {
    return Object.freeze(value.filter(isGcmEntityIndexRecord));
}

function safeRevision(api: GcmEntityIndexApiLike): number {
    const revision = api.getRevision();
    return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

function extractFailedPaths(error: unknown): readonly string[] {
    if (!isRecord(error) || !Array.isArray(error.failedPaths)) {
        return Object.freeze([]);
    }
    return Object.freeze(
        [
            ...new Set(
                error.failedPaths
                    .filter((path): path is string => typeof path === 'string' && Boolean(path.trim()))
                    .map(path => path.trim())
            )
        ].sort()
    );
}

function issueFromError(error: unknown): GcmEntityIndexIssue {
    if (isRecord(error) && error.code === 'entity-index-incomplete') {
        const failedPaths = extractFailedPaths(error);
        return {
            code: 'entity-index-incomplete',
            message:
                failedPaths.length > 0
                    ? `The entity index could not read ${failedPaths.length} Markdown source${failedPaths.length === 1 ? '' : 's'}.`
                    : 'The entity index is incomplete.',
            failedPaths,
            cause: error
        };
    }
    return {
        code: 'entity-index-error',
        message: 'The entity index could not be loaded.',
        cause: error
    };
}

function unavailableSnapshot(issue: GcmEntityIndexIssue): GcmEntityTypeIndexSnapshot {
    return {
        availability: issue.code === 'gcm-unavailable' || issue.code === 'gcm-incompatible' ? 'unavailable' : 'error',
        descriptors: EMPTY_DESCRIPTORS,
        recordsByType: EMPTY_RECORDS_BY_TYPE,
        revision: 0,
        message: issue.message,
        issue
    };
}

function buildSnapshot(
    records: readonly GcmEntityIndexRecordLike[],
    revision: number,
    tasksByLocator: ReadonlyMap<string, GcmTaskRecordLike> = EMPTY_TASKS_BY_LOCATOR,
    capabilities: { canMutateCheckbox: boolean; hasContextMenu: boolean } = {
        canMutateCheckbox: false,
        hasContextMenu: false
    }
): GcmEntityTypeIndexSnapshot {
    const descriptorDefinitions = TPS_NAVIGATOR_GCM_LINE_TYPES;
    const mutableRecords = new Map<TpsNavigatorTypeId, TpsNavigatorTypeRecord[]>();
    for (const descriptor of descriptorDefinitions) {
        mutableRecords.set(descriptor.id, []);
    }

    for (const record of records) {
        const structuralType = getStructuralTypeId(record);
        if (structuralType) {
            mutableRecords
                .get(structuralType)
                ?.push(toNavigatorRecord(record, structuralType, tasksByLocator.get(record.locatorKey), capabilities));
        }
    }

    const recordsByType = new Map<TpsNavigatorTypeId, readonly TpsNavigatorTypeRecord[]>();
    const descriptors = descriptorDefinitions.map(definition => {
        const typeRecords = Object.freeze([...(mutableRecords.get(definition.id) ?? [])].sort(compareNavigatorRecords));
        recordsByType.set(definition.id, typeRecords);
        return Object.freeze({ ...definition, count: typeRecords.length });
    });
    return {
        availability: 'ready',
        descriptors: Object.freeze(descriptors),
        recordsByType,
        revision
    };
}

function queryForType(typeId: TpsNavigatorTypeId): GcmEntityIndexQueryLike | null {
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.NOTES) {
        return { entityTypes: 'note' };
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.CHECKBOXES) {
        return { entityTypes: 'block', lineKinds: 'task' };
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.BULLETS) {
        return { entityTypes: 'block', lineKinds: 'bullet' };
    }
    if (typeId === TPS_NAVIGATOR_TYPE_IDS.HEADINGS) {
        return { entityTypes: 'block', lineKinds: 'heading' };
    }
    return null;
}

function isMarkdownFile(file: TFile | null): file is TFile {
    return Boolean(file && typeof file.path === 'string' && file.path.trim() && file.extension.toLocaleLowerCase() === 'md');
}

/**
 * Owns the optional v3 API registration/subscription lifecycle. Call dispose()
 * when its navigation consumer unloads.
 */
export class GcmEntityTypeIndexAdapter {
    private api: GcmEntityIndexApiLike | null = null;
    private taskApi: GcmTaskApiLike | null = null;
    private taskCheckboxesApi: GcmTaskCheckboxesApiLike | null = null;
    private taskLinesApi: GcmTaskLinesApiLike | null = null;
    private connectionIssue: GcmEntityIndexIssue | null = null;
    private unsubscribeRevision: (() => void) | null = null;
    private readonly revisionListeners = new Set<GcmEntityIndexRevisionListener>();
    private readonly taskHydrationCache = new Map<string, TaskHydrationCacheEntry>();
    private readonly taskPathGenerations = new Map<string, number>();
    private readonly dirtyTaskPaths = new Set<string>();
    private taskHydrationEpoch = 0;

    constructor(private readonly app: App) {}

    /** Accepts one public GCM API change payload and ignores unrelated workspace events. */
    acceptApiPayload(payload: unknown): boolean {
        if (!isGcmApiChangedPayload(payload)) {
            return false;
        }
        if (!payload.available) {
            this.releaseApi();
            this.connectionIssue = {
                code: 'gcm-unavailable',
                message: 'TPS Global Context Menu is unavailable or disabled.'
            };
            return true;
        }
        const api = resolveGcmEntityIndexApi(payload);
        if (!api) {
            this.releaseApi();
            this.connectionIssue = {
                code: 'gcm-incompatible',
                message: `TPS Global Context Menu entity index API v${GCM_ENTITY_INDEX_API_VERSION} is required.`
            };
            return true;
        }
        this.connect(api, {
            taskApi: resolveGcmTaskApiFromPluginApi(payload.api),
            taskCheckboxesApi: resolveGcmTaskCheckboxesApiFromPluginApi(payload.api),
            taskLinesApi: resolveGcmTaskLinesApiFromPluginApi(payload.api)
        });
        return true;
    }

    /** Swaps registrations safely when GCM publishes a new API instance. */
    connect(
        candidate: unknown,
        capabilities: {
            taskApi?: GcmTaskApiLike | null;
            taskCheckboxesApi?: GcmTaskCheckboxesApiLike | null;
            taskLinesApi?: GcmTaskLinesApiLike | null;
        } = {}
    ): boolean {
        if (!isGcmEntityIndexApiLike(candidate)) {
            this.releaseApi();
            this.connectionIssue = {
                code: 'gcm-incompatible',
                message: `TPS Global Context Menu entity index API v${GCM_ENTITY_INDEX_API_VERSION} is required.`
            };
            return false;
        }
        const api = candidate;
        if (this.api === api) {
            this.resetTaskHydrationCache();
            this.taskApi = capabilities.taskApi ?? null;
            this.taskCheckboxesApi = capabilities.taskCheckboxesApi ?? null;
            this.taskLinesApi = capabilities.taskLinesApi ?? null;
            return true;
        }

        this.releaseApi();
        let unsubscribeRevision: (() => void) | null = null;
        try {
            unsubscribeRevision = api.onChanged(revision => {
                const nextRevision = Number.isSafeInteger(revision) && revision >= 0 ? revision : safeRevision(api);
                for (const listener of [...this.revisionListeners]) {
                    try {
                        listener(nextRevision);
                    } catch {
                        // One consumer must not break GCM's global revision dispatch.
                    }
                }
            });
            if (typeof unsubscribeRevision !== 'function') {
                throw new Error('GCM entity index onChanged() did not return a disposer.');
            }
        } catch (error) {
            try {
                unsubscribeRevision?.();
            } catch {
                // Best-effort cleanup of an incomplete foreign API connection.
            }
            this.connectionIssue = {
                code: 'gcm-incompatible',
                message: 'TPS Global Context Menu entity index v3 could not be initialized.',
                cause: error
            };
            return false;
        }

        this.api = api;
        this.taskApi = capabilities.taskApi ?? null;
        this.taskCheckboxesApi = capabilities.taskCheckboxesApi ?? null;
        this.taskLinesApi = capabilities.taskLinesApi ?? null;
        this.unsubscribeRevision = unsubscribeRevision;
        this.connectionIssue = null;
        return true;
    }

    subscribe(listener: GcmEntityIndexRevisionListener): () => void {
        this.revisionListeners.add(listener);
        return () => {
            this.revisionListeners.delete(listener);
        };
    }

    getRevision(): number | null {
        if (!this.api) {
            return null;
        }
        try {
            return safeRevision(this.api);
        } catch {
            return null;
        }
    }

    /** Invalidates cached task hydration for exact source paths, or all paths when omitted. */
    invalidateTaskPaths(paths?: readonly string[]): void {
        const normalizedPaths = paths ? [...new Set(paths.map(path => normalizePath(String(path ?? '').trim())).filter(Boolean))] : [];
        if (normalizedPaths.length === 0) {
            this.resetTaskHydrationCache();
            return;
        }

        for (const path of normalizedPaths) {
            if (!this.taskPathGenerations.has(path) && this.taskPathGenerations.size >= GCM_TYPE_TASK_METADATA_MAX_PATHS) {
                this.resetTaskHydrationCache();
            }
            this.taskHydrationCache.delete(path);
            this.dirtyTaskPaths.add(path);
            this.taskPathGenerations.set(path, (this.taskPathGenerations.get(path) ?? 0) + 1);
        }
    }

    async loadSnapshot(signal?: AbortSignal): Promise<GcmEntityTypeIndexSnapshot> {
        if (!this.api) {
            return unavailableSnapshot(
                this.connectionIssue ?? {
                    code: 'gcm-unavailable',
                    message: 'TPS Global Context Menu entity index is unavailable.'
                }
            );
        }
        const api = this.api;
        try {
            await api.ensureReady();
            if (signal?.aborted || this.api !== api) {
                return unavailableSnapshot({ code: 'gcm-unavailable', message: 'The Types refresh was cancelled.' });
            }
            const records = asRecordArray(await api.queryAsync({ entityTypes: 'block', lineKinds: ['task', 'bullet', 'heading'] }));
            if (signal?.aborted || this.api !== api) {
                return unavailableSnapshot({ code: 'gcm-unavailable', message: 'The Types refresh was cancelled.' });
            }
            const tasksByLocator = await this.hydrateTasks(records, signal);
            if (signal?.aborted || this.api !== api) {
                return unavailableSnapshot({ code: 'gcm-unavailable', message: 'The Types refresh was cancelled.' });
            }
            return buildSnapshot(records, safeRevision(api), tasksByLocator, this.getTaskCapabilities());
        } catch (error) {
            return unavailableSnapshot(issueFromError(error));
        }
    }

    async queryType(typeId: TpsNavigatorTypeId): Promise<GcmEntityTypeQueryResult> {
        const query = isTpsNavigatorTypeId(typeId) ? queryForType(typeId) : null;
        if (!query) {
            return {
                ok: false,
                typeId,
                issue: {
                    code: 'invalid-type',
                    message: `The navigator type "${String(typeId)}" is not queryable.`
                }
            };
        }
        if (!this.api) {
            return {
                ok: false,
                typeId,
                issue:
                    this.connectionIssue ??
                    ({
                        code: 'gcm-unavailable',
                        message: 'TPS Global Context Menu entity index is unavailable.'
                    } satisfies GcmEntityIndexIssue)
            };
        }
        const api = this.api;
        try {
            await api.ensureReady();
            const matchingRecords = asRecordArray(await api.queryAsync(query)).filter(record => matchesType(record, typeId));
            const tasksByLocator = await this.hydrateTasks(matchingRecords);
            const records = matchingRecords
                .map(record => toNavigatorRecord(record, typeId, tasksByLocator.get(record.locatorKey), this.getTaskCapabilities()))
                .sort(compareNavigatorRecords);
            return {
                ok: true,
                typeId,
                records: Object.freeze(records),
                revision: safeRevision(api)
            };
        } catch (error) {
            return { ok: false, typeId, issue: issueFromError(error) };
        }
    }

    /** Re-resolves the locator immediately before direct Obsidian activation. */
    async activate(record: TpsNavigatorTypeRecord): Promise<GcmEntityActivationResult> {
        if (
            !record ||
            !isTpsNavigatorTypeId(record.typeId) ||
            typeof record.locatorKey !== 'string' ||
            !record.locatorKey.trim() ||
            (record.entityType !== 'note' && record.entityType !== 'block')
        ) {
            return { ok: false, reason: 'invalid-record' };
        }
        if (!this.api) {
            return { ok: false, reason: 'gcm-unavailable' };
        }

        let current: unknown;
        try {
            current = this.api.getByLocator(record.locatorKey);
        } catch (error) {
            return { ok: false, reason: 'stale-locator', error };
        }
        if (!isGcmEntityIndexRecord(current) || current.entityType !== record.entityType || !matchesType(current, record.typeId)) {
            return { ok: false, reason: 'stale-locator' };
        }

        const sourcePath = current.sourcePath.replace(/\\/gu, '/');
        const file = this.app.vault.getFileByPath(sourcePath);
        if (!isMarkdownFile(file)) {
            return { ok: false, reason: 'missing-file' };
        }

        if (current.entityType === 'note') {
            const workspace = (this.app as unknown as { workspace?: WorkspaceLike }).workspace;
            if (!workspace || typeof workspace.getLeaf !== 'function') {
                return { ok: false, reason: 'workspace-unavailable' };
            }
            try {
                await workspace.getLeaf(false).openFile(file, { active: true });
            } catch (error) {
                return { ok: false, reason: 'open-failed', error };
            }
            return { ok: true, sourcePath };
        }
        const lineNumber = current.lineNumber;
        if (!Number.isSafeInteger(lineNumber) || Number(lineNumber) < 1) {
            return { ok: false, reason: 'stale-locator' };
        }
        return openMarkdownSourceLocation(this.app, file, Number(lineNumber));
    }

    /** Re-resolves the entity and current task before changing its checkbox. */
    async setTaskCheckbox(record: TpsNavigatorTypeRecord, checked: boolean): Promise<GcmEntityTaskMutationResult> {
        if (!record?.task || record.lineKind !== 'task' || !isTpsNavigatorTypeId(record.typeId)) {
            return { ok: false, reason: 'invalid-record' };
        }
        const entityApi = this.api;
        const taskApi = this.taskApi;
        const taskCheckboxesApi = this.taskCheckboxesApi;
        const canSetCompletion = taskApi?.supportsTaskLineMutation === true && typeof taskApi.setCompletion === 'function';
        const canSetMappedCheckbox =
            taskApi?.supportsTaskLineMutation === true && typeof taskApi.setCheckbox === 'function' && taskCheckboxesApi !== null;
        if (!entityApi || !taskApi || (!canSetCompletion && !canSetMappedCheckbox)) {
            return { ok: false, reason: 'gcm-unavailable' };
        }

        const current = this.resolveCurrentTaskEntity(record, entityApi);
        if (!current) {
            return { ok: false, reason: 'stale-locator' };
        }
        const file = this.app.vault.getFileByPath(normalizePath(current.sourcePath));
        if (!isMarkdownFile(file)) {
            return { ok: false, reason: 'missing-file' };
        }

        try {
            const currentTasks = await taskApi.list({
                paths: [file.path],
                includeCompleted: true,
                maxResults: Number.MAX_SAFE_INTEGER
            });
            const currentLineIndex = Number(current.lineNumber) - 1;
            const task = currentTasks.find(
                candidate =>
                    isGcmTaskRecord(candidate) && normalizePath(candidate.path) === file.path && candidate.lineNumber === currentLineIndex
            );
            if (!task) {
                return { ok: false, reason: 'task-unavailable' };
            }

            // An API swap or locator movement during the async read must not write.
            if (this.api !== entityApi || this.taskApi !== taskApi || this.taskCheckboxesApi !== taskCheckboxesApi) {
                return { ok: false, reason: 'gcm-unavailable' };
            }
            const latest = this.resolveCurrentTaskEntity(record, entityApi);
            if (!latest || normalizePath(latest.sourcePath) !== file.path || Number(latest.lineNumber) - 1 !== currentLineIndex) {
                return { ok: false, reason: 'stale-locator' };
            }

            let result: GcmTaskMutationResultLike;
            if (canSetCompletion && taskApi.setCompletion) {
                result = await taskApi.setCompletion(task, checked);
            } else if (taskApi.setCheckbox && taskCheckboxesApi) {
                result = await taskApi.setCheckbox(task, taskCheckboxesApi.stateForStatus(checked ? 'complete' : 'todo'));
            } else {
                return { ok: false, reason: 'gcm-unavailable' };
            }
            if (!result || result.ok !== true) {
                return { ok: false, reason: 'mutation-failed', error: result?.error };
            }
            let effectiveTask = isGcmTaskRecord(result.task) ? result.task : null;
            if (!effectiveTask && typeof taskApi.get === 'function') {
                effectiveTask = await taskApi.get(task);
            }
            if (!effectiveTask) {
                const verifiedTasks = await taskApi.list({
                    paths: [file.path],
                    includeCompleted: true,
                    maxResults: Number.MAX_SAFE_INTEGER
                });
                effectiveTask =
                    verifiedTasks.find(
                        candidate =>
                            isGcmTaskRecord(candidate) &&
                            normalizePath(candidate.path) === file.path &&
                            candidate.lineNumber === currentLineIndex
                    ) ?? null;
            }
            if (!effectiveTask || effectiveTask.isComplete !== checked) {
                return {
                    ok: false,
                    reason: 'mutation-failed',
                    error: 'TPS Global Context Menu returned an unexpected task completion state.'
                };
            }
            return { ok: true };
        } catch (error) {
            return { ok: false, reason: 'mutation-failed', error };
        }
    }

    /** Adds GCM's canonical task actions through Navigator's restricted menu facade. */
    addTaskContextMenuItems(menu: GcmTaskMenuLike, record: TpsNavigatorTypeRecord): boolean {
        if (!record?.task || record.lineKind !== 'task' || !isTpsNavigatorTypeId(record.typeId)) {
            return false;
        }
        const entityApi = this.api;
        const taskLinesApi = this.taskLinesApi;
        if (
            !entityApi ||
            this.taskApi?.supportsTaskLineMutation !== true ||
            taskLinesApi?.supportsTaskLineMutation !== true ||
            typeof menu?.addItem !== 'function' ||
            typeof menu?.addSeparator !== 'function'
        ) {
            return false;
        }
        const current = this.resolveCurrentTaskEntity(record, entityApi);
        if (
            !current ||
            normalizePath(current.sourcePath) !== normalizePath(record.sourcePath) ||
            Number(current.lineNumber) - 1 !== record.task.lineNumber
        ) {
            return false;
        }
        const file = this.app.vault.getFileByPath(normalizePath(current.sourcePath));
        if (!isMarkdownFile(file)) {
            return false;
        }

        try {
            taskLinesApi.addMenuItems(
                menu,
                {
                    file,
                    lineNumber: record.task.lineNumber + 1,
                    lineIndex: record.task.lineNumber,
                    rawLine: record.task.rawLine,
                    title: record.task.title,
                    checkboxToken: record.task.checkbox,
                    isCalendarTask: false,
                    calendarAllDay: false
                },
                { includeTags: true }
            );
            return true;
        } catch (error) {
            console.warn('[TPS Notebook Navigator] GCM task context menu could not be built', {
                sourcePath: record.sourcePath,
                lineNumber: record.lineNumber,
                error
            });
            return false;
        }
    }

    dispose(): void {
        this.releaseApi();
        this.revisionListeners.clear();
        this.connectionIssue = null;
    }

    private releaseApi(): void {
        const unsubscribeRevision = this.unsubscribeRevision;
        this.api = null;
        this.taskApi = null;
        this.taskCheckboxesApi = null;
        this.taskLinesApi = null;
        this.resetTaskHydrationCache();
        this.unsubscribeRevision = null;
        try {
            unsubscribeRevision?.();
        } catch {
            // Best-effort cleanup of a foreign optional API.
        }
    }

    private getTaskCapabilities(): { canMutateCheckbox: boolean; hasContextMenu: boolean } {
        return {
            canMutateCheckbox:
                this.taskApi?.supportsTaskLineMutation === true &&
                (typeof this.taskApi.setCompletion === 'function' ||
                    (typeof this.taskApi.setCheckbox === 'function' && this.taskCheckboxesApi !== null)),
            hasContextMenu: this.taskApi?.supportsTaskLineMutation === true && this.taskLinesApi?.supportsTaskLineMutation === true
        };
    }

    private async hydrateTasks(
        records: readonly GcmEntityIndexRecordLike[],
        signal?: AbortSignal
    ): Promise<ReadonlyMap<string, GcmTaskRecordLike>> {
        const taskApi = this.taskApi;
        const taskEntities = records.filter(
            record => record.entityType === 'block' && record.lineKind === 'task' && Number.isSafeInteger(record.lineNumber)
        );
        if (!taskApi || taskEntities.length === 0 || signal?.aborted) {
            return EMPTY_TASKS_BY_LOCATOR;
        }

        const paths = [...new Set(taskEntities.map(record => normalizePath(record.sourcePath)))];
        const tasksByPath = new Map<string, readonly GcmTaskRecordLike[]>();
        const requests: TaskHydrationRequest[] = [];
        const requestEpoch = this.taskHydrationEpoch;
        for (const path of paths) {
            if (signal?.aborted) {
                return EMPTY_TASKS_BY_LOCATOR;
            }
            const fingerprint = this.getTaskSourceFingerprint(path);
            const cached = fingerprint ? this.readCachedTaskPath(path, fingerprint) : null;
            if (cached) {
                tasksByPath.set(path, cached);
                continue;
            }
            if (fingerprint) {
                requests.push({ path, fingerprint, generation: this.taskPathGenerations.get(path) ?? 0 });
            }
        }

        let failedPathCount = 0;
        const batches: TaskHydrationRequest[][] = [];
        for (let offset = 0; offset < requests.length; offset += GCM_TYPE_TASK_QUERY_PATHS_PER_BATCH) {
            batches.push(requests.slice(offset, offset + GCM_TYPE_TASK_QUERY_PATHS_PER_BATCH));
        }
        for (let offset = 0; offset < batches.length && !signal?.aborted; offset += GCM_TYPE_TASK_QUERY_CONCURRENCY) {
            const concurrentBatches = batches.slice(offset, offset + GCM_TYPE_TASK_QUERY_CONCURRENCY);
            const settled = await Promise.allSettled(
                concurrentBatches.map(async batch => {
                    const tasks = await taskApi.list({
                        paths: batch.map(request => request.path),
                        includeCompleted: true,
                        maxResults: Number.MAX_SAFE_INTEGER
                    });
                    if (!Array.isArray(tasks)) {
                        throw new Error('GCM task list returned an invalid result.');
                    }
                    return { batch, tasks };
                })
            );
            if (signal?.aborted || this.taskApi !== taskApi || this.taskHydrationEpoch !== requestEpoch) {
                return EMPTY_TASKS_BY_LOCATOR;
            }
            settled.forEach((result, resultIndex) => {
                if (result.status === 'rejected') {
                    const failedBatch = concurrentBatches[resultIndex];
                    failedPathCount += failedBatch?.length ?? 0;
                    return;
                }
                if (this.taskApi !== taskApi || this.taskHydrationEpoch !== requestEpoch) {
                    return;
                }
                const requestedPaths = new Set(result.value.batch.map(request => request.path));
                const tasksByResultPath = new Map<string, GcmTaskRecordLike[]>();
                result.value.tasks.filter(isGcmTaskRecord).forEach(task => {
                    const taskPath = normalizePath(task.path);
                    if (!requestedPaths.has(taskPath)) {
                        return;
                    }
                    const pathTasks = tasksByResultPath.get(taskPath) ?? [];
                    pathTasks.push(task);
                    tasksByResultPath.set(taskPath, pathTasks);
                });
                result.value.batch.forEach(request => {
                    if (
                        (this.taskPathGenerations.get(request.path) ?? 0) !== request.generation ||
                        this.getTaskSourceFingerprint(request.path) !== request.fingerprint
                    ) {
                        return;
                    }
                    const pathTasks = Object.freeze(
                        [...(tasksByResultPath.get(request.path) ?? [])].sort(
                            (left, right) => left.lineNumber - right.lineNumber || left.title.localeCompare(right.title)
                        )
                    );
                    tasksByPath.set(request.path, pathTasks);
                    this.cacheTaskPath(request.path, { fingerprint: request.fingerprint, tasks: pathTasks });
                    this.dirtyTaskPaths.delete(request.path);
                });
            });
        }
        if (failedPathCount > 0) {
            console.warn('[TPS Notebook Navigator] Some Type task states could not be hydrated', {
                failedPathCount,
                requestedPathCount: paths.length
            });
        }

        const tasksByLocator = new Map<string, GcmTaskRecordLike>();
        const tasksByLocation = new Map<string, GcmTaskRecordLike>();
        tasksByPath.forEach((tasks, path) => {
            tasks.forEach(task => tasksByLocation.set(`${path}\u0000${task.lineNumber}`, task));
        });
        taskEntities.forEach(entity => {
            const task = tasksByLocation.get(`${normalizePath(entity.sourcePath)}\u0000${Number(entity.lineNumber) - 1}`);
            if (task) {
                tasksByLocator.set(entity.locatorKey, task);
            }
        });
        return tasksByLocator;
    }

    private getTaskSourceFingerprint(path: string): string | null {
        const file = this.app.vault.getFileByPath(path);
        if (!isMarkdownFile(file)) {
            return null;
        }
        const mtime = Number(file.stat?.mtime);
        const size = Number(file.stat?.size);
        return `${Number.isFinite(mtime) ? mtime : 0}:${Number.isFinite(size) ? size : 0}`;
    }

    private readCachedTaskPath(path: string, fingerprint: string): readonly GcmTaskRecordLike[] | null {
        const entry = this.taskHydrationCache.get(path);
        if (!entry || entry.fingerprint !== fingerprint || this.dirtyTaskPaths.has(path)) {
            if (entry && entry.fingerprint !== fingerprint) {
                this.invalidateTaskPaths([path]);
            }
            return null;
        }
        this.taskHydrationCache.delete(path);
        this.taskHydrationCache.set(path, entry);
        return entry.tasks;
    }

    private cacheTaskPath(path: string, entry: TaskHydrationCacheEntry): void {
        this.taskHydrationCache.delete(path);
        this.taskHydrationCache.set(path, entry);
        while (this.taskHydrationCache.size > GCM_TYPE_TASK_CACHE_MAX_PATHS) {
            const oldestPath = this.taskHydrationCache.keys().next().value;
            if (typeof oldestPath !== 'string') {
                break;
            }
            this.taskHydrationCache.delete(oldestPath);
        }
    }

    private resetTaskHydrationCache(): void {
        this.taskHydrationEpoch += 1;
        this.taskHydrationCache.clear();
        this.taskPathGenerations.clear();
        this.dirtyTaskPaths.clear();
    }

    private resolveCurrentTaskEntity(record: TpsNavigatorTypeRecord, api: GcmEntityIndexApiLike): GcmEntityIndexRecordLike | null {
        try {
            const current = api.getByLocator(record.locatorKey);
            return isGcmEntityIndexRecord(current) &&
                current.entityType === 'block' &&
                current.lineKind === 'task' &&
                matchesType(current, record.typeId)
                ? current
                : null;
        } catch {
            return null;
        }
    }
}
