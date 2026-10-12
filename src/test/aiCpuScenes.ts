import { CHARACTERS, createInitialPlayer, type CharacterType } from '@/types/game';
import { MAPS, type MapId } from '@/types/map';
import { createHazardZone, createProjectile } from '@/types/projectile';
import type { AIWorld } from '@/hooks/ai/world';

/** Fixed public observations, never an engine or a combat simulation. */
export function cpuScene(count: number, character: CharacterType = 'archer', mapId: MapId = 'default', variant = 0): AIWorld {
  const now = 10000;
  const context = { now, random: () => 0.5 };
  const enemy = { ...createInitialPlayer(1, CHARACTERS[variant ? 'gladiator' : 'mage']),
    x: variant ? 310 : 600, y: 440, facingRight: false, isShielding: !!variant };
  const player = { ...createInitialPlayer(2, CHARACTERS[character]), x: 200, y: 440,
    facingRight: !variant, lastGroundedTime: now,
    archerBurstRemaining: character === 'archer' && variant ? 5 : 0,
    archerBurstCooldown: 0, attackCooldownRemaining: variant ? 16 : 0,
    isChargingSkill: character === 'scientist' && !!variant };
  return { players: [enemy, player], now, deltaTime: 1000 / 60, mapId,
    platforms: MAPS[mapId].platforms,
    projectiles: Array.from({ length: count }, (_, i) => ({
      ...createProjectile(variant && i % 3 === 0 ? 'homing-rocket' : 'fireball', 1,
        250 + i % 20 * 24, 80 + i % 5 * 65, -780, 0, 18, context), id: 'cost-shot-' + i })),
    hazardZones: variant ? [createHazardZone('tesla-coil', 1, 390, 440, 10, 10000, context)] : [],
    attackHitboxes: [], roundTimeRemaining: 60, isOvertime: false,
    sandstormActive: mapId === 'wasteland' && !!variant, sandstormDirection: 'right', sandstormTimer: 1500,
    lightningStrikes: [], soulZones: [], vineShields: [] };
}
