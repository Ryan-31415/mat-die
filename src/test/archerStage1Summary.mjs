import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const root = 'docs/ai-runs';
const sha256 = value => createHash('sha256').update(value).digest('hex');
const score = rows => ({ games: rows.length, wins: rows.filter(row => row.score === 1).length,
  draws: rows.filter(row => row.score === .5).length,
  points: rows.reduce((sum, row) => sum + row.score, 0),
  rate: rows.reduce((sum, row) => sum + row.score, 0) / rows.length });

function summarize(name, manifestName) {
  const dir = `${root}/archer-stage1-${name}/shard-000-of-1`;
  const manifestText = readFileSync(`src/test/${manifestName}`, 'utf8');
  const manifest = JSON.parse(manifestText);
  const run = JSON.parse(readFileSync(`${dir}/run.json`, 'utf8'));
  const complete = JSON.parse(readFileSync(`${dir}/complete.json`, 'utf8'));
  const rows = readFileSync(`${dir}/games.jsonl`, 'utf8').trim().split('\n').map(JSON.parse);
  const expected = new Set();
  for (const character of manifest.characters) for (const enemy of manifest.opponents)
    for (const map of manifest.maps) for (const preset of manifest.presets)
      for (const seed of manifest.seeds) for (const side of [1, 2]) for (const version of manifest.versions)
        expected.add([character, enemy, map, preset, seed, side, version].join('/'));
  const ids = new Set(rows.map(row => row.id));
  if (expected.size !== 80 || rows.length !== 80 || ids.size !== 80 ||
      complete.completed !== 80 || complete.expected !== 80 ||
      run.manifestSha256 !== sha256(manifestText) ||
      [...expected].some(id => !ids.has(id)) || [...ids].some(id => !expected.has(id)))
    throw new Error(`${name}: duplicate, missing, or mismatched conditions`);
  for (const row of rows) {
    if (row.status !== 'complete' || row.score !== (row.winner === 'draw' ? .5 : row.winner === row.side ? 1 : 0) ||
        row.ledgerErrors.some(error => Math.abs(error) > 1e-7))
      throw new Error(`${name}: invalid score or health ledger for ${row.id}`);
  }
  const pairs = new Map();
  for (const row of rows) {
    const key = [row.character, row.enemy, row.map, row.preset, row.seed, row.side].join('/');
    const pair = pairs.get(key) ?? {};
    pair[row.version] = row;
    pairs.set(key, pair);
  }
  if (pairs.size !== 40 || [...pairs.values()].some(pair => !pair.current || !pair.baseline))
    throw new Error(`${name}: incomplete before/after pair`);
  const versions = Object.fromEntries(manifest.versions.map(version => [version, rows.filter(row => row.version === version)]));
  const group = key => Object.fromEntries([...new Set(rows.map(row => row[key]))].map(value => [value,
    Object.fromEntries(Object.entries(versions).map(([version, subset]) => [version, score(subset.filter(row => row[key] === value))]))]));
  const actions = Object.fromEntries(Object.entries(versions).map(([version, subset]) => [version, subset.reduce((total, row) => {
    const owner = row.side - 1, action = row.metrics.actions[owner];
    total.attackUses += action.attack.uses;
    total.attackHits += action.attack.hits;
    total.skillUses += action.skill.uses;
    total.ultimateUses += action.ultimate.uses;
    total.effectiveDamage += row.metrics.effectiveDamage[owner];
    total.receivedDamage += row.metrics.receivedDamage[owner];
    return total;
  }, { attackUses: 0, attackHits: 0, skillUses: 0, ultimateUses: 0, effectiveDamage: 0, receivedDamage: 0 })]));
  return { panel: name, gameCount: rows.length, uniqueIds: ids.size, beforeAfterPairs: pairs.size,
    sides: Object.fromEntries(Object.entries(versions).map(([version, subset]) => [version, [1, 2].map(side => subset.filter(row => row.side === side).length)])),
    baselineHash: run.baselineSha256, candidateHash: run.candidateSha256,
    scores: Object.fromEntries(Object.entries(versions).map(([version, subset]) => [version, score(subset)])),
    byEnemy: group('enemy'), byMap: group('map'), actions };
}

const development = summarize('development', 'archerStage1Development.json');
const holdout = summarize('holdout', 'archerStage1Holdout.json');
if (development.baselineHash !== holdout.baselineHash || development.candidateHash === holdout.candidateHash)
  throw new Error('Baseline changed or the two candidate versions were not separated');
const cpu = JSON.parse(readFileSync(`${root}/archer-stage1-cpu/results.json`, 'utf8'));
const cpuByProjectile = Object.fromEntries([0, 20, 60, 120].map(count => {
  const ratios = cpu.results.filter(row => row.projectiles === count).map(row => row.ratio).sort((a, b) => a - b);
  if (ratios.length !== 3 || ratios.some(ratio => !Number.isFinite(ratio))) throw new Error(`Invalid CPU series for ${count}`);
  return [count, { p95Ratios: ratios, medianP95Ratio: ratios[1] }];
}));
const report = { development, holdout, cpuByProjectile };
writeFileSync(`${root}/archer-stage1-summary.json`, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify({ development: development.scores, holdout: holdout.scores,
  holdoutByEnemy: holdout.byEnemy, holdoutByMap: holdout.byMap, cpuByProjectile }, null, 2) + '\n');
