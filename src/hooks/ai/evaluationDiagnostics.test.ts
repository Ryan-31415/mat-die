import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { MAPS } from '@/types/map';
import { createHazardZone, createProjectile } from '@/types/projectile';
import { CURRENT_AI, evaluationController } from '@/test/aiEvaluation';
import { createEvaluationTrace, recordEvaluationFrame, recordInference, reportEvaluationTrace } from '@/test/aiEvaluationDiagnostics';
import { emptyAIKeys } from './controller';
import { createAIMemory } from './state';
import type { AIWorld } from './world';

describe('post-hoc diagnostics without controller feedback', () => {
  it('separates commanded stalls, walls and forced states, and measures applied-input delay', () => {
    const trace = createEvaluationTrace();
    const p = { ...createInitialPlayer(2, CHARACTERS.ninja), x: 300, y: 440 };
    const runtime = CURRENT_AI.createDifficultyRuntime(CURRENT_AI.createDifficultySession(731));
    runtime.keys = { ...emptyAIKeys(), arrowRight: true };
    runtime.memory = { ...createAIMemory(p, 10000), lastKeys: { ...emptyAIKeys(), arrowRight: true, shift: true } };
    recordEvaluationFrame(trace, p, p, runtime, 16, 40, 720, 0);
    recordEvaluationFrame(trace, { ...p, isStunned: true }, p, runtime, 16, 40, 720, 0);
    recordEvaluationFrame(trace, { ...p, x: 720 }, { ...p, x: 720 }, runtime, 16, 40, 720, 0);
    runtime.keys.arrowRight = false; runtime.keys.arrowLeft = true;
    recordEvaluationFrame(trace, p, { ...p, x: 295, health: p.health - 5 }, runtime, 16, 40, 720, 5);
    expect(reportEvaluationTrace(trace)).toMatchObject({ frames: 4, aliveMs: 64, directionReversals: 1,
      commandedMovementMs: 64, commandedNoProgressMs: 16, forcedImmobilityMs: 16, wallBlockedMs: 16,
      damageDuringAttackCooldown: 0, inputMismatchMs: { attack: 64, movement: 16 } });
    // Healing within a tick must not hide received damage; moving flight is not immobility.
    recordEvaluationFrame(trace, { ...p, attackCooldownRemaining: 500, isFlying: true },
      { ...p, x: 310, health: p.health + 5 }, runtime, 16, 40, 720, 5);
    expect(trace.damageDuringAttackCooldown).toBe(5);
    expect(trace.forcedImmobilityMs).toBe(16);
  });
  it('records permitted noisy rocket/coil estimates once per fresh sample without changing difficulty output', () => {
    const settings = createAISettings('medium');
    const controller = evaluationController(CURRENT_AI, settings, 731, 2);
    const before = controller.initial();
    const world: AIWorld = { players: [createInitialPlayer(1, CHARACTERS.rocketeer), createInitialPlayer(2, CHARACTERS.ninja)],
      projectiles: [createProjectile('rocket', 1, 350, 440, 600, 0, 16, { now: 10000, random: () => 0.3 })],
      hazardZones: [createHazardZone('tesla-coil', 1, 400, 440, 10, 30000, { now: 10000, random: () => 0.3 })],
      attackHitboxes: [], platforms: MAPS.wasteland.platforms, mapId: 'wasteland', now: 10000, deltaTime: 16,
      roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right',
      sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
    const expected = CURRENT_AI.stepDifficulty(world, settings, before);
    const actual = controller.step(world, before).state;
    expect(actual).toEqual(expected);
    const recorded = structuredClone(reportEvaluationTrace(controller.trace));
    const coilError = Math.abs(actual.perception.last.hazardZones[0].maxHealth - 175);
    expect(recorded.inferenceErrors['hazard.maxHealth'].mae).toBe(coilError);
    // Medium retains 10% noise and 2%-of-scale quantization around the corrected public HP175.
    expect(coilError).toBeLessThanOrEqual(19.25);
    expect(recorded.inferenceErrors['projectile.velocityX'].samples).toBe(1);
    recordInference(controller.trace, world, settings, before, actual);
    expect(reportEvaluationTrace(controller.trace)).toEqual(recorded);
    const later = { ...world, now: 10016 };
    const next = CURRENT_AI.stepDifficulty(later, settings, actual);
    recordInference(controller.trace, later, settings, actual, next);
    expect(reportEvaluationTrace(controller.trace)).toEqual(recorded);
  });
  it('records exact coil state errors without supplying raw state to the controller or treating unknown timestamps as zero', () => {
    const world: AIWorld = { players: [createInitialPlayer(1, CHARACTERS.scientist), createInitialPlayer(2, CHARACTERS.ninja)],
      projectiles: [], hazardZones: [{ ...createHazardZone('tesla-coil', 1, 400, 200, 10, 30000,
        { now: 10000, random: () => 0.3 }), health: 87.5, velocityY: 300, isGrounded: false, lastAttack: 9950, lastSelfDamage: 9900 }],
      attackHitboxes: [], platforms: MAPS.wasteland.platforms, mapId: 'wasteland', now: 10000, deltaTime: 16,
      roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right',
      sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
    const settings = createAISettings('perfect'), controller = evaluationController(CURRENT_AI, settings, 731, 2);
    const before = controller.initial(), source = structuredClone(world);
    expect(controller.step(world, before).state).toEqual(CURRENT_AI.stepDifficulty(world, settings, before));
    expect(world).toEqual(source);
    const errors = reportEvaluationTrace(controller.trace).inferenceErrors;
    for (const field of ['health', 'velocityY', 'attackCooldown', 'lastAttack', 'lastSelfDamage'])
      expect(errors['hazard.' + field]).toEqual({ samples: 1, absoluteError: 0, mae: 0 });
    const estimated = evaluationController(CURRENT_AI, createAISettings('medium'), 731, 2);
    estimated.step(world, estimated.initial());
    const estimates = reportEvaluationTrace(estimated.trace).inferenceErrors;
    expect(estimates['hazard.velocityY']).toEqual({ samples: 1, absoluteError: 300, mae: 300 });
    expect(estimates['hazard.lastAttack']).toBeUndefined();
    expect(estimates['hazard.lastSelfDamage']).toBeUndefined();
  });
});
