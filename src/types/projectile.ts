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
  type: 'fire-pool' | 'toxic-pool' | 'tesla-coil';
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
        width: 20,
        height: 6,
        hasGravity: true,
        gravity: 200,
      };
    case 'poison-arrow':
      return {
        ...baseProjectile,
        width: 20,
        height: 6,
        hasGravity: true,
        gravity: 200,
        isPoisonous: true,
        poisonDuration: 6000,
        slowAmount: 0.1,
        slowDuration: 6000,
      };
    case 'fireball':
      return {
        ...baseProjectile,
        width: 16,
        height: 16,
        isExplosive: true,
        explosionRadius: 30,
        canBeDeflected: false,
      };
    case 'large-fireball':
      return {
        ...baseProjectile,
        width: 30,
        height: 30,
        isExplosive: true,
        explosionRadius: 50,
        createsFirePool: true,
        firePoolDuration: 4000,
        canBeDeflected: false,
      };
    case 'meteor':
      return {
        ...baseProjectile,
        width: 20,
        height: 20,
        hasGravity: true,
        gravity: 400,
        isExplosive: true,
        explosionRadius: 40,
        canBeDeflected: false,
      };
    case 'flask':
      return {
        ...baseProjectile,
        width: 14,
        height: 14,
        hasGravity: true,
        gravity: 350,
        isExplosive: true,
        explosionRadius: 35,
        createsFirePool: true,
        firePoolDuration: 3000,
      };
    case 'electric-orb':
      return {
        ...baseProjectile,
        width: 24,
        height: 24,
        isExplosive: true,
        explosionRadius: 60,
        knockback: 150,
        slowAmount: 0.2,
        slowDuration: 4000,
        stunDuration: 1000,
        canBeDeflected: false,
      };
    default:
      return baseProjectile;
  }
};

export const createHazardZone = (
  type: 'fire-pool' | 'toxic-pool' | 'tesla-coil',
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
    width: 60,
    height: 60,
    damage,
    tickRate: 500,
    lastTick: Date.now(),
    duration,
    createdAt: Date.now(),
  };

  if (type === 'tesla-coil') {
    return {
      ...base,
      width: 40,
      height: 60,
      health: 50,
      maxHealth: 50,
      attackRange: 150,
      attackCooldown: 200,
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
