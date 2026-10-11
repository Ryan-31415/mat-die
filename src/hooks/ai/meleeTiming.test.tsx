import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer, type Player } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { MAPS, type MapId } from '@/types/map';
import { basicMeleeGeometry, playerOverlapsRect } from '@/types/combatPhysics';
import { useGameEngine } from '../useGameEngine';
import { chooseCombat } from './combat';
import { emptyAIKeys, type Action } from './controller';
import { createOpponentModel, predictOpponent } from './learning';
import { predictActionStart } from './actionStart';
import { prepareAIFrame, type AIWorld } from './world';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

function world(self: Player, enemy: Player, dt: number, map: MapId): AIWorld {
  return { players: self.id === 1 ? [self, enemy] : [enemy, self], projectiles: [], hazardZones: [], attackHitboxes: [],
    platforms: MAPS[map].platforms, mapId: map, now: 10000, deltaTime: dt, roundTimeRemaining: 60, isOvertime: false,
    sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
}

function check(w: AIWorld, side: 1 | 2, action: Action, expected: boolean) {
  const self = w.players[side - 1], enemy = w.players[side === 1 ? 1 : 0], model = createOpponentModel();
  const frame = prepareAIFrame(w, { forecasts: createAISettings('perfect').parameters.forecasts, random: () => 0.5 });
  const snapshot = structuredClone(w);
  const decision = chooseCombat(frame, self, enemy, model, action, true, false, 'pressure',
    time => predictOpponent(model, enemy, time, w.platforms, w.now));
  expect(decision.attack).toBe(expected);
  expect(w).toEqual(snapshot);
  const game = renderHook(() => useGameEngine(w.players[0].character!, w.players[1].character!, 60, () => {}, 'multi', false, 1, w.mapId));
  w.players.forEach((p, i) => Object.assign(game.result.current.gameState.players[i], p));
  const keys = emptyAIKeys();
  // Force the attack independently of the verdict and inspect its actual damage.
  if (side === 1) { keys.a = action.direction < 0; keys.d = action.direction > 0; keys.w = action.jump; keys.f = true; }
  else { keys.arrowLeft = action.direction < 0; keys.arrowRight = action.direction > 0; keys.arrowUp = action.jump; keys.shift = true; }
  act(() => game.result.current.setKeysRef({ current: keys }));
  vi.setSystemTime(9984); act(() => { vi.advanceTimersByTime(16); });
  const state = game.result.current.gameState;
  expect(state.players[side === 1 ? 1 : 0].health < enemy.health).toBe(expected);
  game.unmount();
}

describe('melee uses the opponent position when damage resolves', () => {
  for (const character of ['gladiator', 'ninja', 'reaper'] as const) {
    it(`${character} rejects the observed volcano falling boundary miss`, () => {
      vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const side = character === 'reaper' ? 2 : 1;
      const self = { ...createInitialPlayer(side, CHARACTERS[character]), mana: 0, isGrounded: false,
        isJumping: false, facingRight: true, lastGroundedTime: 10000,
        ...(character === 'gladiator' ? { x: 426.88, y: 245, velocityY: 300 }
          : character === 'ninja' ? { x: 161.2, y: 320, velocityY: 0, isGrounded: true }
          : { x: 583.52, y: 280.5696, velocityY: 540.8 }) };
      const enemy = { ...createInitialPlayer(side === 1 ? 2 : 1, CHARACTERS.gladiator), mana: 0, isGrounded: false,
        ...(character === 'gladiator' ? { x: 440, y: 289.08, velocityY: 98.4 }
          : character === 'ninja' ? { x: 290.6861437385392, y: 333.2016, velocityY: 472.8 }
          : { x: 740, y: 338.6368, velocityY: 291.2 }) };
      const w = world(self, enemy, 16, 'volcano'), action: Action = { direction: 1, jump: character === 'ninja', drop: false };
      const launch = { ...self, ...predictActionStart(w, self, { left: false, right: true, jump: action.jump, down: false }, false) };
      expect(playerOverlapsRect(enemy, basicMeleeGeometry(launch)!)).toBe(true);
      check(w, side, action, false);
    });

    for (const side of [1, 2] as const) it.each([16, 33, 100])(`${character}/P${side} preserves a falling target entering range at dt%i`, dt => {
      vi.useFakeTimers(); vi.setSystemTime(10000 - dt); vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const self = { ...createInitialPlayer(side, CHARACTERS[character]), x: 400, y: 440, mana: 0, facingRight: true };
      const enemy = { ...createInitialPlayer(side === 1 ? 2 : 1, CHARACTERS.gladiator), x: 460,
        y: 389, velocityY: 800, isGrounded: false, mana: 0 };
      expect(playerOverlapsRect(enemy, basicMeleeGeometry(self)!)).toBe(false);
      check(world(self, enemy, dt, 'wasteland'), side, { direction: 0, jump: false, drop: false }, true);
    });
  }
});
