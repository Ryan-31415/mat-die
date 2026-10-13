// Frozen A/C/D evaluation preparation and audit only; no policy or engine edits.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = 'docs/ai-runs/stage3-hunter-acd-combat-001';
const old = 'docs/ai-runs/stage3-hunter-c-combat-001';
const dRoot = 'docs/ai-runs/stage3-hunter-d-001';
const sha = x => createHash('sha256').update(x).digest('hex');
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const save = (p, x) => writeFileSync(p, JSON.stringify(x, null, 2) + '\n');
const versions = {
  A: { path: 'docs/ai-runs/stage3-current-rules-combat-001/baseline.cjs', hash: '59caee38276ec11b2fb883753046edfb6b96b5ec91f1a8465c1bdf2d082873fd' },
  C: { path: 'docs/ai-runs/stage3-hunter-diagnosis-001/candidate-c.cjs', hash: 'ad60454ea6e39505c3a55d559de46724400d75774683b58efe07d66ec8448f1e' },
  D: { path: dRoot + '/candidate-d-final.cjs', hash: 'fb2a72d8dd3c5374e105264314ccd0d3453de4d40e697cf3c107454d03b38c0b' },
};
const spec = { matchups: [['hunter', 'hunter']], maps: ['default', 'wasteland', 'graveyard', 'jungle', 'volcano'],
  developmentSeed: 2556266201, holdoutSeed: 427014717, gamesPerPanel: 30, maxGames: 60, maxWallMs: 600000, roundSeconds: 60 };
function verifyInputs(inputs) { for (const [p, h] of Object.entries(inputs)) assert.equal(sha(readFileSync(p)), h, p); }
if (process.argv[2] === 'prepare') {
  assert(!existsSync(root), 'Inspect existing checkpoints; never overwrite');
  const observation = read(dRoot + '/fixed-observations-final.json');
  verifyInputs(observation.sourceHashes); verifyInputs(observation.diagnosticToolHashes);
  const cSources = read('docs/ai-runs/stage3-hunter-diagnosis-001/diagnosis.json').sourceHashes;
  assert.deepEqual(Object.keys(cSources).filter(p => cSources[p] !== observation.sourceHashes[p]).sort(),
    ['src/hooks/ai/controller.ts', 'src/hooks/ai/navigation.ts']);
  const original = read('docs/ai-runs/stage3-current-rules-20261013-final/manifest.json');
  const common = Object.keys(observation.sourceHashes).filter(p => p.startsWith('src/types/') ||
    ['src/hooks/useGameEngine.ts', 'src/hooks/ai/difficulty.ts', 'src/hooks/ai/perception.ts', 'src/hooks/ai/random.ts', 'src/hooks/ai/diagnostics.ts'].includes(p));
  for (const p of common) assert.equal(original.baselineSources[p], observation.sourceHashes[p], 'Common rule: ' + p);
  const require = createRequire(import.meta.url), apis = {};
  for (const [v, info] of Object.entries(versions)) {
    assert.equal(sha(readFileSync(info.path)), info.hash, v);
    assert.equal(read(info.path + '.json').bundleSha256, info.hash);
    const module = { exports: {} }; new Function('module', 'exports', 'require', readFileSync(info.path, 'utf8'))(module, module.exports, require);
    apis[v] = module.exports;
  }
  for (const k of ['CHARACTERS', 'MAPS', 'AI_PRESETS']) { assert.deepEqual(apis.A[k], apis.C[k]); assert.deepEqual(apis.A[k], apis.D[k]); }
  const oldFreeze = read(old + '/freeze.json');
  assert.equal(sha(readFileSync(old + '/runner.ts')), oldFreeze.inputs[old + '/runner.ts']);
  for (const [p, h] of Object.entries(oldFreeze.inputs)) if (p.startsWith('src/test/ai') || p === 'vitest.config.ts') assert.equal(sha(readFileSync(p)), h, p);
  assert.equal(read(dRoot + '/validation.json').unitTestsPassedUnique, 155);
  // Check old result files exist without changing or rerunning them.
  assert.equal(read(old + '/results.json').completed, 40);
  mkdirSync(root);
  let runner = readFileSync(old + '/runner.ts', 'utf8').replaceAll(old, root);
  runner = runner.replace(`const CURRENT_AI = loadFrozenAI('${root}/candidate.cjs').api;\nconst useGameEngine = CURRENT_AI.useGameEngine;`,
    `const useGameEngine = loadFrozenAI('${versions.D.path}').api.useGameEngine;`);
  assert(!runner.includes('const CURRENT_AI ='));
  runner = runner.replace('export async function runDeterministicEvaluation() {',
    `export async function runDeterministicEvaluation() {\n  const evaluatedBundle = loadFrozenAI(process.env.AI_EVALUATED_BUNDLE);\n  const CURRENT_AI = evaluatedBundle.api;`);
  runner = runner.replace('const signature = { schemaVersion: 1,', 'const signature = { evaluatedBundleSha256: evaluatedBundle.hash, evaluatedVersion: process.env.AI_EVALUATED_VERSION, schemaVersion: 1,');
  runner = runner.replace('appendFileSync(rowsPath, JSON.stringify({ ...condition, effectiveSeed,',
    'appendFileSync(rowsPath, JSON.stringify({ ...condition, evaluatedVersion: process.env.AI_EVALUATED_VERSION, evaluatedBundleSha256: evaluatedBundle.hash, effectiveSeed,');
  const obsolete = /attackProjectileHits: metrics\.hitIds\.filter\(key => key\.startsWith\(side \+ ':'\) &&\s*metrics\.entityActions\[key\.slice\(2\)\] === 'attack' && !metrics\.entityClones\[key\.slice\(2\)\]\)\.length,/;
  assert(obsolete.test(runner));
  runner = runner.replace(obsolete, 'cumulativePelletHits: metrics.hits[side - 1] - metrics.actions[side - 1].skill.hits,');
  runner = runner.replace('readyMs: 0, readyFacingTowardMs: 0,', 'readyMs: 0, readyFacingTowardMs: 0, readyNoAttackMs: 0, focusReadyNoAttackMs: 0, evadingMs: 0, damageWhileEvading: 0,');
  runner = runner.replace('  if ((p.hunterFocusedDuration ?? 0) > ms) {', `  const keys = after.evaluationState?.controllers[side]?.keys;
  if (p.attackCooldownRemaining <= 0 && !p.isFrozen && !p.isStunned && !keys?.shift) {
    trace.readyNoAttackMs += ms;
    if ((p.hunterFocusedDuration ?? 0) > ms) trace.focusReadyNoAttackMs += ms;
  }
  if (p.isEvading) {
    trace.evadingMs += ms;
    trace.damageWhileEvading += after.diagnostics!.receivedDamage[side - 1] - before.diagnostics!.receivedDamage[side - 1];
  }
  if ((p.hunterFocusedDuration ?? 0) > ms) {`);
  writeFileSync(root + '/runner.ts', runner);
  const testPath = 'src/hooks/ai/hunterACD.evaluation.test.tsx';
  assert(!existsSync(testPath));
  writeFileSync(testPath, `import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
describe.skipIf(process.env.RUN_HUNTER_ACD_EVAL !== '1')('frozen Hunter A/C/D panel', () => {
  it('runs only the 60 approved conditions', async () => {
    const root = '${root}';
    const freeze = JSON.parse(readFileSync(root + '/freeze.json', 'utf8'));
    const runner = await import('../../../${root}/runner.ts');
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
`);
  for (const panel of ['development', 'holdout']) for (const v of Object.keys(versions)) save(`${root}/${panel}-${v}.json`, {
    schemaVersion: 1, mode: 'duel', seedNamespace: panel === 'holdout' ? 'final' : 'development', characters: ['hunter'], opponents: ['hunter'],
    maps: spec.maps, presets: ['perfect'], versions: ['current'], seeds: [panel === 'development' ? spec.developmentSeed : spec.holdoutSeed],
    roundSeconds: 60, startTime: 10000, expectedGames: 10,
  });
  let supervisor = readFileSync('src/test/hunterCEvaluationSupervisor.ps1', 'utf8').replaceAll(old, root)
    .replaceAll('RUN_HUNTER_C_EVAL', 'RUN_HUNTER_ACD_EVAL').replaceAll('hunterC.evaluation.test.tsx', 'hunterACD.evaluation.test.tsx').replaceAll('/40', '/60');
  writeFileSync('src/test/hunterACDEvaluationSupervisor.ps1', supervisor);
  const paths = [...Object.keys(observation.sourceHashes), ...readdirSync('src/test').filter(n => /^ai(Baseline|Evaluation).*\.ts$/.test(n)).map(n => 'src/test/' + n),
    ...Object.values(versions).flatMap(v => [v.path, v.path + '.json']), root + '/runner.ts', testPath, 'src/test/hunterACDEvaluation.mjs',
    'src/test/hunterACDEvaluationSupervisor.ps1', 'src/test/stage3CurrentRulesCpu.ps1', 'vitest.config.ts', 'src/test/setup.ts',
    ...['development','holdout'].flatMap(p => Object.keys(versions).map(v => `${root}/${p}-${v}.json`))];
  save(root + '/freeze.json', { createdAt: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    initialWorktree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }), spec, versions, opponent: 'A',
    commonRuleSources: Object.fromEntries(common.map(p => [p, observation.sourceHashes[p]])), sourceChangesCtoD: observation.sourceChanges,
    tools: 'Existing virtual-time runner; only bundle selection and sidecar metrics adapted. Fixed common D engine for all versions.',
    inputs: Object.fromEntries([...new Set(paths)].map(p => [p, sha(readFileSync(p))])) });
  console.log('Prepared 60 conditions, no games executed:', root);
} else if (process.argv[2] === 'audit') {
  const freeze = read(root + '/freeze.json'); verifyInputs(freeze.inputs);
  const rows = [], expected = [], issues = [];
  for (const panel of ['development', 'holdout']) for (const v of Object.keys(versions)) {
    const seed = panel === 'development' ? spec.developmentSeed : spec.holdoutSeed, dir = `${root}/${panel}-${v}`;
    for (const map of spec.maps) for (const side of [1,2]) expected.push([panel,v,map,seed,side].join('/'));
    if (!existsSync(dir + '/games.jsonl')) continue;
    const run = read(dir + '/run.json');
    assert.equal(run.evaluatedBundleSha256, versions[v].hash); assert.equal(run.evaluatedVersion, v);
    assert.equal(run.baselineBundleSha256, versions.A.hash); assert.equal(run.workers, 1);
    assert.equal(run.executorSha256, sha(readFileSync(root + '/runner.ts'))); assert.equal(run.manifestSha256, sha(readFileSync(dir + '.json')));
    for (const line of readFileSync(dir + '/games.jsonl', 'utf8').trim().split('\n').filter(Boolean)) {
      const r = JSON.parse(line), i = r.side - 1;
      if (r.status !== 'complete') { issues.push({ panel, v, id:r.id, reason:'incomplete' }); continue; }
      assert.equal(r.evaluatedVersion, v); assert.equal(r.evaluatedBundleSha256, versions[v].hash);
      assert.equal(r.character, 'hunter'); assert.equal(r.enemy, 'hunter'); assert.equal(r.preset, 'perfect'); assert.equal(r.version, 'current');
      assert.equal(r.seed, seed); assert([1,2].includes(r.side)); assert(spec.maps.includes(r.map));
      assert.equal(r.id, ['hunter','hunter',r.map,'perfect',seed,r.side,'current'].join('/'));
      assert(['draw',1,2].includes(r.winner)); assert.equal(r.score, r.winner === 'draw' ? .5 : r.winner === r.side ? 1 : 0);
      assert(r.ledgerErrors.every(x => Math.abs(x) < 1e-7));
      let effective = seed >>> 0; for (const ch of `hunter/hunter/${r.map}/perfect`) effective = Math.imul(effective ^ ch.charCodeAt(0),16777619) >>> 0;
      assert.equal(r.effectiveSeed, effective);
      assert.equal(r.metrics.cloneActions[i].attack.uses, 0); assert.equal(r.metrics.actions[i].ultimate.hits, 0);
      assert.equal(r.metrics.actions[i].skill.emitted, r.metrics.actions[i].skill.uses);
      assert(r.metrics.actions[i].skill.hits <= r.metrics.actions[i].skill.emitted);
      r.pelletHits = r.metrics.hits[i] - r.metrics.actions[i].skill.hits;
      assert.equal(r.pelletHits, r.stage3.cumulativePelletHits); assert(r.pelletHits >= 0 && r.pelletHits <= r.metrics.actions[i].attack.emitted);
      for (const key of ['effectiveDamage','receivedDamage','healing']) assert(r.metrics[key].every(x => Number.isFinite(x) && x >= 0));
      r.panel = panel; r.label = v; r.conditionId = [panel,v,r.map,seed,r.side].join('/'); rows.push(r);
    }
    if (existsSync(dir + '/complete.json')) assert.equal(read(dir + '/complete.json').completed, 10);
  }
  const ids = rows.map(r => r.conditionId); assert.equal(new Set(ids).size, ids.length); assert(ids.every(id => expected.includes(id))); assert(rows.length <= 60);
  const sum = (rs, f) => rs.reduce((s,r) => s + f(r),0);
  function stats(rs) {
    const n=rs.length, reload=sum(rs,r=>r.stage3Tactics.reloadMs), alive=sum(rs,r=>r.candidateTrace.aliveMs), attacks=sum(rs,r=>r.metrics.actions[r.side-1].attack.uses);
    return { games:n, wins:rs.filter(r=>r.score===1).length, draws:rs.filter(r=>r.score===.5).length, losses:rs.filter(r=>r.score===0).length,
      scoreRate:n?sum(rs,r=>r.score)/n:null, meanDealt:n?sum(rs,r=>r.metrics.effectiveDamage[r.side-1])/n:null, meanReceived:n?sum(rs,r=>r.metrics.receivedDamage[r.side-1])/n:null,
      attackUses:attacks,pelletHits:sum(rs,r=>r.pelletHits),pelletsPerAttack:attacks?sum(rs,r=>r.pelletHits)/attacks:null,
      reloadMs:reload,damageDuringReload:sum(rs,r=>r.candidateTrace.damageDuringAttackCooldown),damagePerReloadSecond:reload?sum(rs,r=>r.candidateTrace.damageDuringAttackCooldown)/(reload/1000):null,
      reloadOwnApproachRatio:reload?sum(rs,r=>r.stage3Tactics.reloadOwnApproachMs)/reload:null,reloadCommandApproachRatio:reload?sum(rs,r=>r.stage3Tactics.reloadApproachCommandMs)/reload:null,
      meanEngagementDistance:alive?sum(rs,r=>r.candidateTrace.engagementDistanceMs)/alive:null,
      focusActiveMs:sum(rs,r=>r.stage3Tactics.focusActiveMs),focusAttackUses:sum(rs,r=>r.stage3Tactics.focusWindowAttackUses),focusDamagingCasts:sum(rs,r=>r.stage3Tactics.focusWindowAttackHits),focusAttackDamage:sum(rs,r=>r.stage3Tactics.focusWindowAttackDamage),
      readyMs:sum(rs,r=>r.stage3Tactics.readyMs),readyNoAttackMs:sum(rs,r=>r.stage3Tactics.readyNoAttackMs),focusReadyNoAttackMs:sum(rs,r=>r.stage3Tactics.focusReadyNoAttackMs),
      evadingMs:sum(rs,r=>r.stage3Tactics.evadingMs),damageWhileEvading:sum(rs,r=>r.stage3Tactics.damageWhileEvading),readyFacingAwayMs:sum(rs,r=>r.candidateTrace.readyFacingAwayMs),
      clockExpirations:rs.filter(r=>r.clockExpired).length,environmentDamage:sum(rs,r=>r.metrics.environmentDamage[r.side-1]),
      gameWallSeconds:sum(rs,r=>r.wallSeconds),referenceGameMeanAiMs:n?sum(rs,r=>r.candidateTiming.meanMs)/n:null };
  }
  function compare(rs) {
    const s=Object.fromEntries(Object.keys(versions).map(v=>[v,stats(rs.filter(r=>r.label===v))]));
    const diff=(a,b)=>s[a].scoreRate===null||s[b].scoreRate===null?null:100*(s[b].scoreRate-s[a].scoreRate);
    return {...s,percentagePointChanges:{CminusA:diff('A','C'),DminusA:diff('A','D'),DminusC:diff('C','D')}};
  }
  const panels=Object.fromEntries(['development','holdout'].map(p=>{const rs=rows.filter(r=>r.panel===p);return[p,{overall:compare(rs),byMap:Object.fromEntries(spec.maps.map(m=>[m,compare(rs.filter(r=>r.map===m))])),bySide:Object.fromEntries([1,2].map(s=>[s,compare(rs.filter(r=>r.side===s))]))}]}));
  const budget=existsSync(root+'/budget.json')?read(root+'/budget.json'):null,supervisor=existsSync(root+'/supervisor.json')?read(root+'/supervisor.json'):null;
  const result={head:freeze.head,versions,spec,completed:rows.length,missing:expected.filter(id=>!ids.includes(id)),duplicates:0,issues,
    complete:rows.length===60&&issues.length===0&&supervisor?.status==='complete'&&budget?.elapsedMs<=600000,
    sourceIntegrityPassed:true,ruleEqualityPassed:true,effectiveSeedsPassed:true,ledgerPassed:true,panels,budget,supervisor,
    cpuStatus:'unconfirmed; no official CPU benchmark; gameplay timing is reference only',
    metricDefinitions:{pellets:'Cumulative diagnostics.hits minus single-net damaging casts. No clones or damaging Hunter ultimate. Never terminal hitIds.',
      focus:'Attacks launched and damage occurring during focus-active frame windows; damage is not attributed to launch-state focus.',
      readyNoAttack:'Cooldown ready, not stunned/frozen, no attack key. Includes blocked/out-of-range/tactical holds; not confirmed lost opportunities.',
      approach:'Own movement toward prior enemy position during cooldown, excluding forced movement; denominator all cooldown time.',
      avoidance:'Observed evasion time/damage proxies; no counterfactual avoided damage estimate.'}};
  save(root+'/results.json',result); save(root+'/audited-games.json',rows);
  console.log(JSON.stringify({complete:result.complete,completed:rows.length,missing:result.missing,budget,development:panels.development.overall,holdout:panels.holdout.overall},null,2));
} else throw new Error('prepare|audit');
