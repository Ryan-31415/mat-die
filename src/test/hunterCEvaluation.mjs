// Frozen A/C evaluation orchestration and post-hoc audit; never edits game logic.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = 'docs/ai-runs/stage3-hunter-c-combat-001';
const prior = 'docs/ai-runs/stage3-current-rules-combat-001';
const diagnosisRoot = 'docs/ai-runs/stage3-hunter-diagnosis-001';
const sha = x => createHash('sha256').update(x).digest('hex');
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const save = (p, x) => writeFileSync(p, JSON.stringify(x, null, 2) + '\n');
const d = read(diagnosisRoot + '/diagnosis.json');
for (const [p,h] of Object.entries(d.sourceHashes)) assert.equal(sha(readFileSync(p)),h,p);
const require = createRequire(import.meta.url);
function load(path, hash) {
  const code = readFileSync(path); assert.equal(sha(code),hash,path);
  const module = { exports:{} }; new Function('module','exports','require',code.toString())(module,module.exports,require); return module.exports;
}
const a = load(prior + '/baseline.cjs', d.baselineAHash), c = load(diagnosisRoot + '/candidate-c.cjs', d.candidateCHash);
for (const key of ['CHARACTERS','MAPS','AI_PRESETS']) assert.deepEqual(a[key],c[key]);
const spec = { matchups:[['hunter','hunter']],maps:['default','wasteland','graveyard','jungle','volcano'],developmentSeed:589941701,holdoutSeed:3909090742,
  gamesPerPanel:20,maxGames:40,maxWallMs:600000,roundSeconds:60 };
if (process.argv[2] === 'prepare') {
  assert(!existsSync(root),'Existing checkpoint must be inspected, never overwritten');
  const before = readFileSync(diagnosisRoot + '/navigation-before.ts.txt','utf8');
  const oldLine = "  if (characterWeight >= .5 && character.id === 'hunter') preferred = Math.max(low ? 240 : 0, hunterSpacing(player));";
  const replacement = "  if (characterWeight >= .5 && character.id === 'hunter') {\n    // The all-pellet envelope is an offensive position. Outside the controller's\n    // near-ready shot window, preserve the existing spacing floor while reloading.\n    const reloadSpacing = player.attackCooldownRemaining > frame.world.deltaTime * 2 ? preferred : 0;\n    preferred = Math.max(low ? 240 : 0, hunterSpacing(player), reloadSpacing);\n  }";
  const normalize=x=>x.replaceAll('\r\n','\n').trimEnd();
  assert.equal(normalize(readFileSync('src/hooks/ai/navigation.ts','utf8')),normalize(before).replace(oldLine,replacement));
  assert(read(diagnosisRoot+'/validation.json').typeCheckPassed);
  mkdirSync(root,{recursive:true});
  copyFileSync(prior+'/baseline.cjs',root+'/baseline.cjs');copyFileSync(diagnosisRoot+'/candidate-c.cjs',root+'/candidate.cjs');
  for(const [name,hash]of[['baseline',d.baselineAHash],['candidate',d.candidateCHash]])save(`${root}/${name}.cjs.json`,{schemaVersion:1,bundleSha256:hash});
  let runner=readFileSync(prior+'/runner.ts','utf8');
  assert.equal(sha(runner),read(prior+'/freeze.json').inputs[prior+'/runner.ts']);
  runner=runner.replaceAll(prior,root)
    .replace('readyMs: 0, readyFacingTowardMs: 0, reloadMs: 0,','readyMs: 0, readyFacingTowardMs: 0, reloadMs: 0, reloadApproachCommandMs: 0, reloadOwnApproachMs: 0,')
    .replace('if (p.attackCooldownRemaining > 0) trace.reloadMs += ms;',`if (p.attackCooldownRemaining > 0) {
    trace.reloadMs += ms;
    const keys = after.evaluationState?.controllers[side]?.keys;
    const toward = Math.sign(opponent.x - p.x);
    const command = keys ? Number(keys.arrowRight) - Number(keys.arrowLeft) : 0;
    const forced = p.isStunned || p.isFrozen || p.rootDuration > 0 || p.isEvading || Math.abs(p.knockbackVelocityX) > 1;
    if (!forced && command === toward && toward !== 0) trace.reloadApproachCommandMs += ms;
    if (!forced && toward * (after.players[side - 1].x - p.x) > .1) trace.reloadOwnApproachMs += ms;
  }`)
    .replace('seconds: (Date.now() - roundStart) / 1000,','clockExpired: state.roundTimeRemaining <= 0,\n            seconds: (Date.now() - roundStart) / 1000,');
  assert(runner.includes('reloadOwnApproachMs += ms'));
  writeFileSync(root+'/runner.ts',runner);
  let test=readFileSync('src/hooks/ai/stage3CurrentRulesCombat.evaluation.test.tsx','utf8');
  test=test.replaceAll(prior,root).replaceAll('RUN_STAGE3_CURRENT_COMBAT','RUN_HUNTER_C_EVAL').replaceAll('160','40').replaceAll('1200000','600000');
  writeFileSync('src/hooks/ai/hunterC.evaluation.test.tsx',test);
  let supervisor=readFileSync('src/test/stage3CombatSupervisor.ps1','utf8');
  supervisor=supervisor.replaceAll(prior,root).replaceAll('RUN_STAGE3_CURRENT_COMBAT','RUN_HUNTER_C_EVAL')
    .replaceAll('src/hooks/ai/stage3CurrentRulesCombat.evaluation.test.tsx','src/hooks/ai/hunterC.evaluation.test.tsx')
    .replaceAll('1200000','600000').replaceAll('/160','/40').replaceAll('20 minute','10 minute');
  writeFileSync('src/test/hunterCEvaluationSupervisor.ps1',supervisor);
  const paths=[...Object.keys(d.sourceHashes),...readdirSync('src/test').filter(n=>/^ai(Baseline|Evaluation).*\.ts$/.test(n)).map(n=>'src/test/'+n),
    'src/test/hunterCEvaluation.mjs','src/test/hunterCEvaluationSupervisor.ps1','src/hooks/ai/hunterC.evaluation.test.tsx',
    root+'/runner.ts',root+'/baseline.cjs',root+'/candidate.cjs','vitest.config.ts'];
  save(root+'/freeze.json',{createdAt:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),spec,
    baselineHash:d.baselineAHash,candidateHash:d.candidateCHash,previousBHash:d.previousBHash,opponent:'A for both A and C',
    candidateChange:'Hunter reload spacing floor only; no game rule or difficulty changes',inputs:Object.fromEntries([...new Set(paths)].map(p=>[p,sha(readFileSync(p))]))});
  console.log('Prepared frozen A/C, 40 games, single worker, 600000ms cap:',root);
} else if(process.argv[2]==='audit') {
  const freeze=read(root+'/freeze.json');for(const[p,h]of Object.entries(freeze.inputs))assert.equal(sha(readFileSync(p)),h,p);
  const rows=[],expected=[];const signatures=[];
  for(const panel of['development','holdout']){
    const dir=`${root}/${panel}-hunter-hunter`,seed=panel==='development'?spec.developmentSeed:spec.holdoutSeed;
    for(const map of spec.maps)for(const side of[1,2])for(const version of['baseline','current'])expected.push(['hunter','hunter',map,'perfect',seed,side,version].join('/'));
    if(!existsSync(dir+'/games.jsonl'))continue;
    const run=read(dir+'/run.json');assert.equal(run.baselineBundleSha256,d.baselineAHash);assert.equal(run.executorSha256,sha(readFileSync(root+'/runner.ts')));
    assert.equal(run.manifestSha256,sha(readFileSync(dir+'.json')));assert.equal(run.workers,1);signatures.push(run.candidateSha256);
    for(const line of readFileSync(dir+'/games.jsonl','utf8').trim().split('\n').filter(Boolean)){
      const r=JSON.parse(line);assert.equal(r.status,'complete');assert(r.ledgerErrors.every(x=>Math.abs(x)<1e-7));
      assert.equal(r.seed,seed);assert.equal(r.score,r.winner==='draw'?.5:r.winner===r.side?1:0);
      assert.equal(r.id,[r.character,r.enemy,r.map,r.preset,r.seed,r.side,r.version].join('/'));
      let effective=r.seed>>>0;for(const ch of`${r.character}/${r.enemy}/${r.map}/${r.preset}`)effective=Math.imul(effective^ch.charCodeAt(0),16777619)>>>0;assert.equal(r.effectiveSeed,effective);
      const i=r.side-1;assert.equal(r.metrics.cloneActions[i].attack.uses,0);assert.equal(r.metrics.actions[i].ultimate.hits,0);
      r.pelletHits=r.metrics.hits[i]-r.metrics.actions[i].skill.hits;assert(r.pelletHits>=0&&r.pelletHits<=r.metrics.actions[i].attack.emitted);
      r.panel=panel;rows.push(r);
    }
    if(existsSync(dir+'/complete.json'))assert.equal(read(dir+'/complete.json').completed,20);
  }
  const ids=rows.map(r=>r.id);assert.equal(new Set(ids).size,ids.length);assert(ids.every(id=>expected.includes(id)));assert(rows.length<=40);assert(new Set(signatures).size<=1);
  const sum=(rs,f)=>rs.reduce((s,r)=>s+f(r),0),median=xs=>{const x=[...xs].sort((a,b)=>a-b);return x.length%2?x[(x.length-1)/2]:(x[x.length/2-1]+x[x.length/2])/2};
  const stats=rs=>{const reload=sum(rs,r=>r.stage3Tactics.reloadMs),alive=sum(rs,r=>r.candidateTrace.aliveMs),focusUses=sum(rs,r=>r.stage3Tactics.focusWindowAttackUses),attacks=sum(rs,r=>r.metrics.actions[r.side-1].attack.uses);
    return{games:rs.length,wins:rs.filter(r=>r.score===1).length,draws:rs.filter(r=>r.score===.5).length,losses:rs.filter(r=>r.score===0).length,
      points:sum(rs,r=>r.score),scoreRate:rs.length?sum(rs,r=>r.score)/rs.length:null,
      dealt:sum(rs,r=>r.metrics.effectiveDamage[r.side-1]),received:sum(rs,r=>r.metrics.receivedDamage[r.side-1]),reloadMs:reload,
      damageDuringReload:sum(rs,r=>r.candidateTrace.damageDuringAttackCooldown),damagePerReloadSecond:reload?sum(rs,r=>r.candidateTrace.damageDuringAttackCooldown)/(reload/1000):null,
      meanEngagementDistance:alive?sum(rs,r=>r.candidateTrace.engagementDistanceMs)/alive:null,attackUses:attacks,pelletHits:sum(rs,r=>r.pelletHits),pelletsPerAttack:attacks?sum(rs,r=>r.pelletHits)/attacks:null,
      focusActiveMs:sum(rs,r=>r.stage3Tactics.focusActiveMs),focusAttackUses:focusUses,focusDamagingCasts:sum(rs,r=>r.stage3Tactics.focusWindowAttackHits),focusAttackDamage:sum(rs,r=>r.stage3Tactics.focusWindowAttackDamage),
      focusDamagePerAttack:focusUses?sum(rs,r=>r.stage3Tactics.focusWindowAttackDamage)/focusUses:null,
      reloadApproachCommandRatio:reload?sum(rs,r=>r.stage3Tactics.reloadApproachCommandMs)/reload:null,reloadOwnApproachRatio:reload?sum(rs,r=>r.stage3Tactics.reloadOwnApproachMs)/reload:null,
      clockExpirations:rs.filter(r=>r.clockExpired).length,environmentDamage:sum(rs,r=>r.metrics.environmentDamage[r.side-1]),
      timingReference:{medianGameMeanMs:rs.length?median(rs.map(r=>r.candidateTiming.meanMs)):null,medianGameP95Ms:rs.length?median(rs.map(r=>r.candidateTiming.p95Ms)):null}};};
  const compare=rs=>{const A=stats(rs.filter(r=>r.version==='baseline')),C=stats(rs.filter(r=>r.version==='current'));return{A,C,scoreChangePercentagePoints:A.scoreRate===null||C.scoreRate===null?null:100*(C.scoreRate-A.scoreRate)};};
  const panels=Object.fromEntries(['development','holdout'].map(p=>{const rs=rows.filter(r=>r.panel===p);return[p,{overall:compare(rs),byMap:Object.fromEntries(spec.maps.map(m=>[m,compare(rs.filter(r=>r.map===m))])),bySide:Object.fromEntries([1,2].map(s=>[s,compare(rs.filter(r=>r.side===s))]))}]}));
  const supervisor=existsSync(root+'/supervisor.json')?read(root+'/supervisor.json'):null,budget=existsSync(root+'/budget.json')?read(root+'/budget.json'):null;
  const complete=rows.length===40&&supervisor?.status==='complete'&&budget.elapsedMs<=600000;
  const result={head:freeze.head,baselineAHash:d.baselineAHash,candidateCHash:d.candidateCHash,spec,complete,completed:rows.length,missing:expected.filter(id=>!ids.includes(id)),duplicates:0,
    sourceIntegrityPassed:true,effectiveSeedsPassed:true,ledgerPassed:true,pairedConditions:rows.length/2,panels,budget,supervisor,
    cpuStatus:'unconfirmed; no CPU benchmark; combat timing statistics are reference only',
    metricDefinitions:{pellets:'Cumulative Hunter direct projectile hits minus successful single-use net casts; no clones or other Hunter damaging sources. Terminal hitIds field is not used.',
      focus:'Damage and successful cast counts in focus-active frame windows, not attribution to projectile launch state.',reloadApproach:'During cooldown: commanded movement toward observed enemy, and own movement toward its previous position, excluding observed forced movement.',clockExpiration:'Final engine roundTimeRemaining<=0'}};
  save(root+'/results.json',result);console.log(JSON.stringify({complete,completed:rows.length,budget,development:panels.development.overall,holdout:panels.holdout.overall},null,2));
} else throw new Error('prepare|audit');
