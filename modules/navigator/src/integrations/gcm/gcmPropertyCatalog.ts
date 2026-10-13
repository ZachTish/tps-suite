import type { VaultProfilePropertyKey } from '../../settings/types';

/** Add catalog keys once; preserve explicit Navigator visibility and ordering. */
export function mergeGcmPropertyKeys(existing: VaultProfilePropertyKey[], catalog: unknown): VaultProfilePropertyKey[] {
    if (!Array.isArray(catalog)) return existing;
    const keys = new Set(existing.map(entry => entry.key.trim().toLowerCase()));
    const additions: VaultProfilePropertyKey[] = [];
    const entries: unknown[] = catalog;
    for (const value of entries) {
        if (!value || typeof value !== 'object' || !('key' in value) || typeof value.key !== 'string') continue;
        const key = value.key.trim();
        if (!key || keys.has(key.toLowerCase())) continue;
        keys.add(key.toLowerCase());
        additions.push({ key, showInNavigation: true, showInList: false, showInFileMenu: true });
    }
    return additions.length ? [...existing, ...additions] : existing;
}
