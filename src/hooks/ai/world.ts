import { ARENA, PLAYER_SIZE, type Player } from '@/types/game';
import type { AIForecasts } from '@/types/ai';
import { forecastPoint, forecastTime, sampleForecastError, type ForecastError } from './forecast';
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
  steps: number;
  times: Float64Array;
  forecasts?: AIForecasts;
  environmentErrors: Map<string, ForecastError>;
  opponentError?: ForecastError;
}
export const activeVine = (v: VineShield, now: number) => v.hp > 0 && v.destroyedAt === undefined && now - v.createdAt <= v.duration;
export const overlapsPlayer = (point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }, margin = 0) =>
  point.x + PLAYER_SIZE + margin > rect.x && point.x - margin < rect.x + rect.width &&
  point.y + PLAYER_SIZE + margin > rect.y && point.y - margin < rect.y + rect.height;

/** Compile each trajectory once, shared by every action and controller in this tick. */
export function prepareAIFrame(world: AIWorld, options?: { forecasts: AIForecasts; random: () => number }): AIFrame {
  const { now } = world;
  const firstDt = Math.min(0.05, Math.max(0.001, world.deltaTime / 1000));
  const horizon = options ? Math.max(...Object.values(options.forecasts).map(f => f.horizonMs)) / 1000 : (AI_STEPS - 1) * AI_DT + firstDt;
  const steps = options ? Math.max(1, 1 + Math.ceil(Math.max(0, horizon - firstDt) / AI_DT - 1e-9)) : AI_STEPS;
  const times = new Float64Array(steps + 1);
  for (let i = 1; i <= steps; i++) times[i] = options ? Math.min(horizon || firstDt, firstDt + (i - 1) * AI_DT) : firstDt + (i - 1) * AI_DT;
  const environmentErrors = new Map<string, ForecastError>();
  if (options) {
    for (const entity of [...world.hazardZones, ...world.vineShields, ...world.soulZones]) environmentErrors.set(entity.id, sampleForecastError(options.forecasts.environment, options.random));
    for (const strike of world.lightningStrikes) environmentErrors.set('lightning:' + strike.x + ':' + strike.warningStart, sampleForecastError(options.forecasts.environment, options.random));
    environmentErrors.set('wind', sampleForecastError(options.forecasts.environment, options.random));
  }
  const vines = world.vineShields.filter(v => activeVine(v, now));
  const zones = world.hazardZones.filter(z => now - z.createdAt <= z.duration);
  const paths: ProjectilePath[] = world.projectiles.filter(p => now - p.createdAt <= p.lifetime).map(projectile => {
    const x = new Float64Array(steps + 1), y = new Float64Array(steps + 1);
    x[0] = projectile.x; y[0] = projectile.y;
    return { projectile, x, y, returning: new Uint8Array(steps + 1), endStep: options ? Math.max(1, Array.from(times).filter(t => t > 0 && t * 1000 <= options.forecasts.projectiles.horizonMs + 1e-6).length) : AI_STEPS };
  });
  const errors = options ? paths.map(() => sampleForecastError(options.forecasts.projectiles, options.random)) : [];
  const simulatedTimes = paths.map(() => 0);
  const simulated = paths.map(path => ({ ...path.projectile }));
  const pools: PredictedPool[] = [];
  const destroyedVines = new Set<string>();
  // Step first, so a vine absorbs only one projectile rather than becoming infinite cover.
  for (let step = 1; step <= steps; step++) {
    const t = times[step];
    const dt = times[step] - times[step - 1];
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index];
      if (step > path.endStep) continue;
      const previous = { x: path.x[step - 1], y: path.y[step - 1] };
      const sampleTime = options && options.forecasts.projectiles.horizonMs > 0 ? forecastTime(options.forecasts.projectiles, errors[index], t) : options ? 0 : t;
      const motionDt = options ? sampleTime - simulatedTimes[index] : dt;
      const p = stepProjectileMotion(simulated[index], world.players[simulated[index].ownerId - 1], now + sampleTime * 1000, motionDt);
      simulatedTimes[index] = sampleTime;
      const projected = options ? forecastPoint(p, options.forecasts.projectiles, errors[index], t) : p;
      path.x[step] = projected.x; path.y[step] = projected.y;
      path.returning[step] = p.returnPhase === 'returning' ? 1 : 0;
      if (now + sampleTime * 1000 - p.createdAt > p.lifetime) { path.endStep = step - 1; continue; }
      const surface = p.hasGravity && p.type !== 'meteor'
        ? world.platforms.find(platform => checkProjectileCollision(projected, previous, platform)) : undefined;
      let vine: VineShield | undefined, vineTime = Infinity;
      if (!surface) for (const candidate of vines) {
        const forecast = options?.forecasts.environment;
        if (forecast && step > 1 && t * 1000 > forecast.horizonMs) continue;
        const error = environmentErrors.get(candidate.id);
        const at = forecast && error ? forecastTime(forecast, error, t) : t;
        if (destroyedVines.has(candidate.id) || now + at * 1000 - candidate.createdAt > candidate.duration) continue;
        const obstacle = forecast && error ? forecastPoint(candidate, forecast, error, t) : candidate;
        const contact = getProjectileCollisionTime(projected, previous, obstacle);
        if (contact !== null && contact < vineTime) { vine = candidate; vineTime = contact; }
      }
      const outside = projected.x < -50 || projected.x > ARENA.width + 50 || projected.y > ARENA.height;
      if (surface || vine || outside) {
        if (vine) destroyedVines.add(vine.id);
        path.endStep = step;
        // Preserve the engine's impact policy: flasks/blizzard land on platforms;
        // other pools spawn at the boundary, while vines only consume the shot.
        if (!vine && (p.type === 'flask' || p.type === 'blizzard-stone' || (!surface && p.createsFirePool))) {
          const size = POOL_SIZE[p.type === 'flask' ? 'toxic-pool' : p.type === 'blizzard-stone' ? 'blizzard' : 'fire-pool'];
          let x = projected.x + p.width / 2 - size / 2;
          if (surface && p.type === 'flask') x = Math.max(surface.x, Math.min(x, surface.x + surface.width - size));
          pools.push({ ownerId: p.ownerId, x, y: (surface?.y ?? projected.y + p.height / 2) - size / 2, width: size, height: size, impactTime: t });
        }
      }
    }
  }
  return {
    world, paths, pools, vines, zones, steps, times, forecasts: options?.forecasts, environmentErrors,
    opponentError: options ? sampleForecastError(options.forecasts.opponent, options.random) : undefined,
    souls: world.soulZones.filter(z => now - z.createdAt <= z.duration),
    hitboxes: world.attackHitboxes.filter(h => now - h.createdAt <= h.duration),
    signature: `${world.mapId}:${world.sandstormActive}:${world.sandstormDirection}:${zones.map(z => z.id).join(',')}:${vines.map(v => v.id).join(',')}:${world.soulZones.map(z => z.id).join(',')}:${world.lightningStrikes.filter(s => !s.struck).map(s => s.warningStart).join(',')}`,
  };
}
