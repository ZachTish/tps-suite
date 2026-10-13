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

import React from 'react';

export type NavigationNoteActivationEvent = React.MouseEvent<HTMLSpanElement> | React.KeyboardEvent<HTMLSpanElement>;

interface NavigationNoteLinkProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'onClick' | 'onKeyDown' | 'role' | 'tabIndex'> {
    onActivate: (event: NavigationNoteActivationEvent) => void;
}

export function handleNavigationNoteLinkKeyDown(
    event: React.KeyboardEvent<HTMLSpanElement>,
    onActivate: (event: React.KeyboardEvent<HTMLSpanElement>) => void
): void {
    if (event.key !== 'Enter') {
        return;
    }

    // The navigation pane also handles Enter at its root. A focused link owns
    // this activation, so prevent the row handler from opening the note twice.
    event.preventDefault();
    event.stopPropagation();
    onActivate(event);
}

/**
 * Accessible internal-note link used where navigation labels have a second,
 * explicit action distinct from selecting their surrounding row.
 */
export function NavigationNoteLink({ onActivate, ...spanProps }: NavigationNoteLinkProps) {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) =>
        handleNavigationNoteLinkKeyDown(event, keyboardEvent => onActivate(keyboardEvent));

    return <span {...spanProps} role="link" tabIndex={0} onClick={onActivate} onKeyDown={handleKeyDown} />;
}
