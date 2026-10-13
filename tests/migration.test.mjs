import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, prepareSettingsImport, assertStandalonePluginsDisabled } from '../src/migration.mjs';

test('imports every module without flattening colliding keys or changing disabled settings', () => {
  const legacy = Object.fromEntries(MODULES.map(({ legacyId }, index) => [legacyId, {
    enabled: false, propertyNames: { id: `custom-${index}` }, rules: [{ unknownFutureKey: index }]
  }]));
  const original = structuredClone(legacy);
  const result = prepareSettingsImport({}, legacy);
  assert.equal(result.imported.length, MODULES.length);
  assert.equal(result.missing.length, 0);
  for (const module of MODULES) assert.deepEqual(result.settings.modules[module.id], legacy[module.legacyId]);
  result.settings.modules.health.rules[0].unknownFutureKey = 'changed';
  assert.deepEqual(legacy, original);
});

test('rerunning migration preserves newer suite settings and unrelated state', () => {
  const first = prepareSettingsImport({ future: { value: 42 } }, { 'tps-health': { key: 'old' } });
  first.settings.modules.health.key = 'new';
  const again = prepareSettingsImport(first.settings, { 'tps-health': { key: 'older' } });
  assert.deepEqual(again.settings, first.settings);
  assert.deepEqual(again.imported, []);
  assert.deepEqual(again.retained, ['health']);
});

test('empty saved module settings are retained; absent source is reported without defaults', () => {
  const result = prepareSettingsImport({ modules: { health: {} } }, { 'tps-health': { enabled: true } });
  assert.deepEqual(result.settings.modules.health, {});
  assert.equal(result.missing.length, MODULES.length - 1);
  assert.equal(Object.keys(result.settings.modules).length, 1);
});

test('malformed source or destination fails without mutating input', () => {
  for (const bad of [null, [], 'invalid', 7]) {
    const existing = { modules: {} };
    assert.throws(() => prepareSettingsImport(existing, { 'tps-health': bad }));
    assert.deepEqual(existing, { modules: {} });
    assert.throws(() => prepareSettingsImport({ modules: bad }, {}));
  }
  assert.throws(() => prepareSettingsImport({ schemaVersion: 2 }, {}));
});

test('activation refuses overlapping standalone ownership', () => {
  assert.throws(() => assertStandalonePluginsDisabled(['health', 'notes'], ['tps-health', 'tps-global-context-menu']),
    /tps-global-context-menu/);
  assert.doesNotThrow(() => assertStandalonePluginsDisabled(['health'], ['tps-calendar-base', 'notebook-navigator']));
  assert.doesNotThrow(() => assertStandalonePluginsDisabled(MODULES.map(module => module.id), []));
  assert.throws(() => assertStandalonePluginsDisabled(['typo'], []), /Unknown suite module/);
});
