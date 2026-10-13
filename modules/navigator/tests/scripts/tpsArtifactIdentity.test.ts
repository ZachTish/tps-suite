import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as artifactIdentity from '../../scripts/check-tps-artifacts.mjs';
import * as runtimeNamespace from '../../scripts/tps-runtime-namespace.mjs';
import { TPS_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID as RUNTIME_STYLE_SETTINGS_ID } from '../../src/constants/tpsIdentity';

interface ArtifactInputs {
    manifestText: string;
    packageText: string;
    main: string;
    styles: string;
    styleSettingsSource: string;
}

interface ArtifactIdentityExports {
    assertTpsArtifactIdentity: (inputs: ArtifactInputs) => string;
    checkTpsArtifacts: (root: string) => Promise<string>;
    TPS_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID: string;
    UPSTREAM_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID: string;
}

interface RuntimeNamespaceExports {
    TPS_DND_KIT_DESCRIBED_BY_PREFIX: string;
    TPS_DND_KIT_LIVE_REGION_PREFIX: string;
}

const {
    assertTpsArtifactIdentity,
    checkTpsArtifacts,
    TPS_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID,
    UPSTREAM_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID
} = artifactIdentity as unknown as ArtifactIdentityExports;
const { TPS_DND_KIT_DESCRIBED_BY_PREFIX, TPS_DND_KIT_LIVE_REGION_PREFIX } = runtimeNamespace as unknown as RuntimeNamespaceExports;

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(dirname, '../..');

function createFixture(): ArtifactInputs {
    const styleSettingsBlock = `/* @settings\nname: TPS Notebook Navigator\nid: ${TPS_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID}\n*/`;
    return {
        manifestText: JSON.stringify({ id: 'tps-notebook-navigator', version: '9.8.7' }),
        packageText: JSON.stringify({ name: 'tps-notebook-navigator', version: '9.8.7' }),
        main: ['tps-notebook-navigator', 'tps-nn-provider-row', TPS_DND_KIT_DESCRIBED_BY_PREFIX, TPS_DND_KIT_LIVE_REGION_PREFIX].join('\n'),
        styles: `${styleSettingsBlock}\n.tps-notebook-navigator {}\n.tps-nn-provider-row {}`,
        styleSettingsSource: styleSettingsBlock
    };
}

describe('TPS generated artifact identity gate', () => {
    it('accepts the current repository artifacts and a minimal isolated fixture', async () => {
        expect(TPS_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID).toBe(RUNTIME_STYLE_SETTINGS_ID);
        const manifest = JSON.parse(await readFile(path.join(repositoryRoot, 'manifest.json'), 'utf8')) as { version: string };
        expect(await checkTpsArtifacts(repositoryRoot)).toBe(manifest.version);
        expect(assertTpsArtifactIdentity(createFixture())).toBe('9.8.7');
    });

    it('rejects the host-global upstream Style Settings ID in source or generated CSS', () => {
        for (const key of ['styleSettingsSource', 'styles'] as const) {
            const fixture = createFixture();
            fixture[key] = fixture[key].replace(TPS_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID, UPSTREAM_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID);

            expect(() => assertTpsArtifactIdentity(fixture)).toThrow(/Style Settings ID/u);
        }
    });

    it('rejects the actual upstream shortcut drag MIME', () => {
        const fixture = createFixture();
        fixture.main += '\napplication/x-notebook-shortcut';

        expect(() => assertTpsArtifactIdentity(fixture)).toThrow(/application\/x-notebook-shortcut/u);
    });
});
