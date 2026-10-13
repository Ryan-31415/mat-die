import { ARENA, PLAYER_SIZE, type Player } from '@/types/game';
import { getProjectileCollisionTime, type Projectile } from '@/types/projectile';
import { HOMING_ROCKET_SPEED, ROCKET_SPEED, ROCKET_WIDTH, ROCKET_HEIGHT, ROCKET_EXPLOSION_RADIUS, stepProjectileMotion, shieldFacesX, findProjectileCoilContact } from '@/types/combatPhysics';
import { AI_DT, type AIFrame } from './world';
import type { Point } from './navigation';
import { advanceCoilForecast } from './coil';

/** Simulate a prospective shot using only the caller's perceived opponent forecast. */
export function rocketeerShot(frame: AIFrame, player: Player, opponent: Player, targetAt: (time: number) => Point,
  homing: boolean, facing: number, allowLongRange = false, leadMs?: number): 'target' | 'vine' | 'coil' | null {
  if (opponent.isInvisible || (!allowLongRange && Math.hypot(opponent.x - player.x, opponent.y - player.y) > player.character!.attackRange)) return null;
  const speed = homing ? HOMING_ROCKET_SPEED : ROCKET_SPEED;
  const shot: Projectile = {
    id: 'predicted-rocket', type: homing ? 'homing-rocket' : 'rocket', ownerId: player.id,
    x: player.x + PLAYER_SIZE / 2 - ROCKET_WIDTH / 2, y: player.y + PLAYER_SIZE / 2 - ROCKET_HEIGHT / 2,
    width: ROCKET_WIDTH, height: ROCKET_HEIGHT, velocityX: facing * speed, velocityY: 0,
    damage: player.character!.attackDamage, initialSpeed: speed, flightTimeMs: 0,
    hasGravity: false, gravity: 0, isExplosive: true, explosionRadius: ROCKET_EXPLOSION_RADIUS,
    createdAt: frame.world.now, lifetime: 3000, isPoisonous: false, poisonDuration: 0,
    slowAmount: 0, slowDuration: 0, stunDuration: 0, knockback: 0,
    createsFirePool: false, firePoolDuration: 0, canBeDeflected: true,
    isReturning: false, damageAccumulated: 0, lastHitTime: {},
  };
  let coils = frame.world.hazardZones.filter(zone => zone.type === 'tesla-coil').map(zone => ({ ...zone }));
  const firstDt = Math.max(0.001, frame.world.deltaTime / 1000);
  const lead = (leadMs ?? 0) / 1000;
  if (lead > 0) {
    const at = Array.from(frame.times).findIndex(time => time >= lead + firstDt);
    coils = (frame.coilSnapshots.get(at) ?? []).map(coil => ({ ...coil }));
  }
  const permittedHorizon = leadMs === undefined ? shot.lifetime / 1000 : Math.min(shot.lifetime / 1000,
    (frame.forecasts?.opponent.horizonMs ?? shot.lifetime) / 1000 - lead,
    (frame.forecasts?.projectiles.horizonMs ?? shot.lifetime) / 1000 - lead,
    (frame.forecasts?.environment.horizonMs ?? shot.lifetime) / 1000 - lead);
  const horizon = leadMs === 0 ? Math.max(firstDt, permittedHorizon) : permittedHorizon;
  for (let time = firstDt; time <= horizon; time += AI_DT) {
    const dt = time === firstDt ? firstDt : AI_DT;
    const now = frame.world.now + (lead + time - firstDt) * 1000;
    const before = { x: shot.x, y: shot.y };
    const target = { ...targetAt(time + lead), isInvisible: opponent.isInvisible };
    stepProjectileMotion(shot, player, now, dt, target);
    const body = getProjectileCollisionTime(shot, before, { ...target, width: PLAYER_SIZE, height: PLAYER_SIZE });
    const sword = frame.hitboxes.reduce((first, h) => h.ownerId === opponent.id && h.canDeflectProjectiles &&
      now - h.createdAt <= h.duration
      ? Math.min(first, getProjectileCollisionTime(shot, before, h) ?? Infinity) : first, Infinity);
    const vineTime = frame.world.mapId === 'jungle' ? frame.vines.reduce((first, vine) => now - vine.createdAt <= vine.duration
      ? Math.min(first, getProjectileCollisionTime(shot, before, vine) ?? Infinity) : first, Infinity) : Infinity;
    const coil = findProjectileCoilContact(shot, coils, before);
    const coilTime = coil ? getProjectileCollisionTime(shot, before, coil) ?? Infinity : Infinity;
    // Resolve the earliest world contact against the same swept body/sword path as the engine.
    if (Math.min(vineTime, coilTime) < Math.min(body ?? Infinity, sword))
      return vineTime <= coilTime ? 'vine' : 'coil';
    if (sword < (body ?? Infinity)) return null;
    if (body !== null) {
      return shieldFacesX({ ...opponent, ...target }, before.x + shot.width / 2) ? null : 'target';
    }
    if (shot.x + shot.width < 0 || shot.x > ARENA.width || shot.y + shot.height < 0 || shot.y > ARENA.height) return null;
    if (coils.length) coils = advanceCoilForecast(coils, frame.world.platforms, now, dt * 1000);
  }
  return null;
}
