import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type * as difficulty from '@/hooks/ai/difficulty';
import type * as controller from '@/hooks/ai/controller';
import type * as world from '@/hooks/ai/world';
import type * as perception from '@/hooks/ai/perception';
import type * as learning from '@/hooks/ai/learning';
import type * as projectile from '@/types/projectile';
import type { useGameEngine } from '@/hooks/useGameEngine';
import { CHARACTERS } from '@/types/game';

export interface FrozenAIAPI {
  CHARACTERS: typeof CHARACTERS;
  decideAI: typeof controller.decideAI;
  prepareAIFrame: typeof world.prepareAIFrame;
  stepDifficulty: typeof difficulty.stepDifficulty;
  createDifficultyRuntime: typeof difficulty.createDifficultyRuntime;
  createDifficultySession: typeof difficulty.createDifficultySession;
  perceiveWorld: typeof perception.perceiveWorld;
  createPerceptionMemory: typeof perception.createPerceptionMemory;
  createOpponentModel: typeof learning.createOpponentModel;
  observeOpponent: typeof learning.observeOpponent;
  resetObservation: typeof learning.resetObservation;
  useGameEngine: typeof useGameEngine;
  createProjectile: typeof projectile.createProjectile;
  createHazardZone: typeof projectile.createHazardZone;
}
function assertFrozenAPI(api: unknown): asserts api is FrozenAIAPI {
  if (!api || typeof api !== 'object') throw new Error('Invalid frozen API');
  for (const name of ['decideAI', 'prepareAIFrame', 'stepDifficulty', 'createDifficultyRuntime',
    'createDifficultySession', 'perceiveWorld', 'createPerceptionMemory', 'createOpponentModel', 'observeOpponent', 'resetObservation', 'useGameEngine', 'createProjectile', 'createHazardZone'] as const) {
    if (typeof Reflect.get(api, name) !== 'function') throw new Error('Missing frozen export: ' + name);
  }
  const characters: unknown = Reflect.get(api, 'CHARACTERS');
  if (!characters || typeof characters !== 'object' || Object.keys(characters).length !== Object.keys(CHARACTERS).length)
    throw new Error('Incompatible frozen character registry');
  for (const id of Object.keys(CHARACTERS)) {
    const character: unknown = Reflect.get(characters, id);
    if (!character || typeof character !== 'object' || Reflect.get(character, 'id') !== id)
      throw new Error('Missing frozen character: ' + id);
  }
}
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function loadFrozenAI(path = 'scripts/fixtures/ai-baseline-8263adf.cjs') {
  const bundle = readFileSync(path);
  const metadata = JSON.parse(readFileSync(path + '.json', 'utf8'));
  const hash = sha256(bundle);
  if (metadata.schemaVersion !== 1 || hash !== metadata.bundleSha256) throw new Error('Frozen AI bundle hash mismatch');
  // This generated interface is also exercised against the live API by baseline tests.
  const api: unknown = createRequire(import.meta.url)(resolve(path));
  assertFrozenAPI(api);
  return { api, hash, metadata };
}

/** Old AI algorithms with the current public character table. Original-engine
 * parity must continue to use loadFrozenAI(), whose module and artifact stay intact.
 * A fresh CommonJS module prevents adapted rules from leaking through require's cache.
 */
export function loadEvaluationBaseline(path = 'scripts/fixtures/ai-baseline-8263adf.cjs', characters = CHARACTERS) {
  const original = loadFrozenAI(path);
  const bundle = readFileSync(path);
  if (sha256(bundle) !== original.hash) throw new Error('Frozen bundle changed while loading');
  const module: { exports: unknown } = { exports: {} };
  const execute = new Function('module', 'exports', 'require', bundle.toString('utf8'));
  execute(module, module.exports, createRequire(import.meta.url));
  const api = module.exports;
  assertFrozenAPI(api);
  const publicRules = structuredClone(characters);
  for (const character of Object.values(publicRules)) {
    Object.freeze(character.skill); Object.freeze(character.ultimate); Object.freeze(character);
  }
  Object.assign(api.CHARACTERS, publicRules);
  Object.freeze(api.CHARACTERS);
  const characterRulesHash = sha256(JSON.stringify(publicRules));
  const hash = sha256(original.hash + '\0character-rules-adapter-v1\0' + characterRulesHash);
  return { api, hash, metadata: original.metadata, bundleHash: original.hash, characterRulesHash, adapterVersion: 1 };
}
