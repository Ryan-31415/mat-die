import { ARENA, PLAYER_SIZE, type CharacterType } from '@/types/game';
import type { AIWorld } from '@/hooks/ai/world';
import { emptyAIKeys } from '@/hooks/ai/controller';
import { keysForSide } from './aiEvaluation';

export const EVALUATION_PATTERNS = ['strafe', 'jump', 'rush'] as const;
export type EvaluationPattern = typeof EVALUATION_PATTERNS[number];
export const SCRIPTED_CHARACTERS: Record<EvaluationPattern, CharacterType> = {
  strafe: 'archer', jump: 'ninja', rush: 'gladiator',
};

/** Current-state scripted opponents from the historical engine benchmark. */
export function scriptedEvaluationController(pattern: EvaluationPattern, side: 1 | 2, startTime: number) {
  return (world: AIWorld) => {
    const self = world.players[side - 1], enemy = world.players[side === 1 ? 1 : 0];
    const elapsed = world.now - startTime;
    const toward = enemy.x > self.x ? 1 : -1;
    let direction = pattern === 'rush' ? toward : Math.floor(elapsed / 1300) % 2 ? -1 : 1;
    if (self.x < ARENA.padding + 25) direction = 1;
    if (self.x > ARENA.width - ARENA.padding - PLAYER_SIZE - 25) direction = -1;
    return keysForSide({ ...emptyAIKeys(), arrowLeft: direction < 0, arrowRight: direction > 0,
      arrowUp: pattern === 'jump' ? elapsed % 750 < 80 : world.mapId === 'volcano' && self.isGrounded && elapsed % 900 < 80,
      shift: true, enter: pattern === 'strafe' || pattern === 'rush' && Math.abs(enemy.x - self.x) < 140 && elapsed % 1300 < 450,
      backslash: true }, side);
  };
}
