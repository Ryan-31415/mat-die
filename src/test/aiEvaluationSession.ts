import { z } from 'zod';
import type { EngineEvaluationState } from '@/types/engineRuntime';
import { createOpponentModel, type Observation, type OpponentModel } from '@/hooks/ai/learning';
import type { DifficultySession } from '@/hooks/ai/difficulty';
import { NEUTRAL_AI_TRAITS } from '@/types/ai';

const number = z.number().finite();
const observation = z.object({
  time: number, x: number, y: number, vx: number, direction: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
  grounded: z.boolean(), health: number, attackCooldown: number, observerCooldown: number, observerX: number,
  knockbackX: number, disabled: z.boolean(),
}).transform((value): Observation => ({ time: value.time, x: value.x, y: value.y, vx: value.vx, direction: value.direction,
  grounded: value.grounded, health: value.health, attackCooldown: value.attackCooldown, observerCooldown: value.observerCooldown,
  observerX: value.observerX, knockbackX: value.knockbackX, disabled: value.disabled }));
const model = z.object({
  last: observation.optional(), samples: z.array(observation), velocityX: number, transitions: z.array(number).length(9),
  jumpCount: number, jumpCadenceCount: number, jumpInterval: number, lastJumpAt: number.optional(), groundedCount: number,
  attackInterval: number, attackCount: number, lastAttackAt: number.optional(), lastTurnAt: number.optional(),
  turnInterval: number, turnCount: number, reactionAt: number.optional(), reactionCount: number, reactionJump: number, reactionAway: number,
}).transform((value): OpponentModel => Object.assign(createOpponentModel(), value));
const session = z.object({
  automaticTraits: z.object({ aggression: number, skill: number, ultimate: number, defense: number, spacing: number, recovery: number }),
  model, randomState: z.number().int().min(0).max(4294967295),
}).transform((value): DifficultySession => ({ automaticTraits: Object.assign({ ...NEUTRAL_AI_TRAITS }, value.automaticTraits),
  model: value.model, randomState: value.randomState }));
/** Only learned tendencies/personality/RNG cross a round; pending observations/inputs do not. */
export const evaluationSessionSchema = z.object({ controllers: z.tuple([session, session]),
  cloneModels: z.tuple([model, model]), endTime: number }).transform((value): EvaluationSessionCheckpoint => ({
  controllers: [value.controllers[0], value.controllers[1]], cloneModels: [value.cloneModels[0], value.cloneModels[1]], endTime: value.endTime,
}));
export interface EvaluationSessionCheckpoint {
  controllers: [DifficultySession, DifficultySession]; cloneModels: [OpponentModel, OpponentModel]; endTime: number;
}

export function captureEvaluationSession(state: EngineEvaluationState, endTime: number): EvaluationSessionCheckpoint {
  return evaluationSessionSchema.parse({ controllers: [state.controllers[1]?.session, state.controllers[2]?.session],
    cloneModels: [state.cloneModels[1], state.cloneModels[2]], endTime });
}
