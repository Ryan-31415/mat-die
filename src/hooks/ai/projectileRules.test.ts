import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer, PLAYER_SIZE, type CharacterType } from '@/types/game';
import { basicProjectileLaunches, createProjectile, projectileProperties, getProjectileCollisionTime } from '@/types/projectile';
import { advanceProjectile } from '@/types/combatPhysics';
import { predictActionStart } from './actionStart';
import { chooseCombat } from './combat';
import { createOpponentModel } from './learning';
import { prepareAIFrame, type AIWorld } from './world';

afterEach(() => vi.restoreAllMocks());

function fixture(character: CharacterType, offsetY: number, distance = 240, focused = false) {
  const self = { ...createInitialPlayer(1, CHARACTERS[character]), x: 150, y: 220, facingRight: true,
    mana: 0, rootDuration: 10000, hunterFocusedDuration: focused ? 5000 : 0 };
  const enemy = { ...createInitialPlayer(2, CHARACTERS.gladiator), x: self.x + distance, y: self.y + offsetY, mana: 0 };
  const world: AIWorld = { players: [self, enemy], projectiles: [], hazardZones: [], attackHitboxes: [], platforms: [],
    mapId: 'wasteland', now: 10000, deltaTime: 1000 / 60, roundTimeRemaining: 60, isOvertime: false,
    sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
  return { self, enemy, world };
}

// Independently trace an actual engine entity against a stationary target.
function engineHit(scene: ReturnType<typeof fixture>) {
  const { self, enemy, world } = scene;
  const from = { ...self, ...predictActionStart(world, self, { left: false, right: false, jump: false, down: false }, false) };
  return basicProjectileLaunches(from, self.character!.attackDamage).some(spec => {
    let shot = createProjectile(spec.type, self.id, from.x + PLAYER_SIZE / 2, from.y + PLAYER_SIZE / 2,
      spec.velocityX, spec.velocityY, spec.damage, { now: world.now, random: () => 0.5 });
    for (let tick = 0; tick / 60 * 1000 <= shot.lifetime; tick++) {
      const before = { x: shot.x, y: shot.y };
      shot = advanceProjectile(shot, from, world.now + tick / 60 * 1000, 1 / 60);
      if (getProjectileCollisionTime(shot, before, { ...enemy, width: PLAYER_SIZE, height: PLAYER_SIZE }) !== null) return true;
      if (shot.x > 800 || shot.y > 500) return false;
    }
    return false;
  });
}
function decision(scene: ReturnType<typeof fixture>) {
  return chooseCombat(prepareAIFrame(scene.world), scene.self, scene.enemy, createOpponentModel(),
    { direction: 0, jump: false, drop: false }, true, false, 'pressure', () => scene.enemy).attack;
}

describe('combat decisions use the current engine projectile rules', () => {
  it.each(['mage', 'ice-mage', 'hacker', 'hunter', 'archer'] as const)('%s agrees with real entity sweeps at vertical edges', character => {
    for (const offset of [-40, -31, 0, 31, 40]) {
      const scene = fixture(character, offset);
      expect(decision(scene), `${character}/dy=${offset}`).toBe(engineHit(scene));
    }
  });
  it('uses pellet lifetime and focused launch speed at maximum reach', () => {
    for (const focused of [false, true]) for (const distance of [295, 325, 370, 410]) {
      const scene = fixture('hunter', 0, distance, focused);
      expect(decision(scene), `focused=${focused}/distance=${distance}`).toBe(engineHit(scene));
    }
  });
  it('keeps a basic clearing shot when a coil grazes the projectile edge', () => {
    const scene = fixture('mage', 40);
    // A 24px fireball centered at y=240 overlaps this coil. A centered 12px proxy misses it.
    scene.world.hazardZones = [{ id: 'coil', type: 'tesla-coil', ownerId: 2, x: 260, y: 220, width: 40, height: 12,
      damage: 0, tickRate: 100, lastTick: 10000, createdAt: 10000, duration: 30000, health: 175, maxHealth: 175,
      isGrounded: true }];
    expect(decision(scene)).toBe(true);
  });
  it('does not consume clocks or randomness while previewing projectile properties', () => {
    const scene = fixture('mage', 0);
    const frame = prepareAIFrame(scene.world);
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('random draw'); });
    vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('clock read'); });
    const before = structuredClone(scene.world);
    expect(chooseCombat(frame, scene.self, scene.enemy, createOpponentModel(), { direction: 0, jump: false, drop: false },
      true, false, 'pressure', () => scene.enemy).attack).toBe(true);
    expect(scene.world).toEqual(before);
    expect(projectileProperties('fireball').width).toBe(24);
  });
});
