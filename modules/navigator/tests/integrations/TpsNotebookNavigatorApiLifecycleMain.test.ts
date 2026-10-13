import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.resolve(dirname, '../../src/main.ts');

function expectOrdered(source: string, snippets: readonly string[]): void {
    let previous = -1;
    for (const snippet of snippets) {
        const index = source.indexOf(snippet);
        expect(index, `Missing main lifecycle hook: ${snippet}`).toBeGreaterThan(previous);
        previous = index;
    }
}

describe('TPS Notebook Navigator API lifecycle main integration', () => {
    it('starts before asynchronous settings bootstrap and publishes only after startup registration', async () => {
        const main = await readFile(mainPath, 'utf8');
        const onload = main.slice(main.indexOf('async onload()'), main.indexOf('onUserEnable(): void'));
        const completeStartup = main.slice(
            main.indexOf('private async completeStartup'),
            main.indexOf('public registerSettingsUpdateListener')
        );

        expectOrdered(onload, ['this.apiLifecycle.start();', 'this.settingsController.loadSettingsAtStartup']);
        expectOrdered(completeStartup, [
            'this.api = new NotebookNavigatorAPI',
            'this.registerView(NOTEBOOK_NAVIGATOR_VIEW',
            'registerNavigatorCommands(this);',
            'registerWorkspaceEvents(this);',
            'this.coreTagSearchRouter = new CoreTagSearchRouter',
            'this.coreTagSearchRouter.start();',
            'this.hasStartedWithSettings = true;',
            'this.apiLifecycle?.publishAvailable(this.api);'
        ]);
    });

    it('publishes unavailable before provider registries are disposed and the API is cleared', async () => {
        const main = await readFile(mainPath, 'utf8');
        const unload = main.slice(main.indexOf('onunload()'), main.indexOf('async saveSettingsAndUpdate'));

        expectOrdered(unload, [
            'this.initiateShutdown();',
            'this.apiLifecycle?.stop();',
            'this.api?.[INTERNAL_NOTEBOOK_NAVIGATOR_API].types.dispose();',
            'this.api?.[INTERNAL_NOTEBOOK_NAVIGATOR_API].rows.dispose();',
            'this.api = null;'
        ]);
    });

    it('routes Core tag activations through one reveal-ready-reset-select sequence and disposes it during shutdown', async () => {
        const main = await readFile(mainPath, 'utf8');
        const route = main.slice(
            main.indexOf('private async routeCoreTagSearchToNavigator'),
            main.indexOf('private isCurrentCoreTagRoute')
        );
        const shutdown = main.slice(main.indexOf('private initiateShutdown()'), main.indexOf('private stopNavigatorContentProcessing'));

        expectOrdered(route, [
            'const requestId = ++this.coreTagRouteRequestId;',
            'const leaf = await this.activateView();',
            'await view.whenReady()',
            'view.navigateToTag(tagPath, { preserveNavigationFocus: false })',
            'await view.setListSearch(null)'
        ]);
        expectOrdered(shutdown, [
            'this.isUnloading = true;',
            'this.coreTagRouteRequestId += 1;',
            'this.coreTagSearchRouter?.dispose();',
            'this.coreTagSearchRouter = null;'
        ]);
    });

    it('migrates the former tagged-only root selection before registering navigator views', async () => {
        const main = await readFile(mainPath, 'utf8');
        const completeStartup = main.slice(
            main.indexOf('private async completeStartup'),
            main.indexOf('public registerSettingsUpdateListener')
        );

        expectOrdered(completeStartup, [
            'selectedTag === TAGGED_TAG_ID',
            'localStorage.set(STORAGE_KEYS.selectedTagKey, ALL_TAGS_TAG_ID);',
            'copyFormerTagsRootPresentationSettings(this.settings)',
            'this.registerView(NOTEBOOK_NAVIGATOR_VIEW'
        ]);
        const presentationMigration = completeStartup.slice(
            completeStartup.indexOf('copyFormerTagsRootPresentationSettings(this.settings)'),
            completeStartup.indexOf('// Initialize recent data management')
        );
        expectOrdered(presentationMigration, [
            'copyFormerTagsRootPresentationSettings(this.settings)',
            'if (shouldPersistMigratedSettings)',
            'await this.saveData(this.settingsController.getPersistableSettings());'
        ]);
    });
});
