import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '@/types/game';
import { createProjectile } from '@/types/projectile';
import { useGameEngine } from './useGameEngine';
import type { KeyboardState } from './useKeyboard';

describe('Reaper bat shield return', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  for (const ownerId of [1, 2] as const) {
    it.each(['outbound', 'returning'] as const)(`P${ownerId} returns a blocked %s bat without damage`, phase => {
      const { result } = renderHook(() => useGameEngine(
        CHARACTERS[ownerId === 1 ? 'reaper' : 'gladiator'],
        CHARACTERS[ownerId === 2 ? 'reaper' : 'gladiator'],
        60, vi.fn(), 'multi'
      ));
      const keys = { current: {
        w: false, a: false, s: false, d: false, space: false,
        f: false, g: ownerId === 2, h: false,
        arrowUp: false, arrowDown: false, arrowLeft: false, arrowRight: false,
        enter: ownerId === 1, shift: false, backslash: false,
      } satisfies KeyboardState };
      act(() => result.current.setKeysRef(keys));
      const owner = result.current.gameState.players[ownerId - 1];
      const defender = result.current.gameState.players[ownerId === 1 ? 1 : 0];
      Object.assign(owner, { x: ownerId === 1 ? 150 : 600, y: 400, health: 50 });
      Object.assign(defender, { x: 400, y: 400, facingRight: ownerId === 2 });
      const health = defender.health;
      const bat = createProjectile('bat', ownerId, defender.x + (ownerId === 1 ? 0 : 40),
        defender.y + 20, ownerId === 1 ? 550 : -550, 0, 10);
      bat.returnPhase = phase;
      result.current.gameState.projectiles.push(bat);

      act(() => { vi.advanceTimersByTime(17); });
      expect(result.current.gameState.players[defender.id - 1].health).toBe(health);
      expect(result.current.gameState.projectiles[0]).toMatchObject({
        id: bat.id, ownerId, returnPhase: 'returning', hasHitReturn: true, damageAccumulated: 0,
      });
      expect(result.current.gameState.projectiles[0].velocityX * (ownerId === 1 ? -1 : 1)).toBeGreaterThan(0);

      // Dropping the shield while still overlapping must not cause return damage.
      keys.current.g = false;
      keys.current.enter = false;
      act(() => { vi.advanceTimersByTime(1000); });
      expect(result.current.gameState.players[defender.id - 1].health).toBe(health);
      expect(result.current.gameState.players[ownerId - 1].health).toBe(50);
      expect(result.current.gameState.projectiles).toHaveLength(0);
    });
  }
});
