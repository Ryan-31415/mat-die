import { performance } from 'node:perf_hooks';
import type { Player } from '@/types/game';
import type { AISettings } from '@/types/ai';
import type { Projectile } from '@/types/projectile';
import type { EngineRuntimeOptions, EngineController, EngineCloneController } from '@/types/engineRuntime';
import type { KeyboardState } from '@/hooks/useKeyboard';
import { emptyAIKeys } from '@/hooks/ai/controller';
import { createDifficultyRuntime, createDifficultySession, stepDifficulty } from '@/hooks/ai/difficulty';
import { decideAI } from '@/hooks/ai/controller';
import { createOpponentModel, observeOpponent, resetObservation } from '@/hooks/ai/learning';
import { prepareAIFrame, type AIWorld } from '@/hooks/ai/world';
import type { FrozenAIAPI } from './aiBaseline';
import type { DifficultySession } from '@/hooks/ai/difficulty';
import type { OpponentModel } from '@/hooks/ai/learning';
import { createEvaluationTrace, recordInference, recordPositionDecision } from './aiEvaluationDiagnostics';

export const CURRENT_AI = { createDifficultyRuntime, createDifficultySession, stepDifficulty,
  decideAI, prepareAIFrame, createOpponentModel, observeOpponent, resetObservation };
export type EvaluationAI = Pick<FrozenAIAPI, 'createDifficultyRuntime' | 'createDifficultySession' | 'stepDifficulty'>;
export function evaluationSeed(masterSeed: number, character: string, enemy: string, map: string, preset: string) {
  let value = masterSeed >>> 0;
  for (const code of character + '/' + enemy + '/' + map + '/' + preset) value = Math.imul(value ^ code.charCodeAt(0), 16777619) >>> 0;
  return value;
}
export function evaluationCloneController(api: Pick<FrozenAIAPI, 'decideAI' | 'prepareAIFrame' | 'createOpponentModel' | 'observeOpponent' | 'resetObservation'>, side: 1 | 2, previous?: OpponentModel): EngineCloneController {
  const frames = new WeakMap<AIWorld, ReturnType<typeof prepareAIFrame>>();
  return {
    initial: () => previous ? api.resetObservation(previous) : api.createOpponentModel(),
    reset: previous => api.resetObservation(previous),
    observe: (world, previous) => api.observeOpponent(previous, world.players[side === 1 ? 1 : 0], world.players[side - 1], world.now),
    decide: (world, clone, model, memory) => {
      let frame = frames.get(world);
      if (!frame) { frame = api.prepareAIFrame(world); frames.set(world, frame); }
      return api.decideAI(frame, clone, model, memory);
    },
  };
}
const flip = (id: 1 | 2): 1 | 2 => id === 1 ? 2 : 1;

function swapPlayer(player: Player): Player {
  return { ...player, id: flip(player.id),
    markOwnerId: player.markOwnerId === undefined ? undefined : flip(player.markOwnerId),
    burnOwner: player.burnOwner === null ? null : flip(player.burnOwner) };
}
function swapProjectile(projectile: Projectile): Projectile {
  const lastHitTime: Record<number, number> = {};
  for (const id of [1, 2] as const) if (projectile.lastHitTime[id] !== undefined) lastHitTime[flip(id)] = projectile.lastHitTime[id];
  return { ...projectile, ownerId: flip(projectile.ownerId), lastHitTime };
}
/** Identity normalization only: spatial coordinates and physical facing are never mirrored. */
export function worldForSide(world: AIWorld, side: 1 | 2): AIWorld {
  if (side === 2) return world;
  return { ...world, players: [swapPlayer(world.players[1]), swapPlayer(world.players[0])],
    projectiles: world.projectiles.map(swapProjectile),
    hazardZones: world.hazardZones.map(zone => ({ ...zone, ownerId: flip(zone.ownerId) })),
    attackHitboxes: world.attackHitboxes.map(box => ({ ...box, ownerId: flip(box.ownerId) })) };
}
export function keysForSide(keys: KeyboardState, side: 1 | 2): KeyboardState {
  if (side === 2) return { ...keys };
  return { ...emptyAIKeys(), a: keys.arrowLeft, d: keys.arrowRight, w: keys.arrowUp, s: keys.arrowDown,
    f: keys.shift, g: keys.enter, h: keys.backslash };
}

/** Stateless stream draws allow replayed React updaters and isolate effects from game randomness. */
export function deterministicEngineRandom(seed: number): EngineRuntimeOptions['random'] {
  return (stream, scope, now, index) => {
    let value = seed >>> 0;
    const key = stream + ':' + scope + ':' + now + ':' + index;
    for (let i = 0; i < key.length; i++) value = Math.imul(value ^ key.charCodeAt(i), 16777619) >>> 0;
    value ^= value >>> 16; value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15; value = Math.imul(value, 0x846ca68b);
    return ((value ^ value >>> 16) >>> 0) / 4294967296;
  };
}

export function evaluationController(api: EvaluationAI, settings: AISettings, seed: number, side: 1 | 2, previous?: DifficultySession) {
  const samples: number[] = [];
  const trace = createEvaluationTrace();
  return {
    initial: () => api.createDifficultyRuntime(previous ?? api.createDifficultySession(seed)),
    reset: previous => api.createDifficultyRuntime(previous.session),
    step: (world, previous) => {
      const before = performance.now();
      const normalized = worldForSide(world, side);
      const state = api.stepDifficulty(normalized, settings, previous, 2, decision => recordPositionDecision(trace, decision));
      samples.push(performance.now() - before);
      recordInference(trace, normalized, settings, previous, state);
      return { keys: keysForSide(state.keys, side), state };
    },
    timings: () => [...samples],
    trace,
  } satisfies EngineController & { timings: () => number[]; trace: typeof trace };
}

export function timingSummary(samples: number[]) {
  if (!samples.length) return { samples: 0, meanMs: null, p50Ms: null, p95Ms: null, p99Ms: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const quantile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return { samples: sorted.length, meanMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p50Ms: quantile(0.5), p95Ms: quantile(0.95), p99Ms: quantile(0.99) };
}
