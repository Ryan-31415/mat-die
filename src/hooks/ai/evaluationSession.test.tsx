import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { createAISettings } from '@/types/ai';
import type { EngineRuntimeOptions } from '@/types/engineRuntime';
import { loadFrozenAI } from '@/test/aiBaseline';
import { CURRENT_AI, deterministicEngineRandom, evaluationCloneController, evaluationController } from '@/test/aiEvaluation';
import { captureEvaluationSession, evaluationSessionSchema, type EvaluationSessionCheckpoint } from '@/test/aiEvaluationSession';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('resumes serialized learning with the same future engine states as an in-place round reset', () => {
  vi.useFakeTimers(); vi.setSystemTime(10000);
  const frozen = loadFrozenAI().api;
  const options = (previous?: EvaluationSessionCheckpoint): EngineRuntimeOptions => ({
    random: deterministicEngineRandom(731), controllers: {
      1: evaluationController(CURRENT_AI, createAISettings('medium'), 731, 1, previous?.controllers[0]),
      2: evaluationController(frozen, createAISettings('medium'), 731, 2, previous?.controllers[1]),
    }, cloneControllers: {
      1: evaluationCloneController(CURRENT_AI, 1, previous?.cloneModels[0]),
      2: evaluationCloneController(frozen, 2, previous?.cloneModels[1]),
    },
  });
  const useFixture = (runtime: EngineRuntimeOptions) => useGameEngine(CHARACTERS.ninja, CHARACTERS.scientist,
    60, () => {}, 'multi', false, 1, 'wasteland', undefined, true, undefined, runtime);
  const runtime = options(), game = renderHook(() => useFixture(runtime));
  act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
  for (const side of [1, 2] as const) game.result.current.gameState.clones.push({
    ...createInitialPlayer(side, CHARACTERS.ninja), x: side === 1 ? 260 : 500, y: 440,
    createdAt: 10000, isClone: true, aiControllerId: 'session-clone-' + side,
  });
  for (let tick = 0; tick < 64; tick++) act(() => { vi.advanceTimersByTime(17); });
  const captured = captureEvaluationSession(game.result.current.gameState.evaluationState!, Date.now());
  expect(captured.controllers[0].model.last).toBeDefined();
  const encoded = JSON.stringify(captured), decoded = evaluationSessionSchema.parse(JSON.parse(encoded));
  const malformed = JSON.parse(encoded);
  delete malformed.controllers[0].model.transitions;
  expect(() => evaluationSessionSchema.parse(malformed)).toThrow();
  act(() => game.result.current.resetRound());
  const expected = [];
  for (let tick = 0; tick < 24; tick++) {
    act(() => { vi.advanceTimersByTime(17); });
    expected.push(JSON.parse(JSON.stringify(game.result.current.gameState)));
  }
  game.unmount(); cleanup(); vi.clearAllTimers(); vi.setSystemTime(decoded.endTime);
  const resumedRuntime = options(decoded), resumed = renderHook(() => useFixture(resumedRuntime));
  act(() => resumed.result.current.setKeysRef({ current: emptyAIKeys() }));
  const actual = [];
  for (let tick = 0; tick < 24; tick++) {
    act(() => { vi.advanceTimersByTime(17); });
    actual.push(JSON.parse(JSON.stringify(resumed.result.current.gameState)));
  }
  expect(actual).toEqual(expected);
  resumed.unmount();
});
