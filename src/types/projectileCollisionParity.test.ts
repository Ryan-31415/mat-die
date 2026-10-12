import { describe, expect, it } from 'vitest';
import { getProjectileCollisionTime } from './projectile';

// Frozen pre-optimization slab implementation: validates arithmetic, contact
// boundaries and early exits independently of the new allocation-free form.
const reference: typeof getProjectileCollisionTime = (projectile, previous, target) => {
  let entry = 0, exit = 1;
  for (const [start, delta, min, max] of [
    [previous.x, projectile.x - previous.x, target.x - projectile.width, target.x + target.width],
    [previous.y, projectile.y - previous.y, target.y - projectile.height, target.y + target.height],
  ]) {
    if (delta === 0) {
      if (start < min || start > max) return null;
      continue;
    }
    const first = (min - start) / delta, second = (max - start) / delta;
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit) return null;
  }
  return entry <= 1 && exit >= 0 ? entry : null;
};

describe('swept collision allocation optimization parity', () => {
  it('preserves stationary axes, boundary contacts, reverse sweeps and non-finite inputs', () => {
    const values = [-Infinity, -56, -0, 0, 12, 40, 56, Infinity, NaN];
    for (const x of values) for (const y of values) for (const dx of [-100, 0, 100]) {
      const shot = { x: x + dx, y, width: 56, height: 12 };
      const previous = { x, y: 0 }, target = { x: 0, y: 0, width: 40, height: 40 };
      expect(getProjectileCollisionTime(shot, previous, target)).toBe(reference(shot, previous, target));
    }
  });

  it('matches the original contact time on 2000 deterministic finite geometries', () => {
    let state = 731;
    const number = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296 * 1200 - 200);
    for (let i = 0; i < 2000; i++) {
      const shot = { x: number(), y: number(), width: Math.abs(number()), height: Math.abs(number()) };
      const previous = { x: number(), y: number() };
      const target = { x: number(), y: number(), width: Math.abs(number()), height: Math.abs(number()) };
      expect(getProjectileCollisionTime(shot, previous, target)).toBe(reference(shot, previous, target));
    }
  });
});
