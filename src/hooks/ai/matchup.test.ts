import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer, type CharacterType } from '@/types/game';
import { MAPS } from '@/types/map';
import { createAttackHitbox } from '@/types/projectile';
import { decideAI } from './controller';
import { prepareAIFrame, type AIWorld } from './world';
import { matchupTactics, opponentLineRisk } from './matchup';
import { chooseCombat } from './combat';
import { createOpponentModel } from './learning';

const now = 10000;
function scene(character: CharacterType, enemy: CharacterType): AIWorld {
  return { players: [{ ...createInitialPlayer(1, CHARACTERS[enemy]), x: 350, y: 440 }, { ...createInitialPlayer(2, CHARACTERS[character]), x: 500, y: 440, mana: 0 }],
    mapId: 'wasteland', platforms: MAPS.wasteland.platforms, now, deltaTime: 1000 / 60, isOvertime: false,
    roundTimeRemaining: 60, projectiles: [], attackHitboxes: [], hazardZones: [], lightningStrikes: [], soulZones: [], vineShields: [],
    sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0 };
}
describe('opponent ability counters', () => {
  it.each(Object.keys(CHARACTERS) as CharacterType[])('%s attempts a safe route behind a frontal shield', character => {
    const world = scene(character, 'gladiator');
    Object.assign(world.players[0], { isShielding: true, facingRight: true });
    const result = decideAI(prepareAIFrame(world), world.players[1]);
    expect(result.memory.strategy).toBe('flank');
    expect(result.memory.goal!.x).toBeLessThan(world.players[0].x);
    expect(result.keys.arrowLeft).toBe(true);
    expect(result.keys.shift).toBe(false);
  });
  it('replans when the defender turns, and refuses a flank that lands in lava', () => {
    const world = scene('mage', 'gladiator');
    Object.assign(world.players[0], { isShielding: true, facingRight: true });
    const previous = decideAI(prepareAIFrame(world), world.players[1]).memory;
    world.players[0].facingRight = false;
    expect(decideAI(prepareAIFrame(world), world.players[1], undefined, previous).memory.strategy).not.toBe('flank');
    Object.assign(world.players[0], { x: 100, y: 320, facingRight: true });
    world.mapId = 'volcano'; world.platforms = MAPS.volcano.platforms;
    expect(decideAI(prepareAIFrame(world), world.players[1]).memory.strategy).not.toBe('flank');
  });
  it('holds a reflectable shot for an active enemy sword, then fires after it expires', () => {
    const world = scene('mage', 'ninja'); world.players[0].x = 440;
    world.attackHitboxes = [{ ...createAttackHitbox(1, 440, 430, 135, 44, 10, 120, true), createdAt: now }];
    const canAttack = () => chooseCombat(prepareAIFrame(world), world.players[1], world.players[0], createOpponentModel(),
      { direction: 0, jump: false, drop: false }, true, false, 'pressure', () => world.players[0]).attack;
    expect(canAttack()).toBe(false);
    world.now += 121;
    expect(canAttack()).toBe(true);
  });
  it('pressures a charging scientist, spaces away from a focused hunter, and evades flying reaper contact', () => {
    const world = scene('mage', 'scientist'), [enemy, ai] = world.players;
    enemy.isChargingSkill = true;
    expect(matchupTactics(ai, enemy, prepareAIFrame(world), 270, 'approach').preferred).toBe(170);
    enemy.character = CHARACTERS.hunter; enemy.hunterFocusedDuration = 3000;
    expect(matchupTactics(ai, enemy, prepareAIFrame(world), 270, 'approach')).toMatchObject({ preferred: 375, strategy: 'kite' });
    enemy.character = CHARACTERS.reaper; enemy.isFlying = true; enemy.invulnerableDuration = 1500;
    expect(matchupTactics(ai, enemy, prepareAIFrame(world), 270, 'approach').strategy).toBe('kite');
    enemy.isFlying = false;
    expect(matchupTactics(ai, enemy, prepareAIFrame(world), 270, 'approach').strategy).toBe('approach');
  });
  it('avoids the burst direction and ice freeze buildup instead of treating every enemy identically', () => {
    const world = scene('mage', 'archer'), [enemy, ai] = world.players;
    enemy.archerBurstRemaining = 8; enemy.archerBurstFacingRight = true; enemy.facingRight = false;
    expect(opponentLineRisk(enemy, { x: 550, y: 440 }, enemy, 0.1, now)).toBeGreaterThan(0);
    expect(opponentLineRisk(enemy, { x: 200, y: 440 }, enemy, 0.1, now)).toBe(0);
    enemy.character = CHARACTERS['ice-mage']; ai.freezeGauge = 3;
    expect(matchupTactics(ai, enemy, prepareAIFrame(world), 270, 'approach')).toMatchObject({ preferred: 350, strategy: 'kite' });
  });
});
