import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { buildSync } from 'esbuild';

if (process.argv[2] === '--snapshot') {
  const output = process.argv[3];
  if (!output) throw new Error('Usage: --snapshot <output.cjs>');
  if (existsSync(output) || existsSync(output + '.json')) throw new Error('Refusing to overwrite a frozen snapshot');
  const entry = `export * from './src/hooks/gameAI';
    export * from './src/hooks/ai/difficulty';
    export * from './src/hooks/ai/perception';
    export * from './src/hooks/ai/learning';
    export * from './src/hooks/ai/state';
    export * from './src/types/ai';
    export * from './src/types/game';
    export * from './src/types/map';
    export * from './src/types/projectile';
    export { useGameEngine } from './src/hooks/useGameEngine';`;
  const bundle = buildSync({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', external: ['react'], write: false, metafile: true, logLevel: 'silent' });
  const sha256 = value => createHash('sha256').update(value).digest('hex');
  const sources = Object.keys(bundle.metafile.inputs).filter(path => path.startsWith('src/')).sort()
    .map(path => ({ path: relative(process.cwd(), resolve(path)).replaceAll('\\', '/'), sha256: sha256(readFileSync(path)) }));
  const rules = ['src/types/game.ts', 'src/types/ai.ts', 'src/types/projectile.ts',
    'src/types/combatPhysics.ts', 'src/types/platform.ts', 'src/types/map.ts'];
  writeFileSync(output, bundle.outputFiles[0].text);
  writeFileSync(output + '.json', JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(),
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    worktree: execFileSync('git', ['status', '--porcelain=v1'], { encoding: 'utf8' }).trim(),
    bundleSha256: sha256(bundle.outputFiles[0].text), external: ['react'], node: process.version,
    sources, rules: rules.map(path => ({ path, sha256: sha256(readFileSync(path)) })),
  }, null, 2) + '\n');
  console.log(output);
} else {
// Compile outside jsdom: its typed arrays differ from Node's TextEncoder arrays.
const source = readFileSync(process.argv[2], 'utf8');
const bundle = buildSync({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
process.stdout.write(bundle.outputFiles[0].text);
}
