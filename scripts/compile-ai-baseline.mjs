import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';

// Compile outside jsdom: its typed arrays differ from Node's TextEncoder arrays.
const source = readFileSync(process.argv[2], 'utf8');
const bundle = buildSync({ stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
process.stdout.write(bundle.outputFiles[0].text);
