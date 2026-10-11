import type { KeyboardState } from '@/hooks/useKeyboard';
import type { AIWorld } from '@/hooks/ai/world';
import type { AIDecision } from '@/hooks/ai/controller';
import type { AIMemory } from '@/hooks/ai/state';
import type { Player } from './game';
import type { DifficultyRuntime } from '@/hooks/ai/difficulty';
import type { OpponentModel } from '@/hooks/ai/learning';
import { createAttackHitbox, createHazardZone, createProjectile, type EntityCreationContext, type ProjectileType } from './projectile';

export type EngineRandomStream = 'environment' | 'combat' | 'id' | 'cosmetic';
export interface EngineController {
  initial: () => DifficultyRuntime;
  reset: (previous: DifficultyRuntime) => DifficultyRuntime;
  step: (world: AIWorld, previous: DifficultyRuntime) => { keys: KeyboardState; state: DifficultyRuntime };
}
export interface EngineCloneController {
  initial: () => OpponentModel;
  reset: (previous: OpponentModel) => OpponentModel;
  observe: (world: AIWorld, previous: OpponentModel) => OpponentModel;
  decide: (world: AIWorld, clone: Player, model: OpponentModel, memory?: AIMemory) => AIDecision;
}
export interface EngineEvaluationState {
  controllers: Partial<Record<1 | 2, DifficultyRuntime>>;
  cloneModels: Partial<Record<1 | 2, OpponentModel>>;
}
/** Optional evaluation hooks. Ordinary gameplay continues to use Math.random. */
export interface EngineRuntimeOptions {
  random?: (stream: EngineRandomStream, scope: string, now: number, index: number) => number;
  controllers?: Partial<Record<1 | 2, ((world: AIWorld) => KeyboardState) | EngineController>>;
  cloneControllers?: Partial<Record<1 | 2, EngineCloneController>>;
}

export function createEngineEvaluationState(runtime?: EngineRuntimeOptions, previous?: EngineEvaluationState): EngineEvaluationState | undefined {
  if (!runtime?.controllers && !runtime?.cloneControllers) return undefined;
  const state: EngineEvaluationState = { controllers: {}, cloneModels: {} };
  for (const side of [1, 2] as const) {
    const controller = runtime.controllers?.[side];
    if (controller && typeof controller !== 'function') {
      const prior = previous?.controllers[side];
      state.controllers[side] = prior ? controller.reset(prior) : controller.initial();
    }
    const cloneController = runtime.cloneControllers?.[side];
    if (cloneController) {
      const prior = previous?.cloneModels[side];
      state.cloneModels[side] = prior ? cloneController.reset(prior) : cloneController.initial();
    }
  }
  return state;
}

/** Counters are local to an updater invocation, so React replay consumes no external RNG state. */
export function createTickRandom(source: EngineRuntimeOptions['random'], scope: string, now: number) {
  const counters: Record<EngineRandomStream, number> = { environment: 0, combat: 0, id: 0, cosmetic: 0 };
  return (stream: EngineRandomStream) => source ? source(stream, scope, now, counters[stream]++) : Math.random();
}

export type EngineEntityKind = 'projectile' | 'hazard' | 'melee';
export function createEngineEntities(context?: EntityCreationContext, onCreate?: (entity: { id: string; ownerId: 1 | 2 }, kind: EngineEntityKind) => void) {
  const track = <T extends { id: string; ownerId: 1 | 2 }>(entity: T, kind: EngineEntityKind): T => { onCreate?.(entity, kind); return entity; };
  return {
    createProjectile: (type: ProjectileType, owner: 1 | 2, x: number, y: number, vx: number, vy: number, damage: number) =>
      track(createProjectile(type, owner, x, y, vx, vy, damage, context), 'projectile'),
    createHazardZone: (type: Parameters<typeof createHazardZone>[0], owner: 1 | 2, x: number, y: number, damage: number, duration: number) =>
      track(createHazardZone(type, owner, x, y, damage, duration, context), 'hazard'),
    createAttackHitbox: (owner: 1 | 2, x: number, y: number, width: number, height: number, damage: number,
      duration: number, canDeflect = false, sourceX?: number) =>
      track(createAttackHitbox(owner, x, y, width, height, damage, duration, canDeflect, sourceX, context), 'melee'),
  };
}
