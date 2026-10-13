import { describe, expect, it } from 'vitest';
import { cpuScene } from '@/test/aiCpuScenes';
import { basicProjectileLaunches, createProjectile, getProjectileCollisionTime, hunterNetLaunch, projectileProperties, createHazardZone } from '@/types/projectile';
import { PLAYER_SIZE } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { hunterScatter } from './hunter';
import { prepareAIFrame } from './world';
import { directShotOutcome } from './directShot';
import { rocketeerShot } from './rocketeer';
import { decideAI } from './controller';

function scene(distance = 100) {
  const world = cpuScene(0, 'hunter', 'wasteland');
  world.players[0].x = world.players[1].x + distance;
  return { world, owner: world.players[1], enemy: world.players[0],
    shot: () => hunterScatter(prepareAIFrame(world), world.players[1], world.players[0], world.players[1], () => world.players[0]) };
}

describe('current-rule stage-three correctness without combat simulations', () => {
  it('matches the launch-rule straight swept envelope at both focus states and several heights/ranges', () => {
    for (const focus of [0, 5000]) for (const height of [-35, 0, 35]) for (const distance of [50, 100, 160, 240, 330, 390, 500]) {
      const s = scene(distance); s.owner.hunterFocusedDuration = focus; s.enemy.y += height;
      const launches = basicProjectileLaunches(s.owner, s.owner.character!.attackDamage);
      const hits = launches.filter(launch => {
        const p = createProjectile(launch.type, s.owner.id, s.owner.x + 20, s.owner.y + 20,
          launch.velocityX, launch.velocityY, launch.damage, { now: s.world.now, random: () => .5 });
        const time = (1 + Math.floor(p.lifetime / s.world.deltaTime)) * s.world.deltaTime / 1000;
        return getProjectileCollisionTime({ ...p, x: p.x + p.velocityX * time, y: p.y + p.velocityY * time }, p,
          { ...s.enemy, width: PLAYER_SIZE, height: PLAYER_SIZE }) !== null;
      }).length;
      expect(s.shot().hits, `${focus}/${height}/${distance}`).toBe(hits);
    }
  });
  it('uses current 0.4 spread, 1.25 speed, 1.33 damage and 240ms pellet lifetime', () => {
    const s = scene(); s.owner.hunterFocusedDuration = 5000;
    const pellet = basicProjectileLaunches(s.owner, 100)[0];
    expect(pellet.velocityX).toBeCloseTo(1562.5 * Math.cos(6.4 * Math.PI / 180));
    expect(pellet.velocityY).toBeCloseTo(-875 * Math.sin(6.4 * Math.PI / 180));
    expect(pellet.damage).toBeCloseTo(39.9);
    expect(projectileProperties(pellet.type).lifetime).toBe(240);
  });
  it('expires focus before the launch callback, without losing a still-active focus', () => {
    const s = scene(260), normal = s.shot();
    s.owner.hunterFocusedDuration = s.world.deltaTime;
    expect(s.shot()).toEqual(normal);
    s.owner.hunterFocusedDuration = 5000;
    expect(s.shot().damage).toBeGreaterThan(normal.damage);
  });
  it('does not credit damaging pellet hits through a ready Ninja dodge', () => {
    const s = scene(); s.enemy.dodgesRemaining = 1;
    expect(s.shot()).toMatchObject({ hits: 0, damage: 0 });
  });
  it('aligns delayed launch targets, focus expiry and the forecast boundary', () => {
    const s = scene(), frame = prepareAIFrame(s.world), times: number[] = [];
    s.owner.hunterFocusedDuration = 50;
    const normal = s.shot();
    const delayed = hunterScatter(frame, s.owner, s.enemy, s.owner, time => { times.push(time); return s.enemy; }, 100);
    s.owner.hunterFocusedDuration = 0;
    expect(delayed).toEqual(s.shot());
    expect(times[0]).toBeCloseTo(frame.times[1] + .1);
    expect(normal.damage).toBeGreaterThan(delayed.damage);
    const settings = createAISettings('perfect');
    for (const forecast of Object.values(settings.parameters.forecasts)) forecast.horizonMs = 0;
    const limited = prepareAIFrame(s.world, { forecasts: settings.parameters.forecasts, random: () => .5 });
    expect(hunterScatter(limited, s.owner, s.enemy, s.owner, () => s.enemy, 100).hits).toBe(0);
  });
  it('breaks observed freezing with only the first damaging pellet', () => {
    const s = scene(), normal = s.shot();
    s.enemy.isFrozen = true; s.enemy.frozenDuration = 5000;
    expect(s.shot().damage).toBeCloseTo(normal.damage + s.owner.character!.attackDamage * .3 * .25);
    s.enemy.frozenDuration = s.world.deltaTime;
    expect(s.shot().damage).toBeCloseTo(normal.damage);
  });
  it('expires a timed mark but retains the visible mark when its timer is unavailable', () => {
    const s = scene(), normal = s.shot(); s.enemy.isMarked = true; s.enemy.markOwnerId = s.owner.id;
    s.enemy.markDuration = s.world.deltaTime;
    expect(s.shot().damage).toBeCloseTo(normal.damage);
    s.enemy.markDuration = 0;
    expect(s.shot().damage).toBeCloseTo(normal.damage * 1.25);
  });
  it('uses the current top-edge net, -105 velocity, 325 gravity and 45px coil contact', () => {
    const s = scene(250), net = hunterNetLaunch(s.owner, 100), shape = projectileProperties('net');
    expect(net).toMatchObject({ x: s.owner.x + 20, y: s.owner.y, velocityY: -105 });
    expect(shape).toMatchObject({ width: 45, height: 45, gravity: 325 });
    const coil = { ...createHazardZone('tesla-coil', 1, s.owner.x + 125, 420, 2, 30000,
      { now: s.world.now, random: () => .5 }), health: 1, isGrounded: true };
    s.world.hazardZones = [coil];
    expect(directShotOutcome(prepareAIFrame(s.world), s.owner, s.enemy, net, () => s.enemy).kind).toBe('coil');
    Object.assign(s.owner, { health: 3, mana: 80, rootDuration: 5000, attackCooldownRemaining: 0 });
    expect(decideAI(prepareAIFrame(s.world), s.owner).keys.shift).toBe(true);
  });
  it('resolves a simultaneous vine/coil contact in engine order, vine first', () => {
    const s = scene(160); s.world.mapId = 'jungle';
    s.world.vineShields = [{ id: 'tie', x: 280, y: 390, width: 40, height: 100, hp: 1, createdAt: s.world.now, duration: 10000 }];
    s.world.hazardZones = [{ ...createHazardZone('tesla-coil', 1, 280, 390, 1, 10000, { now: s.world.now, random: () => .5 }), height: 100 }];
    expect(s.shot().vines).toBe(1);
    const world = cpuScene(0, 'rocketeer', 'jungle'); world.players[0].x = 500;
    world.vineShields = s.world.vineShields; world.hazardZones = s.world.hazardZones;
    expect(rocketeerShot(prepareAIFrame(world), world.players[1], world.players[0], () => world.players[0], false, 1, true, 0)).toBe('vine');
  });
  it('keeps the immediate callback when future prediction is disabled', () => {
    const world = cpuScene(0, 'rocketeer', 'wasteland'); world.players[0].x = 250;
    const settings = createAISettings('perfect');
    for (const forecast of Object.values(settings.parameters.forecasts)) forecast.horizonMs = 0;
    const frame = prepareAIFrame(world, { forecasts: settings.parameters.forecasts, random: () => .5 });
    expect(rocketeerShot(frame, world.players[1], world.players[0], () => world.players[0], false, 1, true, 0)).toBe('target');
    expect(rocketeerShot(frame, world.players[1], world.players[0], () => world.players[0], false, 1, true, 500)).toBeNull();
  });
});
