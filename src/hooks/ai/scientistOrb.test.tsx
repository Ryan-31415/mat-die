import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { scientistOrbLaunch } from '@/types/projectile';
import { loadFrozenAI } from '@/test/aiBaseline';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';
import { MAPS } from '@/types/map';
import { chooseCombat } from './combat';
import { createOpponentModel } from './learning';
import { prepareAIFrame, type AIWorld } from './world';
import { predictActionStart } from './actionStart';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('shared Scientist orb release preserves original engine rules', () => {
  for (const side of [1, 2] as const) it.each([33, 100])(`P${side}/crossing dt%i distinguishes a real orb overlap from firing away`, dt => {
    vi.useFakeTimers(); vi.setSystemTime(10000 - dt); vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const direction = side === 1 ? 1 : -1;
    const self = { ...createInitialPlayer(side, CHARACTERS.scientist), x: 400, y: 440, mana: 60,
      facingRight: side === 1, isChargingSkill: true, skillChargeStartTime: 8500, knockbackVelocityX: direction * 1500 };
    const enemy = { ...createInitialPlayer(side === 1 ? 2 : 1, CHARACTERS.archer), x: 400 + direction * 30, y: 440, mana: 0 };
    const w: AIWorld = { players: side === 1 ? [self, enemy] : [enemy, self], projectiles: [], attackHitboxes: [], hazardZones: [],
      platforms: MAPS.wasteland.platforms, now: 10000, deltaTime: dt, mapId: 'wasteland', roundTimeRemaining: 60, isOvertime: false,
      sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0, soulZones: [], lightningStrikes: [], vineShields: [] };
    const selected = { direction: side === 1 ? 1 as const : -1 as const, jump: false, drop: false };
    const launch = predictActionStart(w, self, { left: direction < 0, right: direction > 0, jump: false, down: false }, false);
    expect(direction * (enemy.x - launch.x)).toBeLessThan(0);
    const decision = chooseCombat(prepareAIFrame(w), self, enemy, createOpponentModel(), selected, true, false, 'pressure', () => enemy);
    const game = renderHook(() => useGameEngine(w.players[0].character!, w.players[1].character!, 60, () => {}, 'multi', false, 1, 'wasteland'));
    game.result.current.gameState.players = [{ ...w.players[0] }, { ...w.players[1] }];
    // Force release independently of the prediction; no basic flask can mask a miss.
    act(() => game.result.current.setKeysRef({ current: { ...emptyAIKeys(), d: side === 1, arrowLeft: side === 2 } }));
    vi.setSystemTime(9984);
    act(() => { vi.advanceTimersByTime(16); });
    const hits = game.result.current.gameState.players[side === 1 ? 1 : 0].health < enemy.health;
    expect(hits).toBe(dt === 33);
    expect(decision.skill).toBe(!hits);
  });

  for (const side of [1, 2] as const) for (const overtime of [false, true]) it.each([16, 749, 750, 1499, 1500, 3500])(
    `P${side}/overtime=${overtime}/charge=%i`, charge => {
      const run = (hook: typeof useGameEngine) => {
        vi.useFakeTimers(); vi.setSystemTime(10000); vi.spyOn(Math, 'random').mockReturnValue(0.5);
        const self = { ...createInitialPlayer(side, CHARACTERS.scientist), x: 400, y: 300, isGrounded: false,
          mana: 60, damageBoost: 0.25, buffDuration: 1000, isChargingSkill: true, skillChargeStartTime: 10016 - charge,
          facingRight: side === 1 };
        const other = { ...createInitialPlayer(side === 1 ? 2 : 1, CHARACTERS.archer), x: side === 1 ? 50 : 740, y: 440 };
        const players = side === 1 ? [self, other] as const : [other, self] as const;
        const game = renderHook(() => hook(players[0].character!, players[1].character!, 60, () => {}, 'multi', false, 1, 'wasteland'));
        game.result.current.gameState.players = [{ ...players[0] }, { ...players[1] }];
        game.result.current.gameState.isOvertime = overtime;
        act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
        act(() => { vi.advanceTimersByTime(17); });
        const state = game.result.current.gameState;
        const result = structuredClone({ players: state.players, projectiles: state.projectiles });
        game.unmount(); cleanup(); vi.clearAllTimers(); vi.useRealTimers();
        return result;
      };
      const current = run(useGameEngine), original = run(loadFrozenAI().api.useGameEngine);
      expect(current).toEqual(original);
      expect(current.projectiles).toHaveLength(1);
      const self = current.players[side - 1], projectile = current.projectiles[0];
      const spec = scientistOrbLaunch(self, charge, CHARACTERS.scientist.attackDamage * 1.25 * (overtime ? 2 : 1));
      expect(projectile).toMatchObject({ type: spec.type, width: spec.width, height: spec.height,
        damage: spec.damage, velocityX: spec.velocityX, velocityY: spec.velocityY,
        knockback: spec.knockback, slowAmount: spec.slowAmount, slowDuration: spec.slowDuration,
        stunDuration: spec.stunDuration, chargeLevel: spec.chargeLevel });
      expect(self.isChargingSkill).toBe(false);
      expect(self.mana).toBe(60 - CHARACTERS.scientist.skill.manaCost);
    });
});
