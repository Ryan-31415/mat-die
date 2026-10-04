import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, PLAYER_SIZE, createInitialPlayer } from '@/types/game';
import { createProjectile, createHazardZone, type ProjectileType } from '@/types/projectile';
import type { MapId } from '@/types/map';
import { useGameEngine } from './useGameEngine';
import type { KeyboardState } from './useKeyboard';

const emptyKeys = (): KeyboardState => ({
  w: false, a: false, s: false, d: false, space: false,
  f: false, g: false, h: false,
  arrowUp: false, arrowDown: false, arrowLeft: false, arrowRight: false,
  enter: false, shift: false, backslash: false,
});

describe('explosive projectile impact effects', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  function setup(mapId: MapId = 'default') {
    const keys = { current: emptyKeys() };
    const { result } = renderHook(() => useGameEngine(
      CHARACTERS.hacker, CHARACTERS.gladiator, 60, vi.fn(), 'multi', false, 1, mapId
    ));
    act(() => result.current.setKeysRef(keys));
    const step = (ms = 17) => act(() => { vi.advanceTimersByTime(ms); });
    return { keys, result, step };
  }

  it.each(['fireball', 'large-fireball', 'flask', 'electric-orb', 'meteor'] as const)(
    'creates one effect for %s at the hit surface without extra damage', type => {
      const { result, step } = setup();
      const target = result.current.gameState.players[1];
      const initialHealth = target.health;
      const projectile = createProjectile(type, 1, target.x - 100, target.y + PLAYER_SIZE / 2, 12000, 0, 10);
      result.current.gameState.projectiles.push(projectile);
      step();

      expect(result.current.gameState.projectiles).toHaveLength(0);
      expect(result.current.gameState.explosionEffects).toHaveLength(1);
      const effect = result.current.gameState.explosionEffects[0];
      expect(effect.type).toBe(type);
      expect(effect.x).toBeCloseTo(target.x);
      expect(effect.y).toBeCloseTo(target.y + PLAYER_SIZE / 2);
      expect(effect.radius).toBe(projectile.explosionRadius);
      expect(result.current.gameState.players[1].health).toBe(initialHealth - 10);

      step(100);
      expect(result.current.gameState.explosionEffects).toHaveLength(1);
      step(400);
      expect(result.current.gameState.explosionEffects).toHaveLength(0);
    }
  );

  it('uses the explosive flag for a customized projectile', () => {
    const { result, step } = setup();
    const target = result.current.gameState.players[1];
    const projectile = createProjectile('hacker-missile', 1, target.x, target.y + 25, 0, 0, 10);
    projectile.isExplosive = true;
    projectile.explosionRadius = 60;
    result.current.gameState.projectiles.push(projectile);
    step();
    expect(result.current.gameState.explosionEffects).toHaveLength(1);
    expect(result.current.gameState.explosionEffects[0].radius).toBe(60);
  });

  it('explodes on an enemy clone', () => {
    const { result, step } = setup();
    const clone = { ...createInitialPlayer(2, CHARACTERS.hacker), x: 400, isClone: true, createdAt: Date.now() };
    result.current.gameState.clones.push(clone);
    result.current.gameState.projectiles.push(createProjectile('fireball', 1, clone.x + 25, clone.y + 25, 0, 0, 10));
    step();
    expect(result.current.gameState.explosionEffects).toHaveLength(1);
    expect(result.current.gameState.projectiles.filter(p => p.type === 'fireball')).toHaveLength(0);
    expect(result.current.gameState.clones[0].health).toBe(clone.health - 10);
  });

  it('explodes when a flask hits a platform while keeping its toxic pool', () => {
    const { result, step } = setup();
    result.current.gameState.projectiles.push(createProjectile('flask', 1, 120, 340, 0, 600, 10));
    step();
    expect(result.current.gameState.explosionEffects).toHaveLength(1);
    expect(result.current.gameState.explosionEffects[0].y).toBe(350);
    expect(result.current.gameState.hazardZones.some(z => z.type === 'toxic-pool')).toBe(true);
  });

  it('explodes on an enemy tesla coil without adding coil damage', () => {
    const { result, step } = setup();
    const coil = createHazardZone('tesla-coil', 2, 400, 400, 5, 10000);
    result.current.gameState.hazardZones.push(coil);
    result.current.gameState.projectiles.push(createProjectile('electric-orb', 1, 415, 415, 0, 0, 10));
    step();
    expect(result.current.gameState.projectiles).toHaveLength(0);
    expect(result.current.gameState.explosionEffects).toHaveLength(1);
    expect(result.current.gameState.hazardZones.find(z => z.id === coil.id)?.health).toBe(coil.health! - 10);
  });

  it('explodes on a jungle vine shield', () => {
    const { result, step } = setup('jungle');
    result.current.gameState.vineShields.push({
      id: 'test-vine', x: 400, y: 400, width: 15, height: 60, createdAt: Date.now(), duration: 10000, hp: 1,
    });
    result.current.gameState.projectiles.push(createProjectile('fireball', 1, 410, 430, 0, 0, 10));
    step();
    expect(result.current.gameState.projectiles).toHaveLength(0);
    expect(result.current.gameState.vineShields).toHaveLength(0);
    expect(result.current.gameState.explosionEffects).toHaveLength(1);
  });

  it.each([
    ['fireball', true],
    ['electric-orb', false],
  ] as const)('handles shield contact for %s', (type, isDeflected) => {
    const { keys, result, step } = setup();
    keys.current.enter = true;
    const target = result.current.gameState.players[1];
    result.current.gameState.projectiles.push(createProjectile(type, 1, target.x, target.y + 25, 100, 0, 10));
    step();
    expect(result.current.gameState.explosionEffects).toHaveLength(isDeflected ? 0 : 1);
    expect(result.current.gameState.players[1].health).toBe(target.health);
    if (isDeflected) {
      expect(result.current.gameState.projectiles[0].ownerId).toBe(2);
      expect(result.current.gameState.projectiles[0].velocityX).toBe(-100);
    } else {
      expect(result.current.gameState.projectiles).toHaveLength(0);
    }
  });

  it('shows a boundary explosion when a meteor leaves the floor', () => {
    const { result, step } = setup();
    result.current.gameState.projectiles.push(createProjectile('meteor', 1, 400, 490, 0, 1500, 10));
    step();
    expect(result.current.gameState.projectiles).toHaveLength(0);
    expect(result.current.gameState.explosionEffects).toHaveLength(1);
    expect(result.current.gameState.explosionEffects[0]).toMatchObject({ x: 400, y: 480 });
  });

  it.each(['bullet', 'snowball'] as ProjectileType[])('does not add an explosion to a %s hit', type => {
    const { result, step } = setup();
    const target = result.current.gameState.players[1];
    result.current.gameState.projectiles.push(createProjectile(type, 1, target.x, target.y + 25, 0, 0, 10));
    step();
    expect(result.current.gameState.projectiles).toHaveLength(0);
    expect(result.current.gameState.explosionEffects).toHaveLength(0);
  });

  it('expires an unhit projectile without an effect and clears effects on round reset', () => {
    const { result, step } = setup();
    const expired = createProjectile('fireball', 1, 400, 100, 0, 0, 10);
    expired.createdAt -= expired.lifetime + 1;
    result.current.gameState.projectiles.push(expired);
    step();
    expect(result.current.gameState.explosionEffects).toHaveLength(0);

    const target = result.current.gameState.players[1];
    result.current.gameState.projectiles.push(createProjectile('fireball', 1, target.x, target.y + 25, 0, 0, 10));
    step();
    expect(result.current.gameState.explosionEffects).toHaveLength(1);
    act(() => result.current.resetRound());
    expect(result.current.gameState.explosionEffects).toHaveLength(0);
  });
});

describe('scientist charging in hacker zones', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  function setup(scientistId: 1 | 2 = 1) {
    const keys = { current: emptyKeys() };
    const { result } = renderHook(() => useGameEngine(
      CHARACTERS[scientistId === 1 ? 'scientist' : 'hacker'],
      CHARACTERS[scientistId === 2 ? 'scientist' : 'hacker'],
      60,
      vi.fn(),
    ));
    act(() => result.current.setKeysRef(keys));
    const step = () => act(() => { vi.advanceTimersByTime(17); });
    const scientist = () => result.current.gameState.players[scientistId - 1];
    const chargeKey = scientistId === 1 ? 'g' : 'enter';
    const hackerKey = scientistId === 1 ? 'enter' : 'g';
    const enterKey = scientistId === 1 ? 'd' : 'arrowLeft';
    const exitKey = scientistId === 1 ? 'a' : 'arrowRight';

    keys.current[chargeKey] = true;
    keys.current[hackerKey] = true;
    step();
    keys.current[hackerKey] = false;
    expect(scientist().isChargingSkill).toBe(true);
    expect(result.current.gameState.hazardZones).toHaveLength(1);
    return { keys, result, step, scientist, chargeKey, enterKey, exitKey };
  }

  it.each([1, 2] as const)('cancels player %s charging and permits a fresh charge after leaving', scientistId => {
    const { keys, result, step, scientist, chargeKey, enterKey, exitKey } = setup(scientistId);
    const originalStart = scientist().skillChargeStartTime;
    keys.current[enterKey] = true;
    for (let i = 0; i < 150 && !scientist().isSilenced; i++) step();
    keys.current[enterKey] = false;

    expect(scientist().isSilenced).toBe(true);
    expect(scientist().isChargingSkill).toBe(false);
    expect(scientist().skillChargeStartTime).toBeUndefined();
    expect(scientist().skillCooldownRemaining).toBe(0);
    expect(scientist().mana).toBe(100);
    const health = scientist().health;

    // Holding the key while silenced must neither restart nor overcharge.
    for (let i = 0; i < 30; i++) step();
    expect(scientist().isChargingSkill).toBe(false);
    expect(scientist().health).toBe(health);
    keys.current[chargeKey] = false;
    step();
    expect(result.current.gameState.projectiles).toHaveLength(0);

    keys.current[exitKey] = true;
    for (let i = 0; i < 30; i++) step();
    keys.current[exitKey] = false;
    expect(scientist().isSilenced).toBe(false);
    keys.current[chargeKey] = true;
    step();
    const freshStart = scientist().skillChargeStartTime;
    expect(scientist().isChargingSkill).toBe(true);
    expect(freshStart).toBeGreaterThan(originalStart!);
    for (let i = 0; i < 30; i++) step();
    keys.current[chargeKey] = false;
    step();

    const orb = result.current.gameState.projectiles.find(p => p.type === 'electric-orb');
    expect(orb).toBeDefined();
    expect(orb!.chargeLevel).toBeCloseTo((Date.now() - freshStart!) / 1500);
    expect(scientist().mana).toBeCloseTo(55);
    expect(scientist().skillCooldownRemaining).toBe(CHARACTERS.scientist.skill.cooldown);
    expect(scientist().isChargingSkill).toBe(false);
    expect(scientist().skillChargeStartTime).toBeUndefined();
  });

  it('cancels instead of firing when movement enters the zone on key release', () => {
    const { keys, result, step, scientist, chargeKey, enterKey } = setup();
    const zone = result.current.gameState.hazardZones[0];
    keys.current[enterKey] = true;
    // Stop just outside the zone; the next movement tick crosses its boundary.
    while (zone.x - (scientist().x + PLAYER_SIZE) > 3) step();
    expect(scientist().isSilenced).toBe(false);
    keys.current[chargeKey] = false;
    step();
    expect(scientist().isSilenced).toBe(true);
    expect(scientist().isChargingSkill).toBe(false);
    expect(scientist().skillChargeStartTime).toBeUndefined();
    expect(result.current.gameState.projectiles).toHaveLength(0);
    expect(scientist().mana).toBe(100);
    expect(scientist().skillCooldownRemaining).toBe(0);
  });
});
