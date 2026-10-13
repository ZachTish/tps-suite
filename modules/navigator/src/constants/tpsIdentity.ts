/*
 * TPS Notebook Navigator - isolated runtime identity.
 *
 * Keep every host-global identifier in this module. The fork is intentionally
 * co-installable with upstream Notebook Navigator, so no view, icon, event,
 * storage, database, drag payload, or DOM root identifier may be shared.
 */

export const TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID = 'tps-notebook-navigator';
export const TPS_NOTEBOOK_NAVIGATOR_DISPLAY_NAME = 'TPS Notebook Navigator';
export const TPS_NOTEBOOK_NAVIGATOR_REPOSITORY = 'ZachTish/tps-notebook-navigator';

export const TPS_NOTEBOOK_NAVIGATOR_VIEW = TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID;
export const TPS_NOTEBOOK_NAVIGATOR_CALENDAR_VIEW = 'tps-notebook-navigator-calendar';
export const TPS_NOTEBOOK_NAVIGATOR_FOLDER_NOTE_SIDEBAR_VIEW = 'tps-notebook-navigator-folder-note-sidebar';
export const TPS_NOTEBOOK_NAVIGATOR_FOLDER_NOTE_COMPANION_STATE_KEY = 'tpsNotebookNavigatorFolderNoteCompanion';

export const TPS_NOTEBOOK_NAVIGATOR_ICON_ID = TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID;
export const TPS_NOTEBOOK_NAVIGATOR_BETTER_PASTE_ICON_ID = `${TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID}-better-paste`;
export const TPS_NOTEBOOK_NAVIGATOR_ROOT_CLASS = TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID;
export const TPS_NOTEBOOK_NAVIGATOR_MOBILE_CLASS = 'tps-notebook-navigator-mobile';
export const TPS_NOTEBOOK_NAVIGATOR_ANDROID_CLASS = 'tps-notebook-navigator-android';
export const TPS_NOTEBOOK_NAVIGATOR_IOS_CLASS = 'tps-notebook-navigator-ios';
export const TPS_NOTEBOOK_NAVIGATOR_IOS_FLOATING_TOOLBARS_CLASS = 'tps-notebook-navigator-ios-floating-toolbars';
export const TPS_NOTEBOOK_NAVIGATOR_VISIBLE_EVENT = 'tps-notebook-navigator-visible';
export const TPS_NOTEBOOK_NAVIGATOR_VIEWPORT_EVENT = 'tps-notebook-navigator-viewport-change';
export const TPS_NOTEBOOK_NAVIGATOR_API_REQUEST_EVENT = 'tps:notebook-navigator-api-request';
export const TPS_NOTEBOOK_NAVIGATOR_API_CHANGED_EVENT = 'tps:notebook-navigator-api-changed';
export const TPS_NOTEBOOK_NAVIGATOR_TAG_DRAG_MIME = 'application/x-tps-notebook-navigator-tag';
export const TPS_NOTEBOOK_NAVIGATOR_PROPERTY_DRAG_MIME = 'application/x-tps-notebook-navigator-property';
export const TPS_NOTEBOOK_NAVIGATOR_SHORTCUT_DRAG_MIME = 'application/x-tps-notebook-navigator-shortcut';
export const TPS_NOTEBOOK_NAVIGATOR_COLOR_DRAG_MIME = 'application/x-tps-notebook-navigator-color';
export const TPS_NOTEBOOK_NAVIGATOR_SVG_FILTERS_ID = 'tps-notebook-navigator-svg-filters';
export const TPS_NOTEBOOK_NAVIGATOR_FROSTED_FILTER_ID = 'tps-notebook-navigator-frosted';
export const TPS_NOTEBOOK_NAVIGATOR_STYLE_SETTINGS_ID = 'tps-notebook-navigator-style-settings';

export const TPS_NOTEBOOK_NAVIGATOR_STORAGE_PREFIX = TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID;
export const TPS_NOTEBOOK_NAVIGATOR_DATABASE_NAMESPACE = TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID;
export const TPS_NOTEBOOK_NAVIGATOR_SETTINGS_TRANSFER_ID = TPS_NOTEBOOK_NAVIGATOR_PLUGIN_ID;
export const TPS_NOTEBOOK_NAVIGATOR_REACT_ID_PREFIX = 'tps-notebook-navigator-';

export const TPS_GLOBAL_CONTEXT_MENU_PLUGIN_ID = 'tps-global-context-menu';
export const TPS_GCM_API_REQUEST_EVENT = 'tps:gcm-api-request';
export const TPS_GCM_API_CHANGED_EVENT = 'tps:gcm-api-changed';
export const TPS_FILES_UPDATED_EVENT = 'tps:files-updated';

export const UPSTREAM_NOTEBOOK_NAVIGATOR_PLUGIN_ID = 'notebook-navigator';
export const UPSTREAM_NOTEBOOK_NAVIGATOR_REPOSITORY = 'johansan/notebook-navigator';

export function getTpsNotebookNavigatorDatabaseName(kind: 'cache' | 'icons', appId: string): string {
    return `${TPS_NOTEBOOK_NAVIGATOR_DATABASE_NAMESPACE}/${kind}/${appId}`;
}
