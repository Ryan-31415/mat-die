import { describe, expect, it } from 'vitest';
import { loadFrozenAI } from '@/test/aiBaseline';
import { cpuScene } from '@/test/aiCpuScenes';
import { CHARACTERS, type CharacterType } from '@/types/game';
import { AI_PRESET_IDS, createAISettings } from '@/types/ai';
import { createDifficultyRuntime, createDifficultySession, stepDifficulty } from './difficulty';

describe('stage 4-A against the merged current-rule baseline', () => {
  it('preserves inputs, memory and RNG for all characters outside changed blizzard geometry', () => {
    const before = loadFrozenAI('docs/stage4-a/before.cjs').api;
    let checks = 0;
    for (const character of Object.keys(CHARACTERS) as CharacterType[])
      for (const map of ['default', 'wasteland', 'graveyard', 'jungle', 'volcano'] as const)
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
    expect(checks).toBe(1500);
  }, 60000);
});
