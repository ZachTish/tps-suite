import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModuleRuntime, orderModules } from '../src/module-runtime.mjs';
import { guardLegacyActivation } from '../src/ownership.mjs';

function definition(id, events, requires = [], options = {}) {
  return { id, requires, create(context) {
    events.push(`create:${id}`);
    return { api: { id }, async start() { events.push(`start:${id}`); await options.start?.(context); },
      stop() { events.push(`stop:${id}`); }, async dispose() { events.push(`dispose:${id}`); } };
  } };
}
test('disabled modules instantiate nothing and dependencies start before consumers', async () => {
  const events = [], runtime = new ModuleRuntime();
  await runtime.start([definition('health', events, ['notes']), definition('notes', events), definition('ai', events)], ['health'], {});
  assert.deepEqual(events, ['create:notes', 'start:notes', 'create:health', 'start:health']);
  assert.equal(runtime.state('ai'), 'disabled'); assert.equal(runtime.api('notes').id, 'notes');
  const done = runtime.stop();
  assert.deepEqual(events.slice(-2), ['stop:health', 'stop:notes']);
  assert.equal(runtime.api('notes'), undefined);
  await done; assert.deepEqual(events.slice(-2), ['dispose:health', 'dispose:notes']);
});
test('late startup cannot publish an API or start the next module after unload', async () => {
  let finish; const events = [], runtime = new ModuleRuntime();
  const start = runtime.start([definition('notes', events, [], { start: () => new Promise(resolve => { finish = resolve; }) }), definition('health', events, ['notes'])], ['health'], {});
  const stop = runtime.stop(); finish(); await start; await stop;
  assert.equal(runtime.api('notes'), undefined); assert.equal(events.includes('create:health'), false);
  assert.equal(events.filter(event => event === 'dispose:notes').length, 1);
});
test('optional failure disposes partial module and keeps unrelated consumers working', async () => {
  const events = [], errors = [], runtime = new ModuleRuntime();
  await runtime.start([definition('notes', events), definition('health', events, ['notes'], { start: () => { throw new Error('fixture'); } }), definition('calendar', events, ['notes']), definition('dependent', events, ['health'])], ['health', 'calendar', 'dependent'], { onError: id => errors.push(id) });
  assert.deepEqual(errors, ['health']); assert.equal(runtime.state('health'), 'failed');
  assert.equal(runtime.state('calendar'), 'ready'); assert.equal(runtime.state('dependent'), 'dependency-failed');
  assert.equal(events.filter(event => event === 'dispose:health').length, 1); await runtime.stop();
});
test('cycles and missing dependencies fail before factories execute', () => {
  assert.throws(() => orderModules([{ id: 'notes', requires: ['health'] }, { id: 'health', requires: ['notes'] }], ['health']), /Circular/);
  assert.throws(() => orderModules([{ id: 'notes' }, { id: 'health', requires: ['ai'] }], ['health']), /requires enabled/);
});
test('legacy load is blocked before its loader runs, unrelated plugins are unchanged', async () => {
  const calls = [], manager = { enabledPlugins: new Set(), async loadPlugin(id) { calls.push([this, id]); return 42; } };
  const original = manager.loadPlugin, dispose = guardLegacyActivation(manager, ['notes', 'health']);
  await assert.rejects(manager.loadPlugin('tps-health'), /Suite owns/); assert.equal(calls.length, 0);
  assert.equal(await manager.loadPlugin('notebook-navigator'), 42); assert.equal(calls[0][0], manager);
  dispose(); assert.equal(manager.loadPlugin, original); await manager.loadPlugin('tps-health'); assert.equal(calls.length, 2);
});
test('guard removal preserves later wrappers and invalid managers are rejected', async () => {
  const manager = { enabledPlugins: new Set(), async loadPlugin() { return 'ok'; } };
  const dispose = guardLegacyActivation(manager, ['notes']); const prior = manager.loadPlugin;
  const later = function (...args) { return prior.apply(this, args); }; manager.loadPlugin = later;
  dispose(); assert.equal(manager.loadPlugin, later); assert.equal(await manager.loadPlugin('tps-global-context-menu'), 'ok');
  assert.throws(() => guardLegacyActivation({}, ['notes']), /blocked/);
});
