import { JUMP_FORCE, type Platform } from '@/types/platform';
import { PLAYER_SIZE, type Player } from '@/types/game';
import { clampPlayerX, fallStep, playerMoveSpeed } from '@/types/combatPhysics';

export type Direction = -1 | 0 | 1;
export interface Observation {
  time: number; x: number; y: number; vx: number; direction: Direction;
  grounded: boolean; health: number; attackCooldown: number; observerCooldown: number; observerX: number;
  knockbackX: number; disabled: boolean;
}
export interface OpponentModel {
  last?: Observation;
  samples: Observation[];
  velocityX: number;
  transitions: number[];
  jumpCount: number;
  jumpCadenceCount: number;
  jumpInterval: number;
  lastJumpAt?: number;
  groundedCount: number;
  attackInterval: number;
  attackCount: number;
  lastAttackAt?: number;
  lastTurnAt?: number;
  turnInterval: number;
  turnCount: number;
  reactionAt?: number;
  reactionCount: number;
  reactionJump: number;
  reactionAway: number;
}
export const createOpponentModel = (): OpponentModel => ({
  samples: [], velocityX: 0, transitions: Array(9).fill(0), jumpCount: 0, jumpCadenceCount: 0, jumpInterval: 0, groundedCount: 0,
  attackInterval: 0, attackCount: 0, turnInterval: 0, turnCount: 0,
  reactionCount: 0, reactionJump: 0, reactionAway: 0,
});

/** Keep tendencies across rounds/rematches, discard continuity across teleports and pauses. */
export function resetObservation(model: OpponentModel): OpponentModel {
  return { ...model, last: undefined, samples: [], velocityX: 0, lastAttackAt: undefined, lastTurnAt: undefined, lastJumpAt: undefined, reactionAt: undefined };
}

export function observeOpponent(model: OpponentModel, player: Player, observer: Player, now: number): OpponentModel {
  if (model.last?.time === now) return model;
  const last = model.last;
  const dt = last ? (now - last.time) / 1000 : 0;
  const disabled = player.isStunned || player.isFrozen || player.rootDuration > 0 || player.isDashing;
  const maxSpeed = playerMoveSpeed(player, now);
  const rawVelocity = last && dt > 0 ? (player.x - last.x) / dt - last.knockbackX * Math.pow(0.9, dt * 1000 / 16) : 0;
  const continuous = !!last && dt > 0 && dt < 0.25 && !disabled && !last.disabled &&
    Math.abs(rawVelocity) <= maxSpeed * 1.6 + 80;
  const vx = continuous ? Math.max(-maxSpeed, Math.min(maxSpeed, rawVelocity)) : 0;
  const direction: Direction = Math.abs(vx) < 25 ? 0 : vx > 0 ? 1 : -1;
  const observation: Observation = {
    time: now, x: player.x, y: player.y, vx, direction, grounded: player.isGrounded,
    health: player.health, attackCooldown: player.attackCooldownRemaining,
    observerCooldown: observer.attackCooldownRemaining, observerX: observer.x, knockbackX: player.knockbackVelocityX, disabled,
  };
  if (!continuous) return { ...resetObservation(model), last: observation };
  const decay = Math.pow(0.5, dt / 10);
  const next: OpponentModel = {
    ...model, last: observation, velocityX: vx * 0.8 + model.velocityX * 0.2,
    transitions: model.transitions.map(n => n * decay), jumpCount: model.jumpCount * decay,
    groundedCount: model.groundedCount * decay, attackCount: model.attackCount * decay,
    jumpCadenceCount: model.jumpCadenceCount * decay,
    turnCount: model.turnCount * decay, reactionCount: model.reactionCount * decay,
    reactionJump: model.reactionJump * decay, reactionAway: model.reactionAway * decay,
  };
  // At most 20 statistical observations per second, with a hard memory bound.
  if (!model.samples.length || now - model.samples[model.samples.length - 1].time >= 50) {
    next.samples = [...model.samples.filter(s => now - s.time <= 8000), observation].slice(-160);
    next.transitions[(last.direction + 1) * 3 + direction + 1]++;
    if (player.isGrounded) next.groundedCount++;
  }
  if (last.grounded && !player.isGrounded && player.velocityY < -200 && Math.abs(player.knockbackVelocityY) < 50) {
    next.jumpCount++;
    if (model.lastJumpAt !== undefined) {
      const interval = now - model.lastJumpAt;
      if (interval >= 300 && interval <= 5000) {
        next.jumpInterval = model.jumpCadenceCount ? model.jumpInterval * 0.65 + interval * 0.35 : interval;
        next.jumpCadenceCount++;
      }
    }
    next.lastJumpAt = now;
  }
  if (direction && last.direction && direction !== last.direction) {
    if (model.lastTurnAt !== undefined) {
      const interval = now - model.lastTurnAt;
      if (interval >= 150 && interval <= 5000) {
        next.turnInterval = model.turnCount ? model.turnInterval * 0.65 + interval * 0.35 : interval;
        next.turnCount++;
      }
    }
    next.lastTurnAt = now;
  }
  if (player.attackCooldownRemaining > last.attackCooldown + 50) {
    if (model.lastAttackAt !== undefined) {
      const interval = now - model.lastAttackAt;
      next.attackInterval = model.attackCount ? model.attackInterval * 0.7 + interval * 0.3 : interval;
      next.attackCount++;
    }
    next.lastAttackAt = now;
  }
  if (observer.attackCooldownRemaining > last.observerCooldown + 50 || player.health < last.health) next.reactionAt = now;
  if (model.reactionAt !== undefined && now - model.reactionAt >= 200) {
    next.reactionCount++;
    if (!player.isGrounded && player.velocityY < 0) next.reactionJump++;
    next.reactionAway += direction * Math.sign(player.x - observer.x);
    next.reactionAt = undefined;
  }
  return next;
}

export function predictOpponent(model: OpponentModel, player: Player, time: number, platforms: readonly Platform[], now: number, underAttack = false, path?: { x: number; y: number; confidence: number }[]) {
  const confidence = Math.min(1, model.samples.length / 8);
  let vx = player.velocityX * (1 - confidence) + model.velocityX * confidence;
  let x = player.x;
  let y = player.y;
  let vy = player.velocityY;
  let grounded = player.isGrounded;
  let reversed = false;
  const turnIn = model.turnCount >= 2 && model.lastTurnAt !== undefined && model.turnInterval > 0
    ? Math.max(0, (model.turnInterval - (now - model.lastTurnAt)) / 1000) : Infinity;
  const jumpResponse = underAttack && model.reactionCount >= 3 && model.reactionJump / model.reactionCount > 0.65;
  const jumpIn = model.jumpCadenceCount >= 3 && model.lastJumpAt !== undefined && model.jumpInterval > 0
    ? Math.max(0, (model.jumpInterval - (now - model.lastJumpAt)) / 1000) : Infinity;
  const retreatResponse = underAttack && model.reactionCount >= 3 && model.reactionAway / model.reactionCount > 0.65;
  let jumped = false;
  for (let elapsed = 0; elapsed < time - 1e-9; elapsed += 1 / 60) {
    const dt = Math.min(1 / 60, time - elapsed);
    if (!reversed && elapsed >= turnIn && vx) { vx *= -1; reversed = true; }
    x = clampPlayerX(x + (vx + player.knockbackVelocityX * Math.pow(0.9, elapsed * 60)) * dt);
    if (retreatResponse && elapsed >= 0.18) vx = Math.sign(player.x - (model.last?.observerX ?? player.x)) * (Math.abs(vx) || playerMoveSpeed(player, now) * confidence);
    if (!jumped && grounded && !player.rootDuration && !player.isStunned && !player.isFrozen &&
        (elapsed >= jumpIn || (jumpResponse && elapsed >= 0.18))) { grounded = false; vy = JUMP_FORCE; jumped = true; }
    if (player.isFlying) y += player.velocityY * dt;
    else if (!grounded) {
      const next = fallStep({ x, y }, vy, dt, platforms);
      y = next.y; vy = next.vy;
      grounded = vy === 0;
    } else if (!platforms.some(p => Math.abs(y + PLAYER_SIZE - p.y) < 12 && x + PLAYER_SIZE > p.x && x < p.x + p.width)) grounded = false;
    path?.push({ x, y, confidence });
  }
  return { x, y, confidence };
}
