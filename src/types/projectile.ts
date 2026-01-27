// Projectile Types

export type ProjectileType =
  | 'arrow'
  | 'poison-arrow'
  | 'fireball'
  | 'large-fireball'
  | 'flask'
  | 'electric-orb'
  | 'meteor';

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
}

export interface HazardZone {
  id: string;
  type: 'fire-pool' | 'toxic-pool' | 'tesla-coil' | 'electric-explosion';
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
  };

  switch (type) {
    case 'arrow':
      return {
        ...baseProjectile,
        width: 40,
        height: 5,
        hasGravity: true,
        gravity: 170,
      };
    case 'poison-arrow':
      return {
        ...baseProjectile,
        width: 40,
        height: 5,
        hasGravity: true,
        gravity: 170,
        isPoisonous: true,
        poisonDuration: 6000,
        slowAmount: 0.3,
        slowDuration: 6000,
      };
    case 'fireball':
      return {
        ...baseProjectile,
        width: 24,
        height: 24,
        isExplosive: true,
        explosionRadius: 40,
        canBeDeflected: false,
      };
    case 'large-fireball':
      return {
        ...baseProjectile,
        width: 50,
        height: 50,
        isExplosive: true,
        explosionRadius: 200,
        createsFirePool: true,
        firePoolDuration: 4000,
        canBeDeflected: false,
      };
    case 'meteor':
      return {
        ...baseProjectile,
        width: 30,
        height: 30,
        hasGravity: true,
        gravity: 600,
        isExplosive: true,
        explosionRadius: 55,
        canBeDeflected: false,
      };
    case 'flask':
      return {
        ...baseProjectile,
        width: 20,
        height: 20,
        hasGravity: true,
        gravity: 320,
        isExplosive: true,
        explosionRadius: 35,
        createsFirePool: true,
        firePoolDuration: 3000,
      };
    case 'electric-orb':
      return {
        ...baseProjectile,
        width: 33,
        height: 33,
        isExplosive: true,
        explosionRadius: 85,
        knockback: 175,
        slowAmount: 0.5,
        slowDuration: 4500,
        stunDuration: 1000,
        canBeDeflected: false,
      };
    default:
      return baseProjectile;
  }
};

export const createHazardZone = (
  type: 'fire-pool' | 'toxic-pool' | 'tesla-coil' | 'electric-explosion',
  ownerId: 1 | 2,
  x: number,
  y: number,
  damage: number,
  duration: number
): HazardZone => {
  const base: HazardZone = {
    id: `${type}-${Date.now()}-${Math.random()}`,
    type,
    ownerId,
    x,
    y,
    width: type === 'toxic-pool' ? 100 : 120,
    height: type === 'toxic-pool' ? 100 : 120,
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
