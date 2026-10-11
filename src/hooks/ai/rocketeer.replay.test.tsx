import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { MAPS } from '@/types/map';
import { createProjectile } from '@/types/projectile';
import { deterministicEngineRandom } from '@/test/aiEvaluation';
import type { KeyboardState } from '../useKeyboard';
import { useGameEngine } from '../useGameEngine';
import { decideAI, emptyAIKeys } from './controller';
import { prepareAIFrame, type AIWorld } from './world';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('replays the guided-threat fixture against the real engine with a fixed chosen input', () => {
  const now = 10000;
  const ai = { ...createInitialPlayer(2, CHARACTERS.mage), x: 480, y: 440, mana: 0, lastGroundedTime: now };
  const enemy = { ...createInitialPlayer(1, CHARACTERS.rocketeer), x: 180, y: 440, mana: 60, lastGroundedTime: now };
  const shot = { ...createProjectile('homing-rocket', 1, 390, 440, 660, 0, 16), createdAt: now };
  const world: AIWorld = { players: [enemy, ai], projectiles: [shot], hazardZones: [], attackHitboxes: [],
    platforms: MAPS.wasteland.platforms, mapId: 'wasteland', now, deltaTime: 1000 / 60,
    isOvertime: false, roundTimeRemaining: 60, sandstormActive: false, sandstormDirection: 'right',
    sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
  const frame = prepareAIFrame(world);
  frame.paths[0].x.fill(0); frame.paths[0].y.fill(0); frame.paths[0].endStep = 0;
  const chosen = decideAI(frame, ai);
  const noThreat = decideAI(prepareAIFrame({ ...world, projectiles: [] }), ai);
  function replay(keys: KeyboardState) {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const runtime = { random: deterministicEngineRandom(731) };
    const game = renderHook(() => useGameEngine(CHARACTERS.rocketeer, CHARACTERS.mage, 60, () => {}, 'multi', false, 1,
      'wasteland', undefined, true, undefined, runtime));
    act(() => game.result.current.setKeysRef({ current: keys }));
    game.result.current.gameState.players = [{ ...enemy }, { ...ai }];
    game.result.current.gameState.projectiles.push({ ...shot, lastHitTime: {} });
    for (let tick = 0; tick < 48; tick++) act(() => { vi.advanceTimersByTime(17); });
    const damage = game.result.current.gameState.diagnostics!.receivedDamage[1];
    game.unmount(); cleanup(); vi.clearAllTimers(); vi.useRealTimers();
    return damage;
  }
  const idleDamage = replay(emptyAIKeys()), chosenDamage = replay(chosen.keys), noThreatDamage = replay(noThreat.keys);
  expect(idleDamage).toBeGreaterThan(0);
  expect(noThreatDamage).toBeGreaterThan(0);
  expect(chosenDamage).toBe(0);
  expect(chosen.keys).not.toEqual(noThreat.keys);
  expect(shot.flightTimeMs).toBe(0);
});
