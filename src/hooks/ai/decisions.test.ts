import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer, type CharacterType, type Player } from '@/types/game';
import { MAPS, type MapId } from '@/types/map';
import { createHazardZone, createProjectile } from '@/types/projectile';
import { advanceProjectile } from '@/types/combatPhysics';
import { decideAI } from './controller';
import { prepareAIFrame, type AIWorld } from './world';
import { createAIMemory } from './state';
import { createOpponentModel, observeOpponent } from './learning';

const now = 10000;
const p = (id: 1 | 2, character: CharacterType, props: Partial<Player> = {}): Player => ({
  ...createInitialPlayer(id, CHARACTERS[character]), x: id === 1 ? 200 : 500, y: 440, mana: 60, lastGroundedTime: now, ...props,
});
function world(ai: Player, enemy = p(1, 'mage'), mapId: MapId = 'wasteland', overrides: Partial<AIWorld> = {}): AIWorld {
  return { players: [enemy, ai], mapId, platforms: MAPS[mapId].platforms, now, deltaTime: 1000 / 60,
    isOvertime: false, roundTimeRemaining: 60, projectiles: [], hazardZones: [], attackHitboxes: [],
    sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [], ...overrides };
}

describe('environment and character tactics', () => {
  it.each(['mage', 'hacker', 'ice-mage'] as const)('%s fires beyond configured range when approaching crosses a hazard', character => {
    const ai = p(2, character, { x: 740, mana: 0 }), enemy = p(1, 'gladiator', { x: 40 });
    const zone = { ...createHazardZone('toxic-pool', 1, 350, 0, 10, 5000), createdAt: now, width: 300, height: 500 };
    const decision = decideAI(prepareAIFrame(world(ai, enemy, 'wasteland', { hazardZones: [zone] })), ai);
    expect(Math.abs(ai.x - enemy.x)).toBeGreaterThan(ai.character!.attackRange);
    expect(decision.memory.rangedHold).toBe(true);
    expect(decision.keys.arrowLeft).toBe(false);
    expect(decision.keys.shift).toBe(true);
    expect(decideAI(prepareAIFrame(world(ai, enemy)), ai).memory.rangedHold).toBe(false);
  });
  it('still respects the hunter projectile lifetime when a hazard prevents approaching', () => {
    const ai = p(2, 'hunter', { x: 740, mana: 0 }), enemy = p(1, 'gladiator', { x: 40 });
    const zone = { ...createHazardZone('toxic-pool', 1, 350, 0, 10, 5000), createdAt: now, width: 300, height: 500 };
    const result = decideAI(prepareAIFrame(world(ai, enemy, 'wasteland', { hazardZones: [zone] })), ai);
    expect(result.memory.rangedHold).toBe(true);
    expect(result.keys.shift).toBe(false);
  });
  it('chooses a reachable healing zone with missing health, and stops after expiry', () => {
    const ai = p(2, 'mage', { x: 420, health: 20 });
    const soul = { id: 'soul', x: 560, y: 350, width: 200, height: 200, createdAt: now, duration: 6000 };
    const w = world(ai, p(1, 'mage'), 'graveyard', { soulZones: [soul] });
    const decision = decideAI(prepareAIFrame(w), ai);
    expect(decision.memory.strategy).toBe('recover'); expect(decision.keys.arrowRight).toBe(true);
    expect(decideAI(prepareAIFrame({ ...w, now: now + 6001 }), ai).memory.strategy).not.toBe('recover');
  });
  it('moves into its own cyber space to use the boosted swap missile', () => {
    const ai = p(2, 'hacker', { x: 600 });
    const zone = { ...createHazardZone('packet-block-zone', 2, 340, 320, 0, 5000), createdAt: now };
    const decision = decideAI(prepareAIFrame(world(ai, p(1, 'mage'), 'wasteland', { hazardZones: [zone] })), ai);
    expect(decision.memory.goal!.x).toBeGreaterThanOrEqual(zone.x);
    expect(decision.memory.goal!.x).toBeLessThan(zone.x + zone.width);
    expect(decision.keys.arrowLeft).toBe(true);
  });
  it('does not swap itself into lava even when the boosted missile could hit', () => {
    const ai = p(2, 'hacker', { x: 580, y: 420 });
    const zone = { ...createHazardZone('packet-block-zone', 2, 500, 300, 0, 5000), createdAt: now };
    const decision = decideAI(prepareAIFrame(world(ai, p(1, 'mage', { x: 320 }), 'volcano', { hazardZones: [zone] })), ai);
    expect(decision.keys.shift).toBe(false);
  });
  it('breaks a blocking vine with a basic arrow instead of wasting an ultimate', () => {
    const ai = p(2, 'archer', { x: 580, y: 160, mana: 100 });
    const enemy = p(1, 'mage', { x: 180, y: 160 });
    const vine = { id: 'vine', x: 350, y: 0, width: 48, height: 340, hp: 1, createdAt: now, duration: 12000 };
    const w = world(ai, enemy, 'jungle', { vineShields: [vine] });
    const decision = decideAI(prepareAIFrame(w), ai);
    expect(decision.keys.shift).toBe(true); expect(decision.keys.backslash).toBe(false);
    expect(prepareAIFrame({ ...w, vineShields: [{ ...vine, destroyedAt: now }] }).vines).toHaveLength(0);
  });
  it('treats a vine as single-use cover for successive projectiles', () => {
    const ai = p(2, 'mage', { y: 260 });
    const shots = [220, 150].map((x, i) => ({ ...createProjectile('arrow', 1, x, 280, 1000, 0, 10), id: 'arrow' + i, createdAt: now }));
    const frame = prepareAIFrame(world(ai, p(1, 'mage'), 'jungle', { projectiles: shots,
      vineShields: [{ id: 'vine', x: 350, y: 0, width: 48, height: 340, hp: 1, createdAt: now, duration: 12000 }] }));
    expect(frame.paths[0].endStep).toBeLessThan(frame.paths[1].endStep);
  });
  it('uses the shorter mage fall time to hit an elevated moving opponent', () => {
    const ai = p(2, 'mage'); const enemy = p(1, 'mage'); let model = createOpponentModel();
    for (let i = 0; i < 40; i++) { enemy.x = 100 + i * 2; model = observeOpponent(model, enemy, ai, now - 780 + i * 20); }
    const low = decideAI(prepareAIFrame(world(ai, enemy)), ai, model);
    const high = decideAI(prepareAIFrame(world(ai, { ...enemy, y: 140 }, 'default')), ai, model);
    expect(low.keys.enter).toBe(false); expect(high.keys.enter).toBe(true);
  });
  it('parries a reflectable projectile without an enemy in melee range', () => {
    const ai = p(2, 'ninja', { mana: 0, x: 500 });
    const shot = { ...createProjectile('arrow', 1, 390, 460, 1000, 0, 10), createdAt: now };
    const decision = decideAI(prepareAIFrame(world(ai, p(1, 'mage'), 'wasteland', { projectiles: [shot] })), ai);
    expect(decision.keys.shift).toBe(true);
    const nonReflectable = decideAI(prepareAIFrame(world(ai, p(1, 'mage'), 'wasteland', { projectiles: [{ ...shot, canBeDeflected: false }] })), ai);
    expect(nonReflectable.keys.shift).toBe(false);
  });
  it('transitions a bat to returning at a boundary even before its age threshold', () => {
    const bat = { ...createProjectile('bat', 2, 740, 350, 550, 0, 10), createdAt: now - 100 };
    const returned = advanceProjectile(bat, { x: 400, y: 310 }, now, 1 / 60);
    expect(returned.returnPhase).toBe('returning'); expect(returned.velocityX).toBeLessThan(0);
    const continued = advanceProjectile(returned, { x: 100, y: 100 }, now + 17, 1 / 60);
    expect(continued.velocityX).toBe(returned.velocityX);
    expect(continued.velocityY).toBe(returned.velocityY);
  });
  it('intercepts its returning bat rather than walking away from the heal', () => {
    const ai = p(2, 'reaper', { x: 480, health: 50 });
    const bat = { ...createProjectile('bat', 2, 650, 360, -650, 0, 10), createdAt: now - 1400, returnPhase: 'returning' as const, damageAccumulated: 30, hasHitReturn: true };
    const decision = decideAI(prepareAIFrame(world(ai, p(1, 'mage', { x: 100 }), 'wasteland', { projectiles: [bat] })), ai);
    expect(decision.memory.goal!.x).toBeGreaterThan(400);
    expect(decision.keys.enter).toBe(false);
  });
  it('plans to land before flight invulnerability expires over lava', () => {
    const ai = p(2, 'reaper', { x: 680, y: 100, isFlying: true, isInvulnerable: true, invulnerableDuration: 650 });
    const decision = decideAI(prepareAIFrame(world(ai, p(1, 'mage', { y: 40 }), 'volcano')), ai);
    expect(decision.memory.goal!.y).toBe(320);
    expect(decision.keys.arrowDown).toBe(true);
  });
  it('uses absolute health, rather than percentage, for the timeout strategy', () => {
    const ai = p(2, 'gladiator', { health: 80 }); const enemy = p(1, 'mage', { health: 70 });
    const decision = decideAI(prepareAIFrame(world(ai, enemy, 'wasteland', { roundTimeRemaining: 8 })), ai);
    expect(decision.memory.strategy).toBe('kite');
  });
  it('invalidates stale tactical goals at an environmental change and after 200ms', () => {
    const ai = p(2, 'mage'); const w = world(ai);
    const memory = decideAI(prepareAIFrame(w), ai).memory;
    expect(decideAI(prepareAIFrame({ ...w, now: now + 100 }), ai, undefined, memory).memory.goalUntil).toBe(memory.goalUntil);
    expect(decideAI(prepareAIFrame({ ...w, now: now + 210 }), ai, undefined, memory).memory.goalUntil).toBeGreaterThan(memory.goalUntil);
    const changed = decideAI(prepareAIFrame({ ...w, now: now + 100, sandstormActive: true, sandstormTimer: 3000 }), ai, undefined, memory);
    expect(changed.memory.goalSignature).not.toBe(memory.goalSignature);
  });
  it('escapes repeated failed jumps but does not mistake root or a tactical wait for being stuck', () => {
    const ai = p(2, 'gladiator', { x: 740 });
    const frame = prepareAIFrame(world(ai, p(1, 'mage', { x: 350, y: 210 }), 'default'));
    const memory = { ...createAIMemory(ai, now), failedJumps: 2 };
    const result = decideAI(frame, ai, undefined, memory);
    expect(result.memory.strategy).toBe('escape'); expect(result.memory.escapeUntil).toBeGreaterThanOrEqual(now + 500);
    expect(decideAI(frame, { ...ai, rootDuration: 2000 }, undefined, memory).memory.strategy).not.toBe('escape');
  });
  it('does not mutate a shared frame, model or memory', () => {
    const ai = p(2, 'mage'), frame = prepareAIFrame(world(ai)), model = createOpponentModel(), memory = createAIMemory(ai, now);
    const before = JSON.stringify([frame, model, memory]);
    expect(decideAI(frame, ai, model, memory)).toEqual(decideAI(frame, ai, model, memory));
    expect(JSON.stringify([frame, model, memory])).toBe(before);
  });
  it('interrupts an escape commitment when lightning threatens its destination', () => {
    const ai = p(2, 'mage');
    const memory = { ...createAIMemory(ai, now), escapeUntil: now + 600, goal: { x: 450, y: 440 } };
    const frame = prepareAIFrame(world(ai, p(1, 'mage'), 'graveyard', {
      lightningStrikes: [{ x: 470, warningStart: now - 1300, struck: false }],
    }));
    const result = decideAI(frame, ai, undefined, memory);
    expect(result.memory.escapeUntil).toBeLessThanOrEqual(now);
    expect(result.memory.strategy).not.toBe('escape');
  });
});
