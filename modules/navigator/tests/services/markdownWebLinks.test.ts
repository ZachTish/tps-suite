import { describe, expect, it } from 'vitest';
import { MARKDOWN_WEB_LINK_MAX_RECORDS_PER_FILE, scanMarkdownWebLinks } from '../../src/services/types/markdownWebLinks';

describe('Markdown web-link scanner', () => {
    it('finds Markdown links, angle autolinks, bare URLs, duplicates, and exact CRLF positions', () => {
        const lines = [
            'Intro',
            '[Product docs](https://user:password@example.com/docs/start?token=secret#private)',
            'Two: <http://example.org/plain> and https://example.net/a?x=secret#fragment.',
            'Repeat https://same.example/path and https://same.example/path'
        ];
        const content = lines.join('\r\n');

        const result = scanMarkdownWebLinks(content);

        expect(result.skipped).toBeNull();
        expect(result.truncated).toBe(false);
        expect(result.matches.map(match => [match.label, match.safeDisplay, match.lineNumber, match.columnNumber])).toEqual([
            ['Product docs', 'https://example.com', 2, 0],
            ['http://example.org', 'http://example.org', 3, 5],
            ['https://example.net', 'https://example.net', 3, lines[2].indexOf('https://example.net')],
            ['https://same.example', 'https://same.example', 4, lines[3].indexOf('https://same.example')],
            ['https://same.example', 'https://same.example', 4, lines[3].lastIndexOf('https://same.example')]
        ]);
        result.matches.forEach(match => {
            expect(content.slice(match.startOffset, match.endOffset)).toContain(match.target);
        });
        expect(
            JSON.stringify(
                result.matches.map(({ label, safeDisplay, startOffset, endOffset }) => ({ label, safeDisplay, startOffset, endOffset }))
            )
        ).not.toMatch(/password|token=|fragment|docs\/start|same\.example\/path/u);
    });

    it('excludes images, internal and mail links, inline/indented code, and root or blockquoted fences', () => {
        const content = [
            '![Remote image](https://images.example/private.png)',
            '[Internal](Notes/Other.md) [Mail](mailto:person@example.com)',
            '`https://inline.example/secret`',
            '    https://indented.example/secret',
            '> ```md',
            '> https://quoted-code.example/secret',
            '> ```',
            '~~~',
            'https://tilde-code.example/secret',
            '~~~',
            '> Visible https://visible.example/path',
            '```',
            'https://unterminated.example/secret'
        ].join('\n');

        const result = scanMarkdownWebLinks(content);

        expect(result.matches.map(match => match.target)).toEqual(['https://visible.example/path']);
        expect(result.matches[0]).toMatchObject({ label: 'https://visible.example', lineNumber: 11, columnNumber: 10 });
    });

    it('excludes leading YAML, HTML comments, and Obsidian comments, including malformed unclosed regions', () => {
        const content = [
            '---',
            'webhook: https://hooks.example/path-secret?token=frontmatter',
            '---',
            'Visible https://visible.example/path-secret',
            '<!-- https://comment.example/secret -->',
            '%% tps-inline-props:{"callback":"https://hidden.example/webhook-secret"} %%',
            'After https://after.example/another-secret'
        ].join('\n');

        expect(scanMarkdownWebLinks(content).matches.map(match => [match.target, match.label])).toEqual([
            ['https://visible.example/path-secret', 'https://visible.example'],
            ['https://after.example/another-secret', 'https://after.example']
        ]);
        expect(scanMarkdownWebLinks('---\nsecret: https://frontmatter.example/unclosed').matches).toEqual([]);
        expect(scanMarkdownWebLinks('Before\n<!-- https://comment.example/unclosed').matches).toEqual([]);
        expect(scanMarkdownWebLinks('Before\n%% https://hidden.example/unclosed').matches).toEqual([]);
    });

    it('redacts credentials, query values, and fragments from URL-shaped authored labels', () => {
        const content =
            '[Mirror https://label-user:label-password@labels.example/private?label-token=secret#label-fragment]' +
            '(https://target-user:target-password@target.example/docs?target-token=secret#target-fragment)';

        const result = scanMarkdownWebLinks(content);

        expect(result.matches).toHaveLength(1);
        expect(result.matches[0]).toMatchObject({
            label: 'Mirror https://labels.example',
            safeDisplay: 'https://target.example'
        });
        expect(JSON.stringify(result.matches.map(({ label, safeDisplay }) => ({ label, safeDisplay })))).not.toMatch(
            /user|password|token=|fragment|\/private|\/docs/u
        );
    });

    it('fails closed before scanning a body beyond the supplied character budget', () => {
        const result = scanMarkdownWebLinks(`https://example.com/${'x'.repeat(100)}`, 32);

        expect(result).toEqual({ matches: [], skipped: 'too-large', truncated: false });
    });

    it('bounds the number of records emitted by one pathological file', () => {
        const content = Array.from(
            { length: MARKDOWN_WEB_LINK_MAX_RECORDS_PER_FILE + 1 },
            (_, index) => `https://example.com/${index}`
        ).join('\n');

        const result = scanMarkdownWebLinks(content);

        expect(result.matches).toHaveLength(MARKDOWN_WEB_LINK_MAX_RECORDS_PER_FILE);
        expect(result.truncated).toBe(true);
        expect(result.matches[MARKDOWN_WEB_LINK_MAX_RECORDS_PER_FILE - 1]?.target).toBe(
            `https://example.com/${MARKDOWN_WEB_LINK_MAX_RECORDS_PER_FILE - 1}`
        );
    });
});
