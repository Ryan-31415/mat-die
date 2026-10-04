import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, PLAYER_SIZE } from '@/types/game';
import { useGameEngine } from './useGameEngine';
import type { KeyboardState } from './useKeyboard';

const emptyKeys = (): KeyboardState => ({
  w: false, a: false, s: false, d: false, space: false,
  f: false, g: false, h: false,
  arrowUp: false, arrowDown: false, arrowLeft: false, arrowRight: false,
  enter: false, shift: false, backslash: false,
});

describe('scientist charging in hacker zones', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  function setup(scientistId: 1 | 2 = 1) {
    const keys = { current: emptyKeys() };
    const { result } = renderHook(() => useGameEngine(
      CHARACTERS[scientistId === 1 ? 'scientist' : 'hacker'],
      CHARACTERS[scientistId === 2 ? 'scientist' : 'hacker'],
      60,
      vi.fn(),
    ));
    act(() => result.current.setKeysRef(keys));
    const step = () => act(() => { vi.advanceTimersByTime(17); });
    const scientist = () => result.current.gameState.players[scientistId - 1];
    const chargeKey = scientistId === 1 ? 'g' : 'enter';
    const hackerKey = scientistId === 1 ? 'enter' : 'g';
    const enterKey = scientistId === 1 ? 'd' : 'arrowLeft';
    const exitKey = scientistId === 1 ? 'a' : 'arrowRight';

    keys.current[chargeKey] = true;
    keys.current[hackerKey] = true;
    step();
    keys.current[hackerKey] = false;
    expect(scientist().isChargingSkill).toBe(true);
    expect(result.current.gameState.hazardZones).toHaveLength(1);
    return { keys, result, step, scientist, chargeKey, enterKey, exitKey };
  }

  it.each([1, 2] as const)('cancels player %s charging and permits a fresh charge after leaving', scientistId => {
    const { keys, result, step, scientist, chargeKey, enterKey, exitKey } = setup(scientistId);
    const originalStart = scientist().skillChargeStartTime;
    keys.current[enterKey] = true;
    for (let i = 0; i < 150 && !scientist().isSilenced; i++) step();
    keys.current[enterKey] = false;

    expect(scientist().isSilenced).toBe(true);
    expect(scientist().isChargingSkill).toBe(false);
    expect(scientist().skillChargeStartTime).toBeUndefined();
    expect(scientist().skillCooldownRemaining).toBe(0);
    expect(scientist().mana).toBe(100);
    const health = scientist().health;

    // Holding the key while silenced must neither restart nor overcharge.
    for (let i = 0; i < 30; i++) step();
    expect(scientist().isChargingSkill).toBe(false);
    expect(scientist().health).toBe(health);
    keys.current[chargeKey] = false;
    step();
    expect(result.current.gameState.projectiles).toHaveLength(0);

    keys.current[exitKey] = true;
    for (let i = 0; i < 30; i++) step();
    keys.current[exitKey] = false;
    expect(scientist().isSilenced).toBe(false);
    keys.current[chargeKey] = true;
    step();
    const freshStart = scientist().skillChargeStartTime;
    expect(scientist().isChargingSkill).toBe(true);
    expect(freshStart).toBeGreaterThan(originalStart!);
    for (let i = 0; i < 30; i++) step();
    keys.current[chargeKey] = false;
    step();

    const orb = result.current.gameState.projectiles.find(p => p.type === 'electric-orb');
    expect(orb).toBeDefined();
    expect(orb!.chargeLevel).toBeCloseTo((Date.now() - freshStart!) / 1500);
    expect(scientist().mana).toBeCloseTo(55);
    expect(scientist().skillCooldownRemaining).toBe(CHARACTERS.scientist.skill.cooldown);
    expect(scientist().isChargingSkill).toBe(false);
    expect(scientist().skillChargeStartTime).toBeUndefined();
  });

  it('cancels instead of firing when movement enters the zone on key release', () => {
    const { keys, result, step, scientist, chargeKey, enterKey } = setup();
    const zone = result.current.gameState.hazardZones[0];
    keys.current[enterKey] = true;
    // Stop just outside the zone; the next movement tick crosses its boundary.
    while (zone.x - (scientist().x + PLAYER_SIZE) > 3) step();
    expect(scientist().isSilenced).toBe(false);
    keys.current[chargeKey] = false;
    step();
    expect(scientist().isSilenced).toBe(true);
    expect(scientist().isChargingSkill).toBe(false);
    expect(scientist().skillChargeStartTime).toBeUndefined();
    expect(result.current.gameState.projectiles).toHaveLength(0);
    expect(scientist().mana).toBe(100);
    expect(scientist().skillCooldownRemaining).toBe(0);
  });
});
