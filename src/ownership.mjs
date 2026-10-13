import { MODULES } from './migration.mjs';

/** The only plugin-manager patch; installed before legacy owners are stopped. */
export function guardLegacyActivation(manager, moduleIds) {
  if (!manager || typeof manager.loadPlugin !== 'function' || !(manager.enabledPlugins instanceof Set)) {
    throw new Error('This Obsidian version cannot safely enforce TPS ownership. Suite activation is blocked.');
  }
  const blocked = new Set(moduleIds.map(id => {
    const module = MODULES.find(module => module.id === id);
    if (!module) throw new Error(`Unknown suite module: ${id}`);
    return module.legacyId;
  }));
  const original = manager.loadPlugin;
  let active = true;
  const guarded = function (id, ...args) {
    if (active && blocked.has(id)) return Promise.reject(new Error(`TPS Suite owns ${id}. Use the suite rollback workflow before enabling it.`));
    return Reflect.apply(original, this, [id, ...args]);
  };
  manager.loadPlugin = guarded;
  if (manager.loadPlugin !== guarded) throw new Error('Cannot install the TPS ownership guard.');
  return () => {
    active = false;
    // Do not erase a later wrapper installed by another plugin.
    if (manager.loadPlugin === guarded) manager.loadPlugin = original;
  };
}
