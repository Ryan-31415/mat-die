import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { createHazardZone } from '@/types/projectile';
import { loadFrozenAI } from '@/test/aiBaseline';
import { emptyAIKeys } from './controller';
import { prepareAIFrame, type AIWorld } from './world';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('shared coil motion forecasts against actual original-engine ticks', () => {
  it.each([
    { name: 'fall from rest', y: 200, velocityY: 0, isGrounded: false },
    { name: 'fall with velocity', y: 200, velocityY: 300, isGrounded: false },
    { name: 'terminal fall lands on floor', y: 410, velocityY: 1000, isGrounded: false },
    { name: 'one-way landing', y: 235, velocityY: 500, isGrounded: false },
    { name: 'already grounded', y: 420, velocityY: undefined, isGrounded: true },
  ])('$name', scene => {
    vi.useFakeTimers(); vi.setSystemTime(10000); vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const engine = loadFrozenAI().api.useGameEngine;
    const game = renderHook(() => engine(CHARACTERS.gladiator, CHARACTERS.gladiator, 60, () => {}, 'multi', false, 1, 'wasteland'));
    const state = game.result.current.gameState;
    if (scene.name === 'one-way landing') state.platforms = [...state.platforms, { id: 'test-ledge', x: 290, y: 300, width: 100, height: 10, type: 'one-way' }];
    state.hazardZones.push({ ...createHazardZone('tesla-coil', 1, 300, scene.y, 2, 30000),
      velocityY: scene.velocityY, isGrounded: scene.isGrounded, id: 'coil' });
    const world: AIWorld = { players: state.players, hazardZones: state.hazardZones, projectiles: [], attackHitboxes: [],
      platforms: state.platforms, mapId: 'wasteland', now: 10000, deltaTime: 16, roundTimeRemaining: 60,
      isOvertime: false, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
      lightningStrikes: [], soulZones: [], vineShields: [] };
    const before = structuredClone(world);
    const parameters = createAISettings('perfect').parameters;
    for (const forecast of Object.values(parameters.forecasts)) forecast.horizonMs = 32;
    const frame = prepareAIFrame(world, { forecasts: parameters.forecasts, random: () => 0.5 });
    expect(world).toEqual(before);
    expect([...frame.times]).toEqual([0, 0.016, 0.032]);
    expect(frame.coilPaths.get('coil')[0]).toBe(scene.y);
    act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
    for (const step of [1, 2]) {
      act(() => { vi.advanceTimersByTime(16); });
      expect(frame.coilPaths.get('coil')[step]).toBe(game.result.current.gameState.hazardZones.find(zone => zone.id === 'coil').y);
    }
    if (scene.name === 'fall from rest') expect([...frame.coilPaths.get('coil')]).toEqual([200, 200.6656, 201.9968]);
    if (scene.name === 'one-way landing') expect(frame.coilPaths.get('coil')[1]).toBe(240);
    if (scene.name === 'terminal fall lands on floor') expect(frame.coilPaths.get('coil')[1]).toBe(420);
  });
});
