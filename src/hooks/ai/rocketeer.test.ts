import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer, type CharacterType, type Player } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { MAPS } from '@/types/map';
import { createAttackHitbox, createHazardZone, createProjectile } from '@/types/projectile';
import { advanceProjectile } from '@/types/combatPhysics';
import { chooseCombat } from './combat';
import { decideAI } from './controller';
import { createOpponentModel } from './learning';
import { hazardRisk, selectGoal } from './navigation';
import { matchupTactics } from './matchup';
import { createPerceptionMemory, perceiveWorld } from './perception';
import { rocketeerShot } from './rocketeer';
import { prepareAIFrame, type AIWorld } from './world';

const now = 10000;
const player = (id: 1 | 2, character: CharacterType, props: Partial<Player> = {}): Player => ({
  ...createInitialPlayer(id, CHARACTERS[character]), x: id === 1 ? 180 : 480, y: 440,
  mana: 60, lastGroundedTime: now, ...props,
});
function world(ai: Player, enemy: Player, overrides: Partial<AIWorld> = {}): AIWorld {
  return { players: ai.id === 1 ? [ai, enemy] : [enemy, ai], projectiles: [], hazardZones: [], attackHitboxes: [],
    platforms: MAPS.wasteland.platforms, mapId: 'wasteland', now, deltaTime: 1000 / 60,
    isOvertime: false, roundTimeRemaining: 60, sandstormActive: false, sandstormDirection: 'right',
    sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [], ...overrides };
}
function combat(ai: Player, enemy: Player, overrides: Partial<AIWorld> = {}, moving = false) {
  const frame = prepareAIFrame(world(ai, enemy, overrides));
  return chooseCombat(frame, ai, enemy, createOpponentModel(), { direction: 0, jump: false, drop: false },
    true, false, 'pressure', time => ({ x: enemy.x, y: enemy.y - (moving ? Math.sin(time * 3) * 90 : 0) }));
}

describe('Rocketeer AI operation and counters', () => {
  it.each([1, 2] as const)('P%i uses both shots and prioritizes napalm when mana reaches 100', id => {
    const ai = player(id, 'rocketeer'), enemy = player(id === 1 ? 2 : 1, 'gladiator');
    expect(combat(ai, enemy)).toMatchObject({ attack: true, skill: true, ultimate: false });
    expect(combat({ ...ai, mana: 100 }, enemy)).toMatchObject({ attack: true, skill: false, ultimate: true });
    expect(combat({ ...ai, mana: 100, napalmDuration: 5000 }, enemy)).toMatchObject({ ultimate: false, skill: true });
  });
  it('prefers 300px spacing and increases it when health is low', () => {
    const ai = player(2, 'rocketeer'), enemy = player(1, 'gladiator');
    const frame = prepareAIFrame(world(ai, enemy));
    expect(selectGoal(ai, enemy, frame).preferred).toBe(300);
    expect(selectGoal({ ...ai, health: 20 }, enemy, frame).preferred).toBeGreaterThan(300);
  });
  it('uses homing for height differences that cause a straight rocket to miss', () => {
    const ai = player(2, 'rocketeer'), enemy = player(1, 'mage', { y: 330 });
    expect(combat(ai, enemy)).toMatchObject({ attack: false, skill: true });
  });
  it('accounts for flight lifetime and avoids invisible targets', () => {
    const ai = player(2, 'rocketeer'), enemy = player(1, 'ninja', { isInvisible: true });
    expect(combat(ai, enemy)).toMatchObject({ attack: false, skill: false, ultimate: false });
    const far = { ...enemy, isInvisible: false, x: -4000 };
    const frame = prepareAIFrame(world(ai, far));
    expect(rocketeerShot(frame, ai, far, () => far, false, -1, true)).toBeNull();
  });
  it('does not fire into a frontal shield or active katana', () => {
    const ai = player(2, 'rocketeer'), shield = player(1, 'gladiator', { isShielding: true, facingRight: true });
    expect(combat(ai, shield)).toMatchObject({ attack: false, skill: false });
    const ninja = player(1, 'ninja');
    const sword = { ...createAttackHitbox(1, ninja.x + 40, ninja.y - 10, 100, 60, 16, 3000, true), createdAt: now };
    expect(combat(ai, ninja, { attackHitboxes: [sword] })).toMatchObject({ attack: false, skill: false });
  });
  it('uses ordinary rockets to remove a vine rather than wasting homing mana', () => {
    const ai = player(2, 'rocketeer'), enemy = player(1, 'gladiator');
    const vine = { id: 'vine', x: 320, y: 350, width: 35, height: 140, createdAt: now, duration: 5000, hp: 1 };
    expect(combat(ai, enemy, { mapId: 'jungle', vineShields: [vine] })).toMatchObject({ attack: true, skill: false });
  });
  it('shared trajectories match the real acceleration and homing step', () => {
    const ai = player(2, 'mage'), enemy = player(1, 'rocketeer');
    const shot = { ...createProjectile('homing-rocket', 1, 250, 390, 660, 0, 16), createdAt: now };
    const frame = prepareAIFrame(world(ai, enemy, { projectiles: [shot] }));
    const stepped = advanceProjectile(shot, enemy, now + 1000 / 60, 1 / 60, ai);
    expect(frame.paths[0].x[1]).toBeCloseTo(stepped.x);
    expect(frame.paths[0].y[1]).toBeCloseTo(stepped.y);
    expect(shot.flightTimeMs).toBe(0);
  });
  it('recalculates guided threats for movement even when the shared path misses', () => {
    const ai = player(2, 'mage', { mana: 0, x: 480 }), enemy = player(1, 'rocketeer');
    const shot = { ...createProjectile('homing-rocket', 1, 390, 440, 660, 0, 16), createdAt: now };
    const frame = prepareAIFrame(world(ai, enemy, { projectiles: [shot] }));
    frame.paths[0].x.fill(0); frame.paths[0].y.fill(0); frame.paths[0].endStep = 0;
    const decision = decideAI(frame, ai);
    const idle = decideAI(prepareAIFrame(world(ai, enemy)), ai);
    expect(decision.risk).toBeGreaterThan(idle.risk);
    expect(shot.flightTimeMs).toBe(0);
  });
  it('gladiator faces an incoming rocket arriving from behind', () => {
    const ai = player(2, 'gladiator', { x: 480, facingRight: false }), enemy = player(1, 'rocketeer');
    const shot = { ...createProjectile('rocket', 1, 555, 460, -550, 0, 16), createdAt: now };
    const decision = decideAI(prepareAIFrame(world(ai, enemy, { projectiles: [shot] })), ai);
    expect(decision.keys.enter).toBe(true);
    expect(decision.keys.arrowRight).toBe(true);
  });
  it('ninja times a katana reflection against accelerating rockets', () => {
    const ai = player(2, 'ninja', { x: 480, facingRight: false }), enemy = player(1, 'rocketeer');
    const shot = { ...createProjectile('rocket', 1, 410, 460, 550, 0, 16), createdAt: now };
    const decision = decideAI(prepareAIFrame(world(ai, enemy, { projectiles: [shot] })), ai);
    expect(decision.keys.shift).toBe(true);
  });
  it('escapes napalm and treats overlapping pools as greater danger', () => {
    const ai = player(2, 'mage'), enemy = player(1, 'rocketeer');
    const pool = { ...createHazardZone('fire-pool', 1, 400, 370, 1.6, 4000), createdAt: now, isNapalm: true };
    expect(hazardRisk(ai, pool)).toBeGreaterThan(hazardRisk(ai, { ...pool, isNapalm: false }));
    const single = decideAI(prepareAIFrame(world(ai, enemy, { hazardZones: [pool] })), ai);
    const double = decideAI(prepareAIFrame(world(ai, enemy, { hazardZones: [pool, { ...pool, id: 'pool2' }] })), ai);
    expect(single.keys.arrowLeft || single.keys.arrowRight || single.keys.arrowUp).toBe(true);
    expect(double.risk).toBeGreaterThan(single.risk);
  });
  it('pressures observed recovery gaps and kites active napalm', () => {
    const enemy = player(1, 'rocketeer', { attackCooldownRemaining: 1000, skillCooldownRemaining: 2000 });
    const melee = player(2, 'ninja'), ranged = player(2, 'mage');
    expect(matchupTactics(melee, enemy, prepareAIFrame(world(melee, enemy)), 70, 'approach').strategy).toBe('pressure');
    const active = { ...enemy, napalmDuration: 5000 };
    expect(matchupTactics(ranged, active, prepareAIFrame(world(ranged, active)), 270, 'pressure')).toMatchObject({ preferred: 360, strategy: 'kite' });
  });
  it('keeps new fields behind the information boundary and estimates visible rocket properties', () => {
    const ai = player(2, 'rocketeer'), enemy = player(1, 'rocketeer', { napalmDuration: 4321 });
    const shot = { ...createProjectile('homing-rocket', 1, 300, 400, 900, 0, 99), createdAt: 1,
      initialSpeed: 660, flightTimeMs: 789, isNapalm: true, firePoolDamage: 99, burnDamage: 88 };
    const settings = createAISettings('medium');
    settings.parameters.information.statuses = false;
    settings.parameters.information.statusTimers = false;
    const perceived = perceiveWorld(world(ai, enemy, { projectiles: [shot] }), settings.parameters, createPerceptionMemory(), now, () => 0.5).world;
    expect(perceived.players[0].napalmDuration).toBe(0);
    expect(perceived.projectiles[0].isNapalm).toBe(true);
    expect(perceived.projectiles[0].flightTimeMs).not.toBe(789);
    expect(perceived.projectiles[0].firePoolDamage).not.toBe(99);
    settings.parameters.information.projectiles = false;
    expect(perceiveWorld(world(ai, enemy, { projectiles: [shot] }), settings.parameters, createPerceptionMemory()).world.projectiles).toHaveLength(0);
  });
});
