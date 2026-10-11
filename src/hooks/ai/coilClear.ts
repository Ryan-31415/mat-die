import { PLAYER_SIZE, type Player } from '@/types/game';
import { coilExplosionGeometry, playerOverlapsRect, stepCoilMotion } from '@/types/combatPhysics';
import type { AIFrame } from './world';
import type { DirectShotOutcome } from './directShot';
import type { Point } from './navigation';

export type CoilClearOutcome = Extract<DirectShotOutcome, { kind: 'coil' }>;

/** Limit survival ordering to a single observed hazard. Other damage, healing,
 * impulses and map threats require the general risk model, not this comparison.
 */
export function singleCoilSurvivalContext(frame: AIFrame, player: Player): string | undefined {
  const hostile = frame.zones.filter(z => z.ownerId !== player.id);
  if (hostile.length !== 1 || hostile[0].type !== 'tesla-coil' || hostile[0].health === undefined ||
      hostile[0].health <= 0 || player.isInvulnerable || player.isFrozen ||
      player.damageReduction !== 0 || player.burnDuration > 0 || player.poisonDuration > 0 ||
      player.knockbackVelocityX || player.knockbackVelocityY ||
      frame.world.mapId === 'volcano' || frame.world.sandstormActive || frame.souls.length ||
      frame.world.lightningStrikes.some(s => !s.struck) ||
      frame.world.projectiles.some(p => p.ownerId !== player.id) ||
      frame.world.attackHitboxes.some(h => h.ownerId !== player.id)) return undefined;
  return hostile[0].id;
}

/** Damage from the observed coil along a caller's movement forecast. Shared
 * snapshots already contain known earlier projectile damage and natural decay.
 * A future action/input/spawn is never invented. No post-explosion displacement
 * is certified: callers reject clearing paths that overlap the destruction blast.
 */
export function coilExposure(frame: AIFrame, player: Player, coilId: string, points: readonly Point[], clear?: CoilClearOutcome) {
  let damage = 0, lethalAtMs: number | undefined, blastContact = false;
  let lastAttack = frame.world.hazardZones.find(z => z.id === coilId)?.lastAttack ?? 0;
  for (let step = 1; step <= frame.steps; step++) {
    const elapsed = frame.times[step] * 1000;
    if (step > 1 && frame.forecasts && elapsed > frame.forecasts.environment.horizonMs + 1e-6)
      return { damage, lethalAtMs, blastContact, uncertain: true };
    const snapshot = frame.coilSnapshots.get(step)?.find(z => z.id === coilId), point = points[step];
    if (!snapshot || snapshot.health === undefined || !point)
      return { damage, lethalAtMs, blastContact, uncertain: true };
    const health = snapshot.health, coil = { ...snapshot };
    const now = frame.world.now + Math.max(0, elapsed - frame.times[1] * 1000);
    const pending = frame.paths.reduce((sum, path) => sum + path.coilContacts.reduce((total, contact) =>
      total + (contact.step === step && contact.coilId === coilId ? contact.rawDamage : 0), 0), 0);
    const destroyed = health - pending - (clear?.step === step ? clear.rawDamage : 0) <= 0;
    const expired = now - coil.createdAt > coil.duration;
    if (destroyed || expired) {
      const blast = coilExplosionGeometry(coil, destroyed ? 'destroyed' : 'expired');
      if (playerOverlapsRect(point, blast)) { damage += coil.damage * blast.damageMultiplier; blastContact = true; }
    } else {
      stepCoilMotion(coil, frame.world.platforms, (frame.times[step] - frame.times[step - 1]) * 1000);
      const distance = Math.hypot(coil.x + coil.width / 2 - point.x - PLAYER_SIZE / 2,
        coil.y + coil.height / 2 - point.y - PLAYER_SIZE / 2);
      if (distance < (coil.attackRange || 150) && !(lastAttack && now - lastAttack < (coil.attackCooldown || 200))) {
        damage += coil.damage; lastAttack = now;
      }
    }
    if (lethalAtMs === undefined && damage >= player.health) lethalAtMs = elapsed;
    if (destroyed || expired) return { damage, lethalAtMs, blastContact, uncertain: false };
  }
  return { damage, lethalAtMs, blastContact, uncertain: false };
}

/** A bounded survival comparison, not a general coil utility score. A rooted,
 * grounded fighter with no residual forces can keep the observed position until
 * its root ends. Do not claim a rescue from a partial hit or unknown coil HP.
 */
export function rootedCoilRescue(frame: AIFrame, player: Player, launch: Player, outcome: DirectShotOutcome): boolean {
  if (outcome.kind !== 'coil' || outcome.remainingHealth === undefined || outcome.remainingHealth <= 0 ||
      outcome.rawDamage < outcome.remainingHealth || !player.isGrounded || player.rootDuration <= frame.world.deltaTime ||
      player.isInvulnerable || player.isFrozen || player.damageReduction !== 0 || launch.x !== player.x || launch.y !== player.y ||
      player.knockbackVelocityX || player.knockbackVelocityY || player.velocityY ||
      frame.world.projectiles.some(p => p.ownerId !== player.id) ||
      frame.world.attackHitboxes.some(h => h.ownerId !== player.id) ||
      frame.zones.some(z => z.ownerId !== player.id && z.id !== outcome.coilId)) return false;
  let health = player.health, clearedHealth: number | undefined;
  let lastAttack = frame.world.hazardZones.find(z => z.id === outcome.coilId)?.lastAttack ?? 0;
  for (let step = 1; step <= frame.steps; step++) {
    const elapsed = frame.times[step] * 1000;
    const timeMs = Math.max(0, elapsed - frame.times[1] * 1000), now = frame.world.now + timeMs;
    // A cheaper basic shot or new movement may become available: leave those
    // alternatives to the general planner instead of certifying fixed-position rescue.
    if (elapsed >= player.rootDuration || elapsed >= player.attackCooldownRemaining) return false;
    const snapshot = frame.coilSnapshots.get(step)?.find(z => z.id === outcome.coilId);
    if (!snapshot || snapshot.health === undefined) return false;
    const coil = { ...snapshot };
    const pending = frame.paths.reduce((sum, path) => sum + path.coilContacts.reduce((damage, contact) =>
      damage + (contact.step === step && contact.coilId === coil.id ? contact.rawDamage : 0), 0), 0);
    const remaining = coil.health - pending;
    const destroyed = remaining <= 0, expired = now - coil.createdAt > coil.duration;
    const damage = coil.damage * (1 - player.damageReduction);
    if (step === outcome.step) {
      const blast = coilExplosionGeometry(coil, 'destroyed');
      clearedHealth = health - (playerOverlapsRect(launch, blast) ? damage * blast.damageMultiplier : 0);
    }
    if (destroyed || expired) {
      const blast = coilExplosionGeometry(coil, destroyed ? 'destroyed' : 'expired');
      if (playerOverlapsRect(launch, blast)) health -= damage * blast.damageMultiplier;
    } else {
      stepCoilMotion(coil, frame.world.platforms, (frame.times[step] - frame.times[step - 1]) * 1000);
      const distance = Math.hypot(coil.x + coil.width / 2 - launch.x - PLAYER_SIZE / 2,
        coil.y + coil.height / 2 - launch.y - PLAYER_SIZE / 2);
      if (distance < (coil.attackRange || 150) && !(lastAttack && now - lastAttack < (coil.attackCooldown || 200))) {
        health -= damage;
        lastAttack = now;
      }
    }
    if (health <= 0) return clearedHealth !== undefined && clearedHealth > 0;
    if (destroyed || expired) return false;
  }
  return false;
}
