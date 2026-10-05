import { StrictMode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer, type CharacterType } from '@/types/game';
import { MAPS, type MapId } from '@/types/map';
import { createHazardZone, createProjectile } from '@/types/projectile';
import { useGameEngine } from '../useGameEngine';
import { useGameState } from '../useGameState';
import { emptyAIKeys } from './controller';
import { createAILearningSession } from './state';

function setup(character: CharacterType, map: MapId = 'wasteland', mode: 'single' | 'multi' = 'single', enemy: CharacterType = 'gladiator', strict = false, learning = { current: createAILearningSession() }) {
  const keys = { current: emptyAIKeys() };
  const hook = renderHook(() => useGameEngine(CHARACTERS[enemy], CHARACTERS[character], 60, vi.fn(), mode, false, 1, map, learning), strict ? { wrapper: StrictMode } : {});
  act(() => hook.result.current.setKeysRef(keys));
  Object.assign(hook.result.current.gameState, { nextSandstormTime: Infinity, nextLightningTime: Infinity, nextSoulZoneTime: Infinity, nextVineTime: Infinity });
  const step = (count = 1) => { for (let i = 0; i < count; i++) act(() => { vi.advanceTimersByTime(17); }); };
  return { ...hook, keys, step, learning };
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T00:00:00Z'));
  let seed = 731;
  vi.spyOn(Math, 'random').mockImplementation(() => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; });
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('AI learning lifecycle executed by React and the engine', () => {
  it('retains tendencies through round reset, rematch and overtime, and clears them at the menu/new game', () => {
    const state = renderHook(() => useGameState());
    act(() => state.result.current.startGame('single'));
    const learning = state.result.current.aiSessionRef;
    const game = setup('mage', 'wasteland', 'single', 'gladiator', false, learning);
    game.keys.current.d = true; game.step(25);
    const transitions = learning.current.opponents[1].transitions.reduce((a, b) => a + b, 0);
    expect(transitions).toBeGreaterThan(2);
    act(() => game.result.current.resetRound());
    expect(game.result.current.gameState.aiState.controllers).toEqual({});
    expect(learning.current.opponents[1].samples).toHaveLength(0);
    expect(learning.current.opponents[1].transitions.reduce((a, b) => a + b, 0)).toBe(transitions);
    game.unmount();
    act(() => state.result.current.rematch());
    const rematch = renderHook(() => useGameEngine(CHARACTERS.gladiator, CHARACTERS.mage, 60, vi.fn(), 'single', true, 4, 'wasteland', learning));
    expect(rematch.result.current.gameState.aiState.learning.opponents[1].transitions.reduce((a, b) => a + b, 0)).toBe(transitions);
    rematch.unmount();
    act(() => state.result.current.returnToMenu());
    expect(learning.current).toEqual(createAILearningSession());
    learning.current.opponents[1].turnCount = 5;
    act(() => state.result.current.startGame('single'));
    expect(learning.current.opponents[1].turnCount).toBe(0);
    state.unmount();
  });
  it('freezes learning during pause and avoids counting twice in StrictMode', () => {
    const game = setup('mage', 'wasteland', 'single', 'gladiator', true);
    game.keys.current.d = true; game.step(15);
    const count = game.learning.current.opponents[1].transitions.reduce((a, b) => a + b, 0);
    expect(count).toBeGreaterThan(1); expect(count).toBeLessThan(7);
    act(() => game.result.current.togglePause());
    const paused = JSON.stringify(game.learning.current); game.step(40);
    expect(JSON.stringify(game.learning.current)).toBe(paused);
    act(() => game.result.current.togglePause()); game.step(5);
    expect(game.learning.current.opponents[1].last).toBeDefined();
    game.unmount();
  });
  it('shares one observation across the opponent and clone controllers, and cleans expired clone memory', () => {
    const game = setup('mage');
    game.result.current.gameState.clones.push({ ...createInitialPlayer(2, CHARACTERS.ninja), x: 600, isClone: true, createdAt: Date.now() });
    game.keys.current.d = true; game.step(12);
    expect(Object.keys(game.result.current.gameState.aiState.controllers)).toHaveLength(2);
    expect(game.learning.current.opponents[1].transitions.reduce((a, b) => a + b, 0)).toBeLessThan(6);
    game.result.current.gameState.clones[0].health = 0; game.step();
    expect(Object.keys(game.result.current.gameState.aiState.controllers)).toEqual(['player2']);
    game.unmount();
  });
  it('keeps separate memories for clones created on the same tick after another clone expires', () => {
    const game = setup('mage');
    game.result.current.gameState.clones.push(...[600, 300].map(x => ({ ...createInitialPlayer(2, CHARACTERS.ninja), x, isClone: true, createdAt: Date.now() })));
    game.step(8);
    const survivingId = game.result.current.gameState.clones[1].aiControllerId!;
    expect(Object.keys(game.result.current.gameState.aiState.controllers)).toHaveLength(3);
    game.result.current.gameState.clones[0].health = 0; game.step(2);
    expect(game.result.current.gameState.clones[0].aiControllerId).toBe(survivingId);
    expect(game.result.current.gameState.aiState.controllers[survivingId]).toBeDefined();
    expect(Object.keys(game.result.current.gameState.aiState.controllers)).toHaveLength(2);
    game.unmount();
  });
});

describe('AI environment decisions executed over multiple ticks', () => {
  it.each(['stun', 'freeze', 'root'] as const)('resumes corner escape after %s expires in the engine', effect => {
    const game = setup('gladiator', 'default');
    Object.assign(game.result.current.gameState.players[1], { x: 740, y: 440, mana: 0,
      isStunned: effect === 'stun', stunDuration: effect === 'stun' ? 1000 : 0,
      isFrozen: effect === 'freeze', frozenDuration: effect === 'freeze' ? 1000 : 0,
      rootDuration: effect === 'root' ? 1000 : 0 });
    Object.assign(game.result.current.gameState.players[0], { x: 360, y: 210 });
    game.step(45);
    expect(game.result.current.gameState.players[1].x).toBe(740);
    game.step(150);
    const ai = game.result.current.gameState.players[1];
    expect(ai.isStunned || ai.isFrozen || ai.rootDuration > 0).toBe(false);
    expect(740 - ai.x).toBeGreaterThan(100);
    game.unmount();
  });
  it('actually hits beyond configured range while staying outside a hazard barrier', () => {
    const game = setup('mage');
    Object.assign(game.result.current.gameState.players[1], { x: 740, mana: 0 });
    Object.assign(game.result.current.gameState.players[0], { x: 40 });
    game.result.current.gameState.hazardZones.push({ ...createHazardZone('toxic-pool', 1, 350, 0, 10, 5000), width: 300, height: 500 });
    game.step(100);
    expect(game.result.current.gameState.players[0].health).toBeLessThan(CHARACTERS.gladiator.maxHealth);
    expect(game.result.current.gameState.players[1].x).toBeGreaterThan(650);
    expect(game.result.current.gameState.players[1].health).toBe(CHARACTERS.mage.maxHealth);
    game.unmount();
  });
  it.each([20, 740])('leaves the corner at x=%s within three seconds instead of jumping in place', x => {
    const game = setup('gladiator', 'default');
    Object.assign(game.result.current.gameState.players[1], { x, y: 440, mana: 0 });
    Object.assign(game.result.current.gameState.players[0], { x: 360, y: 210 });
    game.step(175);
    expect(Math.abs(game.result.current.gameState.players[1].x - x)).toBeGreaterThan(100);
    game.unmount();
  });
  it.each(['left', 'right'] as const)('escapes a wall with an active %s sandstorm and recovers after it ends', direction => {
    const game = setup('mage'); const x = direction === 'right' ? 740 : 20;
    Object.assign(game.result.current.gameState.players[1], { x, mana: 0 });
    Object.assign(game.result.current.gameState.players[0], { x: 380 });
    Object.assign(game.result.current.gameState, { sandstormActive: true, sandstormDirection: direction, sandstormTimer: 1800 });
    game.step(150);
    expect(Math.abs(game.result.current.gameState.players[1].x - x), JSON.stringify({ players: game.result.current.gameState.players.map(p => ({ x: p.x, y: p.y, health: p.health })), memory: game.result.current.gameState.aiState.controllers.player2 })).toBeGreaterThan(50);
    expect(game.result.current.gameState.sandstormActive).toBe(false);
    expect(Number.isFinite(game.result.current.gameState.players[1].x)).toBe(true);
    game.unmount();
  });
  it('actually receives soul healing and mana while keeping clear of imminent lightning', () => {
    const game = setup('mage', 'graveyard');
    Object.assign(game.result.current.gameState.players[1], { x: 440, health: 20, mana: 0 });
    Object.assign(game.result.current.gameState.players[0], { x: 100 });
    game.result.current.gameState.soulZones.push({ id: 'heal', x: 550, y: 350, width: 200, height: 200, createdAt: Date.now(), duration: 6000 });
    game.result.current.gameState.lightningStrikes.push({ id: 'strike', x: 450, warningStart: Date.now() - 1000, struck: false, targetPlayerId: 2 });
    game.step(150);
    expect(game.result.current.gameState.players[1].health).toBeGreaterThan(20);
    expect(game.result.current.gameState.players[1].mana).toBeGreaterThan(0);
    expect(game.result.current.gameState.players[1].isStunned).toBe(false);
    game.unmount();
  });
  it('recovers from lava onto a platform instead of repeatedly bouncing at the wall', () => {
    const game = setup('gladiator', 'volcano');
    Object.assign(game.result.current.gameState.players[1], { x: 730, y: 440, mana: 0,
      isGrounded: false, isJumping: true, lastGroundedTime: Date.now() - 1000, velocityY: 80 });
    game.step();
    expect(game.result.current.gameState.lastLavaDamage[1]).toBeGreaterThan(0);
    expect(Date.now() - game.result.current.gameState.lastLavaDamage[1]).toBeLessThan(17);
    expect(game.result.current.gameState.players[1].velocityY).toBe(-900);
    game.step(179);
    const ai = game.result.current.gameState.players[1];
    expect(ai.y).toBeLessThanOrEqual(320);
    expect(ai.health).toBeGreaterThan(ai.maxHealth * 0.65);
    game.unmount();
  });
  it('enters cyber space and fires a boosted swap missile from inside it', () => {
    const game = setup('hacker');
    Object.assign(game.result.current.gameState.players[0], { x: 100 });
    Object.assign(game.result.current.gameState.players[1], { x: 600, mana: 0 });
    game.result.current.gameState.hazardZones.push(createHazardZone('packet-block-zone', 2, 340, 320, 0, 5000));
    let boosted = false;
    for (let i = 0; i < 160; i++) { game.step(); boosted ||= game.result.current.gameState.projectiles.some(p => p.ownerId === 2 && p.isSwapMissile); }
    expect(boosted).toBe(true);
    game.unmount();
  });
});

describe('combat mechanics used by AI predictions', () => {
  it.each(['mage', 'ninja'] as CharacterType[])('%s flanks a held shield and damages the defender from behind', character => {
    const game = setup(character, 'wasteland');
    Object.assign(game.result.current.gameState.players[0], { x: 360, facingRight: true });
    Object.assign(game.result.current.gameState.players[1], { x: 520, mana: 0 });
    game.keys.current.g = true;
    let behind = false, hitBehind = false;
    for (let i = 0; i < 230; i++) {
      const before = game.result.current.gameState.players[0].health;
      game.step();
      const [defender, ai] = game.result.current.gameState.players;
      behind ||= ai.x < defender.x - 40;
      hitBehind ||= behind && defender.health < before && defender.isShielding;
    }
    expect(behind).toBe(true);
    expect(hitBehind, JSON.stringify(game.result.current.gameState.aiState.controllers.player2)).toBe(true);
    game.unmount();
  });
  it.each([true, false])('blocks frontal shots but admits rear shots when facingRight=%s', facingRight => {
    const game = setup('gladiator', 'wasteland', 'multi', 'mage');
    Object.assign(game.result.current.gameState.players[1], { x: 400, facingRight });
    game.keys.current.enter = true;
    const initial = CHARACTERS.gladiator.maxHealth;
    const front = facingRight ? 520 : 300, back = facingRight ? 300 : 520;
    game.result.current.gameState.projectiles.push(createProjectile('fireball', 1, front, 460, facingRight ? -6000 : 6000, 0, 20));
    game.step();
    expect(game.result.current.gameState.players[1].health).toBe(initial);
    game.result.current.gameState.projectiles.length = 0;
    game.result.current.gameState.projectiles.push(createProjectile('fireball', 1, back, 460, facingRight ? 6000 : -6000, 0, 20));
    game.step();
    expect(game.result.current.gameState.players[1].health).toBeLessThan(initial);
    game.unmount();
  });
  it('hits the body before a sword facing away from the projectile', () => {
    const game = setup('ninja', 'wasteland', 'multi');
    Object.assign(game.result.current.gameState.players[1], { x: 500, facingRight: true });
    game.keys.current.shift = true;
    game.result.current.gameState.projectiles.push(createProjectile('arrow', 1, 350, 460, 15000, 0, 25));
    game.step();
    expect(game.result.current.gameState.players[1].health).toBeLessThan(CHARACTERS.ninja.maxHealth);
    expect(game.result.current.gameState.projectiles.some(p => p.ownerId === 2)).toBe(false);
    game.unmount();
  });
  it('uses the first crossed vine, and lets the next shot through its destruction effect', () => {
    const game = setup('mage', 'jungle', 'multi');
    Object.assign(game.result.current.gameState.players[1], { x: 600, y: 120, isGrounded: false });
    const vine = (id: string, x: number) => ({ id, x, y: 0, width: 48, height: 340, hp: 1, createdAt: Date.now(), duration: 12000 });
    game.result.current.gameState.vineShields.push(vine('far', 500), vine('near', 350));
    game.result.current.gameState.projectiles.push(createProjectile('arrow', 1, 250, 140, 25000, 0, 10));
    game.step();
    expect(game.result.current.gameState.vineShields.find(v => v.id === 'near')?.hp).toBe(0);
    expect(game.result.current.gameState.vineShields.find(v => v.id === 'far')?.hp).toBe(1);
    game.result.current.gameState.vineShields.length = 0;
    game.result.current.gameState.vineShields.push(vine('single', 350));
    game.result.current.gameState.projectiles.push(...[1, 2].map(() => createProjectile('arrow', 1, 250, 140, 25000, 0, 10)));
    const health = game.result.current.gameState.players[1].health;
    game.step();
    expect(game.result.current.gameState.players[1].health).toBeLessThan(health);
    expect(game.result.current.gameState.vineShields[0].hp).toBe(0);
    game.unmount();
  });
  it('reflects a fast projectile that reaches the sword before the body', () => {
    const game = setup('ninja', 'wasteland', 'multi');
    Object.assign(game.result.current.gameState.players[1], { x: 500, facingRight: false });
    game.keys.current.shift = true;
    game.result.current.gameState.projectiles.push(createProjectile('arrow', 1, 350, 460, 15000, 0, 25));
    game.step();
    expect(game.result.current.gameState.players[1].health).toBe(CHARACTERS.ninja.maxHealth);
    expect(game.result.current.gameState.projectiles.some(p => p.ownerId === 2 && p.velocityX < 0)).toBe(true);
    game.unmount();
  });
  it('does not reflect an unreflectable projectile', () => {
    const game = setup('ninja', 'wasteland', 'multi');
    Object.assign(game.result.current.gameState.players[1], { x: 500, facingRight: false });
    game.keys.current.shift = true;
    game.result.current.gameState.projectiles.push(createProjectile('large-fireball', 1, 350, 460, 15000, 0, 25));
    game.step();
    expect(game.result.current.gameState.players[1].health).toBeLessThan(CHARACTERS.ninja.maxHealth);
    game.unmount();
  });
  it('damages on both bat phases and heals once on collection, including an early wall return', () => {
    const game = setup('reaper', 'wasteland', 'multi', 'mage');
    Object.assign(game.result.current.gameState.players[1], { x: 300, health: 50 });
    Object.assign(game.result.current.gameState.players[0], { x: 500, y: 440 });
    const bat = createProjectile('bat', 2, 400, 440, 550, 0, 20);
    game.result.current.gameState.projectiles.push(bat);
    game.step(80);
    expect(game.result.current.gameState.players[0].health).toBe(CHARACTERS.mage.maxHealth - 40);
    expect(game.result.current.gameState.players[1].health).toBeGreaterThanOrEqual(50 + 40 * 0.6);
    expect(game.result.current.gameState.projectiles.filter(p => p.type === 'bat')).toHaveLength(0);
    game.unmount();
  });
});

describe('all characters on all maps', () => {
  const cases = Object.keys(CHARACTERS).flatMap(character => Object.keys(MAPS).map(map => [character, map] as [CharacterType, MapId]));
  it.each(cases)('%s can fight on %s with deterministic map events', (character, map) => {
    const game = setup(character, map);
    // Keep actual map scheduling active in this matrix, with a fixed random stream.
    Object.assign(game.result.current.gameState, { nextSandstormTime: Date.now() + 2000, nextLightningTime: Date.now() + 2000, nextSoulZoneTime: Date.now() + 2000, nextVineTime: Date.now() + 2000 });
    const initialHealth = game.result.current.gameState.players[0].health;
    let combatHit = false;
    for (let i = 0; i < 600 && game.result.current.gameState.isRoundActive; i++) {
      game.step();
      combatHit ||= game.result.current.gameState.players[0].health < initialHealth - (map === 'graveyard' ? 20 : 3);
    }
    const state = game.result.current.gameState;
    expect(state.players.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(state.players[1].health).toBeGreaterThan(0);
    expect(combatHit, JSON.stringify({ character, map, players: state.players.map(p => ({ x: p.x, y: p.y, hp: p.health })), memory: state.aiState.controllers.player2 })).toBe(true);
    game.unmount();
  }, 20000);
});
