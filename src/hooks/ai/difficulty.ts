import { AI_TRAIT_LABELS, AI_INPUT_LABELS, NEUTRAL_AI_TRAITS, type AISettings, type AITraits, type AITrait, type AIInputKey } from '@/types/ai';
import type { KeyboardState } from '../useKeyboard';
import { decideAI, emptyAIKeys } from './controller';
import { createOpponentModel, observeOpponent, resetObservation, type OpponentModel } from './learning';
import { createPerceptionMemory, perceiveWorld, type PerceptionMemory } from './perception';
import { gaussian, seededRandom } from './random';
import type { AIMemory } from './state';
import { prepareAIFrame, type AIWorld } from './world';

export interface DifficultySession {
  automaticTraits: AITraits;
  model: OpponentModel;
  randomState: number;
}
export function createDifficultySession(seed = Math.floor(Math.random() * 4294967296)): DifficultySession {
  const rng = seededRandom(seed);
  const automaticTraits = { ...NEUTRAL_AI_TRAITS };
  for (const name of Object.keys(AI_TRAIT_LABELS) as AITrait[]) {
    let value: number;
    do { value = 1 + gaussian(rng.next) * 0.15; } while (value < 0 || value > 2);
    automaticTraits[name] = value;
  }
  return { automaticTraits, model: createOpponentModel(), randomState: rng.state() };
}
export function resolveTraits(settings: AISettings, session: DifficultySession): AITraits {
  const result = { ...NEUTRAL_AI_TRAITS };
  for (const name of Object.keys(AI_TRAIT_LABELS) as AITrait[]) result[name] = settings.traits[name].automatic ? session.automaticTraits[name] : settings.traits[name].value;
  return result;
}
interface PendingObservation { readyAt: number; world: AIWorld }
interface PendingInput { group: number; readyAt: number; values: Partial<KeyboardState> }
export interface DifficultyRuntime {
  session: DifficultySession;
  activeTime: number;
  lastObservedAt: number;
  perception: PerceptionMemory;
  observations: PendingObservation[];
  inputs: PendingInput[];
  keys: KeyboardState;
  memory?: AIMemory;
  observationsTaken: number;
  decisionsMade: number;
}
export const createDifficultyRuntime = (session: DifficultySession): DifficultyRuntime => ({
  session: { ...session, model: resetObservation(session.model) }, activeTime: 0, lastObservedAt: -Infinity,
  perception: createPerceptionMemory(), observations: [], inputs: [], keys: emptyAIKeys(), observationsTaken: 0, decisionsMade: 0,
});
const inputGroups: (keyof KeyboardState)[][] = [
  ['arrowLeft', 'arrowRight'], ['arrowUp', 'arrowDown'], ['shift'], ['enter'], ['backslash'],
];
function flushInputs(inputs: PendingInput[], keys: KeyboardState, now: number) {
  const remaining: PendingInput[] = [];
  for (const input of inputs) {
    if (input.readyAt <= now) Object.assign(keys, input.values);
    else remaining.push(input);
  }
  return remaining;
}

/** Pure transition. Every random draw and queue update is local to the returned state. */
export function stepDifficulty(world: AIWorld, settings: AISettings, previous: DifficultyRuntime): DifficultyRuntime {
  const parameters = settings.parameters;
  const activeTime = previous.activeTime + Math.max(0, world.deltaTime);
  const rng = seededRandom(previous.session.randomState);
  const keys = { ...previous.keys };
  let inputs = flushInputs(previous.inputs, keys, activeTime);
  const observations = [...previous.observations];
  let perception = previous.perception;
  let lastObservedAt = previous.lastObservedAt;
  let observationsTaken = previous.observationsTaken;
  if (activeTime - lastObservedAt >= parameters.observationInterval) {
    const sample = perceiveWorld(world, parameters, perception, activeTime, rng.next);
    perception = sample.memory;
    const delay = parameters.reactionMin + rng.next() * (parameters.reactionMax - parameters.reactionMin);
    const readyAt = Math.max(activeTime + delay, observations[observations.length - 1]?.readyAt ?? 0);
    observations.push({ readyAt, world: sample.world });
    lastObservedAt = activeTime;
    observationsTaken++;
  }
  let latest: AIWorld | undefined;
  let model = previous.session.model;
  while (observations.length && observations[0].readyAt <= activeTime) {
    const sample = observations.shift();
    latest = sample.world;
    // Only matured observations teach P2; clone learning is never used here.
    model = observeOpponent(model, latest.players[0], latest.players[1], latest.now, parameters.learningOptions);
  }
  let memory = previous.memory;
  let decisionsMade = previous.decisionsMade;
  if (latest) {
    const forecasts = parameters.prediction > 0 ? parameters.forecasts : {
      opponent: { ...parameters.forecasts.opponent, horizonMs: 0 },
      projectiles: { ...parameters.forecasts.projectiles, horizonMs: 0 },
      environment: { ...parameters.forecasts.environment, horizonMs: 0 },
    };
    const decision = decideAI(prepareAIFrame(latest, { forecasts, random: rng.next }), latest.players[1], model, memory, { parameters, traits: resolveTraits(settings, previous.session), random: rng.next });
    memory = decision.memory;
    decisionsMade++;
    inputGroups.forEach((group, index) => {
      const kind = (Object.keys(AI_INPUT_LABELS) as AIInputKey[])[index];
      const input = parameters.inputs[kind];
      const min = input.useCommonPrecision ? parameters.precisionMin : input.precisionMin;
      const max = input.useCommonPrecision ? parameters.precisionMax : input.precisionMax;
      const precision = (min + rng.next() * (max - min)) / 100;
      const pending = inputs.find(i => i.group === index);
      if (pending && group.every(key => pending.values[key] === decision.keys[key])) return;
      inputs = inputs.filter(i => i.group !== index);
      if (group.every(key => keys[key] === decision.keys[key])) return;
      if (precision < 1 && rng.next() >= precision) return;
      const values: Partial<KeyboardState> = {};
      group.forEach(key => { values[key] = decision.keys[key]; });
      const delayMaxMs = input.useCommonDelay ? parameters.inputDelayMaxMs : input.delayMaxMs;
      inputs.push({ group: index, readyAt: activeTime + (delayMaxMs > 0 ? rng.next() * delayMaxMs : 0), values });
    });
    inputs = flushInputs(inputs, keys, activeTime);
  }
  return {
    session: { ...previous.session, model, randomState: rng.state() }, activeTime, lastObservedAt,
    perception, observations, inputs, keys, memory, observationsTaken, decisionsMade,
  };
}
