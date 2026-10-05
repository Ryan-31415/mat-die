import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, type CharacterType } from '@/types/game';
import type { MapId } from '@/types/map';
import { createProjectile } from '@/types/projectile';
import { useGameEngine } from './useGameEngine';
import type { KeyboardState } from './useKeyboard';

describe('AI decisions executed by the game engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T00:00:00Z'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  function setup(character: CharacterType, map: MapId = 'wasteland') {
    const keys: KeyboardState = {
      a: false, d: false, w: false, s: false, space: false, f: false, g: false, h: false,
      arrowLeft: false, arrowRight: false, arrowUp: false, arrowDown: false, shift: false, enter: false, backslash: false,
    };
    const hook = renderHook(() => useGameEngine(CHARACTERS.gladiator, CHARACTERS[character], 60, vi.fn(), 'single', false, 1, map));
    act(() => hook.result.current.setKeysRef({ current: keys }));
    const step = () => act(() => { vi.advanceTimersByTime(17); });
    return { ...hook, step };
  }

  it.each(Object.keys(CHARACTERS) as CharacterType[])('%s reaches and damages a ground target', character => {
    const { result, step, unmount } = setup(character);
    const initialHealth = result.current.gameState.players[0].health;
    for (let i = 0; i < 480 && result.current.gameState.players[0].health === initialHealth; i++) step();
    expect(result.current.gameState.players[0].health, JSON.stringify({ players: result.current.gameState.players.map(p => ({ x: p.x, y: p.y })), ai: result.current.gameState.aiState.controllers })).toBeLessThan(initialHealth);
    expect(result.current.gameState.players[1].health).toBe(result.current.gameState.players[1].maxHealth);
    unmount();
  });

  it('charges and fires a fully powered scientist orb without overcharging', () => {
    const { result, step, unmount } = setup('scientist');
    Object.assign(result.current.gameState.players[0], { x: 200, y: 440 });
    Object.assign(result.current.gameState.players[1], { x: 500, y: 440, mana: 60 });
    let fullOrb = false;
    for (let i = 0; i < 240; i++) {
      step();
      fullOrb ||= result.current.gameState.projectiles.some(p => p.type === 'electric-orb' && p.chargeLevel === 1);
    }
    expect(fullOrb).toBe(true);
    expect(result.current.gameState.players[1].health).toBe(CHARACTERS.scientist.maxHealth);
    expect(result.current.gameState.players[1].skillCooldownRemaining).toBeGreaterThan(0);
    unmount();
  });

  it('climbs intermediate platforms to hit an elevated target', () => {
    const { result, step, unmount } = setup('gladiator', 'default');
    Object.assign(result.current.gameState.players[0], { x: 360, y: 210 });
    Object.assign(result.current.gameState.players[1], { x: 650, y: 440 });
    const initialHealth = result.current.gameState.players[0].health;
    for (let i = 0; i < 600 && result.current.gameState.players[0].health === initialHealth; i++) step();
    expect(result.current.gameState.players[0].health).toBeLessThan(initialHealth);
    unmount();
  });

  it('crosses volcano platforms to fight without entering lava', () => {
    const { result, step, unmount } = setup('gladiator', 'volcano');
    const initialHealth = result.current.gameState.players[0].health;
    for (let i = 0; i < 600 && result.current.gameState.players[0].health === initialHealth; i++) step();
    expect(result.current.gameState.players[0].health).toBeLessThan(initialHealth);
    expect(result.current.gameState.players[1].health).toBe(CHARACTERS.gladiator.maxHealth);
    unmount();
  });

  it('avoids damage from a falling fireball while its attack is ready', () => {
    const { result, step, unmount } = setup('mage');
    Object.assign(result.current.gameState.players[0], { x: 200, y: 440 });
    Object.assign(result.current.gameState.players[1], { x: 510, y: 440, mana: 0 });
    result.current.gameState.projectiles.push(createProjectile('large-fireball', 1, 530, 320, 0, 750, 35));
    for (let i = 0; i < 30; i++) step();
    expect(result.current.gameState.players[1].health).toBe(CHARACTERS.mage.maxHealth);
    unmount();
  });

  it('leaves the lightning column before the strike lands', () => {
    const { result, step, unmount } = setup('mage', 'graveyard');
    Object.assign(result.current.gameState.players[0], { x: 200, y: 440 });
    Object.assign(result.current.gameState.players[1], { x: 510, y: 440, mana: 0 });
    result.current.gameState.lightningStrikes.push({ id: 'test', x: 490, targetPlayerId: 2, warningStart: Date.now() - 1200, struck: false });
    for (let i = 0; i < 30; i++) step();
    expect(result.current.gameState.players[1].health).toBe(CHARACTERS.mage.maxHealth);
    expect(result.current.gameState.players[1].isStunned).toBe(false);
    unmount();
  });
});
