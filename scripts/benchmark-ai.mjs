import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';

const require = createRequire(import.meta.url);
const baselinePath = process.argv[2] ?? 'scripts/fixtures/gameAI-baseline.ts';
const baselineSource = readFileSync(baselinePath, 'utf8');
function compile(contents) {
  const { outputFiles } = buildSync({ stdin: { contents, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', outputFiles[0].text)(module, module.exports, require);
  return module.exports;
}
const legacy = compile(baselineSource);
const api = compile(`export { getAIKeys, prepareAIFrame, decideAI } from './src/hooks/gameAI';
  export { CHARACTERS, createInitialPlayer } from './src/types/game';
  export { createProjectile, createHazardZone } from './src/types/projectile';
  export { MAPS } from './src/types/map';
  export { createOpponentModel } from './src/hooks/ai/learning';
  export { createAISettings } from './src/types/ai';
  export { createDifficultyRuntime, createDifficultySession, stepDifficulty } from './src/hooks/ai/difficulty';`);
const now = 1791158400000;
const ai = { ...api.createInitialPlayer(2, api.CHARACTERS.mage), x: 500, y: 440, mana: 60, lastGroundedTime: now };
const target = { ...api.createInitialPlayer(1, api.CHARACTERS.archer), x: 200, y: 440 };
function measure(fn) {
  for (let i = 0; i < 150; i++) fn();
  const samples = [];
  for (let i = 0; i < 600; i++) { const start = performance.now(); fn(); samples.push(performance.now() - start); }
  samples.sort((a, b) => a - b);
  return { meanMs: +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(4),
    p95Ms: +samples[Math.floor(samples.length * 0.95)].toFixed(4), samples: samples.length };
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
    return measure(() => { runtime = api.stepDifficulty(world, settings, runtime); });
  };
  results.push({ projectiles: count, baseline, current, sharedWithThreeClones: sharedWithClones,
    difficulty800ms: difficulty(800), difficulty2000ms: difficulty(2000) });
}
const report = { measuredAt: new Date().toISOString(), node: process.version,
  cpu: cpus()[0]?.model, platform: platform(), arch: arch(),
  baselinePath, baselineSha256: createHash('sha256').update(baselineSource).digest('hex'),
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
mkdirSync('docs', { recursive: true });
writeFileSync(process.env.AI_BENCH_OUTPUT ?? 'docs/ai-performance.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
