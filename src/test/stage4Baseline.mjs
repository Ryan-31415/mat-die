// Freeze source and rules for fixed observations only; never runs matches or timings.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';

const phase = process.argv[2];
if (!['before', 'baseline'].includes(phase)) throw new Error('Use before or baseline');
const directory = 'docs/stage4-a';
const destination = `${directory}/${phase}.cjs`;
if (existsSync(destination) || existsSync(destination + '.json')) throw new Error('Preserve frozen artifacts');
const hash = value => createHash('sha256').update(value).digest('hex');
const sources = {};
function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) { if (path !== 'src/test') collect(path); }
    else if (/\.tsx?$/.test(path) && !/\.(test|spec)\.tsx?$/.test(path)) sources[path] = hash(readFileSync(path));
  }
}
collect('src');
const entry = ['hooks/ai/controller', 'hooks/ai/world', 'hooks/ai/difficulty', 'hooks/ai/perception',
  'hooks/ai/learning', 'hooks/useGameEngine', 'types/game', 'types/map', 'types/ai', 'types/projectile',
  'types/combatPhysics'].map(path => `export * from './src/${path}';`).join('\n');
const result = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', external: ['react'], write: false });
const code = result.outputFiles[0].text;
const metadata = { schemaVersion: 1, phase, head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  node: process.version, createdAt: new Date().toISOString(), bundleSha256: hash(code), sources };
mkdirSync(directory, { recursive: true });
writeFileSync(destination, code);
writeFileSync(destination + '.json', JSON.stringify(metadata, null, 2) + '\n');
console.log(JSON.stringify({ phase, head: metadata.head, bundleSha256: metadata.bundleSha256 }));
