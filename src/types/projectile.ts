// Projectile Types

export type ProjectileType = 'arrow' | 'poison-arrow' | 'fireball' | 'large-fireball' | 'flask' | 'electric-orb' | 'meteor' | 'bullet' | 'super-bullet' | 'bat' | 'snowball' | 'large-snowball' | 'blizzard-stone' | 'net' | 'hacker-missile' | 'hacking';

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
  damageAccumulated: number;
  hasHitForward?: boolean; // Track if projectile has hit on forward path
  hasHitReturn?: boolean; // Track if projectile has hit on return path
  isHoming?: boolean; // Track if projectile is homing
  lastHitTime: Record<number, number>; // Track timestamp of last hit per player ID
  chargeLevel?: number; // 0-1 (or >1 for overcharge visuals)
}

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
}

// Helper function to create projectiles
export const createProjectile = (
  type: ProjectileType,
  ownerId: 1 | 2,
  x: number,
  y: number,
  velocityX: number,
  velocityY: number,
  damage: number
): Projectile => {
  const baseProjectile: Projectile = {
    id: `${type}-${Date.now()}-${Math.random()}`,
    type,
    ownerId,
    x,
    y,
    velocityX,
    velocityY,
    damage,
    width: 10,
    height: 10,
    hasGravity: false,
    gravity: 0,
    isExplosive: false,
    explosionRadius: 0,
    createdAt: Date.now(),
    lifetime: 3000,
    isPoisonous: false,
    poisonDuration: 0,
    slowAmount: 0,
    slowDuration: 0,
    stunDuration: 0,
    knockback: 0,
    createsFirePool: false,
    firePoolDuration: 0,
    canBeDeflected: true,
    isReturning: false,
    damageAccumulated: 0,
    hasHitForward: false,
    hasHitReturn: false,
    lastHitTime: {},
  };

  let result: Projectile = { ...baseProjectile };

  switch (type) {
    case 'arrow':
      result = {
        ...baseProjectile,
        width: 56,
        height: 12,
        hasGravity: true,
        gravity: 190,
      };
      break;
    case 'poison-arrow':
      result = {
        ...baseProjectile,
        width: 56,
        height: 12,
        hasGravity: true,
        gravity: 190,
        isPoisonous: true,
        poisonDuration: 5000,
        slowAmount: 0.33,
        slowDuration: 5000,
      };
      break;
    case 'fireball':
      result = {
        ...baseProjectile,
        width: 24,
        height: 24,
        isExplosive: true,
        explosionRadius: 50,
        canBeDeflected: true,
      };
      break;
    case 'large-fireball':
      result = {
        ...baseProjectile,
        width: 42,
        height: 42,
        isExplosive: true,
        explosionRadius: 300,
        createsFirePool: true,
        firePoolDuration: 4000,
        canBeDeflected: false,
      };
      break;
    case 'meteor':
      result = {
        ...baseProjectile,
        width: 20,
        height: 20,
        hasGravity: false,
        isExplosive: true,
        explosionRadius: 55,
        canBeDeflected: false,
      };
      break;
    case 'flask':
      result = {
        ...baseProjectile,
        width: 18,
        height: 18,
        hasGravity: true,
        gravity: 200,
        isExplosive: true,
        explosionRadius: 35,
        createsFirePool: true,
        firePoolDuration: 3000,
      };
      break;
    case 'electric-orb':
      result = {
        ...baseProjectile,
        width: 33,
        height: 33,
        isExplosive: true,
        explosionRadius: 125,
        knockback: 160,
        slowAmount: 0.4,
        slowDuration: 4000,
        stunDuration: 1000,
        canBeDeflected: false,
      };
      break;
    case 'bullet':
      result = {
        ...baseProjectile,
        width: 10,
        height: 8,
        lifetime: 305,
        knockback: 10,
      };
      break;
    case 'super-bullet':
      result = {
        ...baseProjectile,
        width: 10,
        height: 8,
        lifetime: 305,
        knockback: 15,
      };
      break;
    case 'bat':
      result = {
        ...baseProjectile,
        width: 75,
        height: 75,
        lifetime: 3600,
        canBeDeflected: false,
        isReturning: true,
        hasHitForward: false,
        hasHitReturn: false,
      };
      break;
    case 'snowball':
      result = {
        ...baseProjectile,
        width: 24,
        height: 24,
        canBeDeflected: true,
      };
      break;
    case 'large-snowball':
      result = {
        ...baseProjectile,
        width: 33,
        height: 33,
        knockback: 140,
        lifetime: 1400,
        canBeDeflected: true,
      };
      break;
    case 'blizzard-stone':
      result = {
        ...baseProjectile,
        width: 45,
        height: 45,
        hasGravity: true,
        gravity: 600, // Heavy gravity for arcing
      };
      break;
    case 'net':
      result = {
        ...baseProjectile,
        width: 40,
        height: 40,
        hasGravity: true,
        gravity: 300,
        lifetime: 3500,
        canBeDeflected: false,
      };
      break;
    case 'hacker-missile':
      result = {
        ...baseProjectile,
        width: 24,
        height: 24,
        canBeDeflected: true,
      };
      break;
    case 'hacking':
      result = {
        ...baseProjectile,
        width: 1,
        height: 1,
        canBeDeflected: false,
        lifetime: 100,
      };
      break;
    default:
      result = baseProjectile;
      break;
  }

  // Treat provided x,y as the projectile center. Store as top-left for engine consistency.
  result.x = x - result.width / 2;
  result.y = y - result.height / 2;

  return result;
};


export const createHazardZone = (
  type: 'fire-pool' | 'toxic-pool' | 'tesla-coil' | 'electric-explosion' | 'bear-trap' | 'blizzard' | 'fire-ring' | 'packet-block-zone',
  ownerId: 1 | 2,
  x: number,
  y: number,
  damage: number,
  duration: number,
): HazardZone => {
  const base: HazardZone = {
    id: `${type}-${Date.now()}-${Math.random()}`,
    type,
    ownerId,
    x,
    y,
    width: type === 'toxic-pool' ? 125 : 190,
    height: type === 'toxic-pool' ? 125 : 190,
    damage,
    tickRate: 100, // Increased frequency (5x), damage per tick adjusted in useGameEngine
    lastTick: Date.now(),
    duration,
    createdAt: Date.now(),
  };

  if (type === 'tesla-coil') {
    return {
      ...base,
      width: 40,
      height: 60,
      health: 170, // Increased health
      maxHealth: 170,
      attackRange: 210, // Increased range (1.5x)
      attackCooldown: 175,
      lastAttack: Date.now(),
    };
  }

  if (type === 'bear-trap') {
    return {
      ...base,
      width: 45,
      height: 20,
      tickRate: 100,
    };
  }

  if (type === 'blizzard') {
    return {
      ...base,
      width: 400, // Circular area diameter (increased)
      height: 400,
      tickRate: 200, // Fast tick rate for smooth effect application
    };
  }

  if (type === 'fire-ring') {
    return {
      ...base,
      width: 180, // fire ring diameter
      height: 180,
      tickRate: 500, // 0.5 second tick
    };
  }

  if (type === 'packet-block-zone') {
    return {
      ...base,
      width: 250,
      height: 250,
      tickRate: 100, // Fast tick to ensure silence is applied
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
  canDeflect: boolean = false
): AttackHitbox => ({
  id: `attack-${Date.now()}-${Math.random()}`,
  ownerId,
  x,
  y,
  width,
  height,
  damage,
  duration,
  createdAt: Date.now(),
  knockback: 50,
  canDeflectProjectiles: canDeflect,
});
