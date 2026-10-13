import type { App, TFile } from 'obsidian';
import { TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID } from '../constants/tpsIdentity';
import { getPluginById, getRecordValue, isRecord } from './typeGuards';

export interface TpsTemplateIdentityApi {
    version: number;
    getMode: () => string;
    matches: (file: TFile) => boolean;
    canAutomaticallyMutate?: (file: TFile) => Promise<boolean>;
    canAutomaticallyMutateSource?: (source: string) => boolean;
    canAutomaticallyMutateFrontmatter?: (frontmatter: unknown) => boolean;
    prepareInstanceSource?: (source: string) => string | null;
}

export function getTpsTemplateIdentityApi(app: App): TpsTemplateIdentityApi | null {
    const plugin = getPluginById(app, TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID);
    if (!plugin || !isRecord(plugin)) {
        return null;
    }
    const api = getRecordValue(plugin, 'api');
    if (!isRecord(api)) {
        return null;
    }
    const templates = getRecordValue(api, 'templates');
    if (!isRecord(templates)) {
        return null;
    }
    const getMode = getRecordValue(templates, 'getMode');
    const matches = getRecordValue(templates, 'matches');
    if (getRecordValue(templates, 'version') !== 1 || typeof getMode !== 'function' || typeof matches !== 'function') {
        return null;
    }
    const canAutomaticallyMutate = getRecordValue(templates, 'canAutomaticallyMutate');
    const canAutomaticallyMutateSource = getRecordValue(templates, 'canAutomaticallyMutateSource');
    const canAutomaticallyMutateFrontmatter = getRecordValue(templates, 'canAutomaticallyMutateFrontmatter');
    const prepareInstanceSource = getRecordValue(templates, 'prepareInstanceSource');
    return {
        version: 1,
        getMode: () => String(getMode.call(templates)),
        matches: (file: TFile) => matches.call(templates, file) === true,
        ...(typeof canAutomaticallyMutate === 'function'
            ? { canAutomaticallyMutate: async (file: TFile) => (await canAutomaticallyMutate.call(templates, file)) === true }
            : {}),
        ...(typeof canAutomaticallyMutateSource === 'function'
            ? { canAutomaticallyMutateSource: (source: string) => canAutomaticallyMutateSource.call(templates, source) === true }
            : {}),
        ...(typeof canAutomaticallyMutateFrontmatter === 'function'
            ? {
                  canAutomaticallyMutateFrontmatter: (frontmatter: unknown) =>
                      canAutomaticallyMutateFrontmatter.call(templates, frontmatter) === true
              }
            : {}),
        ...(typeof prepareInstanceSource === 'function'
            ? {
                  prepareInstanceSource: (source: string) => {
                      const prepared: unknown = prepareInstanceSource.call(templates, source);
                      return typeof prepared === 'string' ? prepared : null;
                  }
              }
            : {})
    };
}

export function getTpsTemplateIdentificationMode(app: App): string | null {
    const api = getTpsTemplateIdentityApi(app);
    if (!api) {
        return null;
    }
    try {
        return api.getMode();
    } catch {
        return null;
    }
}

export function isTpsTemplateFile(app: App, file: TFile): boolean | null {
    const api = getTpsTemplateIdentityApi(app);
    if (!api) {
        return null;
    }
    try {
        return api.matches(file);
    } catch {
        return false;
    }
}

export async function canTpsAutomaticallyMutateFile(app: App, file: TFile): Promise<boolean | null> {
    const api = getTpsTemplateIdentityApi(app);
    if (!api?.canAutomaticallyMutate) {
        return null;
    }
    try {
        return (await api.canAutomaticallyMutate(file)) === true;
    } catch {
        return false;
    }
}

export function canTpsAutomaticallyMutateSource(app: App, source: string): boolean | null {
    const api = getTpsTemplateIdentityApi(app);
    if (!api?.canAutomaticallyMutateSource) {
        return null;
    }
    try {
        return api.canAutomaticallyMutateSource(source) === true;
    } catch {
        return false;
    }
}

export function canTpsAutomaticallyMutateFrontmatter(app: App, frontmatter: unknown): boolean | null {
    const api = getTpsTemplateIdentityApi(app);
    if (!api?.canAutomaticallyMutateFrontmatter) {
        return null;
    }
    try {
        return api.canAutomaticallyMutateFrontmatter(frontmatter) === true;
    } catch {
        return false;
    }
}

export function prepareTpsTemplateInstanceSource(app: App, source: string): string | null | undefined {
    const api = getTpsTemplateIdentityApi(app);
    if (!api?.prepareInstanceSource) {
        return undefined;
    }
    try {
        return api.prepareInstanceSource(source);
    } catch {
        return null;
    }
}

export async function sanitizeTpsTemplateInstanceFile(app: App, file: TFile): Promise<boolean> {
    const api = getTpsTemplateIdentityApi(app);
    if (!api?.prepareInstanceSource) {
        return true;
    }
    let accepted = false;
    try {
        await app.vault.process(file, currentSource => {
            const prepared = prepareTpsTemplateInstanceSource(app, currentSource);
            if (typeof prepared !== 'string') {
                return currentSource;
            }
            accepted = true;
            return prepared;
        });
        return accepted;
    } catch {
        return false;
    }
}
