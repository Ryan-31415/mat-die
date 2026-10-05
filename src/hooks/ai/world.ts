import { ARENA, PLAYER_SIZE, type Player } from '@/types/game';
import type { MapId } from '@/types/map';
import type { Platform } from '@/types/platform';
import { checkProjectileCollision, getProjectileCollisionTime, type AttackHitbox, type HazardZone, type Projectile } from '@/types/projectile';
import { stepProjectileMotion, POOL_SIZE } from '@/types/combatPhysics';

export interface LightningWarning { x: number; warningStart: number; struck: boolean }
export interface SoulZone { id: string; x: number; y: number; width: number; height: number; createdAt: number; duration: number }
export interface VineShield extends SoulZone { hp: number; destroyedAt?: number }
export interface AIWorld {
  players: readonly [Player, Player];
  projectiles: readonly Projectile[];
  hazardZones: readonly HazardZone[];
  attackHitboxes: readonly AttackHitbox[];
  platforms: readonly Platform[];
  mapId: MapId;
  now: number;
  deltaTime: number;
  isOvertime: boolean;
  roundTimeRemaining: number;
  sandstormActive: boolean;
  sandstormDirection: 'left' | 'right';
  sandstormTimer: number;
  lightningStrikes: readonly LightningWarning[];
  soulZones: readonly SoulZone[];
  vineShields: readonly VineShield[];
}
export const AI_DT = 1 / 60;
export const AI_STEPS = 48;
export interface ProjectilePath {
  projectile: Projectile;
  x: Float64Array;
  y: Float64Array;
  returning: Uint8Array;
  endStep: number;
}
export interface PredictedPool { ownerId: 1 | 2; x: number; y: number; width: number; height: number; impactTime: number }
export interface AIFrame {
  world: AIWorld;
  paths: ProjectilePath[];
  pools: PredictedPool[];
  vines: VineShield[];
  souls: SoulZone[];
  zones: HazardZone[];
  hitboxes: AttackHitbox[];
  signature: string;
}
export const activeVine = (v: VineShield, now: number) => v.hp > 0 && v.destroyedAt === undefined && now - v.createdAt <= v.duration;
export const overlapsPlayer = (point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }, margin = 0) =>
  point.x + PLAYER_SIZE + margin > rect.x && point.x - margin < rect.x + rect.width &&
  point.y + PLAYER_SIZE + margin > rect.y && point.y - margin < rect.y + rect.height;

/** Compile each trajectory once, shared by every action and controller in this tick. */
export function prepareAIFrame(world: AIWorld): AIFrame {
  const { now } = world;
  const vines = world.vineShields.filter(v => activeVine(v, now));
  const zones = world.hazardZones.filter(z => now - z.createdAt <= z.duration);
  const paths: ProjectilePath[] = world.projectiles.filter(p => now - p.createdAt <= p.lifetime).map(projectile => {
    const x = new Float64Array(AI_STEPS + 1), y = new Float64Array(AI_STEPS + 1);
    x[0] = projectile.x; y[0] = projectile.y;
    return { projectile, x, y, returning: new Uint8Array(AI_STEPS + 1), endStep: AI_STEPS };
  });
  const simulated = paths.map(path => ({ ...path.projectile }));
  const pools: PredictedPool[] = [];
  const destroyedVines = new Set<string>();
  // Step first, so a vine absorbs only one projectile rather than becoming infinite cover.
  for (let step = 1; step <= AI_STEPS; step++) {
    const dt = step === 1 ? Math.min(0.05, Math.max(0.001, world.deltaTime / 1000)) : AI_DT;
    const t = (step - 1) * AI_DT + Math.min(0.05, Math.max(0.001, world.deltaTime / 1000));
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index];
      if (step > path.endStep) continue;
      const previous = { x: simulated[index].x, y: simulated[index].y };
      const p = stepProjectileMotion(simulated[index], world.players[simulated[index].ownerId - 1], now + t * 1000, dt);
      path.x[step] = p.x; path.y[step] = p.y;
      path.returning[step] = p.returnPhase === 'returning' ? 1 : 0;
      if (now + t * 1000 - p.createdAt > p.lifetime) { path.endStep = step - 1; continue; }
      const surface = p.hasGravity && p.type !== 'meteor'
        ? world.platforms.find(platform => checkProjectileCollision(p, previous, platform)) : undefined;
      let vine: VineShield | undefined, vineTime = Infinity;
      if (!surface) for (const candidate of vines) {
        if (destroyedVines.has(candidate.id) || now + t * 1000 - candidate.createdAt > candidate.duration) continue;
        const contact = getProjectileCollisionTime(p, previous, candidate);
        if (contact !== null && contact < vineTime) { vine = candidate; vineTime = contact; }
      }
      const outside = p.x < -50 || p.x > ARENA.width + 50 || p.y > ARENA.height;
      if (surface || vine || outside) {
        if (vine) destroyedVines.add(vine.id);
        path.endStep = step;
        // Preserve the engine's impact policy: flasks/blizzard land on platforms;
        // other pools spawn at the boundary, while vines only consume the shot.
        if (!vine && (p.type === 'flask' || p.type === 'blizzard-stone' || (!surface && p.createsFirePool))) {
          const size = POOL_SIZE[p.type === 'flask' ? 'toxic-pool' : p.type === 'blizzard-stone' ? 'blizzard' : 'fire-pool'];
          let x = p.x + p.width / 2 - size / 2;
          if (surface && p.type === 'flask') x = Math.max(surface.x, Math.min(x, surface.x + surface.width - size));
          pools.push({ ownerId: p.ownerId, x, y: (surface?.y ?? p.y + p.height / 2) - size / 2, width: size, height: size, impactTime: t });
        }
      }
    }
  }
  return {
    world, paths, pools, vines, zones,
    souls: world.soulZones.filter(z => now - z.createdAt <= z.duration),
    hitboxes: world.attackHitboxes.filter(h => now - h.createdAt <= h.duration),
    signature: `${world.mapId}:${world.sandstormActive}:${world.sandstormDirection}:${zones.map(z => z.id).join(',')}:${vines.map(v => v.id).join(',')}:${world.soulZones.map(z => z.id).join(',')}:${world.lightningStrikes.filter(s => !s.struck).map(s => s.warningStart).join(',')}`,
  };
}
