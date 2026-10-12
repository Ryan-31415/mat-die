import { ARENA, PLAYER_SIZE, type Player } from '@/types/game';
import { checkProjectileCollision, getProjectileCollisionTime, projectileProperties, type Projectile, type ProjectileSpawn } from '@/types/projectile';
import { findProjectileCoilContact, shieldFacesX, stepProjectileMotion } from '@/types/combatPhysics';
import type { AIFrame } from './world';
import type { Point } from './navigation';

export type DirectShotOutcome = {
  kind: 'enemy' | 'surface' | 'vine' | 'sword' | 'shield' | 'miss' | 'uncertain'; step: number; timeMs: number;
} | {
  kind: 'coil'; step: number; timeMs: number; coilId: string; rawDamage: number;
  marginalDamage: number | undefined; remainingHealth: number | undefined;
};

/** Single-contact net/orb forecast. Returning, penetrating and pooled shots
 * need their own outcome policy; do not label their first contact a full result.
 */
export function directShotOutcome(frame: AIFrame, owner: Player, opponent: Player,
  spawn: ProjectileSpawn & Partial<Pick<Projectile, 'width' | 'height'>>,
  targetAt: (time: number) => Point): DirectShotOutcome {
  if (spawn.type !== 'net' && spawn.type !== 'electric-orb') return { kind: 'uncertain', step: 0, timeMs: 0 };
  const properties = projectileProperties(spawn.type, spawn.velocityX, spawn.velocityY);
  const width = spawn.width ?? properties.width, height = spawn.height ?? properties.height;
  const shot: Projectile = { ...properties, ...spawn, width, height, id: 'prospective-direct-shot', ownerId: owner.id,
    x: spawn.x - width / 2, y: spawn.y - height / 2, createdAt: frame.world.now, lastHitTime: {} };
  const firstDt = frame.times[1];
  for (let step = 1; step <= frame.steps; step++) {
    const elapsed = frame.times[step], dt = elapsed - frame.times[step - 1];
    const timeMs = Math.max(0, elapsed - firstDt) * 1000, now = frame.world.now + timeMs;
    const outcome = { step, timeMs };
    if (step > 1 && frame.forecasts && elapsed * 1000 > frame.forecasts.projectiles.horizonMs + 1e-6)
      return { kind: 'uncertain', ...outcome };
    if (timeMs > shot.lifetime) return { kind: 'miss', ...outcome };
    const before = { x: shot.x, y: shot.y };
    stepProjectileMotion(shot, owner, now, dt);
    if (shot.hasGravity && frame.world.platforms.some(platform => checkProjectileCollision(shot, before, platform)))
      return { kind: 'surface', ...outcome };
    const target = { ...opponent, ...targetAt(elapsed), width: PLAYER_SIZE, height: PLAYER_SIZE };
    const body = getProjectileCollisionTime(shot, before, target) ?? Infinity;
    const outside = shot.x + width < 0 || shot.x > ARENA.width || shot.y + height < 0 || shot.y > ARENA.height;
    if (outside && body === Infinity) return { kind: 'miss', ...outcome };
    const sword = shot.canBeDeflected ? frame.hitboxes.reduce((first, hitbox) => hitbox.ownerId !== owner.id &&
      hitbox.canDeflectProjectiles && now - hitbox.createdAt <= hitbox.duration
      ? Math.min(first, getProjectileCollisionTime(shot, before, hitbox) ?? Infinity) : first, Infinity) : Infinity;
    const vineTime = frame.world.mapId === 'jungle' ? frame.vines.reduce((first, vine) => now - vine.createdAt <= vine.duration
      ? Math.min(first, getProjectileCollisionTime(shot, before, vine) ?? Infinity) : first, Infinity) : Infinity;
    const coil = findProjectileCoilContact(shot, frame.coilSnapshots.get(step) ?? [], before);
    const coilTime = coil ? getProjectileCollisionTime(shot, before, coil) ?? Infinity : Infinity;
    if (Math.min(vineTime, coilTime) < Math.min(body, sword)) {
      if (vineTime < coilTime) return { kind: 'vine', ...outcome };
      // Existing observed shots precede this prospective new shot. A coil they
      // already kill still intercepts it, but clearing it adds no marginal HP.
      const pending = frame.paths.reduce((sum, path) => sum + path.coilContacts.reduce((damage, contact) =>
        damage + (contact.step === step && contact.coilId === coil.id ? contact.rawDamage : 0), 0), 0);
      const remainingHealth = coil.health === undefined ? undefined : Math.max(0, coil.health - pending);
      return { kind: 'coil', ...outcome, coilId: coil!.id, rawDamage: shot.damage, remainingHealth,
        marginalDamage: remainingHealth === undefined ? undefined : Math.min(remainingHealth, Math.max(0, shot.damage)) };
    }
    if (sword < body) return { kind: 'sword', ...outcome };
    if (body < Infinity) {
      const blocked = target.isInvulnerable || target.isEvading || shieldFacesX(target, before.x + width / 2);
      return { kind: blocked ? 'shield' : 'enemy', ...outcome };
    }
  }
  return { kind: 'uncertain', step: frame.steps, timeMs: Math.max(0, frame.times[frame.steps] - firstDt) * 1000 };
}
