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

import { useCallback, useSyncExternalStore } from 'react';
import type { App } from 'obsidian';
import { getTagNoteIndexStore, type TagNoteIndex } from '../utils/tagNotes';

const DISABLED_SNAPSHOT = -1;

/**
 * Subscribes to the one event-driven tag-note index shared by all navigator
 * surfaces for this app. Disabled consumers neither scan nor retain listeners.
 */
export function useTagNoteIndex(app: App, enabled: boolean): TagNoteIndex | undefined {
    const store = getTagNoteIndexStore(app);
    const subscribe = useCallback(
        (listener: () => void) => {
            return enabled ? store.subscribe(listener) : () => {};
        },
        [enabled, store]
    );
    const getSnapshot = useCallback(() => (enabled ? store.getRevision() : DISABLED_SNAPSHOT), [enabled, store]);

    useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return enabled ? store.getIndex() : undefined;
}
