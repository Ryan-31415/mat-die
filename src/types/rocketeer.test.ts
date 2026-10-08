import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer } from './game';
import { createProjectile } from './projectile';
import { advanceProjectile, ROCKET_TURN_RATE } from './combatPhysics';

const owner = createInitialPlayer(1, CHARACTERS.rocketeer);
const target = { ...createInitialPlayer(2, CHARACTERS.gladiator), x: 400, y: 250 };

describe('rocket motion', () => {
  it.each([['rocket', 550], ['homing-rocket', 660]] as const)('%s accelerates to 160%% without losing speed in turns', (type, speed) => {
    let shot = createProjectile(type, 1, 100, 100, speed, 0, 16);
    shot = advanceProjectile(shot, owner, shot.createdAt + 500, 0.5, target);
    expect(Math.hypot(shot.velocityX, shot.velocityY)).toBeCloseTo(speed * 1.3);
    shot = advanceProjectile(shot, owner, shot.createdAt + 1000, 0.5, target);
    expect(Math.hypot(shot.velocityX, shot.velocityY)).toBeCloseTo(speed * 1.6);
    shot = advanceProjectile(shot, owner, shot.createdAt + 2000, 1, target);
    expect(Math.hypot(shot.velocityX, shot.velocityY)).toBeCloseTo(speed * 1.6);
  });
  it('limits homing turns and preserves straight flight while the target is invisible', () => {
    const shot = createProjectile('homing-rocket', 1, 100, 100, 660, 0, 16);
    const turned = advanceProjectile(shot, owner, shot.createdAt + 17, 1 / 60, target);
    expect(Math.atan2(turned.velocityY, turned.velocityX)).toBeCloseTo(ROCKET_TURN_RATE / 60);
    const hidden = advanceProjectile(turned, owner, shot.createdAt + 34, 1 / 60, { ...target, isInvisible: true });
    expect(Math.atan2(hidden.velocityY, hidden.velocityX)).toBeCloseTo(Math.atan2(turned.velocityY, turned.velocityX));
    const visible = advanceProjectile(hidden, owner, shot.createdAt + 51, 1 / 60, target);
    expect(Math.atan2(visible.velocityY, visible.velocityX)).toBeGreaterThan(Math.atan2(hidden.velocityY, hidden.velocityX));
    expect(shot.flightTimeMs).toBe(0);
  });
  it('retargets after reflection without resetting acceleration', () => {
    const shot = { ...createProjectile('homing-rocket', 1, 400, 100, 1056, 0, 16), initialSpeed: 660, flightTimeMs: 1000 };
    const reflected = { ...shot, ownerId: 2 as const, velocityX: -shot.velocityX };
    const next = advanceProjectile(reflected, target, shot.createdAt + 1017, 1 / 60, { ...owner, x: 100, y: 250 });
    expect(next.ownerId).toBe(2);
    expect(next.velocityX).toBeLessThan(0);
    expect(next.velocityY).toBeGreaterThan(0);
    expect(Math.hypot(next.velocityX, next.velocityY)).toBeCloseTo(1056);
    expect(next.flightTimeMs).toBeGreaterThan(1000);
  });
});
