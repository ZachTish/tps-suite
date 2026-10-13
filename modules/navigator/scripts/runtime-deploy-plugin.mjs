import { access, realpath } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPLOY_HELPER_URL = '../deploy-runtime.mjs';
const CONTAINED_WORKSPACE_MARKER_URL = '../workspace-paths.mjs';

/** @typedef {{ errors: readonly unknown[] }} BuildEndResult */
/** @typedef {{ onEnd(callback: (result: BuildEndResult) => void | Promise<void>): void }} BuildHooks */
/** @typedef {{ name: string, setup(build: BuildHooks): void }} RuntimeDeployPlugin */

/** @param {URL} url */
async function fileExists(url) {
    try {
        await access(fileURLToPath(url));
        return true;
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

/**
 * A sibling file name alone is not enough to authorize deployment. Confirm
 * that the checkout is under the test vault's exact contained directory shape
 * and that its marker is a real sibling before loading any adjacent deploy
 * hook. The marker is deliberately never imported or executed.
 *
 * @param {string | URL} configUrl
 * @param {URL} workspaceMarkerUrl
 */
async function isContainedDevelopmentWorkspace(configUrl, workspaceMarkerUrl) {
    if (!(await fileExists(workspaceMarkerUrl))) {
        return false;
    }
    const checkoutRoot = dirname(fileURLToPath(configUrl));
    const checkoutParent = dirname(checkoutRoot);
    const testVaultRoot = dirname(checkoutParent);
    if (basename(checkoutParent) !== 'Plugin Development' || basename(testVaultRoot) !== 'Obsidian Plugin Test Vault') {
        return false;
    }
    const [actualRoot, markerPath] = await Promise.all([realpath(checkoutParent), realpath(fileURLToPath(workspaceMarkerUrl))]);
    return dirname(markerPath) === actualRoot;
}

/**
 * @param {string} sourceFolder
 * @returns {RuntimeDeployPlugin}
 */
function createBuildOnlyPlugin(sourceFolder) {
    return {
        name: 'tps-standalone-build-only',
        setup(build) {
            build.onEnd(result => {
                if (result.errors.length > 0) {
                    return;
                }
                const lane = sourceFolder.endsWith(' (Optimize)') ? 'optimization' : 'standalone';
                console.log(`[runtime-deploy] target=none lane=${lane} ${sourceFolder}: build-only`);
            });
        }
    };
}

/**
 * Resolves the vault-owned runtime deployment hook without making public
 * checkouts depend on files outside this repository.
 *
 * The workspace marker makes a missing helper fail closed in the contained
 * test-vault layout. A standalone checkout has neither sibling file and gets
 * an explicit build-only plugin instead.
 *
 * @param {string} sourceFolder
 * @param {string | URL} configUrl
 * @returns {Promise<RuntimeDeployPlugin>}
 */
export async function resolveRuntimeDeployPlugin(sourceFolder, configUrl) {
    const deployHelperUrl = new URL(DEPLOY_HELPER_URL, configUrl);
    const workspaceMarkerUrl = new URL(CONTAINED_WORKSPACE_MARKER_URL, configUrl);
    const isContainedWorkspace = await isContainedDevelopmentWorkspace(configUrl, workspaceMarkerUrl);

    if (!isContainedWorkspace) {
        return createBuildOnlyPlugin(sourceFolder);
    }

    if (!(await fileExists(deployHelperUrl))) {
        throw new Error(`Contained TPS workspace is missing its runtime deployment helper: ${fileURLToPath(deployHelperUrl)}`);
    }

    const deployModule = await import(deployHelperUrl.href);
    if (typeof deployModule.runtimeDeployPlugin !== 'function') {
        throw new TypeError(`TPS runtime deployment helper does not export runtimeDeployPlugin(): ${fileURLToPath(deployHelperUrl)}`);
    }
    return /** @type {RuntimeDeployPlugin} */ (deployModule.runtimeDeployPlugin(sourceFolder));
}
