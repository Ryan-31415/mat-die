import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { loadFrozenAI } from '@/test/aiBaseline';
import { CHARACTERS } from '@/types/game';
import { createHazardZone } from '@/types/projectile';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe.skipIf(!existsSync('docs/stage3-selective-revert/before.cjs'))('current-rule engine before/after selective retirement', () => {
  it.each([
    { name: 'square corner outside the circle', x: 100, y: 100, hit: false },
    { name: 'overlapping circular edge', x: 480, y: 280, hit: true },
    { name: 'outside circular edge', x: 501, y: 280, hit: false },
  ])('$name keeps the current circular damage rule', fixture => {
    function run(engine: typeof useGameEngine) {
      vi.useFakeTimers(); vi.setSystemTime(10000);
      vi.spyOn(Math, 'random').mockReturnValue(.3);
      const game = renderHook(() => engine(CHARACTERS.mage, CHARACTERS['ice-mage'], 60, () => {}, 'multi', false, 1, 'wasteland'));
      const state = game.result.current.gameState;
      Object.assign(state.players[0], { x: fixture.x, y: fixture.y, isGrounded: false, velocityX: 0, velocityY: 0 });
      Object.assign(state.players[1], { x: 650, y: 440 });
      state.hazardZones = [{ ...createHazardZone('blizzard', 2, 300, 300, 3, 5000),
        x: 100, y: 100, width: 400, height: 400, lastTick: 0 }];
      act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
      act(() => { vi.advanceTimersByTime(16); });
      const snapshot = structuredClone(game.result.current.gameState);
      game.unmount(); cleanup(); vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers();
      return snapshot;
    }
    const before = run(loadFrozenAI('docs/stage3-selective-revert/before.cjs').api.useGameEngine);
    const after = run(useGameEngine);
    expect(after).toEqual(before);
    expect(after.players[0].health < CHARACTERS.mage.maxHealth).toBe(fixture.hit);
  });
});
