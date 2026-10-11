import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { MAPS } from '@/types/map';
import { useGameEngine } from '../useGameEngine';
import { predictActionStart } from './actionStart';
import { scientistChargeMotion } from './charge';
import { emptyAIKeys } from './controller';
import type { AIWorld } from './world';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Scientist charge motion follows engine callback ordering', () => {
  for (const side of [1, 2] as const) for (const hold of [false, true]) for (const dt of [16, 33, 100]) it.each([0, 800, 874, 875, 1499, 3499, 3501])(
    `P${side}/hold=${hold}/dt${dt}/charge=%i`, age => {
      vi.useFakeTimers(); vi.setSystemTime(10000 - dt); vi.spyOn(Math, 'random').mockReturnValue(.5);
      const self = { ...createInitialPlayer(side, CHARACTERS.scientist), x: 400, y: 440, mana: 60,
        isChargingSkill: age > 0, skillChargeStartTime: age > 0 ? 10000 - age : undefined };
      const other = side === 1 ? 2 : 1;
      const enemy = { ...createInitialPlayer(other, CHARACTERS.archer), x: 40, y: 440, mana: 0 };
      const world: AIWorld = { players: side === 1 ? [self, enemy] : [enemy, self], platforms: MAPS.wasteland.platforms,
        projectiles: [], attackHitboxes: [], hazardZones: [], now: 10000, deltaTime: dt, mapId: 'wasteland',
        roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
        lightningStrikes: [], soulZones: [], vineShields: [] };
      const start = predictActionStart(world, self, { left: false, right: true, jump: false, down: false }, hold);
      const motion = scientistChargeMotion(world, self, start, hold), source = structuredClone(world);
      const game = renderHook(() => useGameEngine(world.players[0].character!, world.players[1].character!, 60, () => {}, 'multi', false, 1, 'wasteland'));
      game.result.current.gameState.players = [{ ...world.players[0] }, { ...world.players[1] }];
      const keys = { ...emptyAIKeys(), d: side === 1, arrowRight: side === 2, g: side === 1 && hold, enter: side === 2 && hold };
      act(() => game.result.current.setKeysRef({ current: keys }));
      vi.setSystemTime(9984);
      act(() => { vi.advanceTimersByTime(16); });
      const first = game.result.current.gameState.players[side - 1];
      expect(first.x).toBeCloseTo(start.x, 9);
      if (age > 3500) {
        expect(first.isStunned).toBe(true);
        expect(first.health).toBeLessThan(self.health);
        expect(motion.speedAt(16, 16)).toBe(0);
      } else {
        const expected = first.x + motion.speedAt(16, 16) * .016;
        act(() => { vi.advanceTimersByTime(16); });
        expect(game.result.current.gameState.players[side - 1].x).toBeCloseTo(expected, 8);
        if (age === 3499 && hold) {
          expect(game.result.current.gameState.players[side - 1].isStunned).toBe(true);
          expect(motion.speedAt(32, 16)).toBe(0);
        }
        if (age > 0 && !hold) {
          expect(first.isChargingSkill).toBe(false);
          expect(first.mana).toBe(self.mana - CHARACTERS.scientist.skill.manaCost);
          expect(game.result.current.gameState.projectiles.some(p => p.type === 'electric-orb')).toBe(true);
        }
      }
      expect(world).toEqual(source);
    });
});
