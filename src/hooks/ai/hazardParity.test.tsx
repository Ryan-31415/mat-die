import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '@/types/game';
import { createHazardZone } from '@/types/projectile';
import { loadFrozenAI } from '@/test/aiBaseline';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

const explosionScenes = (['destroyed', 'expired'] as const).flatMap(reason =>
  (['inside', 'touch', 'outside'] as const).map(edge => ({ kind: 'explosion' as const, reason, edge,
    targetX: (reason === 'destroyed' ? 460 : 420) + (edge === 'inside' ? -1 : edge === 'outside' ? 1 : 0),
    damage: edge === 'inside' ? 64 : 0 })));
const ringScenes = [
  { name: 'interior', x: 300, y: 440, damage: 0 },
  { name: 'inside inner radius', x: 360, y: 440, damage: 0 },
  { name: 'crosses inner radius', x: 362, y: 440, damage: 3 },
  { name: 'outer tangent', x: 410, y: 440, damage: 3 },
  { name: 'outside outer radius', x: 411, y: 440, damage: 0 },
  { name: 'outside circular corner', x: 401, y: 380, damage: 0 },
].map(scene => ({ kind: 'ring' as const, ...scene }));
const contactScenes = (['inside', 'touch', 'outside'] as const).map(edge => ({ kind: 'contact' as const, edge,
  targetX: edge === 'inside' ? 369 : edge === 'touch' ? 370 : 371,
  damage: edge === 'inside' ? CHARACTERS.reaper.attackDamage * 0.1 : 0 }));
const fallScenes = [
  { kind: 'fall' as const, name: 'lands on upper one-way platform', y: 100, grounded: false, expectedY: 190 },
  { kind: 'fall' as const, name: 'clamps at arena floor', y: 450, grounded: false, expectedY: 420 },
  { kind: 'fall' as const, name: 'already grounded stays fixed', y: 380, grounded: true, expectedY: 380 },
];

describe('unchanged hazard phases against the frozen engine', () => {
  it.each([...explosionScenes, ...ringScenes, ...contactScenes, ...fallScenes])('%j', scene => {
    function run(engine: typeof useGameEngine) {
      vi.useFakeTimers(); vi.setSystemTime(10000);
      let randomState = 731;
      vi.spyOn(Math, 'random').mockImplementation(() => ((randomState = Math.imul(randomState, 1664525) + 1013904223 >>> 0) / 4294967296));
      const character = scene.kind === 'ring' ? 'mage' : scene.kind === 'contact' ? 'reaper' : 'scientist';
      const game = renderHook(() => engine(CHARACTERS[character], CHARACTERS.gladiator, 3, () => {}, 'multi', false, 1, 'default'));
      const state = game.result.current.gameState;
      Object.assign(state.players[0], { x: scene.kind === 'ring' || scene.kind === 'contact' ? 300 : 100, y: 440, isGrounded: true });
      Object.assign(state.players[1], { x: scene.kind === 'ring' ? scene.x : scene.kind === 'fall' ? 700 : scene.targetX,
        y: scene.kind === 'ring' ? scene.y : 440, isGrounded: true });
      if (scene.kind === 'explosion') state.hazardZones.push({ ...createHazardZone('tesla-coil', 1, 300, 380, 2,
        scene.reason === 'expired' ? 100 : 5000), health: scene.reason === 'destroyed' ? 0 : 175,
        createdAt: scene.reason === 'expired' ? 9800 : 10000, isGrounded: true });
      if (scene.kind === 'ring') state.hazardZones.push({ ...createHazardZone('fire-ring', 1, 0, 0, 3, 5000), lastTick: 9900 });
      if (scene.kind === 'contact') Object.assign(state.players[0], {
        isFlying: true, isInvulnerable: true, invulnerableDuration: 500, rootDuration: 500,
      });
      if (scene.kind === 'fall') state.hazardZones.push({ ...createHazardZone('tesla-coil', 1, 350, scene.y, 2, 5000), isGrounded: scene.grounded });
      act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
      const snapshots = [];
      for (let tick = 0; tick < 24; tick++) {
        act(() => { vi.advanceTimersByTime(17); });
        snapshots.push(structuredClone(game.result.current.gameState));
      }
      if (scene.kind === 'fall') {
        const coil = snapshots.at(-1)!.hazardZones.find(zone => zone.type === 'tesla-coil');
        expect(coil).toMatchObject({ y: scene.expectedY, isGrounded: true });
        expect(coil!.velocityY).toBe(scene.grounded ? undefined : 0);
      } else {
        expect(snapshots[0].players[1].health).toBeCloseTo(CHARACTERS.gladiator.maxHealth - scene.damage);
        if (scene.kind === 'explosion') expect(snapshots[0].hazardZones.map(zone => zone.type)).toEqual(['electric-explosion']);
      }
      game.unmount(); vi.clearAllTimers(); vi.restoreAllMocks(); vi.useRealTimers();
      return snapshots;
    }
    const original = run(loadFrozenAI().api.useGameEngine);
    expect(run(useGameEngine)).toEqual(original);
  });
});
