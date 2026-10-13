import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESTINATIONS, searchSettings } from '../src/settings-routes.mjs';

test('five settings routes include AI and preserve default Notes destination', () => {
  assert.deepEqual(DESTINATIONS.map(route => route.label), ['Notes & navigation','Calendar & reminders','Health','Finances','Connections & AI']);
  assert.equal(DESTINATIONS[0].id, 'notes');
});
test('settings search never renders sections or initializes runtimes', () => {
  let renders = 0;
  const sections = [{ id: 'nutrition', destination: 'health', label: 'Nutrition properties', keywords: ['calories', 'protein'], render: () => { renders++; } }];
  assert.deepEqual(searchSettings(sections, 'Protein NUTRITION'), sections);
  assert.deepEqual(searchSettings(sections, 'calendar'), []);
  assert.deepEqual(searchSettings(sections, ''), []);
  assert.equal(renders, 0);
});
