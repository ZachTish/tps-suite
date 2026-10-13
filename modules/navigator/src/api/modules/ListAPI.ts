/*
 * TPS Notebook Navigator - pull-based access to the primary mounted list view.
 */

import { NOTEBOOK_NAVIGATOR_VIEW } from '../../types';
import { validateListPresentationUpdate, validateListSearchUpdate } from '../../services/listViewState/publicListState';
import type { NavigatorListPresentationUpdate, NavigatorListSearchUpdate, NavigatorListSnapshot } from '../types';

type NavigatorListView = {
    getListSnapshot?: () => NavigatorListSnapshot | null;
    setListSearch?: (update: NavigatorListSearchUpdate | null) => Promise<boolean> | boolean;
    setListPresentation?: (update: NavigatorListPresentationUpdate) => Promise<boolean> | boolean;
    whenReady?: () => Promise<boolean>;
};

type LeafWithView = { view: object | null };

type ListAPIHost = {
    app: {
        workspace: { getLeavesOfType: (viewType: string) => LeafWithView[] };
    };
};

/**
 * List API - query or control the first currently mounted TPS Navigator list.
 * It deliberately never opens a Navigator view and exposes no push subscription.
 */
export class ListAPI {
    constructor(private readonly api: ListAPIHost) {}

    async getSnapshot(): Promise<NavigatorListSnapshot | null> {
        const view = await this.getReadyPrimaryView();
        if (!view || typeof view.getListSnapshot !== 'function') {
            return null;
        }
        return view.getListSnapshot();
    }

    async setSearch(update: NavigatorListSearchUpdate | null): Promise<boolean> {
        const validated = validateListSearchUpdate(update);
        if (!validated.ok) {
            return false;
        }

        const view = await this.getReadyPrimaryView();
        if (!view || typeof view.setListSearch !== 'function') {
            return false;
        }
        return view.setListSearch(validated.value);
    }

    async setPresentation(update: NavigatorListPresentationUpdate): Promise<boolean> {
        const validated = validateListPresentationUpdate(update);
        if (!validated.ok) {
            return false;
        }

        const view = await this.getReadyPrimaryView();
        if (!view || typeof view.setListPresentation !== 'function') {
            return false;
        }
        return view.setListPresentation(validated.value);
    }

    private async getReadyPrimaryView(): Promise<NavigatorListView | null> {
        const initial = this.getPrimaryView();
        if (!initial) {
            return null;
        }
        if (initial.whenReady && !(await initial.whenReady())) {
            return null;
        }

        // Readiness is asynchronous. Re-resolve the first view so a closed/reordered
        // leaf cannot receive a command intended for the original primary instance.
        return this.getPrimaryView() === initial ? initial : null;
    }

    private getPrimaryView(): NavigatorListView | null {
        const leaves = this.api.app.workspace.getLeavesOfType(NOTEBOOK_NAVIGATOR_VIEW);
        for (const leaf of leaves) {
            const view = leaf.view;
            if (view && this.isNavigatorListView(view)) {
                return view;
            }
        }
        return null;
    }

    private isNavigatorListView(view: object): view is NavigatorListView {
        return (
            ('getListSnapshot' in view && typeof view.getListSnapshot === 'function') ||
            ('setListSearch' in view && typeof view.setListSearch === 'function') ||
            ('setListPresentation' in view && typeof view.setListPresentation === 'function')
        );
    }
}
