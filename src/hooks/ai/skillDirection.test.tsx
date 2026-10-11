import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { MAPS } from '@/types/map';
import { hunterNetLaunch } from '@/types/projectile';
import { loadEvaluationBaseline } from '@/test/aiBaseline';
import { CURRENT_AI, evaluationController } from '@/test/aiEvaluation';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';
import type { AIWorld } from './world';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
const seeds = [731, 1907, 3571, 6229, 7919, 104729, 130363, 155921];

describe('actual Hunter net launch direction under perfect observation', () => {
  it('shares the original literal net spawn and velocity without IDs, clocks or randomness', () => {
    for (const facingRight of [false, true]) {
      const player = { x: 400, y: 440, facingRight }, before = { ...player };
      expect(hunterNetLaunch(player, 15)).toEqual({ type: 'net', x: 420, y: 440,
        velocityX: facingRight ? 750 : -750, velocityY: -115, damage: 3 });
      expect(player).toEqual(before);
    }
  });
  for (const side of [1, 2] as const) for (const facing of [-1, 1]) for (const dt of [16, 33, 100]) {
    it.each([false, true])(`P${side}/facing${facing}/dt${dt}/crossing %s`, crossing => {
      vi.useFakeTimers(); vi.setSystemTime(10000 - dt); vi.spyOn(Math, 'random').mockReturnValue(0.3);
      const enemySide = side === 1 ? 2 : 1;
      const self = { ...createInitialPlayer(side, CHARACTERS.hunter), x: 400, y: 440, mana: 60,
        facingRight: facing > 0, rootDuration: 5000, lastGroundedTime: 10000, knockbackVelocityX: crossing ? facing * 1500 : 0 };
      const enemy = { ...createInitialPlayer(enemySide, CHARACTERS.gladiator), x: 400 + facing * (crossing ? 30 : 250),
        y: 440, mana: 0, rootDuration: 5000, lastGroundedTime: 10000 };
      const world: AIWorld = { players: side === 1 ? [self, enemy] : [enemy, self], platforms: MAPS.wasteland.platforms,
        projectiles: [], hazardZones: [], attackHitboxes: [], mapId: 'wasteland', now: 10000, deltaTime: dt,
        roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
        lightningStrikes: [], soulZones: [], vineShields: [] };
      const source = structuredClone(world);
      const shouldReject = crossing && dt === 100;
      let firstKeys = emptyAIKeys();
      for (const seed of seeds) {
        const current = evaluationController(CURRENT_AI, createAISettings('perfect'), seed, side);
        const baseline = evaluationController(loadEvaluationBaseline().api, createAISettings('perfect'), seed, side);
        const keys = current.step(world, current.initial()).keys;
        const old = baseline.step(world, baseline.initial()).keys;
        expect(side === 1 ? old.g : old.enter).toBe(true);
        expect(side === 1 ? keys.g : keys.enter).toBe(!shouldReject);
        if (seed === seeds[0]) firstKeys = keys;
      }
      expect(world).toEqual(source);
      const game = renderHook(() => useGameEngine(world.players[0].character!, world.players[1].character!,
        60, () => {}, 'multi', false, 1, 'wasteland'));
      Object.assign(game.result.current.gameState.players[0], structuredClone(world.players[0]));
      Object.assign(game.result.current.gameState.players[1], structuredClone(world.players[1]));
      act(() => game.result.current.setKeysRef({ current: firstKeys }));
      vi.setSystemTime(10000 - 16);
      act(() => { vi.advanceTimersByTime(16); });
      const state = game.result.current.gameState;
      const nets = state.projectiles.filter(shot => shot.ownerId === side && shot.type === 'net');
      // The 48px net is consumed by an immediate hit in overlapping 16/33ms scenes.
      const marked = state.players[enemySide - 1].isMarked && state.players[enemySide - 1].markOwnerId === side;
      expect(nets.length + Number(marked)).toBe(shouldReject ? 0 : 1);
      if (nets.length) expect(Math.sign(nets[0].velocityX)).toBe(Math.sign(state.players[enemySide - 1].x - state.players[side - 1].x));
      if (shouldReject) expect(Math.sign(state.players[enemySide - 1].x - state.players[side - 1].x)).toBe(-facing);
    });
  }
});
