import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer, type Player } from '@/types/game';
import { MAPS, type MapId } from '@/types/map';
import { createHazardZone, type AttackHitbox } from '@/types/projectile';
import { archerShotOutcome } from './archerShot';
import { prepareAIFrame, type AIWorld } from './world';
import { decideAI } from './controller';

const now = 10000;
function scene(mapId: MapId = 'wasteland', enemyX = 520, enemyY = 440) {
  const archer = { ...createInitialPlayer(2, CHARACTERS.archer), x: 200, y: 440, facingRight: true,
    lastGroundedTime: now };
  const enemy = { ...createInitialPlayer(1, CHARACTERS.mage), x: enemyX, y: enemyY,
    facingRight: true, lastGroundedTime: now };
  const world: AIWorld = { players: [enemy, archer], now, deltaTime: 1000 / 60, mapId,
    platforms: MAPS[mapId].platforms, projectiles: [], hazardZones: [], attackHitboxes: [],
    isOvertime: false, roundTimeRemaining: 60, sandstormActive: false,
    sandstormDirection: 'right', sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
  const shot = (next: AIWorld = world, owner: Player = archer, target: Player = enemy) =>
    archerShotOutcome(prepareAIFrame(next), owner, target, owner, 0, () => target);
  return { archer, enemy, world, shot };
}

describe('Archer shot opportunity from observed geometry', () => {
  it('finds a direct hit with the real 56px arrow and the 360ms passive boundary', () => {
    const near = scene('wasteland', 400), far = scene('wasteland', 700);
    const nearShot = near.shot(), farShot = far.shot();
    expect(nearShot.kind).toBe('enemy');
    expect(nearShot.timeMs).toBeLessThan(360);
    expect(nearShot.damage).toBe(CHARACTERS.archer.attackDamage);
    expect(farShot.kind).toBe('enemy');
    expect(farShot.timeMs).toBeGreaterThan(360);
    expect(farShot.damage).toBeCloseTo(CHARACTERS.archer.attackDamage * 1.15);
  });

  it('requires the arrow to face the enemy', () => {
    const s = scene();
    const backward = { ...s.archer, facingRight: false };
    expect(s.shot(s.world, backward).kind).not.toBe('enemy');
  });

  it('separates a vine from an enemy hit and keeps the free clearing attack', () => {
    const s = scene('jungle');
    const vine = { id: 'blocking-vine', x: 350, y: 380, width: 48, height: 100,
      createdAt: now, duration: 12000, hp: 1 };
    const world = { ...s.world, vineShields: [vine] };
    expect(s.shot(world).kind).toBe('vine');
    const decision = decideAI(prepareAIFrame(world), s.archer);
    expect(decision.keys.shift).toBe(true);
    expect(decision.keys.backslash).toBe(false);
  });

  it('does not credit an arrow absorbed by a platform, coil, sword, or shield', () => {
    const s = scene();
    const raised = { ...s.world, platforms: [...s.world.platforms,
      { id: 'blocking-platform', x: 350, y: 430, width: 70, height: 30, type: 'solid' as const }] };
    expect(s.shot(raised).kind).toBe('surface');
    const coil = createHazardZone('tesla-coil', 1, 370, 460, 10, 10000);
    coil.createdAt = now;
    expect(s.shot({ ...s.world, hazardZones: [coil] }).kind).toBe('coil');
    const sword: AttackHitbox = { id: 'sword', ownerId: 1, x: 350, y: 420, width: 60,
      height: 80, damage: 10, duration: 300, createdAt: now, knockback: 0, canDeflectProjectiles: true };
    expect(s.shot({ ...s.world, attackHitboxes: [sword] }).kind).toBe('sword');
    const shielded = { ...s.enemy, isShielding: true, facingRight: false };
    expect(s.shot({ ...s.world, players: [shielded, s.archer] }, s.archer, shielded).kind).toBe('shield');
  });

  it('does not assume a random burst angle will connect', () => {
    const s = scene('wasteland', 650);
    const nominal = archerShotOutcome(prepareAIFrame(s.world), s.archer, s.enemy,
      s.archer, 0, () => s.enemy, true);
    expect(nominal.kind).toBe('uncertain');
  });
});
