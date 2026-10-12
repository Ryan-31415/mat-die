import { ARENA, PLAYER_SIZE, type Player } from '@/types/game';
import { GRAVITY, JUMP_FORCE, MAX_FALL_SPEED, COYOTE_TIME } from '@/types/platform';
import { checkProjectileCollision, getProjectileCollisionTime } from '@/types/projectile';
import { clampPlayerX, FLOOR_Y, LIGHTNING_RADIUS, LIGHTNING_WARNING_MS, NINJA_DASH_DISTANCE, playerMoveSpeed, platformCollision, sandstormImpulse, shieldFacesX, stepProjectileMotion, POOL_SIZE, findProjectileCoilContact } from '@/types/combatPhysics';
import { opponentLineRisk } from './matchup';
import type { KeyboardState } from '../useKeyboard';
import { createOpponentModel, predictOpponent, type Direction, type OpponentModel } from './learning';
import { createAIMemory, type AIMemory } from './state';
import { hazardRisk, isMelee, selectGoal, support } from './navigation';
import { AI_DT, AI_STEPS, overlapsPlayer, type AIFrame } from './world';
import { chooseCombat, type CombatProposal } from './combat';
import { AI_PRESETS, NEUTRAL_AI_TRAITS, type AIDecisionOptions } from '@/types/ai';
import { gaussian } from './random';
import { forecastPoint, forecastTime, sampleForecastError } from './forecast';
import { predictActionStart } from './actionStart';
import { meleeOpportunityAt } from './meleeOpportunity';
import { scientistChargeMotion } from './charge';
import { coilExposure, singleCoilSurvivalContext, type CoilClearOutcome } from './coilClear';
import { archerShotOutcome, type ArcherShotOutcome } from './archerShot';

export type Action = { direction: Direction; jump: boolean; drop: boolean };
export const emptyAIKeys = (): KeyboardState => ({
  a: false, d: false, w: false, s: false, space: false, f: false, g: false, h: false,
  arrowLeft: false, arrowRight: false, arrowUp: false, arrowDown: false, enter: false, shift: false, backslash: false,
});
export interface AIDecision {
  keys: KeyboardState; memory: AIMemory; risk: number;
  coilDecision?: { coilId: string; reason: 'escape' | 'clear-to-survive';
    predictedDamageBefore: number; predictedDamageAfter: number; manaCost: number; lethalAtMs: number };
}
/** Optional evaluation output built from the actual permitted decision frame.
 * Candidate scores are movement scores, not counterfactual height-goal scores.
 */
export interface PositionDecision {
  now: number; strategy: AIMemory['strategy'];
  self: { x: number; y: number; platformId?: string };
  opponent: { x: number; y: number; platformId?: string };
  goal: { x: number; y: number; platformId?: string };
  /** First sample matching existing support tolerance, not exact landing time. */
  forecastLanding?: { x: number; y: number; timeMs: number; platformId: string; confidence: number };
  patterns: { samples: number; jumps: number; jumpCadences: number; reactions: number; reactionJumps: number; turns: number };
  /** Final controller intent before difficulty input precision and delay are applied. */
  executed: { action: Action; attack: boolean; skill: boolean; risk: number };
  movementCandidates: { action: Action; risk: number; benefit: number; score: number }[];
}

/** Deterministic: neither the frame, the learning model nor the prior memory is mutated. */
export function decideAI(frame: AIFrame, player: Player, model: OpponentModel = createOpponentModel(), previous?: AIMemory, options?: AIDecisionOptions,
  diagnosePosition?: (decision: PositionDecision) => void): AIDecision {
  const parameters = options?.parameters ?? AI_PRESETS.perfect;
  const traits = options?.traits ?? NEUTRAL_AI_TRAITS;
  const prediction = parameters.prediction / 100;
  const learning = parameters.learning / 100;
  if (learning < 1) model = {
    ...model, samples: Math.floor(model.samples.length * learning) ? model.samples.slice(-Math.floor(model.samples.length * learning)) : [],
    turnCount: model.turnCount * learning, jumpCadenceCount: model.jumpCadenceCount * learning,
    reactionCount: model.reactionCount * learning, attackCount: model.attackCount * learning,
  };
  if (learning === 0) model = { ...createOpponentModel(), last: model.last, velocityX: model.velocityX };
  const { world } = frame;
  const { platforms, now, mapId, isOvertime } = world;
  const opponent = world.players[player.id === 1 ? 1 : 0];
  const keys = emptyAIKeys();
  if (!player.character || !opponent.character || player.health <= 0 || opponent.health <= 0) return { keys, memory: previous ?? createAIMemory(player, now), risk: 0 };
  const { goal, memory, strategy } = selectGoal(player, opponent, frame, previous, parameters.character / 100, traits);
  if (player.isStunned || player.isFrozen) { memory.movement = undefined; return { keys, memory, risk: 0 }; }
  const id = player.character.id;
  const archerTactics = id === 'archer' && parameters.character >= 50;
  const toward: Direction = opponent.x >= player.x ? 1 : -1;
  const speed = playerMoveSpeed(player, now);
  const lowHealth = player.health < player.maxHealth * 0.35;
  const zones = frame.zones.filter(z => z.ownerId !== player.id);
  const paths = frame.paths.filter(p => p.projectile.ownerId !== player.id && !p.projectile.isHackUltimate);
  const pools = frame.pools.filter(p => p.ownerId !== player.id && (player.isClone || !paths.some(path => path.projectile.id === p.sourceProjectileId && path.projectile.type === 'homing-rocket')));
  const warnings = world.lightningStrikes.filter(s => !s.struck && now - s.warningStart <= LIGHTNING_WARNING_MS);
  const hitboxes = frame.hitboxes.filter(h => h.ownerId !== player.id);
  const canJump = !player.isJumping && !player.rootDuration && (player.isGrounded || now - player.lastGroundedTime < COYOTE_TIME);
  const currentPlatform = support(player, platforms);

  const forecast = options?.parameters.forecasts.opponent ?? frame.forecasts?.opponent;
  const enemyFuture = [{ x: opponent.x, y: opponent.y, confidence: 0 }];
  const forecastHorizon = forecast ? prediction > 0 ? forecast.horizonMs / 1000 : 0 : AI_STEPS * AI_DT;
  predictOpponent(model, opponent, forecastHorizon, platforms, now, true, enemyFuture);
  const error = forecast && prediction > 0 ? frame.opponentError ?? sampleForecastError(forecast, options?.random ?? (() => 0.5)) : { x: 0, y: 0, time: 0 };
  const targetCache = new Map<number, ReturnType<typeof predictOpponent>>();
  const targetAt = (time: number) => {
    if (forecast) {
      const cached = archerTactics ? targetCache.get(time) : undefined;
      if (cached) return cached;
      const sample = forecastTime(forecast, error, Math.min(time, forecastHorizon));
      const index = Math.min(enemyFuture.length - 1, Math.floor(sample * 60));
      const next = Math.min(enemyFuture.length - 1, index + 1);
      const start = Math.min(forecastHorizon, index / 60), end = Math.min(forecastHorizon, next / 60);
      const ratio = end > start ? Math.max(0, Math.min(1, (sample - start) / (end - start))) : 0;
      const from = enemyFuture[index], to = enemyFuture[next];
      const point = forecastPoint({ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio, confidence: from.confidence }, forecast, error, Math.min(time, forecastHorizon));
      const result = { ...point, x: opponent.x + (point.x - opponent.x) * prediction, y: opponent.y + (point.y - opponent.y) * prediction };
      if (archerTactics) targetCache.set(time, result);
      return result;
    }
    const tick = Math.round(time * 60);
    if (tick >= 0 && tick < enemyFuture.length) return enemyFuture[tick];
    let result = targetCache.get(tick);
    if (!result) { result = predictOpponent(model, opponent, tick / 60, platforms, now, true); targetCache.set(tick, result); }
    return result;
  };
  const targets = Array.from({ length: frame.steps + 1 }, (_, step) => targetAt(frame.times[step]));
  const environment = options?.parameters.forecasts.environment ?? frame.forecasts?.environment;
  const projectileForecast = options?.parameters.forecasts.projectiles ?? frame.forecasts?.projectiles;
  const environmentPoint = <T extends { x: number; y: number; id: string }>(entity: T, elapsed: number, step?: number): T => {
    const error = frame.environmentErrors.get(entity.id);
    const coil = frame.coilPaths.get(entity.id);
    const point = coil && step !== undefined ? { ...entity, y: coil[step] } : entity;
    return environment && error ? forecastPoint(point, environment, error, elapsed) : point;
  };
  const environmentTime = (id: string, elapsed: number) => {
    const error = frame.environmentErrors.get(id);
    return environment && error ? forecastTime(environment, error, elapsed) : elapsed;
  };
  function evaluate(action: Readonly<Action>, skill = player.isShielding || player.isChargingSkill, sampleNoise = true,
    clear?: CoilClearOutcome, track = false) {
    const input = { left: action.direction < 0, right: action.direction > 0, jump: action.jump, down: action.drop };
    const raw = player.isHacked ? { left: input.right, right: input.left, jump: input.down, down: input.jump } : input;
    const start = predictActionStart(world, player, raw, skill);
    const chargeMotion = id === 'scientist' ? scientistChargeMotion(world, player, start, skill) : undefined;
    const point = { x: player.x, y: player.y };
    const trajectory = track ? [{ ...point }] : undefined;
    let vy = action.jump && canJump ? JUMP_FORCE : player.velocityY;
    let vx = player.velocityX, kx = player.knockbackVelocityX, ky = player.knockbackVelocityY;
    let risk = 0, travelCost = 0, benefit = 0, elapsed = 0;
    let firePoint: { x: number; y: number; facingRight: boolean; leadMs: number } | undefined;
    const burst = player.archerBurstRemaining > 0;
    const fireAtMs = burst ? player.archerBurstCooldown ?? 0 : player.attackCooldownRemaining;
    let nextMeleeAt = player.attackCooldownRemaining;
    let nextCounterAt = opponent.attackCooldownRemaining;
    const direction = player.isFlying && action.direction === 0 ? (player.facingRight ? 1 : -1) : action.direction;
    const approaches = direction !== 0 && Math.sign(goal.x - player.x) === direction;
    const hits = new Uint8Array(paths.length);
    const guided = paths.map(path => !player.isClone && path.projectile.type === 'homing-rocket' ? { ...path.projectile } : undefined);
    const guidedTimes = new Float64Array(paths.length);
    const destroyedGuidedVines = new Set<string>();
    const candidatePools: { x: number; y: number; width: number; height: number; impactTime: number; damage: number }[] = [];
    for (let step = 1; step <= frame.steps; step++) {
      const priorRisk = risk;
      const dt = frame.times[step] - frame.times[step - 1];
      const opponentInRange = !forecast || step === 1 || elapsed + dt <= forecastHorizon + 1e-9;
      const environmentInRange = !environment || step === 1 || elapsed + dt <= environment.horizonMs / 1000 + 1e-9;
      const projectileInRange = !projectileForecast || step === 1 || elapsed + dt <= projectileForecast.horizonMs / 1000 + 1e-9;
      elapsed += dt;
      if (chargeMotion && (elapsed - dt) * 1000 <= chargeMotion.overchargeAt && elapsed * 1000 > chargeMotion.overchargeAt)
        risk += player.character!.attackDamage * (1 + player.damageBoost) * (isOvertime ? 2 : 1) * 3.5;
      // The current callback's shield state follows the shared movement phase.
      // Later holding is credited only with enough mana for worst-case upkeep;
      // no private shield timer or future regeneration is assumed.
      const shielding = start.isShielding && (step === 1 || player.mana - 2 * Math.ceil(elapsed * 10) >= 5);
      const shieldAt = { ...point, isShielding: shielding, facingRight: start.facingRight };
      const flying = player.isFlying && elapsed * 1000 < player.invulnerableDuration;
      const invulnerable = player.isInvulnerable && elapsed * 1000 < player.invulnerableDuration;
      if (step === 1) {
        // Executed input cannot stop at a navigation goal mid-callback. Shared
        // status/force/movement phases also handle roots, charging and sliding.
        point.x = start.x; point.y = start.y;
        if (skill && id === 'ninja' && !start.isStunned && !start.isFrozen && !player.isSilenced &&
            player.skillCooldownRemaining <= world.deltaTime && player.mana >= player.character!.skill.manaCost) {
          point.x = clampPlayerX(point.x + (start.facingRight ? 1 : -1) * NINJA_DASH_DISTANCE);
        }
        vx = start.velocityX; vy = start.velocityY;
        kx = start.knockbackVelocityX; ky = start.knockbackVelocityY;
      } else {
        // Later samples assume another decision can stop at the goal. This is a
        // future policy assumption, separate from the exact first input above.
        const decay = Math.pow(0.9, dt * 1000 / 16);
        kx = Math.abs(kx) > 10 ? kx * decay : 0; ky = Math.abs(ky) > 10 ? ky * decay : 0;
        const motionSpeed = chargeMotion?.speedAt(elapsed * 1000, dt * 1000) ?? speed;
        let movement = direction * motionSpeed * dt / (flying && (action.jump || action.drop) ? Math.SQRT2 : 1);
        const ice = zones.some(z => z.type === 'blizzard' && now + elapsed * 1000 - z.createdAt <= z.duration && overlapsPlayer(point, z));
        if (ice) { vx = (vx + direction * motionSpeed / 75 * 100 * dt) * Math.pow(0.99, dt * 1000 / 16); movement = vx * dt; }
        else vx = 0;
        point.x = clampPlayerX(point.x + (approaches && !flying && !ice && direction * (goal.x - point.x) <= Math.abs(movement) ? goal.x - point.x : movement) + kx * dt);
        if (flying) point.y = Math.max(ARENA.padding, Math.min(FLOOR_Y, point.y + (action.jump ? -1 : action.drop ? 1 : 0) * speed * dt / Math.SQRT2 + ky * dt));
        else {
          vy = Math.min(MAX_FALL_SPEED, vy + GRAVITY * dt);
          const next = platformCollision(point, point.y + (vy + ky) * dt, vy + ky, platforms);
          point.y = Math.max(ARENA.padding, Math.min(FLOOR_Y, next.y));
          if (next.isGrounded || point.y >= FLOOR_Y) vy = 0;
        }
      }
      if (environmentInRange && world.sandstormActive && environmentTime('wind', elapsed) * 1000 < world.sandstormTimer) kx += sandstormImpulse(now + elapsed * 1000, dt, world.sandstormDirection);
      trajectory?.push({ ...point });
      if (archerTactics && !firePoint && fireAtMs <= world.deltaTime * 2 && elapsed * 1000 >= Math.max(0, fireAtMs)) {
        firePoint = { x: point.x, y: point.y, facingRight: step === 1 ? start.facingRight
          : action.direction ? action.direction > 0 : start.facingRight, leadMs: Math.max(0, elapsed * 1000 - world.deltaTime) };
      }
      travelCost += (Math.abs(point.x - goal.x) + Math.abs(point.y - goal.y) * 1.3) / frame.steps;
      const lavaRisk = mapId === 'volcano' && point.y >= FLOOR_Y - 1 && !invulnerable ? 1600 / frame.steps : 0;
      risk += lavaRisk;
      if (!invulnerable) {
        if (opponentInRange) risk += opponentLineRisk(opponent, point, targets[step], elapsed, now) / frame.steps;
        if (environmentInRange) for (const zone of zones) if (!(zone.id === clear?.coilId && step >= clear.step) &&
          now + environmentTime(zone.id, elapsed) * 1000 - zone.createdAt <= zone.duration) risk += hazardRisk(point, environmentPoint(zone, elapsed, step)) / frame.steps;
        if (environmentInRange) for (const strike of warnings) {
          const key = 'lightning:' + strike.x + ':' + strike.warningStart;
          const strikeTime = environmentTime(key, elapsed), previousStrikeTime = environmentTime(key, elapsed - dt);
          const strikePoint = environmentPoint({ id: key, x: strike.x, y: 0 }, elapsed);
          const strikeIn = (LIGHTNING_WARNING_MS - (now - strike.warningStart)) / 1000;
          if (strikeTime >= strikeIn && previousStrikeTime < strikeIn && Math.abs(point.x + PLAYER_SIZE / 2 - strikePoint.x) < LIGHTNING_RADIUS + 8) risk += 240;
        }
        if (projectileInRange && environmentInRange) for (const pool of pools) if (elapsed >= pool.impactTime &&
          (!pool.duration || (elapsed - pool.impactTime) * 1000 <= pool.duration) && overlapsPlayer(point, pool, 8))
          risk += (pool.damage === undefined ? 160 : Math.max(160, pool.damage * 120)) / frame.steps;
        for (const pool of candidatePools) if (elapsed >= pool.impactTime && overlapsPlayer(point, pool, 8)) risk += Math.max(160, pool.damage * 120) / frame.steps;
        if (opponentInRange) for (const hitbox of hitboxes) if (now + elapsed * 1000 - hitbox.createdAt <= hitbox.duration && overlapsPlayer(point, hitbox) &&
          !shieldFacesX({ ...shieldAt, ...point }, hitbox.sourceX ?? opponent.x + PLAYER_SIZE / 2)) risk += 180 / frame.steps;
        if (opponentInRange && opponent.isFlying && opponent.invulnerableDuration > elapsed * 1000 && Math.hypot(point.x - targets[step].x, point.y - targets[step].y) < 65) risk += 300 / frame.steps;
        else if (opponentInRange && isMelee(opponent.character!.id) && opponent.attackCooldownRemaining < elapsed * 1000 && Math.abs(point.y - targets[step].y) < PLAYER_SIZE && Math.abs(point.x - targets[step].x) < opponent.character!.attackRange + 15 &&
          !shieldFacesX({ ...shieldAt, ...point }, targets[step].x + PLAYER_SIZE / 2)) risk += (isMelee(id) && !lowHealth ? 8 : 30) / frame.steps;
        if (opponentInRange && isMelee(id) && player.attackCooldownRemaining > elapsed * 1000) {
          const counter = meleeOpportunityAt({ ...opponent, ...targets[step],
            isStunned: opponent.isStunned && opponent.stunDuration > elapsed * 1000,
            isFrozen: opponent.isFrozen && opponent.frozenDuration > elapsed * 1000 },
          { ...player, ...shieldAt, ...point,
            isEvading: player.isEvading && player.evadeDuration > elapsed * 1000 }, elapsed * 1000, nextCounterAt);
          if (counter !== null) {
            // Only observed recovery is certain. Do not invent recovery after
            // a merely forecast own attack and penalize that opportunity twice.
            nextCounterAt = counter;
            risk += opponent.character!.attackDamage * (isOvertime ? 4 : 2);
          }
        }
        for (let index = 0; index < paths.length; index++) {
          const path = paths[index], p = path.projectile;
          const phase = path.returning[step] ? 2 : 1;
          const homing = guided[index];
          if ((homing ? now + Math.max(0, elapsed - frame.times[1]) * 1000 - p.createdAt > p.lifetime || !projectileInRange : step > path.endStep) ||
              (hits[index] & phase) || (p.type === 'bat' && (phase === 2 ? p.hasHitReturn : p.hasHitForward))) continue;
          // A bat survives a coil but returns before the fighter-hit phase in
          // that callback. It can still hit the fighter on a later callback.
          if (p.type === 'bat' && path.coilContacts.some(contact => contact.step === step)) continue;
          let x0 = path.x[step - 1], x1 = path.x[step], y0 = path.y[step - 1], y1 = path.y[step];
          if (homing) {
            const error = path.forecastError;
            const before = projectileForecast && error ? forecastPoint(homing, projectileForecast, error, elapsed - dt) : homing;
            x0 = before.x; y0 = before.y;
            const sampleTime = projectileForecast && error && projectileForecast.horizonMs > 0 ? forecastTime(projectileForecast, error, elapsed) : elapsed;
            stepProjectileMotion(homing, world.players[homing.ownerId - 1], now + Math.max(0, sampleTime - frame.times[1]) * 1000, sampleTime - guidedTimes[index], { ...point, isInvisible: player.isInvisible });
            guidedTimes[index] = sampleTime;
            const after = projectileForecast && error ? forecastPoint(homing, projectileForecast, error, elapsed) : homing;
            x1 = after.x; y1 = after.y;
            let contact = Infinity;
            if (environmentInRange) for (const vine of frame.vines) {
              if (!destroyedGuidedVines.has(vine.id) && now + environmentTime(vine.id, elapsed) * 1000 - vine.createdAt <= vine.duration) {
                const time = getProjectileCollisionTime({ ...homing, x: x1, y: y1 }, { x: x0, y: y0 }, environmentPoint(vine, elapsed));
                if (time !== null && time < contact) contact = time;
              }
            }
            const body = getProjectileCollisionTime({ ...homing, x: x1, y: y1 }, { x: x0, y: y0 }, { ...point, width: PLAYER_SIZE, height: PLAYER_SIZE }) ?? Infinity;
            const outside = x1 + p.width < 0 || x1 > ARENA.width || y1 + p.height < 0 || y1 > ARENA.height;
            if (contact < body || (outside && body === Infinity)) {
              if (contact < body) for (const vine of frame.vines) {
                if (getProjectileCollisionTime({ ...homing, x: x1, y: y1 }, { x: x0, y: y0 }, environmentPoint(vine, elapsed)) === contact)
                  destroyedGuidedVines.add(vine.id);
              }
              if (p.isNapalm) {
                const poolSize = p.explosionRadius * 2;
                candidatePools.push({ x: x0 + (x1 - x0) * (contact === Infinity ? 1 : contact) + p.width / 2 - poolSize / 2,
                  y: y0 + (y1 - y0) * (contact === Infinity ? 1 : contact) + p.height / 2 - poolSize / 2,
                  width: poolSize, height: poolSize, impactTime: elapsed, damage: p.firePoolDamage ?? p.damage * 0.1 });
              }
              hits[index] |= phase;
              continue;
            }
            // Recheck the candidate's actual guided endpoint; a shared path's
            // body miss/coil contact alone cannot determine this movement's hit.
            const coil = environmentInRange && findProjectileCoilContact({ ...homing, x: x1, y: y1 }, frame.coilSnapshots.get(step) ?? [], { x: x0, y: y0 });
            if (coil) {
              if (p.isNapalm) {
                const contact = getProjectileCollisionTime({ ...homing, x: x1, y: y1 }, { x: x0, y: y0 }, coil) ?? 1;
                const size = Math.max(p.explosionRadius, p.width / 2, p.height / 2) * 2;
                candidatePools.push({
                  x: Math.max(coil.x, Math.min(x0 + (x1 - x0) * contact + p.width / 2, coil.x + coil.width)) - size / 2,
                  y: Math.max(coil.y, Math.min(y0 + (y1 - y0) * contact + p.height / 2, coil.y + coil.height)) - size / 2,
                  width: size, height: size, impactTime: elapsed, damage: p.firePoolDamage ?? p.damage * 0.1 });
              }
              hits[index] = 3;
              continue;
            }
          }
          if (Math.max(x0, x1) + p.width < point.x || Math.min(x0, x1) > point.x + PLAYER_SIZE || Math.max(y0, y1) + p.height < point.y || Math.min(y0, y1) > point.y + PLAYER_SIZE) continue;
          if (checkProjectileCollision({ x: x1, y: y1, width: p.width, height: p.height }, { x: x0, y: y0 }, { ...point, width: PLAYER_SIZE, height: PLAYER_SIZE })) {
            if (shieldFacesX({ ...shieldAt, ...point }, x0 + p.width / 2)) {
              hits[index] = 3;
              continue;
            }
            const sustained = p.isNapalm ? (p.burnDamage ?? p.damage * 0.075) * 12 + (p.firePoolDamage ?? p.damage * 0.1) * 10 : 0;
            risk += (100 + (p.damage + sustained) * (isOvertime ? 4 : 2)) * (1 - elapsed * 0.4); hits[index] |= phase;
          }
        }
      }
      // Immediate threats remain perceptible even when future prediction is disabled.
      if (step > 1 && prediction < 1) risk = priorRisk + lavaRisk + (risk - priorRisk - lavaRisk) * prediction;
      if (environmentInRange) for (const zone of frame.souls) if (now + environmentTime(zone.id, elapsed) * 1000 - zone.createdAt <= zone.duration && overlapsPlayer(point, environmentPoint(zone, elapsed))) benefit += ((1 - player.health / player.maxHealth) * 14 + (1 - player.mana / player.maxMana) * 6) * traits.recovery / frame.steps;
      const shieldFront = opponent.isShielding && (point.x - targets[step].x) * (opponent.facingRight ? 1 : -1) > 0;
      if (opponentInRange && isMelee(id)) {
        // Basic melee is generated before Ninja's skill teleport. Movement risk
        // uses the landing point, but this callback cannot attack from there.
        const attackPoint = step === 1 ? start : point;
        const next = meleeOpportunityAt({ ...player, ...attackPoint, facingRight: start.facingRight },
          { ...opponent, ...targets[step] }, elapsed * 1000, nextMeleeAt);
        if (next !== null) {
          nextMeleeAt = next;
          benefit += player.character!.attackDamage * 1.3 * traits.aggression;
        }
      } else if (opponentInRange && !opponent.isInvulnerable && !opponent.isEvading && !shieldFront && player.attackCooldownRemaining <= elapsed * 1000 && Math.abs(point.y - targets[step].y) < 30 && Math.abs(point.x - targets[step].x) < (id === 'hunter' ? 275 : player.character!.attackRange)) benefit += player.character!.attackDamage * (player.napalmDuration > elapsed * 1000 ? 2.5 : 1.3) * traits.aggression / frame.steps;
      if (mapId === 'graveyard') risk += Math.max(0, FLOOR_Y - point.y) / 4000 / frame.steps;
    }
    if (mapId === 'volcano' && !player.isFlying && vy > 0 && !platforms.some(p => p.id !== 'ground' && p.y >= point.y + PLAYER_SIZE && point.x + PLAYER_SIZE > p.x && point.x < p.x + p.width)) risk += 130;
    const noise = sampleNoise && parameters.noise > 0 && options ? gaussian(options.random) * parameters.noise : 0;
    return { action, risk, benefit, noise, trajectory, firePoint, score: risk * (lowHealth ? 1.4 : 1) * traits.defense + travelCost * (strategy === 'escape' || strategy === 'flank' ? 0.28 : 0.16) - benefit + (action.jump ? 7 : 0) + (action.drop ? 3 : 0) + (action.direction ? 0.5 : 0) + noise };
  }
  const candidates: Action[] = [];
  for (const direction of [0, -1, 1] as Direction[]) {
    candidates.push({ direction, jump: false, drop: false });
    if (canJump || player.isFlying) candidates.push({ direction, jump: true, drop: false });
    if (player.isFlying || (currentPlatform?.type === 'one-way' && (goal.y > player.y + 40 || strategy === 'escape') && !player.isJumping)) candidates.push({ direction, jump: false, drop: true });
  }
  const evaluated = candidates.map(action => evaluate(action));
  let best = evaluated.reduce((a, b) => a.score <= b.score ? a : b);
  const priorMovement = previous?.movement;
  const sameMovementGoal = previous?.goal && memory.goal && previous.strategy === strategy &&
    Math.hypot(previous.goal.x - memory.goal.x, previous.goal.y - memory.goal.y) < 20;
  const forcedMovement = player.rootDuration > 0 || player.isEvading || player.isDashing || player.isFlying ||
    Math.abs(player.knockbackVelocityX) > 1 || Math.abs(player.knockbackVelocityY) > 1;
  if (priorMovement && priorMovement.direction && best.action.direction === -priorMovement.direction &&
      now >= priorMovement.selectedAt && now - priorMovement.selectedAt < 100 && !forcedMovement &&
      sameMovementGoal) {
    const retained = evaluated.find(c => c.action.direction === priorMovement.direction &&
      c.action.jump === best.action.jump && c.action.drop === best.action.drop);
    // Re-score the previous direction in the current world. Old scores and
    // future enemy inputs never justify delaying an escape or losing a hit.
    if (retained && retained.score <= best.score + 1 && retained.risk <= best.risk && retained.benefit >= best.benefit) best = retained;
  }
  let selectedArcherShot: ArcherShotOutcome | undefined;
  const archerShots = new Map<string, ArcherShotOutcome>();
  if (archerTactics && strategy !== 'escape' && !opponent.isInvulnerable && !opponent.isEvading) {
    const alternatives = [best,
      evaluated.find(candidate => candidate.action.direction === 0 && candidate.action.jump === best.action.jump && candidate.action.drop === best.action.drop),
      evaluated.find(candidate => candidate.action.direction === toward && candidate.action.jump === best.action.jump && candidate.action.drop === best.action.drop)]
      .filter((candidate): candidate is typeof best => candidate !== undefined);
    const seen = new Set<typeof best>();
    let selectedScore = best.score;
    for (const candidate of alternatives) {
      if (seen.has(candidate) || !candidate.firePoint || candidate.risk > best.risk + 5) continue;
      seen.add(candidate);
      const { leadMs, ...origin } = candidate.firePoint;
      const shot = archerShotOutcome(frame, player, opponent, origin, leadMs, targetAt, player.archerBurstRemaining > 0);
      archerShots.set(`${candidate.action.direction}:${candidate.action.jump}:${candidate.action.drop}`, shot);
      const score = candidate.score - (shot.kind === 'enemy' ? shot.damage * 1.3 * traits.aggression * parameters.character / 100 : 0);
      if (score < selectedScore || candidate === best) {
        selectedScore = score; best = candidate; selectedArcherShot = shot;
      }
      if (candidate === alternatives[0] && (shot.kind === 'enemy' || shot.kind === 'vine')) break;
    }
  }
  const chosen = { ...best.action };
  const threatened = evaluated[0].risk > 35;
  const advanceRisk = Math.min(...evaluated.filter(c => c.action.direction === toward).map(c => c.risk));
  const allowLongRange = !isMelee(id) && (mapId === 'volcano' || zones.length > 0 || warnings.length > 0) && advanceRisk > best.risk + 20;
  memory.rangedHold = allowLongRange;
  let facingTarget = chosen.direction === toward || (chosen.direction === 0 && player.facingRight === (toward === 1));
  if (!facingTarget && chosen.direction === 0 && !threatened && strategy !== 'escape' &&
      (strategy !== 'flank' || !shieldFacesX(opponent, player.x + PLAYER_SIZE / 2))) {
    const turn = evaluated.find(c => c.action.direction === toward && c.action.jump === chosen.jump && c.action.drop === chosen.drop)!;
    if (turn.risk <= best.risk + 1) {
      chosen.direction = toward; facingTarget = true;
      if (archerTactics) selectedArcherShot = archerShots.get(`${turn.action.direction}:${turn.action.jump}:${turn.action.drop}`);
    }
  }
  let combat = chooseCombat(frame, player, opponent, model, chosen, facingTarget, threatened, strategy, targetAt, allowLongRange, options,
    selectedArcherShot);
  let coupledRisk: number | undefined;
  let coilDecision: AIDecision['coilDecision'];
  const coilId = id === 'hunter' ? singleCoilSurvivalContext(frame, player) : undefined;
  if (combat.alternatives.length > 1 || coilId) {
    const variants = combat.alternatives.map(proposal => {
      const motion = evaluate(proposal.action, proposal.skill, false, proposal.coilClear, !!coilId);
      const movementNoise = evaluated.find(c => c.action.direction === proposal.action.direction && c.action.jump === proposal.action.jump && c.action.drop === proposal.action.drop)?.noise ?? best.noise;
      return { proposal, motion, score: motion.score + movementNoise - proposal.castValue };
    });
    // Newly proposed coil casts need a survival comparison before they are
    // admitted. Existing rooted rescue remains the primary legal proposal.
    const ordinary = variants.filter((v, index) => index === 0 || !v.proposal.coilClear);
    let selected = ordinary.reduce((a, b) => a.score <= b.score ? a : b);
    if (id === 'scientist' && !player.isChargingSkill && combat.skill) {
      const starting = variants[0], waiting = variants.find(v => !v.proposal.skill);
      // Preserve an admitted charge when risk is equal. Faster travel alone
      // does not erase its offensive opportunity; increased exposure can veto it.
      selected = waiting && traits.defense > 0 && waiting.motion.risk < starting.motion.risk ? waiting : starting;
    }
    if (coilId && selected.motion.trajectory) {
      const before = coilExposure(frame, player, coilId, selected.motion.trajectory, selected.proposal.coilClear);
      if (!before.uncertain && before.lethalAtMs !== undefined && player.attackCooldownRemaining > before.lethalAtMs) {
        const escapes = evaluated.map(candidate => {
          const motion = evaluate(candidate.action, false, false, undefined, true);
          const exposure = coilExposure(frame, player, coilId, motion.trajectory ?? []);
          const proposal: CombatProposal = { action: candidate.action, attack: false, skill: false, castValue: 0 };
          return { proposal, motion, exposure, score: motion.score + candidate.noise };
        }).filter(v => !v.exposure.uncertain && v.exposure.lethalAtMs === undefined);
        const clears = variants.filter(v => v.proposal.coilClear && v.motion.trajectory).map(v => ({ ...v,
          exposure: coilExposure(frame, player, coilId, v.motion.trajectory ?? [], v.proposal.coilClear) }))
          .filter(v => !v.exposure.uncertain && v.exposure.lethalAtMs === undefined && !v.exposure.blastContact);
        // Prefer a predicted safe, free movement over spending a skill. Among
        // equal resource alternatives use the existing movement score unchanged.
        const safe = escapes.length ? escapes : clears;
        if (safe.length) {
          const saved = safe.reduce((a, b) => a.score <= b.score ? a : b);
          selected = saved;
          coilDecision = { coilId, reason: saved.proposal.skill ? 'clear-to-survive' : 'escape',
            predictedDamageBefore: before.damage, predictedDamageAfter: saved.exposure.damage,
            manaCost: saved.proposal.skill ? player.character.skill.manaCost : 0, lethalAtMs: before.lethalAtMs };
        }
      }
      if (!coilDecision && selected.proposal.coilClear && selected.motion.trajectory) {
        const held = coilExposure(frame, player, coilId, selected.motion.trajectory);
        const cleared = coilExposure(frame, player, coilId, selected.motion.trajectory, selected.proposal.coilClear);
        if (!held.uncertain && held.lethalAtMs !== undefined && !cleared.uncertain &&
            cleared.lethalAtMs === undefined && !cleared.blastContact) coilDecision = {
          coilId, reason: 'clear-to-survive', predictedDamageBefore: held.damage,
          predictedDamageAfter: cleared.damage, manaCost: player.character.skill.manaCost, lethalAtMs: held.lethalAtMs };
      }
    }
    combat = { ...combat, ...selected.proposal };
    coupledRisk = selected.motion.risk;
  }
  const finalAction = combat.action;
  const changedMovement = finalAction.direction !== best.action.direction || finalAction.jump !== best.action.jump || finalAction.drop !== best.action.drop;
  const changedSkillMotion = id === 'gladiator' && combat.skill !== player.isShielding || id === 'ninja' && combat.skill ||
    id === 'scientist' && (combat.skill || player.isChargingSkill);
  // Re-evaluation must not consume another personality/noise sample. Combat
  // proposals are immutable; the reported risk belongs to the executed intent.
  const finalRisk = coupledRisk ?? (changedSkillMotion ? evaluate(finalAction, combat.skill, false).risk
    : changedMovement ? evaluated.find(c => c.action.direction === finalAction.direction && c.action.jump === finalAction.jump && c.action.drop === finalAction.drop)?.risk
      ?? evaluate(finalAction, combat.skill, false).risk : best.risk);
  // This status comes from the matured observation. Failed adaptation uses familiar
  // controls again on this decision, allowing lower tiers to make repeated mistakes.
  const compensate = player.isHacked && (parameters.controlAdaptation === 100 || (options?.random() ?? 0) < parameters.controlAdaptation / 100);
  const direction = compensate ? -finalAction.direction : finalAction.direction;
  const jump = compensate ? finalAction.drop : finalAction.jump, drop = compensate ? finalAction.jump : finalAction.drop;
  if (player.id === 2) {
    keys.arrowLeft = direction < 0; keys.arrowRight = direction > 0; keys.arrowUp = jump; keys.arrowDown = drop;
    keys.shift = combat.attack; keys.enter = combat.skill; keys.backslash = combat.ultimate;
  } else {
    keys.a = direction < 0; keys.d = direction > 0; keys.w = jump; keys.s = drop;
    keys.f = combat.attack; keys.g = combat.skill; keys.h = combat.ultimate;
  }
  memory.lastKeys = keys;
  // Combat turns/teleports take precedence and invalidate movement retention.
  memory.movement = !forcedMovement && finalAction.direction === best.action.direction && !changedSkillMotion
    ? { direction: best.action.direction, score: best.score, goalSignature: memory.goalSignature,
      selectedAt: priorMovement?.direction === best.action.direction && sameMovementGoal
        ? priorMovement.selectedAt : now }
    : undefined;
  if (diagnosePosition) {
    let forecastLanding: PositionDecision['forecastLanding'];
    let departed = !opponent.isGrounded;
    for (let step = 1; step <= frame.steps && frame.times[step] <= forecastHorizon; step++) {
      const point = targetAt(frame.times[step]), platform = support(point, platforms);
      if (!platform) departed = true;
      else if (departed) {
        forecastLanding = { x: point.x, y: point.y, timeMs: frame.times[step] * 1000,
          platformId: platform.id, confidence: point.confidence };
        break;
      }
    }
    diagnosePosition({ now, strategy,
      self: { x: player.x, y: player.y, platformId: currentPlatform?.id },
      opponent: { x: opponent.x, y: opponent.y, platformId: support(opponent, platforms)?.id },
      goal: { ...goal, platformId: support(goal, platforms)?.id }, forecastLanding,
      patterns: { samples: model.samples.length, jumps: model.jumpCount, jumpCadences: model.jumpCadenceCount,
        reactions: model.reactionCount, reactionJumps: model.reactionJump, turns: model.turnCount },
      executed: { action: { ...finalAction }, attack: combat.attack, skill: combat.skill, risk: finalRisk },
      movementCandidates: evaluated.map(candidate => ({ action: { ...candidate.action }, risk: candidate.risk,
        benefit: candidate.benefit, score: candidate.score })),
    });
  }
  return coilDecision ? { keys, memory, risk: finalRisk, coilDecision } : { keys, memory, risk: finalRisk };
}
