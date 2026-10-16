import { ARENA, PLAYER_SIZE, type Player } from '@/types/game';
import type { AIForecasts } from '@/types/ai';
import { forecastPoint, forecastTime, sampleForecastError, type ForecastError } from './forecast';
import type { MapId } from '@/types/map';
import type { Platform } from '@/types/platform';
import { checkProjectileCollision, getProjectileCollisionTime, projectileImpactZone, projectilePierces, type AttackHitbox, type HazardZone, type Projectile } from '@/types/projectile';
import { stepProjectileMotion, stepCoilMotion, playerOverlapsRect, circleIntersectsRect, POOL_SIZE, findProjectileCoilContact } from '@/types/combatPhysics';
import { advanceCoilForecast } from './coil';

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
  coilContacts: { coilId: string; step: number; rawDamage: number }[];
  forecastError?: ForecastError;
}
export interface PredictedPool { ownerId: 1 | 2; x: number; y: number; width: number; height: number; type?: HazardZone['type']; impactTime: number; damage?: number; duration?: number; sourceProjectileId?: string }
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
  coilPaths: Map<string, Float64Array>;
  coilSnapshots: ReadonlyMap<number, readonly HazardZone[]>;
  opponentError?: ForecastError;
}
export const activeVine = (v: VineShield, now: number) => v.hp > 0 && v.destroyedAt === undefined && now - v.createdAt <= v.duration;
export const overlapsPlayer = playerOverlapsRect;

/** Blizzard uses the engine's body/circle contact, including tangency. Other
 * hazards retain their existing rectangular safety margin. */
export function hazardOverlapsPlayer(point: { x: number; y: number },
  zone: { x: number; y: number; width: number; height: number; type?: HazardZone['type'] }, margin = 0) {
  return zone.type === 'blizzard'
    ? circleIntersectsRect(zone, { x: point.x, y: point.y, width: PLAYER_SIZE, height: PLAYER_SIZE })
    : playerOverlapsRect(point, zone, margin);
}

/** Compile each trajectory once, shared by every action and controller in this tick. */
export function prepareAIFrame(world: AIWorld, options?: { forecasts: AIForecasts; random: () => number }): AIFrame {
  const { now } = world;
  const firstDt = Math.max(0.001, world.deltaTime / 1000);
  // The first step is the callback currently being decided, even when a future
  // forecast is disabled or shorter than that callback. Never truncate its motion.
  const horizon = options ? Math.max(firstDt, ...Object.values(options.forecasts).map(f => f.horizonMs / 1000)) : (AI_STEPS - 1) * AI_DT + firstDt;
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
  const coilPaths = new Map<string, Float64Array>();
  for (const zone of world.hazardZones) if (zone.type === 'tesla-coil') {
    const copy = { ...zone }, y = new Float64Array(steps + 1);
    y[0] = copy.y;
    let previousTime = 0;
    const environment = options?.forecasts.environment, error = environmentErrors.get(zone.id);
    for (let step = 1; step <= steps; step++) {
      const time = environment && error ? forecastTime(environment, error, times[step]) : times[step];
      if (!(copy.health !== undefined && copy.health <= 0) && now + Math.max(0, time - firstDt) * 1000 - copy.createdAt <= copy.duration) {
        stepCoilMotion(copy, world.platforms, (time - previousTime) * 1000);
      }
      y[step] = copy.y; previousTime = time;
    }
    coilPaths.set(zone.id, y);
  }
  const paths: ProjectilePath[] = world.projectiles.filter(p => now - p.createdAt <= p.lifetime).map(projectile => {
    const x = new Float64Array(steps + 1), y = new Float64Array(steps + 1);
    x[0] = projectile.x; y[0] = projectile.y;
    return { projectile, x, y, returning: new Uint8Array(steps + 1), coilContacts: [], endStep: options ? Math.max(1, Array.from(times).filter(t => t > 0 && t * 1000 <= options.forecasts.projectiles.horizonMs + 1e-6).length) : AI_STEPS };
  });
  const errors = options ? paths.map(() => sampleForecastError(options.forecasts.projectiles, options.random)) : [];
  paths.forEach((path, index) => { path.forecastError = errors[index]; });
  const simulatedTimes = paths.map(() => 0);
  const simulated = paths.map(path => ({ ...path.projectile }));
  const pools: PredictedPool[] = [];
  const destroyedVines = new Set<string>();
  let coils = world.hazardZones.filter(zone => zone.type === 'tesla-coil').map(zone => ({ ...zone }));
  const coilDamage = new Map<string, number>();
  const coilSnapshots = new Map<number, readonly HazardZone[]>();
  // Step first, so a vine absorbs only one projectile rather than becoming infinite cover.
  for (let step = 1; step <= steps; step++) {
    const t = times[step];
    const dt = times[step] - times[step - 1];
    coilDamage.clear();
    const environment = options?.forecasts.environment;
    const contactCoils = coils.length && (!environment || step === 1 || t * 1000 <= environment.horizonMs)
      ? coils.map(coil => {
        const error = environmentErrors.get(coil.id);
        const point = { ...coil, y: coilPaths.get(coil.id)?.[step - 1] ?? coil.y };
        return environment && error ? forecastPoint(point, environment, error, t) : point;
      }) : [];
    if (contactCoils.length) coilSnapshots.set(step, contactCoils);
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index];
      if (step > path.endStep) continue;
      const previous = { x: path.x[step - 1], y: path.y[step - 1] };
      const sampleTime = options && options.forecasts.projectiles.horizonMs > 0 ? forecastTime(options.forecasts.projectiles, errors[index], t) : options ? 0 : t;
      const motionDt = options ? sampleTime - simulatedTimes[index] : dt;
      const target = world.players[simulated[index].ownerId === 1 ? 1 : 0];
      const sampleNow = now + Math.max(0, sampleTime - firstDt) * 1000;
      const p = stepProjectileMotion(simulated[index], world.players[simulated[index].ownerId - 1], sampleNow, motionDt,
        { x: target.x + target.velocityX * sampleTime, y: target.y + target.velocityY * sampleTime, isInvisible: target.isInvisible });
      simulatedTimes[index] = sampleTime;
      const projected = options ? forecastPoint(p, options.forecasts.projectiles, errors[index], t) : p;
      path.x[step] = projected.x; path.y[step] = projected.y;
      path.returning[step] = p.returnPhase === 'returning' ? 1 : 0;
      if (sampleNow - p.createdAt > p.lifetime) { path.endStep = step - 1; continue; }
      // Collision needs only the predicted rectangle, not a copy of every status.
      const targetPosition = { x: target.x + target.velocityX * t, y: target.y + target.velocityY * t,
        width: PLAYER_SIZE, height: PLAYER_SIZE };
      const bodyTime = p.type === 'bat' && (p.returnPhase === 'returning' ? p.hasHitReturn : p.hasHitForward)
        ? Infinity
        : getProjectileCollisionTime(projected, previous, targetPosition) ?? Infinity;
      const bodyBlockTime = projectilePierces(p, 'player') ? Infinity : bodyTime;
      const swordTime = world.attackHitboxes.reduce((first, hitbox) => hitbox.ownerId !== p.ownerId &&
        hitbox.canDeflectProjectiles && sampleNow - hitbox.createdAt <= hitbox.duration
        ? Math.min(first, getProjectileCollisionTime(projected, previous, hitbox) ?? Infinity) : first, Infinity);
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
        if (contact !== null && contact < vineTime && contact < Math.min(bodyBlockTime, swordTime)) { vine = candidate; vineTime = contact; }
      }
      const outside = projected.x < -50 || projected.x > ARENA.width + 50 || projected.y > ARENA.height;
      if (vine) destroyedVines.add(vine.id);
      if (surface || vine || outside) {
        const terminal = !!surface || outside || !vine || !projectilePierces(p, 'vine');
        if (terminal) path.endStep = step;
        const impact = projectileImpactZone(p);
        if (impact && (vine || surface || outside)) {
          const contact = vine ? vineTime : surface ? getProjectileCollisionTime(projected, previous, surface) ?? 1 : 1;
          const impactX = previous.x + (projected.x - previous.x) * contact + p.width / 2;
          const impactY = surface ? surface.y : previous.y + (projected.y - previous.y) * contact + p.height / 2;
          const size = impact.type === 'blizzard' ? POOL_SIZE.blizzard
            : impact.isNapalm ? Math.max(p.explosionRadius, p.width / 2, p.height / 2) * 2
              : POOL_SIZE[impact.type];
          let x = impactX - size / 2;
          if (surface && impact.type === 'toxic-pool') x = Math.max(surface.x, Math.min(x, surface.x + surface.width - size));
          pools.push({ ownerId: p.ownerId, type: impact.type, x, y: impactY - size / 2, width: size, height: size,
            impactTime: t, damage: impact.damage, duration: impact.duration, sourceProjectileId: p.id });
        }
        if (terminal) continue;
      }
      // Endpoint contact occurs after surfaces/vines, before sword/body and
      // before ALL same-callback coil damage, expiry, decay and falling.
      const coilCandidate = contactCoils.length ? findProjectileCoilContact(projected, contactCoils, previous) : undefined;
      const coilTime = coilCandidate ? getProjectileCollisionTime(projected, previous, coilCandidate) ?? Infinity : Infinity;
      const coil = coilTime < Math.min(bodyBlockTime, swordTime, vineTime) ? coilCandidate : undefined;
      if (coil) {
        path.coilContacts.push({ coilId: coil.id, step, rawDamage: p.damage });
        coilDamage.set(coil.id, (coilDamage.get(coil.id) ?? 0) + p.damage);
        const impact = projectileImpactZone(p);
        if (impact) {
          const size = impact.type === 'blizzard' ? POOL_SIZE.blizzard
            : impact.isNapalm ? Math.max(p.explosionRadius, p.width / 2, p.height / 2) * 2
              : POOL_SIZE[impact.type];
          const contact = getProjectileCollisionTime(projected, previous, coil) ?? 1;
          const impactX = previous.x + (projected.x - previous.x) * contact + p.width / 2;
          const impactY = previous.y + (projected.y - previous.y) * contact + p.height / 2;
          pools.push({ ownerId: p.ownerId, type: impact.type,
            x: impactX - size / 2,
            y: impactY - size / 2,
            width: size, height: size, impactTime: t,
            damage: impact.damage, duration: impact.duration, sourceProjectileId: p.id });
        }
        if (projectilePierces(p, 'coil')) p.hitCoilIds = [...(p.hitCoilIds ?? []), coil.id];
        else path.endStep = step - 1;
      }
    }
    if (coils.length) coils = advanceCoilForecast(coils, world.platforms, now + Math.max(0, t - firstDt) * 1000, dt * 1000, coilDamage);
  }
  return {
    world, paths, pools, vines, zones, steps, times, forecasts: options?.forecasts, environmentErrors, coilPaths, coilSnapshots,
    opponentError: options ? sampleForecastError(options.forecasts.opponent, options.random) : undefined,
    souls: world.soulZones.filter(z => now - z.createdAt <= z.duration),
    hitboxes: world.attackHitboxes.filter(h => now - h.createdAt <= h.duration),
    signature: `${world.mapId}:${world.sandstormActive}:${world.sandstormDirection}:${zones.map(z => z.id).join(',')}:${vines.map(v => v.id).join(',')}:${world.soulZones.map(z => z.id).join(',')}:${world.lightningStrikes.filter(s => !s.struck).map(s => s.warningStart).join(',')}`,
  };
}
