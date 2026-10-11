import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer, type CharacterType } from '@/types/game';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';
import { meleeOpportunityAt } from './meleeOpportunity';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
const fighters = ['gladiator', 'ninja', 'reaper'] as const;
function pair(character: CharacterType, side: 1 | 2, front = true) {
  const self = { ...createInitialPlayer(side, CHARACTERS[character]), x: 400, y: 440, mana: 0, facingRight: side === 1 };
  const target = { ...createInitialPlayer(side === 1 ? 2 : 1, CHARACTERS.archer),
    x: 400 + (side === 1 ? 80 : -80) * (front ? 1 : -1), y: 440, mana: 0 };
  return { self, target };
}

describe('cooldown-spaced melee forecast opportunities', () => {
  for (const character of fighters) for (const side of [1, 2] as const) it.each([false, true])(
    `${character}/P${side}/front=%s matches independently forced engine contact`, front => {
      vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const { self, target } = pair(character, side, front);
      const next = meleeOpportunityAt(self, target, 16, 0);
      expect(next !== null).toBe(front);
      const players = side === 1 ? [self, target] as const : [target, self] as const;
      const game = renderHook(() => useGameEngine(players[0].character!, players[1].character!, 60, () => {}, 'multi', false, 1, 'wasteland'));
      game.result.current.gameState.players = [{ ...players[0] }, { ...players[1] }];
      act(() => game.result.current.setKeysRef({ current: { ...emptyAIKeys(), f: side === 1, shift: side === 2 } }));
      act(() => { vi.advanceTimersByTime(17); });
      expect(game.result.current.gameState.players[side === 1 ? 1 : 0].health < target.health).toBe(front);
    });

  for (const character of fighters) it.each([30, 60, 120])(`${character} does not reward every in-range sample at %iHz`, hz => {
    const { self, target } = pair(character, 1);
    let readyAt = 0, opportunities = 0;
    for (let step = 1; step <= hz * 2; step++) {
      const next = meleeOpportunityAt(self, target, step * 1000 / hz, readyAt);
      if (next !== null) { opportunities++; readyAt = next; }
    }
    expect(opportunities).toBe(Math.ceil(2000 / self.character!.attackCooldown));
  });

  it('preserves a ready opportunity while out of range and permits it at cooldown expiry', () => {
    const { self, target } = pair('gladiator', 1);
    expect(meleeOpportunityAt(self, target, 499, 500)).toBeNull();
    expect(meleeOpportunityAt(self, { ...target, x: 700 }, 500, 500)).toBeNull();
    expect(meleeOpportunityAt(self, target, 501, 500)).toBe(501 + CHARACTERS.gladiator.attackCooldown);
  });

  it('does not credit invulnerability, evasion, dodges or a frontal shield', () => {
    const { self, target } = pair('gladiator', 1);
    for (const patch of [{ isInvulnerable: true }, { isEvading: true }, { dodgesRemaining: 1 },
      { isShielding: true, facingRight: false }]) expect(meleeOpportunityAt(self, { ...target, ...patch }, 16, 0)).toBeNull();
  });

  it('does not count the Ninja teleport landing as the same callback basic attack origin', () => {
    vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { self, target } = pair('ninja', 1);
    self.mana = 60; target.x = 680;
    expect(meleeOpportunityAt(self, target, 16, 0)).toBeNull();
    expect(meleeOpportunityAt({ ...self, x: 680 }, target, 16, 0)).not.toBeNull();
    const game = renderHook(() => useGameEngine(CHARACTERS.ninja, CHARACTERS.archer, 60, () => {}, 'multi', false, 1, 'wasteland'));
    game.result.current.gameState.players = [{ ...self }, { ...target }];
    act(() => game.result.current.setKeysRef({ current: { ...emptyAIKeys(), f: true, g: true } }));
    act(() => { vi.advanceTimersByTime(17); });
    const state = game.result.current.gameState;
    expect(state.players[0].x).toBe(680);
    expect(state.players[0].attackCooldownRemaining).toBe(CHARACTERS.ninja.attackCooldown);
    expect(state.players[1].health).toBe(target.health);
  });
});
