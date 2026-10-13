import { PluginSettingTab, Setting } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import type { Destination, SettingsSection } from './contracts';
import { DESTINATIONS, searchSettings } from './settings-routes.mjs';

export class SuiteSettingsTab extends PluginSettingTab {
  private destination: Destination = 'notes';
  private sectionId: string | null = null;
  private disposeSection: (() => void) | null = null;
  private generation = 0;

  constructor(app: App, private readonly host: Plugin, private readonly sections: readonly SettingsSection[]) {
    super(app, host);
  }

  openDestination(destination: Destination) {
    this.destination = destination;
    this.sectionId = null;
    this.display();
  }

  hide() {
    this.generation++;
    this.disposeSection?.();
    this.disposeSection = null;
  }

  display() {
    this.hide();
    const generation = this.generation;
    const container = this.containerEl;
    container.empty(); container.addClass('tps-suite-settings');
    container.createEl('h2', { text: 'Choose what to configure' });
    const routes = container.createDiv({ cls: 'tps-suite-settings-routes' });
    routes.setAttribute('aria-label', 'Settings destinations');
    for (const destination of DESTINATIONS) {
      const button = routes.createEl('button', { text: destination.label });
      button.type = 'button'; button.dataset.route = destination.id;
      button.setAttribute('aria-pressed', String(destination.id === this.destination));
      button.addEventListener('click', () => {
        this.openDestination(destination.id as Destination);
        this.containerEl.querySelector<HTMLButtonElement>(`[data-route="${destination.id}"]`)?.focus();
      });
    }
    const results = container.createDiv({ cls: 'tps-suite-settings-search-results' });
    new Setting(container).setName('Find a setting').addSearch(search => {
      search.inputEl.setAttribute('aria-label', 'Find a TPS setting');
      search.onChange(query => {
        results.empty();
        for (const section of searchSettings(this.sections, query)) {
          const button = results.createEl('button', { text: section.label }); button.type = 'button';
          button.addEventListener('click', () => {
            this.destination = section.destination; this.sectionId = section.id; this.display();
            this.containerEl.querySelector<HTMLButtonElement>(`[data-section="${section.id}"]`)?.focus();
          });
        }
      });
    });
    const sections = this.sections.filter(section => section.destination === this.destination);
    const selected = sections.find(section => section.id === this.sectionId) ?? sections[0];
    if (!selected) {
      container.createEl('p', { text: 'This module’s settings have not been ported yet. This development build cannot replace your standalone plugins.' });
      return;
    }
    const strip = container.createDiv({ cls: 'tps-suite-settings-sections' });
    for (const section of sections) {
      const button = strip.createEl('button', { text: section.label }); button.type = 'button'; button.dataset.section = section.id;
      button.setAttribute('aria-pressed', String(section === selected));
      button.addEventListener('click', () => {
        this.sectionId = section.id; this.display();
        this.containerEl.querySelector<HTMLButtonElement>(`[data-section="${section.id}"]`)?.focus();
      });
    }
    const content = container.createDiv({ cls: 'tps-suite-settings-content' });
    void selected.render(content, this.host).then(dispose => {
      if (generation !== this.generation) dispose();
      else this.disposeSection = dispose;
    }).catch(() => {
      if (generation === this.generation) content.createEl('p', { text: 'This settings section could not be loaded. Your saved settings were not replaced.' });
    });
  }
}
