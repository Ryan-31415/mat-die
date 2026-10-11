import { describe, expect, it } from 'vitest';
import { createAISettings } from '@/types/ai';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { MAPS } from '@/types/map';
import { createHazardZone, createProjectile } from '@/types/projectile';
import { loadFrozenAI } from '@/test/aiBaseline';
import { seededRandom } from './random';
import { createPerceptionMemory, perceiveWorld } from './perception';
import type { AIWorld } from './world';
import { prepareAIFrame } from './world';

const clock = { now: 10000, random: () => 0.3 };
function world(): AIWorld {
  return {
    players: [createInitialPlayer(1, CHARACTERS.rocketeer), createInitialPlayer(2, CHARACTERS.scientist)],
    now: 10000, deltaTime: 16, platforms: MAPS.wasteland.platforms, mapId: 'wasteland',
    isOvertime: false, roundTimeRemaining: 60, projectiles: [], hazardZones: [], attackHitboxes: [],
    sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
    lightningStrikes: [], soulZones: [], vineShields: [],
  };
}
function estimated() {
  const p = createAISettings('hard').parameters;
  // Isolate the public-rule estimate; the preset's actual errors are tested separately.
  p.estimation.properties = { mode: 'estimated', errorPercent: 0, rounding: 0 };
  return p;
}

describe('current public rules at the restricted perception boundary', () => {
  it('includes current Ice Mage passive clocks only within exact duration and status/timer permissions', () => {
    const w = world(), changed = structuredClone(w);
    for (const player of w.players) Object.assign(player, { freezeGauge: 3, lastHitByIceMage: 9950, lastFreezeGaugeDecay: 9900 });
    for (const player of changed.players) Object.assign(player, { freezeGauge: 3, lastHitByIceMage: 100, lastFreezeGaugeDecay: 200 });
    for (const observer of [1, 2] as const) {
      const p = createAISettings('perfect').parameters;
      for (const player of perceiveWorld(w, p, createPerceptionMemory(), w.now, () => 0.5, observer).world.players)
        expect(player).toMatchObject({ lastHitByIceMage: 9950, lastFreezeGaugeDecay: 9900 });
      for (const mask of ['statuses', 'statusTimers'] as const) {
        const masked = createAISettings('perfect').parameters; masked.information[mask] = false;
        const snapshot = perceiveWorld(w, masked, createPerceptionMemory(), w.now, () => 0.5, observer).world;
        expect(snapshot.players[observer - 1]).toMatchObject({ lastHitByIceMage: 9950, lastFreezeGaugeDecay: 9900 });
        expect(snapshot.players[observer === 1 ? 1 : 0]).toMatchObject({ lastHitByIceMage: 0, lastFreezeGaugeDecay: 0 });
      }
      p.estimation.durations.mode = 'estimated';
      expect(perceiveWorld(w, p, createPerceptionMemory(), w.now, () => 0.5, observer))
        .toEqual(perceiveWorld(changed, p, createPerceptionMemory(), w.now, () => 0.5, observer));
    }
  });
  it('grants only the selected exact groups for coil state and detached bat hit records', () => {
    const w = world();
    w.hazardZones = [{ ...createHazardZone('tesla-coil', 1, 300, 200, 2, 30000, clock),
      velocityY: 321, isGrounded: false, attackCooldown: 175, lastAttack: 9997, lastSelfDamage: 9992 }];
    w.projectiles = [{ ...createProjectile('bat', 1, 300, 210, 550, 0, 10, clock), hitCoilIds: ['known-coil'] }];
    const p = createAISettings('perfect').parameters;
    const exact = perceiveWorld(w, p, createPerceptionMemory()).world;
    expect(exact.hazardZones[0]).toMatchObject({ velocityY: 321, isGrounded: false, attackCooldown: 175, lastAttack: 9997, lastSelfDamage: 9992 });
    expect(exact.projectiles[0].hitCoilIds).toEqual(['known-coil']);
    exact.projectiles[0].hitCoilIds.push('detached');
    expect(w.projectiles[0].hitCoilIds).toEqual(['known-coil']);
    for (const key of ['movement', 'properties', 'cooldowns', 'durations'] as const) p.estimation[key] = { mode: 'estimated', errorPercent: 0, rounding: 0 };
    const estimated = perceiveWorld(w, p, createPerceptionMemory()).world;
    expect(estimated.hazardZones[0]).toMatchObject({ velocityY: 0, isGrounded: false, attackCooldown: 100 });
    expect(estimated.hazardZones[0].lastAttack).toBeUndefined();
    expect(estimated.hazardZones[0].lastSelfDamage).toBeUndefined();
    expect(estimated.projectiles[0].hitCoilIds).toBeUndefined();
    p.estimation.movement.mode = 'exact';
    const motion = perceiveWorld(w, p, createPerceptionMemory()).world;
    expect(motion.hazardZones[0].velocityY).toBe(321);
    expect(motion.hazardZones[0].attackCooldown).toBe(100);
    expect(motion.projectiles[0].hitCoilIds).toBeUndefined();
    p.information.hazards = false; p.information.projectiles = false;
    const hidden = perceiveWorld(w, p, createPerceptionMemory()).world;
    expect(hidden.hazardZones).toEqual([]); expect(hidden.projectiles).toEqual([]);
  });

  it('estimates coil falling from observed positions and platform geometry, never hidden motion/timers', () => {
    const w = world(); w.hazardZones = [createHazardZone('tesla-coil', 1, 300, 200, 2, 30000, clock)];
    const p = estimated(); p.estimation.movement = { mode: 'estimated', errorPercent: 0, rounding: 0 };
    const first = perceiveWorld(w, p, createPerceptionMemory());
    expect(first.world.hazardZones[0]).toMatchObject({ velocityY: 0, isGrounded: false });
    w.now += 50; w.hazardZones[0].y += 10;
    const next = perceiveWorld(w, p, first.memory);
    expect(next.world.hazardZones[0].velocityY).toBe(200);
    const hidden = structuredClone(w);
    Object.assign(hidden.hazardZones[0], { velocityY: 999, isGrounded: true, lastAttack: 9999, lastSelfDamage: 9999 });
    expect(perceiveWorld(hidden, p, first.memory)).toEqual(next);
    w.now += 50; w.hazardZones[0].y = 420;
    expect(perceiveWorld(w, p, next.memory).world.hazardZones[0]).toMatchObject({ velocityY: 0, isGrounded: true });
    w.now += 2000; w.hazardZones[0].y = 250;
    expect(perceiveWorld(w, p, next.memory).world.hazardZones[0].velocityY).toBe(0);
  });
  it.each(['fireball', 'flask', 'net', 'snowball', 'electric-orb'] as const)('estimates a first %s direction from visible owner facing, then displacement', type => {
    for (const ownerId of [1, 2] as const) for (const facingRight of [false, true]) {
      const w = world(); w.players[ownerId - 1].facingRight = facingRight;
      w.projectiles = [createProjectile(type, ownerId, 300, 300, facingRight ? 800 : -800, 0, 16, clock)];
      const p = estimated();
      const first = perceiveWorld(w, p, createPerceptionMemory());
      expect(Math.sign(first.world.projectiles[0].velocityX)).toBe(facingRight ? 1 : -1);
      const hidden = structuredClone(w);
      Object.assign(hidden.projectiles[0], { velocityX: facingRight ? -999 : 999, velocityY: 999 });
      expect(perceiveWorld(hidden, p, createPerceptionMemory())).toEqual(first);
      w.now += 50; w.projectiles[0].x += 20; w.projectiles[0].y -= 5;
      w.players[ownerId - 1].facingRight = false;
      expect(perceiveWorld(w, p, first.memory).world.projectiles[0]).toMatchObject({ velocityX: 400, velocityY: -100 });
    }
  });

  it.each(['bullet', 'super-bullet'] as const)('uses the rendered %s rotation without reading speed magnitude', type => {
    const w = world();
    w.projectiles = [createProjectile(type, 1, 300, 300, -600, -600, 16, clock)];
    w.players[0].facingRight = true;
    const first = perceiveWorld(w, estimated(), createPerceptionMemory());
    expect(first.world.projectiles[0].velocityX).toBeLessThan(0);
    expect(first.world.projectiles[0].velocityY).toBeLessThan(0);
    const changed = structuredClone(w);
    changed.projectiles[0].velocityX *= 3; changed.projectiles[0].velocityY *= 3;
    expect(perceiveWorld(changed, estimated(), createPerceptionMemory())).toEqual(first);
    const p = estimated(); p.information.projectiles = false;
    expect(perceiveWorld(w, p, createPerceptionMemory()).world.projectiles).toEqual([]);
  });
  it.each([
    { character: 'gladiator', right: 300, left: 210, y: 300, width: 130, height: 40, duration: 200 },
    { character: 'ninja', right: 300, left: 205, y: 290, width: 135, height: 44, duration: 120 },
    { character: 'reaper', right: 290, left: 180, y: 290, width: 170, height: 60, duration: 250 },
  ] as const)('infers the public $character attack shape for either owner and facing without reading hidden boxes', rule => {
    for (const side of [1, 2] as const) for (const facingRight of [false, true]) {
      const w = world();
      Object.assign(w.players[side - 1], { character: CHARACTERS[rule.character], x: 300, y: 300, facingRight, isAttacking: true });
      const p = estimated(); p.estimation.durations = { mode: 'estimated', errorPercent: 0, rounding: 0 };
      const a = perceiveWorld(w, p, createPerceptionMemory());
      expect(a.world.attackHitboxes).toHaveLength(1);
      expect(a.world.attackHitboxes[0]).toMatchObject({ ownerId: side, x: facingRight ? rule.right : rule.left,
        y: rule.y, width: rule.width, height: rule.height, duration: rule.duration, createdAt: w.now,
        sourceX: 320, canDeflectProjectiles: rule.character === 'ninja' });
      const hidden = structuredClone(w);
      hidden.attackHitboxes = [{ ...a.world.attackHitboxes[0], x: 999, damage: 999, duration: 999, createdAt: 1 }];
      expect(perceiveWorld(hidden, p, createPerceptionMemory())).toEqual(a);
      p.information.meleeHitboxes = false;
      expect(perceiveWorld(w, p, createPerceptionMemory()).world.attackHitboxes).toEqual([]);
    }
  });

  it('keeps the launch rectangle stationary and separates ninja animation from its 120ms active window', () => {
    const w = world();
    Object.assign(w.players[0], { character: CHARACTERS.ninja, x: 300, y: 300, isAttacking: true, facingRight: true });
    const p = estimated(); p.estimation.durations = { mode: 'estimated', errorPercent: 0, rounding: 0 };
    const first = perceiveWorld(w, p, createPerceptionMemory());
    w.now += 80; Object.assign(w.players[0], { x: 400, y: 330, facingRight: false });
    const second = perceiveWorld(w, p, first.memory);
    expect(second.world.attackHitboxes[0]).toMatchObject({ x: 300, y: 290, sourceX: 320, createdAt: 10000, duration: 120 });
    w.now = 10130;
    const expired = perceiveWorld(w, p, second.memory);
    expect(prepareAIFrame(expired.world).hitboxes).toEqual([]);
    w.now = 10180;
    const stillAnimating = perceiveWorld(w, p, expired.memory);
    expect(prepareAIFrame(stillAnimating.world).hitboxes).toEqual([]);
    w.now = 10210; w.players[0].isAttacking = false;
    const stopped = perceiveWorld(w, p, stillAnimating.memory);
    expect(stopped.world.attackHitboxes).toEqual([]);
    w.now = 11100; w.players[0].isAttacking = true;
    expect(perceiveWorld(w, p, stopped.memory).world.attackHitboxes[0]).toMatchObject({ x: 305, y: 320, createdAt: 11100 });
  });

  it('retains the observed reaper hitbox after its 200ms animation and expires it after 250ms', () => {
    const w = world();
    Object.assign(w.players[0], { character: CHARACTERS.reaper, x: 300, y: 300, isAttacking: true });
    const p = estimated(); p.estimation.durations = { mode: 'estimated', errorPercent: 0, rounding: 0 };
    const first = perceiveWorld(w, p, createPerceptionMemory());
    w.now = 10210; w.players[0].isAttacking = false;
    const tail = perceiveWorld(w, p, first.memory);
    expect(prepareAIFrame(tail.world).hitboxes).toHaveLength(1);
    w.now = 10251;
    expect(perceiveWorld(w, p, tail.memory).world.attackHitboxes).toEqual([]);
  });

  it('applies duration noise to the public base each time without compounding or restarting onset', () => {
    const w = world(); Object.assign(w.players[0], { character: CHARACTERS.reaper, isAttacking: true });
    const p = estimated(); p.estimation.durations = { mode: 'estimated', errorPercent: 20, rounding: 0 };
    const first = perceiveWorld(w, p, createPerceptionMemory(), w.now, () => 1);
    expect(first.world.attackHitboxes[0].duration).toBe(300);
    w.now += 50;
    const next = perceiveWorld(w, p, first.memory, w.now, () => 1);
    expect(next.world.attackHitboxes[0]).toMatchObject({ duration: 300, createdAt: 10000 });
    p.hiddenAttacks = 'none';
    expect(perceiveWorld(w, p, first.memory).world.attackHitboxes).toEqual([]);
  });
  it('preserves perfect observations and random consumption while adding explicitly permitted coil metadata', () => {
    const frozen = loadFrozenAI().api;
    const settings = createAISettings('perfect');
    for (const seed of [1476252826, 2430541141]) {
      let live = createPerceptionMemory();
      let original = frozen.createPerceptionMemory();
      const liveRandom = seededRandom(seed), oldRandom = seededRandom(seed);
      const legacyWorld = (w: AIWorld | undefined) => w && ({ ...w, hazardZones: w.hazardZones.map(zone => {
        const copy = { ...zone };
        if (copy.type === 'tesla-coil') for (const field of ['attackCooldown', 'lastAttack', 'lastSelfDamage', 'velocityY', 'isGrounded'] as const) delete copy[field];
        return copy;
      }) });
      for (const elapsed of [0, 16, 100, 600, 1200]) {
        const w = world(); w.now += elapsed;
        w.hazardZones = [createHazardZone('tesla-coil', 1, 300, 420, 2, 30000, clock)];
        w.projectiles = (['rocket', 'homing-rocket'] as const).map((type, index) => ({
          ...createProjectile(type, index === 0 ? 1 : 2, 300 + elapsed / 4, 300, index === 0 ? 780 : -960, 0, 16, clock),
          flightTimeMs: elapsed,
        }));
        const seen = perceiveWorld(w, settings.parameters, live, w.now, liveRandom.next);
        const old = frozen.perceiveWorld(w, settings.parameters, original, w.now, oldRandom.next);
        expect(legacyWorld(seen.world)).toEqual(legacyWorld(old.world));
        expect(seen.world.hazardZones[0].attackCooldown).toBe(100);
        live = seen.memory;
        original = old.memory;
        expect(legacyWorld(live.last)).toEqual(legacyWorld(original.last));
        expect(live.traps).toEqual(original.traps);
        expect(liveRandom.state()).toBe(oldRandom.state());
      }
    }
  });
  it.each([175, 87.5, 5, 0])('reads coil health %s from its visible bar on a 175 HP scale', health => {
    const w = world();
    w.hazardZones = [{ ...createHazardZone('tesla-coil', 1, 300, 420, 2, 30000, clock), health }];
    const seen = perceiveWorld(w, estimated(), createPerceptionMemory()).world.hazardZones[0];
    expect(seen.maxHealth).toBe(175);
    expect(seen.health).toBe(Math.round(health / 175 * 100) / 100 * 175);
    expect(seen.attackRange).toBe(225);
  });

  it('keeps preset noise and information masks, and does not read hidden coil combat state', () => {
    const w = world();
    w.hazardZones = [createHazardZone('tesla-coil', 1, 300, 420, 2, 30000, clock)];
    const changed = structuredClone(w);
    Object.assign(changed.hazardZones[0], { damage: 999, attackCooldown: 1, lastAttack: 9999, lastSelfDamage: 9999, velocityY: 999 });
    for (const preset of ['easy', 'medium', 'hard'] as const) {
      const p = createAISettings(preset).parameters;
      const low = perceiveWorld(w, p, createPerceptionMemory(), w.now, () => 0);
      const high = perceiveWorld(w, p, createPerceptionMemory(), w.now, () => 1);
      expect(high.world.hazardZones[0].health).toBeGreaterThan(low.world.hazardZones[0].health!);
      expect(perceiveWorld(changed, p, createPerceptionMemory(), w.now, () => 0)).toEqual(low);
      p.information.hazards = false;
      expect(perceiveWorld(w, p, createPerceptionMemory()).world.hazardZones).toEqual([]);
    }
    const exact = perceiveWorld(w, createAISettings('perfect').parameters, createPerceptionMemory()).world.hazardZones[0];
    expect(exact.health).toBe(175);
    expect(exact.maxHealth).toBe(175);
  });

  it.each(['rocket', 'homing-rocket'] as const)('starts an observed %s at public speed 600 without reading hidden magnitude/age', type => {
    for (const sign of [-1, 1]) {
      const w = world();
      w.projectiles = [createProjectile(type, 1, 300, 300, sign * 600, 0, 16, clock)];
      const p = estimated();
      const a = perceiveWorld(w, p, createPerceptionMemory());
      expect(a.world.projectiles[0]).toMatchObject({ initialSpeed: 600, flightTimeMs: 0, velocityX: sign * 600 });
      const hidden = structuredClone(w);
      Object.assign(hidden.projectiles[0], { velocityX: sign * 960, initialSpeed: 123, flightTimeMs: 1199 });
      expect(perceiveWorld(hidden, p, createPerceptionMemory())).toEqual(a);
      // The visible displacement estimates average speed. This is not a claim of exact instantaneous age.
      const next = structuredClone(w);
      next.now += 50; next.projectiles[0].x += sign * 39;
      const b = perceiveWorld(next, p, a.memory).world.projectiles[0];
      expect(b.velocityX).toBe(sign * 780);
      expect(b.initialSpeed).toBe(600);
      expect(b.flightTimeMs).toBeCloseTo(600);
      next.projectiles[0].x = w.projectiles[0].x + sign * 60;
      expect(perceiveWorld(next, p, a.memory).world.projectiles[0].flightTimeMs).toBe(1200);
    }
  });
});
