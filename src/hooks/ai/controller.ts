import { ARENA, PLAYER_SIZE, type Player } from '@/types/game';
import { GRAVITY, JUMP_FORCE, MAX_FALL_SPEED, COYOTE_TIME } from '@/types/platform';
import { checkProjectileCollision } from '@/types/projectile';
import { clampPlayerX, FLOOR_Y, LIGHTNING_RADIUS, LIGHTNING_WARNING_MS, playerMoveSpeed, platformCollision, sandstormImpulse, shieldFacesX } from '@/types/combatPhysics';
import { opponentLineRisk } from './matchup';
import type { KeyboardState } from '../useKeyboard';
import { createOpponentModel, predictOpponent, type Direction, type OpponentModel } from './learning';
import { createAIMemory, type AIMemory } from './state';
import { hazardRisk, isMelee, selectGoal, support } from './navigation';
import { AI_DT, AI_STEPS, overlapsPlayer, type AIFrame } from './world';
import { chooseCombat } from './combat';
import { AI_PRESETS, NEUTRAL_AI_TRAITS, type AIDecisionOptions } from '@/types/ai';
import { gaussian } from './random';
import { forecastPoint, forecastTime, sampleForecastError } from './forecast';

export type Action = { direction: Direction; jump: boolean; drop: boolean };
export const emptyAIKeys = (): KeyboardState => ({
  a: false, d: false, w: false, s: false, space: false, f: false, g: false, h: false,
  arrowLeft: false, arrowRight: false, arrowUp: false, arrowDown: false, enter: false, shift: false, backslash: false,
});
export interface AIDecision { keys: KeyboardState; memory: AIMemory; risk: number }

/** Deterministic: neither the frame, the learning model nor the prior memory is mutated. */
export function decideAI(frame: AIFrame, player: Player, model: OpponentModel = createOpponentModel(), previous?: AIMemory, options?: AIDecisionOptions): AIDecision {
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
  if (player.isStunned || player.isFrozen) return { keys, memory, risk: 0 };
  const id = player.character.id;
  const toward: Direction = opponent.x >= player.x ? 1 : -1;
  const speed = playerMoveSpeed(player, now);
  const lowHealth = player.health < player.maxHealth * 0.35;
  const zones = frame.zones.filter(z => z.ownerId !== player.id);
  const paths = frame.paths.filter(p => p.projectile.ownerId !== player.id && !p.projectile.isHackUltimate);
  const pools = frame.pools.filter(p => p.ownerId !== player.id);
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
      const sample = forecastTime(forecast, error, Math.min(time, forecastHorizon));
      const index = Math.min(enemyFuture.length - 1, Math.floor(sample * 60));
      const next = Math.min(enemyFuture.length - 1, index + 1);
      const start = Math.min(forecastHorizon, index / 60), end = Math.min(forecastHorizon, next / 60);
      const ratio = end > start ? Math.max(0, Math.min(1, (sample - start) / (end - start))) : 0;
      const from = enemyFuture[index], to = enemyFuture[next];
      const point = forecastPoint({ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio, confidence: from.confidence }, forecast, error, Math.min(time, forecastHorizon));
      return { ...point, x: opponent.x + (point.x - opponent.x) * prediction, y: opponent.y + (point.y - opponent.y) * prediction };
    }
    const tick = Math.round(time * 60);
    if (tick >= 0 && tick < enemyFuture.length) return enemyFuture[tick];
    let result = targetCache.get(tick);
    if (!result) { result = predictOpponent(model, opponent, tick / 60, platforms, now, true); targetCache.set(tick, result); }
    return result;
  };
  const targets = Array.from({ length: frame.steps + 1 }, (_, step) => forecast ? targetAt(frame.times[step]) : enemyFuture[step]);
  const environment = options?.parameters.forecasts.environment ?? frame.forecasts?.environment;
  const projectileForecast = options?.parameters.forecasts.projectiles ?? frame.forecasts?.projectiles;
  const environmentPoint = <T extends { x: number; y: number; id: string }>(entity: T, elapsed: number): T => {
    const error = frame.environmentErrors.get(entity.id);
    return environment && error ? forecastPoint(entity, environment, error, elapsed) : entity;
  };
  const environmentTime = (id: string, elapsed: number) => {
    const error = frame.environmentErrors.get(id);
    return environment && error ? forecastTime(environment, error, elapsed) : elapsed;
  };
  function evaluate(action: Action) {
    const point = { x: player.x, y: player.y };
    let vy = action.jump && canJump ? JUMP_FORCE : player.velocityY;
    let vx = player.velocityX, kx = player.knockbackVelocityX, ky = player.knockbackVelocityY;
    let risk = 0, travelCost = 0, benefit = 0, elapsed = 0;
    const direction = player.isFlying && action.direction === 0 ? (player.facingRight ? 1 : -1) : action.direction;
    const approaches = direction !== 0 && Math.sign(goal.x - player.x) === direction;
    const hits = new Uint8Array(paths.length);
    if (action.drop && currentPlatform?.type === 'one-way' && !player.isJumping) { point.y += 25; vy = 300; }
    for (let step = 1; step <= frame.steps; step++) {
      const priorRisk = risk;
      const dt = frame.times[step] - frame.times[step - 1];
      const opponentInRange = !forecast || step === 1 || elapsed + dt <= forecastHorizon + 1e-9;
      const environmentInRange = !environment || step === 1 || elapsed + dt <= environment.horizonMs / 1000 + 1e-9;
      const projectileInRange = !projectileForecast || step === 1 || elapsed + dt <= projectileForecast.horizonMs / 1000 + 1e-9;
      elapsed += dt;
      const flying = player.isFlying && elapsed * 1000 < player.invulnerableDuration;
      const invulnerable = player.isInvulnerable && elapsed * 1000 < player.invulnerableDuration;
      const decay = Math.pow(0.9, dt * 1000 / 16);
      kx = Math.abs(kx) > 10 ? kx * decay : 0; ky = Math.abs(ky) > 10 ? ky * decay : 0;
      let movement = direction * speed * dt / (flying && (action.jump || action.drop) ? Math.SQRT2 : 1);
      const ice = zones.some(z => z.type === 'blizzard' && now + elapsed * 1000 - z.createdAt <= z.duration && overlapsPlayer(point, z));
      if (ice) { vx = (vx + direction * speed / 75 * 100 * dt) * Math.pow(0.99, dt * 1000 / 16); movement = vx * dt; }
      else vx = 0;
      point.x = clampPlayerX(point.x + (approaches && !flying && !ice && direction * (goal.x - point.x) <= Math.abs(movement) ? goal.x - point.x : movement) + kx * dt);
      if (flying) point.y = Math.max(ARENA.padding, Math.min(FLOOR_Y, point.y + (action.jump ? -1 : action.drop ? 1 : 0) * speed * dt / Math.SQRT2 + ky * dt));
      else {
        vy = Math.min(MAX_FALL_SPEED, vy + GRAVITY * dt);
        const next = platformCollision(point, point.y + (vy + ky) * dt, vy + ky, platforms);
        point.y = Math.max(ARENA.padding, Math.min(FLOOR_Y, next.y));
        if (next.isGrounded || point.y >= FLOOR_Y) vy = 0;
      }
      if (environmentInRange && world.sandstormActive && environmentTime('wind', elapsed) * 1000 < world.sandstormTimer) kx += sandstormImpulse(now + elapsed * 1000, dt, world.sandstormDirection);
      travelCost += (Math.abs(point.x - goal.x) + Math.abs(point.y - goal.y) * 1.3) / frame.steps;
      const lavaRisk = mapId === 'volcano' && point.y >= FLOOR_Y - 1 && !invulnerable ? 1600 / frame.steps : 0;
      risk += lavaRisk;
      if (!invulnerable) {
        if (opponentInRange) risk += opponentLineRisk(opponent, point, targets[step], elapsed, now) / frame.steps;
        if (environmentInRange) for (const zone of zones) if (now + environmentTime(zone.id, elapsed) * 1000 - zone.createdAt <= zone.duration) risk += hazardRisk(point, environmentPoint(zone, elapsed)) / frame.steps;
        if (environmentInRange) for (const strike of warnings) {
          const key = 'lightning:' + strike.x + ':' + strike.warningStart;
          const strikeTime = environmentTime(key, elapsed), previousStrikeTime = environmentTime(key, elapsed - dt);
          const strikePoint = environmentPoint({ id: key, x: strike.x, y: 0 }, elapsed);
          const strikeIn = (LIGHTNING_WARNING_MS - (now - strike.warningStart)) / 1000;
          if (strikeTime >= strikeIn && previousStrikeTime < strikeIn && Math.abs(point.x + PLAYER_SIZE / 2 - strikePoint.x) < LIGHTNING_RADIUS + 8) risk += 240;
        }
        if (projectileInRange && environmentInRange) for (const pool of pools) if (elapsed >= pool.impactTime && overlapsPlayer(point, pool, 8)) risk += 160 / frame.steps;
        if (opponentInRange) for (const hitbox of hitboxes) if (now + elapsed * 1000 - hitbox.createdAt <= hitbox.duration && overlapsPlayer(point, hitbox)) risk += 180 / frame.steps;
        if (opponentInRange && opponent.isFlying && opponent.invulnerableDuration > elapsed * 1000 && Math.hypot(point.x - targets[step].x, point.y - targets[step].y) < 65) risk += 300 / frame.steps;
        else if (opponentInRange && isMelee(opponent.character!.id) && opponent.attackCooldownRemaining < elapsed * 1000 && Math.abs(point.y - targets[step].y) < PLAYER_SIZE && Math.abs(point.x - targets[step].x) < opponent.character!.attackRange + 15) risk += (isMelee(id) && !lowHealth ? 8 : 30) / frame.steps;
        for (let index = 0; index < paths.length; index++) {
          const path = paths[index], p = path.projectile;
          const phase = path.returning[step] ? 2 : 1;
          if (step > path.endStep || (hits[index] & phase) || (p.type === 'bat' && (phase === 2 ? p.hasHitReturn : p.hasHitForward))) continue;
          const x0 = path.x[step - 1], x1 = path.x[step], y0 = path.y[step - 1], y1 = path.y[step];
          if (Math.max(x0, x1) + p.width < point.x || Math.min(x0, x1) > point.x + PLAYER_SIZE || Math.max(y0, y1) + p.height < point.y || Math.min(y0, y1) > point.y + PLAYER_SIZE) continue;
          if (checkProjectileCollision({ x: x1, y: y1, width: p.width, height: p.height }, { x: x0, y: y0 }, { ...point, width: PLAYER_SIZE, height: PLAYER_SIZE })) {
            risk += (100 + p.damage * (isOvertime ? 4 : 2)) * (1 - elapsed * 0.4); hits[index] |= phase;
          }
        }
      }
      // Immediate threats remain perceptible even when future prediction is disabled.
      if (step > 1 && prediction < 1) risk = priorRisk + lavaRisk + (risk - priorRisk - lavaRisk) * prediction;
      if (environmentInRange) for (const zone of frame.souls) if (now + environmentTime(zone.id, elapsed) * 1000 - zone.createdAt <= zone.duration && overlapsPlayer(point, environmentPoint(zone, elapsed))) benefit += ((1 - player.health / player.maxHealth) * 14 + (1 - player.mana / player.maxMana) * 6) * traits.recovery / frame.steps;
      const shieldFront = opponent.isShielding && (point.x - targets[step].x) * (opponent.facingRight ? 1 : -1) > 0;
      if (opponentInRange && !opponent.isInvulnerable && !opponent.isEvading && !shieldFront && player.attackCooldownRemaining <= elapsed * 1000 && Math.abs(point.y - targets[step].y) < 30 && Math.abs(point.x - targets[step].x) < (id === 'hunter' ? 275 : player.character!.attackRange)) benefit += player.character!.attackDamage * 1.3 * traits.aggression / frame.steps;
      if (mapId === 'graveyard') risk += Math.max(0, FLOOR_Y - point.y) / 4000 / frame.steps;
    }
    if (mapId === 'volcano' && !player.isFlying && vy > 0 && !platforms.some(p => p.id !== 'ground' && p.y >= point.y + PLAYER_SIZE && point.x + PLAYER_SIZE > p.x && point.x < p.x + p.width)) risk += 130;
    const noise = parameters.noise > 0 && options ? gaussian(options.random) * parameters.noise : 0;
    return { action, risk, score: risk * (lowHealth ? 1.4 : 1) * traits.defense + travelCost * (strategy === 'escape' || strategy === 'flank' ? 0.28 : 0.16) - benefit + (action.jump ? 7 : 0) + (action.drop ? 3 : 0) + (action.direction ? 0.5 : 0) + noise };
  }
  const candidates: Action[] = [];
  for (const direction of [0, -1, 1] as Direction[]) {
    candidates.push({ direction, jump: false, drop: false });
    if (canJump || player.isFlying) candidates.push({ direction, jump: true, drop: false });
    if (player.isFlying || (currentPlatform?.type === 'one-way' && (goal.y > player.y + 40 || strategy === 'escape') && !player.isJumping)) candidates.push({ direction, jump: false, drop: true });
  }
  const evaluated = candidates.map(evaluate);
  const best = evaluated.reduce((a, b) => a.score <= b.score ? a : b);
  const chosen = { ...best.action };
  const threatened = evaluated[0].risk > 35;
  const advanceRisk = Math.min(...evaluated.filter(c => c.action.direction === toward).map(c => c.risk));
  const allowLongRange = !isMelee(id) && (mapId === 'volcano' || zones.length > 0 || warnings.length > 0) && advanceRisk > best.risk + 20;
  memory.rangedHold = allowLongRange;
  let facingTarget = chosen.direction === toward || (chosen.direction === 0 && player.facingRight === (toward === 1));
  if (!facingTarget && chosen.direction === 0 && !threatened && strategy !== 'escape' &&
      (strategy !== 'flank' || !shieldFacesX(opponent, player.x + PLAYER_SIZE / 2))) {
    const turn = evaluated.find(c => c.action.direction === toward && c.action.jump === chosen.jump && c.action.drop === chosen.drop)!;
    if (turn.risk <= best.risk + 1) { chosen.direction = toward; facingTarget = true; }
  }
  const combat = chooseCombat(frame, player, opponent, model, chosen, facingTarget, threatened, strategy, targetAt, allowLongRange, options);
  // This status comes from the matured observation. Failed adaptation uses familiar
  // controls again on this decision, allowing lower tiers to make repeated mistakes.
  const compensate = player.isHacked && (parameters.controlAdaptation === 100 || (options?.random() ?? 0) < parameters.controlAdaptation / 100);
  const direction = compensate ? -chosen.direction : chosen.direction;
  const jump = compensate ? chosen.drop : chosen.jump, drop = compensate ? chosen.jump : chosen.drop;
  if (player.id === 2) {
    keys.arrowLeft = direction < 0; keys.arrowRight = direction > 0; keys.arrowUp = jump; keys.arrowDown = drop;
    keys.shift = combat.attack; keys.enter = combat.skill; keys.backslash = combat.ultimate;
  } else {
    keys.a = direction < 0; keys.d = direction > 0; keys.w = jump; keys.s = drop;
    keys.f = combat.attack; keys.g = combat.skill; keys.h = combat.ultimate;
  }
  memory.lastKeys = keys;
  return { keys, memory, risk: best.risk };
}
