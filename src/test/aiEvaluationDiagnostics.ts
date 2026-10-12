import type { Player } from '@/types/game';
import type { AISettings } from '@/types/ai';
import type { DifficultyRuntime } from '@/hooks/ai/difficulty';
import type { AIWorld } from '@/hooks/ai/world';
import type { PositionDecision } from '@/hooks/ai/controller';

interface PositionTrace {
  definitionVersion: 1; decisions: number; heightGapSum: number; goalHeightGapSum: number;
  higherGoalDecisions: number; lowerGoalDecisions: number; sameHeightGoalDecisions: number;
  goalPlatformChanges: number; forecastLandings: number; observedPatternDecisions: number;
  examples: PositionDecision[]; lastGoalPlatform?: string;
}
function createPositionTrace(): PositionTrace {
  return { definitionVersion: 1, decisions: 0, heightGapSum: 0, goalHeightGapSum: 0,
    higherGoalDecisions: 0, lowerGoalDecisions: 0, sameHeightGoalDecisions: 0,
    goalPlatformChanges: 0, forecastLandings: 0, observedPatternDecisions: 0, examples: [] };
}

interface ErrorTotal { samples: number; absoluteError: number }
/** Post-hoc evaluation only. Nothing in this record is supplied to a controller. */
export function createEvaluationTrace() {
  const positioning: PositionTrace | undefined = undefined;
  return {
    frames: 0, aliveMs: 0, directionReversals: 0, commandedMovementMs: 0,
    commandedNoProgressMs: 0, forcedImmobilityMs: 0, wallBlockedMs: 0,
    failedJumpIncreases: 0, damageDuringAttackCooldown: 0,
    engagementDistanceMs: 0, readyFacingAwayMs: 0,
    inputMismatchMs: { movement: 0, jump: 0, attack: 0, skill: 0, ultimate: 0 },
    inferenceErrors: {} as Record<string, ErrorTotal>,
    lastDirection: 0, lastInferenceAt: -Infinity, positioning,
  };
}
export type EvaluationTrace = ReturnType<typeof createEvaluationTrace>;
/** Optional sidecar extension; historical/frozen controllers may not emit it.
 * The samples describe existing movement selection, not an optimal-height policy.
 */
export function recordPositionDecision(trace: EvaluationTrace, decision: PositionDecision) {
  const positions = trace.positioning ??= createPositionTrace();
  const changed = positions.decisions > 0 && positions.lastGoalPlatform !== decision.goal.platformId;
  positions.decisions++;
  positions.heightGapSum += Math.abs(decision.self.y - decision.opponent.y);
  positions.goalHeightGapSum += Math.abs(decision.self.y - decision.goal.y);
  if (decision.goal.y < decision.self.y) positions.higherGoalDecisions++;
  else if (decision.goal.y > decision.self.y) positions.lowerGoalDecisions++;
  else positions.sameHeightGoalDecisions++;
  if (changed) positions.goalPlatformChanges++;
  if (decision.forecastLanding) positions.forecastLandings++;
  if (decision.patterns.samples > 0) positions.observedPatternDecisions++;
  // Bounded transition examples, not a representative distribution of all ticks.
  if (positions.decisions === 1 || changed) {
    positions.examples.push(decision);
    if (positions.examples.length > 12) positions.examples.shift();
  }
  positions.lastGoalPlatform = decision.goal.platformId;
}
export function recordInference(trace: EvaluationTrace, world: AIWorld, settings: AISettings,
  previous: DifficultyRuntime, next: DifficultyRuntime) {
  if (previous.observationsTaken === next.observationsTaken || trace.lastInferenceAt === world.now) return;
  trace.lastInferenceAt = world.now;
  const observed = next.perception.last;
  if (!observed || observed.now !== world.now) return;
  const add = (field: string, inferred: number, actual: number) => {
    if (!Number.isFinite(inferred) || !Number.isFinite(actual)) return;
    const total = trace.inferenceErrors[field] ??= { samples: 0, absoluteError: 0 };
    total.samples++; total.absoluteError += Math.abs(inferred - actual);
  };
  // Perception memory retains player estimates before noise/exact overrides.
  // These are base-inference errors, not claims about the matured noisy decision input.
  if (settings.parameters.estimation.movement.mode === 'estimated') {
    for (const index of [0, 1] as const) for (const field of ['velocityX', 'velocityY', 'knockbackVelocityX', 'knockbackVelocityY'] as const) {
      add(`playerBase.${index === 0 ? 'enemy' : 'self'}.${field}`, observed.players[index][field], world.players[index][field]);
    }
  }
  if (settings.parameters.estimation.cooldowns.mode === 'estimated' && settings.parameters.information.attackCooldowns) {
    add('playerBase.enemy.attackCooldown', observed.players[0].attackCooldownRemaining, world.players[0].attackCooldownRemaining);
  }
  // Entity memory already has the permitted property estimates/noise. Match visible IDs only;
  // remembered traps and intentionally hidden entities are not counted as missing observations.
  if (settings.parameters.information.projectiles) for (const shot of observed.projectiles) {
    const raw = world.projectiles.find(value => value.id === shot.id);
    if (!raw) continue;
    for (const field of ['velocityX', 'velocityY', 'damage', 'lifetime'] as const) add(`projectile.${field}`, shot[field], raw[field]);
  }
  if (settings.parameters.information.hazards) for (const zone of observed.hazardZones) {
    const raw = world.hazardZones.find(value => value.id === zone.id);
    if (!raw) continue;
    for (const field of ['damage', 'duration', 'health', 'maxHealth', 'attackRange', 'velocityY', 'attackCooldown', 'lastAttack', 'lastSelfDamage'] as const) {
      const inferred = zone[field], actual = raw[field];
      // Missing estimates are unknown, not a zero-error prediction.
      if (typeof inferred === 'number' && typeof actual === 'number') add(`hazard.${field}`, inferred, actual);
    }
  }
}

export function recordEvaluationFrame(trace: EvaluationTrace, before: Player, after: Player,
  runtime: DifficultyRuntime | undefined, elapsedMs: number, arenaLeft: number, arenaRight: number, receivedDamage: number, opponent?: Player) {
  if (!runtime) return;
  trace.frames++; if (before.health > 0) trace.aliveMs += elapsedMs;
  if (opponent) {
    const distance = Math.hypot(before.x - opponent.x, before.y - opponent.y);
    trace.engagementDistanceMs += distance * elapsedMs;
    // Geometric exposure proxy, not a claim that a blocked shot would hit.
    if (before.attackCooldownRemaining <= 0 && !before.isStunned && !before.isFrozen &&
      distance <= before.character!.attackRange && Math.abs(before.y - opponent.y) < 40 &&
      before.facingRight !== (opponent.x >= before.x)) trace.readyFacingAwayMs += elapsedMs;
  }
  const keys = runtime.keys, desired = runtime.memory?.lastKeys;
  const direction = Number(keys.arrowRight) - Number(keys.arrowLeft);
  if (direction) {
    if (trace.lastDirection && direction !== trace.lastDirection) trace.directionReversals++;
    trace.lastDirection = direction;
    trace.commandedMovementMs += elapsedMs;
    const forced = before.isStunned || before.isFrozen || before.rootDuration > 0 ||
      before.isEvading || before.isDashing || before.isFlying || Math.abs(before.knockbackVelocityX) > 1;
    const wall = direction < 0 && before.x <= arenaLeft + 1 || direction > 0 && before.x >= arenaRight - 1;
    const noProgress = Math.abs(after.x - before.x) < 0.1 && Math.abs(after.y - before.y) < 0.1;
    if (forced) { if (noProgress) trace.forcedImmobilityMs += elapsedMs; }
    else if (wall) trace.wallBlockedMs += elapsedMs;
    else if (noProgress) trace.commandedNoProgressMs += elapsedMs;
  }
  if (before.attackCooldownRemaining > 0) trace.damageDuringAttackCooldown += receivedDamage;
  if (desired) {
    const mismatches = { movement: desired.arrowLeft !== keys.arrowLeft || desired.arrowRight !== keys.arrowRight,
      jump: desired.arrowUp !== keys.arrowUp || desired.arrowDown !== keys.arrowDown,
      attack: desired.shift !== keys.shift, skill: desired.enter !== keys.enter, ultimate: desired.backslash !== keys.backslash };
    for (const name of Object.keys(mismatches) as (keyof typeof mismatches)[]) if (mismatches[name]) trace.inputMismatchMs[name] += elapsedMs;
  }
}
export function reportEvaluationTrace(trace: EvaluationTrace) {
  const { lastDirection: _direction, lastInferenceAt: _inferenceAt, positioning, ...report } = trace;
  const positionReport = positioning && (() => {
    const { lastGoalPlatform: _platform, ...data } = positioning;
    return data;
  })();
  return { ...report, positioning: positionReport, inferenceErrors: Object.fromEntries(Object.entries(trace.inferenceErrors)
    .map(([field, value]) => [field, { ...value, mae: value.samples ? value.absoluteError / value.samples : null }])) };
}
