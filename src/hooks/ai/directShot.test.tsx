import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { createHazardZone, createProjectile, hunterNetLaunch, scientistOrbLaunch } from '@/types/projectile';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';
import { prepareAIFrame, type AIWorld } from './world';
import { directShotOutcome } from './directShot';
import { chooseCombat } from './combat';
import { createOpponentModel } from './learning';

afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
type Scene = 'none' | 'enemy' | 'own' | 'expired' | 'dead' | 'off path' | 'pending destruction';
function setup(side: 1 | 2, character: 'scientist' | 'hunter', dt: number, scene: Scene) {
  vi.useFakeTimers(); vi.setSystemTime(10000 - dt); vi.spyOn(Math, 'random').mockReturnValue(0.3);
  const other = side === 1 ? 2 : 1, direction = side === 1 ? 1 : -1;
  const game = renderHook(() => useGameEngine(side === 1 ? CHARACTERS[character] : CHARACTERS.gladiator,
    side === 2 ? CHARACTERS[character] : CHARACTERS.gladiator, 60, () => {}, 'multi', false, 1, 'wasteland'));
  const state = game.result.current.gameState, self = state.players[side - 1], enemy = state.players[other - 1];
  Object.assign(self, { x: side === 1 ? 180 : 560, y: 440, facingRight: direction > 0, isGrounded: true,
    rootDuration: 5000, mana: 80, attackCooldownRemaining: 5000,
    isChargingSkill: character === 'scientist', skillChargeStartTime: character === 'scientist' ? 8500 : undefined });
  Object.assign(enemy, { x: self.x + direction * 250, y: 440, isGrounded: true,
    rootDuration: 5000, mana: 0, attackCooldownRemaining: 5000 });
  if (scene !== 'none') {
    const x = scene === 'pending destruction' ? self.x : self.x + direction * 125;
    state.hazardZones.push({ ...createHazardZone('tesla-coil', scene === 'own' ? side : other,
      x, scene === 'off path' ? 100 : 420, 0, 30000), id: 'coil', isGrounded: true,
      createdAt: scene === 'expired' ? -20001 : 10000,
      health: scene === 'dead' ? 0 : scene === 'pending destruction' ? 5 : 175 });
    if (scene === 'pending destruction') state.projectiles.push({
      ...createProjectile('fireball', side, x + 20, 450, 0, 0, 10), id: 'existing', createdAt: 10000 });
  }
  const world: AIWorld = { players: state.players, projectiles: state.projectiles, hazardZones: state.hazardZones,
    attackHitboxes: [], platforms: state.platforms, now: 10000, deltaTime: dt, mapId: 'wasteland',
    roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
    lightningStrikes: [], soulZones: [], vineShields: [] };
  const spawn = character === 'scientist' ? scientistOrbLaunch(self, 1500, self.character!.attackDamage)
    : hunterNetLaunch(self, self.character!.attackDamage);
  return { game, state, world, self, enemy, spawn };
}
describe('prospective single-contact skill outcomes against actual engine casts', () => {
  for (const side of [1, 2] as const) for (const character of ['scientist', 'hunter'] as const) for (const dt of [16, 33, 100]) {
    it.each(['none', 'enemy', 'own', 'expired', 'dead', 'off path'] as const)(`P${side}/${character}/dt${dt}/%s`, scene => {
      const { game, world, self, enemy, spawn } = setup(side, character, dt, scene);
      const before = structuredClone(world), parameters = createAISettings('perfect').parameters;
      const frame = prepareAIFrame(world, { forecasts: parameters.forecasts, random: () => 0.5 });
      const predicted = directShotOutcome(frame, self, enemy, spawn, () => enemy);
      // At100ms the wide orb reaches these coils in the CURRENT callback,
      // before even a dead/expired coil is removed by the engine.
      const blocked = scene === 'enemy' || character === 'scientist' && dt === 100 && (scene === 'expired' || scene === 'dead');
      expect(predicted.kind).toBe(blocked ? 'coil' : 'enemy');
      expect(world).toEqual(before);
      const combat = chooseCombat(frame, self, enemy, createOpponentModel(),
        { direction: 0, jump: false, drop: false }, true, false, 'pressure', () => enemy);
      expect(combat.skill).toBe(character === 'scientist' ? blocked : !blocked);
      const keys = emptyAIKeys();
      if (character === 'hunter') { if (side === 1) keys.g = true; else keys.enter = true; }
      act(() => game.result.current.setKeysRef({ current: keys }));
      vi.setSystemTime(9984);
      act(() => { vi.advanceTimersByTime(16); });
      act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
      for (let tick = 0; tick < 125; tick++) act(() => { vi.advanceTimersByTime(16); });
      const final = game.result.current.gameState, target = final.players[enemy.id - 1];
      expect(target.health < enemy.health).toBe(predicted.kind === 'enemy');
      if (predicted.kind === 'coil') {
        expect(predicted.rawDamage).toBe(spawn.damage);
        expect(predicted.marginalDamage).toBe(scene === 'dead' ? 0 : spawn.damage);
        if (scene === 'enemy') expect(final.hazardZones.find(zone => zone.id === 'coil')!.health).toBeLessThan(175 - spawn.damage);
        else expect(final.hazardZones.some(zone => zone.id === 'coil')).toBe(false);
        if (character === 'hunter') expect(target.isMarked).toBe(false);
      }
      expect(final.players[side - 1].mana).toBeLessThan(self.mana);
    });
  }
  it.each([1, 2] as const)('P%i does not credit marginal clearing damage when known earlier shots already destroy the coil', side => {
    const { game, world, self, enemy, spawn } = setup(side, 'scientist', 16, 'pending destruction');
    const parameters = createAISettings('perfect').parameters;
    const outcome = directShotOutcome(prepareAIFrame(world, { forecasts: parameters.forecasts, random: () => 0.5 }), self, enemy, spawn, () => enemy);
    expect(outcome).toMatchObject({ kind: 'coil', step: 1, timeMs: 0, coilId: 'coil', remainingHealth: 0, marginalDamage: 0 });
    act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
    act(() => { vi.advanceTimersByTime(16); });
    expect(game.result.current.gameState.hazardZones.some(zone => zone.id === 'coil')).toBe(false);
    expect(game.result.current.gameState.players[enemy.id - 1].health).toBe(enemy.health);
    expect(game.result.current.gameState.players[side - 1].mana).toBeLessThan(self.mana);
  });
});
