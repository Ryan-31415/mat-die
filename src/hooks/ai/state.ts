import type { Player } from '@/types/game';
import type { KeyboardState } from '../useKeyboard';
import { createOpponentModel, resetObservation, type OpponentModel } from './learning';

export type Strategy = 'approach' | 'pressure' | 'kite' | 'recover' | 'escape' | 'flank';
export interface AIMemory {
  goal?: { x: number; y: number };
  goalUntil: number;
  goalSignature: string;
  strategy: Strategy;
  progressX: number;
  progressY: number;
  progressAt: number;
  bestDistance: number;
  escapeUntil: number;
  failedJumps: number;
  jumpOrigin?: { x: number; y: number };
  wasGrounded: boolean;
  failedPlatform?: string;
  lastKeys?: KeyboardState;
  rangedHold?: boolean;
}
export interface AILearningSession {
  opponents: Record<1 | 2, OpponentModel>;
}
export interface AIRoundState {
  learning: AILearningSession;
  controllers: Record<string, AIMemory>;
}
export const createAILearningSession = (): AILearningSession => ({ opponents: { 1: createOpponentModel(), 2: createOpponentModel() } });
export const resetAILearningObservations = (session: AILearningSession): AILearningSession => ({
  opponents: { 1: resetObservation(session.opponents[1]), 2: resetObservation(session.opponents[2]) },
});
export const createAIRoundState = (learning = createAILearningSession()): AIRoundState => ({ learning: resetAILearningObservations(learning), controllers: {} });
export const createAIMemory = (player: Player, now: number): AIMemory => ({
  goalUntil: 0, goalSignature: '', strategy: 'approach', progressX: player.x, progressY: player.y,
  progressAt: now, bestDistance: Infinity, escapeUntil: 0, failedJumps: 0, wasGrounded: player.isGrounded,
});
