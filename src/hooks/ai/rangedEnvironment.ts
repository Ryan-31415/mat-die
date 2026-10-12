import { PLAYER_SIZE } from '@/types/game';
import { FLOOR_Y } from '@/types/combatPhysics';
import type { AIFrame } from './world';
import type { Point } from './navigation';

/** Landing corridor risk, without assuming an unobserved future lava tick. */
export function rangedLandingPenalty(frame: AIFrame, point: Point, velocityY: number) {
  if (frame.world.mapId !== 'volcano' || velocityY <= 0) return 0;
  const landing = frame.world.platforms.some(platform => platform.id !== 'ground' &&
    platform.y >= point.y + PLAYER_SIZE && point.x + PLAYER_SIZE > platform.x && point.x < platform.x + platform.width);
  return landing ? 0 : Math.max(0, 1 - (FLOOR_Y - point.y) / 240) * 80;
}
