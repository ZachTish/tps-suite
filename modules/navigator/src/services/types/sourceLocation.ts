/* TPS Notebook Navigator - provider-neutral guarded source-location activation. */

import type { App, TFile } from 'obsidian';

interface EditorLike {
    setCursor(position: { line: number; ch: number }): void;
    scrollIntoView?(range: { from: { line: number; ch: number }; to: { line: number; ch: number } }, center?: boolean): void;
    focus?(): void;
}

interface WorkspaceLeafLike {
    view?: {
        file?: { path?: string } | null;
        editor?: EditorLike;
    };
    openFile(file: TFile, options?: { state?: { mode?: string }; active?: boolean }): Promise<void>;
}

interface WorkspaceLike {
    activeLeaf?: WorkspaceLeafLike | null;
    getLeaf(newLeaf?: boolean): WorkspaceLeafLike;
    getLeavesOfType?(viewType: string): WorkspaceLeafLike[];
}

export type SourceLocationActivationResult =
    | { readonly ok: true; readonly sourcePath: string; readonly lineNumber: number }
    | {
          readonly ok: false;
          readonly reason: 'missing-file' | 'workspace-unavailable' | 'editor-unavailable' | 'open-failed';
          readonly error?: unknown;
      };

function getLeafEditor(leaf: WorkspaceLeafLike | null | undefined): EditorLike | null {
    const editor = leaf?.view?.editor;
    return editor && typeof editor.setCursor === 'function' ? editor : null;
}

function findEditor(workspace: WorkspaceLike, preferredLeaf: WorkspaceLeafLike, sourcePath: string): EditorLike | null {
    if (preferredLeaf.view?.file?.path === sourcePath) {
        const preferredEditor = getLeafEditor(preferredLeaf);
        if (preferredEditor) {
            return preferredEditor;
        }
    }
    const activeLeaf = workspace.activeLeaf;
    if (activeLeaf?.view?.file?.path === sourcePath) {
        const activeEditor = getLeafEditor(activeLeaf);
        if (activeEditor) {
            return activeEditor;
        }
    }
    try {
        const matchingLeaf = workspace.getLeavesOfType?.('markdown').find(leaf => leaf.view?.file?.path === sourcePath);
        return getLeafEditor(matchingLeaf);
    } catch {
        return null;
    }
}

/** Opens a Markdown file in source mode and places the cursor at a one-based line. */
export async function openMarkdownSourceLocation(
    app: App,
    file: TFile | null,
    lineNumber: number,
    columnNumber = 0
): Promise<SourceLocationActivationResult> {
    if (!file || file.extension.toLocaleLowerCase() !== 'md') {
        return { ok: false, reason: 'missing-file' };
    }
    if (!Number.isSafeInteger(lineNumber) || lineNumber < 1) {
        return { ok: false, reason: 'editor-unavailable' };
    }

    const workspace = (app as unknown as { workspace?: WorkspaceLike }).workspace;
    if (!workspace || typeof workspace.getLeaf !== 'function') {
        return { ok: false, reason: 'workspace-unavailable' };
    }

    let leaf: WorkspaceLeafLike;
    try {
        leaf = workspace.getLeaf(false);
        await leaf.openFile(file, { state: { mode: 'source' }, active: true });
    } catch (error) {
        return { ok: false, reason: 'open-failed', error };
    }

    const editor = findEditor(workspace, leaf, file.path);
    if (!editor) {
        return { ok: false, reason: 'editor-unavailable' };
    }
    const position = {
        line: lineNumber - 1,
        ch: Number.isSafeInteger(columnNumber) && columnNumber >= 0 ? columnNumber : 0
    };
    editor.setCursor(position);
    editor.scrollIntoView?.({ from: position, to: position }, true);
    editor.focus?.();
    return { ok: true, sourcePath: file.path, lineNumber };
}
