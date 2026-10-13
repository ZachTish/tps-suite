import { describe, it, expect } from 'vitest';
import { mergeGcmPropertyKeys } from '../../src/integrations/gcm/gcmPropertyCatalog';
describe('GCM property catalog', () => {
 it('adds keys while preserving explicit visibility and avoiding feedback', () => {
  const existing = [{ key: 'Status', showInNavigation: false, showInList: true, showInFileMenu: false }];
  const merged = mergeGcmPropertyKeys(existing, [{key:'status'}, {key:'Cost'}, {key:'cost'}, {key:' '}]);
  expect(merged).toHaveLength(2); expect(merged[0]).toBe(existing[0]);
  expect(merged[1].showInNavigation).toBe(true);
  expect(mergeGcmPropertyKeys(merged,[{key:'Cost'}])).toBe(merged);
  expect(mergeGcmPropertyKeys(existing,null)).toBe(existing);
 });
});
