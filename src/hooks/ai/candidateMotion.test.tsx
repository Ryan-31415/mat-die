import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { MAPS } from '@/types/map';
import { createProjectile } from '@/types/projectile';
import { createAISettings } from '@/types/ai';
import { useGameEngine } from '../useGameEngine';
import { decideAI } from './controller';
import { prepareAIFrame, type AIWorld } from './world';
import { predictActionStart } from './actionStart';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
const world = (): AIWorld => ({ players: [
  { ...createInitialPlayer(1, CHARACTERS.scientist), x: 400, y: 440, facingRight: true, mana: 0 },
  { ...createInitialPlayer(2, CHARACTERS.archer), x: 680, y: 440, facingRight: false, mana: 0 }],
  platforms: MAPS.wasteland.platforms, projectiles: [], hazardZones: [], attackHitboxes: [], mapId: 'wasteland', now: 10000,
  deltaTime: 100, isOvertime: false, roundTimeRemaining: 60, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
  lightningStrikes: [], soulZones: [], vineShields: [] });

describe('movement candidates use the actual executed callback', () => {
  it.each([16, 33, 100])('keeps dt%i in the first projectile sample and the full perfect horizon', dt => {
    const w = world(); w.deltaTime = dt;
    w.projectiles = [createProjectile('flask', 2, 200, 200, 640, -105, 7, { now: w.now, random: () => 0.5 })];
    const frame = prepareAIFrame(w, { forecasts: createAISettings('perfect').parameters.forecasts, random: () => 0.5 });
    expect(frame.times[1]).toBe(dt / 1000);
    expect(frame.times[frame.steps]).toBe(2);
    expect(frame.paths[0].x[1]).toBeCloseTo(191 + 640 * dt / 1000);
    expect(frame.paths[0].y[1]).toBeCloseTo(191 - 105 * dt / 1000);
  });
  it.each([0, 1, 32])('retains the current 100ms callback when future forecasts are %ims', horizonMs => {
    const w = world(), forecasts = createAISettings('perfect').parameters.forecasts;
    for (const forecast of Object.values(forecasts)) forecast.horizonMs = horizonMs;
    const frame = prepareAIFrame(w, { forecasts, random: () => 0.5 });
    expect([...frame.times]).toEqual([0, 0.1]);
    expect(frame.steps).toBe(1);
  });
  it('does not drive past a nearby spacing goal into a pool by imagining an automatic mid-tick stop', () => {
    vi.useFakeTimers(); vi.setSystemTime(9900); vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const w = world(), forecasts = createAISettings('perfect').parameters.forecasts;
    for (const forecast of Object.values(forecasts)) forecast.horizonMs = 0;
    w.hazardZones = [{ id: 'edge-pool', type: 'fire-pool', ownerId: 2, x: 460, y: 400, width: 5, height: 80,
      createdAt: 10000, duration: 4000, damage: 3, tickRate: 100, lastTick: 0 }];
    const source = structuredClone(w);
    const decision = decideAI(prepareAIFrame(w, { forecasts, random: () => 0.5 }), w.players[0]);
    expect(decision.keys.d).toBe(false);
    const game = renderHook(() => useGameEngine(CHARACTERS.scientist, CHARACTERS.archer, 60, () => {}, 'multi', false, 1, 'wasteland'));
    Object.assign(game.result.current.gameState.players[0], w.players[0]);
    Object.assign(game.result.current.gameState.players[1], w.players[1]);
    act(() => game.result.current.setKeysRef({ current: decision.keys }));
    vi.setSystemTime(9984); act(() => { vi.advanceTimersByTime(16); });
    const actual = game.result.current.gameState.players[0];
    expect(actual.x).toBeLessThanOrEqual(400);
    const forward = predictActionStart(w, w.players[0], { left: false, right: true, jump: false, down: false }, false);
    expect(forward.x).toBeGreaterThan(412);
    expect(forward.x + 40).toBeGreaterThan(460);
    expect(w).toEqual(source);
  });
  it('accounts for unavoidable knockback entering a pool across the entire 100ms callback', () => {
    const w = world(), forecasts = createAISettings('perfect').parameters.forecasts;
    for (const forecast of Object.values(forecasts)) forecast.horizonMs = 0;
    Object.assign(w.players[0], { rootDuration: 5000, knockbackVelocityX: 1500 });
    w.hazardZones = [{ id: 'knockback-pool', type: 'fire-pool', ownerId: 2, x: 510, y: 400, width: 10, height: 80,
      createdAt: 10000, duration: 4000, damage: 3, tickRate: 100, lastTick: 0 }];
    const decision = decideAI(prepareAIFrame(w, { forecasts, random: () => 0.5 }), w.players[0]);
    expect(decision.risk).toBeGreaterThanOrEqual(120);
  });
});
