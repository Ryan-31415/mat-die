import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { createAISettings, NEUTRAL_AI_TRAITS } from '@/types/ai';
import { MAPS } from '@/types/map';
import { useGameEngine } from '../useGameEngine';
import { decideAI, emptyAIKeys } from './controller';
import { createOpponentModel } from './learning';
import { prepareAIFrame, type AIWorld } from './world';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('melee recovery counter exposure', () => {
  for (const character of ['gladiator', 'ninja', 'reaper'] as const) it.each([1, 2] as const)(`${character}/P%i preserves an immediate hit during enemy recovery`, side => {
    vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const self = { ...createInitialPlayer(side, CHARACTERS[character]), x: 400, y: 440, mana: 0, facingRight: side === 1 };
    const enemy = { ...createInitialPlayer(side === 1 ? 2 : 1, CHARACTERS.gladiator), x: side === 1 ? 460 : 340,
      y: 440, mana: 0, facingRight: side === 2, attackCooldownRemaining: 1000 };
    const w: AIWorld = { players: side === 1 ? [self, enemy] : [enemy, self], projectiles: [], attackHitboxes: [], hazardZones: [],
      platforms: MAPS.wasteland.platforms, now: 10000, deltaTime: 16, mapId: 'wasteland', roundTimeRemaining: 60,
      isOvertime: false, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
      soulZones: [], lightningStrikes: [], vineShields: [] };
    const parameters = createAISettings('perfect').parameters;
    const chosen = decideAI(prepareAIFrame(w, { forecasts: parameters.forecasts, random: () => 0.5 }), self,
      createOpponentModel(), undefined, { parameters, traits: NEUTRAL_AI_TRAITS, random: () => 0.5 });
    expect(side === 1 ? chosen.keys.f : chosen.keys.shift).toBe(true);
    const game = renderHook(() => useGameEngine(w.players[0].character!, w.players[1].character!, 60, () => {}, 'multi', false, 1, 'wasteland'));
    game.result.current.gameState.players = [{ ...w.players[0] }, { ...w.players[1] }];
    act(() => game.result.current.setKeysRef({ current: chosen.keys }));
    act(() => { vi.advanceTimersByTime(17); });
    expect(game.result.current.gameState.players[side === 1 ? 1 : 0].health).toBeLessThan(enemy.health);
  });

  for (const character of ['gladiator', 'ninja', 'reaper'] as const) it.each([1, 2] as const)(`${character}/P%i avoids a counter before its own next attack`, side => {
    vi.useFakeTimers(); vi.setSystemTime(10032); vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const direction = side === 1 ? 1 : -1;
    const self = { ...createInitialPlayer(side, CHARACTERS[character]), x: 400, y: 440, mana: 20.2208,
      attackCooldownRemaining: 1084, knockbackVelocityX: direction * 450, facingRight: side === 1 };
    const enemy = { ...createInitialPlayer(side === 1 ? 2 : 1, CHARACTERS.gladiator), x: 400 + direction * 60,
      y: 440, mana: 0, attackCooldownRemaining: 859, knockbackVelocityX: direction * 450, facingRight: side === 2 };
    const w: AIWorld = { players: side === 1 ? [self, enemy] : [enemy, self], projectiles: [], attackHitboxes: [], hazardZones: [],
      platforms: MAPS.wasteland.platforms, now: 10048, deltaTime: 16, mapId: 'wasteland', roundTimeRemaining: 60,
      isOvertime: false, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
      soulZones: [], lightningStrikes: [], vineShields: [] };
    const snapshot = structuredClone(w), parameters = createAISettings('perfect').parameters;
    const chosen = decideAI(prepareAIFrame(w, { forecasts: parameters.forecasts, random: () => 0.5 }), self,
      createOpponentModel(), undefined, { parameters, traits: NEUTRAL_AI_TRAITS, random: () => 0.5 });
    expect(w).toEqual(snapshot);
    const replay = (keys: ReturnType<typeof emptyAIKeys>) => {
      vi.setSystemTime(10032);
      const game = renderHook(() => useGameEngine(w.players[0].character!, w.players[1].character!, 60, () => {}, 'multi', false, 1, 'wasteland'));
      game.result.current.gameState.players = [{ ...w.players[0] }, { ...w.players[1] }];
      // Enemy keys are supplied only to the independent engine reference.
      act(() => game.result.current.setKeysRef({ current: { ...keys, f: side === 2 || keys.f, shift: side === 1 || keys.shift } }));
      act(() => { vi.advanceTimersByTime(1020); });
      const damage = self.health - game.result.current.gameState.players[side - 1].health;
      game.unmount(); cleanup(); vi.clearAllTimers();
      return damage;
    };
    expect(replay(emptyAIKeys())).toBeGreaterThan(0);
    expect(replay(chosen.keys), JSON.stringify(chosen.keys)).toBe(0);
  });
});
