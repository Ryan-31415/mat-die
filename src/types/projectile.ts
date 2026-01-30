// Projectile Types

export type ProjectileType =
  | 'arrow'
  | 'poison-arrow'
  | 'fireball'
  | 'large-fireball'
  | 'flask'
  | 'electric-orb'
  | 'meteor'
  | 'bullet'
  | 'super-bullet'
  | 'bat'
  | 'snowball'
  | 'large-snowball';

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
}

export interface HazardZone {
  id: string;
  type: 'fire-pool' | 'toxic-pool' | 'tesla-coil' | 'electric-explosion' | 'bear-trap' | 'blizzard';
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
  };

  let result: Projectile = { ...baseProjectile };

  switch (type) {
    case 'arrow':
      result = {
        ...baseProjectile,
        width: 40,
        height: 5,
        hasGravity: true,
        gravity: 170,
      };
      break;
    case 'poison-arrow':
      result = {
        ...baseProjectile,
        width: 40,
        height: 5,
        hasGravity: true,
        gravity: 170,
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
        canBeDeflected: false,
      };
      break;
    case 'large-fireball':
      result = {
        ...baseProjectile,
        width: 50,
        height: 50,
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
        width: 30,
        height: 30,
        hasGravity: true,
        gravity: 600,
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
        slowDuration: 4500,
        stunDuration: 1000,
        canBeDeflected: false,
      };
      break;
    case 'bullet':
      result = {
        ...baseProjectile,
        width: 10,
        height: 8,
        lifetime: 320,
        knockback: 10,
      };
      break;
    case 'super-bullet':
      result = {
        ...baseProjectile,
        width: 15,
        height: 12,
        lifetime: 300,
        knockback: 35,
      };
      break;
    case 'bat':
      result = {
        ...baseProjectile,
        width: 75,
        height: 75,
        lifetime: 3000,
        canBeDeflected: false,
        isReturning: true,
        hasHitForward: false,
        hasHitReturn: false,
      };
      break;
    case 'snowball':
      result = {
        ...baseProjectile,
        width: 16,
        height: 16,
        slowAmount: 0.15,
        slowDuration: 1000,
        canBeDeflected: true,
      };
      break;
    case 'large-snowball':
      result = {
        ...baseProjectile,
        width: 40,
        height: 40,
        knockback: 100,
        canBeDeflected: false,
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
  type: 'fire-pool' | 'toxic-pool' | 'tesla-coil' | 'electric-explosion' | 'bear-trap' | 'blizzard',
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
      width: 800, // full arena width
      height: 500, // full arena height
      tickRate: 500,
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
