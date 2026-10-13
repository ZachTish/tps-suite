import type NotebookNavigatorPlugin from '../../main';
import { getActiveVaultProfile } from '../../utils/vaultProfiles';
import { casefold } from '../../utils/recordUtils';

export type PropertyVisibilitySurface = 'showInNavigation' | 'showInList' | 'showInFileMenu';

/** Settings adapter: Navigator remains the sole store for profile visibility. */
export function createPropertyVisibilityAPI(plugin: Pick<NotebookNavigatorPlugin, 'settings' | 'saveSettingsAndUpdate'>) {
    const get = (key: string) => {
        const profile = getActiveVaultProfile(plugin.settings);
        const entry = profile.propertyKeys.find(item => casefold(item.key.trim()) === casefold(key.trim()));
        return {
            profileId: profile.id,
            profileName: profile.name,
            showInNavigation: entry?.showInNavigation ?? false,
            showInList: entry?.showInList ?? false,
            showInFileMenu: entry?.showInFileMenu ?? false
        };
    };
    return {
        version: 1 as const,
        get,
        async set(key: string, surface: PropertyVisibilitySurface, visible: boolean, profileId: string) {
            const profile = getActiveVaultProfile(plugin.settings);
            if (profile.id !== profileId) throw new Error('Navigator profile changed. Reopen Custom properties before editing visibility.');
            const trimmed = key.trim();
            if (!trimmed || !['showInNavigation', 'showInList', 'showInFileMenu'].includes(surface) || typeof visible !== 'boolean') {
                throw new Error('Invalid Navigator property visibility request.');
            }
            const index = profile.propertyKeys.findIndex(item => casefold(item.key.trim()) === casefold(trimmed));
            const previous = index < 0 ? undefined : profile.propertyKeys[index];
            if (previous?.[surface] === visible) return get(trimmed);
            const next = {
                key: trimmed,
                showInNavigation: false,
                showInList: false,
                showInFileMenu: false,
                ...previous,
                [surface]: visible
            };
            if (index < 0) profile.propertyKeys.push(next);
            else profile.propertyKeys[index] = next;
            try {
                await plugin.saveSettingsAndUpdate();
            } catch (error) {
                // Saving normalizes/clones entries. Compare values rather than object identity,
                // and do not roll back a newer edit that changed the same entry.
                const currentProfile = plugin.settings.vaultProfiles.find(item => item.id === profile.id);
                const currentIndex =
                    currentProfile?.propertyKeys.findIndex(
                        item =>
                            casefold(item.key.trim()) === casefold(trimmed) &&
                            item.showInNavigation === next.showInNavigation &&
                            item.showInList === next.showInList &&
                            item.showInFileMenu === next.showInFileMenu
                    ) ?? -1;
                if (currentProfile && currentIndex >= 0) {
                    if (previous) currentProfile.propertyKeys[currentIndex] = previous;
                    else currentProfile.propertyKeys.splice(currentIndex, 1);
                }
                throw error;
            }
            return { profileId: profile.id, profileName: profile.name, ...next };
        }
    };
}
