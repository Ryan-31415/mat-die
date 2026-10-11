import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { createAISettings, NEUTRAL_AI_TRAITS } from '@/types/ai';
import { MAPS } from '@/types/map';
import { createProjectile } from '@/types/projectile';
import { useGameEngine } from '../useGameEngine';
import { chooseCombat } from './combat';
import { decideAI, emptyAIKeys } from './controller';
import { createOpponentModel } from './learning';
import { prepareAIFrame, type AIWorld } from './world';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

function scene(side: 1 | 2, hacked: boolean): AIWorld {
  const self = { ...createInitialPlayer(side, CHARACTERS.gladiator), x: 400, y: 440, mana: 60,
    facingRight: true, isHacked: hacked, hackedDuration: hacked ? 5000 : 0 };
  const enemy = { ...createInitialPlayer(side === 1 ? 2 : 1, CHARACTERS.archer), x: 460, y: 440, mana: 0 };
  return { players: side === 1 ? [self, enemy] : [enemy, self],
    projectiles: [createProjectile('bullet', enemy.id, 300, 450, 1000, 0, 7, { now: 10000, random: () => 0.5 })],
    platforms: MAPS.wasteland.platforms, hazardZones: [], attackHitboxes: [], mapId: 'wasteland', now: 10000,
    deltaTime: 16, roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right',
    sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
}

describe('immutable movement and combat proposals', () => {
  for (const side of [1, 2] as const) it.each([false, true])(`P${side}/hacked=%s shields toward a projectile without attacking behind itself`, hacked => {
    vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const world = scene(side, hacked), self = world.players[side - 1], enemy = world.players[side === 1 ? 1 : 0];
    const selected = Object.freeze({ direction: 1 as const, jump: false, drop: false }), snapshot = structuredClone(world);
    const frame = prepareAIFrame(world, { forecasts: createAISettings('perfect').parameters.forecasts, random: () => 0.5 });
    const decision = chooseCombat(frame, self, enemy, createOpponentModel(), selected, true, true, 'pressure', () => enemy);
    expect(selected.direction).toBe(1);
    expect(world).toEqual(snapshot);
    expect(decision).toMatchObject({ attack: false, skill: true, action: { direction: -1, jump: false, drop: false } });
    const game = renderHook(() => useGameEngine(world.players[0].character!, world.players[1].character!, 60, () => {}, 'multi', false, 1, 'wasteland'));
    world.players.forEach((p, i) => Object.assign(game.result.current.gameState.players[i], p));
    const keys = emptyAIKeys();
    // Independently force the obsolete simultaneous attack with the final turn;
    // the actual engine must show it misses the opponent behind the shield.
    if (side === 1) { keys.a = !hacked; keys.d = hacked; keys.f = true; keys.g = decision.skill; }
    else { keys.arrowLeft = !hacked; keys.arrowRight = hacked; keys.shift = true; keys.enter = decision.skill; }
    act(() => game.result.current.setKeysRef({ current: keys }));
    act(() => { vi.advanceTimersByTime(17); });
    const state = game.result.current.gameState;
    expect(state.players[side - 1]).toMatchObject({ facingRight: false, isShielding: true });
    expect(state.players[side === 1 ? 1 : 0].health).toBe(enemy.health);
    expect(state.attackHitboxes.some(h => h.ownerId === side)).toBe(true);
  });

  it('does not commit a defensive turn when the skill personality roll rejects it', () => {
    const world = scene(1, false), self = world.players[0], enemy = world.players[1];
    const selected = Object.freeze({ direction: 1 as const, jump: false, drop: false });
    const random = vi.fn(() => 0.99);
    const decision = chooseCombat(prepareAIFrame(world), self, enemy, createOpponentModel(), selected, true, true,
      'pressure', () => enemy, false, { parameters: createAISettings('perfect').parameters,
        traits: { ...NEUTRAL_AI_TRAITS, skill: 0.1 }, random });
    expect(decision).toMatchObject({ skill: false, attack: true, action: selected });
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('re-evaluates held defense without drawing another movement-noise sample', () => {
    const w = scene(1, false), parameters = createAISettings('perfect').parameters;
    w.players[0].rootDuration = 10000;
    parameters.noise = 1; // Functional custom-setting contract, not a performance experiment.
    const random = vi.fn(() => 0.5);
    const frame = prepareAIFrame(w, { forecasts: parameters.forecasts, random: () => 0.5 });
    const decision = decideAI(frame, w.players[0], createOpponentModel(), undefined,
      { parameters, traits: NEUTRAL_AI_TRAITS, random });
    expect(decision.keys.g).toBe(true);
    // Three rooted movement candidates each draw two Box-Muller inputs; only the
    // admitted skill then samples personality. Final risk is deterministic.
    expect(random).toHaveBeenCalledTimes(7);
    expect(Number.isFinite(decision.risk)).toBe(true);
  });

  it.each([1, 2] as const)('P%i chooses an effective shield direction before committing the input', side => {
    vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const w = scene(side, false), self = w.players[side - 1];
    self.rootDuration = 10000;
    w.projectiles = [createProjectile('bullet', side === 1 ? 2 : 1, 390, 450, 1000, 0, 7, { now: w.now, random: () => 0.5 })];
    const settings = createAISettings('perfect');
    const decision = decideAI(prepareAIFrame(w, { forecasts: settings.parameters.forecasts, random: () => 0.5 }), self,
      createOpponentModel(), undefined, { parameters: settings.parameters, traits: NEUTRAL_AI_TRAITS, random: () => 0.5 });
    expect(side === 1 ? decision.keys.g : decision.keys.enter).toBe(true);
    expect(side === 1 ? decision.keys.a : decision.keys.arrowLeft).toBe(true);
    const game = renderHook(() => useGameEngine(w.players[0].character!, w.players[1].character!, 60, () => {}, 'multi', false, 1, 'wasteland'));
    w.players.forEach((p, i) => Object.assign(game.result.current.gameState.players[i], p));
    game.result.current.gameState.projectiles.push(...w.projectiles.map(p => ({ ...p })));
    act(() => game.result.current.setKeysRef({ current: decision.keys }));
    act(() => { vi.advanceTimersByTime(17); });
    const state = game.result.current.gameState;
    expect(state.players[side - 1].health).toBe(self.health);
    expect(state.projectiles[0].ownerId).toBe(side);
    expect(state.projectiles[0].velocityX).toBe(-1000);
  });

  it('can select a cheaper jump instead of unnecessary defense without resampling personality', () => {
    vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const w = scene(1, false), parameters = createAISettings('perfect').parameters;
    parameters.noise = 1; // Preserve the original six-candidate functional RNG control.
    const random = vi.fn(() => 0.5);
    const decision = decideAI(prepareAIFrame(w, { forecasts: parameters.forecasts, random: () => 0.5 }), w.players[0],
      createOpponentModel(), undefined, { parameters, traits: NEUTRAL_AI_TRAITS, random });
    expect(decision.keys.g).toBe(false);
    expect(decision.keys.w).toBe(true);
    expect(random).toHaveBeenCalledTimes(13);
    const game = renderHook(() => useGameEngine(CHARACTERS.gladiator, CHARACTERS.archer, 60, () => {}, 'multi', false, 1, 'wasteland'));
    w.players.forEach((p, i) => Object.assign(game.result.current.gameState.players[i], p));
    game.result.current.gameState.projectiles.push(...w.projectiles.map(p => ({ ...p })));
    act(() => game.result.current.setKeysRef({ current: decision.keys }));
    act(() => { vi.advanceTimersByTime(170); });
    expect(game.result.current.gameState.players[0].health).toBe(w.players[0].health);
    expect(game.result.current.gameState.players[0].isShielding).toBe(false);
  });

  it.each([false, true])('avoids a rear rocket with actual engine input: rooted=%s', rooted => {
    vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const w = scene(2, false), self = w.players[1];
    Object.assign(self, { x: 480, facingRight: false, rootDuration: rooted ? 10000 : 0 });
    w.players = [{ ...createInitialPlayer(1, CHARACTERS.rocketeer), x: 180, y: 440, mana: 60 }, self];
    w.projectiles = [createProjectile('rocket', 1, 555, 460, -550, 0, 16, { now: w.now, random: () => 0.5 })];
    const parameters = createAISettings('perfect').parameters;
    const decision = decideAI(prepareAIFrame(w, { forecasts: parameters.forecasts, random: () => 0.5 }), self,
      createOpponentModel(), undefined, { parameters, traits: NEUTRAL_AI_TRAITS, random: () => 0.5 });
    const replay = (keys: ReturnType<typeof emptyAIKeys>) => {
      vi.setSystemTime(9984);
      const game = renderHook(() => useGameEngine(CHARACTERS.rocketeer, CHARACTERS.gladiator, 60, () => {}, 'multi', false, 1, 'wasteland'));
      game.result.current.gameState.players = [{ ...w.players[0] }, { ...w.players[1] }];
      game.result.current.gameState.projectiles.push(...w.projectiles.map(p => ({ ...p })));
      act(() => game.result.current.setKeysRef({ current: keys }));
      act(() => { vi.advanceTimersByTime(340); });
      const health = game.result.current.gameState.players[1].health;
      game.unmount(); vi.clearAllTimers();
      return health;
    };
    expect(replay(emptyAIKeys())).toBeLessThan(self.health);
    expect(replay(decision.keys)).toBe(self.health);
    if (rooted) {
      expect(decision.keys.enter).toBe(true);
      expect(decision.keys.arrowRight).toBe(true);
    }
  });

  it('retains defense against a ready melee attack that can resolve in the current callback', () => {
    vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const w = scene(1, false), self = w.players[0];
    self.attackCooldownRemaining = 500;
    w.players = [self, { ...createInitialPlayer(2, CHARACTERS.gladiator), x: 490, y: 440, facingRight: false, mana: 0 }];
    w.projectiles = [];
    const parameters = createAISettings('perfect').parameters;
    const decision = decideAI(prepareAIFrame(w, { forecasts: parameters.forecasts, random: () => 0.5 }), self,
      createOpponentModel(), undefined, { parameters, traits: NEUTRAL_AI_TRAITS, random: () => 0.5 });
    expect(decision.keys.g).toBe(true);
    const game = renderHook(() => useGameEngine(CHARACTERS.gladiator, CHARACTERS.gladiator, 60, () => {}, 'multi', false, 1, 'wasteland'));
    w.players.forEach((p, i) => Object.assign(game.result.current.gameState.players[i], p));
    // The enemy's actual input is supplied only to the engine reference. AI saw
    // readiness and geometry, never this input or a future random outcome.
    act(() => game.result.current.setKeysRef({ current: { ...decision.keys, shift: true } }));
    act(() => { vi.advanceTimersByTime(17); });
    expect(game.result.current.gameState.players[0].health).toBe(self.health);
  });

  it.each([false, true])('Ninja dash checks the moved launch position at a pool edge: pool=%s', pool => {
    vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const w = scene(1, false);
    w.players = [{ ...createInitialPlayer(1, CHARACTERS.ninja), x: 400, y: 440, mana: 30, facingRight: true },
      { ...createInitialPlayer(2, CHARACTERS.archer), x: 650, y: 440, mana: 0 }];
    w.projectiles = [];
    if (pool) w.hazardZones = [{ id: 'dash-edge', type: 'fire-pool', ownerId: 2, x: 721, y: 400, width: 10, height: 80,
      createdAt: 10000, duration: 4000, damage: 3, tickRate: 100, lastTick: 0 }];
    const action = Object.freeze({ direction: 0 as const, jump: false, drop: false });
    const decision = chooseCombat(prepareAIFrame(w), w.players[0], w.players[1], createOpponentModel(), action,
      true, false, 'pressure', () => w.players[1]);
    expect(decision.skill).toBe(!pool);
    expect(decision.action.direction).toBe(pool ? 0 : 1);
    expect(action.direction).toBe(0);
    const game = renderHook(() => useGameEngine(CHARACTERS.ninja, CHARACTERS.archer, 60, () => {}, 'multi', false, 1, 'wasteland'));
    w.players.forEach((p, i) => Object.assign(game.result.current.gameState.players[i], p));
    // Force the proposed rightward dash independently: its actual endpoint
    // overlaps x721, although the obsolete pre-movement endpoint x680 did not.
    act(() => game.result.current.setKeysRef({ current: { ...emptyAIKeys(), d: true, g: true } }));
    act(() => { vi.advanceTimersByTime(17); });
    expect(game.result.current.gameState.players[0].x).toBeCloseTo(686.6);
  });
});
