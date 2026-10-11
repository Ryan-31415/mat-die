import { describe, expect, it, vi } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { createAISettings, NEUTRAL_AI_TRAITS } from '@/types/ai';
import { MAPS } from '@/types/map';
import { decideAI, type PositionDecision } from './controller';
import { createOpponentModel } from './learning';
import { prepareAIFrame, type AIWorld } from './world';
import { createDifficultyRuntime, createDifficultySession, stepDifficulty } from './difficulty';
import { createEvaluationTrace, recordPositionDecision, reportEvaluationTrace } from '@/test/aiEvaluationDiagnostics';

describe('optional selected-position diagnostics never feed back into play', () => {
  it.each([1, 2] as const)('P%s diagnostics only see the matured permitted observation', side => {
    const settings = createAISettings('medium');
    const self = { ...createInitialPlayer(side, CHARACTERS.archer), x: 500, y: 440 };
    const enemy = { ...createInitialPlayer(side === 1 ? 2 : 1, CHARACTERS.ninja), x: 200, y: 440 };
    const world: AIWorld = { players: side === 1 ? [self, enemy] : [enemy, self], projectiles: [], hazardZones: [],
      attackHitboxes: [], platforms: MAPS.wasteland.platforms, now: 10000, deltaTime: 16, mapId: 'wasteland',
      roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
      soulZones: [], lightningStrikes: [], vineShields: [] };
    const snapshots: PositionDecision[] = [];
    const collect = (detail: PositionDecision) => snapshots.push(detail);
    const initial = createDifficultyRuntime(createDifficultySession(731));
    const waiting = stepDifficulty(world, settings, initial, side, collect);
    expect(waiting.decisionsMade).toBe(0);
    expect(snapshots).toHaveLength(0);
    // The older sample matures now; this newly observed relocation remains delayed.
    const relocated = { ...enemy, x: 600 };
    const moved: AIWorld = { ...world, now: world.now + settings.parameters.reactionMax,
      deltaTime: settings.parameters.reactionMax,
      players: side === 1 ? [self, relocated] : [relocated, self] };
    const quiet = stepDifficulty(moved, settings, waiting, side);
    const traced = stepDifficulty(moved, settings, waiting, side, collect);
    expect(traced).toEqual(quiet);
    expect(traced.decisionsMade).toBe(1);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].opponent.x).toBe(200);
    expect(snapshots[0].now).toBe(world.now);
    expect(traced.observations.length).toBeGreaterThan(0);
  });

  for (const side of [1, 2] as const) for (const map of ['default', 'wasteland', 'graveyard', 'jungle', 'volcano'] as const)
    it.each(['gladiator', 'archer', 'scientist', 'hunter'] as const)(`P${side}/${map}/%s`, character => {
      const self = { ...createInitialPlayer(side, CHARACTERS[character]), x: 300, y: 440, facingRight: true };
      const enemy = { ...createInitialPlayer(side === 1 ? 2 : 1, CHARACTERS.ninja), x: 600, y: 200,
        isGrounded: false, isJumping: true, velocityY: 150 };
      const world: AIWorld = { players: side === 1 ? [self, enemy] : [enemy, self], projectiles: [], hazardZones: [],
        attackHitboxes: [], platforms: MAPS[map].platforms, now: 10000, deltaTime: 16, mapId: map,
        roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0,
        soulZones: [], lightningStrikes: [], vineShields: [] };
      const parameters = createAISettings('perfect').parameters, model = createOpponentModel();
      const source = structuredClone({ world, model });
      const frame = prepareAIFrame(world, { forecasts: parameters.forecasts, random: () => .5 });
      const quietRandom = vi.fn(() => .5), tracedRandom = vi.fn(() => .5), snapshots: PositionDecision[] = [];
      const quiet = decideAI(frame, self, model, undefined, { parameters, traits: NEUTRAL_AI_TRAITS, random: quietRandom });
      const traced = decideAI(frame, self, model, undefined, { parameters, traits: NEUTRAL_AI_TRAITS, random: tracedRandom }, detail => {
        snapshots.push(structuredClone(detail));
        // A misbehaving diagnostics consumer must not mutate the actual decision.
        detail.self.x = -999; detail.goal.x = -999; detail.executed.action.direction = -1;
        detail.patterns.samples = 999; detail.movementCandidates[0].action.jump = true;
      });
      expect(traced).toEqual(quiet);
      expect(tracedRandom.mock.calls).toEqual(quietRandom.mock.calls);
      expect({ world, model }).toEqual(source);
      expect(snapshots).toHaveLength(1);
      const detail = snapshots[0];
      expect(detail.goal.x).toBe(traced.memory.goal!.x);
      expect(detail.executed.risk).toBe(traced.risk);
      expect(detail.executed.attack).toBe(side === 1 ? traced.keys.f : traced.keys.shift);
      expect(detail.executed.skill).toBe(side === 1 ? traced.keys.g : traced.keys.enter);
      expect(detail.patterns.samples).toBe(0);
      expect(detail.movementCandidates.every(candidate => Number.isFinite(candidate.score))).toBe(true);
      expect(detail.forecastLanding).toBeDefined();
      expect(detail.forecastLanding!.timeMs).toBeLessThanOrEqual(parameters.forecasts.opponent.horizonMs);
      const trace = createEvaluationTrace();
      recordPositionDecision(trace, detail);
      expect(reportEvaluationTrace(trace).positioning).toMatchObject({ definitionVersion: 1, decisions: 1, heightGapSum: 240 });
    });
});
