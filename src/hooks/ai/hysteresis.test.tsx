import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer, type Player } from '@/types/game';
import { createAISettings, NEUTRAL_AI_TRAITS } from '@/types/ai';
import { MAPS } from '@/types/map';
import { createProjectile } from '@/types/projectile';
import { useGameEngine } from '../useGameEngine';
import { decideAI, emptyAIKeys } from './controller';
import { createOpponentModel } from './learning';
import { prepareAIFrame, type AIWorld } from './world';
import type { AIMemory } from './state';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
const parameters = createAISettings('perfect').parameters;
function scene(side: 1 | 2): AIWorld & { players: [Player, Player] } {
  const self = { ...createInitialPlayer(side, CHARACTERS.gladiator), x: 380, y: 440, health: 20, mana: 0, attackCooldownRemaining: 2000 };
  const other = side === 1 ? 2 : 1;
  const enemy = { ...createInitialPlayer(other, CHARACTERS.archer), x: 695, y: 440, mana: 0, attackCooldownRemaining: 2000 };
  return { players: side === 1 ? [self, enemy] : [enemy, self],
    projectiles: [createProjectile('bullet', other, 400, 400, 0, 500, 10, { now: 10000, random: () => .5 })],
    attackHitboxes: [], hazardZones: [], platforms: MAPS.wasteland.platforms, now: 10000, deltaTime: 16,
    mapId: 'wasteland', roundTimeRemaining: 60, isOvertime: false, sandstormActive: false,
    sandstormDirection: 'right', sandstormTimer: 0, soulZones: [], lightningStrikes: [], vineShields: [] };
}
function decide(world: AIWorld, side: 1 | 2, previous?: AIMemory) {
  return decideAI(prepareAIFrame(world, { forecasts: parameters.forecasts, random: () => .5 }), world.players[side - 1],
    createOpponentModel(), previous, { parameters, traits: NEUTRAL_AI_TRAITS, random: () => .5 });
}
const direction = (keys: ReturnType<typeof emptyAIKeys>, side: 1 | 2) => side === 1
  ? Number(keys.d) - Number(keys.a) : Number(keys.arrowRight) - Number(keys.arrowLeft);
function previous(world: AIWorld, side: 1 | 2): AIMemory {
  const memory = decide(world, side).memory;
  return { ...memory, movement: { direction: 1, selectedAt: 9984, score: 1e6, goalSignature: memory.goalSignature } };
}

describe('bounded movement direction retention', () => {
  it.each([1, 2] as const)('P%i keeps an equally safe escape for less than100ms without mutating memory', side => {
    vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(.5);
    const world = scene(side), prior = previous(world, side), snapshot = structuredClone(prior);
    const free = decide(world, side), held = decide(world, side, prior);
    expect(direction(free.keys, side)).toBe(-1);
    expect(direction(held.keys, side)).toBe(1);
    expect(held.risk).toBeLessThanOrEqual(free.risk);
    expect(held.memory.movement?.selectedAt).toBe(9984);
    expect(held.memory.movement?.score).toBeLessThan(1e6);
    expect(prior).toEqual(snapshot);
    const replay = (keys: ReturnType<typeof emptyAIKeys>) => {
      vi.setSystemTime(9984);
      const game = renderHook(() => useGameEngine(world.players[0].character!, world.players[1].character!, 60, () => {}, 'multi', false, 1, 'wasteland'));
      game.result.current.gameState.players = [{ ...world.players[0] }, { ...world.players[1] }];
      game.result.current.gameState.projectiles = world.projectiles.map(p => ({ ...p }));
      act(() => game.result.current.setKeysRef({ current: keys }));
      act(() => { vi.advanceTimersByTime(400); });
      const damage = world.players[side - 1].health - game.result.current.gameState.players[side - 1].health;
      game.unmount(); cleanup(); vi.clearAllTimers();
      return damage;
    };
    expect(replay(emptyAIKeys())).toBeGreaterThan(0);
    expect(replay(free.keys)).toBe(0);
    expect(replay(held.keys)).toBe(0);
  });

  it.each([1, 2] as const)('P%i expires at100ms and invalidates a changed goal', side => {
    const world = scene(side), prior = previous(world, side);
    expect(direction(decide(world, side, { ...prior, movement: { ...prior.movement!, selectedAt: 9900 } }).keys, side)).toBe(-1);
    expect(direction(decide(world, side, { ...prior, goal: { x: 480, y: 440 }, goalUntil: 0 }).keys, side)).toBe(-1);
  });

  it.each([1, 2] as const)('P%i preserves the actual goal across harmless metadata changes without renewing the100ms window', side => {
    const world = scene(side), prior = previous(world, side);
    const other = side === 1 ? 2 : 1;
    world.players[other - 1] = { ...world.players[other - 1], facingRight: !world.players[other - 1].facingRight };
    const held = decide(world, side, prior);
    expect(held.memory.goalSignature).not.toBe(prior.goalSignature);
    expect(held.memory.goal).toEqual(prior.goal);
    expect(direction(held.keys, side)).toBe(1);
    expect(held.memory.movement?.selectedAt).toBe(9984);
  });

  it.each([1, 2] as const)('P%i releases retention for forced displacement and a more dangerous side', side => {
    const world = scene(side), prior = previous(world, side);
    const displace = (p: Player) => p.id === side ? { ...p, knockbackVelocityX: 100 } : p;
    const displaced: AIWorld = { ...world, players: [displace(world.players[0]), displace(world.players[1])] };
    const forced = decide(displaced, side, prior);
    expect(forced.keys).toEqual(decide(displaced, side).keys);
    expect(forced.memory.movement).toBeUndefined();
    const dangerous = { ...world, projectiles: world.projectiles.map(p => ({ ...p, x: p.x + 15 })) };
    const safe = decide(dangerous, side), guarded = decide(dangerous, side, prior);
    expect(guarded.memory.goalSignature).toBe(prior.goalSignature);
    expect(direction(guarded.keys, side)).toBe(-1);
    expect(guarded.keys).toEqual(safe.keys);
  });

  for (const character of ['gladiator', 'ninja', 'reaper'] as const) it.each([1, 2] as const)(
    `${character}/P%i preserves a ready engine hit instead of retaining retreat`, side => {
      vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(.5);
      const world = scene(side);
      world.projectiles = [];
      world.players[side - 1] = { ...createInitialPlayer(side, CHARACTERS[character]), x: 400, y: 440, mana: 0, facingRight: side === 1 };
      const other = side === 1 ? 2 : 1;
      world.players[other - 1] = { ...createInitialPlayer(other, CHARACTERS.gladiator), x: side === 1 ? 460 : 340,
        y: 440, mana: 0, attackCooldownRemaining: 1000, facingRight: side === 2 };
      const free = decide(world, side);
      const prior = { ...free.memory, movement: { direction: (side === 1 ? -1 : 1) as -1 | 1,
        selectedAt: 9984, score: -1e6, goalSignature: free.memory.goalSignature } };
      const chosen = decide(world, side, prior);
      expect(side === 1 ? chosen.keys.f : chosen.keys.shift).toBe(true);
      const game = renderHook(() => useGameEngine(world.players[0].character!, world.players[1].character!, 60, () => {}, 'multi', false, 1, 'wasteland'));
      game.result.current.gameState.players = [{ ...world.players[0] }, { ...world.players[1] }];
      act(() => game.result.current.setKeysRef({ current: chosen.keys }));
      act(() => { vi.advanceTimersByTime(17); });
      expect(game.result.current.gameState.players[other - 1].health).toBeLessThan(world.players[other - 1].health);
    });
});
