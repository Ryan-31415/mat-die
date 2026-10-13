// Evaluation artifacts only; frozen AI and engine bundles remain untouched.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const pairRoot = 'docs/ai-runs/stage3-current-rules-20261013-final';
const root = 'docs/ai-runs/stage3-current-rules-combat-001';
const sha = x => createHash('sha256').update(x).digest('hex');
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const save = (p, x) => writeFileSync(p, JSON.stringify(x, null, 2) + '\n');
const spec = read('src/test/stage3Spec.json');
const pair = read(pairRoot + '/manifest.json');
function integrity() {
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pair.head);
  for (const [p, h] of Object.entries(pair.inputs)) assert.equal(sha(readFileSync(p)), h, p);
  const validation = read(pairRoot + '/validation.json');
  assert(validation.passed && read(pairRoot + '/checks.json').rulesEqual);
  for (const [p, h] of Object.entries(validation.executors)) assert.equal(sha(readFileSync(p)), h, p);
  for (const name of ['baseline', 'candidate']) assert.equal(sha(readFileSync(`${pairRoot}/${name}.cjs`)), pair[name + 'Hash']);
}
integrity();
if (process.argv[2] === 'prepare') {
  assert(!existsSync(root), 'Preserve existing evaluation output; inspect checkpoint instead');
  for (const dir of [pairRoot, 'docs/ai-runs/stage3']) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      if (item.isDirectory()) assert(!existsSync(`${dir}/${item.name}/games.jsonl`) || !readFileSync(`${dir}/${item.name}/games.jsonl`, 'utf8').trim(), 'Prior combat rows found');
    }
  }
  mkdirSync(root, { recursive: true });
  for (const name of ['baseline', 'candidate']) {
    copyFileSync(`${pairRoot}/${name}.cjs`, `${root}/${name}.cjs`);
    save(`${root}/${name}.cjs.json`, { schemaVersion: 1, bundleSha256: pair[name + 'Hash'], head: pair.head, source: pairRoot });
  }
  let runner = readFileSync('src/test/aiEvaluationRunner.ts', 'utf8');
  runner = runner.replaceAll("from './", "from '@/test/")
    .replace("import { useGameEngine } from '@/hooks/useGameEngine';", '')
    .replace('CURRENT_AI, deterministicEngineRandom', 'deterministicEngineRandom')
    .replace("import { loadEvaluationBaseline }", "import { loadEvaluationBaseline, loadFrozenAI }");
  runner = runner.replace('const noRoundEnd = () => {};', `const CURRENT_AI = loadFrozenAI('${root}/candidate.cjs').api;
const useGameEngine = CURRENT_AI.useGameEngine;
type GameEngineState = ReturnType<typeof useGameEngine>['gameState'];
const noRoundEnd = () => {};
function verifyFrozenInputs() {
  const frozen = JSON.parse(readFileSync('${root}/freeze.json', 'utf8'));
  for (const [path, hash] of Object.entries(frozen.inputs)) {
    if (createHash('sha256').update(readFileSync(path)).digest('hex') !== hash) throw new Error('Evaluation source changed: ' + path);
  }
}
function createStage3Tactics() {
  return { focusActiveMs: 0, focusWindowAttackUses: 0, focusWindowAttackHits: 0, focusWindowAttackDamage: 0,
    readyMs: 0, readyFacingTowardMs: 0, reloadMs: 0, combatVinesDestroyedGameTotal: 0, vinesSeen: new Set<string>() };
}
function recordStage3Tactics(trace: ReturnType<typeof createStage3Tactics>, before: GameEngineState, after: GameEngineState, side: 1 | 2) {
  const p = before.players[side - 1], opponent = before.players[side === 1 ? 1 : 0];
  const ms = (after.evaluationState?.controllers[side]?.activeTime ?? 0) - (before.evaluationState?.controllers[side]?.activeTime ?? 0);
  if (ms <= 0 || p.health <= 0) return;
  if (p.attackCooldownRemaining > 0) trace.reloadMs += ms;
  else if (!p.isFrozen && !p.isStunned) {
    trace.readyMs += ms;
    if (p.facingRight === (opponent.x >= p.x)) trace.readyFacingTowardMs += ms;
  }
  if ((p.hunterFocusedDuration ?? 0) > ms) {
    trace.focusActiveMs += ms;
    const a = before.diagnostics!.actions[side - 1].attack, b = after.diagnostics!.actions[side - 1].attack;
    trace.focusWindowAttackUses += b.uses - a.uses; trace.focusWindowAttackHits += b.hits - a.hits;
    trace.focusWindowAttackDamage += b.damage - a.damage;
  }
  for (const vine of after.vineShields) if (vine.hp <= 0 && !trace.vinesSeen.has(vine.id)) {
    trace.vinesSeen.add(vine.id); trace.combatVinesDestroyedGameTotal++;
  }
}`);
  runner = runner.replace('checkBudget(true);', 'checkBudget(true); verifyFrozenInputs();')
    .replace('const beforeGame = performance.now();', 'const beforeGame = performance.now();\n        const stage3Tactics = createStage3Tactics();')
    .replace('const nextState = game.result.current.gameState;', 'const nextState = game.result.current.gameState;\n            recordStage3Tactics(stage3Tactics, priorState, nextState, side);')
    .replace('candidateTrace: reportEvaluationTrace(candidate.trace),', 'stage3Tactics: { ...stage3Tactics, vinesSeen: undefined },\n            candidateTrace: reportEvaluationTrace(candidate.trace),');
  assert(runner.includes('recordStage3Tactics(stage3Tactics, priorState, nextState, side)'));
  writeFileSync(root + '/runner.ts', runner);
  const paths = [...Object.keys(pair.inputs), ...readdirSync('src/test').filter(x => /^ai(Baseline|Evaluation).*\.ts$/.test(x)).map(x => 'src/test/' + x),
    'src/test/stage3Spec.json', 'src/test/stage3Combat.mjs', 'src/test/stage3CombatSupervisor.ps1',
    'src/hooks/ai/stage3CurrentRulesCombat.evaluation.test.tsx', 'vitest.config.ts', root + '/runner.ts', root + '/baseline.cjs', root + '/candidate.cjs'];
  const inputs = Object.fromEntries([...new Set(paths)].map(p => [p, sha(readFileSync(p))]));
  save(root + '/freeze.json', { createdAt: new Date().toISOString(), head: pair.head, spec, baselineHash: pair.baselineHash, candidateHash: pair.candidateHash,
    sharedSourceCount: 29, stage3OnlyDifferences: pair.differences, opponent: 'baseline A for both versions', inputs,
    metricDefinitions: { focused: 'Actual attack uses/hits/damage during focus-active frames; window attribution, not per-projectile launch attribution',
      readyFacingToward: 'Cooldown ready, not frozen/stunned, facing opponent; geometric proxy, not a guaranteed hittable shot',
      vines: 'Combat-destroyed vines (hp<=0) in whole match; expired vines excluded; attacker attribution unavailable' } });
  console.log('Prepared exact current-rule A/B combat evaluation:', root);
} else if (process.argv[2] === 'audit') {
  const freeze = read(root + '/freeze.json');
  for (const [p, h] of Object.entries(freeze.inputs)) assert.equal(sha(readFileSync(p)), h, p);
  const rows = [], runs = [];
  for (const panel of ['development', 'holdout']) for (const [character, enemy] of spec.matchups) {
    const path = `${root}/${panel}-${character}-${enemy}`;
    if (!existsSync(path + '/games.jsonl')) continue;
    const run = read(path + '/run.json'); runs.push(run);
    assert.equal(run.baselineBundleSha256, pair.baselineHash);
    assert.equal(run.manifestSha256, sha(readFileSync(path + '.json')));
    for (const line of readFileSync(path + '/games.jsonl', 'utf8').trim().split('\n').filter(Boolean)) {
      const r = JSON.parse(line); r.panel = panel;
      assert.equal(r.character, character); assert.equal(r.enemy, enemy);
      assert.equal(r.seed, panel === 'development' ? spec.developmentSeed : spec.holdoutSeed);
      assert.equal(r.status, 'complete'); assert(r.ledgerErrors.every(x => Math.abs(x) < 1e-7));
      assert.equal(r.score, r.winner === 'draw' ? .5 : r.winner === r.side ? 1 : 0);
      rows.push(r);
    }
  }
  const expected = [];
  for (const panel of ['development', 'holdout']) for (const [character, enemy] of spec.matchups) for (const map of spec.maps) for (const side of [1, 2]) for (const version of ['baseline', 'current'])
    expected.push([panel, character, enemy, map, 'perfect', panel === 'development' ? spec.developmentSeed : spec.holdoutSeed, side, version].join('/'));
  const ids = rows.map(r => r.panel + '/' + r.id); assert.equal(new Set(ids).size, ids.length); assert(ids.every(x => expected.includes(x))); assert(rows.length <= 160);
  assert(new Set(runs.map(r => r.candidateSha256)).size <= 1);
  const score = rs => ({ n: rs.length, wins: rs.filter(r => r.score === 1).length, draws: rs.filter(r => r.score === .5).length,
    losses: rs.filter(r => r.score === 0).length, points: rs.reduce((s, r) => s + r.score, 0), rate: rs.length ? rs.reduce((s, r) => s + r.score, 0) / rs.length : null });
  const comparison = rs => Object.fromEntries(['baseline', 'current'].map(v => [v, score(rs.filter(r => r.version === v))]));
  const panels = Object.fromEntries(['development', 'holdout'].map(panel => { const rs = rows.filter(r => r.panel === panel); return [panel, {
    total: comparison(rs), byMatchup: Object.fromEntries(spec.matchups.map(([a,b]) => [a+'/'+b, comparison(rs.filter(r => r.character === a && r.enemy === b))])),
    byMap: Object.fromEntries(spec.maps.map(m => [m, comparison(rs.filter(r => r.map === m))])),
    tactics: Object.fromEntries(['hunter','rocketeer'].map(character => [character, Object.fromEntries(['baseline','current'].map(version => {
      const subset=rs.filter(r=>r.character===character&&r.version===version); const sum=f=>subset.reduce((s,r)=>s+f(r),0); const uses=sum(r=>r.metrics.actions[r.side-1].attack.uses);
      const alive=sum(r=>r.candidateTrace.aliveMs); const reload=sum(r=>r.stage3Tactics.reloadMs); const focusUses=sum(r=>r.stage3Tactics.focusWindowAttackUses);
      return [version,{games:subset.length,attackUses:uses,attackHits:sum(r=>r.stage3.attackProjectileHits),pelletsPerAttack:uses?sum(r=>r.stage3.attackProjectileHits)/uses:null,
        dealt:sum(r=>r.metrics.effectiveDamage[r.side-1]),received:sum(r=>r.metrics.receivedDamage[r.side-1]),environmentDamage:sum(r=>r.metrics.environmentDamage[r.side-1]),
        meanDistance:alive?sum(r=>r.candidateTrace.engagementDistanceMs)/alive:null,focusUses,focusHits:sum(r=>r.stage3Tactics.focusWindowAttackHits),
        focusDamagePerAttack:focusUses?sum(r=>r.stage3Tactics.focusWindowAttackDamage)/focusUses:null,focusActiveMs:sum(r=>r.stage3Tactics.focusActiveMs),
        readyMs:sum(r=>r.stage3Tactics.readyMs),readyFacingTowardMs:sum(r=>r.stage3Tactics.readyFacingTowardMs),reloadMs:reload,
        reloadDamage:sum(r=>r.candidateTrace.damageDuringAttackCooldown),reloadDamagePerSecond:reload?sum(r=>r.candidateTrace.damageDuringAttackCooldown)/(reload/1000):null,
        jungleVinesGameTotal:sum(r=>r.map==='jungle'?r.stage3Tactics.combatVinesDestroyedGameTotal:0),volcanoEnvironmentDamage:sum(r=>r.map==='volcano'?r.metrics.environmentDamage[r.side-1]:0)}];
    }))]))
  }]; }));
  const report = { head:pair.head,baselineHash:pair.baselineHash,candidateHash:pair.candidateHash,complete:rows.length===160,completed:rows.length,missing:expected.filter(x=>!ids.includes(x)),duplicates:0,ledgerPassed:true,panels,cpuStatus:'unconfirmed; game timings are reference only',
    elapsedGameWallSeconds:rows.reduce((s,r)=>s+r.wallSeconds,0),supervisor:existsSync(root+'/supervisor.json')?read(root+'/supervisor.json'):null };
  save(root+'/combat-results.json',report); console.log(JSON.stringify(report,null,2));
} else throw new Error('prepare|audit');
