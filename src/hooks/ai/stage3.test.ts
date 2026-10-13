import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { cpuScene } from '@/test/aiCpuScenes';
import { hunterScatter, hunterSpacing } from './hunter';
import { prepareAIFrame } from './world';
import { rocketeerShot } from './rocketeer';
import { rangedLandingPenalty } from './rangedEnvironment';
import { decideAI, type PositionDecision } from './controller';
import { selectGoal } from './navigation';

function scatter(distance: number, focused = false, marked = false, low = false) {
  const world = cpuScene(0, 'hunter', 'wasteland');
  const owner = world.players[1], opponent = world.players[0];
  owner.hunterFocusedDuration = focused ? 5000 : 0;
  opponent.x = owner.x + distance; opponent.isMarked = marked; opponent.markOwnerId = marked ? owner.id : undefined;
  opponent.markDuration = marked ? 5000 : 0;
  opponent.health = low ? opponent.maxHealth * .5 : opponent.maxHealth;
  return hunterScatter(prepareAIFrame(world), owner, opponent, owner, () => opponent);
}

describe('stage-three bounded ranged tactics', () => {
  it('counts all five pellets nearby, fewer at distance, and none past lifetime', () => {
    expect(scatter(100).hits).toBe(5);
    expect(scatter(260).hits).toBeLessThan(5);
    expect(scatter(500).hits).toBe(0);
    expect(scatter(330, true).hits).toBeGreaterThan(scatter(330).hits);
  });
  it('derives longer focused spacing without changing character range or balance', () => {
    const hunter = createInitialPlayer(2, CHARACTERS.hunter);
    expect(hunterSpacing({ ...hunter, hunterFocusedDuration: 5000 })).toBeGreaterThan(hunterSpacing(hunter));
    expect(CHARACTERS.hunter.attackRange).toBe(140);
  });
  it('uses the actual owner mark and low-health multipliers', () => {
    const basic = scatter(100).damage;
    expect(scatter(100, false, true).damage).toBeCloseTo(basic * 1.25);
    expect(scatter(100, false, false, true).damage).toBeCloseTo(basic * 1.15);
  });
  it('separates a vine sacrifice from fighter hits and does not mutate observations', () => {
    const world = cpuScene(0, 'hunter', 'jungle');
    world.players[0].x = 360;
    world.vineShields = [{ id: 'vine', x: 285, y: 390, width: 20, height: 90, createdAt: world.now, duration: 10000, hp: 1 }];
    const prior = structuredClone(world);
    const result = hunterScatter(prepareAIFrame(world), world.players[1], world.players[0], world.players[1], () => world.players[0]);
    expect(result.vines).toBe(1); expect(result.hits).toBeGreaterThan(0); expect(result.hits).toBeLessThan(5);
    expect(world).toEqual(prior);
  });
  it('does not credit a shield or a backwards shotgun', () => {
    const world = cpuScene(0, 'hunter', 'wasteland'); world.players[0].x = 300;
    world.players[0].isShielding = true;
    const frame = prepareAIFrame(world);
    expect(hunterScatter(frame, world.players[1], world.players[0], world.players[1], () => world.players[0]).hits).toBe(0);
    expect(hunterScatter(frame, world.players[1], world.players[0], { ...world.players[1], facingRight: false }, () => world.players[0]).hits).toBe(0);
  });
  it('opens distance while reloading and reuses the rocket predictor with bounded lead time', () => {
    const world = cpuScene(0, 'rocketeer', 'wasteland'); world.players[0].x = 500;
    const frame = prepareAIFrame(world), owner = world.players[1], enemy = world.players[0];
    const ready = selectGoal(owner, enemy, frame).preferred;
    expect(selectGoal({ ...owner, attackCooldownRemaining: 1100 }, enemy, frame).preferred).toBeGreaterThan(ready);
    expect(rocketeerShot(frame, owner, enemy, () => enemy, false, 1, true, 0)).toBe('target');
    const limited = prepareAIFrame(world, { forecasts: createAISettings('easy').parameters.forecasts, random: () => .5 });
    expect(rocketeerShot(limited, owner, enemy, () => enemy, false, 1, true, 500)).toBeNull();
  });
  it('penalizes unsupported falling near lava, keeps a platform landing corridor', () => {
    const frame = prepareAIFrame(cpuScene(0, 'rocketeer', 'volcano'));
    expect(rangedLandingPenalty(frame, { x: 15, y: 420 }, 300)).toBeGreaterThan(0);
    const platform = frame.world.platforms.find(p => p.id !== 'ground')!;
    expect(rangedLandingPenalty(frame, { x: platform.x, y: platform.y - 80 }, 300)).toBe(0);
    expect(rangedLandingPenalty(frame, { x: 15, y: 420 }, -900)).toBe(0);
  });
  it.each(['hunter', 'rocketeer'] as const)('bounds %s detailed predictions and preserves the pure observation', character => {
    const world = cpuScene(0, character, 'wasteland'); world.players[0].x = 380;
    const prior = structuredClone(world);
    let diagnostic: PositionDecision | undefined;
    decideAI(prepareAIFrame(world), world.players[1], undefined, undefined, undefined, result => { diagnostic = result; });
    expect(diagnostic?.rangedWork?.scatterCalls ?? 0).toBeLessThanOrEqual(4);
    expect(diagnostic?.rangedWork?.rocketCalls ?? 0).toBeLessThanOrEqual(5);
    expect(world).toEqual(prior);
  });
});
