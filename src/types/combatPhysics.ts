import { ARENA, PLAYER_SIZE, type Player } from './game';
import { GRAVITY, MAX_FALL_SPEED, type Platform } from './platform';
import type { Projectile } from './projectile';

export const FLOOR_Y = ARENA.height - ARENA.padding - PLAYER_SIZE;
export const NINJA_DASH_DISTANCE = 280;
export const NINJA_PARRY_MS = 120;
export const BAT_RETURN_FRACTION = 0.35;
export const LIGHTNING_WARNING_MS = 1500;
export const LIGHTNING_RADIUS = 40;
export const VINE_FADE_MS = 700;
export const DEFAULT_PROJECTILE_LIFETIME_MS = 3000;
export const HUNTER_BULLET_LIFETIME_MS = 240;
export const POOL_SIZE = { 'toxic-pool': 150, 'fire-pool': 225, blizzard: 400 } as const;
export const clampPlayerX = (x: number) => Math.max(ARENA.padding, Math.min(ARENA.width - ARENA.padding - PLAYER_SIZE, x));
export const shieldFacesX = (defender: Pick<Player, 'x' | 'facingRight' | 'isShielding'>, sourceCenterX: number) =>
  defender.isShielding && (sourceCenterX - defender.x - PLAYER_SIZE / 2) * (defender.facingRight ? 1 : -1) > 0;

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

export function fallStep(point: { x: number; y: number }, velocityY: number, dt: number, platforms: readonly Platform[]) {
  const vy = Math.min(MAX_FALL_SPEED, velocityY + GRAVITY * dt);
  const result = platformCollision(point, point.y + vy * dt, vy, platforms);
  return { y: Math.max(ARENA.padding, Math.min(FLOOR_Y, result.y)), vy: result.isGrounded || result.y >= FLOOR_Y ? 0 : vy };
}

/** A return phase is a fact, never inferred from horizontal speed or projectile age. */
export function advanceProjectile(projectile: Projectile, owner: Pick<Player, 'x' | 'y'>, now: number, dt: number): Projectile {
  return stepProjectileMotion({ ...projectile }, owner, now, dt);
}

/** Mutates only a caller-owned simulation copy; avoids per-step projectile allocations. */
export function stepProjectileMotion(next: Projectile, owner: Pick<Player, 'x' | 'y'>, now: number, dt: number): Projectile {
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
