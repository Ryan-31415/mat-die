import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from './game';
import { basicMeleeGeometry, findMeleeCoilContact, findProjectileCoilContact } from './combatPhysics';
import { createHazardZone, createProjectile, hazardProperties, projectileProperties, type HazardZone, type ProjectileType } from './projectile';
import { loadFrozenAI } from '@/test/aiBaseline';

afterEach(() => vi.restoreAllMocks());
const PROJECTILE_TYPES: ProjectileType[] = ['rocket', 'homing-rocket', 'arrow', 'poison-arrow', 'fireball', 'large-fireball',
  'meteor', 'flask', 'electric-orb', 'bullet', 'super-bullet', 'bat', 'snowball', 'large-snowball', 'blizzard-stone', 'net', 'hacker-missile', 'hacking'];

describe('unchanged coil contact rules', () => {
  const coil = { id: 'coil', type: 'tesla-coil' as const, ownerId: 2 as const, x: 100, y: 200, width: 40, height: 60 };
  const shot = { type: 'fireball' as const, ownerId: 1 as const, x: 110, y: 210, width: 24, height: 24 };
  it.each([
    { x: 76, y: 210, hit: false }, { x: 77, y: 210, hit: true },
    { x: 140, y: 210, hit: false }, { x: 139, y: 210, hit: true },
    { x: 110, y: 176, hit: false }, { x: 110, y: 177, hit: true },
    { x: 110, y: 260, hit: false }, { x: 110, y: 259, hit: true },
  ])('uses strict contact at $x/$y', ({ x, y, hit }) => {
    const attack = { ...shot, x, y };
    expect(findProjectileCoilContact(attack, [coil])).toBe(hit ? coil : undefined);
    expect(findMeleeCoilContact(attack, [coil])).toBe(hit ? coil : undefined);
  });
  it('preserves array order, including coils removed only in a later engine phase', () => {
    const dead = { ...coil, id: 'dead', health: 0, createdAt: 0, duration: 1 };
    const own = { ...coil, ownerId: 1 as const };
    const otherZone = { ...coil, type: 'fire-pool' as const };
    const zones = [own, otherZone, dead, coil];
    expect(findProjectileCoilContact(shot, zones)).toBe(dead);
    expect(findMeleeCoilContact(shot, zones)).toBe(dead);
    expect(findProjectileCoilContact({ ...shot, isHackUltimate: true }, zones)).toBeUndefined();
    expect(findProjectileCoilContact({ ...shot, type: 'bat', hitCoilIds: ['dead'] }, zones)).toBe(coil);
    expect(findProjectileCoilContact({ ...shot, hitCoilIds: ['dead'] }, zones)).toBe(dead);
  });
  it('reads no clock/randomness and does not mark or mutate a projectile or coil', () => {
    const bat = { ...shot, type: 'bat' as const, hitCoilIds: [] as string[] };
    const before = structuredClone({ bat, coil });
    vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('clock access'); });
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('random access'); });
    expect(findProjectileCoilContact(bat, [coil])).toBe(coil);
    expect(findMeleeCoilContact(bat, [coil])).toBe(coil);
    expect({ bat, coil }).toEqual(before);
  });
});

describe('unchanged hazard public rules', () => {
  it('matches all original hazard factories and their clock/random call order', () => {
    const types: HazardZone['type'][] = ['fire-pool', 'toxic-pool', 'tesla-coil', 'electric-explosion', 'bear-trap', 'blizzard', 'fire-ring', 'packet-block-zone'];
    const run = (factory: typeof createHazardZone, type: HazardZone['type']) => {
      const calls: string[] = [];
      let clock = 10000;
      vi.spyOn(Date, 'now').mockImplementation(() => { calls.push('clock'); return clock++; });
      vi.spyOn(Math, 'random').mockImplementation(() => { calls.push('random'); return 0.3; });
      const result = factory(type, 2, 400, 300, 2.5, 5000);
      vi.restoreAllMocks();
      return { result, calls };
    };
    for (const type of types) {
      const current = run(createHazardZone, type);
      expect(current, type).toEqual(run(loadFrozenAI().api.createHazardZone, type));
      expect(current.calls).toEqual(type === 'tesla-coil' ? ['clock', 'random', 'clock', 'clock', 'clock'] : ['clock', 'random', 'clock', 'clock']);
    }
  });
  it('does not access runtime data or expose mutable shared defaults', () => {
    vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('clock access'); });
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('random access'); });
    const properties = hazardProperties('tesla-coil');
    expect(properties).toEqual({ width: 40, height: 60, tickRate: 100, health: 175, maxHealth: 175, attackRange: 225, attackCooldown: 100 });
    properties.health = 0;
    expect(hazardProperties('tesla-coil').health).toBe(175);
    expect(properties).not.toHaveProperty('createdAt');
    expect(properties).not.toHaveProperty('lastAttack');
  });
});

describe('unchanged projectile public rules', () => {
  it('matches every original projectile factory, including its clock/random call order', () => {
    const frozen = loadFrozenAI().api.createProjectile;
    const run = (factory: typeof createProjectile, type: ProjectileType) => {
      const calls: string[] = [];
      let clock = 10000;
      vi.spyOn(Date, 'now').mockImplementation(() => { calls.push('clock'); return clock++; });
      vi.spyOn(Math, 'random').mockImplementation(() => { calls.push('random'); return 0.3; });
      const result = factory(type, 2, 400, 300, -600, -80, 17.5);
      vi.restoreAllMocks();
      return { result, calls };
    };
    for (const type of PROJECTILE_TYPES) {
      const current = run(createProjectile, type);
      expect(current, type).toEqual(run(frozen, type));
      expect(current.calls).toEqual(['clock', 'random', 'clock']);
    }
  });
  it('queries rules without time/randomness or mutable shared state', () => {
    vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('clock access'); });
    vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('random access'); });
    for (const type of PROJECTILE_TYPES) {
      const properties = projectileProperties(type, 600, 80);
      expect(properties).not.toHaveProperty('createdAt');
      expect(properties).not.toHaveProperty('id');
      expect(properties).not.toHaveProperty('ownerId');
      const before = structuredClone(properties);
      properties.width = -1;
      expect(projectileProperties(type, 600, 80)).toEqual(before);
    }
  });
});

describe('unchanged basic melee rules', () => {
  it.each([
    { character: 'gladiator', right: 100, left: 10, y: 300, width: 130, height: 40, duration: 200, canDeflectProjectiles: false },
    { character: 'ninja', right: 100, left: 5, y: 290, width: 135, height: 44, duration: 120, canDeflectProjectiles: true },
    { character: 'reaper', right: 90, left: -20, y: 290, width: 170, height: 60, duration: 250, canDeflectProjectiles: false },
  ] as const)('preserves literal engine dimensions/durations for $character', rule => {
    const player = { ...createInitialPlayer(1, CHARACTERS[rule.character]), x: 100, y: 300 };
    const before = structuredClone(player);
    for (const facingRight of [true, false]) expect(basicMeleeGeometry({ ...player, facingRight })).toEqual({
      x: facingRight ? rule.right : rule.left, y: rule.y, width: rule.width, height: rule.height,
      duration: rule.duration, canDeflectProjectiles: rule.canDeflectProjectiles, sourceX: 120,
    });
    expect(player).toEqual(before);
  });
  it('has no basic melee shape for projectile characters or an unselected fighter', () => {
    for (const character of Object.values(CHARACTERS).filter(character => !['gladiator', 'ninja', 'reaper'].includes(character.id))) {
      expect(basicMeleeGeometry(createInitialPlayer(1, character))).toBeNull();
    }
    expect(basicMeleeGeometry(createInitialPlayer(1, null))).toBeNull();
  });
});
