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

import { TPS_NOTEBOOK_NAVIGATOR_VIEWPORT_EVENT } from '../constants/tpsIdentity';

type NavigatorViewWindow = Window & { CustomEvent: typeof CustomEvent };

/**
 * Obsidian popouts own a separate document and Window. Lifecycle events must
 * stay in that realm so listeners attached to the list's scroll window receive
 * them and browser event constructors remain compatible with that document.
 */
export function getNavigatorViewWindow(container: HTMLElement, fallbackWindow: Window = window): NavigatorViewWindow {
    return (container.ownerDocument.defaultView ?? fallbackWindow) as NavigatorViewWindow;
}

export function dispatchNavigatorViewportChange(container: HTMLElement, fallbackWindow: Window = window): void {
    const targetWindow = getNavigatorViewWindow(container, fallbackWindow);
    targetWindow.dispatchEvent(
        new targetWindow.CustomEvent(TPS_NOTEBOOK_NAVIGATOR_VIEWPORT_EVENT, {
            detail: { container }
        })
    );
}
