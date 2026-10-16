import { describe, expect, it } from 'vitest';
import { checkProjectileCollision, createProjectile } from './projectile';
import { advanceProjectile } from './combatPhysics';
import { PLAYER_SIZE } from './game';

describe('bat return movement', () => {
  it('tracks the owner again after they move horizontally and vertically', () => {
    const bat = createProjectile('bat', 1, 400, 200, 550, 0, 10, { now: 1000, random: () => 0 });
    bat.returnPhase = 'returning';
    const first = advanceProjectile(bat, { x: 100, y: 200 }, 1100, 1 / 60);
    expect(first.velocityX).toBeLessThan(0);

    const owner = { x: 600, y: 350 };
    const second = advanceProjectile(first, owner, 1117, 1 / 60);
    const dx = owner.x + PLAYER_SIZE / 2 - first.x - first.width / 2;
    const dy = owner.y + PLAYER_SIZE / 2 - first.y - first.height / 2;
    expect(second.velocityX).toBeCloseTo(dx / Math.hypot(dx, dy) * 650);
    expect(second.velocityY).toBeCloseTo(dy / Math.hypot(dx, dy) * 650);
    expect(second.returnPhase).toBe('returning');
  });
});

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
