// Prepare local same-rule regression fixtures only. No matches or CPU timings.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { build } from 'esbuild';

const manifest = JSON.parse(readFileSync('src/test/stage3CancellationManifest.json', 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
for (const [path, hash] of Object.entries(manifest.runtimeSources)) {
  assert.equal(sha(readFileSync(path)), hash, `Source changed; review fixtures before rebuilding: ${path}`);
}
const output = 'docs/stage3-selective-revert';
mkdirSync(output, { recursive: true });
const entry = ['hooks/ai/controller', 'hooks/ai/world', 'hooks/ai/difficulty', 'hooks/ai/perception',
  'hooks/ai/learning', 'hooks/useGameEngine', 'types/game', 'types/map', 'types/ai',
  'types/projectile', 'types/combatPhysics'].map(path => `export * from './src/${path}';`).join('\n');
const policies = ['src/hooks/ai/controller.ts', 'src/hooks/ai/combat.ts', 'src/hooks/ai/navigation.ts'];
for (const [name, commit, paths, expected] of [
  ['before', manifest.remoteMainAtStart, [...policies, 'src/hooks/ai/rangedShots.ts'], manifest.beforeCoreBundleHash],
  ['legacy-current-rules', '13a8ad4773e1e1c00efce97fa2468675031333e0', policies, manifest.legacyPolicyCurrentRulesBundleHash],
]) {
  const path = `${output}/${name}.cjs`;
  if (existsSync(path)) {
    assert.equal(sha(readFileSync(path)), expected, 'Never overwrite a different frozen fixture');
    const metadata = JSON.parse(readFileSync(path + '.json', 'utf8'));
    assert.equal(metadata.bundleSha256, expected);
    continue;
  }
  const sources = new Map(paths.map(path => [path, execFileSync('git', ['show', `${commit}:${path}`], { encoding: 'utf8' })]));
  const result = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, format: 'cjs', platform: 'node', external: ['react'], write: false,
    plugins: [{ name: 'same-current-rules-policy-fixture', setup(builder) {
      builder.onLoad({ filter: /[\\/]src[\\/].*\.ts$/ }, args => {
        const path = relative(process.cwd(), args.path).split(sep).join('/');
        if (sources.has(path)) return { contents: sources.get(path), loader: 'ts' };
      });
    } }],
  });
  const code = result.outputFiles[0].text;
  assert.equal(sha(code), expected, 'Fixture provenance changed; do not silently refreeze');
  assert(!existsSync(path + '.json'), 'Preserve any existing metadata');
  writeFileSync(path, code);
  writeFileSync(path + '.json', JSON.stringify({ schemaVersion: 1, bundleSha256: expected,
    currentRuleHead: manifest.remoteMainAtStart, policyCommit: commit }, null, 2) + '\n');
}
console.log('Same-current-rule regression fixtures verified; no games or benchmarks executed.');
