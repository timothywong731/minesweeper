import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../js/logic.js';

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('mulberry32 different seeds produce different streams', () => {
  const a = [mulberry32(1)(), mulberry32(1)(), mulberry32(1)(), mulberry32(1)(), mulberry32(1)()];
  const b = [mulberry32(2)(), mulberry32(2)(), mulberry32(2)(), mulberry32(2)(), mulberry32(2)()];
  assert.notDeepEqual(a, b);
});

test('mulberry32 values stay in [0, 1)', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert(v >= 0 && v < 1, `value out of range: ${v}`);
  }
});
