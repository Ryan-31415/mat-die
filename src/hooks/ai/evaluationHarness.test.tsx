import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { CHARACTERS, createInitialPlayer, type CharacterType } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { createEngineEntities, createTickRandom, type EngineRuntimeOptions } from '@/types/engineRuntime';
import { createProjectile } from '@/types/projectile';
import { MAPS, type MapId } from '@/types/map';
import { loadFrozenAI } from '@/test/aiBaseline';
import { CURRENT_AI, deterministicEngineRandom, evaluationCloneController, evaluationController, evaluationSeed, worldForSide } from '@/test/aiEvaluation';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';
import type { AIWorld } from './world';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('evaluation engine invariants', () => {
  it('retains evaluation learning across round reset and clears it for a newly mounted game', () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const frozen = loadFrozenAI().api;
    const runtime: EngineRuntimeOptions = { random: deterministicEngineRandom(731), controllers: {
      1: evaluationController(CURRENT_AI, createAISettings('perfect'), 731, 1),
      2: evaluationController(frozen, createAISettings('perfect'), 731, 2),
    }, cloneControllers: { 1: evaluationCloneController(CURRENT_AI, 1), 2: evaluationCloneController(frozen, 2) } };
    const useFixture = () => useGameEngine(CHARACTERS.ninja, CHARACTERS.ninja, 60, () => {}, 'multi', false, 1,
      'wasteland', undefined, true, undefined, runtime);
    const game = renderHook(useFixture);
    act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
    for (const side of [1, 2] as const) game.result.current.gameState.clones.push({
      ...createInitialPlayer(side, CHARACTERS.ninja), x: side === 1 ? 260 : 500, y: 440,
      createdAt: 10000, isClone: true, aiControllerId: 'reset-clone-' + side,
    });
    for (let tick = 0; tick < 12; tick++) act(() => { vi.advanceTimersByTime(17); });
    const before = game.result.current.gameState.evaluationState!;
    expect(before.controllers[1]!.session.model.last).toBeDefined();
    expect(before.cloneModels[1]!.samples.length).toBeGreaterThan(0);
    act(() => game.result.current.resetRound());
    const reset = game.result.current.gameState.evaluationState!;
    for (const side of [1, 2] as const) {
      const prior = before.controllers[side]!, next = reset.controllers[side]!;
      expect(next).toMatchObject({ activeTime: 0, decisionsMade: 0, observationsTaken: 0, observations: [], inputs: [] });
      expect(next.session.randomState).toBe(prior.session.randomState);
      expect(next.session.automaticTraits).toEqual(prior.session.automaticTraits);
      expect(next.session.model.transitions).toEqual(prior.session.model.transitions);
      expect(next.session.model.last).toBeUndefined();
      expect(next.session.model.samples).toEqual([]);
      expect(reset.cloneModels[side]!.transitions).toEqual(before.cloneModels[side]!.transitions);
      expect(reset.cloneModels[side]!.samples).toEqual([]);
      expect(reset.cloneModels[side]!.last).toBeUndefined();
    }
    game.unmount(); vi.clearAllTimers();
    const fresh = renderHook(useFixture);
    expect(fresh.result.current.gameState.evaluationState!.controllers[1]!.session.model.transitions).toEqual(Array(9).fill(0));
    expect(fresh.result.current.gameState.evaluationState!.cloneModels[1]!.transitions).toEqual(Array(9).fill(0));
    fresh.unmount();
  });
  it('pairs personality seeds without sharing state, and derives independent condition seeds', () => {
    const seed = evaluationSeed(731, 'ninja', 'mage', 'jungle', 'medium');
    expect(seed).toBe(evaluationSeed(731, 'ninja', 'mage', 'jungle', 'medium'));
    expect(seed).not.toBe(evaluationSeed(731, 'ninja', 'mage', 'volcano', 'medium'));
    const a = evaluationController(CURRENT_AI, createAISettings('medium'), seed, 1);
    const b = evaluationController(loadFrozenAI().api, createAISettings('medium'), seed, 2);
    const initialA = a.initial(), initialB = b.initial();
    expect(initialA.session.automaticTraits).toEqual(initialB.session.automaticTraits);
    expect(initialA.session).not.toBe(initialB.session);
  });
  it('routes each owner clones to its own frozen/live controller with separate memory', () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const frozen = loadFrozenAI().api;
    const baselineDecide = vi.fn(frozen.decideAI), liveDecide = vi.fn(CURRENT_AI.decideAI);
    const baselineFrame = vi.fn(frozen.prepareAIFrame), liveFrame = vi.fn(CURRENT_AI.prepareAIFrame);
    const baseline = evaluationCloneController({ ...frozen, decideAI: baselineDecide, prepareAIFrame: baselineFrame }, 1);
    const live = evaluationCloneController({ ...CURRENT_AI, decideAI: liveDecide, prepareAIFrame: liveFrame }, 2);
    const runtime: EngineRuntimeOptions = { random: deterministicEngineRandom(731),
      controllers: { 1: emptyAIKeys, 2: emptyAIKeys }, cloneControllers: { 1: baseline, 2: live } };
    const hook = renderHook(() => useGameEngine(CHARACTERS.ninja, CHARACTERS.ninja, 60, () => {}, 'multi', false, 1, 'wasteland', undefined, true, undefined, runtime));
    act(() => hook.result.current.setKeysRef({ current: emptyAIKeys() }));
    const state = hook.result.current.gameState;
    for (const [index, side] of [1, 1, 2].entries()) state.clones.push({ ...createInitialPlayer(side as 1 | 2, CHARACTERS.ninja),
      x: 250 + index * 50, y: 440, createdAt: 10000, isClone: true, aiControllerId: 'fixture-clone-' + index });
    act(() => { vi.advanceTimersByTime(17); });
    expect(baselineDecide).toHaveBeenCalledTimes(2);
    expect(liveDecide).toHaveBeenCalledTimes(1);
    expect(baselineFrame).toHaveBeenCalledTimes(1);
    expect(liveFrame).toHaveBeenCalledTimes(1);
    expect(Object.keys(hook.result.current.gameState.aiState.controllers)).toEqual(['fixture-clone-0', 'fixture-clone-1', 'fixture-clone-2']);
    expect(hook.result.current.gameState.aiState.controllers['fixture-clone-0']).not.toBe(hook.result.current.gameState.aiState.controllers['fixture-clone-1']);
    hook.unmount();
  });
  it('keeps dual-controller evaluation identical under StrictMode updater replay', () => {
    function run(strict: boolean) {
      vi.useFakeTimers(); vi.setSystemTime(10000);
      const a = evaluationController(CURRENT_AI, createAISettings('medium'), 731, 1);
      const b = evaluationController(loadFrozenAI().api, createAISettings('medium'), 731, 2);
      const runtime: EngineRuntimeOptions = { random: deterministicEngineRandom(731), controllers: { 1: a, 2: b },
        cloneControllers: { 1: evaluationCloneController(CURRENT_AI, 1), 2: evaluationCloneController(loadFrozenAI().api, 2) } };
      const hook = renderHook(() => useGameEngine(CHARACTERS.ninja, CHARACTERS.scientist, 60, () => {}, 'multi', false, 1, 'jungle', undefined, true, undefined, runtime),
        strict ? { wrapper: StrictMode } : undefined);
      act(() => hook.result.current.setKeysRef({ current: emptyAIKeys() }));
      for (const side of [1, 2] as const) hook.result.current.gameState.clones.push({
        ...createInitialPlayer(side, CHARACTERS.ninja), x: side === 1 ? 260 : 500, y: 440,
        createdAt: 10000, isClone: true, aiControllerId: 'replay-clone-' + side,
      });
      const states = [];
      for (let tick = 0; tick < 30; tick++) {
        act(() => { vi.advanceTimersByTime(17); });
        states.push(JSON.parse(JSON.stringify(hook.result.current.gameState)));
      }
      hook.unmount(); vi.clearAllTimers(); vi.useRealTimers();
      return states;
    }
    const strict = run(true), ordinary = run(false);
    expect(strict).toEqual(ordinary);
  });
  it('preserves original engine ticks without runtime injection', () => {
    const frozen = loadFrozenAI().api;
    function run(hook: typeof useGameEngine) {
      vi.useFakeTimers(); vi.setSystemTime(10000);
      let seed = 731;
      vi.spyOn(Math, 'random').mockImplementation(() => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296));
      const game = renderHook(() => hook(CHARACTERS.archer, CHARACTERS.reaper, 2, vi.fn(), 'multi', false, 1, 'graveyard'));
      const keys = { current: { ...emptyAIKeys(), d: true, f: true, h: true, arrowLeft: true, shift: true, backslash: true } };
      act(() => game.result.current.setKeysRef(keys));
      const states = [];
      for (let tick = 0; tick < 30; tick++) {
        act(() => { vi.advanceTimersByTime(17); });
        states.push(JSON.parse(JSON.stringify(game.result.current.gameState)));
      }
      game.unmount(); vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers();
      return states;
    }
    expect(run(useGameEngine)).toEqual(run(frozen.useGameEngine));
  });

  it.each([true, false])('preserves a full-mana Ice Mage ultimate, facing right: %s', facingRight => {
    function run(engine: typeof useGameEngine) {
      vi.useFakeTimers(); vi.setSystemTime(10000);
      vi.spyOn(Math, 'random').mockReturnValue(0.3);
      const game = renderHook(() => engine(CHARACTERS['ice-mage'], CHARACTERS.gladiator, 3, vi.fn(), 'multi'));
      Object.assign(game.result.current.gameState.players[0], { x: 400, y: 300, mana: 100, facingRight });
      act(() => game.result.current.setKeysRef({ current: { ...emptyAIKeys(), h: true } }));
      act(() => { vi.advanceTimersByTime(17); });
      const state = structuredClone(game.result.current.gameState);
      expect(state.players[0].mana).toBe(0);
      expect(state.projectiles.find(projectile => projectile.type === 'blizzard-stone')).toMatchObject({
        ownerId: 1, velocityX: facingRight ? 600 : -600,
      });
      game.unmount(); vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers();
      return state;
    }
    const original = run(loadFrozenAI().api.useGameEngine);
    expect(run(useGameEngine)).toEqual(original);
  });

  it('preserves scripted character and map-event ticks with the original engine', () => {
    const frozen = loadFrozenAI().api;
    const characters = Object.keys(CHARACTERS) as CharacterType[];
    for (const [index, character] of characters.entries()) for (const map of Object.keys(MAPS) as MapId[]) {
      function run(hook: typeof useGameEngine) {
        vi.useFakeTimers(); vi.setSystemTime(10000);
        let seed = 731;
        vi.spyOn(Math, 'random').mockImplementation(() => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296));
        const game = renderHook(() => hook(CHARACTERS[character], CHARACTERS[characters[(index + 3) % characters.length]], 3, vi.fn(), 'multi', false, 1, map));
        const keys = { current: emptyAIKeys() };
        act(() => game.result.current.setKeysRef(keys));
        const state = game.result.current.gameState;
        Object.assign(state, { nextSandstormTime: 10050, nextLightningTime: 10050, nextSoulZoneTime: 10050, nextVineTime: 10050 });
        Object.assign(state.players[0], { x: 250, health: CHARACTERS[character].maxHealth * 0.5 });
        state.players[1].x = 400;
        const states = [];
        for (let tick = 0; tick < 120; tick++) {
          Object.assign(keys.current, { d: tick < 30, a: tick >= 30 && tick < 60, w: tick % 40 < 2,
            f: true, g: tick < 45, h: tick >= 45, arrowLeft: tick < 30, arrowRight: tick >= 30 && tick < 60,
            arrowUp: tick % 40 < 2, shift: true, enter: tick < 45, backslash: tick >= 45 });
          act(() => { vi.advanceTimersByTime(17); });
          states.push(JSON.parse(JSON.stringify(game.result.current.gameState)));
        }
        game.unmount(); vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers();
        return states;
      }
      expect(run(useGameEngine), character + '/' + map).toEqual(run(frozen.useGameEngine));
    }
  }, 30000);

  it('replays dual controllers and feeds them the same tick-start state', () => {
    function run() {
      vi.useFakeTimers(); vi.setSystemTime(10000);
      const a = evaluationController(CURRENT_AI, createAISettings('medium'), 731, 1);
      const b = evaluationController(loadFrozenAI().api, createAISettings('medium'), 1907, 2);
      const worlds: AIWorld[] = [];
      const runtime: EngineRuntimeOptions = { random: deterministicEngineRandom(7), controllers: {
        1: { ...a, step: (world, previous) => { worlds.push(world); return a.step(world, previous); } },
        2: { ...b, step: (world, previous) => { expect(world).toBe(worlds[worlds.length - 1]); return b.step(world, previous); } },
      } };
      const game = renderHook(() => useGameEngine(CHARACTERS.ninja, CHARACTERS.scientist, 2, vi.fn(), 'multi', false, 1, 'jungle', undefined, true, undefined, runtime));
      act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
      const states = [];
      for (let tick = 0; tick < 30; tick++) {
        act(() => { vi.advanceTimersByTime(17); });
        states.push(JSON.parse(JSON.stringify(game.result.current.gameState)));
      }
      const sessions = game.result.current.gameState.evaluationState;
      game.unmount(); vi.clearAllTimers(); vi.useRealTimers();
      return { states, sessions };
    }
    expect(run()).toEqual(run());
  });

  it('separates environment/combat draws from IDs and cosmetic draws and replays local counters', () => {
    const source = deterministicEngineRandom(731);
    const a = createTickRandom(source, 'engine', 10000), b = createTickRandom(source, 'engine', 10000);
    for (let i = 0; i < 20; i++) { a('id'); a('cosmetic'); }
    expect(a('environment')).toBe(b('environment'));
    expect(a('combat')).toBe(b('combat'));
    const make = () => createEngineEntities({ now: 10000, random: () => createTickRandom(source, 'test', 10000)('id') });
    expect(make().createProjectile('arrow', 1, 0, 0, 1000, 0, 10)).toEqual(make().createProjectile('arrow', 1, 0, 0, 1000, 0, 10));
  });

  it('normalizes all player ownership fields twice without changing spatial facts', () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const hook = renderHook(() => useGameEngine(CHARACTERS.ninja, CHARACTERS.reaper, 60, vi.fn()));
    const world: AIWorld = { ...hook.result.current.gameState, now: 10000, deltaTime: 16, mapId: 'default', platforms: MAPS.default.platforms };
    world.players[0].markOwnerId = 2; world.players[1].burnOwner = 1;
    world.projectiles = [{ ...createProjectile('bat', 1, 200, 300, -550, 0, 10), lastHitTime: { 2: 9900 }, hitCoilIds: ['coil'] }];
    const normalized = worldForSide(world, 1);
    expect(normalized.players[1].x).toBe(world.players[0].x);
    expect(normalized.projectiles[0]).toMatchObject({ ownerId: 2, velocityX: -550, lastHitTime: { 1: 9900 }, hitCoilIds: ['coil'] });
    expect(worldForSide(normalized, 1)).toEqual(world);
    hook.unmount();
  });
});
