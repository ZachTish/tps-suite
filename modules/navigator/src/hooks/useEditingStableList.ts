import { useEffect, useReducer, useRef } from 'react';
import type { App } from 'obsidian';
import { EditingListSnapshot } from '../utils/editingListSnapshot';

/** Indexing and row content remain live; only the list's structure waits for typing to settle. */
export function useEditingStableList<T>(app: App, next: T, context: unknown): T {
    const snapshot = useRef(new EditingListSnapshot<T>());
    const [, redraw] = useReducer((value: number) => value + 1, 0);
    useEffect(() => {
        let timer: number | undefined;
        const release = () => {
            window.clearTimeout(timer);
            timer = undefined;
            snapshot.current.release();
            redraw();
        };
        const editorChange = app.workspace.on('editor-change', () => {
            snapshot.current.edit(Date.now());
            window.clearTimeout(timer);
            timer = window.setTimeout(release, 2000);
        });
        const fileOpen = app.workspace.on('file-open', release);
        // Explicit file operations must not leave deleted/renamed rows in the held snapshot.
        const vaultEvents = ['create', 'delete', 'rename'].map(event => app.vault.on(event as 'create', release));
        return () => {
            window.clearTimeout(timer);
            app.workspace.offref(editorChange);
            app.workspace.offref(fileOpen);
            vaultEvents.forEach(ref => app.vault.offref(ref));
        };
    }, [app]);
    return snapshot.current.select(next, context, Date.now());
}
