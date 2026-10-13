#!/usr/bin/env node
/* Verifies the final BRAT artifacts keep the fork's host-global identity. */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TPS_DND_KIT_DESCRIBED_BY_PREFIX, TPS_DND_KIT_LIVE_REGION_PREFIX } from './tps-runtime-namespace.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = fileURLToPath(import.meta.url);

export const TPS_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID = 'tps-notebook-navigator-style-settings';
export const UPSTREAM_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID = 'notebook-navigator-style-settings';

function fail(message) {
    throw new Error(`[TPS artifact identity] ${message}`);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function assertTpsArtifactIdentity({ manifestText, packageText, main, styles, styleSettingsSource }) {
    const manifest = JSON.parse(manifestText);
    const packageJson = JSON.parse(packageText);

    if (manifest.id !== 'tps-notebook-navigator' || packageJson.name !== manifest.id) {
        fail('manifest and package IDs are not the TPS plugin ID.');
    }
    if (manifest.version !== packageJson.version) {
        fail(`manifest/package versions differ (${manifest.version} vs ${packageJson.version}).`);
    }

    const upstreamShortPrefix = ['n', 'n-'].join('');
    const upstreamRootSelector = ['.notebook', '-navigator'].join('');
    const upstreamCssToken = new RegExp(`--${upstreamShortPrefix}|(?<!tps-)${upstreamShortPrefix}|\\${upstreamRootSelector}`, 'u');
    // Minified local variable arithmetic can resemble the short class prefix;
    // short-prefix coverage therefore comes from source + styles.
    const upstreamMainToken = new RegExp(`--${upstreamShortPrefix}|\\${upstreamRootSelector}`, 'u');
    if (upstreamCssToken.test(styles)) {
        fail('styles.css contains an upstream CSS/DOM namespace token.');
    }
    if (!styles.includes('.tps-notebook-navigator') || !styles.includes('.tps-nn-provider-row')) {
        fail('styles.css is missing the TPS root or provider-row surface.');
    }

    const expectedStyleSettingsId = new RegExp(`^\\s*id:\\s*${escapeRegExp(TPS_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID)}\\s*$`, 'mu');
    const upstreamStyleSettingsId = new RegExp(`^\\s*id:\\s*${escapeRegExp(UPSTREAM_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID)}\\s*$`, 'mu');
    for (const [label, contents] of [
        ['source Style Settings block', styleSettingsSource],
        ['styles.css Style Settings block', styles]
    ]) {
        if (!expectedStyleSettingsId.test(contents)) {
            fail(`${label} is missing the TPS Style Settings ID.`);
        }
        if (upstreamStyleSettingsId.test(contents)) {
            fail(`${label} contains the upstream Style Settings ID.`);
        }
    }

    const forbiddenRuntimeIdentifiers = [
        'notebook-navigator-calendar',
        'notebook-navigator-folder-note-sidebar',
        'notebook-navigator-view',
        'notebook-navigator-mobile',
        'notebook-navigator-android',
        'notebook-navigator-ios',
        'notebook-navigator-ios-floating-toolbars',
        'notebook-navigator-visible',
        'application/x-notebook-navigator-tag',
        'application/x-notebook-navigator-property',
        'application/x-notebook-shortcut',
        'application/x-notebook-navigator-shortcut',
        'application/x-notebook-navigator-color',
        'notebook-navigator-svg-filters',
        'notebook-navigator-frosted',
        'notebooknavigator'
    ];
    for (const identifier of forbiddenRuntimeIdentifiers) {
        if (new RegExp(`(?<!tps-)${escapeRegExp(identifier)}`, 'u').test(main)) {
            fail(`main.js contains the upstream runtime identifier ${identifier}.`);
        }
    }
    if (upstreamMainToken.test(main)) {
        fail('main.js contains an upstream CSS/DOM namespace token.');
    }
    if (!main.includes('tps-notebook-navigator') || !main.includes('tps-nn-')) {
        fail('main.js is missing the TPS runtime identity.');
    }
    if (main.includes('DndDescribedBy') || main.includes('DndLiveRegion')) {
        fail('main.js contains an upstream dnd-kit accessibility ID prefix.');
    }
    if (!main.includes(TPS_DND_KIT_DESCRIBED_BY_PREFIX) || !main.includes(TPS_DND_KIT_LIVE_REGION_PREFIX)) {
        fail('main.js is missing a TPS dnd-kit accessibility ID prefix.');
    }

    return manifest.version;
}

export async function checkTpsArtifacts(root = repositoryRoot) {
    const [manifestText, packageText, main, styles, styleSettingsSource] = await Promise.all(
        ['manifest.json', 'package.json', 'main.js', 'styles.css', 'src/styles/sections/settings-style-settings.css'].map(fileName =>
            readFile(path.join(root, fileName), 'utf8')
        )
    );
    return assertTpsArtifactIdentity({ manifestText, packageText, main, styles, styleSettingsSource });
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
    const version = await checkTpsArtifacts();
    console.log(`[TPS artifact identity] ok version=${version}`);
}
