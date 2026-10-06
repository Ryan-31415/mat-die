import { readFileSync, writeFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) throw new Error('Provide evaluation JSON files to combine.');
const characters = ['gladiator', 'archer', 'mage', 'ninja', 'scientist', 'hunter', 'reaper', 'ice-mage', 'hacker'];
const maps = ['default', 'wasteland', 'graveyard', 'jungle', 'volcano'];
const patterns = ['strafe', 'jump', 'rush'], seeds = [731, 1907];
const configurations = ['perfect', 'perfect-800ms'];
const key = row => [row.configuration, row.character, row.map, row.pattern, row.seed].join(':');
const expected = new Set();
for (const configuration of configurations) for (const character of characters) for (const map of maps) for (const pattern of patterns) for (const seed of seeds) expected.add(key({ configuration, character, map, pattern, seed }));
const records = new Map();
for (const file of files) {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  if (report.maxRoundSeconds !== 5 || JSON.stringify(report.seeds) !== JSON.stringify(seeds)) throw new Error('Incompatible evaluation metadata: ' + file);
  for (const row of report.results) {
    const id = key(row);
    if (!expected.has(id) || records.has(id)) throw new Error('Unexpected or duplicate scenario: ' + id);
    if (![1, 2, 'draw'].includes(row.winner) || ['dealt', 'received', 'attempts', 'hits', 'environmentDamage', 'longestStallSeconds', 'meanTickMs', 'p95TickMs'].some(field => !Number.isFinite(row[field]))) throw new Error('Invalid scenario metrics: ' + id);
    records.set(id, row);
  }
}
if (records.size !== expected.size) throw new Error('Incomplete matrix: ' + records.size + '/' + expected.size);
const results = [...records.values()];
function summarize(runs) {
  const sum = field => runs.reduce((total, row) => total + row[field], 0);
  return { games: runs.length, wins: runs.filter(row => row.winner === 2).length,
    dealt: sum('dealt'), received: sum('received'), attempts: sum('attempts'), hits: sum('hits'),
    hitRate: sum('attempts') ? sum('hits') / sum('attempts') : 0,
    stallsOverThreeSeconds: runs.filter(row => row.longestStallSeconds > 3).length,
    meanTickMs: sum('meanTickMs') / runs.length, worstScenarioP95TickMs: Math.max(...runs.map(row => row.p95TickMs)) };
}
const summaries = configurations.map(configuration => ({ configuration, ...summarize(results.filter(row => row.configuration === configuration)),
  characters: characters.map(character => ({ character, ...summarize(results.filter(row => row.configuration === configuration && row.character === character)) })) }));
writeFileSync('docs/ai-difficulty-evaluation.json', JSON.stringify({ measuredAt: new Date().toISOString(), seeds, maxRoundSeconds: 5, sourceFiles: files,
  methodology: '540 unique real-engine scenarios, perfect 2000ms versus 800ms; nine characters, five maps, three scripted opponent patterns and two seeds. Five-second scenarios do not measure long-term learning or ordinary match win rates. Batches may complete separately after runner time limits; all keys and finite metrics are verified. Direct damage excludes damage over time and zones. Timings include React updates, exclude browser rendering and reflect host contention.', summaries, results }, null, 2) + '\n');
const lines = ['# Perfect 800ms / 2000ms evaluation', '', 'Each configuration includes 270 five-second scenarios. Each character includes 30 scenarios per configuration. Damage totals exclude damage over time and zones. Hits/attempts are counts; multi-hit attacks can contribute multiple hits. Stall counts exclude immobilization, attack-range waiting and soul-zone recovery.', '',
  '| Character | 2000ms damage | 800ms damage | 2000ms hits/attempts | 800ms hits/attempts | 2000ms stalls >3s | 800ms stalls >3s |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
for (const character of characters) {
  const a = summaries[0].characters.find(row => row.character === character), b = summaries[1].characters.find(row => row.character === character);
  lines.push(`| ${character} | ${a.dealt} | ${b.dealt} | ${a.hits}/${a.attempts} | ${b.hits}/${b.attempts} | ${a.stallsOverThreeSeconds} | ${b.stallsOverThreeSeconds} |`);
}
lines.push('', 'CPU timings are affected by host contention and separate batch execution; use ai-performance.json for the synthetic workload comparison.', '');
writeFileSync('docs/ai-difficulty-evaluation.md', lines.join('\n'));
console.log(JSON.stringify(summaries.map(({ characters: _characters, ...summary }) => summary), null, 2));
