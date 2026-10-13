// Pure migration preparation. No vault access, plugin activation, or persistence.
export const MODULES = Object.freeze([
  { id: 'notes', legacyId: 'tps-global-context-menu' },
  { id: 'controller', legacyId: 'tps-controller' },
  { id: 'calendar', legacyId: 'tps-calendar-base' },
  { id: 'health', legacyId: 'tps-health' },
  { id: 'finances', legacyId: 'tps-finances' },
  { id: 'linter', legacyId: 'tps-linter' },
  { id: 'navigator', legacyId: 'tps-notebook-navigator' },
  { id: 'notifier', legacyId: 'tps-messager' },
  { id: 'ai', legacyId: 'tps-ai-gateway' }
].map(Object.freeze));

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new Error(`${label} must be a settings object.`);
  }
}

/**
 * Build a candidate from already-parsed legacy data.json objects.
 * Missing source means "not supplied", never "use defaults".
 * Existing module namespaces always win, including an empty object.
 * Does not copy separate session files, caches, or SecretStorage values.
 * Legacy settings may contain secrets: callers must never log this result.
 */
export function prepareSettingsImport(existing, legacySettings) {
  requireObject(existing, 'Suite settings');
  requireObject(legacySettings, 'Legacy settings');
  if (Object.hasOwn(existing, 'schemaVersion') && existing.schemaVersion !== 1) {
    throw new Error('Unsupported suite settings version; no migration was prepared.');
  }
  if (Object.hasOwn(existing, 'modules')) requireObject(existing.modules, 'Module settings');
  const next = structuredClone(existing);
  next.schemaVersion = 1;
  next.modules ??= {};
  const imported = [];
  const retained = [];
  const missing = [];
  for (const { id, legacyId } of MODULES) {
    if (Object.hasOwn(next.modules, id)) {
      requireObject(next.modules[id], `${id} settings`);
      retained.push(id);
    } else if (Object.hasOwn(legacySettings, legacyId)) {
      requireObject(legacySettings[legacyId], `${legacyId} settings`);
      next.modules[id] = structuredClone(legacySettings[legacyId]);
      imported.push(id);
    } else {
      missing.push(id);
    }
  }
  return { settings: next, imported, retained, missing };
}

/** Run before registering any module command, listener, view, or writer. */
export function assertStandalonePluginsDisabled(moduleIds, enabledPluginIds) {
  const enabled = new Set(enabledPluginIds);
  const conflicts = [];
  for (const id of new Set(moduleIds)) {
    const module = MODULES.find(candidate => candidate.id === id);
    if (!module) throw new Error(`Unknown suite module: ${id}`);
    if (enabled.has(module.legacyId)) conflicts.push(module.legacyId);
  }
  if (conflicts.length) {
    throw new Error(`Disable standalone plugins before activating these suite modules: ${conflicts.join(', ')}.`);
  }
}
