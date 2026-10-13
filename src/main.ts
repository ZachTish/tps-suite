import { Plugin } from 'obsidian';
import { SuiteSettingsTab } from './settings-tab';
import { ModuleRuntime } from './module-runtime.mjs';
import type { SuiteApi } from './contracts';

/** One real Obsidian entry point. Module ports are deliberately not activated yet. */
export default class TPSSuitePlugin extends Plugin {
  private readonly runtime = new ModuleRuntime();
  settingsTab!: SuiteSettingsTab;
  readonly api: SuiteApi = {
    version: 1,
    ready: false,
    moduleState: module => this.runtime.state(module),
    domain: module => this.runtime.api(module),
    openSettings: destination => {
      const settings = (this.app as any).setting;
      settings?.open(); settings?.openTabById(this.manifest.id);
      if (destination) this.settingsTab.openDestination(destination);
    }
  };
  onload() {
    this.settingsTab = new SuiteSettingsTab(this.app, this, []);
    this.addSettingTab(this.settingsTab);
    // No legacy plugin disables, settings writes, migrations or module starts.
    // Activation stays blocked until the integrated module implementations pass QA.
  }
  onunload() {
    this.settingsTab?.hide();
    void this.runtime.stop().catch((error: unknown) => console.error('[TPS Suite] shutdown failed', error));
  }
}
