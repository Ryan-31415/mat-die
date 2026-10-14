import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, PLAYER_SIZE } from '@/types/game';
import { createAttackHitbox } from '@/types/projectile';
import { emptyAIKeys } from './gameAI';
import { useGameEngine } from './useGameEngine';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10000); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

function setup(character: 'gladiator' | 'ninja' | 'reaper', ownerId: 1 | 2 = 1) {
  const keys = { current: emptyAIKeys() };
  const game = renderHook(() => useGameEngine(
    CHARACTERS[ownerId === 1 ? character : 'gladiator'],
    CHARACTERS[ownerId === 2 ? character : 'gladiator'], 60, vi.fn(), 'multi'
  ));
  act(() => game.result.current.setKeysRef(keys));
  const step = () => act(() => { vi.advanceTimersByTime(17); });
  return { ...game, keys, step };
}

describe('melee knockback direction', () => {
  for (const character of ['gladiator', 'ninja', 'reaper'] as const) {
    for (const ownerId of [1, 2] as const) {
      for (const facingRight of [false, true]) {
        it.each([20, 60, 0, -10])(`${character}, player ${ownerId}, facing ${facingRight ? 'right' : 'left'}, distance %s pushes in attack direction`, distance => {
          const { result, keys, step } = setup(character, ownerId);
          const direction = facingRight ? 1 : -1;
          const attacker = result.current.gameState.players[ownerId - 1];
          const targetIndex = ownerId === 1 ? 1 : 0;
          const target = result.current.gameState.players[targetIndex];
          Object.assign(attacker, { x: 400, facingRight });
          Object.assign(target, { x: 400 + direction * distance, y: attacker.y });
          const initialHealth = target.health;
          const initialX = target.x;
          keys.current[ownerId === 1 ? 'f' : 'shift'] = true;
          step();
          keys.current[ownerId === 1 ? 'f' : 'shift'] = false;
          expect(result.current.gameState.players[targetIndex].health).toBeLessThan(initialHealth);
          expect(result.current.gameState.players[targetIndex].knockbackVelocityX).toBe(direction * 500);
          step();
          expect((result.current.gameState.players[targetIndex].x - initialX) * direction).toBeGreaterThan(0);
        });
      }
    }
  }

  it.each([false, true])('keeps the original attack direction after turning, initially facing right: %s', facingRight => {
    const { result, keys, step } = setup('gladiator');
    const direction = facingRight ? 1 : -1;
    Object.assign(result.current.gameState.players[0], { x: 400, facingRight });
    Object.assign(result.current.gameState.players[1], { x: 400 - direction * 200 });
    keys.current.f = true;
    step();
    keys.current.f = false;
    expect(result.current.gameState.attackHitboxes).toHaveLength(1);
    result.current.gameState.players[0].facingRight = !facingRight;
    result.current.gameState.players[1].x = 400 + direction * 20;
    const health = result.current.gameState.players[1].health;
    step();
    expect(result.current.gameState.players[1].health).toBeLessThan(health);
    expect(result.current.gameState.players[1].knockbackVelocityX).toBe(direction * 500);
  });

  it.each([false, true])('uses attacker facing for legacy hitboxes, facing right: %s', facingRight => {
    const { result, step } = setup('gladiator');
    Object.assign(result.current.gameState.players[0], { x: 400, facingRight });
    const target = result.current.gameState.players[1];
    Object.assign(target, { x: 380, y: result.current.gameState.players[0].y });
    result.current.gameState.attackHitboxes.push(createAttackHitbox(
      1, 300, target.y, 140, PLAYER_SIZE, 10, 200, false,
      400 + PLAYER_SIZE / 2
    ));
    step();
    expect(result.current.gameState.players[1].health).toBe(target.health - 10);
    expect(result.current.gameState.players[1].knockbackVelocityX).toBe((facingRight ? 1 : -1) * 500);
  });
});
