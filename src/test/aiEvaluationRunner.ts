import { act, cleanup, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { setImmediate } from 'node:timers/promises';
import { cpus } from 'node:os';
import { z } from 'zod';
import { ARENA, PLAYER_SIZE, CHARACTERS, type CharacterType } from '@/types/game';
import { MAPS, type MapId } from '@/types/map';
import { createAISettings, AI_PRESET_IDS } from '@/types/ai';
import { useGameEngine } from '@/hooks/useGameEngine';
import { emptyAIKeys } from '@/hooks/ai/controller';
import { CURRENT_AI, deterministicEngineRandom, evaluationCloneController, evaluationController, evaluationSeed, timingSummary } from './aiEvaluation';
import { loadEvaluationBaseline } from './aiBaseline';
import { EVALUATION_PATTERNS, SCRIPTED_CHARACTERS, scriptedEvaluationController, type EvaluationPattern } from './aiEvaluationScenarios';
import { captureEvaluationSession, evaluationSessionSchema, type EvaluationSessionCheckpoint } from './aiEvaluationSession';
import { recordEvaluationFrame, reportEvaluationTrace } from './aiEvaluationDiagnostics';
import { ALL_MELEE_SCENARIOS, MELEE_SCENARIOS, MELEE_CHARACTERS, meleeEnemy, initializeMeleeScene, meleeOpponentController, probeMeleeOpportunity,
  type MeleeScenario } from './aiEvaluationMelee';

const manifestSchema = z.object({ schemaVersion: z.literal(1), mode: z.enum(['smoke', 'duel', 'paired', 'session', 'melee']),
  seedNamespace: z.enum(['smoke', 'development', 'final']),
  characters: z.array(z.string().refine(value => Object.prototype.hasOwnProperty.call(CHARACTERS, value))).nonempty(),
  maps: z.array(z.string().refine(value => Object.prototype.hasOwnProperty.call(MAPS, value))).nonempty(), presets: z.array(z.enum(AI_PRESET_IDS)).nonempty(),
  seeds: z.array(z.number().int().min(0).max(4294967295)).nonempty(), roundSeconds: z.number().int().min(1).max(120),
  startTime: z.number().int(), expectedGames: z.number().int().positive(),
  patterns: z.array(z.enum(EVALUATION_PATTERNS)).nonempty().optional(),
  scenes: z.array(z.enum(ALL_MELEE_SCENARIOS)).nonempty().optional() }).strict();
export type EvaluationManifest = z.infer<typeof manifestSchema>;
export function readEvaluationManifest(path: string) {
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (manifest.seedNamespace !== 'smoke' && (manifest.presets.length !== 1 || manifest.presets[0] !== 'perfect')) {
    throw new Error('Development/final performance evaluation requires perfect difficulty only; use smoke or targeted tests for difficulty contracts');
  }
  for (const list of [manifest.characters, manifest.maps, manifest.presets, manifest.seeds, manifest.patterns ?? [], manifest.scenes ?? []]) {
    if (new Set<string | number>(list).size !== list.length) throw new Error('Repeated experimental condition');
  }
  if (manifest.mode !== 'paired' && manifest.patterns) throw new Error('Scripted patterns only apply to paired evaluation');
  if (manifest.mode !== 'melee' && manifest.scenes) throw new Error('Melee scenes only apply to melee evaluation');
  if (manifest.mode === 'melee' && manifest.characters.some(character => !MELEE_CHARACTERS.some(value => value === character))) throw new Error('Melee evaluation requires melee characters');
  const expected = evaluationConditions(manifest).length;
  if (manifest.expectedGames !== expected) throw new Error('Manifest game count does not match its conditions');
  return manifest;
}
export interface EvaluationCondition {
  id: string; ordinal: number; character: CharacterType; enemy: CharacterType; map: MapId;
  preset: typeof AI_PRESET_IDS[number]; seed: number; side: 1 | 2;
  pattern?: EvaluationPattern; version?: 'current' | 'baseline';
  round?: 1 | 2 | 3;
  scene?: MeleeScenario;
}
export function evaluationConditions(manifest: EvaluationManifest): EvaluationCondition[] {
  const result: EvaluationCondition[] = [];
  for (const name of manifest.characters) {
    const character = name as CharacterType;
    const pairings = manifest.mode === 'melee'
      ? (manifest.scenes ?? [...MELEE_SCENARIOS]).map(scene => ({ enemy: meleeEnemy(scene), scene, pattern: undefined }))
      : manifest.mode === 'paired'
      ? (manifest.patterns ?? [...EVALUATION_PATTERNS]).map(pattern => ({ enemy: SCRIPTED_CHARACTERS[pattern], pattern, scene: undefined }))
      : (manifest.mode === 'smoke' ? [character] : manifest.characters).map(enemy => ({ enemy: enemy as CharacterType, pattern: undefined, scene: undefined }));
    for (const { enemy, pattern, scene } of pairings) for (const map of manifest.maps as MapId[])
      for (const preset of manifest.presets) for (const seed of manifest.seeds) for (const side of [1, 2] as const)
        for (const version of manifest.mode === 'paired' || manifest.mode === 'melee' ? ['current', 'baseline'] as const : [undefined])
          for (const round of manifest.mode === 'session' ? [1, 2, 3] as const : [undefined]) {
          if (scene === 'lava' && map !== 'volcano') continue;
          const id = [character, enemy, map, preset, seed, side, ...(pattern ? [pattern, version] : []), ...(scene ? [scene, version] : []), ...(round ? [round] : [])].join('/');
          result.push({ id, ordinal: result.length, character, enemy, map, preset, seed, side,
            ...(pattern ? { pattern, version } : {}), ...(scene ? { scene, version } : {}), ...(round ? { round } : {}) });
        }
  }
  return result;
}
const noRoundEnd = () => {};
export function candidateFingerprint() {
  const paths = [...readdirSync('src/hooks/ai').filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts')).map(name => 'src/hooks/ai/' + name),
    ...readdirSync('src/types').filter(name => name.endsWith('.ts') && !name.endsWith('.test.ts')).map(name => 'src/types/' + name),
    'src/hooks/useGameEngine.ts', 'src/hooks/gameAI.ts', 'src/test/aiBaseline.ts', 'src/test/aiEvaluation.ts', 'src/test/aiEvaluationRunner.ts',
    'src/test/aiEvaluationScenarios.ts', 'src/test/aiEvaluationSession.ts', 'src/test/aiEvaluationDiagnostics.ts', 'src/test/aiEvaluationMelee.ts'];
  const hash = createHash('sha256');
  for (const path of paths.sort()) hash.update(path).update('\0').update(readFileSync(path));
  return hash.digest('hex');
}

export async function runDeterministicEvaluation() {
  const manifestPath = process.env.AI_EVAL_MANIFEST ?? 'scripts/fixtures/ai-eval-smoke.json';
  const manifest = readEvaluationManifest(manifestPath);
  if (process.env.AI_EVAL_MODE && process.env.AI_EVAL_MODE !== manifest.mode) throw new Error('Manifest mode does not match requested mode');
  const output = process.env.AI_EVAL_OUTPUT;
  if (!output) throw new Error('AI_EVAL_OUTPUT must name a new or matching checkpoint directory');
  const frozen = loadEvaluationBaseline(process.env.AI_BASELINE_BUNDLE);
  const candidateSha256 = candidateFingerprint();
  const manifestSha256 = createHash('sha256').update(readFileSync(manifestPath)).digest('hex');
  const manifestJson = readFileSync(manifestPath, 'utf8');
  const shard = /^(\d+)\/(\d+)$/.exec(process.env.AI_EVAL_SHARD ?? '0/1');
  if (!shard || +shard[2] < 1 || +shard[1] >= +shard[2]) throw new Error('Invalid AI_EVAL_SHARD');
  const shardIndex = +shard[1], shardCount = +shard[2];
  const signature = { schemaVersion: 1, protocolVersion: 6, traceDefinitionVersion: 2, candidateSha256, baselineSha256: frozen.hash,
    baselineBundleSha256: frozen.bundleHash, baselineCharacterRulesSha256: frozen.characterRulesHash, baselineAdapterVersion: frozen.adapterVersion,
    manifestSha256, shardIndex, shardCount,
    executorSha256: process.env.AI_EVAL_EXECUTOR_SHA ?? 'direct-vitest', workers: Number(process.env.AI_EVAL_WORKERS ?? 1) };
  mkdirSync(output, { recursive: true });
  const metadataPath = output + '/run.json', rowsPath = output + '/games.jsonl';
  if (existsSync(metadataPath)) {
    const old = JSON.parse(readFileSync(metadataPath, 'utf8'));
    for (const [key, value] of Object.entries(signature)) if (old[key] !== value) throw new Error('Checkpoint provenance mismatch: ' + key);
  } else writeFileSync(metadataPath, JSON.stringify({ ...signature, manifest, manifestJson, manifestPath,
    node: process.version, cpu: cpus()[0]?.model, startedAt: new Date().toISOString(),
    methodology: '60Hz real engine with virtual time, dual restricted controllers, identity normalization, stateless independent RNG streams. Timings include React hooks and exclude browser rendering; throughput is separate from virtual seconds.' }, null, 2));
  const completed = new Set<string>();
  const sessions = new Map<string, EvaluationSessionCheckpoint>();
  if (existsSync(rowsPath)) for (const line of readFileSync(rowsPath, 'utf8').trim().split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    if (completed.has(row.id)) throw new Error('Duplicate checkpoint row: ' + row.id);
    if (row.status !== 'complete') throw new Error('Previous incomplete game requires investigation: ' + row.id);
    completed.add(row.id);
    if (manifest.mode === 'session') sessions.set(row.id, evaluationSessionSchema.parse(row.endSession));
  }
  const expectedIds = new Set<string>();
  let index = 0, finished = 0;
  const deadline = Number(process.env.AI_EVAL_DEADLINE ?? Infinity);
  if (!(deadline > 0)) throw new Error('Invalid evaluation deadline');
  const stopRequest = process.env.AI_EVAL_STOP_REQUEST;
  let lastStopCheck = -Infinity;
  const checkBudget = (force = false) => {
    const wallNow = performance.now();
    if (!force && wallNow - lastStopCheck < 100) return;
    lastStopCheck = wallNow;
    // Date is virtual inside the engine; this clock must remain real wall time.
    if (performance.timeOrigin + wallNow >= deadline || stopRequest && existsSync(stopRequest)) {
      throw new Error('Evaluation resource budget/interruption reached; preserve completed-game checkpoints');
    }
  };
  if (!existsSync(rowsPath)) writeFileSync(rowsPath, '');
  vi.useFakeTimers();
  const quiet = vi.spyOn(console, 'log').mockImplementation(() => {});
  try {
    for (const condition of evaluationConditions(manifest)) {
        checkBudget(true);
        const { character, enemy, map, preset, seed, side, id, pattern, version, round, scene } = condition;
        const ordinal = index++;
        if ((manifest.mode === 'session' ? Math.floor(ordinal / 3) : ordinal) % shardCount !== shardIndex) continue;
        expectedIds.add(id);
        if (completed.has(id)) { finished++; continue; }
        const previous = round && round > 1 ? sessions.get(id.replace(/\/\d+$/, '/' + (round - 1))) : undefined;
        if (round && round > 1 && !previous) throw new Error('Missing preceding session checkpoint: ' + id);
        const roundStart = previous?.endTime ?? manifest.startTime;
        vi.setSystemTime(roundStart);
        const settings = createAISettings(preset);
        const effectiveSeed = evaluationSeed(seed, character, enemy, map, preset + (pattern ? ':' + pattern : scene ? ':melee:' + scene : ''));
        const evaluatedAPI = version === 'baseline' ? frozen.api : CURRENT_AI;
        const candidate = evaluationController(evaluatedAPI, settings, effectiveSeed, side, previous?.controllers[side - 1]);
        const otherSide = side === 1 ? 2 : 1;
        const baseline = evaluationController(frozen.api, settings, effectiveSeed, otherSide, previous?.controllers[otherSide - 1]);
        const opponent = scene ? meleeOpponentController(scene, otherSide, roundStart)
          : pattern ? scriptedEvaluationController(pattern, otherSide, manifest.startTime) : baseline;
        const opportunity = scene ? probeMeleeOpportunity(character, scene, side, map, effectiveSeed, roundStart) : undefined;
        const runtime = { random: deterministicEngineRandom(effectiveSeed), controllers: {
          1: side === 1 ? candidate : opponent, 2: side === 2 ? candidate : opponent,
        }, cloneControllers: {
          1: evaluationCloneController(side === 1 ? evaluatedAPI : frozen.api, 1, previous?.cloneModels[0]),
          2: evaluationCloneController(side === 2 ? evaluatedAPI : frozen.api, 2, previous?.cloneModels[1]),
        } };
        const game = renderHook(() => useGameEngine(CHARACTERS[side === 1 ? character : enemy], CHARACTERS[side === 2 ? character : enemy],
          manifest.roundSeconds, noRoundEnd, 'multi', false, 1, map, undefined, true, undefined, runtime));
        if (scene) initializeMeleeScene(game.result.current.gameState, scene, side, roundStart, map);
        act(() => game.result.current.setKeysRef({ current: emptyAIKeys() }));
        const initialHealth = game.result.current.gameState.players.map(player => player.health);
        const tickTimes: number[] = [];
        const beforeGame = performance.now();
        let opportunityDamage: number | undefined;
        try {
          for (let tick = 0; tick < Math.ceil((manifest.roundSeconds + 2) * 1000 / 17) && game.result.current.gameState.isRoundActive; tick++) {
            checkBudget();
            const priorState = game.result.current.gameState;
            const before = performance.now();
            act(() => { vi.advanceTimersByTime(17); });
            tickTimes.push(performance.now() - before);
            const nextState = game.result.current.gameState;
            if (opportunity && opportunityDamage === undefined && (Date.now() - roundStart >= opportunity.windowMs || !nextState.isRoundActive)) {
              opportunityDamage = nextState.diagnostics!.effectiveDamage[side - 1];
            }
            for (const [controller, owner] of [[candidate, side], [baseline, otherSide]] as const) {
              const priorRuntime = priorState.evaluationState?.controllers[owner];
              const nextRuntime = nextState.evaluationState?.controllers[owner];
              const elapsed = nextRuntime && priorRuntime ? nextRuntime.activeTime - priorRuntime.activeTime : 0;
              if (elapsed > 0) recordEvaluationFrame(controller.trace, priorState.players[owner - 1], nextState.players[owner - 1],
                nextRuntime, elapsed, ARENA.padding, ARENA.width - ARENA.padding - PLAYER_SIZE,
                nextState.diagnostics!.receivedDamage[owner - 1] - priorState.diagnostics!.receivedDamage[owner - 1]);
              if (nextRuntime && priorRuntime) controller.trace.failedJumpIncreases += Math.max(0,
                (nextRuntime.memory?.failedJumps ?? 0) - (priorRuntime.memory?.failedJumps ?? 0));
            }
          }
          const state = game.result.current.gameState, metrics = state.diagnostics!;
          const { entityActions: _entityActions, entityActionIds: _entityActionIds, entityClones: _entityClones,
            activeActionIds: _activeActionIds, actionHitIds: _actionHitIds, blockedIds: _blockedIds, dotSources: _dotSources,
            poisonOwners: _poisonOwners, pendingMelee: _pendingMelee, seenIds: _seenIds, hitIds: _hitIds, ...reportedMetrics } = metrics;
          const ledgerErrors = state.players.map((player, i) => initialHealth[i] + metrics.healing[i] - metrics.receivedDamage[i] - player.health);
          const complete = state.roundWinner !== null && ledgerErrors.every(error => Math.abs(error) < 1e-7) &&
            state.players.every(player => Number.isFinite(player.health) && Number.isFinite(player.x) && Number.isFinite(player.y));
          const endSession = round ? captureEvaluationSession(state.evaluationState!, Date.now()) : undefined;
          appendFileSync(rowsPath, JSON.stringify({ ...condition, effectiveSeed,
            status: complete ? 'complete' : 'incomplete', winner: state.roundWinner,
            score: state.roundWinner === 'draw' ? 0.5 : state.roundWinner === side ? 1 : 0,
            seconds: (Date.now() - roundStart) / 1000, wallSeconds: (performance.now() - beforeGame) / 1000,
            ...(round ? { roundStart, endSession } : {}),
            finalHealth: state.players.map(player => player.health), ledgerErrors, metrics: reportedMetrics,
            candidateTrace: reportEvaluationTrace(candidate.trace), baselineTrace: pattern || scene ? null : reportEvaluationTrace(baseline.trace),
            ...(opportunity ? { meleeOpportunity: { ...opportunity, actualDamage: opportunityDamage ?? 0,
              used: opportunity.eligible && (opportunityDamage ?? 0) > 0 } } : {}),
            candidateTiming: timingSummary(candidate.timings().slice(30)), baselineTiming: timingSummary(baseline.timings().slice(30)),
            tickTiming: timingSummary(tickTimes.slice(30)) }) + '\n');
          if (!complete) throw new Error('Incomplete result or HP ledger failure: ' + id);
          if (endSession) sessions.set(id, endSession);
          finished++;
        } finally { game.unmount(); cleanup(); vi.clearAllTimers(); quiet.mockClear(); }
        const memory = process.memoryUsage();
        appendFileSync(output + '/resources.jsonl', JSON.stringify({ finished, id, heapUsed: memory.heapUsed, rss: memory.rss }) + '\n');
        if (finished % 10 === 0) process.stdout.write(`Evaluation ${finished} games, heap ${(memory.heapUsed / 1048576).toFixed(1)}MB, last ${id}\n`);
        await setImmediate();
      }
  } finally { quiet.mockRestore(); vi.useRealTimers(); }
  if (index !== manifest.expectedGames || finished !== expectedIds.size || [...completed].some(id => !expectedIds.has(id))) throw new Error('Experiment coverage mismatch');
  writeFileSync(output + '/complete.json', JSON.stringify({ ...signature, expected: expectedIds.size, completed: finished }, null, 2));
}
