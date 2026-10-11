import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { createHazardZone, createProjectile, type ProjectileType } from '@/types/projectile';
import { useGameEngine } from '../useGameEngine';
import { decideAI, emptyAIKeys } from './controller';
import { prepareAIFrame, type AIWorld } from './world';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
const types: ProjectileType[] = ['rocket', 'homing-rocket', 'arrow', 'poison-arrow', 'fireball', 'large-fireball',
  'meteor', 'flask', 'electric-orb', 'bullet', 'super-bullet', 'bat', 'snowball', 'large-snowball', 'blizzard-stone', 'net', 'hacker-missile', 'hacking'];
function setup(dt: number, side: 1 | 2, type: ProjectileType) {
  vi.useFakeTimers(); vi.setSystemTime(10000 - dt); vi.spyOn(Math, 'random').mockReturnValue(0.3);
  const game = renderHook(() => useGameEngine(CHARACTERS.gladiator, CHARACTERS.gladiator,
    60, () => {}, 'multi', false, 1, 'wasteland'));
  const state = game.result.current.gameState;
  Object.assign(state.players[0], { x: 40, y: 440, mana: 0, rootDuration: 5000 });
  Object.assign(state.players[1], { x: 700, y: 440, mana: 0, rootDuration: 5000 });
  state.hazardZones.push({ ...createHazardZone('tesla-coil', side === 1 ? 2 : 1, 300, 420, 0, 30000),
    id: 'coil', createdAt: 10000, isGrounded: true });
  state.projectiles.push({ ...createProjectile(type, side, 320, 450, 0, 0, 10),
    id: 'shot', createdAt: 10000, hasGravity: false });
  act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
  const world = (): AIWorld => ({ players: state.players, projectiles: state.projectiles, hazardZones: state.hazardZones,
    attackHitboxes: [], platforms: state.platforms, mapId: 'wasteland', now: 10000, deltaTime: dt,
    isOvertime: false, roundTimeRemaining: 60, sandstormActive: false, sandstormDirection: 'right',
    sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] });
  const step = () => { vi.setSystemTime(9984); act(() => { vi.advanceTimersByTime(16); }); };
  return { game, state, world, step };
}
function forecast(world: AIWorld) {
  return prepareAIFrame(world, { forecasts: createAISettings('perfect').parameters.forecasts, random: () => 0.5 });
}

describe('shared existing projectile paths stop at the real coil phase', () => {
  for (const side of [1, 2] as const) for (const dt of [16, 33, 100]) {
    it.each(types)(`P${side}/dt${dt}/%s endpoint`, type => {
      const { game, state, world, step } = setup(dt, side, type);
      const source = structuredClone(world()), frame = forecast(world()), path = frame.paths[0];
      expect(world()).toEqual(source);
      expect(path.coilContacts).toEqual([{ coilId: 'coil', step: 1, rawDamage: 10 }]);
      if (type !== 'bat') expect(path.endStep).toBe(0);
      else expect(path.endStep).toBeGreaterThan(1);
      step();
      const final = game.result.current.gameState;
      expect(final.hazardZones.find(zone => zone.id === 'coil')!.health).toBe(165);
      expect(final.projectiles.some(p => p.id === 'shot')).toBe(type === 'bat');
      if (type === 'bat') expect(final.projectiles[0].hitCoilIds).toEqual(['coil']);
      const predicted = frame.pools.filter(pool => pool.sourceProjectileId === 'shot');
      const actual = final.hazardZones.filter(zone => zone.type !== 'tesla-coil');
      expect(predicted).toHaveLength(actual.length);
      for (const [index, pool] of predicted.entries()) expect(pool).toMatchObject({
        x: actual[index].x, y: actual[index].y, width: actual[index].width, height: actual[index].height,
        damage: actual[index].damage, duration: actual[index].duration });
      expect(state.projectiles[0].hitCoilIds).toEqual(source.projectiles[0].hitCoilIds);
    });
  }
  it.each(['own', 'hack ultimate', 'visited bat', 'tunnel', 'expired', 'dead', 'napalm'] as const)('%s exception/order', scene => {
    const { game, state, world, step } = setup(16, 1, scene === 'visited bat' ? 'bat' : 'rocket');
    if (scene === 'own') state.hazardZones[0].ownerId = 1;
    if (scene === 'hack ultimate') state.projectiles[0].isHackUltimate = true;
    if (scene === 'visited bat') state.projectiles[0].hitCoilIds = ['coil'];
    if (scene === 'tunnel') Object.assign(state.projectiles[0], { x: 200, velocityX: 15000, initialSpeed: 15000 });
    if (scene === 'expired') state.hazardZones[0].createdAt = -20001;
    if (scene === 'dead') state.hazardZones[0].health = 0;
    if (scene === 'napalm') Object.assign(state.projectiles[0], {
      isNapalm: true, firePoolDamage: 2.5, firePoolDuration: 4000, createsFirePool: true });
    const frame = forecast(world()), intercepted = ['expired', 'dead', 'napalm'].includes(scene);
    expect(frame.paths[0].coilContacts.length > 0).toBe(intercepted);
    step();
    const final = game.result.current.gameState;
    expect(final.projectiles.some(p => p.id === 'shot')).toBe(!intercepted);
    if (scene === 'napalm') {
      const actual = final.hazardZones.find(zone => zone.isNapalm)!;
      expect(frame.pools[0]).toMatchObject({ x: actual.x, y: actual.y, width: actual.width,
        height: actual.height, damage: actual.damage, duration: actual.duration });
    }
  });
  it('keeps all same-phase contacts, removes the coil only after the phase, and records bat IDs separately', () => {
    const { game, state, world, step } = setup(16, 1, 'fireball');
    state.hazardZones[0].health = 5;
    state.projectiles.push({ ...state.projectiles[0], id: 'shot2', lastHitTime: {} },
      { ...state.projectiles[0], id: 'later', x: 400, velocityX: -600, lastHitTime: {} });
    const frame = forecast(world());
    expect(frame.paths[0].coilContacts).toHaveLength(1);
    expect(frame.paths[1].coilContacts).toHaveLength(1);
    expect(frame.paths[2].coilContacts).toEqual([]);
    step();
    expect(game.result.current.gameState.hazardZones.some(zone => zone.id === 'coil')).toBe(false);
    expect(game.result.current.gameState.projectiles.map(p => p.id)).toEqual(['later']);
  });
  it('a surviving bat records each overlapping coil once in array order without mutating observed IDs', () => {
    const { game, state, world, step } = setup(16, 1, 'bat');
    state.hazardZones.push({ ...state.hazardZones[0], id: 'coil2' });
    const source = structuredClone(world()), frame = forecast(world());
    expect(frame.paths[0].coilContacts).toEqual([
      { coilId: 'coil', step: 1, rawDamage: 10 }, { coilId: 'coil2', step: 2, rawDamage: 10 }]);
    expect(world()).toEqual(source);
    step();
    act(() => { vi.advanceTimersByTime(32); });
    expect(game.result.current.gameState.projectiles[0].hitCoilIds).toEqual(['coil', 'coil2']);
    expect(game.result.current.gameState.hazardZones.map(zone => zone.health)).toEqual([165, 165]);
  });
  it.each([1, 2] as const)('P%i recalculates a guided endpoint but respects coil contact before the swept body', side => {
    const other = side === 1 ? 2 : 1;
    const { game, state, world, step } = setup(16, other, 'homing-rocket');
    Object.assign(state.players[side - 1], { x: 400, attackCooldownRemaining: 5000 });
    Object.assign(state.players[other - 1], { x: 700, attackCooldownRemaining: 5000 });
    state.hazardZones[0].x = 230;
    Object.assign(state.projectiles[0], { x: 430, y: 440, velocityX: -12500, initialSpeed: 12500 });
    const input = world(), source = structuredClone(input), frame = forecast(input);
    const decision = decideAI(frame, input.players[side - 1]);
    expect(decision.risk).toBe(0);
    expect(decideAI(forecast({ ...input, hazardZones: [] }), input.players[side - 1]).risk).toBeGreaterThan(0);
    expect(input).toEqual(source);
    act(() => game.result.current.setKeysRef({ current: decision.keys }));
    step();
    expect(game.result.current.gameState.players[side - 1].health).toBe(source.players[side - 1].health);
    expect(game.result.current.gameState.projectiles.some(p => p.id === 'shot')).toBe(false);
    expect(game.result.current.gameState.hazardZones[0].health).toBe(165);
  });
  for (const side of [1, 2] as const) it.each(['bat', 'fireball'] as const)(`P${side}/%s coil phase suppresses same-callback body damage`, type => {
    const other = side === 1 ? 2 : 1;
    const { game, state, world, step } = setup(16, other, type);
    Object.assign(state.players[side - 1], { x: 330, attackCooldownRemaining: 5000 });
    Object.assign(state.players[other - 1], { x: 700, attackCooldownRemaining: 5000 });
    state.projectiles[0].lifetime = 0; // Alive in current callback, expired next callback.
    const input = world(), frame = forecast(input), decision = decideAI(frame, input.players[side - 1]);
    expect(decision.risk).toBe(0);
    expect(decideAI(forecast({ ...input, hazardZones: [] }), input.players[side - 1]).risk).toBeGreaterThan(0);
    act(() => game.result.current.setKeysRef({ current: decision.keys }));
    step();
    expect(game.result.current.gameState.players[side - 1].health).toBe(input.players[side - 1].health);
    expect(game.result.current.gameState.projectiles.some(p => p.id === 'shot')).toBe(type === 'bat');
  });
});
