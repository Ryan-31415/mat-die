import { ARENA, PLAYER_SIZE, type Player } from '@/types/game';
import { basicProjectileLaunches, checkProjectileCollision, getProjectileCollisionTime, projectileProperties, type Projectile } from '@/types/projectile';
import { findProjectileCoilContact, playerOverlapsRect, POOL_SIZE, shieldFacesX, stepCoilMotion, stepProjectileMotion } from '@/types/combatPhysics';
import { AI_DT, type AIFrame } from './world';
import type { Point } from './navigation';

export type FlaskOutcome = 'target' | 'pool' | 'vine' | null;

/** A prospective flask, including its useful landing pool. Never reads future inputs. */
export function scientistFlask(frame: AIFrame, launch: Player, opponent: Player, targetAt: (time: number) => Point,
  allowLongRange = false): FlaskOutcome {
  if (!allowLongRange && Math.abs(opponent.x - launch.x) > launch.character!.attackRange + PLAYER_SIZE / 2) return null;
  const spec = basicProjectileLaunches(launch, 0)[0];
  if (!spec || spec.type !== 'flask') return null;
  const properties = projectileProperties(spec.type);
  const shot: Projectile = { ...properties, ...spec, id: 'prospective-flask', ownerId: launch.id,
    x: launch.x + PLAYER_SIZE / 2 - properties.width / 2, y: launch.y + PLAYER_SIZE / 2 - properties.height / 2,
    createdAt: frame.world.now, lastHitTime: {} };
  const coils = frame.world.hazardZones.filter(zone => zone.type === 'tesla-coil').map(zone => ({ ...zone }));
  const horizon = Math.min(shot.lifetime / 1000, frame.forecasts?.projectiles.horizonMs !== undefined
    ? frame.forecasts.projectiles.horizonMs / 1000 : shot.lifetime / 1000);
  const firstDt = Math.max(0.001, frame.world.deltaTime / 1000);
  const usefulPool = (x: number, y: number, time: number) => {
    const size = POOL_SIZE['toxic-pool'], pool = { x, y, width: size, height: size };
    // Sample only within the existing opponent forecast, including the impact tick.
    const until = Math.min(horizon, time + shot.firePoolDuration / 1000, frame.forecasts?.opponent.horizonMs !== undefined
      ? frame.forecasts.opponent.horizonMs / 1000 : horizon);
    for (let at = time; at <= until + 1e-9; at += 0.1) if (playerOverlapsRect(targetAt(at), pool)) return true;
    return false;
  };
  let time = 0;
  while (time < Math.max(firstDt, horizon) - 1e-9) {
    const dt = time === 0 ? firstDt : Math.min(AI_DT, horizon - time);
    const before = { x: shot.x, y: shot.y };
    time += dt;
    stepProjectileMotion(shot, launch, frame.world.now + time * 1000, dt);
    // The engine handles surfaces before vines, coils and fighters.
    const surface = frame.world.platforms.find(platform => checkProjectileCollision(shot, before, platform));
    if (surface) {
      const size = POOL_SIZE['toxic-pool'];
      const x = Math.max(surface.x, Math.min(shot.x + shot.width / 2 - size / 2, surface.x + surface.width - size));
      return usefulPool(x, surface.y - size / 2, time) ? 'pool' : null;
    }
    const target = { ...targetAt(time), width: PLAYER_SIZE, height: PLAYER_SIZE };
    const body = getProjectileCollisionTime(shot, before, target) ?? Infinity;
    const sword = frame.hitboxes.reduce((first, hitbox) => hitbox.ownerId !== launch.id && hitbox.canDeflectProjectiles &&
      frame.world.now + time * 1000 - hitbox.createdAt <= hitbox.duration
      ? Math.min(first, getProjectileCollisionTime(shot, before, hitbox) ?? Infinity) : first, Infinity);
    if (frame.world.mapId === 'jungle' && frame.vines.some(vine => frame.world.now + time * 1000 - vine.createdAt <= vine.duration &&
      (getProjectileCollisionTime(shot, before, vine) ?? Infinity) < Math.min(body, sword))) return 'vine';
    // Coils intercept at the endpoint before their own fall/removal phase. This
    // intentionally does not value coil clearing or predict a destruction event.
    if (findProjectileCoilContact(shot, coils)) return null;
    if (sword < body) return null;
    if (body < Infinity) return shieldFacesX({ ...opponent, ...target }, before.x + shot.width / 2) ? null : 'target';
    if (shot.x + shot.width < 0 || shot.x > ARENA.width || shot.y + shot.height < 0 || shot.y > ARENA.height) {
      const size = POOL_SIZE['toxic-pool'];
      return usefulPool(shot.x + shot.width / 2 - size / 2, shot.y + shot.height / 2 - size / 2, time) ? 'pool' : null;
    }
    for (const coil of coils) stepCoilMotion(coil, frame.world.platforms, dt * 1000);
  }
  return null;
}
