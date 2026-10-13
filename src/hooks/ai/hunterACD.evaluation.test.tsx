import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
describe.skipIf(process.env.RUN_HUNTER_ACD_EVAL !== '1')('frozen Hunter A/C/D panel', () => {
  it('runs only the 60 approved conditions', async () => {
    const root = 'docs/ai-runs/stage3-hunter-acd-combat-001';
    const freeze = JSON.parse(readFileSync(root + '/freeze.json', 'utf8'));
    const runner = await import('../../../docs/ai-runs/stage3-hunter-acd-combat-001/runner.ts');
    process.env.AI_BASELINE_BUNDLE = freeze.versions.A.path;
    process.env.AI_EVAL_STAGE3 = '1'; process.env.AI_EVAL_SHARD = '0/1'; process.env.AI_EVAL_WORKERS = '1';
    process.env.AI_EVAL_EXECUTOR_SHA = createHash('sha256').update(readFileSync(root + '/runner.ts')).digest('hex');
    for (const panel of ['development', 'holdout']) {
      if (panel === 'holdout') {
        const text = JSON.stringify({ versions: freeze.versions, seed: freeze.spec.holdoutSeed }, null, 2);
        const path = root + '/holdout-freeze.json';
        if (existsSync(path)) expect(readFileSync(path, 'utf8')).toBe(text); else writeFileSync(path, text);
      }
      for (const version of ['A', 'C', 'D']) {
        process.env.AI_EVALUATED_VERSION = version; process.env.AI_EVALUATED_BUNDLE = freeze.versions[version].path;
        process.env.AI_EVAL_MANIFEST = root + '/' + panel + '-' + version + '.json';
        process.env.AI_EVAL_OUTPUT = root + '/' + panel + '-' + version;
        await runner.runDeterministicEvaluation();
      }
    }
  }, 600000);
});
