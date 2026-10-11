import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { createHazardZone } from '@/types/projectile';
import { useGameEngine } from '../useGameEngine';
import { CURRENT_AI, deterministicEngineRandom, evaluationController } from '@/test/aiEvaluation';
import { decideAI, emptyAIKeys } from './controller';
import { prepareAIFrame, type AIWorld } from './world';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
const scenes: { name: string; coilHealth: number; survives: boolean; initialNet: boolean;
  distance?: number; duration?: number; basicCooldown?: number; root?: number; boost?: number; buffDuration?: number; mana?: number }[] = [
  { name: 'lethal beam removed in time', coilHealth: 1, survives: true, initialNet: true },
  { name: 'partial damage cannot rescue', coilHealth: 175, survives: false, initialNet: false },
  { name: 'destruction blast would kill us', coilHealth: 1, distance: 60, survives: false, initialNet: false },
  { name: 'natural expiry allows ordinary enemy cast', coilHealth: 1, duration: 80, survives: true, initialNet: true },
  { name: 'ready basic is retained', coilHealth: 1, basicCooldown: 0, survives: true, initialNet: false },
  { name: 'moving escape survives through subsequent decisions', coilHealth: 1, root: 0, survives: true, initialNet: false },
  { name: 'active buff permits removal', coilHealth: 4, boost: 1, survives: true, initialNet: true },
  { name: 'buff expires before actual launch', coilHealth: 4, boost: 1, buffDuration: 8, survives: false, initialNet: false },
  { name: 'unaffordable rescue stays illegal', coilHealth: 1, mana: 20, survives: false, initialNet: false },
];

describe('default-perfect rooted coil rescue in the actual adaptive engine', () => {
  for (const side of [1, 2] as const) it.each(scenes)(`P${side}/$name`, scene => {
    vi.useFakeTimers(); vi.setSystemTime(9984);
    const other = side === 1 ? 2 : 1, direction = side === 1 ? 1 : -1;
    const ai = evaluationController(CURRENT_AI, createAISettings('perfect'), 1476252826, side);
    let initialNet: boolean | undefined;
    let firstWorld: AIWorld | undefined;
    const controller = { ...ai, step: (world: Parameters<typeof ai.step>[0], previous: Parameters<typeof ai.step>[1]) => {
      firstWorld ??= structuredClone(world);
      const decision = ai.step(world, previous);
      initialNet ??= side === 1 ? decision.keys.g : decision.keys.enter;
      return decision;
    } };
    const runtime = { random: deterministicEngineRandom(1476252826), controllers: { [side]: controller } };
    const game = renderHook(() => useGameEngine(side === 1 ? CHARACTERS.hunter : CHARACTERS.gladiator,
      side === 2 ? CHARACTERS.hunter : CHARACTERS.gladiator, 60, () => {}, 'multi', false, 1, 'wasteland',
      undefined, true, undefined, runtime));
    const state = game.result.current.gameState, self = state.players[side - 1], enemy = state.players[other - 1];
    Object.assign(self, { x: side === 1 ? 180 : 560, y: 440, isGrounded: true, facingRight: direction > 0,
      health: 3, mana: scene.mana ?? 80, rootDuration: scene.root ?? 5000, attackCooldownRemaining: scene.basicCooldown ?? 5000,
      damageBoost: scene.boost ?? 0, buffDuration: scene.buffDuration ?? (scene.boost ? 5000 : 0) });
    Object.assign(enemy, { x: self.x + direction * 250, y: 440, isGrounded: true,
      mana: 0, rootDuration: 5000, attackCooldownRemaining: 5000 });
    state.hazardZones.push({ ...createHazardZone('tesla-coil', other,
      self.x + direction * (scene.distance ?? (side === 1 ? 125 : 180)), 420, 2, scene.duration ?? 30000),
      id: 'coil', health: scene.coilHealth, createdAt: 10000, lastAttack: 10000, isGrounded: true });
    act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
    for (let tick = 0; tick < 125; tick++) act(() => { vi.advanceTimersByTime(16); });
    const final = game.result.current.gameState;
    expect(initialNet).toBe(scene.initialNet);
    expect(final.players[side - 1].health > 0).toBe(scene.survives);
    if (scene.name === 'ready basic is retained') expect(final.diagnostics!.actions[side - 1].attack.uses).toBeGreaterThan(0);
    if (scene.initialNet) expect(final.diagnostics!.actions[side - 1].skill.uses).toBe(1);
    if (scene.name === 'lethal beam removed in time' || scene.name === 'moving escape survives through subsequent decisions') {
      if (!firstWorld) throw new Error('No initial engine observation');
      const frame = prepareAIFrame(firstWorld, { forecasts: createAISettings('perfect').parameters.forecasts, random: () => 0.5 });
      const explained = decideAI(frame, firstWorld.players[side - 1]).coilDecision;
      expect(explained).toMatchObject({ coilId: 'coil', reason: scene.root === 0 ? 'escape' : 'clear-to-survive',
        manaCost: scene.root === 0 ? 0 : CHARACTERS.hunter.skill.manaCost });
      if (!explained) throw new Error('Missing coil survival explanation');
      expect(explained.predictedDamageBefore).toBeGreaterThanOrEqual(3);
      expect(explained.predictedDamageAfter).toBeLessThan(3);
    }
  });
});
