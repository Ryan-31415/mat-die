import { ARENA, PLAYER_SIZE, type Player } from '@/types/game';
import { getProjectileCollisionTime, type Projectile } from '@/types/projectile';
import { HOMING_ROCKET_SPEED, ROCKET_SPEED, ROCKET_WIDTH, ROCKET_HEIGHT, stepProjectileMotion, shieldFacesX } from '@/types/combatPhysics';
import { AI_DT, type AIFrame } from './world';
import type { Point } from './navigation';

/** Simulate a prospective shot using only the caller's perceived opponent forecast. */
export function rocketeerShot(frame: AIFrame, player: Player, opponent: Player, targetAt: (time: number) => Point,
  homing: boolean, facing: number, allowLongRange = false): 'target' | 'vine' | null {
  if (opponent.isInvisible || (!allowLongRange && Math.hypot(opponent.x - player.x, opponent.y - player.y) > player.character!.attackRange)) return null;
  const speed = homing ? HOMING_ROCKET_SPEED : ROCKET_SPEED;
  const shot: Projectile = {
    id: 'predicted-rocket', type: homing ? 'homing-rocket' : 'rocket', ownerId: player.id,
    x: player.x + PLAYER_SIZE / 2 - ROCKET_WIDTH / 2, y: player.y + PLAYER_SIZE / 2 - ROCKET_HEIGHT / 2,
    width: ROCKET_WIDTH, height: ROCKET_HEIGHT, velocityX: facing * speed, velocityY: 0,
    damage: player.character!.attackDamage, initialSpeed: speed, flightTimeMs: 0,
    hasGravity: false, gravity: 0, isExplosive: true, explosionRadius: 50,
    createdAt: frame.world.now, lifetime: 3000, isPoisonous: false, poisonDuration: 0,
    slowAmount: 0, slowDuration: 0, stunDuration: 0, knockback: 0,
    createsFirePool: false, firePoolDuration: 0, canBeDeflected: true,
    isReturning: false, damageAccumulated: 0, lastHitTime: {},
  };
  for (let time = AI_DT; time <= shot.lifetime / 1000; time += AI_DT) {
    const before = { x: shot.x, y: shot.y };
    const target = { ...targetAt(time), isInvisible: opponent.isInvisible };
    stepProjectileMotion(shot, player, frame.world.now + time * 1000, AI_DT, target);
    const body = getProjectileCollisionTime(shot, before, { ...target, width: PLAYER_SIZE, height: PLAYER_SIZE });
    const until = body ?? Infinity;
    if (frame.hitboxes.some(h => h.ownerId === opponent.id && h.canDeflectProjectiles &&
      frame.world.now + time * 1000 - h.createdAt <= h.duration &&
      (getProjectileCollisionTime(shot, before, h) ?? Infinity) < until)) return null;
    if (frame.vines.some(v => frame.world.now + time * 1000 - v.createdAt <= v.duration &&
      (getProjectileCollisionTime(shot, before, v) ?? Infinity) < until)) return 'vine';
    if (body !== null) {
      return shieldFacesX({ ...opponent, ...target }, before.x + shot.width / 2) ? null : 'target';
    }
    if (shot.x + shot.width < 0 || shot.x > ARENA.width || shot.y + shot.height < 0 || shot.y > ARENA.height) return null;
  }
  return null;
}
