import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '@/types/game';
import { createAttackHitbox, createHazardZone, createProjectile } from '@/types/projectile';
import { useGameEngine } from '../useGameEngine';
import { emptyAIKeys } from './controller';
import { deterministicEngineRandom } from '@/test/aiEvaluation';
import { createCombatDiagnostics, entityDamageSource, recordAction, recordEntityAction, recordHealthChange } from './diagnostics';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe('complete health accounting without gameplay changes', () => {
  it.each([true, false])('separates a successful ninja parry from an offensive miss (reflectable=%s)', reflectable => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const game = renderHook(() => useGameEngine(CHARACTERS.ninja, CHARACTERS.mage, 60, () => {}, 'multi', false, 1,
      'wasteland', undefined, true));
    const keys = { current: { ...emptyAIKeys(), f: true } };
    act(() => game.result.current.setKeysRef(keys));
    const state = game.result.current.gameState;
    Object.assign(state.players[0], { x: 100, y: 440, facingRight: true });
    Object.assign(state.players[1], { x: 600, y: 440 });
    const shot = createProjectile('arrow', 2, 170, 445, -100, 0, 10);
    shot.canBeDeflected = reflectable;
    state.projectiles.push(shot);
    act(() => { vi.advanceTimersByTime(17); });
    expect(game.result.current.gameState.projectiles[0].ownerId).toBe(reflectable ? 1 : 2);
    keys.current.f = false;
    for (let tick = 0; tick < 10; tick++) act(() => { vi.advanceTimersByTime(17); });
    expect(game.result.current.gameState.diagnostics!.meleeGeometry[0]).toEqual({ emitted: 1, completed: 1,
      contacts: 0, misses: 1, deflections: reflectable ? 1 : 0, deflectionOnly: reflectable ? 1 : 0 });
    game.unmount();
  });
  it.each([{ x: 600, immune: false, contacts: 0, misses: 1 }, { x: 160, immune: true, contacts: 1, misses: 0 }])(
    'distinguishes geometric misses from immunity and active censored swings ($x/$immune)', scene => {
      vi.useFakeTimers(); vi.setSystemTime(10000);
      const game = renderHook(() => useGameEngine(CHARACTERS.gladiator, CHARACTERS.mage, 60, () => {}, 'multi', false, 1,
        'wasteland', undefined, true));
      const keys = { current: { ...emptyAIKeys(), f: true } };
      act(() => game.result.current.setKeysRef(keys));
      Object.assign(game.result.current.gameState.players[0], { x: 100, y: 440 });
      Object.assign(game.result.current.gameState.players[1], { x: scene.x, y: 440, isInvulnerable: scene.immune, invulnerableDuration: scene.immune ? 1000 : 0 });
      act(() => { vi.advanceTimersByTime(17); });
      expect(game.result.current.gameState.diagnostics!.meleeGeometry[0]).toMatchObject({ emitted: 1, completed: 0, misses: 0 });
      keys.current.f = false;
      for (let tick = 0; tick < 20; tick++) act(() => { vi.advanceTimersByTime(17); });
      const metrics = game.result.current.gameState.diagnostics!;
      expect(metrics.meleeGeometry[0]).toEqual({ emitted: 1, completed: 1, contacts: scene.contacts, misses: scene.misses,
        deflections: 0, deflectionOnly: 0 });
      expect(metrics.effectiveDamage[0]).toBe(0);
      expect(metrics.pendingMelee).toEqual({});
      game.unmount();
    });
  it('counts reaper contact damage as one landed ultimate even without emitted entities', () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const game = renderHook(() => useGameEngine(CHARACTERS.reaper, CHARACTERS.gladiator, 60, () => {}, 'multi', false, 1,
      'wasteland', undefined, true));
    act(() => game.result.current.setKeysRef({ current: { ...emptyAIKeys(), h: true } }));
    Object.assign(game.result.current.gameState.players[0], { x: 340, y: 440, health: 50 });
    Object.assign(game.result.current.gameState.players[1], { x: 400, y: 440 });
    for (let tick = 0; tick < 25; tick++) act(() => { vi.advanceTimersByTime(17); });
    const metrics = game.result.current.gameState.diagnostics!;
    expect(metrics.actions[0].ultimate).toMatchObject({ uses: 1, hits: 1, emitted: 0 });
    expect(metrics.actions[0].ultimate.damage).toBeGreaterThan(0);
    expect(metrics.actions[0].ultimate.healing).toBeGreaterThan(0);
    expect(metrics.actions[0].ultimate.damage).toBeCloseTo(metrics.effectiveDamage[0], 8);
    game.unmount();
  });
  it('counts one damaging action for many emitted entities and separates clone/self damage', () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const game = renderHook(() => useGameEngine(CHARACTERS.hunter, CHARACTERS.ninja, 60, () => {}));
    const metrics = createCombatDiagnostics();
    recordAction(metrics, 1, 'attack');
    const target = game.result.current.gameState.players[1];
    for (let i = 0; i < 5; i++) {
      const entity = { id: 'pellet-' + i, ownerId: 1 as const };
      recordEntityAction(metrics, entity, 'attack', 'shotgun-shot');
      recordHealthChange(metrics, target, 100, 97, entityDamageSource(metrics, entity, 'direct'));
    }
    expect(metrics.actions[0].attack).toMatchObject({ uses: 1, emitted: 5, hits: 1, damage: 15 });
    recordAction(metrics, 1, 'attack', 0, true);
    const cloneShot = { id: 'clone-shot', ownerId: 1 as const };
    recordEntityAction(metrics, cloneShot, 'attack', 'clone-action', true);
    recordHealthChange(metrics, target, 97, 95, entityDamageSource(metrics, cloneShot, 'direct'));
    recordHealthChange(metrics, game.result.current.gameState.players[0], 100, 90, { kind: 'self', ownerId: 1, action: 'skill' });
    expect(metrics.cloneActions[0].attack).toMatchObject({ uses: 1, hits: 1, damage: 2 });
    expect(metrics.actions[0].attack.damage).toBe(15);
    expect(metrics.actions[0].skill).toMatchObject({ damage: 0, selfDamage: 10 });
    game.unmount();
  });
  it('keeps skill provenance through large-fireball meteors and pools', () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const game = renderHook(() => useGameEngine(CHARACTERS.mage, CHARACTERS.gladiator, 60, () => {}, 'multi', false, 1, 'wasteland', undefined, true));
    act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
    const state = game.result.current.gameState;
    Object.assign(state.players[1], { x: 400, y: 440 });
    const fireball = createProjectile('large-fireball', 1, 420, 445, 0, 750, 10);
    recordAction(state.diagnostics, 1, 'skill', 30);
    recordEntityAction(state.diagnostics, fireball, 'skill', 'meteor-skill');
    state.projectiles.push(fireball);
    act(() => { vi.advanceTimersByTime(17); });
    const after = game.result.current.gameState;
    const meteors = after.projectiles.filter(p => p.type === 'meteor');
    expect(meteors).toHaveLength(5);
    for (const meteor of meteors) expect(after.diagnostics.entityActionIds[meteor.id]).toBe('meteor-skill');
    for (let tick = 0; tick < 70; tick++) act(() => { vi.advanceTimersByTime(17); });
    const final = game.result.current.gameState;
    for (const zone of final.hazardZones) expect(final.diagnostics.entityActionIds[zone.id]).toBe('meteor-skill');
    expect(final.diagnostics.actions[0].skill).toMatchObject({ uses: 1, hits: 1 });
    expect(final.diagnostics.actions[0].skill.damage).toBeCloseTo(final.diagnostics.effectiveDamage[0], 8);
    game.unmount();
  });
  it('counts shield activations separately from upkeep and persistent melee blocking', () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const game = renderHook(() => useGameEngine(CHARACTERS.reaper, CHARACTERS.gladiator, 60, () => {}, 'multi', false, 1, 'wasteland', undefined, true));
    const keys = { current: { ...emptyAIKeys(), enter: true } };
    act(() => game.result.current.setKeysRef(keys));
    const state = game.result.current.gameState;
    Object.assign(state.players[1], { x: 400, y: 440, facingRight: false });
    state.attackHitboxes.push(createAttackHitbox(1, 390, 440, 100, 40, 15, 200, false, 300));
    for (let tick = 0; tick < 10; tick++) act(() => { vi.advanceTimersByTime(17); });
    const metrics = game.result.current.gameState.diagnostics;
    expect(metrics.actions[1].defense).toMatchObject({ uses: 1, mana: 2, blocked: 15 });
    expect(metrics.receivedDamage[1]).toBe(0);
    game.unmount();
  });
  it('caps effective overkill at actual HP while preserving the old dealt value', () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const game = renderHook(() => useGameEngine(CHARACTERS.mage, CHARACTERS.gladiator, 60, vi.fn(), 'multi', false, 1, 'wasteland', undefined, true));
    act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
    const state = game.result.current.gameState;
    Object.assign(state.players[1], { x: 400, y: 440, health: 5 });
    state.projectiles.push(createProjectile('fireball', 1, 410, 450, 0, 0, 100));
    act(() => { vi.advanceTimersByTime(17); });
    expect(game.result.current.gameState.diagnostics.effectiveDamage[0]).toBe(5);
    expect(game.result.current.gameState.diagnostics.directDamage[0]).toBe(100);
    game.unmount();
  });
  it('accounts separately for DOT, zones and healing and closes the HP ledger', () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const game = renderHook(() => useGameEngine(CHARACTERS.scientist, CHARACTERS.gladiator, 60, vi.fn(), 'multi', false, 1, 'wasteland', undefined, true));
    act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
    const state = game.result.current.gameState;
    Object.assign(state.players[1], { x: 400, y: 440, health: 80, isPoisoned: true, poisonDuration: 1000,
      isBurning: true, burnDuration: 1000, burnDamagePerTick: 2, burnOwner: 1, lastBurnTick: 9750,
      healthRegen: 5, regenDuration: 1000 });
    state.diagnostics.poisonOwners['player:2'] = 1;
    state.hazardZones.push(createHazardZone('toxic-pool', 1, 380, 420, 3, 1000));
    for (let tick = 0; tick < 20; tick++) act(() => { vi.advanceTimersByTime(17); });
    const final = game.result.current.gameState, metrics = final.diagnostics;
    expect(metrics.damageByKind.burn[1]).toBeGreaterThan(0);
    expect(metrics.damageByKind.poison[1]).toBeGreaterThan(0);
    expect(metrics.damageByKind.zone[1]).toBeGreaterThan(0);
    expect(metrics.healing[1]).toBeGreaterThan(0);
    expect(80 + metrics.healing[1] - metrics.receivedDamage[1]).toBeCloseTo(final.players[1].health, 8);
    expect(metrics.effectiveDamage[0]).toBeCloseTo(metrics.receivedDamage[1], 8);
    game.unmount();
  });
  it('leaves game state identical when diagnostics are enabled, including delayed snowballs', () => {
    function run(diagnostics: boolean) {
      vi.useFakeTimers(); vi.setSystemTime(10000);
      const runtime = { random: deterministicEngineRandom(731) };
      const game = renderHook(() => useGameEngine(CHARACTERS['ice-mage'], CHARACTERS.reaper, 2, vi.fn(), 'multi', false, 1, 'graveyard', undefined, diagnostics, undefined, runtime));
      const keys = { current: { ...emptyAIKeys(), g: true, f: true, arrowLeft: true, shift: true } };
      act(() => game.result.current.setKeysRef(keys));
      const traces = [];
      for (let tick = 0; tick < 60; tick++) {
        act(() => { vi.advanceTimersByTime(17); });
        const { diagnostics: _metrics, ...state } = game.result.current.gameState;
        traces.push(JSON.parse(JSON.stringify(state)));
      }
      game.unmount(); vi.clearAllTimers(); vi.useRealTimers();
      return traces;
    }
    expect(run(true)).toEqual(run(false));
  });
});
