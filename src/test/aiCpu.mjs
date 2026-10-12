// node src/test/aiCpu.mjs freeze|profile|check|bench
// All timed runs share a persistent 300-second ledger; bench is allowed twice.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { Session } from 'node:inspector';
import assert from 'node:assert/strict';

const directory = 'docs/ai-runs/cpu-stage2';
mkdirSync(directory, { recursive: true });
const require = createRequire(import.meta.url);
const hash = value => createHash('sha256').update(value).digest('hex');
const entry = ['hooks/ai/controller', 'hooks/ai/world', 'hooks/ai/difficulty',
  'hooks/ai/perception', 'hooks/ai/learning', 'hooks/useGameEngine',
  'types/game', 'types/map', 'types/ai', 'types/projectile', 'test/aiCpuScenes']
  .map(path => `export * from './src/${path}';`).join('\n');
const ledgerPath = `${directory}/budget.json`;
const ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8')) : { elapsedMs: 0, benchmarks: 0, profiles: 0 };
async function bundle(instrument = false) {
  const counts = [
    ['controller.ts', '    const input = { left: action.direction', 'movement'],
    ['archerShot.ts', '  if ((opponent.x - origin.x)', 'shots'],
    ['projectile.ts', '  const minX = target.x - projectile.width;', 'collisions'],
  ];
  const result = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', external: ['react'], write: false,
    metafile: true, plugins: instrument ? [{ name: 'fixed-observation-counters', setup(builder) {
      builder.onLoad({ filter: /(?:controller|archerShot|projectile)\.ts$/ }, args => {
        let contents = readFileSync(args.path, 'utf8');
        const counter = counts.find(([name]) => args.path.endsWith(name));
        assert(counter && contents.includes(counter[1]), 'Counter anchor changed');
        contents = contents.replace(counter[1], `globalThis.__aiCpuCounts.${counter[2]}++;\n${counter[1]}`);
        return { contents, loader: 'ts' };
      });
    } }] : [] });
  return { code: result.outputFiles[0].text, sources: Object.keys(result.metafile.inputs)
    .filter(path => existsSync(path)).map(path => ({ path, sha256: hash(readFileSync(path)) })) };
}
function load(code) {
  const module = { exports: {} };
  new Function('module', 'exports', 'require', code)(module, module.exports, require);
  return module.exports;
}
function save(name, value) { writeFileSync(`${directory}/${name}.json`, JSON.stringify(value, null, 2) + '\n'); }
const command = process.argv[2];
if (command === 'freeze') {
  assert(!existsSync(`${directory}/before.cjs`), 'Never overwrite the frozen baseline');
  const source = await bundle();
  writeFileSync(`${directory}/before.cjs`, source.code);
  writeFileSync(`${directory}/before-counted.cjs`, (await bundle(true)).code);
  save('before', { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    bundleSha256: hash(source.code), sources: source.sources, node: process.version });
  console.log('Frozen current HEAD:', hash(source.code));
} else {
  const beforeCode = readFileSync(`${directory}/before.cjs`, 'utf8');
  const metadata = JSON.parse(readFileSync(`${directory}/before.json`, 'utf8'));
  assert.equal(hash(beforeCode), metadata.bundleSha256);
  const before = load(beforeCode), source = await bundle(), current = load(source.code);
  const settings = current.createAISettings('perfect');
  const initial = api => api.createDifficultyRuntime(api.createDifficultySession(731));
  const run = (api, world) => api.stepDifficulty(world, settings, initial(api));
  if (command === 'check') {
    let transitions = 0;
    for (const character of Object.keys(current.CHARACTERS)) for (const map of Object.keys(current.MAPS))
      for (const preset of current.AI_PRESET_IDS) for (const variant of [0, 1]) {
        const world = current.cpuScene(variant ? 6 : 0, character, map, variant);
        const config = current.createAISettings(preset);
        let old = initial(before), next = initial(current);
        const untouched = structuredClone({ world, old, next });
        for (const offset of [0, 500, 1000]) {
          const observation = { ...world, now: world.now + offset, deltaTime: offset ? 500 : world.deltaTime };
          const prior = structuredClone({ old, next });
          const oldPrior = old, nextPrior = next;
          old = before.stepDifficulty(observation, config, old);
          next = current.stepDifficulty(observation, config, next);
          assert.deepStrictEqual(oldPrior, prior.old, 'Baseline prior memory mutated');
          assert.deepStrictEqual(nextPrior, prior.next, 'Candidate prior memory mutated');
          assert.deepStrictEqual(next, old, `${character}/${map}/${preset}/${variant}/${offset}`);
          transitions++;
        }
        assert.deepStrictEqual(world, untouched.world, 'Observation mutated');
      }
    const countAPIs = [load(readFileSync(`${directory}/before-counted.cjs`, 'utf8')), load((await bundle(true)).code)];
    const counts = [0, 20, 60, 120].map(count => {
      const world = current.cpuScene(count);
      const results = countAPIs.map(api => {
        globalThis.__aiCpuCounts = { movement: 0, shots: 0, collisions: 0 };
        assert.deepStrictEqual(run(api, world), run(before, world));
        return { ...globalThis.__aiCpuCounts };
      });
      assert.deepStrictEqual(results[0], results[1]);
      return { projectiles: count, before: results[0], after: results[1] };
    });
    save('parity', { transitions, counts, beforeHash: hash(beforeCode), afterHash: hash(source.code) });
    console.log(JSON.stringify({ transitions, counts }));
  } else if (command === 'profile' || command === 'bench') {
    assert(ledger.elapsedMs < 300000, 'CPU budget exhausted');
    assert(command === 'bench' ? ledger.benchmarks < 2 : ledger.profiles < 1, 'Run limit reached');
    const started = performance.now();
    const deadline = started + 300000 - ledger.elapsedMs;
    const checkBudget = () => assert(performance.now() < deadline, 'CPU budget exhausted');
    try {
      if (command === 'profile') {
        ledger.profiles++;
        const session = new Session(); session.connect();
        const post = method => new Promise((accept, reject) => session.post(method, (error, result) => error ? reject(error) : accept(result)));
        await post('Profiler.enable'); await post('Profiler.start');
        const world = current.cpuScene(120);
        for (let i = 0; i < 250; i++) { checkBudget(); run(before, world); }
        const { profile } = await post('Profiler.stop'); session.disconnect();
        const nodes = new Map(profile.nodes.map(node => [node.id, node.callFrame.functionName]));
        const samples = {};
        for (const id of profile.samples) samples[nodes.get(id)] = (samples[nodes.get(id)] ?? 0) + 1;
        const top = Object.entries(samples).sort((a, b) => b[1] - a[1]).slice(0, 20);
        save('profile', { top, profile }); console.log(top);
      } else {
        ledger.benchmarks++;
        const previous = require(resolve('docs/ai-runs/archer-stage1-baseline/baseline.cjs'));
        const results = [];
        function summarize(values) {
          values.sort((a, b) => a - b);
          return { meanMs: values.reduce((sum, v) => sum + v, 0) / values.length,
            p95Ms: values[Math.floor(values.length * .95)], p99Ms: values[Math.floor(values.length * .99)] };
        }
        for (const count of [0, 20, 60, 120]) for (let repeat = 0; repeat < 3; repeat++) {
          const world = current.cpuScene(count);
          const apis = { before, current, previous };
          const order = ['before', 'current', 'previous'];
          const rotated = [...order.slice(repeat), ...order.slice(0, repeat)];
          const row = { projectiles: count, repeat, order: rotated };
          const runtimes = Object.fromEntries(order.map(name => [name, initial(apis[name])]));
          const samples = Object.fromEntries(order.map(name => [name, []]));
          for (const name of rotated) for (let i = 0; i < 160; i++) {
            checkBudget(); apis[name].stepDifficulty(world, settings, runtimes[name]);
          }
          for (let block = 0; block < 15; block++) {
            const blockOrder = [...rotated.slice(block % 3), ...rotated.slice(0, block % 3)];
            for (const name of blockOrder) for (let i = 0; i < 16; i++) {
              checkBudget(); const time = performance.now();
              apis[name].stepDifficulty(world, settings, runtimes[name]);
              samples[name].push(performance.now() - time);
            }
          }
          for (const name of rotated) row[name] = summarize(samples[name]);
          results.push(row);
        }
        save(`benchmark-${ledger.benchmarks}`, { beforeHash: hash(beforeCode), afterHash: hash(source.code),
          previousHash: hash(readFileSync('docs/ai-runs/archer-stage1-baseline/baseline.cjs')),
          sources: source.sources, node: process.version, cpu: cpus()[0].model, platform: platform(), os: release(),
          warmup: 160, samples: 240, blockSize: 16, results });
        console.log(JSON.stringify(results));
      }
    } finally {
      ledger.elapsedMs += performance.now() - started;
      save('budget', ledger); console.log('CPU budget:', ledger);
    }
  } else throw new Error('Expected freeze, profile, check, or bench');
}
