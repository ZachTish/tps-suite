/*
 * TPS Notebook Navigator - bounded local Markdown web-link scanner.
 *
 * Obsidian's CachedMetadata.links contains vault links, not external URLs. This
 * scanner therefore works only on Markdown text already present in the vault.
 * It never resolves, opens, or requests an external target.
 */

import { findFencedCodeBlockRanges, findInlineCodeRanges } from '../../utils/codeRangeUtils';
import { mergeRanges } from '../../utils/arrayUtils';

export const MARKDOWN_WEB_LINK_MAX_RECORDS_PER_FILE = 10_000;

export interface MarkdownWebLinkMatch {
    readonly label: string;
    readonly target: string;
    readonly safeDisplay: string;
    /** Inclusive UTF-16 source offset for the authored link syntax. */
    readonly startOffset: number;
    /** Exclusive UTF-16 source offset for the authored link syntax. */
    readonly endOffset: number;
    /** One-based source line. */
    readonly lineNumber: number;
    /** Zero-based source column. */
    readonly columnNumber: number;
}

export interface MarkdownWebLinkScanResult {
    readonly matches: readonly MarkdownWebLinkMatch[];
    readonly skipped: 'too-large' | null;
    readonly truncated: boolean;
}

interface LocalRange {
    readonly start: number;
    readonly end: number;
}

interface ParsedDestination {
    readonly target: string;
    readonly syntaxEnd: number;
}

const BARE_WEB_LINK_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;
const ANGLE_WEB_LINK_PATTERN = /<(https?:\/\/[^<>\s]+)>/giu;

function isEscaped(text: string, index: number): boolean {
    let slashCount = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
        slashCount += 1;
    }
    return slashCount % 2 === 1;
}

function rangesOverlap(start: number, end: number, ranges: readonly LocalRange[]): boolean {
    let left = 0;
    let right = ranges.length;
    while (left < right) {
        const middle = Math.floor((left + right) / 2);
        const range = ranges[middle];
        if (range && range.end <= start) {
            left = middle + 1;
        } else {
            right = middle;
        }
    }
    const candidate = ranges[left];
    return Boolean(candidate && start < candidate.end && end > candidate.start);
}

function findClosingBracket(line: string, start: number): number {
    let depth = 1;
    for (let cursor = start + 1; cursor < line.length; cursor += 1) {
        if (isEscaped(line, cursor)) {
            continue;
        }
        if (line[cursor] === '[') {
            depth += 1;
        } else if (line[cursor] === ']') {
            depth -= 1;
            if (depth === 0) {
                return cursor;
            }
        }
    }
    return -1;
}

function decodeMarkdownEscapes(value: string): string {
    return value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/gu, '$1');
}

function parseMarkdownDestination(line: string, openParenthesis: number): ParsedDestination | null {
    let cursor = openParenthesis + 1;
    while (cursor < line.length && /[ \t]/u.test(line[cursor] ?? '')) {
        cursor += 1;
    }
    if (cursor >= line.length) {
        return null;
    }

    if (line[cursor] === '<') {
        const targetStart = cursor + 1;
        let targetEnd = targetStart;
        while (targetEnd < line.length && line[targetEnd] !== '>') {
            if (line[targetEnd] === '\n' || line[targetEnd] === '\r') {
                return null;
            }
            targetEnd += 1;
        }
        if (targetEnd >= line.length) {
            return null;
        }
        let closing = targetEnd + 1;
        while (closing < line.length && line[closing] !== ')') {
            closing += 1;
        }
        return closing < line.length ? { target: decodeMarkdownEscapes(line.slice(targetStart, targetEnd)), syntaxEnd: closing + 1 } : null;
    }

    const targetStart = cursor;
    let targetEnd = cursor;
    let nestedParentheses = 0;
    let closingParenthesis = -1;
    while (cursor < line.length) {
        const character = line[cursor];
        if (character === '\\' && cursor + 1 < line.length) {
            cursor += 2;
            targetEnd = cursor;
            continue;
        }
        if (character === '(') {
            nestedParentheses += 1;
            cursor += 1;
            targetEnd = cursor;
            continue;
        }
        if (character === ')') {
            if (nestedParentheses === 0) {
                closingParenthesis = cursor;
                break;
            }
            nestedParentheses -= 1;
            cursor += 1;
            targetEnd = cursor;
            continue;
        }
        if (/[ \t]/u.test(character ?? '')) {
            targetEnd = cursor;
            while (cursor < line.length && line[cursor] !== ')') {
                cursor += 1;
            }
            closingParenthesis = cursor < line.length ? cursor : -1;
            break;
        }
        cursor += 1;
        targetEnd = cursor;
    }
    if (closingParenthesis < 0 || targetEnd <= targetStart) {
        return null;
    }
    return {
        target: decodeMarkdownEscapes(line.slice(targetStart, targetEnd)),
        syntaxEnd: closingParenthesis + 1
    };
}

function getSafeWebTarget(targetValue: string): { target: string; safeDisplay: string } | null {
    const target = targetValue.trim();
    if (!target) {
        return null;
    }
    try {
        const parsed = new URL(target);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        // Paths can contain webhook keys and other bearer-style secrets just as
        // readily as query strings. The Type row therefore exposes only the
        // origin; activation still revalidates the complete authored target.
        return { target, safeDisplay: `${parsed.protocol}//${parsed.host}` };
    } catch {
        return null;
    }
}

function redactEmbeddedWebTargets(value: string): string {
    BARE_WEB_LINK_PATTERN.lastIndex = 0;
    let result = '';
    let cursor = 0;
    for (let match = BARE_WEB_LINK_PATTERN.exec(value); match; match = BARE_WEB_LINK_PATTERN.exec(value)) {
        const rawTarget = match[0];
        const keptLength = trimBareUrlEnd(rawTarget);
        const parsed = getSafeWebTarget(rawTarget.slice(0, keptLength));
        if (!parsed) {
            continue;
        }
        result += value.slice(cursor, match.index);
        result += parsed.safeDisplay;
        result += rawTarget.slice(keptLength);
        cursor = match.index + rawTarget.length;
    }
    return cursor === 0 ? value : `${result}${value.slice(cursor)}`;
}

function getSafeWebLinkLabel(authoredLabel: string, target: string, safeDisplay: string): string {
    const displayText = authoredLabel.replace(/\s+/gu, ' ').trim();
    if (!displayText) {
        return safeDisplay;
    }
    const unwrappedDisplay = displayText.startsWith('<') && displayText.endsWith('>') ? displayText.slice(1, -1) : displayText;
    if (unwrappedDisplay === target) {
        return safeDisplay;
    }
    try {
        const displayUrl = new URL(unwrappedDisplay);
        if (displayUrl.protocol === 'http:' || displayUrl.protocol === 'https:') {
            return `${displayUrl.protocol}//${displayUrl.host}`;
        }
    } catch {
        // A normal authored Markdown label is intentionally preserved.
    }
    return redactEmbeddedWebTargets(displayText.includes(target) ? displayText.split(target).join(safeDisplay) : displayText);
}

function findLeadingFrontmatterRange(content: string): LocalRange | null {
    const markerStart = content.startsWith('\uFEFF') ? 1 : 0;
    const firstNewline = content.indexOf('\n', markerStart);
    const firstLineEnd = firstNewline < 0 ? content.length : firstNewline;
    if (content.slice(markerStart, firstLineEnd).replace(/\r$/u, '').trim() !== '---') {
        return null;
    }

    let lineStart = firstNewline < 0 ? content.length : firstNewline + 1;
    while (lineStart < content.length) {
        const newline = content.indexOf('\n', lineStart);
        const lineEnd = newline < 0 ? content.length : newline;
        const line = content.slice(lineStart, lineEnd).replace(/\r$/u, '');
        if (/^(?:---|\.\.\.)[ \t]*$/u.test(line)) {
            return { start: 0, end: newline < 0 ? content.length : newline + 1 };
        }
        if (newline < 0) {
            break;
        }
        lineStart = newline + 1;
    }
    // A malformed leading fence is still metadata-shaped. Fail closed instead
    // of surfacing possible credentials from the remainder of the document.
    return { start: 0, end: content.length };
}

function findHtmlCommentRanges(content: string): LocalRange[] {
    const ranges: LocalRange[] = [];
    let cursor = 0;
    while (cursor < content.length) {
        const start = content.indexOf('<!--', cursor);
        if (start < 0) {
            break;
        }
        const closing = content.indexOf('-->', start + 4);
        const end = closing < 0 ? content.length : closing + 3;
        ranges.push({ start, end });
        if (closing < 0) {
            break;
        }
        cursor = end;
    }
    return ranges;
}

function findObsidianCommentRanges(content: string): LocalRange[] {
    const ranges: LocalRange[] = [];
    let cursor = 0;
    while (cursor < content.length) {
        const start = content.indexOf('%%', cursor);
        if (start < 0) {
            break;
        }
        const closing = content.indexOf('%%', start + 2);
        const end = closing < 0 ? content.length : closing + 2;
        ranges.push({ start, end });
        if (closing < 0) {
            break;
        }
        cursor = end;
    }
    return ranges;
}

function trimBareUrlEnd(value: string): number {
    let end = value.length;
    while (end > 0 && /[.,;:!?]/u.test(value[end - 1] ?? '')) {
        end -= 1;
    }
    const pairs: readonly [string, string][] = [
        ['(', ')'],
        ['[', ']'],
        ['{', '}']
    ];
    let changed = true;
    while (end > 0 && changed) {
        changed = false;
        for (const [open, close] of pairs) {
            if (value[end - 1] !== close) {
                continue;
            }
            const slice = value.slice(0, end);
            const opens = [...slice].filter(character => character === open).length;
            const closes = [...slice].filter(character => character === close).length;
            if (closes > opens) {
                end -= 1;
                changed = true;
            }
        }
    }
    return end;
}

function pushMatch(
    matches: MarkdownWebLinkMatch[],
    targetValue: string,
    authoredLabel: string,
    lineNumber: number,
    lineStartOffset: number,
    localStart: number,
    localEnd: number
): boolean {
    const target = getSafeWebTarget(targetValue);
    if (!target || localEnd <= localStart) {
        return false;
    }
    matches.push(
        Object.freeze({
            label: getSafeWebLinkLabel(authoredLabel, target.target, target.safeDisplay),
            target: target.target,
            safeDisplay: target.safeDisplay,
            startOffset: lineStartOffset + localStart,
            endOffset: lineStartOffset + localEnd,
            lineNumber: lineNumber + 1,
            columnNumber: localStart
        })
    );
    return true;
}

function scanLine(
    line: string,
    lineNumber: number,
    lineStartOffset: number,
    blocked: readonly LocalRange[],
    matches: MarkdownWebLinkMatch[]
): boolean {
    const consumed: LocalRange[] = [];

    for (let cursor = 0; cursor < line.length; cursor += 1) {
        if (matches.length >= MARKDOWN_WEB_LINK_MAX_RECORDS_PER_FILE) {
            return true;
        }
        if (line[cursor] !== '[' || isEscaped(line, cursor) || rangesOverlap(cursor, cursor + 1, blocked)) {
            continue;
        }
        const isImage = cursor > 0 && line[cursor - 1] === '!' && !isEscaped(line, cursor - 1);
        const closingBracket = findClosingBracket(line, cursor);
        if (closingBracket < 0) {
            // Any later `[` is nested inside this unmatched opener, so avoid
            // rescanning the remainder once per character on malformed input.
            break;
        }
        if (line[closingBracket + 1] !== '(') {
            cursor = closingBracket;
            continue;
        }
        const destination = parseMarkdownDestination(line, closingBracket + 1);
        if (!destination) {
            cursor = closingBracket;
            continue;
        }
        if (rangesOverlap(cursor, destination.syntaxEnd, blocked)) {
            cursor = destination.syntaxEnd - 1;
            continue;
        }
        if (isImage) {
            consumed.push({ start: cursor - 1, end: destination.syntaxEnd });
            cursor = destination.syntaxEnd - 1;
            continue;
        }
        if (
            pushMatch(
                matches,
                destination.target,
                line.slice(cursor + 1, closingBracket),
                lineNumber,
                lineStartOffset,
                cursor,
                destination.syntaxEnd
            )
        ) {
            consumed.push({ start: cursor, end: destination.syntaxEnd });
            cursor = destination.syntaxEnd - 1;
        }
    }

    const markdownConsumed = Object.freeze([...consumed]);
    ANGLE_WEB_LINK_PATTERN.lastIndex = 0;
    for (let match = ANGLE_WEB_LINK_PATTERN.exec(line); match; match = ANGLE_WEB_LINK_PATTERN.exec(line)) {
        if (matches.length >= MARKDOWN_WEB_LINK_MAX_RECORDS_PER_FILE) {
            return true;
        }
        const start = match.index;
        const end = start + match[0].length;
        if (isEscaped(line, start) || rangesOverlap(start, end, blocked) || rangesOverlap(start, end, markdownConsumed)) {
            continue;
        }
        if (pushMatch(matches, match[1] ?? '', match[0], lineNumber, lineStartOffset, start, end)) {
            consumed.push({ start, end });
        }
    }

    const nonBareConsumed = mergeRanges(consumed);
    BARE_WEB_LINK_PATTERN.lastIndex = 0;
    for (let match = BARE_WEB_LINK_PATTERN.exec(line); match; match = BARE_WEB_LINK_PATTERN.exec(line)) {
        if (matches.length >= MARKDOWN_WEB_LINK_MAX_RECORDS_PER_FILE) {
            return true;
        }
        const start = match.index;
        if (start > 0 && /[\p{L}\p{N}_]/u.test(line[start - 1] ?? '')) {
            continue;
        }
        const keptLength = trimBareUrlEnd(match[0]);
        const end = start + keptLength;
        if (
            keptLength === 0 ||
            isEscaped(line, start) ||
            rangesOverlap(start, end, blocked) ||
            rangesOverlap(start, end, nonBareConsumed)
        ) {
            continue;
        }
        if (pushMatch(matches, line.slice(start, end), line.slice(start, end), lineNumber, lineStartOffset, start, end)) {
            consumed.push({ start, end });
        }
    }
    return false;
}

/** Scans one Markdown body without evaluating or requesting any discovered URL. */
export function scanMarkdownWebLinks(content: string, maxCharacters = Number.POSITIVE_INFINITY): MarkdownWebLinkScanResult {
    if (content.length > maxCharacters) {
        return Object.freeze({ matches: Object.freeze([]), skipped: 'too-large', truncated: false });
    }

    const matches: MarkdownWebLinkMatch[] = [];
    const fencedRanges = findFencedCodeBlockRanges(content);
    const frontmatterRange = findLeadingFrontmatterRange(content);
    const codeRanges = mergeRanges([
        ...fencedRanges,
        ...findInlineCodeRanges(content, fencedRanges),
        ...findHtmlCommentRanges(content),
        ...findObsidianCommentRanges(content),
        ...(frontmatterRange ? [frontmatterRange] : [])
    ]);
    let codeRangeCursor = 0;
    let lineStart = 0;
    let lineNumber = 0;
    while (lineStart <= content.length) {
        const newline = content.indexOf('\n', lineStart);
        const rawEnd = newline < 0 ? content.length : newline;
        const contentEnd = rawEnd > lineStart && content[rawEnd - 1] === '\r' ? rawEnd - 1 : rawEnd;
        const line = content.slice(lineStart, contentEnd);
        while ((codeRanges[codeRangeCursor]?.end ?? Number.POSITIVE_INFINITY) <= lineStart) {
            codeRangeCursor += 1;
        }
        const blocked: LocalRange[] = [];
        for (let rangeIndex = codeRangeCursor; rangeIndex < codeRanges.length; rangeIndex += 1) {
            const range = codeRanges[rangeIndex];
            if (!range || range.start >= contentEnd) {
                break;
            }
            if (range.end > lineStart) {
                blocked.push({
                    start: Math.max(0, range.start - lineStart),
                    end: Math.min(line.length, range.end - lineStart)
                });
            }
        }
        if (!/^(?: {4}|\t)/u.test(line) && scanLine(line, lineNumber, lineStart, blocked, matches)) {
            return Object.freeze({ matches: Object.freeze(matches), skipped: null, truncated: true });
        }
        if (newline < 0) {
            break;
        }
        lineStart = newline + 1;
        lineNumber += 1;
    }
    return Object.freeze({ matches: Object.freeze(matches), skipped: null, truncated: false });
}
