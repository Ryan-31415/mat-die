import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS, PLAYER_SIZE, createInitialPlayer } from '@/types/game';
import { circleIntersectsRect, playerOverlapsRect, stepPlayerCrowdControl } from '@/types/combatPhysics';
import { createHazardZone, createProjectile } from '@/types/projectile';
import { cpuScene } from '@/test/aiCpuScenes';
import { useGameEngine } from '../useGameEngine';
import { decideAI, emptyAIKeys, type PositionDecision } from './controller';
import { predictActionStart } from './actionStart';
import { hazardRisk } from './navigation';
import { hazardOverlapsPlayer, prepareAIFrame, type AIWorld } from './world';
import { createAISettings } from '@/types/ai';
import { createPerceptionMemory, perceiveWorld } from './perception';

const zone = { ...createHazardZone('blizzard', 2, 300, 300, 3, 5000),
  x: 100, y: 100, width: 400, height: 400, createdAt: 10000, lastTick: 0 };
const points = [
  { name: 'inside', x: 280, y: 280, hit: true },
  { name: 'bounding square corner', x: 100, y: 100, hit: false },
  { name: 'outside', x: 501, y: 280, hit: false },
  { name: 'tangent', x: 500, y: 280, hit: true },
  { name: 'crossing into the circle', x: 501, y: 280, hit: true, left: true },
];
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('current circular blizzard geometry', () => {
  it('keeps the exact active-duration boundary and removes expired observed zones', () => {
    const world = cpuScene(0);
    world.hazardZones = [zone];
    world.now = 15000;
    expect(prepareAIFrame(world).zones).toHaveLength(1);
    world.now += .001;
    expect(prepareAIFrame(world).zones).toHaveLength(0);
  });
  it('does not evaluate hidden zones or unobserved stone impacts', () => {
    const world = cpuScene(0);
    world.hazardZones = [zone];
    world.projectiles = [createProjectile('blizzard-stone', 1, 400, 400, 0, 600, 1, { now: world.now, random: () => .5 })];
    const parameters = createAISettings('perfect').parameters;
    parameters.information.hazards = false;
    parameters.information.projectiles = false;
    const observed = perceiveWorld(world, parameters, createPerceptionMemory(), world.now, () => .5, 2).world;
    const frame = prepareAIFrame(observed);
    expect(frame.zones).toHaveLength(0);
    expect(frame.pools).toHaveLength(0);
  });
  it('stops charging movement risk after the predicted zone duration', () => {
    function risks(duration: number) {
      const world = cpuScene(0, 'mage', 'wasteland');
      Object.assign(world.players[1], { x: 280, y: 280, mana: 0, attackCooldownRemaining: 2000 });
      const frame = prepareAIFrame(world);
      frame.steps = 1; frame.times = new Float64Array([0, .016]);
      if (duration) frame.pools = [{ ...zone, ownerId: 1, impactTime: 0, duration }];
      let diagnostic: PositionDecision | undefined;
      decideAI(frame, world.players[1], undefined, undefined, undefined, value => { diagnostic = value; });
      if (!diagnostic) throw new Error('Missing diagnostics');
      return diagnostic.movementCandidates.map(candidate => candidate.risk);
    }
    expect(risks(1)).toEqual(risks(0));
    expect(risks(5000).every((risk, i) => risk > risks(0)[i])).toBe(true);
  });
  it.each(points.filter(p => !p.left))('$name has the actual body/circle boundary', point => {
    expect(hazardOverlapsPlayer(point, zone, 8)).toBe(point.hit);
    expect(hazardRisk(point, zone)).toBe(point.hit ? 160 : 0);
  });
  it('retains rectangular hazards and their safety margins at a blizzard corner', () => {
    const point = { x: 100, y: 100 };
    const fire = { ...zone, type: 'fire-pool' as const };
    expect(hazardRisk(point, zone)).toBe(0);
    expect(hazardRisk(point, fire)).toBe(120);
    expect(hazardOverlapsPlayer({ x: 501, y: 280 }, fire, 8)).toBe(true);
    expect(hazardOverlapsPlayer(point, fire, 8)).toBe(playerOverlapsRect(point, fire, 8));
  });
  it.each(['observed zone', 'observed stone impact'] as const)('%s does not add a bounding-corner risk to live movement candidates', source => {
    function risks(withBlizzard: boolean) {
      const world = cpuScene(0, 'mage', 'wasteland');
      Object.assign(world.players[1], { x: 100, y: 100, mana: 0, attackCooldownRemaining: 2000 });
      const frame = prepareAIFrame(world);
      frame.steps = 1; frame.times = new Float64Array([0, .016]);
      if (withBlizzard) {
        if (source === 'observed zone') frame.zones = [{ ...zone, ownerId: 1 }];
        else frame.pools = [{ ...zone, ownerId: 1, impactTime: 0 }];
      }
      let diagnostic: PositionDecision | undefined;
      decideAI(frame, world.players[1], undefined, undefined, undefined, value => { diagnostic = value; });
      if (!diagnostic) throw new Error('Missing movement diagnostics');
      return diagnostic.movementCandidates.map(candidate => ({ action: candidate.action, risk: candidate.risk }));
    }
    expect(risks(true)).toEqual(risks(false));
  });
  it.each(points)('$name matches actual engine damage and first-callback movement', fixture => {
    vi.useFakeTimers(); vi.setSystemTime(10000); vi.spyOn(Math, 'random').mockReturnValue(.3);
    const game = renderHook(() => useGameEngine(CHARACTERS.mage, CHARACTERS['ice-mage'], 60,
      () => {}, 'multi', false, 1, 'wasteland'));
    const state = game.result.current.gameState;
    Object.assign(state.players[0], { x: fixture.x, y: fixture.y, velocityX: 0, velocityY: 0, isGrounded: false });
    state.players[1].x = 700; state.hazardZones = [{ ...zone }];
    const world: AIWorld = { ...cpuScene(0), players: state.players, platforms: state.platforms,
      hazardZones: state.hazardZones, now: 10016, deltaTime: 16, mapId: 'wasteland' };
    const expected = predictActionStart(world, state.players[0], { left: !!fixture.left, right: false, jump: false, down: false }, false);
    act(() => game.result.current.setKeysRef({ current: { ...emptyAIKeys(), a: !!fixture.left } }));
    act(() => { vi.advanceTimersByTime(16); });
    const actual = game.result.current.gameState.players[0];
    expect(actual).toMatchObject(expected);
    expect(actual.health < actual.maxHealth).toBe(fixture.hit);
    expect(hazardRisk(actual, zone) > 0).toBe(fixture.hit);
    game.unmount();
  });
  it('keeps observed blizzard impact pools circular without inventing unobserved stones', () => {
    const world = cpuScene(0, 'mage', 'wasteland');
    expect(prepareAIFrame(world).pools).toHaveLength(0);
    world.projectiles = [createProjectile('blizzard-stone', 1, 400, 400, 0, 600, 1, { now: world.now, random: () => .5 })];
    const pool = prepareAIFrame(world).pools.find(p => p.type === 'blizzard');
    expect(pool).toBeDefined();
    expect(pool?.sourceProjectileId).toBe(world.projectiles[0].id);
    expect(pool?.impactTime).toBeGreaterThan(0);
    if (!pool) throw new Error('Missing observed impact');
    expect(hazardOverlapsPlayer({ x: pool.x, y: pool.y }, pool, 8)).toBe(false);
    expect(hazardOverlapsPlayer({ x: pool.x + 200, y: pool.y + 200 }, pool, 8)).toBe(true);
  });
  it.each([false, true])('freeze at five stacks uses circular duration (inside=%s)', inside => {
    const player = { ...createInitialPlayer(1, CHARACTERS.mage), x: inside ? 280 : 100, y: inside ? 280 : 100, freezeGauge: 5 };
    stepPlayerCrowdControl(player, createInitialPlayer(2, CHARACTERS['ice-mage']), [zone], 10016, 16);
    expect(player.isFrozen).toBe(true);
    expect(player.frozenDuration).toBe(inside ? 1500 : 1000);
    expect(player.freezeGauge).toBe(0);
    stepPlayerCrowdControl(player, createInitialPlayer(2, CHARACTERS['ice-mage']), [], 12000, 1600);
    expect(player.isFrozen).toBe(false);
  });
  it('a direct current-rule hit breaks freeze and applies its 25% damage bonus', () => {
    vi.useFakeTimers(); vi.setSystemTime(10000); vi.spyOn(Math, 'random').mockReturnValue(.3);
    const game = renderHook(() => useGameEngine(CHARACTERS.mage, CHARACTERS['ice-mage'], 60, () => {}, 'multi', false, 1, 'wasteland'));
    const state = game.result.current.gameState, player = state.players[0];
    Object.assign(player, { x: 300, y: 440, isFrozen: true, frozenDuration: 1000 });
    state.players[1].x = 700;
    state.projectiles = [createProjectile('snowball', 2, 320, 460, 0, 0, 8)];
    act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
    act(() => { vi.advanceTimersByTime(16); });
    const actual = game.result.current.gameState.players[0];
    expect(actual.health).toBe(player.maxHealth - 10);
    expect(actual.isFrozen).toBe(false);
    expect(actual.freezeGauge).toBe(1);
    game.unmount();
  });
  it('rectangle corner exclusion agrees with the shared engine predicate', () => {
    expect(circleIntersectsRect(zone, { x: 100, y: 100, width: PLAYER_SIZE, height: PLAYER_SIZE })).toBe(false);
  });
});

describe('latest Mage and Ice Mage engine launches', () => {
  it.each(['mage', 'ice-mage'] as const)('%s skill retains the latest physical rules', character => {
    vi.useFakeTimers(); vi.setSystemTime(10000); vi.spyOn(Math, 'random').mockReturnValue(.3);
    const game = renderHook(() => useGameEngine(CHARACTERS[character], CHARACTERS.gladiator, 60,
      () => {}, 'multi', false, 1, 'wasteland'));
    Object.assign(game.result.current.gameState.players[0], { x: 200, y: 300, facingRight: true });
    game.result.current.gameState.players[1].x = 700;
    act(() => game.result.current.setKeysRef({ current: { ...emptyAIKeys(), g: true } }));
    act(() => { vi.advanceTimersByTime(17); });
    const shots = game.result.current.gameState.projectiles;
    if (character === 'mage') {
      expect(shots).toHaveLength(1);
      expect(shots[0]).toMatchObject({ type: 'large-fireball', velocityY: 800, damage: CHARACTERS.mage.attackDamage * 1.75,
        width: 45, height: 45, firePoolDuration: 4000 });
    } else {
      expect(shots).toHaveLength(4);
      for (const shot of shots) expect(shot).toMatchObject({ type: 'large-snowball', velocityX: 900,
        damage: CHARACTERS['ice-mage'].attackDamage * .05, width: 40, height: 40 });
      expect(shots[1].y - shots[0].y).toBeCloseTo(40);
    }
    game.unmount();
  });
});
