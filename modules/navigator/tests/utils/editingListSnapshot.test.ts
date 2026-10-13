import { describe, expect, it } from 'vitest';
import { EditingListSnapshot } from '../../src/utils/editingListSnapshot';

describe('editing list presentation', () => {
    it('holds ordering through repeated autosaves and releases the latest result after quiet', () => {
        const state = new EditingListSnapshot<string[]>();
        const context = {};
        const initial = ['a', 'b'];
        expect(state.select(initial, context, 0)).toBe(initial);
        for (let now = 100; now < 10000; now += 100) {
            state.edit(now);
            expect(state.select(['b', 'a'], context, now + 50)).toBe(initial);
        }
        expect(state.select(['b', 'a'], context, 12000)).toEqual(['b', 'a']);
    });
    it('honors deliberate navigation/filter changes immediately', () => {
        const state = new EditingListSnapshot<string[]>();
        state.select(['a'], 'folder-a', 0);
        state.edit(100);
        expect(state.select(['b'], 'folder-b', 101)).toEqual(['b']);
    });
    it('releases for file switches and structural operations without a pending timer', () => {
        const state = new EditingListSnapshot<string[]>();
        state.select(['a'], 'same', 0);
        state.edit(100);
        state.release();
        expect(state.select([], 'same', 101)).toEqual([]);
        expect(state.select(['c'], 'same', 102)).toEqual(['c']);
    });
});
