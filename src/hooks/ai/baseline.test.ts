import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer, type CharacterType } from '@/types/game';
import { createAISettings, AI_PRESET_IDS } from '@/types/ai';
import { MAPS, type MapId } from '@/types/map';
import { createProjectile } from '@/types/projectile';
import { loadEvaluationBaseline, loadFrozenAI } from '@/test/aiBaseline';
import { createDifficultyRuntime, createDifficultySession, stepDifficulty } from './difficulty';
import type { AIWorld } from './world';

describe('frozen pre-improvement AI', () => {
  it('isolates current public rules from the original snapshot and fingerprints every rule change', () => {
    const original = loadFrozenAI(), adapted = loadEvaluationBaseline(), second = loadEvaluationBaseline();
    expect(original.hash).toBe('312f5f45606fd55e4a34170af0dbddb967e1b1ae60e4dcfce7028361f9bd3df1');
    expect(original.api.CHARACTERS.gladiator.attackCooldown).toBe(850);
    expect(adapted.api.CHARACTERS).toEqual(CHARACTERS);
    expect(adapted.api.CHARACTERS).not.toBe(original.api.CHARACTERS);
    expect(adapted.api.CHARACTERS).not.toBe(second.api.CHARACTERS);
    expect(adapted.hash).toBe(second.hash);
    expect(adapted.bundleHash).toBe(original.hash);
    const changed = structuredClone(CHARACTERS); changed.gladiator.attackCooldown++;
    const alternate = loadEvaluationBaseline(undefined, changed);
    expect(alternate.hash).not.toBe(adapted.hash);
    expect(alternate.characterRulesHash).not.toBe(adapted.characterRulesHash);
    expect(original.api.CHARACTERS.gladiator.attackCooldown).toBe(850);
    expect(adapted.api.CHARACTERS).toEqual(CHARACTERS);
    expect(loadFrozenAI().hash).toBe(original.hash);
  });

  it('uses the same character rule registry in actual old-AI perception, not just exported metadata', () => {
    const adapted = loadEvaluationBaseline();
    const parameters = createAISettings('perfect').parameters;
    for (const character of Object.keys(CHARACTERS) as CharacterType[]) {
      const players: AIWorld['players'] = [createInitialPlayer(1, CHARACTERS[character]), createInitialPlayer(2, CHARACTERS[character])];
      const world: AIWorld = { players, projectiles: [], hazardZones: [], attackHitboxes: [], mapId: 'wasteland', platforms: MAPS.wasteland.platforms,
        now: 10000, deltaTime: 16, roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right',
        sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
      const observed = adapted.api.perceiveWorld(world, parameters, adapted.api.createPerceptionMemory()).world;
      expect(observed.players.map(player => player.character)).toEqual([CHARACTERS[character], CHARACTERS[character]]);
      const originalRules = loadFrozenAI().api.CHARACTERS;
      const unchanged = loadEvaluationBaseline(undefined, originalRules).api;
      const original = loadFrozenAI().api;
      const settings = createAISettings('perfect');
      expect(unchanged.stepDifficulty(world, settings, unchanged.createDifficultyRuntime(unchanged.createDifficultySession(731))))
        .toEqual(original.stepDifficulty(world, settings, original.createDifficultyRuntime(original.createDifficultySession(731))));
    }
  });

  it('independently replays old and current AI across all characters, maps and presets', () => {
    const { api, metadata } = loadEvaluationBaseline();
    expect(metadata.commit).toBe('8263adff9d9e1738ffa27e4ffe7e936a443ffdf3');
    for (const character of Object.keys(CHARACTERS) as CharacterType[]) {
      for (const mapId of Object.keys(MAPS) as MapId[]) for (const preset of AI_PRESET_IDS) {
        const settings = createAISettings(preset);
        let live = createDifficultyRuntime(createDifficultySession(731));
        let frozen = api.createDifficultyRuntime(api.createDifficultySession(731));
        for (const time of [0, 100, 200, 400, 600]) {
          const now = 10000 + time;
          const players: AIWorld['players'] = [
            { ...createInitialPlayer(1, CHARACTERS.archer), x: 200 + time / 10, y: 440, lastGroundedTime: now },
            { ...createInitialPlayer(2, CHARACTERS[character]), x: 480, y: 440, lastGroundedTime: now },
          ];
          const projectile = createProjectile('arrow', 1, 350 + time / 10, 445, 1000, -80, 10,
            { now: 10000, random: () => 0.3 });
          const world: AIWorld = { players, projectiles: [projectile], hazardZones: [], attackHitboxes: [],
            mapId, platforms: MAPS[mapId].platforms, now, deltaTime: time ? 100 : 16,
            roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right',
            sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
          const source = structuredClone(world);
          const nextLive = stepDifficulty(world, settings, live);
          const nextFrozen = api.stepDifficulty(world, settings, frozen);
          const condition = character + '/' + mapId + '/' + preset + '/' + time;
          expect(stepDifficulty(world, settings, live), condition + '/current').toEqual(nextLive);
          expect(api.stepDifficulty(world, settings, frozen), condition + '/baseline').toEqual(nextFrozen);
          expect(world, condition + '/immutable').toEqual(source);
          live = nextLive; frozen = nextFrozen;
        }
      }
    }
  }, 20000);
});
