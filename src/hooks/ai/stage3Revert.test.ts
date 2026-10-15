import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { loadFrozenAI } from '@/test/aiBaseline';
import { cpuScene } from '@/test/aiCpuScenes';
import { hunterDScenes } from '@/test/hunterDScenes';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { AI_PRESET_IDS, createAISettings } from '@/types/ai';
import { circleIntersectsRect } from '@/types/combatPhysics';
import { prepareAIFrame } from './world';
import { decideAI, type PositionDecision } from './controller';
import { selectGoal } from './navigation';
import { createDifficultyRuntime, createDifficultySession, stepDifficulty } from './difficulty';

const beforePath = 'docs/stage3-selective-revert/before.cjs';
const legacyPath = 'docs/stage3-selective-revert/legacy-current-rules.cjs';

describe('selectively retired stage-three live tactics', () => {
  it.each(['hunter', 'rocketeer'] as const)('uses legacy %s spacing without a stage-three movement/shot sidecar', character => {
    const world = cpuScene(0, character, 'wasteland');
    world.players[0].x = 500;
    const self = world.players[1], enemy = world.players[0];
    const ready = selectGoal(self, enemy, prepareAIFrame(world)).preferred;
    self.attackCooldownRemaining = 800;
    expect(selectGoal(self, enemy, prepareAIFrame(world)).preferred).toBe(ready);
    let diagnostic: PositionDecision | undefined;
    decideAI(prepareAIFrame(world), self, undefined, undefined, undefined, value => { diagnostic = value; });
    expect(diagnostic?.rangedWork).toBeUndefined();
  });
  it('restores the Hunter basic and focused spacing, retaining low-health escape', () => {
    const world = cpuScene(0, 'hunter', 'wasteland'), self = world.players[1];
    world.players = [{ ...createInitialPlayer(1, CHARACTERS.hunter), x: 500, y: 440 }, self];
    expect(selectGoal(self, world.players[0], prepareAIFrame(world)).preferred).toBe(180);
    self.hunterFocusedDuration = 5000;
    expect(selectGoal(self, world.players[0], prepareAIFrame(world)).preferred).toBe(240);
    self.health = 20;
    expect(selectGoal(self, world.players[0], prepareAIFrame(world)).preferred).toBeGreaterThanOrEqual(330);
  });
  it('preserves circular blizzard edges, corners and overlap', () => {
    const circle = { x: 100, y: 100, width: 400, height: 400 };
    expect(circleIntersectsRect(circle, { x: 100, y: 100, width: 40, height: 40 })).toBe(false);
    expect(circleIntersectsRect(circle, { x: 480, y: 280, width: 40, height: 40 })).toBe(true);
    expect(circleIntersectsRect(circle, { x: 501, y: 280, width: 40, height: 40 })).toBe(false);
    expect(circleIntersectsRect(circle, { x: 280, y: 280, width: 40, height: 40 })).toBe(true);
  });
});

// Optional local provenance artifacts contain the same current engine/rules.
// They never use the historical A/C/D engines as a regression oracle.
describe.skipIf(!existsSync(beforePath) || !existsSync(legacyPath))('same-current-rule policy equivalence', () => {
  it.each(hunterDScenes())('$id keeps the fixed Hunter observation coverage under current rules', ({ world }) => {
    const legacy = loadFrozenAI(legacyPath).api;
    const original = structuredClone(world);
    const previous = legacy.decideAI(legacy.prepareAIFrame(world), world.players[1]);
    const next = decideAI(prepareAIFrame(world), world.players[1]);
    expect(next).toEqual(previous);
    expect(world).toEqual(original);
  });
  function compare(characters: (keyof typeof CHARACTERS)[], path: string) {
    const before = loadFrozenAI(path).api;
    let checks = 0;
    for (const character of characters) for (const map of ['default', 'wasteland', 'graveyard', 'jungle', 'volcano'] as const)
      for (const preset of AI_PRESET_IDS) for (const variant of [0, 1]) {
        const world = cpuScene(variant ? 6 : 0, character, map, variant), settings = createAISettings(preset);
        const original = structuredClone(world);
        let old = before.createDifficultyRuntime(before.createDifficultySession(731));
        let next = createDifficultyRuntime(createDifficultySession(731));
        for (const offset of [0, 500, 1000]) {
          const observation = { ...world, now: world.now + offset, deltaTime: offset ? 500 : world.deltaTime };
          old = before.stepDifficulty(observation, settings, old);
          next = stepDifficulty(observation, settings, next);
          expect(next, `${character}/${map}/${preset}/${variant}/${offset}`).toEqual(old);
          checks++;
        }
        expect(world).toEqual(original);
      }
    return checks;
  }
  it('preserves eight non-target characters inputs, memory and RNG on 1200 transitions', () => {
    const characters = (Object.keys(CHARACTERS) as (keyof typeof CHARACTERS)[]).filter(id => id !== 'hunter' && id !== 'rocketeer');
    expect(compare(characters, beforePath)).toBe(1200);
  }, 30000);
  it('restores Hunter/Rocketeer legacy policies with current rules on 300 transitions', () => {
    expect(compare(['hunter', 'rocketeer'], legacyPath)).toBe(300);
  }, 15000);
});
