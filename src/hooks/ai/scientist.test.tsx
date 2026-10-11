import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { MAPS } from '@/types/map';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';
import { predictActionStart } from './actionStart';
import { prepareAIFrame, type AIWorld } from './world';
import { scientistFlask } from './scientist';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('prospective Scientist flask versus the actual engine', () => {
  for (const side of [1, 2] as const) for (const dt of [16, 33, 100]) for (const height of [360, 440]) {
    it.each([100, 250, 400])(`P${side}/dt${dt}/height${height}/distance %i`, distance => {
      vi.useFakeTimers(); vi.setSystemTime(10000 - dt); vi.spyOn(Math, 'random').mockReturnValue(0.3);
      const direction = side === 1 ? 1 : -1, other = side === 1 ? 2 : 1;
      const self = { ...createInitialPlayer(side, CHARACTERS.scientist), x: side === 1 ? 180 : 560, y: height,
        isGrounded: height === 440, facingRight: direction > 0, rootDuration: 5000, mana: 0 };
      const enemy = { ...createInitialPlayer(other, CHARACTERS.gladiator), x: self.x + direction * distance,
        y: 440, rootDuration: 5000, attackCooldownRemaining: 5000, mana: 0 };
      const world: AIWorld = { players: side === 1 ? [self, enemy] : [enemy, self], platforms: MAPS.wasteland.platforms,
        projectiles: [], hazardZones: [], attackHitboxes: [], mapId: 'wasteland', now: 10000, deltaTime: dt,
        roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
        lightningStrikes: [], soulZones: [], vineShields: [] };
      const before = structuredClone(world), keys = emptyAIKeys();
      if (side === 1) keys.f = true; else keys.shift = true;
      const launch = { ...self, ...predictActionStart(world, self, { left: false, right: false, jump: false, down: false }, false) };
      const outcome = scientistFlask(prepareAIFrame(world), launch, enemy, () => enemy);
      if (height === 440) expect(outcome).toBe('target');
      expect(world).toEqual(before);
      const game = renderHook(() => useGameEngine(world.players[0].character!, world.players[1].character!,
        60, () => {}, 'multi', false, 1, 'wasteland', undefined, true));
      Object.assign(game.result.current.gameState.players[0], structuredClone(world.players[0]));
      Object.assign(game.result.current.gameState.players[1], structuredClone(world.players[1]));
      act(() => game.result.current.setKeysRef({ current: keys }));
      vi.setSystemTime(10000 - 16);
      act(() => { vi.advanceTimersByTime(16); });
      act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
      for (let tick = 0; tick < 125; tick++) act(() => { vi.advanceTimersByTime(16); });
      const damage = game.result.current.gameState.diagnostics.effectiveDamage[side - 1];
      expect(damage > 0).toBe(outcome === 'target' || outcome === 'pool');
      game.unmount();
    });
  }
  it('values a real landing pool behind a narrow platform without inventing direct damage', () => {
    vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const self = { ...createInitialPlayer(1, CHARACTERS.scientist), x: 180, y: 440, facingRight: true, mana: 0 };
    const enemy = { ...createInitialPlayer(2, CHARACTERS.gladiator), x: 530, y: 440, rootDuration: 5000, mana: 0 };
    const world: AIWorld = { players: [self, enemy], platforms: [...MAPS.wasteland.platforms,
      { id: 'pool-obstacle', x: 400, y: 420, width: 40, height: 20, type: 'solid' }],
      projectiles: [], hazardZones: [], attackHitboxes: [], mapId: 'wasteland', now: 10000, deltaTime: 16,
      roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
      lightningStrikes: [], soulZones: [], vineShields: [] };
    expect(scientistFlask(prepareAIFrame(world), self, enemy, () => enemy)).toBe('pool');
    const game = renderHook(() => useGameEngine(CHARACTERS.scientist, CHARACTERS.gladiator,
      60, () => {}, 'multi', false, 1, 'wasteland', undefined, true));
    Object.assign(game.result.current.gameState.players[0], self);
    Object.assign(game.result.current.gameState.players[1], enemy);
    game.result.current.gameState.platforms = [...world.platforms];
    act(() => game.result.current.setKeysRef({ current: { ...emptyAIKeys(), f: true } }));
    act(() => { vi.advanceTimersByTime(16); });
    act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
    for (let tick = 0; tick < 125; tick++) act(() => { vi.advanceTimersByTime(16); });
    const state = game.result.current.gameState;
    expect(state.hazardZones.some(zone => zone.type === 'toxic-pool' && zone.x === 400 && zone.y === 345)).toBe(true);
    expect(state.diagnostics.effectiveDamage[0]).toBeGreaterThan(0);
    expect(state.diagnostics.damageByKind.direct[1]).toBe(0);
    expect(state.diagnostics.damageByKind.zone[1]).toBeGreaterThan(0);
  });
});
