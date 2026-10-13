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

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { applyTpsRuntimeNamespace } from '../../scripts/tps-runtime-namespace.mjs';
import { getListPaneMeasurements } from '../../src/utils/listPaneMeasurements';

function readTextFile(path: string): string {
    return applyTpsRuntimeNamespace(readFileSync(path, 'utf8'));
}

function extractRuleBlock(css: string, selector: string): string {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'm');
    const match = css.match(pattern);
    if (!match?.[1]) {
        throw new Error(`Missing CSS rule for selector ${selector}`);
    }
    return match[1];
}

function extractPxVariableValue(css: string, variableName: string): number {
    const pattern = new RegExp(`--${variableName}:\\s*([0-9]+)px\\s*;`);
    const match = css.match(pattern);
    if (!match?.[1]) {
        throw new Error(`Missing CSS variable --${variableName}`);
    }
    return Number.parseInt(match[1], 10);
}

function extractCalcAddPx(css: string, variableName: string, baseVariableName: string): number {
    const escapedBase = baseVariableName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const pattern = new RegExp(`--${variableName}:\\s*calc\\(var\\(--${escapedBase}\\)\\s*\\+\\s*([0-9]+)px\\)\\s*;`);
    const match = css.match(pattern);
    if (!match?.[1]) {
        throw new Error(`Missing calc override --${variableName} based on --${baseVariableName}`);
    }
    return Number.parseInt(match[1], 10);
}

describe('List pane measurements stay in sync with CSS', () => {
    test('desktop virtual rows do not carry a speculative compositor workaround', () => {
        const virtualListCss = readTextFile('src/styles/sections/layout-virtual-list.css');

        expect(virtualListCss).not.toMatch(/translateZ\(0\)/);
    });

    test('measured titles stay in text flow while virtual row wrappers stay positioned', () => {
        const virtualCss = readTextFile('src/styles/sections/layout-virtual-list.css');
        const headerCss = readTextFile('src/styles/sections/list-group-headers.css');
        // Titles also carry TanStack's data-index for intrinsic-height measurement.
        // That measurement marker must never position arbitrary descendants as rows.
        expect(virtualCss).not.toMatch(/\.tps-nn-(?:navigation|list)-pane-scroller\s+\[data-index\]/);
        expect(extractRuleBlock(virtualCss, '.tps-nn-virtual-nav-item')).toMatch(/position:\s*absolute/);
        expect(extractRuleBlock(headerCss, '.tps-nn-list-pane-scroller .tps-nn-virtual-item')).toMatch(/position:\s*absolute/);
    });

    test('desktop horizontal list pane keeps its scroller on the full pane height', () => {
        const paneCss = readTextFile('src/styles/sections/layout-panes.css');
        const listCss = readTextFile('src/styles/sections/list-files.css');
        const iosCss = readTextFile('src/styles/sections/platform-ios.css');
        const horizontalPaneRule = extractRuleBlock(paneCss, '.tps-nn-split-container.tps-nn-orientation-horizontal .tps-nn-list-pane');
        const panelRule = extractRuleBlock(listCss, '.tps-nn-list-pane-panel');
        const scrollerRule = extractRuleBlock(listCss, '.tps-nn-list-pane-scroller');

        expect(horizontalPaneRule).toMatch(/(^|\n)\s*height:\s*100%\s*;/m);
        expect(horizontalPaneRule).toMatch(/(^|\n)\s*min-height:\s*0\s*;/m);
        expect(panelRule).toMatch(/(^|\n)\s*flex:\s*1 1 0\s*;/m);
        expect(panelRule).toMatch(/(^|\n)\s*min-height:\s*0\s*;/m);
        expect(panelRule).not.toMatch(/(^|\n)\s*overflow:\s*hidden\s*;/m);
        expect(scrollerRule).toMatch(/(^|\n)\s*flex:\s*1\s*;/m);
        expect(scrollerRule).toMatch(/(^|\n)\s*min-height:\s*0\s*;/m);
        expect(iosCss).toMatch(/\.tps-nn-list-pane\s*\{\s*overflow:\s*visible\s*;/m);
    });

    test('desktop measurements match core variables', () => {
        const coreVars = readTextFile('src/styles/sections/core-variables.css');
        const desktop = getListPaneMeasurements(false);

        const paddingVertical = extractPxVariableValue(coreVars, 'tps-nn-file-padding-vertical');
        const paddingTotal = paddingVertical * 2;
        expect(desktop.basePadding).toBe(paddingTotal);
        expect(desktop.basePadding / 2).toBe(paddingVertical);

        expect(desktop.titleLineHeight).toBe(extractPxVariableValue(coreVars, 'tps-nn-file-title-line-height'));
        expect(desktop.singleTextLineHeight).toBe(extractPxVariableValue(coreVars, 'tps-nn-file-single-text-line-height'));
        expect(desktop.multilineTextLineHeight).toBe(extractPxVariableValue(coreVars, 'tps-nn-file-multiline-text-line-height'));

        const tagRowHeight = extractPxVariableValue(coreVars, 'tps-nn-file-tag-row-height-base');
        const tagRowGap = extractPxVariableValue(coreVars, 'tps-nn-file-tag-row-gap-base');
        expect(desktop.tagRowHeight).toBe(tagRowHeight + tagRowGap);

        expect(desktop.featureImageMinHeight).toBe(extractPxVariableValue(coreVars, 'tps-nn-file-thumbnail-min-size'));

        expect(desktop.groupHeaderHeight).toBe(extractPxVariableValue(coreVars, 'tps-nn-list-group-header-height'));
        expect(desktop.groupHeaderSpacerBefore).toBe(extractPxVariableValue(coreVars, 'tps-nn-list-group-header-spacer-before'));

        expect(desktop.fileIconSize).toBe(extractPxVariableValue(coreVars, 'tps-nn-file-icon-size'));
    });

    test('mobile measurements match core variables + mobile overrides', () => {
        const coreVars = readTextFile('src/styles/sections/core-variables.css');
        const mobileVars = readTextFile('src/styles/sections/mobile-variables.css');
        const mobile = getListPaneMeasurements(true);

        const paddingVertical = extractPxVariableValue(coreVars, 'tps-nn-file-padding-vertical');
        const paddingMobileIncrement = extractCalcAddPx(mobileVars, 'tps-nn-file-padding-vertical-mobile', 'tps-nn-file-padding-vertical');
        const paddingTotal = (paddingVertical + paddingMobileIncrement) * 2;
        expect(mobile.basePadding).toBe(paddingTotal);
        expect(mobile.basePadding / 2).toBe(paddingVertical + paddingMobileIncrement);

        expect(mobile.titleLineHeight).toBe(extractPxVariableValue(coreVars, 'tps-nn-file-title-line-height-mobile'));
        expect(mobile.singleTextLineHeight).toBe(extractPxVariableValue(coreVars, 'tps-nn-file-single-text-line-height-mobile'));
        expect(mobile.multilineTextLineHeight).toBe(extractPxVariableValue(coreVars, 'tps-nn-file-multiline-text-line-height-mobile'));

        const tagRowHeight = extractPxVariableValue(coreVars, 'tps-nn-file-tag-row-height-base');
        const tagRowGap = extractPxVariableValue(coreVars, 'tps-nn-file-tag-row-gap-base');
        expect(mobile.tagRowHeight).toBe(tagRowHeight + tagRowGap);

        expect(mobile.featureImageMinHeight).toBe(extractPxVariableValue(coreVars, 'tps-nn-file-thumbnail-min-size'));

        const headerIncrement = extractCalcAddPx(mobileVars, 'tps-nn-list-group-header-height-mobile', 'tps-nn-list-group-header-height');
        expect(mobile.groupHeaderHeight).toBe(extractPxVariableValue(coreVars, 'tps-nn-list-group-header-height') + headerIncrement);
        expect(mobile.groupHeaderSpacerBefore).toBe(extractPxVariableValue(coreVars, 'tps-nn-list-group-header-spacer-before'));

        const iconSize = extractPxVariableValue(coreVars, 'tps-nn-file-icon-size');
        const iconSizeIncrement = extractCalcAddPx(mobileVars, 'tps-nn-file-icon-size-mobile', 'tps-nn-file-icon-size');
        expect(mobile.fileIconSize).toBe(iconSize + iconSizeIncrement);

        expect(mobileVars).not.toMatch(/--tps-nn-file-tag-row-height\\s*:/);
        expect(mobileVars).not.toMatch(/--tps-nn-file-tag-row-gap\\s*:/);
    });

    test('android text zoom keeps title and preview clamps in sync', () => {
        const androidCss = readTextFile('src/styles/sections/android-textzoom.css');
        const titleRule = extractRuleBlock(androidCss, '.tps-notebook-navigator-android .tps-nn-file-name');
        const previewRule = extractRuleBlock(androidCss, '.tps-notebook-navigator-android .tps-nn-file-preview');

        expect(titleRule).toMatch(
            /max-height:\s*calc\(var\(--tps-nn-file-title-line-height\)\s*\*\s*var\(--filename-rows, 1\)\s*\*\s*var\(--tps-nn-android-font-scale, 1\)\)/
        );
        expect(titleRule).not.toMatch(/(^|\n)\s*min-height:\s*/m);
        expect(titleRule).not.toMatch(/(^|\n)\s*height:\s*/m);
        expect(previewRule).toMatch(
            /max-height:\s*calc\(var\(--tps-nn-file-multiline-text-line-height\)\s*\*\s*var\(--preview-rows, 1\)\s*\*\s*var\(--tps-nn-android-font-scale, 1\)\)/
        );
        expect(previewRule).not.toMatch(/(^|\n)\s*min-height:\s*/m);
        expect(previewRule).not.toMatch(/(^|\n)\s*height:\s*/m);
    });

    test('thumbnail sizing uses the same content box height as file text', () => {
        const listThumbnailsCss = readTextFile('src/styles/sections/list-file-thumbnails.css');
        const thumbnailRule = extractRuleBlock(listThumbnailsCss, '.tps-nn-virtual-file-item .tps-nn-file-thumbnail');
        const extensionBadgeRule = extractRuleBlock(listThumbnailsCss, '.tps-nn-virtual-file-item .tps-nn-file-thumbnail--extension-badge');

        expect(thumbnailRule).toMatch(
            /calc\(var\(--item-height\)\s*-\s*var\(--tps-nn-file-padding-total-mobile,\s*var\(--tps-nn-file-padding-total\)\)\)/
        );
        expect(thumbnailRule).not.toMatch(/--tps-nn-file-padding-vertical-mobile/);

        expect(extensionBadgeRule).toMatch(/width:\s*var\(--tps-nn-file-thumbnail-min-size\)/);
        expect(extensionBadgeRule).toMatch(/height:\s*var\(--tps-nn-file-thumbnail-min-size\)/);
        expect(extensionBadgeRule).not.toMatch(/--image-size/);
    });

    test('pill height uses the fixed row height as border-box height', () => {
        const listTagsCss = readTextFile('src/styles/sections/list-tags.css');
        const pillRule = listTagsCss.match(/(^|\n)\.tps-nn-file-tag\s*\{([^}]*)\}/)?.[2];
        if (!pillRule) {
            throw new Error('Missing CSS rule for selector .tps-nn-file-tag');
        }

        expect(pillRule).toMatch(/(^|\n)\s*box-sizing:\s*border-box\s*;/m);
        expect(pillRule).toMatch(/(^|\n)\s*height:\s*var\(--tps-nn-file-tag-row-height\)\s*;/m);
    });

    test('file text stack top-aligns inside fixed virtual file rows', () => {
        const listFilesCss = readTextFile('src/styles/sections/list-files.css');
        const virtualListCss = readTextFile('src/styles/sections/layout-virtual-list.css');
        const virtualFileItemRule = extractRuleBlock(virtualListCss, '.tps-nn-virtual-file-item');
        const fileRule = extractRuleBlock(listFilesCss, '.tps-nn-file');
        const fileContentRule = extractRuleBlock(listFilesCss, '.tps-nn-file-content');
        const fileInnerContentRule = extractRuleBlock(listFilesCss, '.tps-nn-file-inner-content');
        const fileTextContentRule = extractRuleBlock(listFilesCss, '.tps-nn-file-text-content');
        const fileNameRule = extractRuleBlock(listFilesCss, '.tps-nn-file-name');
        const previewRule = extractRuleBlock(listFilesCss, '.tps-nn-file-preview');

        expect(virtualFileItemRule).toMatch(/(^|\n)\s*height:\s*var\(--item-height\)\s*;/m);
        expect(fileRule).toMatch(/(^|\n)\s*height:\s*100%\s*;/m);
        expect(fileContentRule).toMatch(/(^|\n)\s*height:\s*100%\s*;/m);
        expect(fileContentRule).toMatch(/(^|\n)\s*box-sizing:\s*border-box\s*;/m);
        expect(fileInnerContentRule).toMatch(/(^|\n)\s*height:\s*100%\s*;/m);
        expect(fileTextContentRule).toMatch(/(^|\n)\s*height:\s*100%\s*;/m);
        expect(fileTextContentRule).toMatch(/(^|\n)\s*justify-content:\s*flex-start\s*;/m);
        expect(fileNameRule).toMatch(
            /(^|\n)\s*max-height:\s*calc\(var\(--tps-nn-file-title-line-height\)\s*\*\s*var\(--filename-rows, 1\)\)\s*;/m
        );
        expect(previewRule).toMatch(
            /(^|\n)\s*max-height:\s*calc\(var\(--tps-nn-file-multiline-text-line-height\)\s*\*\s*var\(--preview-rows, 1\)\)\s*;/m
        );
        expect(previewRule).not.toMatch(/(^|\n)\s*flex:\s*1\s*;/m);
        expect(previewRule).not.toMatch(/(^|\n)\s*min-height:\s*/m);
        expect(previewRule).not.toMatch(/(^|\n)\s*height:\s*/m);
    });

    test('parent folder background stays inside the fixed metadata line height', () => {
        const listFilesCss = readTextFile('src/styles/sections/list-files.css');
        const parentFolderBackgroundRule = extractRuleBlock(listFilesCss, ".tps-nn-parent-folder-content[data-has-background='true']");

        expect(parentFolderBackgroundRule).toMatch(/(^|\n)\s*box-sizing:\s*border-box\s*;/m);
        expect(parentFolderBackgroundRule).toMatch(/(^|\n)\s*height:\s*var\(--tps-nn-file-single-text-line-height\)\s*;/m);
        expect(parentFolderBackgroundRule).toMatch(
            /(^|\n)\s*line-height:\s*calc\(var\(--tps-nn-file-single-text-line-height\)\s*-\s*2px\)\s*;/m
        );
        expect(parentFolderBackgroundRule).toMatch(/(^|\n)\s*padding:\s*1px 4px\s*;/m);
    });
});
