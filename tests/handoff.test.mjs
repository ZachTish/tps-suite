import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReviewedHandoff } from '../src/handoff.mjs';

const review = { token: 'synthetic-review', modules: ['notes', 'health'] };
function fixture() {
  let journal = null, fail = '', activations = 0;
  const calls = [];
  const op = name => async () => { calls.push(name); if (fail === name) throw new Error(name); };
  const ports = {
    readJournal: async () => structuredClone(journal),
    writeJournal: async value => { calls.push(`journal:${value.phase}`); journal = structuredClone(value); },
    validateReview: op('validate'), claimOwnership: op('guard'), stopLegacyAndDrain: op('stop'), verifyLegacyStopped: op('verify-stopped'),
    stageAndVerify: op('stage'), installAndVerify: op('install'), saveDeviceSelection: op('device'),
    activate: async () => { calls.push('activate'); activations++; if (fail === 'activate') throw new Error('activation failed'); },
    stopSuiteAndDrain: op('stop-suite')
  };
  return { ports, calls, get journal() { return journal; }, set fail(value) { fail = value; }, get activations() { return activations; } };
}
test('handoff stops legacy owners before installing or activating', async () => {
  const f = fixture(), handoff = new ReviewedHandoff(f.ports); await handoff.apply(review);
  assert.deepEqual(f.calls, ['validate','journal:reviewed','guard','stop','verify-stopped','validate','stage','journal:staged','install','journal:installed','device','activate','journal:committed']);
  await handoff.apply(review); assert.equal(f.activations, 1);
  assert.deepEqual(Object.keys(f.journal).sort(), ['modules','phase','token','version']);
});
for (const boundary of ['validate','guard','stop','verify-stopped','stage','install','device']) {
  test(`failure at ${boundary} cannot activate and explicit resume succeeds`, async () => {
    const f = fixture(), handoff = new ReviewedHandoff(f.ports); f.fail = boundary;
    await assert.rejects(handoff.apply(review), new RegExp(boundary)); assert.equal(f.activations, 0);
    f.fail = ''; await handoff.apply(review); assert.equal(f.activations, 1); assert.equal(f.journal.phase, 'committed');
  });
}
test('changed review cannot reuse an earlier staged handoff', async () => {
  const f = fixture(), handoff = new ReviewedHandoff(f.ports); f.fail = 'install';
  await assert.rejects(handoff.apply(review)); f.fail = '';
  await assert.rejects(handoff.apply({ ...review, token: 'different' }), /Review/);
  assert.equal(f.activations, 0);
});
test('unloading during validation prevents all mutation ports', async () => {
  const f = fixture(); let release;
  f.ports.validateReview = () => new Promise(resolve => { release = resolve; });
  const handoff = new ReviewedHandoff(f.ports), applying = handoff.apply(review);
  await Promise.resolve(); handoff.stop(); release(); await assert.rejects(applying, /stopped/);
  assert.deepEqual(f.calls, []);
});
test('partial activation failure stops suite owners before an explicit retry', async () => {
  const f = fixture(), handoff = new ReviewedHandoff(f.ports); f.fail = 'activate';
  await assert.rejects(handoff.apply(review), /activation failed/);
  assert.equal(f.calls.at(-1), 'stop-suite'); assert.equal(f.journal.phase, 'installed');
  f.fail = ''; await handoff.apply(review); assert.equal(f.journal.phase, 'committed');
});
test('a failed committed-journal write stops activated owners', async () => {
  const f = fixture(), save = f.ports.writeJournal;
  f.ports.writeJournal = async value => { if (value.phase === 'committed') throw new Error('disk full'); await save(value); };
  await assert.rejects(new ReviewedHandoff(f.ports).apply(review), /disk full/);
  assert.equal(f.calls.at(-1), 'stop-suite'); assert.equal(f.journal.phase, 'installed');
});
