import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { handleNavigationNoteLinkKeyDown, NavigationNoteLink } from '../../src/components/NavigationNoteLink';

describe('NavigationNoteLink', () => {
    it('exposes internal note navigation as a focusable link', () => {
        const markup = renderToStaticMarkup(
            React.createElement(NavigationNoteLink, { onActivate: vi.fn(), className: 'linked-note' }, 'Status')
        );

        expect(markup).toContain('role="link"');
        expect(markup).toContain('tabindex="0"');
        expect(markup).toContain('class="linked-note"');
        expect(markup).toContain('Status');
    });

    it('owns Enter activation so the surrounding tree row does not also handle it', () => {
        const onActivate = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const event = {
            key: 'Enter',
            preventDefault,
            stopPropagation
        } as unknown as React.KeyboardEvent<HTMLSpanElement>;

        handleNavigationNoteLinkKeyDown(event, onActivate);

        expect(preventDefault).toHaveBeenCalledOnce();
        expect(stopPropagation).toHaveBeenCalledOnce();
        expect(onActivate).toHaveBeenCalledOnce();
        expect(onActivate).toHaveBeenCalledWith(event);
    });

    it('leaves non-activation keys available to navigation-pane keyboard handling', () => {
        const onActivate = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const event = {
            key: 'ArrowDown',
            preventDefault,
            stopPropagation
        } as unknown as React.KeyboardEvent<HTMLSpanElement>;

        handleNavigationNoteLinkKeyDown(event, onActivate);

        expect(preventDefault).not.toHaveBeenCalled();
        expect(stopPropagation).not.toHaveBeenCalled();
        expect(onActivate).not.toHaveBeenCalled();
    });
});
