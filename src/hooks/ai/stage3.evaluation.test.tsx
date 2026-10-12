import { describe, it, expect } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { runDeterministicEvaluation, candidateFingerprint } from '@/test/aiEvaluationRunner';

describe.skipIf(process.env.RUN_AI_STAGE3 !== '1')('stage-three fixed 160-game ceiling', () => {
  it('runs only the pinned panel and four matchups with the same frozen opponent', async () => {
    const root = 'docs/ai-runs/stage3'; mkdirSync(root, { recursive: true });
    const spec = JSON.parse(readFileSync('src/test/stage3Spec.json', 'utf8'));
    const panel = process.env.AI_STAGE3_PANEL;
    expect(['development', 'holdout']).toContain(panel);
    const budgetPath = root + '/evaluation-budget.json';
    const budget = existsSync(budgetPath) ? JSON.parse(readFileSync(budgetPath, 'utf8')) : {
      deadline: performance.timeOrigin + performance.now() + spec.maxWallMs, panels: [], resumes: 0 };
    if (budget.panels.includes(panel)) {
      expect(budget.resumes).toBe(0); budget.resumes++;
    } else budget.panels.push(panel);
    expect(budget.panels.length).toBeLessThanOrEqual(2);
    writeFileSync(budgetPath, JSON.stringify(budget, null, 2));
    process.env.AI_EVAL_DEADLINE = String(budget.deadline);
    process.env.AI_BASELINE_BUNDLE = root + '/baseline.cjs';
    process.env.AI_EVAL_STAGE3 = '1';
    process.env.AI_EVAL_SHARD = '0/1'; process.env.AI_EVAL_WORKERS = '1';
    if (panel === 'holdout') {
      const path = root + '/holdout-candidate.json';
      const candidate = candidateFingerprint();
      if (existsSync(path)) expect(JSON.parse(readFileSync(path, 'utf8')).candidate).toBe(candidate);
      else writeFileSync(path, JSON.stringify({ candidate }, null, 2));
    }
    for (const [character, enemy] of spec.matchups) {
      const manifest = { schemaVersion: 1, mode: 'duel', seedNamespace: 'development',
        characters: [character], opponents: [enemy], maps: spec.maps, presets: ['perfect'], versions: ['baseline', 'current'],
        seeds: [panel === 'development' ? spec.developmentSeed : spec.holdoutSeed], roundSeconds: spec.roundSeconds,
        startTime: 10000, expectedGames: 20 };
      const name = `${panel}-${character}-${enemy}`;
      const manifestPath = `${root}/${name}.json`, text = JSON.stringify(manifest, null, 2);
      if (existsSync(manifestPath)) expect(readFileSync(manifestPath, 'utf8')).toBe(text);
      else writeFileSync(manifestPath, text);
      process.env.AI_EVAL_MANIFEST = manifestPath; process.env.AI_EVAL_OUTPUT = `${root}/${name}`;
      await runDeterministicEvaluation();
    }
  }, 1200000);
});
