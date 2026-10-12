import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'docs/ai-runs/stage3';
const spec = JSON.parse(readFileSync('src/test/stage3Spec.json', 'utf8'));
const sha = text => createHash('sha256').update(text).digest('hex');
const score = rows => ({ games: rows.length, wins: rows.filter(r => r.score === 1).length,
  draws: rows.filter(r => r.score === .5).length, losses: rows.filter(r => r.score === 0).length,
  points: rows.reduce((sum, r) => sum + r.score, 0), rate: rows.length ? rows.reduce((sum, r) => sum + r.score, 0) / rows.length : null });
function panel(name) {
  const rows = [], runs = [];
  for (const [character, enemy] of spec.matchups) {
    const dir = `${root}/${name}-${character}-${enemy}`;
    if (!existsSync(`${dir}/games.jsonl`)) continue;
    const run = JSON.parse(readFileSync(`${dir}/run.json`, 'utf8')); runs.push(run);
    assert.equal(sha(readFileSync(`${dir}.json`)), run.manifestSha256);
    const values = readFileSync(`${dir}/games.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    for (const row of values) {
      assert.equal(row.character, character); assert.equal(row.enemy, enemy);
      assert.equal(row.seed, name === 'development' ? spec.developmentSeed : spec.holdoutSeed);
      assert.equal(row.status, 'complete'); assert.equal(row.score, row.winner === 'draw' ? .5 : row.winner === row.side ? 1 : 0);
      assert(row.ledgerErrors.every(error => Math.abs(error) <= 1e-7));
      assert.equal(row.id, [row.character, row.enemy, row.map, row.preset, row.seed, row.side, row.version].join('/'));
      assert(spec.maps.includes(row.map) && ['baseline', 'current'].includes(row.version) && [1, 2].includes(row.side));
    }
    if (existsSync(`${dir}/complete.json`)) assert.equal(JSON.parse(readFileSync(`${dir}/complete.json`)).completed, 20);
    rows.push(...values);
  }
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length); assert(rows.length <= 80);
  assert(new Set(runs.map(run => run.baselineSha256)).size <= 1);
  assert(new Set(runs.map(run => run.candidateSha256)).size <= 1);
  const pairs = new Map();
  for (const row of rows) {
    const key = [row.character, row.enemy, row.map, row.seed, row.side].join('/');
    const pair = pairs.get(key) ?? {}; pair[row.version] = row; pairs.set(key, pair);
  }
  const groups = subset => Object.fromEntries(['baseline', 'current'].map(version => [version, score(subset.filter(row => row.version === version))]));
  const byMatchup = Object.fromEntries(spec.matchups.map(([character, enemy]) => [`${character}/${enemy}`, groups(rows.filter(r => r.character === character && r.enemy === enemy))]));
  const byMap = Object.fromEntries(spec.maps.map(map => [map, groups(rows.filter(r => r.map === map))]));
  const tactics = Object.fromEntries(['hunter', 'rocketeer'].map(character => [character, Object.fromEntries(['baseline', 'current'].map(version => {
    const subset = rows.filter(r => r.character === character && r.version === version);
    if (!subset.length) return [version, { games: 0, status: 'unmeasured' }];
    const sum = fn => subset.reduce((total, r) => total + fn(r), 0);
    const uses = sum(r => r.metrics.actions[r.side - 1].attack.uses);
    const aliveMs = sum(r => r.candidateTrace.aliveMs);
    const skillMana = sum(r => r.metrics.actions[r.side - 1].skill.mana), ultimateMana = sum(r => r.metrics.actions[r.side - 1].ultimate.mana);
    return [version, { games: subset.length, attackUses: uses,
      meanPelletHitsPerAttack: character === 'hunter' && uses ? sum(r => r.stage3.attackProjectileHits) / uses : null,
      meanEngagementDistance: aliveMs ? sum(r => r.candidateTrace.engagementDistanceMs) / aliveMs : null,
      readyFacingAwayMs: sum(r => r.candidateTrace.readyFacingAwayMs),
      receivedDuringReload: sum(r => r.candidateTrace.damageDuringAttackCooldown),
      dealt: sum(r => r.metrics.effectiveDamage[r.side - 1]), received: sum(r => r.metrics.receivedDamage[r.side - 1]),
      environmentDamage: sum(r => r.metrics.environmentDamage[r.side - 1]),
      skillUses: sum(r => r.metrics.actions[r.side - 1].skill.uses), ultimateUses: sum(r => r.metrics.actions[r.side - 1].ultimate.uses),
      skillDamagePerMana: skillMana ? sum(r => r.metrics.actions[r.side - 1].skill.damage) / skillMana : null,
      ultimateDamagePerMana: ultimateMana ? sum(r => r.metrics.actions[r.side - 1].ultimate.damage) / ultimateMana : null }];
  }))]));
  return { games: rows.length, complete: rows.length === 80 && pairs.size === 40 && [...pairs.values()].every(p => p.baseline && p.current),
    candidateHash: runs[0]?.candidateSha256, baselineHash: runs[0]?.baselineSha256,
    versions: groups(rows), sides: Object.fromEntries(['baseline', 'current'].map(version => [version, [1, 2].map(side => rows.filter(r => r.version === version && r.side === side).length)])),
    byMatchup, byMap, tactics };
}
const development = panel('development'), holdout = panel('holdout');
assert(development.games + holdout.games <= spec.maxGames);
const cpu = existsSync(`${root}/cpu.json`) ? JSON.parse(readFileSync(`${root}/cpu.json`)) : null;
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
const cpuConditions = cpu ? [...new Set(cpu.rows.map(row => `${row.character}/${row.projectiles}`))].map(key => {
  const rows = cpu.rows.filter(row => `${row.character}/${row.projectiles}` === key);
  const before = Object.fromEntries(['mean', 'p95', 'p99'].map(metric => [metric, median(rows.map(row => row.before[metric]))]));
  const current = Object.fromEntries(['mean', 'p95', 'p99'].map(metric => [metric, median(rows.map(row => row.current[metric]))]));
  return { key, before, current, p95ChangePercent: (current.p95 / before.p95 - 1) * 100 };
}) : [];
const report = { spec, development, holdout,
  status: cpuConditions.some(row => row.p95ChangePercent > 10) ? 'held-cpu-gate-failed' : 'awaiting-review',
  cpuConditions,
  parity: existsSync(`${root}/parity.json`) ? JSON.parse(readFileSync(`${root}/parity.json`)) : null,
  counts: existsSync(`${root}/counts.json`) ? JSON.parse(readFileSync(`${root}/counts.json`)) : null,
  cpu };
writeFileSync('src/test/stage3Results.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ development, holdout }, null, 2));
