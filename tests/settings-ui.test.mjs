import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';

const stub = `
export class PluginSettingTab {
 constructor(app, plugin) { this.app=app; this.plugin=plugin; this.containerEl=document.createElement('div'); }
}
export class Setting {
 constructor(parent) { this.settingEl=parent.createDiv(); }
 setName(name) { this.settingEl.createEl('label',{text:name}); return this; }
 addSearch(configure) {
  const inputEl=this.settingEl.createEl('input'); inputEl.type='search';
  configure({inputEl,onChange:cb=>inputEl.addEventListener('input',()=>cb(inputEl.value))}); return this;
 }
}`;
const compiled = await build({ entryPoints: ['src/settings-tab.ts'], write: false, bundle: true,
  format: 'iife', globalName: 'TPSSettingsTest', plugins: [{ name: 'obsidian-ui-boundary', setup(plugin) {
    plugin.onResolve({ filter: /^obsidian$/ }, () => ({ path: 'obsidian', namespace: 'stub' }));
    plugin.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: stub, loader: 'js' }));
  } }] });
function fixture(sections) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
  const { window } = dom;
  Object.assign(window.HTMLElement.prototype, {
    empty() { this.replaceChildren(); }, addClass(name) { this.classList.add(name); },
    createEl(tag, options = {}) { const el = window.document.createElement(tag); if (options.text) el.textContent=options.text; if(options.cls) el.className=options.cls; this.append(el); return el; },
    createDiv(options) { return this.createEl('div', options); }
  });
  window.eval(compiled.outputFiles[0].text + '\nwindow.__TPSSettingsTest = TPSSettingsTest;');
  const tab = new window.__TPSSettingsTest.SuiteSettingsTab({}, {}, sections);
  window.document.body.append(tab.containerEl);
  return { dom, tab, el: tab.containerEl };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('settings routes mount one selected section and restore keyboard focus', async () => {
  const events = [];
  const section = (id, destination) => ({ id, destination, label: id, keywords: [], async render(el) {
    events.push('render:'+id); el.createEl('p',{text:id}); return () => events.push('dispose:'+id);
  } });
  const f = fixture([section('properties','notes'), section('nutrition','health')]);
  f.tab.display(); await settle();
  assert.deepEqual(events, ['render:properties']);
  f.el.querySelector('[data-route="health"]').click(); await settle();
  assert.deepEqual(events, ['render:properties','dispose:properties','render:nutrition']);
  assert.equal(f.el.ownerDocument.activeElement.dataset.route, 'health');
  assert.equal(f.el.querySelector('[data-route="health"]').getAttribute('aria-pressed'), 'true');
  f.tab.hide(); f.dom.window.close();
});
test('a settings renderer finishing after navigation is disposed, not retained', async () => {
  let finish, disposed = 0;
  const f = fixture([{ id:'slow', destination:'notes', label:'Slow', keywords:[], render:()=>new Promise(resolve=>{finish=resolve;}) }]);
  f.tab.display(); f.tab.openDestination('health'); finish(()=>disposed++); await settle();
  assert.equal(disposed, 1); f.tab.hide(); assert.equal(disposed, 1); f.dom.window.close();
});
test('search routes to the matching settings section without starting execution', async () => {
  let renders = 0;
  const f = fixture([{ id:'nutrition', destination:'health', label:'Nutrition', keywords:['protein'], async render(){renders++;return()=>{};} }]);
  f.tab.display();
  const input=f.el.querySelector('input'); input.value='protein'; input.dispatchEvent(new f.dom.window.Event('input'));
  assert.equal(renders,0);
  f.el.querySelector('.tps-suite-settings-search-results button').click(); await settle();
  assert.equal(renders,1); assert.equal(f.el.ownerDocument.activeElement.dataset.section,'nutrition');
  f.tab.hide();f.dom.window.close();
});
test('settings CSS is namespaced and has mobile layout without sticky navigation', async () => {
  const css = await readFile('styles.css','utf8');
  assert.match(css, /@media \(max-width: 600px\)/); assert.match(css,/overflow-x: auto/);
  assert.match(css,/height: auto/); assert.match(css,/:focus-visible/);
  assert.doesNotMatch(css,/position:\s*(?:fixed|sticky)/);
});
