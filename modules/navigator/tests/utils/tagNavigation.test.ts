import { describe, expect, it, vi } from 'vitest';
import { ALL_TAGS_TAG_ID, TAGGED_TAG_ID } from '../../src/types';
import { navigateToTag, type TagNavigationEnvironment } from '../../src/utils/tagNavigation';

function createEnvironment(): TagNavigationEnvironment {
    return {
        showTags: true,
        showAllTagsFolder: true,
        expandedTags: new Set(),
        expandedVirtualFolders: new Set(),
        expansionDispatch: vi.fn(),
        selectionDispatch: vi.fn(),
        activatePane: vi.fn(),
        findTagInTree: vi.fn(() => null),
        requestScroll: vi.fn()
    };
}

describe('navigateToTag virtual collection compatibility', () => {
    it('selects the hidden tagged-only compatibility scope without requesting a missing tree row', () => {
        const env = createEnvironment();

        expect(navigateToTag(env, TAGGED_TAG_ID)).toBe(TAGGED_TAG_ID);
        expect(env.selectionDispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'SET_SELECTED_TAG', tag: TAGGED_TAG_ID }));
        expect(env.requestScroll).not.toHaveBeenCalled();
    });

    it('continues scrolling to the visible all-notes Tags root', () => {
        const env = createEnvironment();

        expect(navigateToTag(env, ALL_TAGS_TAG_ID)).toBe(ALL_TAGS_TAG_ID);
        expect(env.requestScroll).toHaveBeenCalledWith(ALL_TAGS_TAG_ID, { align: 'auto', itemType: 'tag' });
    });
});
