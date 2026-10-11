import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '@/types/game';
import { createHazardZone, createProjectile, type HazardZone } from '@/types/projectile';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';
import { advanceCoilForecast } from './coil';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
const scenes: { name: string; fields: Partial<HazardZone>; hits?: number }[] = [
  { name: 'fall from rest', fields: { y: 200 } },
  { name: 'fall with velocity', fields: { y: 200, velocityY: 300 } },
  { name: 'grounded', fields: { isGrounded: true } },
  { name: 'decay boundary', fields: { lastSelfDamage: 9750 } },
  { name: 'decay death survives one contact phase', fields: { health: 1, lastSelfDamage: 9750 } },
  { name: 'expired intercepts before removal', fields: { createdAt: -20001 } },
  { name: 'dead intercepts before removal', fields: { health: 0 } },
  { name: 'damage', fields: {}, hits: 1 },
  { name: 'same-phase overkill', fields: { health: 5 }, hits: 2 },
];
describe('coil forecast lifecycle against actual engine phase ordering', () => {
  for (const dt of [16, 33, 100]) it.each(scenes)(`dt${dt}/$name`, scene => {
    vi.useFakeTimers(); vi.setSystemTime(10000 - dt); vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const game = renderHook(() => useGameEngine(CHARACTERS.gladiator, CHARACTERS.gladiator,
      60, () => {}, 'multi', false, 1, 'wasteland'));
    const state = game.result.current.gameState;
    Object.assign(state.players[0], { x: 40, y: 440, mana: 0, rootDuration: 5000 });
    Object.assign(state.players[1], { x: 700, y: 440, mana: 0, rootDuration: 5000 });
    const coil = { ...createHazardZone('tesla-coil', 2, 300, 420, 0, 30000),
      id: 'coil', createdAt: 10000, ...scene.fields };
    state.hazardZones.push(coil);
    for (let hit = 0; hit < (scene.hits ?? 0); hit++) state.projectiles.push({
      ...createProjectile('fireball', 1, 320, coil.y + 20, 0, 0, 10), id: `shot${hit}`, createdAt: 10000 });
    let predicted = [structuredClone(coil)];
    act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
    const snapshot = (zone?: HazardZone) => zone && ({ health: zone.health, y: zone.y,
      velocityY: zone.velocityY, isGrounded: zone.isGrounded, lastSelfDamage: zone.lastSelfDamage });
    for (let step = 0; step < 3; step++) {
      predicted = advanceCoilForecast(predicted, state.platforms, 10000 + step * 16, step === 0 ? dt : 16,
        step === 0 ? new Map([['coil', (scene.hits ?? 0) * 10]]) : undefined);
      if (step === 0) vi.setSystemTime(9984);
      act(() => { vi.advanceTimersByTime(16); });
      const actual = game.result.current.gameState.hazardZones.find(zone => zone.id === 'coil');
      expect(snapshot(predicted[0])).toEqual(snapshot(actual));
      if (step === 0 && scene.hits) expect(game.result.current.gameState.projectiles).toEqual([]);
    }
  });
});
