import { ARENA, PLAYER_SIZE, type CharacterType, type Player } from './game';
import { COYOTE_TIME, GRAVITY, JUMP_FORCE, MAX_FALL_SPEED, type Platform } from './platform';
import type { AttackHitbox, HazardZone, Projectile } from './projectile';

export const FLOOR_Y = ARENA.height - ARENA.padding - PLAYER_SIZE;
export const NINJA_DASH_DISTANCE = 280;
export const NINJA_PARRY_MS = 120;
const BASIC_MELEE_RULES: Record<CharacterType, Readonly<{
  xOffset: number; yOffset: number; extraWidth: number; height: number; duration: number; canDeflectProjectiles: boolean;
}> | null> = {
  gladiator: { xOffset: 0, yOffset: 0, extraWidth: PLAYER_SIZE, height: PLAYER_SIZE, duration: 200, canDeflectProjectiles: false },
  ninja: { xOffset: 0, yOffset: -10, extraWidth: PLAYER_SIZE, height: PLAYER_SIZE * 1.1, duration: NINJA_PARRY_MS, canDeflectProjectiles: true },
  reaper: { xOffset: -10, yOffset: -10, extraWidth: PLAYER_SIZE + 20, height: PLAYER_SIZE + 20, duration: 250, canDeflectProjectiles: false },
  archer: null, mage: null, scientist: null, hunter: null, 'ice-mage': null, hacker: null, rocketeer: null,
};
export interface BasicMeleeGeometry {
  x: number; y: number; width: number; height: number; duration: number; canDeflectProjectiles: boolean; sourceX: number;
}
/** Pure public rules. The original attacks include the fighter's body for overlapping targets. */
export function basicMeleeGeometry(player: Pick<Player, 'character' | 'x' | 'y' | 'facingRight'>): BasicMeleeGeometry | null {
  if (!player.character) return null;
  const rule = BASIC_MELEE_RULES[player.character.id];
  if (!rule) return null;
  return { x: (player.facingRight ? player.x : player.x - player.character.attackRange) + rule.xOffset,
    y: player.y + rule.yOffset, width: player.character.attackRange + rule.extraWidth, height: rule.height,
    duration: rule.duration, canDeflectProjectiles: rule.canDeflectProjectiles, sourceX: player.x + PLAYER_SIZE / 2 };
}
export const BAT_RETURN_FRACTION = 0.35;
export const LIGHTNING_WARNING_MS = 1500;
export const LIGHTNING_RADIUS = 40;
export const VINE_FADE_MS = 700;
export const DEFAULT_PROJECTILE_LIFETIME_MS = 3000;
export const HUNTER_BULLET_LIFETIME_MS = 240;
export const POOL_SIZE = { 'toxic-pool': 150, 'fire-pool': 225, blizzard: 400 } as const;
export const ROCKET_SPEED = 600;
export const ROCKET_WIDTH = 48;
export const ROCKET_HEIGHT = 32;
export const ROCKET_EXPLOSION_RADIUS = 75;
export const HOMING_ROCKET_SPEED = 600;
export const ROCKET_ACCELERATION_MS = 1200;
export const ROCKET_MAX_SPEED_FACTOR = 1.6;
export const ROCKET_TURN_RATE = Math.PI * 1.0;
export const NAPALM_DURATION_MS = 6000;
export const NAPALM_POOL_DURATION_MS = 4000;
export const isRocket = (projectile: Pick<Projectile, 'type'>) => projectile.type === 'rocket' || projectile.type === 'homing-rocket';
export type ProjectileTarget = Pick<Player, 'x' | 'y' | 'isInvisible'>;
export const clampPlayerX = (x: number) => Math.max(ARENA.padding, Math.min(ARENA.width - ARENA.padding - PLAYER_SIZE, x));
export const shieldFacesX = (defender: Pick<Player, 'x' | 'facingRight' | 'isShielding'>, sourceCenterX: number) =>
  defender.isShielding && (sourceCenterX - defender.x - PLAYER_SIZE / 2) * (defender.facingRight ? 1 : -1) > 0;

export const playerOverlapsRect = (point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }, margin = 0) =>
  point.x + PLAYER_SIZE + margin > rect.x && point.x - margin < rect.x + rect.width &&
  point.y + PLAYER_SIZE + margin > rect.y && point.y - margin < rect.y + rect.height;

type CombatRect = { x: number; y: number; width: number; height: number };
type CoilContactZone = Pick<HazardZone, 'id' | 'type' | 'ownerId' | 'x' | 'y' | 'width' | 'height'>;
const overlapsCombatRect = (a: CombatRect, b: CombatRect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

function sweptCombatRectTime(projectile: CombatRect, previous: { x: number; y: number }, target: CombatRect) {
  const minX = target.x - projectile.width, maxX = target.x + target.width;
  const minY = target.y - projectile.height, maxY = target.y + target.height;
  const dx = projectile.x - previous.x, dy = projectile.y - previous.y;
  let entry = 0, exit = 1;
  for (const [start, delta, min, max] of [[previous.x, dx, minX, maxX], [previous.y, dy, minY, maxY]]) {
    if (delta === 0) { if (start < min || start > max) return null; continue; }
    const a = (min - start) / delta, b = (max - start) / delta;
    entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    if (entry > exit) return null;
  }
  return entry <= 1 && exit >= 0 ? entry : null;
}

/** Swept contact before coil motion/removal; stable ties follow the zone array order. */
export function findProjectileCoilContact<T extends CoilContactZone>(
  projectile: Pick<Projectile, 'type' | 'ownerId' | 'x' | 'y' | 'width' | 'height' | 'isHackUltimate' | 'hitCoilIds'>,
  zones: readonly T[],
  previousPosition?: { x: number; y: number }
): T | undefined {
  return zones.map((zone, index) => ({ zone, index,
    time: previousPosition ? sweptCombatRectTime(projectile, previousPosition, zone) : overlapsCombatRect(projectile, zone) ? 0 : null }))
    .filter((contact): contact is { zone: T; index: number; time: number } =>
      contact.zone.type === 'tesla-coil' && contact.zone.ownerId !== projectile.ownerId && !projectile.isHackUltimate &&
      !((projectile.type === 'bat' || projectile.type === 'large-snowball') &&
        projectile.hitCoilIds?.includes(contact.zone.id)) && contact.time !== null)
    .sort((a, b) => a.time - b.time || a.index - b.index)[0]?.zone;
}

/** Contact only: melee remains active and may also hit a fighter in the same phase. */
export function findMeleeCoilContact<T extends CoilContactZone>(
  hitbox: Pick<AttackHitbox, 'ownerId' | 'x' | 'y' | 'width' | 'height'>, zones: readonly T[]
): T | undefined {
  return zones.find(zone => zone.type === 'tesla-coil' && zone.ownerId !== hitbox.ownerId && overlapsCombatRect(hitbox, zone));
}

export function fireRingOverlapsPlayer(ring: Pick<HazardZone, 'x' | 'y' | 'width' | 'height'>, target: { x: number; y: number }) {
  const centerX = ring.x + ring.width / 2, centerY = ring.y + ring.height / 2;
  const nearestX = Math.max(target.x, Math.min(centerX, target.x + PLAYER_SIZE));
  const nearestY = Math.max(target.y, Math.min(centerY, target.y + PLAYER_SIZE));
  const nearestDistance = Math.hypot(centerX - nearestX, centerY - nearestY);
  const farthestDistance = Math.max(
    Math.hypot(centerX - target.x, centerY - target.y),
    Math.hypot(centerX - (target.x + PLAYER_SIZE), centerY - target.y),
    Math.hypot(centerX - target.x, centerY - (target.y + PLAYER_SIZE)),
    Math.hypot(centerX - (target.x + PLAYER_SIZE), centerY - (target.y + PLAYER_SIZE))
  );
  const outerRadius = ring.width / 2;
  return nearestDistance <= outerRadius && farthestDistance >= outerRadius - 6;
}

export const reaperContactGeometry = (point: { x: number; y: number }) => ({
  x: point.x - 30, y: point.y - 30, width: PLAYER_SIZE + 60, height: PLAYER_SIZE + 60,
});

/** The destruction rectangle is intentionally offset and larger than the expiry rectangle. */
export function coilExplosionGeometry(coil: Pick<HazardZone, 'x' | 'y' | 'width' | 'height'>, reason: 'destroyed' | 'expired') {
  return { x: coil.x + coil.width / 2 - 100, y: coil.y + coil.height / 2 - 100,
    width: reason === 'destroyed' ? 240 : 200, height: reason === 'destroyed' ? 240 : 200,
    damageMultiplier: 32, knockbackX: reason === 'destroyed' ? 720 : 500, knockbackY: reason === 'destroyed' ? -200 : -180 };
}

/** Mutates only the supplied coil copy; damage and expiry remain in the engine's original phase. */
export function stepCoilMotion(next: HazardZone, platforms: readonly Platform[], deltaTime: number) {
  if (next.isGrounded) return next;
  next.velocityY = Math.min(MAX_FALL_SPEED, (next.velocityY || 0) + GRAVITY * (deltaTime / 1000));
  const nextY = next.y + next.velocityY * (deltaTime / 1000);
  const landing = platforms.find(platform => next.x + next.width > platform.x && next.x < platform.x + platform.width &&
    next.y + next.height <= platform.y + (platform.type === 'one-way' ? 10 : 0) && nextY + next.height >= platform.y);
  if (landing) {
    next.y = landing.y - next.height; next.velocityY = 0; next.isGrounded = true;
  } else {
    next.y = Math.min(ARENA.height - ARENA.padding - next.height, nextY);
    if (next.y >= ARENA.height - ARENA.padding - next.height) { next.velocityY = 0; next.isGrounded = true; }
  }
  return next;
}

/** World units per second; matches the engine's original speed * dt / 16 * 1.2. */
export function playerMoveSpeed(player: Player, now: number): number {
  if (!player.character || player.rootDuration > 0) return 0;
  let speed = player.character.speed * 75;
  if (player.isShielding) speed *= 0.5;
  if (player.isChargingSkill) speed *= now - (player.skillChargeStartTime ?? now) >= 875 ? 0.6 : 0.67;
  if (player.isSlowed) speed *= 1 - player.slowAmount;
  speed *= Math.max(0, 1 - player.freezeGauge * 0.1);
  return speed * (1 + player.speedBoost);
}

export function sandstormImpulse(now: number, dt: number, direction: 'left' | 'right'): number {
  return (direction === 'right' ? 120 : -120) * (1 + Math.sin(now / 500) * 0.5) * dt * 10;
}

export function platformCollision(point: { x: number; y: number }, newY: number, vy: number, platforms: readonly Platform[]) {
  for (const platform of platforms) {
    if (point.x + PLAYER_SIZE <= platform.x || point.x >= platform.x + platform.width) continue;
    if (vy >= 0 && point.y + PLAYER_SIZE <= platform.y + (platform.type === 'one-way' ? 10 : 0) && newY + PLAYER_SIZE >= platform.y) {
      return { y: platform.y - PLAYER_SIZE, isGrounded: true, platform };
    }
    if (platform.type === 'solid' && vy < 0 && point.y >= platform.y + platform.height && newY < platform.y + platform.height) {
      return { y: platform.y + platform.height, isGrounded: false, platform: null };
    }
  }
  return { y: newY, isGrounded: false, platform: null };
}

export interface PlayerMovementInput {
  left: boolean; right: boolean; jump: boolean; down: boolean;
}

/** Mutates a caller-owned copy after status timers, before shield upkeep and movement. */
export function stepPlayerForces(next: Player, deltaTime: number) {
  if (!next.isFlying && (!next.isGrounded || next.velocityY < 0)) {
    next.velocityY += GRAVITY * (deltaTime / 1000);
    next.velocityY = Math.min(MAX_FALL_SPEED, next.velocityY);
  } else if (next.isFlying) next.velocityY = 0;
  for (const key of ['knockbackVelocityX', 'knockbackVelocityY'] as const) {
    if (Math.abs(next[key]) > 10) next[key] *= Math.pow(0.9, deltaTime / 16);
    else next[key] = 0;
  }
  return next;
}

/** Post-force movement with already resolved controls and shield/charge state. No action or status updates. */
export function stepPlayerMovement(next: Player, input: Readonly<PlayerMovementInput>, platforms: readonly Platform[],
  inBlizzard: boolean, now: number, deltaTime: number) {
  if (next.isStunned || next.isFrozen) {
    next.x = clampPlayerX(next.x + next.knockbackVelocityX * (deltaTime / 1000));
    let newY = next.y + (next.velocityY + next.knockbackVelocityY) * (deltaTime / 1000);
    const result = !next.isFlying ? platformCollision(next, newY, next.velocityY + next.knockbackVelocityY, platforms) : null;
    if (result?.isGrounded && !next.isFlying) {
      newY = result.y;
      next.velocityY = 0; next.knockbackVelocityY = 0; next.isGrounded = true;
    } else next.isGrounded = false;
    // Preserve this branch's original floor/coyote bookkeeping, distinct from normal movement.
    next.y = Math.max(ARENA.padding, Math.min(FLOOR_Y, newY));
    return next;
  }

  const speed = playerMoveSpeed(next, now) / 75;
  let dx = Number(input.right) - Number(input.left), dy = 0;
  if (next.isFlying) {
    dy = Number(input.down) - Number(input.jump);
    if (dx === 0) dx = next.facingRight ? 1 : -1;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length > 0) { dx /= length; dy /= length; }
  }
  if (dx > 0) next.facingRight = true;
  else if (dx < 0) next.facingRight = false;
  const moveAmount = speed * (deltaTime / 16) * 1.2;
  if (inBlizzard) {
    next.velocityX += dx * (speed * 100) * (deltaTime / 1000);
    next.velocityX *= Math.pow(0.99, deltaTime / 16);
    let newX = next.x + next.velocityX * (deltaTime / 1000);
    newX += next.knockbackVelocityX * (deltaTime / 1000);
    next.x = clampPlayerX(newX);
    if (next.x <= ARENA.padding || next.x >= ARENA.width - ARENA.padding - PLAYER_SIZE) next.velocityX *= -0.5;
  } else {
    let newX = next.x + dx * moveAmount;
    newX += next.knockbackVelocityX * (deltaTime / 1000);
    next.x = clampPlayerX(newX);
    next.velocityX = 0;
  }
  const canJump = next.isGrounded || now - next.lastGroundedTime < COYOTE_TIME;
  if (input.jump && canJump && !next.isJumping) {
    next.velocityY = JUMP_FORCE; next.isJumping = true; next.isGrounded = false;
  }
  if (!input.jump) next.isJumping = false;
  let newY = next.y;
  if (next.isFlying) newY += dy * moveAmount;
  else newY += next.velocityY * (deltaTime / 1000);
  newY += next.knockbackVelocityY * (deltaTime / 1000);
  const result = !next.isFlying ? platformCollision(next, newY, next.velocityY + next.knockbackVelocityY, platforms) : null;
  if (result?.isGrounded) {
    newY = result.y;
    next.velocityY = 0; next.knockbackVelocityY = 0; next.isGrounded = true; next.lastGroundedTime = now;
    if (input.down && result.platform?.type === 'one-way' && !next.isJumping) {
      next.isGrounded = false; newY += 25; next.velocityY = 300;
    }
  } else next.isGrounded = false;
  newY = Math.max(ARENA.padding, Math.min(FLOOR_Y, newY));
  if (newY >= FLOOR_Y) {
    newY = FLOOR_Y;
    next.velocityY = 0; next.knockbackVelocityY = 0; next.isGrounded = true; next.lastGroundedTime = now;
  }
  next.y = newY;
  return next;
}

export function fallStep(point: { x: number; y: number }, velocityY: number, dt: number, platforms: readonly Platform[]) {
  const vy = Math.min(MAX_FALL_SPEED, velocityY + GRAVITY * dt);
  const result = platformCollision(point, point.y + vy * dt, vy, platforms);
  return { y: Math.max(ARENA.padding, Math.min(FLOOR_Y, result.y)), vy: result.isGrounded || result.y >= FLOOR_Y ? 0 : vy };
}

/** A return phase is a fact, never inferred from horizontal speed or projectile age. */
export function advanceProjectile(projectile: Projectile, owner: Pick<Player, 'x' | 'y'>, now: number, dt: number, target?: ProjectileTarget): Projectile {
  return stepProjectileMotion({ ...projectile }, owner, now, dt, target);
}

/** Mutates only a caller-owned simulation copy; avoids per-step projectile allocations. */
export function stepProjectileMotion(next: Projectile, owner: Pick<Player, 'x' | 'y'>, now: number, dt: number, target?: ProjectileTarget): Projectile {
  if (isRocket(next)) {
    const initialSpeed = next.initialSpeed ?? (next.type === 'rocket' ? ROCKET_SPEED : HOMING_ROCKET_SPEED);
    next.initialSpeed = initialSpeed;
    next.flightTimeMs = (next.flightTimeMs ?? 0) + Math.max(0, dt) * 1000;
    const speed = initialSpeed * (1 + (ROCKET_MAX_SPEED_FACTOR - 1) * Math.min(1, next.flightTimeMs / ROCKET_ACCELERATION_MS));
    let angle = Math.atan2(next.velocityY, next.velocityX);
    if (next.type === 'homing-rocket' && target && !target.isInvisible) {
      const dx = target.x + PLAYER_SIZE / 2 - next.x - next.width / 2;
      const dy = target.y + PLAYER_SIZE / 2 - next.y - next.height / 2;
      if (Math.hypot(dx, dy) > 0) {
        const desired = Math.atan2(dy, dx);
        const difference = Math.atan2(Math.sin(desired - angle), Math.cos(desired - angle));
        const limit = ROCKET_TURN_RATE * Math.max(0, dt);
        angle += Math.max(-limit, Math.min(limit, difference));
      }
    }
    next.velocityX = Math.cos(angle) * speed;
    next.velocityY = Math.sin(angle) * speed;
  }
  if (next.isReturning) {
    const age = now - next.createdAt;
    const nextX = next.x + next.velocityX * dt;
    const nextY = next.y + next.velocityY * dt;
    const bounds = age > 50 && (nextX < ARENA.padding || nextX > ARENA.width - ARENA.padding - next.width ||
      nextY < ARENA.padding || nextY > ARENA.height - ARENA.padding - next.height);
    const startingReturn = next.type === 'bat' && next.returnPhase !== 'returning' && (age > next.lifetime * BAT_RETURN_FRACTION || bounds);
    if (startingReturn || (next.type !== 'bat' && age > next.lifetime * BAT_RETURN_FRACTION)) {
      const dx = owner.x + PLAYER_SIZE / 2 - next.x - next.width / 2;
      const dy = owner.y + PLAYER_SIZE / 2 - next.y - next.height / 2;
      const distance = Math.hypot(dx, dy);
      if (next.type === 'bat') next.returnPhase = 'returning';
      if (distance > 0) {
        const speed = next.type === 'bat' ? 650 : 750;
        next.velocityX = dx / distance * speed;
        next.velocityY = dy / distance * speed;
      }
    }
  }
  next.x += next.velocityX * dt;
  next.y += next.velocityY * dt;
  if (next.type === 'bat') {
    const x = Math.max(ARENA.padding, Math.min(ARENA.width - ARENA.padding - next.width, next.x));
    const y = Math.max(ARENA.padding, Math.min(ARENA.height - ARENA.padding - next.height, next.y));
    if (x !== next.x || y !== next.y) {
      next.x = x; next.y = y; next.returnPhase = 'returning';
      const dx = owner.x + PLAYER_SIZE / 2 - x - next.width / 2;
      const dy = owner.y + PLAYER_SIZE / 2 - y - next.height / 2;
      const distance = Math.hypot(dx, dy);
      if (distance > 0) { next.velocityX = dx / distance * 750; next.velocityY = dy / distance * 750; }
    }
  }
  if (next.hasGravity) next.velocityY += next.gravity * dt;
  return next;
}

/** Shared pre-movement phase; mutates a caller-owned player. */
export function stepPlayerSlowAndRoot(next: Player, deltaTime: number) {
  if (next.slowDuration > 0) {
    next.slowDuration -= deltaTime;
    if (next.slowDuration <= 0) {
      next.isSlowed = false;
      next.slowDuration = 0;
      next.slowAmount = 0;
    }
  }
  if (next.rootDuration > 0) {
    next.rootDuration -= deltaTime;
    if (next.rootDuration <= 0) {
      next.rootDuration = 0;
    }
  }
  return next;
}

/** Shared pre-movement phase; mutates a caller-owned player. */
export function stepPlayerCrowdControl(next: Player, opponent: Player, zones: readonly HazardZone[], now: number, deltaTime: number) {
  if (next.stunDuration > 0) {
    next.stunDuration -= deltaTime;
    if (next.stunDuration <= 0) {
      next.isStunned = false;
      next.stunDuration = 0;
    }
  }
  if (next.frozenDuration > 0) {
    next.frozenDuration -= deltaTime;
    if (next.frozenDuration <= 0) {
      next.isFrozen = false;
      next.frozenDuration = 0;
    }
  }

  // Ice Mage Passive - check for freeze and decay
  // This logic applies to the player being updated, if their opponent is an Ice Mage
  if (opponent.character?.id === 'ice-mage') {
    if (next.freezeGauge >= 5) {
      next.isFrozen = true;
      let freezeDur = 1000;

      // Ice Mage Blizzard: Increased freeze duration
      const inBlizzard = zones.some(z =>
        z.type === 'blizzard' &&
        playerOverlapsRect(next, z)
      );
      if (inBlizzard) {
        freezeDur *= 1.5;
      }

      next.frozenDuration = freezeDur;
      next.freezeGauge = 0;
    } else if (next.freezeGauge > 0 && now - next.lastHitByIceMage > 4000) {
      if (now - (next.lastFreezeGaugeDecay || 0) > 1500) {
        next.freezeGauge = Math.max(0, next.freezeGauge - 1);
        next.lastFreezeGaugeDecay = now;
      }
    }
  }
  return next;
}

/** Shared pre-movement phase; mutates a caller-owned player. */
export function stepPlayerMobilityBuffs(next: Player, deltaTime: number) {
  if (next.invisibleDuration > 0) {
    next.invisibleDuration -= deltaTime;
    if (next.invisibleDuration <= 0) {
      next.isInvisible = false;
      next.invisibleDuration = 0;
      next.dodgesRemaining = 0;
      // Reset ninja ultimate buffs
      next.damageBoost = 0;
      next.speedBoost = 0;
    }
  }
  if (next.buffDuration > 0) {
    next.buffDuration -= deltaTime;
    if (next.buffDuration <= 0) {
      next.damageBoost = 0;
      next.speedBoost = 0;
      next.damageReduction = 0;
      next.buffDuration = 0;
    }
  }
  if (next.invulnerableDuration > 0) {
    next.invulnerableDuration -= deltaTime;
    if (next.invulnerableDuration <= 0) {
      next.isInvulnerable = false;
      next.invulnerableDuration = 0;
      next.isFlying = false;
      // Reset reaper ultimate speed boost
      if (next.character?.id === 'reaper') {
        next.speedBoost = 0;
        next.trailPositions = [];
      }
    }
  }
  return next;
}
