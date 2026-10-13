import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModuleSettingsStore, DeviceModuleSelection, prepareLegacySettingsRollback } from '../src/settings-store.mjs';

function fixture() {
  let value = { schemaVersion: 1, modules: { health: { enabled: false, fields: { calories: 'energy', protein: 'protein' } }, navigator: { sort: 'name' } }, future: 42 };
  let writes = 0;
  const store = new ModuleSettingsStore({ read: async () => structuredClone(value), write: async next => { value = next; writes++; } });
  return { store, get value() { return value; }, get writes() { return writes; } };
}
test('concurrent module edits preserve sibling namespaces and unknown settings', async () => {
  const f = fixture();
  const a = await f.store.read('health'), b = await f.store.read('navigator');
  await Promise.all([f.store.update('health', a, { ...a, enabled: true }), f.store.update('navigator', b, { sort: 'frequency' })]);
  assert.equal(f.value.modules.health.enabled, true); assert.equal(f.value.modules.navigator.sort, 'frequency');
  assert.equal(f.value.future, 42); assert.equal(f.writes, 2);
});
test('100 unchanged settings saves perform zero writes', async () => {
  const f = fixture(), a = await f.store.read('health');
  await Promise.all(Array.from({ length: 100 }, () => f.store.update('health', a, a)));
  assert.equal(f.writes, 0);
});
test('stale edits preserve unrelated changes and reject overlapping changes', async () => {
  const f = fixture(), a = await f.store.read('health');
  f.value.modules.health.fields.protein = 'proteinG';
  await f.store.update('health', a, { ...a, fields: { ...a.fields, calories: 'calories' } });
  assert.deepEqual(f.value.modules.health.fields, { calories: 'calories', protein: 'proteinG' });
  await assert.rejects(f.store.update('health', a, { ...a, fields: { ...a.fields, calories: 'kcal' } }), /changed elsewhere/);
  assert.equal(f.writes, 1);
  const latest = await f.store.read('health');
  await f.store.update('health', latest, { ...latest, enabled: true });
  assert.equal(f.writes, 2); // A rejected save does not poison the queue.
});
test('explicit deletions are honored without deleting unedited new fields', async () => {
  const f = fixture(), a = await f.store.read('health');
  f.value.modules.health.addedElsewhere = true;
  await f.store.update('health', a, { fields: a.fields });
  assert.equal(Object.hasOwn(f.value.modules.health, 'enabled'), false);
  assert.equal(f.value.modules.health.addedElsewhere, true);
});
test('unload blocks queued writes while a read is pending', async () => {
  let unblock, writes = 0;
  const store = new ModuleSettingsStore({ read: () => new Promise(resolve => { unblock = resolve; }), write: async () => { writes++; } });
  const saving = store.update('health', {}, { enabled: true });
  await Promise.resolve();
  const stopped = store.stop();
  unblock({ schemaVersion: 1, modules: { health: {} } });
  await assert.rejects(saving, /stopped/); await stopped; assert.equal(writes, 0);
});
test('malformed documents, unknown modules and unsafe keys cannot write', async () => {
  const f = fixture();
  assert.throws(() => f.store.update('typo', {}, {}), /Unknown/);
  assert.throws(() => f.store.update('health', {}, JSON.parse('{"__proto__":{"polluted":true}}')), /Unsafe/);
  f.value.schemaVersion = 2;
  await assert.rejects(f.store.read('health'), /Unsupported/);
  assert.equal(f.writes, 0);
});
test('feature choices are device independent and core always stays enabled', () => {
  const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };
  const mac = new DeviceModuleSelection(memory(), 'vault'), phone = new DeviceModuleSelection(memory(), 'vault');
  assert.equal(mac.read(), null); mac.save([]); phone.save(['health']);
  assert.deepEqual(mac.read(), ['notes']); assert.deepEqual(phone.read(), ['notes', 'health']);
});
test('rollback carries intentional suite edits without overwriting newer legacy edits', () => {
  const imported = { count: 1, field: 'old' };
  assert.deepEqual(prepareLegacySettingsRollback(imported, { ...imported, field: 'new' }, { ...imported, count: 2 }), { count: 2, field: 'new' });
  assert.throws(() => prepareLegacySettingsRollback(imported, { ...imported, field: 'new' }, { ...imported, field: 'different' }), /changed elsewhere/);
  assert.deepEqual(imported, { count: 1, field: 'old' });
});
