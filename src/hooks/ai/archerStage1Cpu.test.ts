import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARACTERS, createInitialPlayer } from '@/types/game';
import { createAISettings } from '@/types/ai';
import { MAPS } from '@/types/map';
import { createProjectile } from '@/types/projectile';
import { loadFrozenAI, type FrozenAIAPI } from '@/test/aiBaseline';
import { CURRENT_AI } from '@/test/aiEvaluation';
import type { AIWorld } from './world';

type Pipeline = Pick<FrozenAIAPI, 'createDifficultyRuntime' | 'createDifficultySession' | 'stepDifficulty'>;

function measure(api: Pipeline, world: AIWorld) {
  const settings = createAISettings('perfect');
  const initial = api.createDifficultyRuntime(api.createDifficultySession(731));
  for (let i = 0; i < 12; i++) api.stepDifficulty(world, settings, initial);
  const samples: number[] = [];
  for (let i = 0; i < 80; i++) {
    const start = performance.now();
    api.stepDifficulty(world, settings, initial);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { meanMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    p95Ms: samples[Math.floor(samples.length * .95)], p99Ms: samples[Math.floor(samples.length * .99)] };
}

describe.skipIf(process.env.RUN_ARCHER_STAGE1_CPU !== '1')('Archer stage-one whole AI pipeline cost', () => {
  it('compares the same observation at 0/20/60/120 projectiles in alternating order', () => {
    const baseline = loadFrozenAI('docs/ai-runs/archer-stage1-baseline/baseline.cjs');
    const enemy = { ...createInitialPlayer(1, CHARACTERS.mage), x: 600, y: 440, facingRight: false };
    const archer = { ...createInitialPlayer(2, CHARACTERS.archer), x: 200, y: 440, facingRight: true };
    const results: { projectiles: number; repeat: number; baseline: ReturnType<typeof measure>;
      current: ReturnType<typeof measure>; ratio: number }[] = [];
    for (const count of [0, 20, 60, 120]) {
      const projectiles = Array.from({ length: count }, (_, index) => ({
        ...createProjectile('fireball', 1, 250 + index % 20 * 24, 80 + index % 5 * 65,
          -780, 0, 18, { now: 10000, random: () => 0.5 }), id: 'cost-shot-' + index,
      }));
      const world: AIWorld = { players: [enemy, archer], projectiles, hazardZones: [], attackHitboxes: [],
        platforms: MAPS.default.platforms, mapId: 'default', now: 10000, deltaTime: 1000 / 60,
        roundTimeRemaining: 60, isOvertime: false, sandstormActive: false, sandstormDirection: 'right',
        sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
      for (let repeat = 0; repeat < 3; repeat++) {
        const first = repeat % 2 ? CURRENT_AI : baseline.api;
        const second = repeat % 2 ? baseline.api : CURRENT_AI;
        const firstResult = measure(first, world), secondResult = measure(second, world);
        const old = repeat % 2 ? secondResult : firstResult;
        const current = repeat % 2 ? firstResult : secondResult;
        results.push({ projectiles: count, repeat, baseline: old, current,
          ratio: current.p95Ms / old.p95Ms });
      }
    }
    const output = 'docs/ai-runs/archer-stage1-cpu/results.json';
    mkdirSync('docs/ai-runs/archer-stage1-cpu', { recursive: true });
    writeFileSync(output, JSON.stringify({ baselineHash: baseline.hash, results }, null, 2) + '\n');
    expect(results).toHaveLength(12);
    expect(results.every(result => Number.isFinite(result.ratio))).toBe(true);
  }, 300000);
});
