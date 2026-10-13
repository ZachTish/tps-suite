import { TFile, TFolder, type App, type TAbstractFile } from 'obsidian';
import type { NavigatorTypesStore } from '../../api/modules/TypesAPI';
import { TPS_NAVIGATOR_TYPE_IDS, type TpsNavigatorTypesSnapshot } from '../../types/navigatorTypes';
import { hasExcalidrawFrontmatterFlagValue, isExcalidrawFile } from '../../utils/fileNameUtils';
import { buildVaultFileTypesSnapshot, updateVaultFileTypesSnapshot } from './vaultFileTypes';

/** File metadata only. No entity provider, task index, or file-body reads. */
export class FileTypesStore implements NavigatorTypesStore {
    private listeners = new Set<() => void>();
    private events: (() => void)[] = [];
    private timer: ReturnType<typeof setTimeout> | null = null;
    // Only invalidations awaiting the existing event batch, not another file index.
    private pendingPaths = new Map<string, boolean>();
    private enabled = false;
    private revision = 0;
    private snapshot: TpsNavigatorTypesSnapshot = { availability: 'loading', descriptors: [], recordsByType: new Map(), revision: 0 };

    constructor(private readonly app: App) {}

    getSnapshot(): TpsNavigatorTypesSnapshot {
        return this.snapshot;
    }

    setEnabled(enabled: boolean): void {
        if (enabled === this.enabled) return;
        this.enabled = enabled;
        if (enabled && this.listeners.size) this.start();
        else this.stop();
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        if (this.enabled && this.listeners.size === 1) this.start();
        return () => {
            this.listeners.delete(listener);
            if (!this.listeners.size) this.stop();
        };
    }

    private start(): void {
        if (this.events.length) return;
        const invalidate = (file: TAbstractFile, oldPath?: string) => {
            const recursive = file instanceof TFolder;
            if (oldPath) this.pendingPaths.set(oldPath, recursive || this.pendingPaths.get(oldPath) === true);
            this.pendingPaths.set(file.path, recursive || this.pendingPaths.get(file.path) === true);
            this.scheduleFlush();
        };
        const vaultEvents = [
            this.app.vault.on('create', invalidate),
            this.app.vault.on('delete', invalidate),
            this.app.vault.on('rename', invalidate)
        ];
        this.events.push(...vaultEvents.map(event => () => this.app.vault.offref(event)));
        const metadataEvent = this.app.metadataCache.on('changed', (file, _data, cache) => {
            if (!(file instanceof TFile) || file.extension.toLocaleLowerCase() !== 'md' || isExcalidrawFile(file)) return;
            const wasDrawing =
                this.snapshot.recordsByType.get(TPS_NAVIGATOR_TYPE_IDS.DRAWINGS)?.some(record => record.sourcePath === file.path) ?? false;
            if (wasDrawing === hasExcalidrawFrontmatterFlagValue(cache.frontmatter)) return;
            if (this.app.vault.getAbstractFileByPath(file.path) !== file) return;
            invalidate(file);
        });
        this.events.push(() => this.app.metadataCache.offref(metadataEvent));
        this.publish(buildVaultFileTypesSnapshot(this.app));
    }

    private scheduleFlush(): void {
        if (this.timer !== null) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            const paths = new Map(this.pendingPaths);
            this.pendingPaths.clear();
            if (!this.enabled || !this.listeners.size) return;
            const snapshot = updateVaultFileTypesSnapshot(this.app, this.snapshot, paths);
            if (snapshot !== this.snapshot) this.publish(snapshot);
        }, 100);
    }

    private publish(snapshot: TpsNavigatorTypesSnapshot): void {
        this.snapshot = { ...snapshot, revision: ++this.revision };
        for (const listener of this.listeners) listener();
    }

    private stop(): void {
        for (const dispose of this.events) dispose();
        this.events = [];
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
        this.pendingPaths.clear();
    }
}
