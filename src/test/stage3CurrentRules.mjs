// Evaluation-only overlays. Never check out or replace application sources.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, watch } from 'node:fs';
import { relative, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import assert from 'node:assert/strict';
const root = 'docs/ai-runs/stage3-current-rules-20261013-final';
const sha = value => createHash('sha256').update(value).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trimEnd();
const normalize = text => text.replace(/\r\n/g, '\n').trimEnd();
const overlays = ['controller', 'combat', 'navigation', 'rocketeer'].map(name => `src/hooks/ai/${name}.ts`);
const entry = ['hooks/ai/controller', 'hooks/ai/world', 'hooks/ai/difficulty', 'hooks/ai/perception',
  'hooks/ai/learning', 'hooks/ai/directShot', 'hooks/ai/coilClear', 'hooks/ai/hunter', 'hooks/ai/rocketeer',
  'hooks/useGameEngine', 'types/game', 'types/map', 'types/ai', 'types/projectile', 'types/combatPhysics', 'test/aiCpuScenes']
  .map(path => `export * from './src/${path}';`).join('\n');
function commonRocketFixes(text) {
  return text.replace('ROCKET_HEIGHT, stepProjectileMotion', 'ROCKET_HEIGHT, ROCKET_EXPLOSION_RADIUS, stepProjectileMotion')
    .replace('explosionRadius: 50', 'explosionRadius: ROCKET_EXPLOSION_RADIUS')
    .replace("return vineTime < coilTime ? 'vine' : 'coil'", "return vineTime <= coilTime ? 'vine' : 'coil'");
}
function candidateRocketFixes(text) {
  return commonRocketFixes(text).replace('const horizon = leadMs', 'const permittedHorizon = leadMs')
    .replace('  for (let time = firstDt;', '  const horizon = leadMs === 0 ? Math.max(firstDt, permittedHorizon) : permittedHorizon;\n  for (let time = firstDt;');
}
async function compile(baseline) {
  const sources = {};
  const result = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, format: 'cjs', platform: 'node', external: ['react'], write: false,
    plugins: [{ name: 'current-rules-only', setup(builder) {
      builder.onLoad({ filter: /[\\/]src[\\/].*\.tsx?$/ }, args => {
        const path = relative(process.cwd(), args.path).split(sep).join('/');
        let contents = readFileSync(path, 'utf8');
        if (baseline && overlays.includes(path)) {
          contents = git('show', `13a8ad4:${path}`);
          if (path.endsWith('/rocketeer.ts')) contents = commonRocketFixes(contents);
        }
        sources[path] = sha(contents);
        return { contents, loader: path.endsWith('.tsx') ? 'tsx' : 'ts' };
      });
    } }] });
  return { code: result.outputFiles[0].text, sources };
}
const require = createRequire(import.meta.url);
function load(path) {
  const code = readFileSync(path, 'utf8'), module = { exports: {} };
  new Function('module', 'exports', 'require', code)(module, module.exports, require);
  return module.exports;
}
const save = (name, value) => writeFileSync(`${root}/${name}.json`, JSON.stringify(value, null, 2) + '\n');
const command = process.argv[2];
if (command === 'prepare') {
  assert(!existsSync(root), 'Do not overwrite any prior comparison');
  assert.equal(git('rev-parse', 'HEAD'), '9ec3a058fb222b158415e00749ca40447851ab2f');
  for (const path of overlays) {
    const original = git('show', `6496c5a:${path}`);
    const expected = path.endsWith('/rocketeer.ts') ? candidateRocketFixes(original) : path.endsWith('/combat.ts')
      ? original.replace("scatter: (origin: Pick<Player, 'x' | 'y' | 'facingRight'>)", "scatter: (origin: Pick<Player, 'x' | 'y' | 'facingRight'> & { leadMs?: number })") : original;
    assert.equal(normalize(readFileSync(path, 'utf8')), normalize(expected), `Unexpected change outside stage three: ${path}`);
  }
  const a = await compile(true), b = await compile(false);
  const union = new Set([...Object.keys(a.sources), ...Object.keys(b.sources)]);
  const differences = [...union].filter(path => a.sources[path] !== b.sources[path]);
  const allowed = [...overlays, 'src/hooks/ai/rangedEnvironment.ts', 'src/hooks/ai/rangedShots.ts'];
  assert(differences.every(path => allowed.includes(path)), `Non-stage-three difference: ${differences}`);
  for (const path of union) if (!allowed.includes(path)) assert.equal(a.sources[path], b.sources[path]);
  mkdirSync(root, { recursive: true });
  writeFileSync(`${root}/baseline.cjs`, a.code); writeFileSync(`${root}/candidate.cjs`, b.code);
  const inputs = Object.fromEntries([...union].map(path => [path, sha(readFileSync(path))]));
  save('manifest', { head: git('rev-parse', 'HEAD'), baselineLogicCommit: git('rev-parse', '13a8ad4'),
    baselineHash: sha(a.code), candidateHash: sha(b.code), baselineSources: a.sources, candidateSources: b.sources,
    differences, allowed, inputs, node: process.version, cpu: cpus()[0].model,
    accuracyFixesSharedByBoth: ['rocket radius metadata uses current constant', 'vine wins equal-time coil contact'],
    currentWorkingDiff: git('diff', '--', 'src/hooks/ai/hunter.ts', 'src/hooks/ai/rocketeer.ts', 'src/hooks/ai/combat.ts', 'src/hooks/ai/rangedShots.ts'),
    createdAt: new Date().toISOString() });
  console.log('Prepared:', differences);
} else {
  const manifest = read(`${root}/manifest.json`);
  const integrity = () => {
    assert.equal(git('rev-parse', 'HEAD'), manifest.head, 'HEAD changed');
    for (const [path, hash] of Object.entries(manifest.inputs)) assert.equal(sha(readFileSync(path)), hash, `Source changed: ${path}`);
    for (const name of ['baseline', 'candidate']) assert.equal(sha(readFileSync(`${root}/${name}.cjs`)), manifest[`${name}Hash`]);
    if (existsSync(`${root}/validation.json`)) for (const [path, hash] of Object.entries(read(`${root}/validation.json`).executors))
      assert.equal(sha(readFileSync(path)), hash, `Executor changed: ${path}`);
  };
  integrity();
  const a = load(`${root}/baseline.cjs`), b = load(`${root}/candidate.cjs`);
  if (command === 'check') {
    for (const key of ['CHARACTERS', 'MAPS', 'AI_PRESETS']) assert.deepStrictEqual(a[key], b[key]);
    const types = ['arrow', 'poison-arrow', 'bullet', 'super-bullet', 'net', 'rocket', 'homing-rocket', 'fireball', 'flask', 'electric-orb', 'bat', 'snowball', 'large-snowball', 'blizzard-stone', 'hacker-missile'];
    for (const type of types) assert.deepStrictEqual(a.projectileProperties(type, 600, 0), b.projectileProperties(type, 600, 0));
    let transitions = 0;
    for (const character of Object.keys(b.CHARACTERS).filter(id => !['hunter', 'rocketeer'].includes(id)))
      for (const map of Object.keys(b.MAPS)) for (const preset of b.AI_PRESET_IDS) for (const variant of [0, 1]) {
        const world = b.cpuScene(variant ? 6 : 0, character, map, variant), original = structuredClone(world);
        const settings = b.createAISettings(preset);
        let old = a.createDifficultyRuntime(a.createDifficultySession(731)), next = b.createDifficultyRuntime(b.createDifficultySession(731));
        for (const offset of [0, 500, 1000]) {
          const observation = { ...world, now: world.now + offset, deltaTime: offset ? 500 : world.deltaTime };
          const priorOld = structuredClone(old), priorNext = structuredClone(next), oldRef = old, nextRef = next;
          old = a.stepDifficulty(observation, settings, old); next = b.stepDifficulty(observation, settings, next);
          assert.deepStrictEqual(next, old, `${character}/${map}/${preset}/${variant}`);
          assert.deepStrictEqual(oldRef, priorOld); assert.deepStrictEqual(nextRef, priorNext); transitions++;
        }
        assert.deepStrictEqual(world, original);
      }
    integrity();
    save('checks', { passed: true, transitions, rulesEqual: true, baselineHash: manifest.baselineHash, candidateHash: manifest.candidateHash });
    console.log('Current-rule equivalence and unchanged-character transitions:', transitions);
  } else if (command === 'cpu') {
    assert(read(`${root}/checks.json`).passed);
    assert(read(`${root}/validation.json`).passed, 'Unit/static validation must finish before CPU measurement');
    assert(!existsSync(`${root}/cpu-attempt.json`), 'Only one CPU attempt');
    assert.equal(process.version, manifest.node); assert.equal(cpus()[0].model, manifest.cpu);
    const startedAt = new Date().toISOString(), started = performance.now(), startedWall = Date.now();
    save('cpu-attempt', { startedAt, allowedRuns: 1, maxMs: 120000 });
    const rows = [], changed = new Set();
    const watcher = watch('src', { recursive: true }, (_event, filename) => {
      const path = 'src/' + String(filename).replaceAll('\\', '/');
      if (Object.hasOwn(manifest.inputs, path)) changed.add(path);
    });
    let lastHeartbeat = performance.now(), status = 'awaiting-supervisor', error;
    const guard = () => {
      const now = performance.now();
      assert(now - started < 118000, 'Worker deadline exceeded');
      assert(now - lastHeartbeat < 1000, 'Execution gap over one second'); lastHeartbeat = now;
      assert(Math.abs((Date.now() - startedWall) - (now - started)) < 1000, 'Clock/suspension discrepancy');
      assert.equal(changed.size, 0, 'Source watcher observed a change');
    };
    const settings = b.createAISettings('perfect');
    try {
      for (const character of ['hunter', 'rocketeer', 'archer']) for (const projectiles of [0, 20, 60, 120]) for (let repeat = 0; repeat < 3; repeat++) {
        guard(); integrity();
        const world = b.cpuScene(projectiles, character), apis = { before: a, current: b }, runtimes = {};
        const values = { before: new Float64Array(160), current: new Float64Array(160) };
        const timestamps = { before: new Float64Array(160), current: new Float64Array(160) };
        const sequence = { before: new Uint32Array(160), current: new Uint32Array(160) }; let serial = 0;
        for (const name of ['before', 'current']) {
          runtimes[name] = apis[name].createDifficultyRuntime(apis[name].createDifficultySession(731));
          for (let i = 0; i < 80; i++) { guard(); apis[name].stepDifficulty(world, settings, runtimes[name]); }
        }
        for (let block = 0; block < 10; block++) for (const name of (block + repeat) % 2 ? ['before', 'current'] : ['current', 'before']) for (let i = 0; i < 16; i++) {
          guard(); const index = block * 16 + i; timestamps[name][index] = Date.now(); sequence[name][index] = serial++;
          const time = performance.now(); apis[name].stepDifficulty(world, settings, runtimes[name]); values[name][index] = performance.now() - time;
        }
        const summary = Object.fromEntries(['before', 'current'].map(name => {
          const sorted = Array.from(values[name]).sort((x, y) => x - y);
          return [name, { mean: sorted.reduce((sum, value) => sum + value, 0) / 160, p95: sorted[152], p99: sorted[158],
            samplesMs: Array.from(values[name]), sampleStartUtcMs: Array.from(timestamps[name]), order: Array.from(sequence[name]) }];
        }));
        rows.push({ character, projectiles, repeat, ...summary });
        await new Promise(resolve => setImmediate(resolve));
      }
      guard(); integrity(); assert.equal(rows.length, 36);
    } catch (cause) { status = 'invalid'; error = String(cause); }
    finally {
      watcher.close();
      save('cpu-raw', { status, error, startedAt, endedAt: new Date().toISOString(), elapsedMs: performance.now() - started,
        baselineHash: manifest.baselineHash, candidateHash: manifest.candidateHash, node: process.version, cpu: cpus()[0].model,
        warmup: 80, samples: 160, repeats: 3, blockSize: 16, sourceChanges: [...changed], rows });
    }
    if (status === 'invalid') process.exitCode = 1;
  } else throw new Error('prepare|check|cpu');
}
