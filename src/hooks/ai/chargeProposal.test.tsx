import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { createAISettings, NEUTRAL_AI_TRAITS } from '@/types/ai';
import { MAPS } from '@/types/map';
import * as projectiles from '@/types/projectile';
import { useGameEngine } from '../useGameEngine';
import { decideAI } from './controller';
import { createOpponentModel } from './learning';
import { prepareAIFrame, type AIWorld } from './world';
import { chooseCombat } from './combat';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
function world(side: 1 | 2, hacked = false): AIWorld {
  const direction = side === 1 ? 1 : -1;
  const self = { ...createInitialPlayer(side, CHARACTERS.scientist), x: 400, y: 440, mana: 60,
    facingRight: side === 1, attackCooldownRemaining: 5000, isChargingSkill: true, skillChargeStartTime: 8500,
    knockbackVelocityX: direction * 1500, isHacked: hacked, hackedDuration: hacked ? 1000 : 0 };
  const enemy = { ...createInitialPlayer(side === 1 ? 2 : 1, CHARACTERS.archer), x: 400 + direction * 30, y: 440, mana: 0 };
  return { players: side === 1 ? [self, enemy] : [enemy, self], platforms: MAPS.wasteland.platforms,
    projectiles: [], attackHitboxes: [], hazardZones: [], now: 10000, deltaTime: 100, mapId: 'wasteland',
    roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
    lightningStrikes: [], soulZones: [], vineShields: [] };
}

describe('bounded Scientist hold/release/re-aim proposals', () => {
  it.each([1, 2] as const)('P%i preserves the admitted approach while building an early charge', side => {
    const w = world(side), self = w.players[side - 1], enemy = w.players[side === 1 ? 1 : 0];
    self.knockbackVelocityX = 0; self.skillChargeStartTime = 9700; self.facingRight = side === 1;
    enemy.x = side === 1 ? 650 : 150;
    const direction = side === 1 ? 1 : -1;
    const parameters = createAISettings('perfect').parameters;
    const proposal = chooseCombat(prepareAIFrame(w, { forecasts: parameters.forecasts, random: () => .5 }), self, enemy,
      createOpponentModel(), { direction, jump: false, drop: false }, true, false, 'approach', () => enemy,
      false, { parameters, traits: NEUTRAL_AI_TRAITS, random: () => .5 });
    expect(proposal.skill).toBe(true);
    expect(proposal.alternatives.every(p => p.skill && p.action.direction === direction)).toBe(true);
  });

  for (const side of [1, 2] as const) it.each([false, true])(`P${side}/hacked=%s re-aims a full orb after crossing`, hacked => {
    vi.useFakeTimers(); vi.setSystemTime(9900); vi.spyOn(Math, 'random').mockReturnValue(.5);
    const w = world(side, hacked), self = w.players[side - 1], enemy = w.players[side === 1 ? 1 : 0];
    const parameters = createAISettings('perfect').parameters, random = vi.fn(() => .5);
    const frame = prepareAIFrame(w, { forecasts: parameters.forecasts, random: () => .5 });
    const proposal = chooseCombat(frame, self, enemy, createOpponentModel(),
      { direction: side === 1 ? 1 : -1, jump: false, drop: false }, true, false, 'pressure', () => enemy,
      false, { parameters, traits: NEUTRAL_AI_TRAITS, random });
    expect(proposal.alternatives.length).toBeLessThanOrEqual(6);
    expect(random).not.toHaveBeenCalled();
    expect(proposal.alternatives.some(p => !p.skill && p.castValue > 0 && p.action.direction === (side === 1 ? -1 : 1))).toBe(true);
    const chosen = decideAI(frame, self, createOpponentModel(), undefined,
      { parameters, traits: NEUTRAL_AI_TRAITS, random });
    expect(side === 1 ? chosen.keys.g : chosen.keys.enter).toBe(false);
    const created = vi.spyOn(projectiles, 'createProjectile');
    const game = renderHook(() => useGameEngine(w.players[0].character!, w.players[1].character!, 60, () => {}, 'multi', false, 1, 'wasteland'));
    game.result.current.gameState.players = [{ ...w.players[0] }, { ...w.players[1] }];
    act(() => game.result.current.setKeysRef({ current: chosen.keys }));
    vi.setSystemTime(9984);
    act(() => { vi.advanceTimersByTime(16); });
    const orb = created.mock.calls.find(args => args[0] === 'electric-orb');
    expect(orb).toBeDefined();
    expect(Math.sign(orb![4])).toBe(side === 1 ? -1 : 1);
    expect(game.result.current.gameState.players[side - 1].mana).toBe(self.mana - CHARACTERS.scientist.skill.manaCost);
    act(() => { vi.advanceTimersByTime(500); });
    expect(game.result.current.gameState.players[side === 1 ? 1 : 0].health).toBeLessThan(enemy.health);
  });

  it.each([1, 2] as const)('P%i can release away from an unreachable target to avoid imminent overcharge', side => {
    vi.useFakeTimers(); vi.setSystemTime(9900); vi.spyOn(Math, 'random').mockReturnValue(.5);
    const w = world(side), self = w.players[side - 1], enemy = w.players[side === 1 ? 1 : 0];
    self.knockbackVelocityX = 0; self.skillChargeStartTime = 6501; enemy.y = 40;
    const parameters = createAISettings('perfect').parameters;
    const result = decideAI(prepareAIFrame(w, { forecasts: parameters.forecasts, random: () => .5 }), self,
      createOpponentModel(), undefined, { parameters, traits: NEUTRAL_AI_TRAITS, random: () => .5 });
    expect(side === 1 ? result.keys.g : result.keys.enter).toBe(false);
    const game = renderHook(() => useGameEngine(w.players[0].character!, w.players[1].character!, 60, () => {}, 'multi', false, 1, 'wasteland'));
    game.result.current.gameState.players = [{ ...w.players[0] }, { ...w.players[1] }];
    act(() => game.result.current.setKeysRef({ current: result.keys }));
    vi.setSystemTime(9984);
    act(() => { vi.advanceTimersByTime(16); });
    const actual = game.result.current.gameState.players[side - 1];
    expect(actual.health).toBe(self.health);
    expect(actual.isChargingSkill).toBe(false);
    expect(actual.isStunned).toBe(false);
    expect(actual.mana).toBe(self.mana - CHARACTERS.scientist.skill.manaCost);
  });
});
