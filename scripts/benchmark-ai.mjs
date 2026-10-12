import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const baselinePath = process.argv[2] ?? 'scripts/fixtures/ai-baseline-8263adf.cjs';
const baselineSource = readFileSync(baselinePath, 'utf8');
let candidateBundleSha256;
function compile(contents) {
  const { outputFiles } = buildSync({ stdin: { contents, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const module = { exports: {} };
  candidateBundleSha256 = createHash('sha256').update(outputFiles[0].text).digest('hex');
  new Function('module', 'exports', 'require', outputFiles[0].text)(module, module.exports, require);
  return module.exports;
}
const legacy = baselinePath.endsWith('.cjs') ? require(resolve(baselinePath)) : compile(baselineSource);
if (baselinePath.endsWith('.cjs')) {
  const metadata = JSON.parse(readFileSync(baselinePath + '.json', 'utf8'));
  if (metadata.bundleSha256 !== createHash('sha256').update(baselineSource).digest('hex')) throw new Error('Frozen CPU baseline hash mismatch');
}
const api = compile(`export { getAIKeys, prepareAIFrame, decideAI } from './src/hooks/gameAI';
  export { CHARACTERS, createInitialPlayer } from './src/types/game';
  export { createProjectile, createHazardZone } from './src/types/projectile';
  export { MAPS } from './src/types/map';
  export { createOpponentModel } from './src/hooks/ai/learning';
  export { createAISettings } from './src/types/ai';
  export { perceiveWorld, createPerceptionMemory } from './src/hooks/ai/perception';
  export { createDifficultyRuntime, createDifficultySession, stepDifficulty } from './src/hooks/ai/difficulty';`);
const now = 1791158400000;
const benchmarkCharacter = process.env.AI_BENCH_CHARACTER ?? 'mage';
if (!Object.hasOwn(api.CHARACTERS, benchmarkCharacter)) throw new Error('Unknown benchmark character');
const ai = { ...api.createInitialPlayer(2, api.CHARACTERS[benchmarkCharacter]), x: 500, y: 440, mana: 60, lastGroundedTime: now };
const target = { ...api.createInitialPlayer(1, api.CHARACTERS.archer), x: 200, y: 440 };
function measure(fn, setup) {
  for (let i = 0; i < 150; i++) { setup?.(i); fn(i); }
  const samples = [];
  for (let i = 150; i < 750; i++) { setup?.(i); const start = performance.now(); fn(i); samples.push(performance.now() - start); }
  samples.sort((a, b) => a - b);
  return { meanMs: +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(4),
    p50Ms: +samples[Math.floor(samples.length * 0.5)].toFixed(4),
    p95Ms: +samples[Math.floor(samples.length * 0.95)].toFixed(4),
    p99Ms: +samples[Math.floor(samples.length * 0.99)].toFixed(4), samples: samples.length };
}
const results = [];
for (const count of [0, 20, 60, 120]) {
  const projectiles = Array.from({ length: count }, (_, i) => ({
    ...api.createProjectile(i % 3 === 0 ? 'flask' : 'arrow', 1, 80 + (i * 73) % 640, 100 + (i * 37) % 300, i % 2 ? -700 : 700, i % 3 === 0 ? 100 : 0, 10),
    id: 'bench-' + i, createdAt: now,
  }));
  const world = { players: [target, ai], projectiles, hazardZones: [], attackHitboxes: [], platforms: api.MAPS.default.platforms,
    mapId: 'default', now, deltaTime: 1000 / 60, isOvertime: false, roundTimeRemaining: 60,
    sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
  const model = api.createOpponentModel();
  const baseline = measure(() => legacy.getAIKeys(ai, target, projectiles, [], world.platforms, false, now));
  const current = measure(() => api.decideAI(api.prepareAIFrame(world), ai, model));
  const sharedWithClones = measure(() => {
    const frame = api.prepareAIFrame(world);
    api.decideAI(frame, ai, model);
    for (let i = 0; i < 3; i++) api.decideAI(frame, { ...ai, isClone: true, x: 450 + i * 70 }, model);
  });
  const difficulty = horizonMs => {
    const settings = api.createAISettings('perfect');
    for (const forecast of Object.values(settings.parameters.forecasts)) forecast.horizonMs = horizonMs;
    const session = api.createDifficultySession(731);
    let runtime = api.createDifficultyRuntime(session);
    return measure(index => {
      const elapsed = index * 1000 / 60;
      runtime = api.stepDifficulty({ ...world, now: now + elapsed,
        projectiles: projectiles.map(shot => ({ ...shot, createdAt: shot.createdAt + elapsed })) }, settings, runtime);
    });
  };
  results.push({ projectiles: count, baseline, current, sharedWithThreeClones: sharedWithClones,
    difficulty800ms: difficulty(800), difficulty2000ms: difficulty(2000) });
}
const report = { measuredAt: new Date().toISOString(), node: process.version,
  character: benchmarkCharacter,
  cpu: cpus()[0]?.model, platform: platform(), arch: arch(),
  baselinePath, baselineSha256: createHash('sha256').update(baselineSource).digest('hex'),
  candidateBundleSha256,
  benchmarkSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
  stageOrder: process.env.AI_BENCH_ORDER ?? 'current-first',
  description: 'Synthetic CPU benchmark; includes frame preparation. Does not measure browser rendering or total engine ticks.', results };
report.rocketeer = [0, 1, 4, 12].map(count => {
  const rocketAI = { ...ai, character: api.CHARACTERS.rocketeer, napalmDuration: 4000 };
  const rocketTarget = { ...target, character: api.CHARACTERS.rocketeer };
  const projectiles = Array.from({ length: count }, (_, i) => ({
    ...api.createProjectile('homing-rocket', 1, 100 + i * 37, 400, 660, 0, 16),
    id: 'rocket-bench-' + i, createdAt: now, isNapalm: true,
    createsFirePool: true, firePoolDuration: 4000, firePoolDamage: 1.6, burnDamage: 1.2,
  }));
  const world = { players: [rocketTarget, rocketAI], projectiles, hazardZones: [], attackHitboxes: [],
    platforms: api.MAPS.wasteland.platforms, mapId: 'wasteland', now, deltaTime: 1000 / 60,
    isOvertime: false, roundTimeRemaining: 60, sandstormActive: false, sandstormDirection: 'right',
    sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
  const model = api.createOpponentModel();
  return { homingRockets: count, current: measure(() => api.decideAI(api.prepareAIFrame(world), rocketAI, model)) };
});
// Separate API stages on monotonic moving snapshots. Setup costs are outside the
// measured stage; stage values do not sum to the whole pipeline due to cache/GC effects.
report.dynamicStages = [0, 20, 60, 120].map(count => {
  const worlds = Array.from({ length: 750 }, (_, index) => {
    const time = now + index * 1000 / 60;
    return { players: [{ ...target, x: 220 + Math.sin(index / 50) * 80, lastGroundedTime: time },
      { ...ai, x: 500 + Math.sin(index / 70) * 60, lastGroundedTime: time }],
      projectiles: Array.from({ length: count }, (_, i) => ({
        ...api.createProjectile(i % 3 ? 'arrow' : 'flask', 1, 70 + (i * 73 + index * 3) % 650,
          100 + (i * 37 + index) % 300, i % 2 ? -700 : 700, i % 3 ? 0 : 100, 10,
          { now: time - 100, random: () => 0.3 }), id: 'dynamic-' + i,
      })), hazardZones: [], attackHitboxes: [], platforms: api.MAPS.default.platforms,
      mapId: 'default', now: time, deltaTime: 1000 / 60, isOvertime: false, roundTimeRemaining: 60,
      sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0, lightningStrikes: [], soulZones: [], vineShields: [] };
  });
  const stages = implementation => {
    if (!implementation.perceiveWorld || !implementation.stepDifficulty) return null;
    const settings = implementation.createAISettings('perfect');
    let perception = implementation.createPerceptionMemory();
    const observation = measure(index => { perception = implementation.perceiveWorld(worlds[index], settings.parameters,
      perception, index * 1000 / 60, () => 0.5).memory; });
    const forecasts = settings.parameters.forecasts;
    const framePreparation = measure(index => implementation.prepareAIFrame(worlds[index], { forecasts, random: () => 0.5 }));
    const model = implementation.createOpponentModel();
    let frame;
    const decision = measure(index => implementation.decideAI(frame, worlds[index].players[1], model, undefined,
      { parameters: settings.parameters, traits: { aggression: 1, skill: 1, ultimate: 1, defense: 1, spacing: 1, recovery: 1 }, random: () => 0.5 }),
    index => { frame = implementation.prepareAIFrame(worlds[index], { forecasts, random: () => 0.5 }); });
    let runtime = implementation.createDifficultyRuntime(implementation.createDifficultySession(731));
    const wholePipeline = measure(index => { runtime = implementation.stepDifficulty(worlds[index], settings, runtime); });
    return { observation, framePreparation, decision, wholePipeline };
  };
  const order = process.env.AI_BENCH_ORDER ?? 'current-first';
  if (!['current-first', 'baseline-first'].includes(order)) throw new Error('Invalid AI_BENCH_ORDER');
  const measurements = {};
  for (const [name, implementation] of order === 'current-first' ? [['current', api], ['frozen', legacy]] : [['frozen', legacy], ['current', api]]) {
    measurements[name] = stages(implementation);
  }
  return { projectiles: count, ...measurements };
});
mkdirSync('docs', { recursive: true });
writeFileSync(process.env.AI_BENCH_OUTPUT ?? 'docs/ai-performance.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
