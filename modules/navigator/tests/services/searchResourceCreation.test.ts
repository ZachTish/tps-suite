import { describe, expect, it } from 'vitest';
import { resolveNavigationSearchCreation, resolveSearchResourceCreation } from '../../src/services/types/searchResourceCreation';
import { TPS_NAVIGATOR_TYPE_IDS } from '../../src/types/navigatorTypes';

describe('search-backed resource creation', () => {
    it('allows only whole-file Type creation', () => {
        expect(resolveSearchResourceCreation('type:file:canvas')).toEqual({ ok: true, typeId: TPS_NAVIGATOR_TYPE_IDS.CANVAS });
        expect(resolveSearchResourceCreation('type:file:base')).toEqual({ ok: true, typeId: TPS_NAVIGATOR_TYPE_IDS.BASES });
    });

    it.each([
        '#hca OR #idea type:structural:task',
        '#hca -#blocked type:structural:task',
        '-# type:structural:task',
        'open #hca type:structural:task',
        '#hca folder:projects type:structural:task',
        '#hca type:structural:task type:structural:heading',
        '#hca',
        '.priority type:structural:task',
        '.priority= type:structural:task',
        '#hca type:structural:bullet',
        '#hca type:file:canvas',
        'type:structural:task',
        'type:structural:bullet',
        'type:structural:heading',
        'type:structural:code-block',
        'type:structural:callout',
        'type:structural:blockquote',
        'type:structural:table',
        'type:structural:web-link'
    ])('rejects a search whose new item cannot be guaranteed to match: %s', query => {
        expect(resolveSearchResourceCreation(query)).toMatchObject({ ok: false });
    });
});

describe('ordinary creation from a navigation search', () => {
    it.each([
        ['#work', { type: 'tag', tag: 'work' }],
        ['.status', { type: 'property', nodeId: 'key:status' }],
        ['.status=todo', { type: 'property', nodeId: 'key:status=todo' }],
        ['.kind=task/todo', { type: 'property', nodeId: 'key:kind=task/todo' }],
        ['folder:"/my projects/**"', { type: 'folder', path: 'my projects' }],
        ['folder:/inbox', { type: 'folder', path: 'inbox' }]
    ])('routes %s to the existing writer', (query, target) => {
        expect(resolveNavigationSearchCreation(query)).toEqual(target);
    });
    it.each([
        '',
        '#',
        '-#',
        'folder:work',
        '.status=',
        '#a #b',
        '.status=todo #a',
        '#a OR #b',
        '-#a',
        '#a meeting',
        '#a -meeting',
        '#a @today',
        '#a ext:md',
        '#a type:structural:task',
        'folder:'
    ])('does not guess creation defaults for %s', query => {
        expect(resolveNavigationSearchCreation(query)).toBeNull();
    });
});
