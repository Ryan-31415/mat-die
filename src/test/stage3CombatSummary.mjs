// Post-hoc audit only: never runs a game or changes frozen evaluation inputs.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { transformSync } from 'esbuild';
const root = 'docs/ai-runs/stage3-current-rules-combat-001';
const read = p => JSON.parse(readFileSync(p, 'utf8'));
const sha = x => createHash('sha256').update(x).digest('hex');
const freeze = read(root + '/freeze.json'), spec = freeze.spec, budget = read(root + '/budget.json');
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), freeze.head);
for (const [p, hash] of Object.entries(freeze.inputs)) assert.equal(sha(readFileSync(p)), hash, p);
assert(budget.elapsedMs <= 1200000 && budget.attempts <= 2);
const rows = [], runHashes = [];
const executedRunnerHash = freeze.postEvaluationTypeOnlyAmendment?.executedRunnerHash ?? freeze.inputs[root + '/runner.ts'];
if (freeze.postEvaluationTypeOnlyAmendment) {
  const old = readFileSync(root + '/runner-executed.ts.txt', 'utf8'), current = readFileSync(root + '/runner.ts', 'utf8');
  assert.equal(sha(old), executedRunnerHash);
  assert.equal(transformSync(old, { loader: 'ts', format: 'esm' }).code, transformSync(current, { loader: 'ts', format: 'esm' }).code);
}
if (freeze.postEvaluationHarnessAmendment) assert.equal(sha(readFileSync(root + '/evaluation-test-executed.tsx.txt')), freeze.postEvaluationHarnessAmendment.executedHash);
const expected = new Set();
for (const panel of ['development', 'holdout']) for (const [character, enemy] of spec.matchups) {
  const dir = `${root}/${panel}-${character}-${enemy}`;
  const run = read(dir + '/run.json'), completion = read(dir + '/complete.json');
  assert.equal(run.baselineBundleSha256, freeze.baselineHash);
  assert.equal(run.manifestSha256, sha(readFileSync(dir + '.json')));
  assert.equal(completion.completed, 20); assert.equal(completion.expected, 20);
  assert.equal(run.workers, 1); assert.equal(run.shardCount, 1);
  assert.equal(run.executorSha256, executedRunnerHash);
  runHashes.push(run.candidateSha256);
  const values = readFileSync(dir + '/games.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  assert.equal(values.length, 20);
  for (const map of spec.maps) for (const side of [1, 2]) for (const version of ['baseline', 'current'])
    expected.add([panel, character, enemy, map, 'perfect', panel === 'development' ? spec.developmentSeed : spec.holdoutSeed, side, version].join('/'));
  for (const row of values) {
    assert.equal(row.status, 'complete'); assert(row.ledgerErrors.every(x => Math.abs(x) < 1e-7));
    assert.equal(row.score, row.winner === 'draw' ? .5 : row.winner === row.side ? 1 : 0);
    assert.equal(row.id, [row.character, row.enemy, row.map, row.preset, row.seed, row.side, row.version].join('/'));
    let effective = row.seed >>> 0;
    for (const letter of row.character + '/' + row.enemy + '/' + row.map + '/' + row.preset) effective = Math.imul(effective ^ letter.charCodeAt(0), 16777619) >>> 0;
    assert.equal(row.effectiveSeed, effective);
    const i = row.side - 1;
    // Hunter in these two pairings emits only basic pellets and single-use nets;
    // neither participant creates clones. Cumulative hit counters survive expiry.
    if (character === 'hunter') {
      assert.equal(row.metrics.cloneActions[i].attack.uses, 0);
      assert.equal(row.metrics.actions[i].ultimate.hits, 0);
      row.correctedPelletHits = row.metrics.hits[i] - row.metrics.actions[i].skill.hits;
      assert(row.correctedPelletHits >= 0 && row.correctedPelletHits <= row.metrics.actions[i].attack.emitted);
    }
    row.panel = panel; rows.push(row);
  }
}
assert.equal(new Set(runHashes).size, 1);
const actualIds = rows.map(r => r.panel + '/' + r.id);
assert.equal(actualIds.length, 160); assert.equal(new Set(actualIds).size, 160);
assert(actualIds.every(id => expected.has(id))); assert([...expected].every(id => actualIds.includes(id)));
const holdoutPin = read(root + '/holdout-freeze.json');
assert.equal(holdoutPin.candidateHash, freeze.candidateHash); assert.equal(holdoutPin.seed, spec.holdoutSeed);
const sum = (rs, fn) => rs.reduce((s, r) => s + fn(r), 0);
const median = xs => { const s = [...xs].sort((a,b) => a-b); return s.length % 2 ? s[(s.length-1)/2] : (s[s.length/2-1]+s[s.length/2])/2; };
const score = rs => ({ games:rs.length,wins:rs.filter(r=>r.score===1).length,draws:rs.filter(r=>r.score===.5).length,losses:rs.filter(r=>r.score===0).length,
  points:sum(rs,r=>r.score),scoreRate:sum(rs,r=>r.score)/rs.length });
const comparison = rs => { const a=score(rs.filter(r=>r.version==='baseline')),b=score(rs.filter(r=>r.version==='current')); return { baseline:a,candidate:b,changePercentagePoints:100*(b.scoreRate-a.scoreRate) }; };
function tactics(rs) {
  const uses=sum(rs,r=>r.metrics.actions[r.side-1].attack.uses),alive=sum(rs,r=>r.candidateTrace.aliveMs),focusUses=sum(rs,r=>r.stage3Tactics.focusWindowAttackUses),reload=sum(rs,r=>r.stage3Tactics.reloadMs),ready=sum(rs,r=>r.stage3Tactics.readyMs);
  const pelletHits=rs[0].character==='hunter'?sum(rs,r=>r.correctedPelletHits):null;
  const timingSamples=sum(rs,r=>r.candidateTiming.samples);
  return { games:rs.length,attackUses:uses,pelletHits,pelletHitsPerAttack:pelletHits===null?null:pelletHits/uses,
    damagingAttackCasts:sum(rs,r=>r.metrics.actions[r.side-1].attack.hits),dealt:sum(rs,r=>r.metrics.effectiveDamage[r.side-1]),received:sum(rs,r=>r.metrics.receivedDamage[r.side-1]),
    meanEngagementDistance:sum(rs,r=>r.candidateTrace.engagementDistanceMs)/alive,focusWindowAttackUses:focusUses,focusWindowDamagingCasts:sum(rs,r=>r.stage3Tactics.focusWindowAttackHits),
    focusWindowDamagePerAttack:focusUses?sum(rs,r=>r.stage3Tactics.focusWindowAttackDamage)/focusUses:null,focusActiveMs:sum(rs,r=>r.stage3Tactics.focusActiveMs),
    readyMs:ready,readyFacingTowardRatio:sum(rs,r=>r.stage3Tactics.readyFacingTowardMs)/ready,reloadMs:reload,damageDuringReload:sum(rs,r=>r.candidateTrace.damageDuringAttackCooldown),
    damagePerReloadSecond:sum(rs,r=>r.candidateTrace.damageDuringAttackCooldown)/(reload/1000),jungleCombatVinesDestroyedGameTotal:sum(rs,r=>r.map==='jungle'?r.stage3Tactics.combatVinesDestroyedGameTotal:0),
    environmentDamage:sum(rs,r=>r.metrics.environmentDamage[r.side-1]),volcanoEnvironmentDamage:sum(rs,r=>r.map==='volcano'?r.metrics.environmentDamage[r.side-1]:0),
    timingReferenceOnly:{samples:timingSamples,weightedMeanMs:sum(rs,r=>r.candidateTiming.samples*r.candidateTiming.meanMs)/timingSamples,medianGameP95Ms:median(rs.map(r=>r.candidateTiming.p95Ms)),medianGameP99Ms:median(rs.map(r=>r.candidateTiming.p99Ms))} };
}
const panels = Object.fromEntries(['development','holdout'].map(panel=>{const rs=rows.filter(r=>r.panel===panel);return [panel,{
  overall:comparison(rs),byCharacter:Object.fromEntries(['hunter','rocketeer'].map(c=>[c,comparison(rs.filter(r=>r.character===c))])),
  byMatchup:Object.fromEntries(spec.matchups.map(([c,e])=>[c+'/'+e,comparison(rs.filter(r=>r.character===c&&r.enemy===e))])),
  byMap:Object.fromEntries(spec.maps.map(m=>[m,comparison(rs.filter(r=>r.map===m))])),
  measuredMatchupMapCells:Object.fromEntries(spec.matchups.map(([c,e])=>[c+'/'+e,Object.fromEntries(spec.maps.map(m=>[m,comparison(rs.filter(r=>r.character===c&&r.enemy===e&&r.map===m))]))])),
  tactics:Object.fromEntries(['hunter','rocketeer'].map(c=>[c,Object.fromEntries(['baseline','current'].map(v=>[v,tactics(rs.filter(r=>r.character===c&&r.version===v))]))])),
  sides:Object.fromEntries(['baseline','current'].map(v=>[v,[1,2].map(s=>rs.filter(r=>r.version===v&&r.side===s).length)]))}];}));
const supervisor=read(root+'/supervisor.json');assert.equal(supervisor.status,'complete');assert.equal(supervisor.events.length,0);assert(supervisor.sleepGuardReleased);
const result={classification:'B',conclusion:'No combat improvement signal; holdout score decreased and Hunter mirror/regression metrics worsened',
  head:freeze.head,baselineHash:freeze.baselineHash,candidateHash:freeze.candidateHash,spec,completed:rows.length,missing:0,duplicates:0,pairedConditions:80,
  effectiveSeedsPassed:true,scoreWinnerSidePassed:true,ledgerPassed:true,sourceIntegrityPassed:true,rulesEqual:true,workers:1,
  workerAttempts:budget.attempts,workerElapsedSeconds:budget.elapsedMs/1000,completedGameWallSeconds:sum(rows,r=>r.wallSeconds),panels,
  cpuStatus:'unconfirmed; these timings must not be used to pass the CPU gate',environment:{acMaintained:supervisor.samples.every(s=>s.ac===1),sleepEvents:supervisor.events,
    systemBusyIncludingWorkerMin:Math.min(...supervisor.samples.map(s=>s.systemBusyIncludingWorkerPercent)),systemBusyIncludingWorkerMax:Math.max(...supervisor.samples.map(s=>s.systemBusyIncludingWorkerPercent))},
  metricLimitations:{invalidRawField:'stage3.attackProjectileHits counts terminal transient hitIds, not match-total hits. Not used in final results.',
    correctedHunterPellets:'Cumulative direct hits minus successful net casts, valid for Hunter/Hunter and Hunter/Gladiator without clones or other Hunter damaging sources.',
    focus:'Focus-active frame window attribution; damaging cast count is not pellet count; samples are small.',vines:'Whole-game combat-destroyed vines; attacker attribution unavailable.',
    rocketOpportunity:'Cooldown readiness and facing are geometric exposure proxies, not guaranteed hittable-shot opportunities.'},
  postprocessorSha256:sha(readFileSync('src/test/stage3CombatSummary.mjs'))};
result.postEvaluationTypeOnlyAmendment = freeze.postEvaluationTypeOnlyAmendment;
result.postEvaluationHarnessAmendment = freeze.postEvaluationHarnessAmendment;
writeFileSync(root+'/combat-audit-final.json',JSON.stringify(result,null,2)+'\n');
const fmt=x=>x===null?'N/A':x.toFixed(2); let md='# 작업 3 현재 규칙 전투 평가\n\n판정 **B: 개선 신호 없음·회귀**. 미사용 패널 점수율 A 25% → B 12.5% (−12.5%p). CPU 성능은 미확정이며 최종 채택 승인이 아니다.\n\n';
md+=`- HEAD: ${freeze.head}\n- A: ${freeze.baselineHash}\n- B: ${freeze.candidateHash}\n- 완료 160/160, 누락·중복 0, 동일 조건 A/B 80쌍, 양 진영 균형, 유효 시드·점수·피해 장부·소스 검사 통과\n- 단일 워커, 누적 ${fmt(result.workerElapsedSeconds)}초. 최초 감독 도구 범위 오류 7.233초 후 완료 0경기에서 허용된 1회 재개; 추가 경기 없음.\n- 개발 시드 ${spec.developmentSeed}; 미사용 시드 ${spec.holdoutSeed}; 동일 상대 A; 후보 동결 유지\n- 실행 중 절전 이벤트 없음, 임시 절전 방지 해제. 시스템 CPU 부하(워커 포함) ${fmt(result.environment.systemBusyIncludingWorkerMin)}–${fmt(result.environment.systemBusyIncludingWorkerMax)}%.\n\n`;
for(const [panel,p]of Object.entries(panels)){
  md+=`## ${panel}\n\n| 매치업 | A 승/무/패 | B 승/무/패 | A 점수율 | B 점수율 | 차이 |\n|---|---|---|---:|---:|---:|\n`;
  for(const [name,x]of Object.entries(p.byMatchup))md+=`| ${name} | ${x.baseline.wins}/${x.baseline.draws}/${x.baseline.losses} | ${x.candidate.wins}/${x.candidate.draws}/${x.candidate.losses} | ${fmt(100*x.baseline.scoreRate)}% | ${fmt(100*x.candidate.scoreRate)}% | ${fmt(x.changePercentagePoints)}%p |\n`;
  md+='\n| 맵 | A 점수율 | B 점수율 | 차이 |\n|---|---:|---:|---:|\n';
  for(const [map,x]of Object.entries(p.byMap))md+=`| ${map} | ${fmt(100*x.baseline.scoreRate)}% | ${fmt(100*x.candidate.scoreRate)}% | ${fmt(x.changePercentagePoints)}%p |\n`;
}
md+='\n## 지표 해석 및 권고\n\n';
md+='| 미사용 패널 지표 | A | B |\n|---|---:|---:|\n';
const h=panels.holdout.tactics.hunter,r=panels.holdout.tactics.rocketeer;
for(const [label,a,b] of [
  ['사냥꾼 산탄 총 명중',h.baseline.pelletHits,h.current.pelletHits],
  ['사냥꾼 발사당 산탄 명중',h.baseline.pelletHitsPerAttack,h.current.pelletHitsPerAttack],
  ['사냥꾼 평균 거리',h.baseline.meanEngagementDistance,h.current.meanEngagementDistance],
  ['사냥꾼 가한 피해',h.baseline.dealt,h.current.dealt],['사냥꾼 받은 피해',h.baseline.received,h.current.received],
  ['집중 활성 구간 발사당 피해',h.baseline.focusWindowDamagePerAttack,h.current.focusWindowDamagePerAttack],
  ['사냥꾼 재장전 1초당 받은 피해',h.baseline.damagePerReloadSecond,h.current.damagePerReloadSecond],
  ['로켓병 기본 공격 피해 발생 횟수',r.baseline.damagingAttackCasts,r.current.damagingAttackCasts],
  ['로켓병 준비 중 적 방향 비율',r.baseline.readyFacingTowardRatio,r.current.readyFacingTowardRatio],
  ['로켓병 가한 피해',r.baseline.dealt,r.current.dealt],['로켓병 받은 피해',r.baseline.received,r.current.received],
  ['로켓병 재장전 1초당 받은 피해',r.baseline.damagePerReloadSecond,r.current.damagePerReloadSecond]])md+=`| ${label} | ${fmt(a)} | ${fmt(b)} |\n`;
md+='\n사냥꾼 발사당 산탄 명중은 소폭 증가했지만 총 명중과 피해는 감소하고 받은 피해가 증가했다. 집중 구간은 A 3회·B 5회 발사라 효율 비교의 표본이 특히 작다. 정글 전투 덩굴 파괴는 사냥꾼 경기 A 6→B 1, 로켓병 경기 A 8→B 6이며 경기 전체 집계라 대상 AI의 성과로 귀속할 수 없다.\n\n';
md+='미사용 사냥꾼 동종전은 50%→10%로 하락했다. 로켓병 동종전도 50%→40%이며, 두 근접 상대 교차전은 A/B 모두 0%다. 후보의 사냥꾼 거리·산탄 효율·재장전 중 피해, 로켓병의 재장전 노출을 우선 검토해야 한다.\n\n';
md+='원자료의 `stage3.attackProjectileHits`는 종료 시 임시 목록이라 전체 명중 수로 사용할 수 없다. 최종 JSON의 사냥꾼 산탄은 누적 직접 명중−성공한 그물 수로 재계산했다. 집중 사격은 활성 프레임 내 피해·공격 기준이며, 덩굴은 경기 전체 전투 파괴 수로 공격자 귀속은 불명이다. 화산 환경 피해는 모두 0이라 개선 근거가 없다. 원시 결과와 실행기는 변경하지 않았다.\n\n';
md+='이번 160경기의 작은 표본은 일반적 우열을 입증하지 않는다. 현재 후보의 일괄 채택은 권고하지 않으며, 전술 묶음을 보류하고 별도 승인 아래 실패한 고정 장면에서 이동·조준·실제 발사와 집중 사격 중 사격 억제를 진단하는 것이 최소 후속 작업이다. 원인 분리 전 추가 최적화·작업 4는 권고하지 않는다. CPU 기준도 별도로 미확정이다.\n';
md+='\n평가 테스트 1개(160경기)와 추가 테스트 파일 lint가 통과했다. 평가용 생성 파일의 비공개 타입 import는 평가 종료 후 hook 반환 타입으로만 수정했다. 실행 당시 파일과 freeze를 보존했으며 변경 전후 타입 제거 JavaScript가 바이트 단위로 같음을 확인했다. 최종 앱 타입 검사 통과. AI·엔진·가중치·밸런스와 A/B 번들은 변경하지 않았다.\n';
md+='평가 종료 후 opt-in 테스트의 생성 파일 import도 활성 테스트 내부로 옮겨 일반 skip 실행이 무시된 평가 아티팩트에 의존하지 않게 했다. 실행 당시 테스트 파일과 원래 해시를 별도로 보존했다. 이 변경 후 전투 경기는 실행하지 않았다.\n';
writeFileSync(root+'/combat-report.md',md);
console.log(JSON.stringify({classification:result.classification,completed:160,workerSeconds:result.workerElapsedSeconds,
  development:panels.development.overall,holdout:panels.holdout.overall,tactics:panels.holdout.tactics,environment:result.environment},null,2));
