import { DEFAULT_PROJECTILE_LIFETIME_MS, HUNTER_BULLET_LIFETIME_MS, POOL_SIZE, ROCKET_SPEED, ROCKET_WIDTH, ROCKET_HEIGHT, ROCKET_EXPLOSION_RADIUS } from './combatPhysics';
import { PLAYER_SIZE, type CharacterType, type Player } from './game';
// Projectile Types

export type ProjectileType = 'arrow' | 'poison-arrow' | 'fireball' | 'large-fireball' | 'flask' | 'electric-orb' | 'meteor' | 'bullet' | 'super-bullet' | 'bat' | 'snowball' | 'large-snowball' | 'blizzard-stone' | 'net' | 'hacker-missile' | 'hacking' | 'rocket' | 'homing-rocket';

export interface ProjectileLaunch { type: ProjectileType; velocityX: number; velocityY: number; damage: number }
export interface ProjectileSpawn extends ProjectileLaunch { x: number; y: number }
export function scientistOrbLaunch(player: Pick<Player, 'x' | 'y' | 'facingRight'>, chargeDuration: number, baseDamage: number) {
  const chargeLevel = Math.min(1, chargeDuration / 1500);
  return { type: 'electric-orb' as const, x: player.x + PLAYER_SIZE / 2, y: player.y + PLAYER_SIZE / 2,
    velocityX: (player.facingRight ? 1 : -1) * 850, velocityY: 0,
    damage: baseDamage * (1.25 + 1.25 * chargeLevel), width: 33 + 17 * chargeLevel, height: 33 + 17 * chargeLevel,
    knockback: 80 + 140 * chargeLevel, slowAmount: chargeLevel >= 0.5 ? 0.3 : 0.2,
    slowDuration: chargeLevel >= 0.5 ? 5000 : 4000, stunDuration: chargeLevel >= 1 ? 1500 : 0, chargeLevel };
}
/** Net's center starts at the owner's top edge, unlike a centered basic shot. */
export function hunterNetLaunch(player: Pick<Player, 'x' | 'y' | 'facingRight'>, baseDamage: number): ProjectileSpawn {
  return { type: 'net', x: player.x + PLAYER_SIZE / 2, y: player.y,
    velocityX: (player.facingRight ? 1 : -1) * 750, velocityY: -105, damage: baseDamage * 0.2 };
}
const BASIC_PROJECTILE_RULES: Record<CharacterType, Readonly<{
  type: ProjectileType; speed: number; velocityY: number; damageMultiplier: number;
}> | null> = {
  gladiator: null, ninja: null, reaper: null, hunter: null,
  archer: { type: 'arrow', speed: 1000, velocityY: -80, damageMultiplier: 1 },
  mage: { type: 'fireball', speed: 780, velocityY: 0, damageMultiplier: 1 },
  scientist: { type: 'flask', speed: 640, velocityY: -105, damageMultiplier: 0.5 },
  'ice-mage': { type: 'snowball', speed: 700, velocityY: 0, damageMultiplier: 1 },
  hacker: { type: 'hacker-missile', speed: 800, velocityY: 0, damageMultiplier: 1 },
  rocketeer: { type: 'rocket', speed: ROCKET_SPEED, velocityY: 0, damageMultiplier: 1 },
};
/** Pure launch rules; the caller supplies damage after buffs and attaches runtime effects/IDs. */
export function basicProjectileLaunches(player: Pick<Player, 'character' | 'facingRight' | 'poisonArrowsRemaining' | 'hunterFocusedDuration'>, baseDamage: number): ProjectileLaunch[] {
  if (!player.character) return [];
  const direction = player.facingRight ? 1 : -1;
  if (player.character.id === 'hunter') {
    const focused = (player.hunterFocusedDuration || 0) > 0;
    const spreadFactor = focused ? 0.4 : 1.0, speedMultiplier = focused ? 1.25 : 1.0;
    const damageMultiplier = focused ? 1.33 : 1.0;
    return Array.from({ length: 5 }, (_, index) => {
      const spreadAngle = (index - 2) * 8 * spreadFactor;
      const radians = spreadAngle * (Math.PI / 180);
      return { type: focused ? 'super-bullet' : 'bullet',
        velocityX: direction * 1250 * speedMultiplier * Math.cos(radians), velocityY: 875 * Math.sin(radians),
        damage: baseDamage * 0.3 * damageMultiplier };
    });
  }
  const rule = BASIC_PROJECTILE_RULES[player.character.id];
  if (!rule) return [];
  return [{ type: player.character.id === 'archer' && player.poisonArrowsRemaining > 0 ? 'poison-arrow' : rule.type,
    velocityX: direction * rule.speed, velocityY: rule.velocityY, damage: baseDamage * rule.damageMultiplier }];
}

export interface Projectile {
  id: string;
  type: ProjectileType;
  ownerId: 1 | 2;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  damage: number;
  width: number;
  height: number;
  hasGravity: boolean;
  gravity: number;
  isExplosive: boolean;
  explosionRadius: number;
  createdAt: number;
  lifetime: number; // milliseconds
  // Special properties
  isPoisonous: boolean;
  poisonDuration: number;
  slowAmount: number;
  slowDuration: number;
  stunDuration: number;
  knockback: number;
  createsFirePool: boolean;
  firePoolDuration: number;
  canBeDeflected: boolean;
  isReturning: boolean;
  returnPhase?: 'outbound' | 'returning';
  isSwapMissile?: boolean;
  isHackUltimate?: boolean;
  damageAccumulated: number;
  hasHitForward?: boolean; // Track if projectile has hit on forward path
  hasLeftForwardTarget?: boolean; // Require separation before a second hit on return
  hasHitReturn?: boolean; // Track if projectile has hit on return path
  hitCoilIds?: string[];
  lastHitTime: Record<number, number>; // Track timestamp of last hit per player ID
  chargeLevel?: number; // 0-1 (or >1 for overcharge visuals)
  initialSpeed?: number;
  flightTimeMs?: number;
  isNapalm?: boolean;
  firePoolDamage?: number;
  burnDamage?: number;
}

export type ProjectileContactKind = 'player' | 'vine' | 'coil';

/** A projectile that pierces a fighter keeps the same rule against world targets. */
export function projectilePierces(projectile: Pick<Projectile, 'type'>, _target: ProjectileContactKind): boolean {
  return projectile.type === 'large-snowball' || projectile.type === 'bat';
}

export function projectileImpactZone(projectile: Pick<Projectile,
  'type' | 'createsFirePool' | 'firePoolDuration' | 'damage' | 'isNapalm' | 'firePoolDamage'>) {
  if (projectile.isNapalm) return {
    type: 'fire-pool' as const,
    damage: projectile.firePoolDamage ?? projectile.damage * 0.1,
    duration: projectile.firePoolDuration,
    isNapalm: true,
  };
  if (projectile.type === 'blizzard-stone') return {
    type: 'blizzard' as const, damage: projectile.damage, duration: 6000, isNapalm: false,
  };
  if (!projectile.createsFirePool) return null;
  const toxic = projectile.type === 'flask';
  return {
    type: toxic ? 'toxic-pool' as const : 'fire-pool' as const,
    damage: projectile.damage * (toxic ? 0.2 : 0.03),
    duration: projectile.firePoolDuration,
    isNapalm: false,
  };
}

export const getProjectileCollisionTime = (
  projectile: Pick<Projectile, 'x' | 'y' | 'width' | 'height'>,
  previousPosition: { x: number; y: number },
  target: { x: number; y: number; width: number; height: number }
): number | null => {
  const minX = target.x - projectile.width;
  const maxX = target.x + target.width;
  const minY = target.y - projectile.height;
  const maxY = target.y + target.height;
  const deltaX = projectile.x - previousPosition.x;
  const deltaY = projectile.y - previousPosition.y;
  let entryTime = 0;
  let exitTime = 1;

  // Keep the x-then-y slab arithmetic and early exits without allocating
  // three arrays for every swept collision in the prediction loops.
  if (deltaX === 0) {
    if (previousPosition.x < minX || previousPosition.x > maxX) return null;
  } else {
    const firstIntersection = (minX - previousPosition.x) / deltaX;
    const secondIntersection = (maxX - previousPosition.x) / deltaX;
    entryTime = Math.max(entryTime, Math.min(firstIntersection, secondIntersection));
    exitTime = Math.min(exitTime, Math.max(firstIntersection, secondIntersection));
    if (entryTime > exitTime) return null;
  }

  if (deltaY === 0) {
    if (previousPosition.y < minY || previousPosition.y > maxY) return null;
  } else {
    const firstIntersection = (minY - previousPosition.y) / deltaY;
    const secondIntersection = (maxY - previousPosition.y) / deltaY;
    entryTime = Math.max(entryTime, Math.min(firstIntersection, secondIntersection));
    exitTime = Math.min(exitTime, Math.max(firstIntersection, secondIntersection));
    if (entryTime > exitTime) return null;
  }

  return entryTime <= 1 && exitTime >= 0 ? entryTime : null;
};

export const checkProjectileCollision = (
  projectile: Pick<Projectile, 'x' | 'y' | 'width' | 'height'>,
  previousPosition: { x: number; y: number },
  target: { x: number; y: number; width: number; height: number }
): boolean => getProjectileCollisionTime(projectile, previousPosition, target) !== null;

// Visual only: explosions never apply additional damage or status effects.
export interface ExplosionEffect {
  id: string;
  type: ProjectileType;
  x: number;
  y: number;
  radius: number;
  createdAt: number;
  duration: number;
}

export const createExplosionEffect = (
  projectile: Projectile,
  x: number,
  y: number,
  now: number
): ExplosionEffect => ({
  id: `explosion-${projectile.id}-${now}`,
  type: projectile.type,
  x,
  y,
  radius: Math.max(projectile.explosionRadius, projectile.width / 2, projectile.height / 2),
  createdAt: now,
  duration: 400,
});

export interface HazardZone {
  id: string;
  type: 'fire-pool' | 'toxic-pool' | 'tesla-coil' | 'electric-explosion' | 'bear-trap' | 'blizzard' | 'fire-ring' | 'packet-block-zone';
  ownerId: 1 | 2;
  x: number;
  y: number;
  width: number;
  height: number;
  damage: number;
  tickRate: number; // damage every X ms
  lastTick: number;
  isNapalm?: boolean;
  duration: number;
  createdAt: number;
  // Tesla coil specific
  health?: number;
  maxHealth?: number;
  attackRange?: number;
  attackCooldown?: number;
  lastAttack?: number;
  lastAttackTarget?: { x: number, y: number }; // For visual lightning effect
  lastSelfDamage?: number; // For tesla coil self-damage
  velocityY?: number;
  isGrounded?: boolean;
}

export interface AttackHitbox {
  id: string;
  ownerId: 1 | 2;
  x: number;
  y: number;
  width: number;
  height: number;
  damage: number;
  duration: number;
  createdAt: number;
  knockback: number;
  canDeflectProjectiles: boolean;
  sourceX?: number;
  knockbackDirection?: 1 | -1;
}

// Helper function to create projectiles
export interface EntityCreationContext { now: number; random: () => number }

export type ProjectileProperties = Omit<Projectile,
  'id' | 'ownerId' | 'x' | 'y' | 'velocityX' | 'velocityY' | 'damage' | 'createdAt' | 'lastHitTime'>;
const PROJECTILE_PROPERTIES: Record<ProjectileType, Partial<ProjectileProperties>> = {
  rocket: { width: ROCKET_WIDTH, height: ROCKET_HEIGHT, isExplosive: true, explosionRadius: ROCKET_EXPLOSION_RADIUS },
  'homing-rocket': { width: ROCKET_WIDTH, height: ROCKET_HEIGHT, isExplosive: true, explosionRadius: ROCKET_EXPLOSION_RADIUS },
  arrow: { width: 56, height: 12, hasGravity: true, gravity: 190 },
  'poison-arrow': { width: 56, height: 12, hasGravity: true, gravity: 190, isPoisonous: true, poisonDuration: 5000, slowAmount: 0.25, slowDuration: 5000 },
  fireball: { width: 24, height: 24, isExplosive: true, explosionRadius: 50, canBeDeflected: true },
  'large-fireball': { width: 42, height: 42, isExplosive: true, explosionRadius: 200, createsFirePool: true, firePoolDuration: 4000, canBeDeflected: false },
  meteor: { width: 20, height: 20, hasGravity: false, isExplosive: true, explosionRadius: 40, canBeDeflected: false },
  flask: { width: 18, height: 18, hasGravity: true, gravity: 220, isExplosive: true, explosionRadius: 45, createsFirePool: true, firePoolDuration: 3200 },
  'electric-orb': { width: 33, height: 33, isExplosive: true, explosionRadius: 125, knockback: 160, slowAmount: 0.4, slowDuration: 4000, stunDuration: 1000, canBeDeflected: false },
  bullet: { width: 10, height: 8, lifetime: HUNTER_BULLET_LIFETIME_MS, knockback: 10 },
  'super-bullet': { width: 10, height: 8, lifetime: HUNTER_BULLET_LIFETIME_MS, knockback: 15 },
  bat: { width: 75, height: 75, lifetime: 3600, canBeDeflected: false, isReturning: true, returnPhase: 'outbound', hasHitForward: false, hasLeftForwardTarget: false, hasHitReturn: false },
  snowball: { width: 24, height: 24, canBeDeflected: true },
  'large-snowball': { width: 33, height: 33, knockback: 150, lifetime: 1400, canBeDeflected: true },
  'blizzard-stone': { width: 45, height: 45, hasGravity: true, gravity: 600 }, // Heavy gravity for arcing.
  net: { width: 45, height: 45, hasGravity: true, gravity: 325, lifetime: 3500, canBeDeflected: false },
  'hacker-missile': { width: 24, height: 24, canBeDeflected: true },
  hacking: { width: 1, height: 1, canBeDeflected: false, lifetime: 100 },
};
/** Public initial rules without IDs, clocks or random draws. Launch velocity only sets rocket flight speed. */
export function projectileProperties(type: ProjectileType, velocityX = 0, velocityY = 0): ProjectileProperties {
  const properties: ProjectileProperties = {
    type, width: 10, height: 10, hasGravity: false, gravity: 0, isExplosive: false, explosionRadius: 0,
    lifetime: DEFAULT_PROJECTILE_LIFETIME_MS, isPoisonous: false, poisonDuration: 0,
    slowAmount: 0, slowDuration: 0, stunDuration: 0, knockback: 0, createsFirePool: false, firePoolDuration: 0,
    canBeDeflected: true, isReturning: false, damageAccumulated: 0, hasHitForward: false, hasHitReturn: false,
    ...PROJECTILE_PROPERTIES[type],
  };
  return type === 'rocket' || type === 'homing-rocket'
    ? { ...properties, initialSpeed: Math.hypot(velocityX, velocityY), flightTimeMs: 0 } : properties;
}

export const createProjectile = (
  type: ProjectileType,
  ownerId: 1 | 2,
  x: number,
  y: number,
  velocityX: number,
  velocityY: number,
  damage: number,
  context?: EntityCreationContext
): Projectile => {
  // Preserve the original default clock/random call order.
  const id = `${type}-${context?.now ?? Date.now()}-${context ? context.random() : Math.random()}`;
  const createdAt = context?.now ?? Date.now();
  const properties = projectileProperties(type, velocityX, velocityY);
  // The supplied location is the center; engine motion/collision stores top-left.
  return { id, type, ownerId, x: x - properties.width / 2, y: y - properties.height / 2,
    velocityX, velocityY, damage, ...properties, createdAt, lastHitTime: {} };
};

export type HazardProperties = Pick<HazardZone, 'width' | 'height' | 'tickRate' | 'health' | 'maxHealth' | 'attackRange' | 'attackCooldown'>;
const HAZARD_PROPERTIES: Record<HazardZone['type'], Partial<HazardProperties>> = {
  'fire-pool': {}, 'electric-explosion': {},
  'toxic-pool': { width: POOL_SIZE['toxic-pool'], height: POOL_SIZE['toxic-pool'] },
  'tesla-coil': { width: 40, height: 60, health: 175, maxHealth: 175, attackRange: 225, attackCooldown: 100 },
  'bear-trap': { width: 45, height: 20 },
  blizzard: { width: POOL_SIZE.blizzard, height: POOL_SIZE.blizzard },
  'fire-ring': { width: 180, height: 180 },
  'packet-block-zone': { width: 250, height: 250 },
};
/** Public defaults only; active damage, duration, timers and motion belong to the observed instance. */
export function hazardProperties(type: HazardZone['type']): HazardProperties {
  return { width: POOL_SIZE['fire-pool'], height: POOL_SIZE['fire-pool'], tickRate: 100, ...HAZARD_PROPERTIES[type] };
}

export const createHazardZone = (
  type: 'fire-pool' | 'toxic-pool' | 'tesla-coil' | 'electric-explosion' | 'bear-trap' | 'blizzard' | 'fire-ring' | 'packet-block-zone',
  ownerId: 1 | 2,
  x: number,
  y: number,
  damage: number,
  duration: number,
  context?: EntityCreationContext,
): HazardZone => {
  const properties = hazardProperties(type);
  const base: HazardZone = {
    id: `${type}-${context?.now ?? Date.now()}-${context ? context.random() : Math.random()}`,
    type,
    ownerId,
    x,
    y,
    width: properties.width,
    height: properties.height,
    damage,
    tickRate: properties.tickRate,
    lastTick: context?.now ?? Date.now(),
    duration,
    createdAt: context?.now ?? Date.now(),
  };

  if (type === 'tesla-coil') {
    return {
      ...base,
      health: properties.health,
      maxHealth: properties.maxHealth,
      attackRange: properties.attackRange,
      attackCooldown: properties.attackCooldown,
      lastAttack: context?.now ?? Date.now(),
    };
  }

  return base;
};

export const createAttackHitbox = (
  ownerId: 1 | 2,
  x: number,
  y: number,
  width: number,
  height: number,
  damage: number,
  duration: number,
  canDeflect: boolean = false,
  sourceX?: number,
  context?: EntityCreationContext
): AttackHitbox => ({
  id: `attack-${context?.now ?? Date.now()}-${context ? context.random() : Math.random()}`,
  ownerId,
  x,
  y,
  width,
  height,
  damage,
  duration,
  createdAt: context?.now ?? Date.now(),
  knockback: 50,
  canDeflectProjectiles: canDeflect,
  sourceX,
});
