import { describe, expect, it } from 'vitest';
import { checkProjectileCollision } from './projectile';

describe('checkProjectileCollision', () => {
  it('detects a projectile crossing a target before leaving the arena', () => {
    const projectile = { x: 810, y: 100, width: 10, height: 10 };
    const previousPosition = { x: 750, y: 100 };
    const target = { x: 780, y: 100, width: 20, height: 40 };

    expect(checkProjectileCollision(projectile, previousPosition, target)).toBe(true);
  });

  it('does not report a hit when a diagonal path misses the target', () => {
    const projectile = { x: 100, y: 100, width: 5, height: 5 };
    const previousPosition = { x: 0, y: 0 };
    const target = { x: 40, y: 0, width: 10, height: 10 };

    expect(checkProjectileCollision(projectile, previousPosition, target)).toBe(false);
  });
});
