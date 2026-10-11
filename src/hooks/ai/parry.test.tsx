import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { MAPS } from '@/types/map';
import { createProjectile } from '@/types/projectile';
import { basicMeleeGeometry } from '@/types/combatPhysics';
import { useGameEngine } from '../useGameEngine';
import { chooseCombat } from './combat';
import { emptyAIKeys, type Action } from './controller';
import { createOpponentModel } from './learning';
import { prepareAIFrame, type AIWorld } from './world';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

function scene(side: 1 | 2, jumping: boolean, dt = 16): AIWorld {
  const self = { ...createInitialPlayer(side, CHARACTERS.ninja), x: 453.2, y: jumping ? 412.5056 : 440,
    velocityY: jumping ? -838.4 : 0, isGrounded: !jumping, isJumping: false, facingRight: true,
    lastGroundedTime: 10000, mana: 0 };
  const enemy = { ...createInitialPlayer(side === 1 ? 2 : 1, CHARACTERS.archer), x: 140, y: 440, mana: 0 };
  // The grounded control starts outside the body; an already overlapping shot
  // ties sword/body contact at zero and the engine intentionally does not parry.
  const arrow = createProjectile('arrow', enemy.id, jumping ? 419.2 : 408.2, 445.04864, 600, 6.08, 7, { now: 10000, random: () => 0.5 });
  return { players: side === 1 ? [self, enemy] : [enemy, self], projectiles: [arrow], platforms: MAPS.wasteland.platforms,
    hazardZones: [], attackHitboxes: [], mapId: 'wasteland', now: 10000, deltaTime: dt,
    roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
    lightningStrikes: [], soulZones: [], vineShields: [] };
}

function combat(world: AIWorld, side: 1 | 2, action: Action) {
  const frame = prepareAIFrame(world, { forecasts: createAISettings('perfect').parameters.forecasts, random: () => 0.5 });
  const self = world.players[side - 1], enemy = world.players[side === 1 ? 1 : 0];
  return chooseCombat(frame, self, enemy, createOpponentModel(), action, false, true, 'pressure', () => enemy);
}

describe('Ninja parry at the actual attack creation position', () => {
  for (const side of [1, 2] as const) {
    it.each([false, true])(`P${side} jumping=%s agrees with the actual first engine sweep`, jumping => {
      vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const world = scene(side, jumping), source = structuredClone(world);
      const action: Action = { direction: -1, jump: jumping, drop: false };
      expect(combat(world, side, action).attack).toBe(!jumping);
      expect(world).toEqual(source);
      const game = renderHook(() => useGameEngine(world.players[0].character!, world.players[1].character!, 60, () => {}, 'multi', false, 1, 'wasteland'));
      world.players.forEach((p, i) => Object.assign(game.result.current.gameState.players[i], p));
      game.result.current.gameState.projectiles.push(...world.projectiles.map(p => ({ ...p })));
      const keys = emptyAIKeys();
      // Force the same basic attack independently of the AI verdict, so a false
      // verdict cannot make the engine reference pass by omitting the attack.
      if (side === 1) { keys.a = true; keys.w = jumping; keys.f = true; }
      else { keys.arrowLeft = true; keys.arrowUp = jumping; keys.shift = true; }
      act(() => game.result.current.setKeysRef({ current: keys }));
      act(() => { vi.advanceTimersByTime(17); });
      const state = game.result.current.gameState;
      expect(state.attackHitboxes.some(h => h.ownerId === side)).toBe(true);
      const sword = state.attackHitboxes.find(h => h.ownerId === side)!;
      const geometry = basicMeleeGeometry(state.players[side - 1])!;
      expect(sword).toMatchObject({ x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height });
      expect(state.projectiles[0].ownerId).toBe(jumping ? (side === 1 ? 2 : 1) : side);
      expect(state.players[side - 1].health).toBe(world.players[side - 1].health);
    });
  }

  it.each([90, 40])('uses sword age after a 100ms callback for a shot starting at %i', x => {
    vi.useFakeTimers(); vi.setSystemTime(9900); vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const world = scene(1, false, 100);
    world.players[0].x = 400;
    world.projectiles = [createProjectile('bullet', 2, x, 450, 1000, 0, 7, { now: world.now, random: () => 0.5 })];
    expect(combat(world, 1, { direction: -1, jump: false, drop: false }).attack).toBe(x === 90);
    const game = renderHook(() => useGameEngine(CHARACTERS.ninja, CHARACTERS.archer, 60, () => {}, 'multi', false, 1, 'wasteland'));
    world.players.forEach((p, i) => Object.assign(game.result.current.gameState.players[i], p));
    game.result.current.gameState.projectiles.push(...world.projectiles.map(p => ({ ...p })));
    act(() => game.result.current.setKeysRef({ current: { ...emptyAIKeys(), a: true, f: true } }));
    vi.setSystemTime(9984); act(() => { vi.advanceTimersByTime(16); });
    // Release attack to prevent a later second sword from validating the first.
    act(() => game.result.current.setKeysRef({ current: { ...emptyAIKeys(), a: true } }));
    act(() => { vi.advanceTimersByTime(125); });
    expect(game.result.current.gameState.projectiles[0]?.ownerId).toBe(x === 90 ? 1 : 2);
  });
});
