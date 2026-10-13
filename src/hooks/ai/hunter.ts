import { PLAYER_SIZE, type Player } from '@/types/game';
import { basicProjectileLaunches, projectileProperties, getProjectileCollisionTime } from '@/types/projectile';
import { shieldFacesX, stepPlayerMobilityBuffs } from '@/types/combatPhysics';
import type { AIFrame } from './world';
import type { Point } from './navigation';

export interface ScatterOpportunity { hits: number; damage: number; vines: number; blocked: number }

/** Same-height spacing envelope from the public pellet launch rules. */
export function hunterSpacing(player: Player) {
  const launches = basicProjectileLaunches(player, player.character!.attackDamage);
  const envelope = launches.reduce((range, pellet) => {
    const shape = projectileProperties(pellet.type);
    const time = Math.min(shape.lifetime / 1000, pellet.velocityY === 0 ? Infinity :
      (PLAYER_SIZE + shape.height) / 2 / Math.abs(pellet.velocityY));
    return Math.min(range, time * Math.abs(pellet.velocityX) + PLAYER_SIZE / 2 + shape.width / 2);
  }, 380);
  return Math.max(100, Math.floor(envelope / 10) * 10);
}

/** Five real pellet sweeps bounded by lifetime and permitted forecasts.
 * Callback order lets an earlier pellet open an observed vine for later ones.
 */
export function hunterScatter(frame: AIFrame, owner: Player, opponent: Player, origin: Pick<Player, 'x' | 'y' | 'facingRight'>,
  targetAt: (time: number) => Point, leadMs = 0): ScatterOpportunity {
  const outcome: ScatterOpportunity = { hits: 0, damage: 0, vines: 0, blocked: 0 };
  const ticked = { ...owner, facingRight: origin.facingRight };
  stepPlayerMobilityBuffs(ticked, frame.world.deltaTime + leadMs);
  ticked.hunterFocusedDuration = Math.max(0, (ticked.hunterFocusedDuration ?? 0) - frame.world.deltaTime - leadMs);
  const damage = owner.character!.attackDamage * (1 + ticked.damageBoost - (owner.isHacked ? .2 : 0)) * (frame.world.isOvertime ? 2 : 1);
  const shots = basicProjectileLaunches(ticked, damage).map(launch => {
    const shape = projectileProperties(launch.type);
    return { ...launch, ...shape, x: origin.x + PLAYER_SIZE / 2 - shape.width / 2,
      y: origin.y + PLAYER_SIZE / 2 - shape.height / 2, active: true };
  });
  const destroyed = new Set<string>();
  let remainingHealth = opponent.health;
  let frozen = opponent.isFrozen;
  const first = frame.times[1];
  for (let step = 1; step <= frame.steps && shots.some(shot => shot.active); step++) {
    const elapsed = frame.times[step] + leadMs / 1000, timeMs = Math.max(0, elapsed - first) * 1000;
    if (frame.forecasts && (step > 1 || leadMs > 0) && (elapsed * 1000 > frame.forecasts.opponent.horizonMs + 1e-6 ||
      elapsed * 1000 > frame.forecasts.projectiles.horizonMs + 1e-6)) break;
    const dt = frame.times[step] - frame.times[step - 1], now = frame.world.now + timeMs;
    const target = { ...targetAt(elapsed), width: PLAYER_SIZE, height: PLAYER_SIZE };
    for (const shot of shots) {
      if (!shot.active || timeMs - leadMs > shot.lifetime) { shot.active = false; continue; }
      const before = { x: shot.x, y: shot.y };
      shot.x += shot.velocityX * dt; shot.y += shot.velocityY * dt;
      const body = getProjectileCollisionTime(shot, before, target) ?? Infinity;
      const sword = frame.hitboxes.reduce((first, box) => box.ownerId !== owner.id && box.canDeflectProjectiles && now - box.createdAt <= box.duration
        ? Math.min(first, getProjectileCollisionTime(shot, before, box) ?? Infinity) : first, Infinity);
      let vineTime = Infinity, vineId: string | undefined;
      if (frame.world.mapId === 'jungle' && (!frame.forecasts || step === 1 || elapsed * 1000 <= frame.forecasts.environment.horizonMs))
        for (const vine of frame.vines) if (!destroyed.has(vine.id) && now - vine.createdAt <= vine.duration) {
          const contact = getProjectileCollisionTime(shot, before, vine) ?? Infinity;
          if (contact < vineTime) { vineTime = contact; vineId = vine.id; }
        }
      const snapshotStep = leadMs > 0 ? frame.times.findIndex(time => time >= elapsed - 1e-9) : step;
      const coilTime = (frame.coilSnapshots.get(snapshotStep) ?? []).reduce((first, coil) =>
        coil.ownerId !== owner.id ? Math.min(first, getProjectileCollisionTime(shot, before, coil) ?? Infinity) : first, Infinity);
      if (Math.min(vineTime, coilTime) < Math.min(body, sword)) {
        if (vineTime <= coilTime && vineId) { destroyed.add(vineId); outcome.vines++; } else outcome.blocked++;
        shot.active = false;
      } else if (sword < body) { outcome.blocked++; shot.active = false; }
      else if (body < Infinity) {
        shot.active = false;
        // A ready Ninja dodge starts 500ms evasion, longer than this pellet's lifetime.
        if (opponent.isInvulnerable || opponent.isEvading || opponent.dodgesRemaining > 0 || shieldFacesX({ x: target.x, facingRight: opponent.facingRight,
          isShielding: opponent.isShielding }, before.x + shot.width / 2)) { outcome.blocked++; continue; }
        const dealt = shot.damage * (remainingHealth <= opponent.maxHealth * .5 ? 1.15 : 1) *
          (opponent.isMarked && opponent.markOwnerId === owner.id && (opponent.markDuration <= 0 || opponent.markDuration > elapsed * 1000) ? 1.25 : 1) *
          (frozen && (opponent.frozenDuration <= 0 || opponent.frozenDuration > elapsed * 1000) ? 1.25 : 1) * Math.max(0, 1 - opponent.damageReduction);
        frozen = false;
        outcome.hits++; outcome.damage += dealt; remainingHealth -= dealt;
      }
    }
  }
  return outcome;
}
