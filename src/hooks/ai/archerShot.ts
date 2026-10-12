import { ARENA, PLAYER_SIZE, type Player } from '@/types/game';
import { basicProjectileLaunches, getProjectileCollisionTime, projectileProperties, type Projectile } from '@/types/projectile';
import { findProjectileCoilContact, shieldFacesX, stepProjectileMotion } from '@/types/combatPhysics';
import { AI_DT, type AIFrame } from './world';
import type { Point } from './navigation';

export type ArcherShotOutcome = {
  kind: 'enemy' | 'surface' | 'vine' | 'coil' | 'sword' | 'shield' | 'miss' | 'uncertain';
  timeMs: number;
  damage: number;
};

/** One observed-state arrow, including its real width and swept first contact. */
export function archerShotOutcome(frame: AIFrame, owner: Player, opponent: Player,
  origin: Pick<Player, 'x' | 'y' | 'facingRight'>, leadMs: number,
  targetAt: (time: number) => Point, burst = false): ArcherShotOutcome {
  if ((opponent.x - origin.x) * (origin.facingRight ? 1 : -1) < -PLAYER_SIZE ||
      Math.abs(opponent.x - origin.x) > owner.character!.attackRange + PLAYER_SIZE / 2)
    return { kind: 'miss', timeMs: leadMs, damage: 0 };
  const launch = basicProjectileLaunches({ ...owner, facingRight: origin.facingRight }, owner.character!.attackDamage)[0];
  if (!launch) return { kind: 'uncertain', timeMs: leadMs, damage: 0 };
  const angle = Math.atan2(-80, 1000);
  const velocityX = burst ? (origin.facingRight ? 1 : -1) * Math.hypot(1000, 80) * Math.cos(angle) : launch.velocityX;
  const velocityY = burst ? Math.hypot(1000, 80) * Math.sin(angle) : launch.velocityY;
  const properties = projectileProperties(launch.type, velocityX, velocityY);
  const shot: Projectile = { ...properties, ...launch, velocityX, velocityY,
    id: 'prospective-archer-arrow', ownerId: owner.id,
    x: origin.x + PLAYER_SIZE / 2 - properties.width / 2,
    y: origin.y + PLAYER_SIZE / 2 - properties.height / 2,
    createdAt: frame.world.now + leadMs, lastHitTime: {} };
  const spawnX = shot.x;
  const firstDt = Math.max(0.001, frame.world.deltaTime / 1000);
  const horizon = Math.min(shot.lifetime / 1000,
    (frame.forecasts?.projectiles.horizonMs ?? shot.lifetime) / 1000 - leadMs / 1000,
    (frame.forecasts?.opponent.horizonMs ?? shot.lifetime) / 1000 - leadMs / 1000);
  if (horizon < firstDt) return { kind: 'uncertain', timeMs: leadMs, damage: 0 };
  let step = 1;
  for (let time = firstDt; time <= horizon + 1e-9; time += AI_DT) {
    const dt = time === firstDt ? firstDt : AI_DT;
    const previous = { x: shot.x, y: shot.y };
    stepProjectileMotion(shot, owner, frame.world.now + leadMs + time * 1000, dt);
    const timeMs = leadMs + time * 1000;
    const result = (kind: ArcherShotOutcome['kind']): ArcherShotOutcome => ({ kind, timeMs,
      damage: kind === 'enemy' ? launch.damage * (time * 1000 > 360 ? 1.15 : 1) : 0 });
    // The engine resolves a gravity projectile against platforms before fighters.
    if (frame.world.platforms.some(platform => getProjectileCollisionTime(shot, previous, platform) !== null)) return result('surface');
    const target = { ...opponent, ...targetAt(time + leadMs / 1000), width: PLAYER_SIZE, height: PLAYER_SIZE };
    const body = getProjectileCollisionTime(shot, previous, target) ?? Infinity;
    const now = frame.world.now + timeMs;
    const sword = shot.canBeDeflected ? frame.hitboxes.reduce((first, hitbox) =>
      hitbox.ownerId === opponent.id && hitbox.canDeflectProjectiles && now - hitbox.createdAt <= hitbox.duration
        ? Math.min(first, getProjectileCollisionTime(shot, previous, hitbox) ?? Infinity) : first, Infinity) : Infinity;
    if (frame.world.mapId === 'jungle' && frame.vines.some(vine => now - vine.createdAt <= vine.duration &&
      (getProjectileCollisionTime(shot, previous, vine) ?? Infinity) < Math.min(body, sword))) return result('vine');
    while (step < frame.steps && frame.times[step] < time + leadMs / 1000) step++;
    if (findProjectileCoilContact(shot, frame.coilSnapshots.get(step) ?? frame.zones.filter(zone => zone.type === 'tesla-coil'))) return result('coil');
    if (sword < body) return result('sword');
    if (body < Infinity) {
      if (target.isInvulnerable || target.isEvading || shieldFacesX(target, previous.x + shot.width / 2)) return result('shield');
      // Burst angles vary by five degrees. Credit only shots whose vertical
      // overlap survives both edges of that cone; never sample future RNG.
      const spread = burst ? Math.abs(shot.x - spawnX) * Math.tan(5 * Math.PI / 180) : 0;
      return result(shot.y + shot.height - spread >= target.y && shot.y + spread <= target.y + PLAYER_SIZE
        ? 'enemy' : 'uncertain');
    }
    if (shot.x + shot.width < 0 || shot.x > ARENA.width || shot.y + shot.height < 0 || shot.y > ARENA.height) return result('miss');
  }
  return { kind: 'uncertain', timeMs: leadMs + horizon * 1000, damage: 0 };
}
