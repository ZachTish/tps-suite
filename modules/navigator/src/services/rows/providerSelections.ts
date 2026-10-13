/* TPS Notebook Navigator - combines built-in settings and public row registrations. */

import type { NavigatorRowProviderOptions, NavigatorRowProviderSelection } from './types';

export function mergeNavigatorRowProviderSelections(
    ...selections: readonly NavigatorRowProviderSelection[]
): NavigatorRowProviderSelection {
    const enabledProviderIds: string[] = [];
    const seen = new Set<string>();
    const optionsByProviderId: Record<string, NavigatorRowProviderOptions> = {};

    for (const selection of selections) {
        for (const providerId of selection.enabledProviderIds) {
            if (seen.has(providerId)) {
                continue;
            }
            seen.add(providerId);
            enabledProviderIds.push(providerId);
            optionsByProviderId[providerId] = selection.optionsByProviderId?.[providerId] ?? {};
        }
    }

    return {
        enabledProviderIds,
        optionsByProviderId
    };
}
