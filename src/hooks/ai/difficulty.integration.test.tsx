import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer, type CharacterType } from '@/types/game';
import { AI_PRESET_IDS, createAISettings, type AIPreset, type AISettings } from '@/types/ai';
import { useGameEngine } from '../useGameEngine';
import { useGameState } from '../useGameState';
import { emptyAIKeys } from './controller';
import { createDifficultySession } from './difficulty';
import { createAILearningSession } from './state';
import { seededRandom } from './random';

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
  vi.spyOn(console, 'log').mockImplementation(() => {}); localStorage.clear();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });
function setup(preset: AIPreset = 'medium', character: CharacterType = 'mage', strict = false, seed = 731, override?: (settings: AISettings) => void) {
  const engineRandom = seededRandom(seed);
  vi.spyOn(Math, 'random').mockImplementation(engineRandom.next);
  const settings = createAISettings(preset); override?.(settings);
  const learning = { current: { ...createAILearningSession(), difficulty: createDifficultySession(seed) } };
  const keys = { current: emptyAIKeys() };
  const hook = renderHook(() => useGameEngine(CHARACTERS.gladiator, CHARACTERS[character], 60, vi.fn(), 'single', false, 1, 'wasteland', learning, true, settings), strict ? { wrapper: StrictMode } : {});
  act(() => hook.result.current.setKeysRef(keys));
  Object.assign(hook.result.current.gameState, { nextSandstormTime: Infinity, nextLightningTime: Infinity, nextSoulZoneTime: Infinity, nextVineTime: Infinity });
  const step = (count = 1) => { for (let i = 0; i < count; i++) act(() => { vi.advanceTimersByTime(17); }); };
  return { ...hook, step, learning, keys, settings };
}

describe('difficulty lifecycle and flow', () => {
  it('inserts single-player settings between characters and maps, preserves traits at rematch and redraws at new game', () => {
    const state = renderHook(() => useGameState());
    expect(state.result.current.settings.ai.difficulty).toBe('medium');
    act(() => state.result.current.startGame('single'));
    const session = state.result.current.aiSessionRef.current.difficulty;
    act(() => state.result.current.confirmCharacterSelection(CHARACTERS.gladiator, CHARACTERS.mage));
    expect(state.result.current.screen).toBe('ai-settings');
    act(() => state.result.current.confirmAISettings()); expect(state.result.current.screen).toBe('map-select');
    act(() => state.result.current.goBackFromMapSelect()); expect(state.result.current.screen).toBe('ai-settings');
    act(() => state.result.current.goBackToCharacterSelect()); expect(state.result.current.player2Character).toBe(CHARACTERS.mage);
    act(() => state.result.current.rematch()); expect(state.result.current.aiSessionRef.current.difficulty).toBe(session);
    act(() => state.result.current.startGame('single')); expect(state.result.current.aiSessionRef.current.difficulty).not.toBe(session);
    act(() => state.result.current.startGame('multi'));
    act(() => state.result.current.confirmCharacterSelection(CHARACTERS.gladiator, CHARACTERS.mage));
    expect(state.result.current.screen).toBe('map-select');
    act(() => state.result.current.goBackFromMapSelect()); expect(state.result.current.screen).toBe('character-select');
    state.unmount();
  });
  it('freezes observation/reaction queues during pause, clears them per round and preserves personality and tendencies', () => {
    const game = setup(); game.step(5);
    const before = JSON.stringify(game.result.current.gameState.aiState.difficulty);
    act(() => game.result.current.togglePause()); game.step(60);
    expect(JSON.stringify(game.result.current.gameState.aiState.difficulty)).toBe(before);
    act(() => game.result.current.togglePause()); game.step(6);
    expect(game.result.current.gameState.aiState.difficulty.decisionsMade).toBe(0);
    game.step(10); expect(game.result.current.gameState.aiState.difficulty.decisionsMade).toBeGreaterThan(0);
    const traits = game.learning.current.difficulty.automaticTraits;
    const count = game.learning.current.difficulty.model.transitions.reduce((a, b) => a + b, 0);
    act(() => game.result.current.resetRound());
    expect(game.result.current.gameState.aiState.difficulty.observations).toEqual([]);
    expect(game.result.current.gameState.aiState.difficulty.keys).toEqual(emptyAIKeys());
    expect(game.result.current.gameState.aiState.difficulty.session.automaticTraits).toEqual(traits);
    expect(game.result.current.gameState.aiState.difficulty.session.model.transitions.reduce((a, b) => a + b, 0)).toBe(count);
    game.unmount();
  });
  it('does not duplicate samples or consume different random draws in StrictMode', () => {
    const ordinary = setup('hard', 'mage'); ordinary.step(20);
    const expected = ordinary.result.current.gameState.aiState.difficulty;
    const expectedPlayers = ordinary.result.current.gameState.players;
    ordinary.unmount();
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    const strict = setup('hard', 'mage', true); strict.step(20);
    const actual = strict.result.current.gameState.aiState.difficulty;
    expect(actual.session).toEqual(expected.session);
    expect(actual.keys).toEqual(expected.keys);
    expect(actual.observationsTaken).toBe(expected.observationsTaken);
    expect(actual.decisionsMade).toBe(expected.decisionsMade);
    expect(strict.result.current.gameState.players).toEqual(expectedPlayers);
    strict.unmount();
  });
  it('keeps clone controllers unrestricted and does not import their learning into P2', () => {
    const game = setup('easy');
    game.learning.current.opponents[1].attackCount = 100;
    game.learning.current.opponents[1].reactionCount = 100;
    game.result.current.gameState.clones.push({ ...createInitialPlayer(2, CHARACTERS.ninja), x: 600, isClone: true, createdAt: Date.now() });
    game.step(8);
    const state = game.result.current.gameState.aiState;
    expect(state.difficulty.decisionsMade).toBe(0);
    expect(Object.keys(state.controllers)).toHaveLength(1);
    expect(Object.keys(state.controllers)[0]).toMatch(/^clone:/);
    expect(state.difficulty.session.model.attackCount).toBe(0);
    expect(state.learning.opponents[1].attackCount).toBeGreaterThan(90);
    game.unmount();
  });
  it.each(Object.keys(CHARACTERS) as CharacterType[])('medium %s can navigate and attack through the real engine', character => {
    const game = setup('medium', character);
    const health = game.result.current.gameState.players[0].health;
    for (let tick = 0; tick < 900 && game.result.current.gameState.players[0].health === health; tick++) game.step();
    expect(game.result.current.gameState.players[0].health).toBeLessThan(health);
    game.unmount();
  });
  it('compares seeded preset responses against the same moving target', () => {
    const measurements: { preset: AIPreset; seed: number; firstDecision: number; observations: number; decisions: number; attempts: number; damage: number }[] = [];
    for (const seed of [731, 1907]) for (const preset of AI_PRESET_IDS) {
      vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
      const game = setup(preset, 'archer', false, seed);
      Object.assign(game.result.current.gameState.players[0], { health: 10000, maxHealth: 10000 });
      let firstDecision = 0;
      for (let tick = 0; tick < 360; tick++) {
        const direction = Math.floor(tick / 60) % 2;
        game.keys.current.a = direction === 1; game.keys.current.d = direction === 0;
        game.step();
        if (!firstDecision && game.result.current.gameState.aiState.difficulty.decisionsMade > 0) firstDecision = tick + 1;
      }
      const state = game.result.current.gameState;
      measurements.push({ preset, seed, firstDecision, observations: state.aiState.difficulty.observationsTaken, decisions: state.aiState.difficulty.decisionsMade, attempts: state.diagnostics.attempts[1], damage: state.diagnostics.directDamage[1] });
      game.unmount();
    }
    for (const seed of [731, 1907]) {
      const rows = measurements.filter(row => row.seed === seed);
      expect(rows.map(row => row.firstDecision)).toEqual([...rows.map(row => row.firstDecision)].sort((a, b) => b - a));
      expect(rows[0].observations).toBeLessThan(rows[1].observations);
      expect(rows[1].observations).toBeLessThan(rows[2].observations);
      expect(rows[2].observations).toBe(rows[3].observations);
      for (const row of rows) { expect(row.attempts).toBeGreaterThan(0); expect(row.damage).toBeGreaterThanOrEqual(0); }
    }
    console.info('Seeded difficulty comparison:', JSON.stringify(measurements));
  });
});
