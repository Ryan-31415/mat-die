import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer, PLAYER_SIZE } from '@/types/game';
import { createHazardZone, createProjectile } from '@/types/projectile';
import { MAPS } from '@/types/map';
import { HOMING_ROCKET_SPEED, ROCKET_SPEED } from '@/types/combatPhysics';
import { createAISettings } from '@/types/ai';
import { useGameEngine } from '@/hooks/useGameEngine';
import { emptyAIKeys } from '@/hooks/ai/controller';
import { rocketeerShot } from '@/hooks/ai/rocketeer';
import { prepareAIFrame, type AIWorld } from '@/hooks/ai/world';
import { chooseCombat } from './combat';
import { createOpponentModel } from './learning';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('prospective rocket coil outcome against real engine damage', () => {
  for (const side of [1, 2] as const) for (const homing of [false, true]) {
    it.each([false, true])(`P${side}/homing${homing}/own coil %s`, own => {
      vi.useFakeTimers(); vi.setSystemTime(9984); vi.spyOn(Math, 'random').mockReturnValue(0.3);
      const other = side === 1 ? 2 : 1, direction = side === 1 ? 1 : -1;
      const self = { ...createInitialPlayer(side, CHARACTERS.rocketeer), x: side === 1 ? 180 : 560, y: 440,
        facingRight: direction > 0, rootDuration: 5000, mana: 0 };
      const enemy = { ...createInitialPlayer(other, CHARACTERS.gladiator), x: self.x + direction * 300, y: 440,
        rootDuration: 5000, mana: 0, attackCooldownRemaining: 5000 };
      const coil = { ...createHazardZone('tesla-coil', own ? side : other,
        self.x + direction * 150, 420, 0, 30000), id: 'coil', createdAt: 10000, isGrounded: true };
      const world: AIWorld = { players: side === 1 ? [self, enemy] : [enemy, self],
        projectiles: [], hazardZones: [coil], attackHitboxes: [], platforms: MAPS.wasteland.platforms,
        mapId: 'wasteland', now: 10000, deltaTime: 16, isOvertime: false, roundTimeRemaining: 60,
        sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
        lightningStrikes: [], soulZones: [], vineShields: [] };
      const before = structuredClone(world);
      const settings = createAISettings('perfect');
      const predicted = rocketeerShot(prepareAIFrame(world, { forecasts: settings.parameters.forecasts, random: () => 0.5 }),
        self, enemy, () => enemy, homing, direction);
      expect(predicted).toBe(own ? 'target' : 'coil');
      const funded = { ...self, mana: 60 };
      const fundedWorld: AIWorld = { ...world, players: side === 1 ? [funded, enemy] : [enemy, funded] };
      const combat = chooseCombat(prepareAIFrame(fundedWorld), funded, enemy, createOpponentModel(),
        { direction: 0, jump: false, drop: false }, true, false, 'pressure', () => enemy);
      expect(combat.attack).toBe(true);
      expect(combat.skill).toBe(own);
      expect(world).toEqual(before);
      const game = renderHook(() => useGameEngine(world.players[0].character!, world.players[1].character!,
        60, () => {}, 'multi', false, 1, 'wasteland'));
      const state = game.result.current.gameState;
      Object.assign(state.players[0], structuredClone(world.players[0]));
      Object.assign(state.players[1], structuredClone(world.players[1]));
      state.hazardZones = world.hazardZones.map(zone => structuredClone(zone));
      state.projectiles.push({ ...createProjectile(homing ? 'homing-rocket' : 'rocket', side,
        self.x + PLAYER_SIZE / 2, self.y + PLAYER_SIZE / 2,
        direction * (homing ? HOMING_ROCKET_SPEED : ROCKET_SPEED), 0, self.character!.attackDamage), createdAt: 10000 });
      act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
      for (let tick = 0; tick < 125; tick++) act(() => { vi.advanceTimersByTime(16); });
      const final = game.result.current.gameState;
      expect(final.players[other - 1].health < enemy.health).toBe(own);
      if (!own) expect(final.hazardZones.find(zone => zone.id === 'coil')!.health).toBeLessThan(175 - self.character!.attackDamage);
    });
  }
});

describe('rocket coil contact order and observed lifecycle', () => {
  for (const side of [1, 2] as const) for (const homing of [false, true]) {
    it.each(['expired before arrival', 'fall into path', 'endpoint tunneling', 'coil before body'] as const)(
      `P${side}/homing${homing}/%s`, scene => {
        const dt = scene === 'endpoint tunneling' || scene === 'coil before body' ? 100 : 16;
        vi.useFakeTimers(); vi.setSystemTime(10000 - dt); vi.spyOn(Math, 'random').mockReturnValue(0.3);
        const other = side === 1 ? 2 : 1, direction = side === 1 ? 1 : -1;
        const self = { ...createInitialPlayer(side, CHARACTERS.rocketeer), x: side === 1 ? 180 : 560, y: 440,
          facingRight: direction > 0, rootDuration: 5000, mana: 0 };
        const enemy = { ...createInitialPlayer(other, CHARACTERS.gladiator),
          x: self.x + direction * (scene === 'coil before body' ? 30 : 300), y: 440,
          rootDuration: 5000, mana: 0, attackCooldownRemaining: 5000 };
        const coil = { ...createHazardZone('tesla-coil', other,
          self.x + direction * (scene === 'endpoint tunneling' ? 5 : scene === 'coil before body' ? 55 : 150),
          scene === 'fall into path' ? 200 : 420, 0, 30000), id: 'coil', createdAt: 10000,
          isGrounded: scene !== 'fall into path', velocityY: scene === 'fall into path' ? 1000 : 0 };
        if (scene === 'expired before arrival') coil.createdAt = -20001;
        const world: AIWorld = { players: side === 1 ? [self, enemy] : [enemy, self],
          projectiles: [], hazardZones: [coil], attackHitboxes: [], platforms: MAPS.wasteland.platforms,
          mapId: 'wasteland', now: 10000, deltaTime: dt, isOvertime: false, roundTimeRemaining: 60,
          sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
          lightningStrikes: [], soulZones: [], vineShields: [] };
        const hitsCoil = scene === 'fall into path' || scene === 'coil before body';
        const predicted = rocketeerShot(prepareAIFrame(world), self, enemy, () => enemy, homing, direction);
        expect(predicted).toBe(hitsCoil ? 'coil' : 'target');
        const game = renderHook(() => useGameEngine(world.players[0].character!, world.players[1].character!,
          60, () => {}, 'multi', false, 1, 'wasteland'));
        const state = game.result.current.gameState;
        Object.assign(state.players[0], structuredClone(world.players[0]));
        Object.assign(state.players[1], structuredClone(world.players[1]));
        state.hazardZones = world.hazardZones.map(zone => structuredClone(zone));
        state.projectiles.push({ ...createProjectile(homing ? 'homing-rocket' : 'rocket', side,
          self.x + PLAYER_SIZE / 2, self.y + PLAYER_SIZE / 2,
          direction * (homing ? HOMING_ROCKET_SPEED : ROCKET_SPEED), 0, self.character!.attackDamage), createdAt: 10000 });
        act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
        vi.setSystemTime(9984);
        for (let tick = 0; tick < 125; tick++) act(() => { vi.advanceTimersByTime(16); });
        expect(game.result.current.gameState.players[other - 1].health < enemy.health).toBe(!hitsCoil);
      });
  }
});
