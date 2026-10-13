import { MODULES } from './migration.mjs';

const ids = new Set(MODULES.map(module => module.id));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const equal = (a, b) => {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((value, i) => equal(value, b[i]));
  if (!object(a) || !object(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && equal(a[key], b[key]));
};

function validateJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { for (const entry of value) validateJson(entry); return; }
  if (object(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    for (const [key, entry] of Object.entries(value)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe settings key.');
      validateJson(entry);
    }
    return;
  }
  throw new Error('Settings must contain JSON values.');
}

export function validateSuiteSettings(value) {
  validateJson(value);
  if (!object(value) || value.schemaVersion !== 1 || !object(value.modules)) throw new Error('Unsupported suite settings document.');
  for (const settings of Object.values(value.modules)) if (!object(settings)) throw new Error('Module settings must be an object.');
  return value;
}

// Merge only intentional edits, rejecting a changed destination. Arrays are atomic.
function mergeEdit(base, edited, latest, path) {
  const result = structuredClone(latest);
  for (const key of new Set([...Object.keys(base), ...Object.keys(edited)])) {
    const before = Object.hasOwn(base, key), after = Object.hasOwn(edited, key), current = Object.hasOwn(latest, key);
    if (before === after && equal(base[key], edited[key])) continue;
    if (before && after && current && object(base[key]) && object(edited[key]) && object(latest[key])) {
      result[key] = mergeEdit(base[key], edited[key], latest[key], [...path, key]);
      continue;
    }
    if (after === current && equal(edited[key], latest[key])) continue;
    if (before !== current || !equal(base[key], latest[key])) {
      throw new Error(`Settings changed elsewhere at ${[...path, key].join('.')}; reload before applying.`);
    }
    if (after) result[key] = structuredClone(edited[key]);
    else delete result[key];
  }
  return result;
}

/** Explicit rollback preparation only; never called on startup or note events. */
export function prepareLegacySettingsRollback(importedLegacy, suiteSettings, currentLegacy) {
  for (const value of [importedLegacy, suiteSettings, currentLegacy]) {
    validateJson(value);
    if (!object(value)) throw new Error('Rollback settings must be objects.');
  }
  return mergeEdit(importedLegacy, suiteSettings, currentLegacy, ['rollback']);
}

/** Serializes local writes; deliberately makes no cross-device transaction claim. */
export class ModuleSettingsStore {
  #read; #write; #tail = Promise.resolve(); #stopped = false;
  constructor({ read, write }) { this.#read = read; this.#write = write; }
  async read(moduleId) {
    this.#assertId(moduleId);
    const document = validateSuiteSettings(await this.#read());
    if (!Object.hasOwn(document.modules, moduleId)) throw new Error(`Settings for ${moduleId} have not been migrated.`);
    return structuredClone(document.modules[moduleId]);
  }
  update(moduleId, base, edited) {
    this.#assertId(moduleId);
    validateJson(base); validateJson(edited);
    if (!object(base) || !object(edited)) throw new Error('Module settings must be an object.');
    const capturedBase = structuredClone(base), capturedEdit = structuredClone(edited);
    const operation = this.#tail.then(async () => {
      if (this.#stopped) throw new Error('Settings owner stopped.');
      const document = validateSuiteSettings(await this.#read());
      if (this.#stopped) throw new Error('Settings owner stopped.');
      if (!Object.hasOwn(document.modules, moduleId)) throw new Error(`Settings for ${moduleId} have not been migrated.`);
      const latest = document.modules[moduleId];
      const merged = mergeEdit(capturedBase, capturedEdit, latest, [moduleId]);
      if (equal(latest, merged)) return false;
      const next = structuredClone(document);
      next.modules[moduleId] = merged;
      await this.#write(next);
      return true;
    });
    this.#tail = operation.catch(() => {});
    return operation;
  }
  stop() { this.#stopped = true; return this.#tail; }
  #assertId(id) { if (!ids.has(id)) throw new Error(`Unknown suite module: ${id}`); }
}

/** Supplied storage must be device-local, never suite data.json. */
export class DeviceModuleSelection {
  constructor(storage, key) { this.storage = storage; this.key = key; }
  read() {
    const raw = this.storage.getItem(this.key);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    if (value.version !== 1 || !Array.isArray(value.enabled) || value.enabled.some(id => !ids.has(id))) {
      throw new Error('Invalid device module selection.');
    }
    return [...new Set(['notes', ...value.enabled])];
  }
  save(enabled) {
    if (enabled.some(id => !ids.has(id))) throw new Error('Unknown suite module.');
    this.storage.setItem(this.key, JSON.stringify({ version: 1, enabled: [...new Set(['notes', ...enabled])] }));
  }
}
