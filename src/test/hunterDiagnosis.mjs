// A small fixed-observation diagnostic. No game engine ticks or timing benchmark.
import { build } from 'esbuild';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { relative, sep } from 'node:path';
import assert from 'node:assert/strict';
const frozen = 'docs/ai-runs/stage3-current-rules-20261013-final';
const root = 'docs/ai-runs/stage3-hunter-diagnosis-001';
const sha = x => createHash('sha256').update(x).digest('hex');
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const manifest = read(frozen + '/manifest.json');
assert(!existsSync(root + '/candidate-c.cjs'), 'Preserve frozen candidate C');
for (const [p, h] of Object.entries(manifest.inputs)) if (p !== 'src/hooks/ai/navigation.ts') assert.equal(sha(readFileSync(p)), h, p);
assert.equal(sha(readFileSync(root + '/navigation-before.ts.txt')), manifest.inputs['src/hooks/ai/navigation.ts']);
for (const name of ['baseline', 'candidate']) assert.equal(sha(readFileSync(`${frozen}/${name}.cjs`)), manifest[name + 'Hash']);
const entry = ['hooks/ai/controller', 'hooks/ai/world', 'hooks/ai/difficulty', 'hooks/ai/perception',
  'hooks/ai/learning', 'hooks/ai/directShot', 'hooks/ai/coilClear', 'hooks/ai/hunter', 'hooks/ai/rocketeer',
  'hooks/useGameEngine', 'types/game', 'types/map', 'types/ai', 'types/projectile', 'types/combatPhysics', 'test/aiCpuScenes']
  .map(p => `export * from './src/${p}';`).join('\n');
async function compile(before) {
  const sources = {};
  const result = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true,
    format: 'cjs', platform: 'node', external: ['react'], write: false, plugins: [{ name: 'frozen-comparison', setup(b) {
      b.onLoad({ filter: /[\\/]src[\\/].*\.tsx?$/ }, args => {
        const p = relative(process.cwd(), args.path).split(sep).join('/');
        const contents = readFileSync(before && p === 'src/hooks/ai/navigation.ts' ? root + '/navigation-before.ts.txt' : p, 'utf8');
        sources[p] = sha(contents); return { contents, loader: p.endsWith('.tsx') ? 'tsx' : 'ts' };
      });
    } }] });
  return { code: result.outputFiles[0].text, sources };
}
const old = await compile(true), current = await compile(false);
assert.equal(sha(old.code), manifest.candidateHash, 'Reconstructed pre-edit source must exactly match B');
const changes = Object.keys(current.sources).filter(p => old.sources[p] !== current.sources[p]);
assert.deepEqual(changes, ['src/hooks/ai/navigation.ts']);
const require = createRequire(import.meta.url), module = { exports: {} };
new Function('module', 'exports', 'require', current.code)(module, module.exports, require);
const c = module.exports;
const before = read(root + '/fixed-before.json');
const rows = before.rows.map(r => {
  const world = c.cpuScene(0, 'hunter', 'wasteland');
  world.players[0] = { ...c.createInitialPlayer(1, c.CHARACTERS[r.enemy]), x: 200 + r.distance, y: 440,
    facingRight: false, attackCooldownRemaining: 0, skillCooldownRemaining: 2000, mana: 0 };
  Object.assign(world.players[1], { hunterFocusedDuration: r.focus, attackCooldownRemaining: r.cooldown, skillCooldownRemaining: 2000, mana: 0 });
  let diagnostic;
  const decision = c.decideAI(c.prepareAIFrame(world), world.players[1], undefined, undefined, undefined, d => { diagnostic = d; });
  return { enemy:r.enemy,distance:r.distance,cooldown:r.cooldown,focus:r.focus,A:r.A,B:r.B,
    C:{ keys:decision.keys,risk:decision.risk,strategy:diagnostic.strategy,goal:diagnostic.goal,executed:diagnostic.executed,
      candidates:diagnostic.movementCandidates,work:diagnostic.rangedWork } };
});
const bytes = randomBytes(8), developmentSeed = bytes.readUInt32LE(0), holdoutSeed = bytes.readUInt32LE(4);
assert(![2387916401,1573068927,developmentSeed].includes(holdoutSeed));
assert(![2387916401,1573068927].includes(developmentSeed));
const sourceHashes = Object.fromEntries(Object.keys(manifest.inputs).map(p => [p, sha(readFileSync(p))]));
const output = { head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),baselineAHash:manifest.baselineHash,
  previousBHash:manifest.candidateHash,candidateCHash:sha(current.code),sourceChanges:changes,sourceHashes,
  fixedObservations:16,newCombatGames:0,newCpuBenchmarks:0,rows,
  proposedEvaluation:{requiresUserApproval:true,matchups:[['hunter','hunter']],maps:['default','wasteland','graveyard','jungle','volcano'],
    developmentSeed,holdoutSeed,versions:['A','C'],opponent:'frozen A',preset:'perfect',roundSeconds:60,sides:[1,2],
    gamesPerPanel:20,maxGames:40,maxWorkerMs:600000,candidateFreeze:'Before holdout; never tune from holdout results'} };
writeFileSync(root + '/candidate-c.cjs', current.code);
writeFileSync(root + '/candidate-c.cjs.json', JSON.stringify({schemaVersion:1,bundleSha256:output.candidateCHash,sources:sourceHashes},null,2));
writeFileSync(root + '/diagnosis.json', JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({head:output.head,candidateCHash:output.candidateCHash,changes,seeds:{developmentSeed,holdoutSeed},
  scenes:rows.map(r=>({enemy:r.enemy,distance:r.distance,cooldown:r.cooldown,focus:r.focus,B:r.B.executed,C:r.C.executed,goalB:r.B.goal.x,goalC:r.C.goal.x}))},null,2));
