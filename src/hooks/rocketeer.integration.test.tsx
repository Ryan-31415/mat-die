import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import type { MapId } from '@/types/map';
import { createAttackHitbox, createHazardZone, createProjectile, type Projectile } from '@/types/projectile';
import { emptyAIKeys } from './gameAI';
import { useGameEngine } from './useGameEngine';

function setup(id: 1 | 2 = 1, map: MapId = 'wasteland') {
  const game = renderHook(() => useGameEngine(CHARACTERS[id === 1 ? 'rocketeer' : 'gladiator'],
    CHARACTERS[id === 2 ? 'rocketeer' : 'gladiator'], 60, vi.fn(), 'multi', false, 1, map));
  const keys = { current: emptyAIKeys() };
  act(() => game.result.current.setKeysRef(keys));
  return { ...game, keys, id, targetIndex: id === 1 ? 1 : 0 };
}
const step = (ms = 17) => act(() => { vi.advanceTimersByTime(ms); });
function napalm(shot: Projectile): Projectile {
  return { ...shot, isNapalm: true, createsFirePool: true, firePoolDuration: 4000, firePoolDamage: shot.damage * 0.1, burnDamage: shot.damage * 0.075 };
}

describe('Rocketeer combat', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T00:00:00Z')); });
  afterEach(() => vi.useRealTimers());
  it.each([1, 2] as const)('P%i fires both types with the specified cost and cooldown', id => {
    const { result, keys } = setup(id);
    keys.current[id === 1 ? 'f' : 'shift'] = true;
    keys.current[id === 1 ? 'g' : 'enter'] = true;
    step();
    const player = result.current.gameState.players[id - 1];
    expect(player.health).toBe(110);
    expect(player.mana).toBeCloseTo(70);
    expect(player.attackCooldownRemaining).toBe(1200);
    expect(player.skillCooldownRemaining).toBe(3000);
    expect(result.current.gameState.projectiles.map(p => p.type)).toEqual(['rocket', 'homing-rocket']);
    expect(result.current.gameState.projectiles.every(p => p.width === 48 && p.height === 32)).toBe(true);
    keys.current = emptyAIKeys(); step(1200);
    expect(result.current.gameState.players[id - 1].attackCooldownRemaining).toBe(0);
    expect(result.current.gameState.players[id - 1].mana).toBeCloseTo(77.68, 0);
  });
  it.each([1, 2] as const)('P%i activates napalm before simultaneous attack and reserves ultimate mana', id => {
    const { result, keys } = setup(id);
    keys.current[id === 1 ? 'h' : 'backslash'] = true;
    keys.current[id === 1 ? 'f' : 'shift'] = true;
    keys.current[id === 1 ? 'g' : 'enter'] = true;
    step();
    expect(result.current.gameState.players[id - 1].napalmDuration).toBe(6000);
    expect(result.current.gameState.players[id - 1].mana).toBe(0);
    expect(result.current.gameState.projectiles).toHaveLength(1);
    expect(result.current.gameState.projectiles[0]).toMatchObject({ type: 'rocket', isNapalm: true, firePoolDamage: 1.6, burnDamage: 1.2 });
  });
  it('does not retroactively enhance rockets and preserves armed rockets after buff expiry', () => {
    const { result, keys, targetIndex } = setup();
    const target = result.current.gameState.players[targetIndex];
    const old = createProjectile('rocket', 1, 400, 100, 0, 0, 16);
    result.current.gameState.projectiles.push(old);
    keys.current.h = true; step(); keys.current = emptyAIKeys();
    expect(result.current.gameState.projectiles.find(p => p.id === old.id)?.isNapalm).toBeUndefined();
    result.current.gameState.players[0].napalmDuration = 0;
    result.current.gameState.projectiles.push(napalm(createProjectile('rocket', 1, target.x + 20, target.y + 20, 0, 0, 16)));
    step();
    expect(result.current.gameState.players[targetIndex]).toMatchObject({ health: 134, isBurning: true, burnDuration: 3000, burnDamagePerTick: 1.2 });
    expect(result.current.gameState.hazardZones.filter(z => z.isNapalm)).toHaveLength(1);
  });
  it('snapshots boosted, hacked and overtime damage consistently for both rocket types', () => {
    const { result, keys } = setup();
    result.current.gameState.isOvertime = true;
    Object.assign(result.current.gameState.players[0], { napalmDuration: 5000, damageBoost: 0.25, isHacked: true, hackedDuration: 5000 });
    keys.current.f = true; keys.current.g = true; step();
    expect(result.current.gameState.projectiles).toHaveLength(2);
    for (const shot of result.current.gameState.projectiles) {
      expect(shot.damage).toBeCloseTo(33.6);
      expect(shot.firePoolDamage).toBeCloseTo(3.36);
      expect(shot.burnDamage).toBeCloseTo(2.52);
    }
  });
  it('silence blocks skill and ultimate while allowing basic attacks', () => {
    const { result, keys } = setup();
    Object.assign(result.current.gameState.players[0], { isSilenced: true, silenceDuration: 1000 });
    keys.current.f = true; keys.current.g = true; keys.current.h = true; step();
    expect(result.current.gameState.projectiles).toHaveLength(1);
    expect(result.current.gameState.projectiles[0]).toMatchObject({ type: 'rocket' });
    expect(result.current.gameState.projectiles[0].isNapalm).toBeUndefined();
    expect(result.current.gameState.players[0].napalmDuration).toBe(0);
  });
  it('applies twelve burn ticks in three seconds and refreshes without stacking', () => {
    const { result, targetIndex } = setup();
    const hit = () => {
      const target = result.current.gameState.players[targetIndex];
      result.current.gameState.projectiles.push(napalm(createProjectile('rocket', 1, target.x + 20, target.y + 20, 0, 0, 16)));
      step(); result.current.gameState.hazardZones.splice(0);
    };
    hit(); step(500);
    expect(result.current.gameState.players[targetIndex].health).toBeCloseTo(134 - 2.4);
    hit();
    expect(result.current.gameState.players[targetIndex].burnDuration).toBe(3000);
    const start = result.current.gameState.players[targetIndex].health;
    step(3020);
    expect(result.current.gameState.players[targetIndex].health).toBeCloseTo(start - 14.4);
    expect(result.current.gameState.players[targetIndex].isBurning).toBe(false);
  });
  it('ticks overlapping pools every 100ms, damages enemy clones and excludes allies', () => {
    const { result, targetIndex } = setup();
    const target = result.current.gameState.players[targetIndex];
    const friendly = { ...createInitialPlayer(1, CHARACTERS.rocketeer), x: target.x, y: target.y, isClone: true, isStunned: true, stunDuration: 5000 };
    const enemy = { ...createInitialPlayer(2, CHARACTERS.hacker), x: target.x, y: target.y, isClone: true, isStunned: true, stunDuration: 5000 };
    result.current.gameState.clones.push(friendly, enemy);
    for (let i = 0; i < 2; i++) result.current.gameState.hazardZones.push({
      ...createHazardZone('fire-pool', 1, target.x - 30, target.y - 30, 1.6, 4000), isNapalm: true,
    });
    step(1010);
    expect(result.current.gameState.players[targetIndex].health).toBeCloseTo(150 - 32);
    expect(result.current.gameState.clones.find(c => c.id === 1)?.health).toBe(110);
    expect(result.current.gameState.clones.find(c => c.id === 2)?.health).toBeCloseTo(100 - 32);
  });
  it.each(['player', 'clone', 'coil', 'vine', 'boundary'] as const)('creates exactly one pool and explosion on %s impact', kind => {
    const { result, targetIndex } = setup(1, kind === 'vine' ? 'jungle' : 'wasteland');
    let x = 400, y = 100, vx = 0;
    if (kind === 'player') { const p = result.current.gameState.players[targetIndex]; x = p.x + 20; y = p.y + 20; }
    if (kind === 'clone') result.current.gameState.clones.push({ ...createInitialPlayer(2, CHARACTERS.hacker), x: x - 20, y: y - 20, isClone: true });
    if (kind === 'coil') result.current.gameState.hazardZones.push(createHazardZone('tesla-coil', 2, x - 20, y - 20, 1, 10000));
    if (kind === 'boundary') { x = 825; vx = 880; }
    if (kind === 'vine') {
      result.current.gameState.vineShields.push({ id: 'rocket-vine', x: x - 20, y: y - 20,
        width: 40, height: 60, hp: 1, createdAt: Date.now(), duration: 10000 });
    }
    result.current.gameState.projectiles.push(napalm(createProjectile('rocket', 1, x, y, vx, 0, 16)));
    step();
    expect(result.current.gameState.hazardZones.filter(z => z.isNapalm)).toHaveLength(1);
    expect(result.current.gameState.explosionEffects).toHaveLength(1);
    expect(result.current.gameState.projectiles).toHaveLength(0);
  });
  it('reflects without creating a pool and does not reset flight age', () => {
    const { result, targetIndex } = setup();
    const target = result.current.gameState.players[targetIndex];
    target.isShielding = true; target.facingRight = false;
    const shot = napalm(createProjectile('homing-rocket', 1, target.x + 4, target.y + 20, 660, 0, 16));
    shot.flightTimeMs = 1000;
    result.current.gameState.projectiles.push(shot);
    // Held gladiator shield input keeps the shield active during the tick.
    const keys = { current: { ...emptyAIKeys(), enter: true } };
    act(() => result.current.setKeysRef(keys)); step();
    expect(result.current.gameState.hazardZones.filter(z => z.isNapalm)).toHaveLength(0);
    expect(result.current.gameState.projectiles[0]).toMatchObject({ ownerId: 2, initialSpeed: 660 });
    expect(result.current.gameState.projectiles[0].flightTimeMs).toBeGreaterThan(1000);
  });
  it('does not leave pools on lifetime expiry and passes through platforms', () => {
    const { result } = setup();
    const shot = napalm(createProjectile('rocket', 1, 400, 100, 0, 0, 16));
    result.current.gameState.platforms.push({ id: 'rocket-test', x: 380, y: 80, width: 80, height: 60, type: 'solid' });
    result.current.gameState.projectiles.push(shot); step();
    expect(result.current.gameState.projectiles).toHaveLength(1);
    step(3010);
    expect(result.current.gameState.projectiles).toHaveLength(0);
    expect(result.current.gameState.hazardZones.filter(z => z.isNapalm)).toHaveLength(0);
  });
  it('pauses rockets, pools, burn and buff timers and clears them on round reset', () => {
    const { result } = setup();
    result.current.gameState.players[0].napalmDuration = 5000;
    result.current.gameState.projectiles.push(napalm(createProjectile('rocket', 1, 400, 100, 0, 0, 16)));
    result.current.gameState.hazardZones.push({ ...createHazardZone('fire-pool', 1, 350, 300, 1.6, 4000), isNapalm: true });
    Object.assign(result.current.gameState.players[1], { isBurning: true, burnIsNapalm: true, burnDuration: 3000, burnDamagePerTick: 1.2, lastBurnTick: Date.now() });
    step(); const before = result.current.gameState;
    act(() => result.current.togglePause()); step(5000);
    act(() => result.current.togglePause()); step();
    expect(result.current.gameState.projectiles[0].flightTimeMs).toBeLessThan(50);
    expect(result.current.gameState.hazardZones).toHaveLength(1);
    expect(result.current.gameState.players[1].health).toBe(before.players[1].health);
    expect(result.current.gameState.players[0].napalmDuration).toBeGreaterThan(4900);
    act(() => result.current.resetRound());
    expect(result.current.gameState.projectiles).toHaveLength(0);
    expect(result.current.gameState.hazardZones).toHaveLength(0);
    expect(result.current.gameState.players[0].napalmDuration).toBe(0);
    expect(result.current.gameState.players[1].isBurning).toBe(false);
  });
  it('reflects off a katana reached before the body', () => {
    const { result, targetIndex } = setup();
    const target = result.current.gameState.players[targetIndex];
    result.current.gameState.attackHitboxes.push(createAttackHitbox(2, target.x - 65, target.y, 60, 40, 0, 120, true));
    result.current.gameState.projectiles.push(napalm(createProjectile('rocket', 1, target.x - 70, target.y + 20, 550, 0, 16)));
    step();
    expect(result.current.gameState.projectiles[0]?.ownerId).toBe(2);
    expect(result.current.gameState.hazardZones).toHaveLength(0);
  });
});
