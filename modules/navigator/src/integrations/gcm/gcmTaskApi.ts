/*
 * TPS Notebook Navigator - structural adapter for the optional GCM task API.
 *
 * This file deliberately has no source or runtime import from GCM. The fork
 * remains usable when GCM is absent, disabled, outdated, or fails to load.
 */

import type { App, MenuItem, TFile } from 'obsidian';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../../constants/tpsIdentity';

export interface GcmTaskRefLike {
    path: string;
    lineNumber: number;
    rawLine: string;
    title: string;
}

export interface GcmTaskRecordLike extends GcmTaskRefLike {
    id?: string;
    checkbox: string;
    marker: string;
    status: string;
    isComplete: boolean;
    tags: string[];
    /** Parsed task-local inline fields. Optional for compatibility with earlier GCM v1 builds. */
    fields?: Readonly<Record<string, string>>;
}

export interface GcmTaskMutationResultLike {
    ok: boolean;
    changed: boolean;
    task?: GcmTaskRecordLike | null;
    error?: string;
}

export interface GcmTaskApiLike {
    readonly version: number;
    /** Explicit GCM capability; omitted/false means Navigator must not offer task-line actions. */
    readonly supportsTaskLineMutation?: boolean;
    list(filter: { paths: string[]; includeCompleted: boolean; maxResults: number }): Promise<GcmTaskRecordLike[]>;
    focus(ref: GcmTaskRefLike): Promise<boolean>;
    /** Available in current GCM v1 builds. */
    get?(ref: GcmTaskRefLike): Promise<GcmTaskRecordLike | null>;
    /** Available in current GCM v1 builds. */
    parseLine?(path: string, lineNumber: number, rawLine: string): GcmTaskRecordLike | null;
    /** Available in current GCM v1 builds; optional so older compatible builds stay display-only. */
    setCheckbox?(ref: GcmTaskRefLike, checkbox: string): Promise<GcmTaskMutationResultLike>;
    /** Canonical configured completion path in newer GCM v1 builds. */
    setCompletion?(ref: GcmTaskRefLike, completed: boolean): Promise<GcmTaskMutationResultLike>;
}

export interface GcmTaskCheckboxesApiLike {
    readonly version: number;
    stateForStatus(status: unknown): string;
}

export interface GcmItemPropertyDefinitionLike {
    id: string;
    key: string;
    label: string;
    type: string;
    listItemType?: string;
    allowInlineSet: boolean;
}

export interface GcmItemPropertiesApiLike {
    readonly version: number;
    readonly supportsTaskLineMutation?: boolean;
    listDefinitions(): readonly GcmItemPropertyDefinitionLike[];
    resolveDefinition(keyOrId: unknown): GcmItemPropertyDefinitionLike | null;
}

export interface GcmFrontmatterApiLike {
    setValues(files: TFile[], updates: Record<string, unknown>, cause?: unknown): Promise<unknown>;
    addListValues(files: TFile[], key: string, values: unknown[], cause?: unknown): Promise<unknown>;
}

export interface GcmFilePropertiesApiLike extends GcmFrontmatterApiLike {
    readonly version: number;
    isTarget(file: TFile): boolean;
}

export interface GcmNativeRecordInspectionLike {
    readonly id: string;
    readonly kind: string;
    readonly schemaVersion: number;
    readonly frontmatter: Readonly<Record<string, unknown>>;
}

export interface GcmNativeRecordsApiLike {
    readonly version: number;
    getMode(): unknown;
    inspect(frontmatter: unknown): GcmNativeRecordInspectionLike | null;
}

export interface GcmNotebookNavigatorPresentationProjectionLike {
    readonly filePath: string;
    readonly values: Readonly<Record<string, string>>;
}

/**
 * Optional transient presentation overlay supplied by GCM.
 *
 * `undefined` means the requested file has not been prepared yet, while `null`
 * means it was prepared and no generated values apply. Navigator never stores
 * projections returned by this capability in its metadata or property caches.
 */
export interface GcmNotebookNavigatorPresentationApiLike {
    readonly version: 1;
    ensure(files: readonly (TFile | string)[] | TFile | string): Promise<void>;
    get(file: TFile | string): GcmNotebookNavigatorPresentationProjectionLike | null | undefined;
    getRevision(): number;
    onChanged(listener: (revision: number) => void): () => void;
}

/** Small synchronous menu surface used instead of exposing Obsidian's Menu object. */
export interface GcmTaskMenuLike {
    addItem(callback: (item: MenuItem) => void): unknown;
    addSeparator(): unknown;
}

export interface GcmTaskLineContextLike {
    file: TFile;
    /** One-based source line. */
    lineNumber: number;
    /** Zero-based source line. */
    lineIndex: number;
    rawLine: string;
    title: string;
    checkboxToken: string;
    taskOrdinal?: number;
    isCalendarTask: boolean;
    calendarAllDay: boolean;
}

export interface GcmTaskLinesApiLike {
    readonly version: number;
    readonly supportsTaskLineMutation?: boolean;
    addMenuItems(
        menu: GcmTaskMenuLike,
        context: GcmTaskLineContextLike,
        options?: { includeTitle?: boolean; includeStatus?: boolean; includeNoteActions?: boolean; includeTags?: boolean }
    ): void;
}

interface PluginManagerLike {
    enabledPlugins?: { has(pluginId: string): boolean } | string[];
    getPlugin?(pluginId: string): unknown;
    plugins?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function isStringRecord(value: unknown): value is Record<string, string> {
    if (!isRecord(value) || Array.isArray(value)) {
        return false;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    return (prototype === Object.prototype || prototype === null) && Object.keys(value).every(key => typeof value[key] === 'string');
}

export function isGcmTaskApiLike(value: unknown): value is GcmTaskApiLike {
    if (!isRecord(value)) {
        return false;
    }
    return typeof value.version === 'number' && value.version >= 1 && typeof value.list === 'function' && typeof value.focus === 'function';
}

export function isGcmTaskLinesApiLike(value: unknown): value is GcmTaskLinesApiLike {
    return isRecord(value) && typeof value.version === 'number' && value.version >= 1 && typeof value.addMenuItems === 'function';
}

export function isGcmTaskCheckboxesApiLike(value: unknown): value is GcmTaskCheckboxesApiLike {
    return isRecord(value) && typeof value.version === 'number' && value.version >= 1 && typeof value.stateForStatus === 'function';
}

export function isGcmItemPropertiesApiLike(value: unknown): value is GcmItemPropertiesApiLike {
    return (
        isRecord(value) &&
        typeof value.version === 'number' &&
        value.version >= 1 &&
        typeof value.listDefinitions === 'function' &&
        typeof value.resolveDefinition === 'function'
    );
}

export function isGcmNativeRecordsApiLike(value: unknown): value is GcmNativeRecordsApiLike {
    return (
        isRecord(value) &&
        typeof value.version === 'number' &&
        value.version >= 2 &&
        typeof value.getMode === 'function' &&
        typeof value.inspect === 'function'
    );
}

export function isGcmNotebookNavigatorPresentationApiLike(value: unknown): value is GcmNotebookNavigatorPresentationApiLike {
    return (
        isRecord(value) &&
        value.version === 1 &&
        typeof value.ensure === 'function' &&
        typeof value.get === 'function' &&
        typeof value.getRevision === 'function' &&
        typeof value.onChanged === 'function'
    );
}

function resolveGcmPluginApi(app: App): Record<string, unknown> | null {
    const manager = (app as App & { plugins?: PluginManagerLike }).plugins;
    if (!manager || isExplicitlyDisabled(manager, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID)) return null;
    try {
        const plugin =
            manager.getPlugin?.(TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID) ?? manager.plugins?.[TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID] ?? null;
        return isRecord(plugin) && isRecord(plugin.api) ? plugin.api : null;
    } catch {
        return null;
    }
}

export function resolveGcmItemPropertiesApi(app: App): GcmItemPropertiesApiLike | null {
    const api = resolveGcmPluginApi(app);
    return api && isGcmItemPropertiesApiLike(api.itemProperties) ? api.itemProperties : null;
}

export function resolveGcmFrontmatterApi(app: App): GcmFrontmatterApiLike | null {
    const value = resolveGcmPluginApi(app)?.frontmatter;
    return isRecord(value) && typeof value.setValues === 'function' && typeof value.addListValues === 'function'
        ? (value as unknown as GcmFrontmatterApiLike)
        : null;
}

export function resolveGcmFilePropertiesApi(app: App): GcmFilePropertiesApiLike | null {
    const value = resolveGcmPluginApi(app)?.fileProperties;
    return isRecord(value) &&
        typeof value.version === 'number' &&
        value.version >= 1 &&
        typeof value.isTarget === 'function' &&
        typeof value.setValues === 'function' &&
        typeof value.addListValues === 'function'
        ? (value as unknown as GcmFilePropertiesApiLike)
        : null;
}

export function resolveGcmNativeRecordsApi(app: App): GcmNativeRecordsApiLike | null {
    const value = resolveGcmPluginApi(app)?.nativeRecords;
    return isGcmNativeRecordsApiLike(value) ? value : null;
}

export function resolveGcmNotebookNavigatorPresentationApi(app: App): GcmNotebookNavigatorPresentationApiLike | null {
    const value = resolveGcmPluginApi(app)?.notebookNavigatorPresentation;
    return isGcmNotebookNavigatorPresentationApiLike(value) ? value : null;
}

/** Resolves task capabilities from one public GCM plugin API payload. */
export function resolveGcmTaskApiFromPluginApi(value: unknown): GcmTaskApiLike | null {
    return isRecord(value) && isGcmTaskApiLike(value.tasks) ? value.tasks : null;
}

/** Resolves task-line menu capabilities from one public GCM plugin API payload. */
export function resolveGcmTaskLinesApiFromPluginApi(value: unknown): GcmTaskLinesApiLike | null {
    return isRecord(value) && isGcmTaskLinesApiLike(value.taskLines) ? value.taskLines : null;
}

/** Resolves configured task-checkbox mappings from one public GCM plugin API payload. */
export function resolveGcmTaskCheckboxesApiFromPluginApi(value: unknown): GcmTaskCheckboxesApiLike | null {
    return isRecord(value) && isGcmTaskCheckboxesApiLike(value.taskCheckboxes) ? value.taskCheckboxes : null;
}

function isExplicitlyDisabled(manager: PluginManagerLike, pluginId: string): boolean {
    const enabled = manager.enabledPlugins;
    if (!enabled) {
        return false;
    }
    if (Array.isArray(enabled)) {
        return !enabled.includes(pluginId);
    }
    return !enabled.has(pluginId);
}

export function resolveGcmTaskApi(app: App): GcmTaskApiLike | null {
    const manager = (app as App & { plugins?: PluginManagerLike }).plugins;
    if (!manager || isExplicitlyDisabled(manager, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID)) {
        return null;
    }

    let plugin: unknown = null;
    try {
        plugin = manager.getPlugin?.(TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID) ?? manager.plugins?.[TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID] ?? null;
    } catch {
        return null;
    }

    if (!isRecord(plugin) || !isRecord(plugin.api)) {
        return null;
    }
    const tasks = plugin.api.tasks;
    if (!isGcmTaskApiLike(tasks)) {
        return null;
    }

    return tasks;
}

export function resolveGcmTaskLinesApi(app: App): GcmTaskLinesApiLike | null {
    const manager = (app as App & { plugins?: PluginManagerLike }).plugins;
    if (!manager || isExplicitlyDisabled(manager, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID)) {
        return null;
    }

    let plugin: unknown = null;
    try {
        plugin = manager.getPlugin?.(TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID) ?? manager.plugins?.[TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID] ?? null;
    } catch {
        return null;
    }

    return isRecord(plugin) && isRecord(plugin.api) ? resolveGcmTaskLinesApiFromPluginApi(plugin.api) : null;
}

export function resolveGcmTaskCheckboxesApi(app: App): GcmTaskCheckboxesApiLike | null {
    const manager = (app as App & { plugins?: PluginManagerLike }).plugins;
    if (!manager || isExplicitlyDisabled(manager, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID)) {
        return null;
    }

    let plugin: unknown = null;
    try {
        plugin = manager.getPlugin?.(TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID) ?? manager.plugins?.[TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID] ?? null;
    } catch {
        return null;
    }

    return isRecord(plugin) && isRecord(plugin.api) ? resolveGcmTaskCheckboxesApiFromPluginApi(plugin.api) : null;
}

export function isGcmTaskRecord(value: unknown): value is GcmTaskRecordLike {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const task = value as Record<string, unknown>;
    return (
        typeof task.path === 'string' &&
        typeof task.lineNumber === 'number' &&
        Number.isSafeInteger(task.lineNumber) &&
        task.lineNumber >= 0 &&
        typeof task.rawLine === 'string' &&
        typeof task.title === 'string' &&
        typeof task.checkbox === 'string' &&
        typeof task.marker === 'string' &&
        typeof task.status === 'string' &&
        typeof task.isComplete === 'boolean' &&
        Array.isArray(task.tags) &&
        (task.fields === undefined || isStringRecord(task.fields))
    );
}
