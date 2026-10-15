import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

describe.skipIf(process.env.RUN_STAGE3_CURRENT_COMBAT !== '1')('stage 3 frozen current-rule combat panel', () => {
  it('evaluates at most 160 pinned games against A with no tuning', async () => {
    // Skipped ordinary test runs must not require ignored evaluation artifacts.
    const runnerPath = '../../../docs/ai-runs/stage3-current-rules-combat-001/runner.ts';
    const runner: unknown = await import(/* @vite-ignore */ runnerPath);
    if (!runner || typeof runner !== 'object' || !('runDeterministicEvaluation' in runner) ||
      typeof runner.runDeterministicEvaluation !== 'function') throw new Error('Prepared evaluation runner unavailable');
    const runDeterministicEvaluation = runner.runDeterministicEvaluation;
    const root = 'docs/ai-runs/stage3-current-rules-combat-001';
    const freeze = JSON.parse(readFileSync(root + '/freeze.json', 'utf8'));
    const spec = freeze.spec;
    process.env.AI_BASELINE_BUNDLE = root + '/baseline.cjs';
    process.env.AI_EVAL_STAGE3 = '1';
    process.env.AI_EVAL_SHARD = '0/1'; process.env.AI_EVAL_WORKERS = '1';
    process.env.AI_EVAL_EXECUTOR_SHA = createHash('sha256').update(readFileSync(root + '/runner.ts')).digest('hex');
    for (const panel of ['development', 'holdout']) {
      if (panel === 'holdout') {
        const pin = JSON.stringify({ candidateHash: freeze.candidateHash, baselineHash: freeze.baselineHash, seed: spec.holdoutSeed }, null, 2);
        const path = root + '/holdout-freeze.json';
        if (existsSync(path)) expect(readFileSync(path, 'utf8')).toBe(pin);
        else writeFileSync(path, pin);
      }
      for (const [character, enemy] of spec.matchups) {
        const manifest = { schemaVersion: 1, mode: 'duel', seedNamespace: panel === 'holdout' ? 'final' : 'development',
          characters: [character], opponents: [enemy], maps: spec.maps, presets: ['perfect'], versions: ['baseline', 'current'],
          seeds: [panel === 'development' ? spec.developmentSeed : spec.holdoutSeed], roundSeconds: spec.roundSeconds, startTime: 10000, expectedGames: 20 };
        const name = `${panel}-${character}-${enemy}`;
        const path = `${root}/${name}.json`, text = JSON.stringify(manifest, null, 2);
        if (existsSync(path)) expect(readFileSync(path, 'utf8')).toBe(text); else writeFileSync(path, text);
        process.env.AI_EVAL_MANIFEST = path; process.env.AI_EVAL_OUTPUT = `${root}/${name}`;
        await runDeterministicEvaluation();
      }
    }
  }, 1200000);
});
