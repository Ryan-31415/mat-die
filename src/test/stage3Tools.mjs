// Bounded stage-three snapshots and fixed-observation CPU/parity checks.
import { buildSync } from 'esbuild';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import assert from 'node:assert/strict';
const root = 'docs/ai-runs/stage3'; mkdirSync(root, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const require = createRequire(import.meta.url);
const entry = ['hooks/ai/controller', 'hooks/ai/world', 'hooks/ai/difficulty', 'hooks/ai/perception',
  'hooks/ai/learning', 'hooks/useGameEngine', 'types/game', 'types/map', 'types/ai', 'types/projectile', 'test/aiCpuScenes']
  .map(path => `export * from './src/${path}';`).join('\n');
const build = () => buildSync({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, format: 'cjs', platform: 'node', external: ['react'], write: false, metafile: true });
const load = code => { const module = { exports: {} }; new Function('module', 'exports', 'require', code)(module, module.exports, require); return module.exports; };
const command = process.argv[2];
const result = build(), code = result.outputFiles[0].text;
if (command === 'freeze') {
  assert(!existsSync(`${root}/baseline.cjs`));
  writeFileSync(`${root}/baseline.cjs`, code);
  writeFileSync(`${root}/baseline.cjs.json`, JSON.stringify({ schemaVersion: 1, bundleSha256: sha(code),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sources: Object.keys(result.metafile.inputs).filter(path => existsSync(path)).map(path => ({ path, sha256: sha(readFileSync(path)) })) }, null, 2));
  console.log('Frozen:', sha(code));
} else {
  const baselineCode = readFileSync(`${root}/baseline.cjs`, 'utf8');
  assert.equal(sha(baselineCode), JSON.parse(readFileSync(`${root}/baseline.cjs.json`)).bundleSha256);
  const before = load(baselineCode), current = load(code);
  if (command === 'check') {
    let count = 0;
    for (const character of Object.keys(current.CHARACTERS).filter(name => !['hunter', 'rocketeer'].includes(name)))
      for (const map of Object.keys(current.MAPS)) for (const preset of current.AI_PRESET_IDS) for (const variant of [0, 1]) {
        const world = current.cpuScene(variant ? 6 : 0, character, map, variant), settings = current.createAISettings(preset);
        let a = before.createDifficultyRuntime(before.createDifficultySession(731)), b = current.createDifficultyRuntime(current.createDifficultySession(731));
        for (const offset of [0, 500, 1000]) {
          const observation = { ...world, now: world.now + offset, deltaTime: offset ? 500 : world.deltaTime };
          a = before.stepDifficulty(observation, settings, a); b = current.stepDifficulty(observation, settings, b);
          assert.deepStrictEqual(b, a, `${character}/${map}/${preset}/${variant}`); count++;
        }
      }
    writeFileSync(`${root}/parity.json`, JSON.stringify({ count, baselineHash: sha(baselineCode), candidateHash: sha(code) }, null, 2));
    console.log('Unchanged-character transitions:', count);
  } else if (command === 'counts') {
    const instrument = source => source.replace(/function (rocketeerShot|hunterScatter|archerShotOutcome|evaluate)\([^\n]*\) \{/g,
      (match, name) => `${match}\nglobalThis.__stage3Counts['${name}']++;`);
    const measured = { before: load(instrument(baselineCode)), current: load(instrument(code)) };
    const rows = [];
    for (const character of ['hunter', 'rocketeer', 'archer']) for (const projectiles of [0, 20, 60, 120]) {
      const world = current.cpuScene(projectiles, character), settings = current.createAISettings('perfect');
      const row = { character, projectiles };
      for (const name of ['before', 'current']) {
        globalThis.__stage3Counts = { rocketeerShot: 0, hunterScatter: 0, archerShotOutcome: 0, evaluate: 0 };
        const api = measured[name], original = name === 'before' ? before : current;
        const state = api.createDifficultyRuntime(api.createDifficultySession(731));
        const value = api.stepDifficulty(world, settings, state);
        row[name] = { ...globalThis.__stage3Counts };
        assert.deepStrictEqual(value, original.stepDifficulty(world, settings, state));
      }
      rows.push(row);
    }
    writeFileSync(`${root}/counts.json`, JSON.stringify({ baselineHash: sha(baselineCode), candidateHash: sha(code), rows }, null, 2));
    console.log(JSON.stringify(rows));
  } else if (command === 'cpu') {
    const budgetPath = `${root}/cpu-budget.json`;
    const budget = existsSync(budgetPath) ? JSON.parse(readFileSync(budgetPath)) : { runs: 0, elapsedMs: 0 };
    assert(budget.runs < 2 && budget.elapsedMs < 300000, 'CPU run budget exhausted');
    budget.runs++; writeFileSync(budgetPath, JSON.stringify(budget));
    const start = performance.now(), rows = [];
    const settings = current.createAISettings('perfect');
    for (const character of ['hunter', 'rocketeer', 'archer']) for (const projectiles of [0, 20, 60, 120]) for (let repeat = 0; repeat < 3; repeat++) {
      const world = current.cpuScene(projectiles, character);
      const apis = { before, current }, runtimes = {}, samples = { before: [], current: [] };
      for (const name of Object.keys(apis)) {
        runtimes[name] = apis[name].createDifficultyRuntime(apis[name].createDifficultySession(731));
        for (let i = 0; i < 80; i++) apis[name].stepDifficulty(world, settings, runtimes[name]);
      }
      for (let block = 0; block < 10; block++) for (const name of (block + repeat) % 2 ? ['before', 'current'] : ['current', 'before']) for (let i = 0; i < 16; i++) {
        assert(performance.now() - start + budget.elapsedMs < 300000, 'CPU budget exceeded');
        const time = performance.now(); apis[name].stepDifficulty(world, settings, runtimes[name]); samples[name].push(performance.now() - time);
      }
      const summary = Object.fromEntries(Object.entries(samples).map(([name, values]) => {
        values.sort((a, b) => a - b); return [name, { mean: values.reduce((a, b) => a + b, 0) / values.length,
          p95: values[Math.floor(values.length * .95)], p99: values[Math.floor(values.length * .99)] }];
      }));
      rows.push({ character, projectiles, repeat, ...summary });
    }
    const report = JSON.stringify({ baselineHash: sha(baselineCode), candidateHash: sha(code), elapsedMs: performance.now() - start,
      node: process.version, cpu: cpus()[0].model, samples: 160, warmup: 80, blockSize: 16, rows }, null, 2);
    writeFileSync(`${root}/cpu-${budget.runs}.json`, report);
    writeFileSync(`${root}/cpu.json`, report);
    budget.elapsedMs += performance.now() - start; writeFileSync(budgetPath, JSON.stringify(budget));
    console.log('CPU run complete');
  } else throw new Error('freeze|check|counts|cpu');
}
