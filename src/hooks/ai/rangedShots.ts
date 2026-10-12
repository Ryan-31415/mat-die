import type { Player } from '@/types/game';
import type { AIFrame } from './world';
import type { Point } from './navigation';
import type { RangedShotPolicy } from './combat';
import { hunterScatter } from './hunter';
import { rocketeerShot } from './rocketeer';

/** No caches or closures are constructed for characters using the old policy. */
export function createRangedShots(frame: AIFrame, player: Player, opponent: Player, targetAt: (time: number) => Point): RangedShotPolicy {
  const scatters = new Map<string, ReturnType<typeof hunterScatter>>();
  const rockets = new Map<string, ReturnType<typeof rocketeerShot>>();
  const shotKey = (origin: Pick<Player, 'x' | 'y' | 'facingRight'>) => `${origin.x}:${origin.y}:${origin.facingRight}`;
  return {
    scatter: origin => {
      const key = shotKey(origin);
      let result = scatters.get(key);
      if (!result) { result = hunterScatter(frame, player, opponent, origin, targetAt); scatters.set(key, result); }
      return result;
    },
    rocket: (origin, homing, leadMs = 0) => {
      const key = `${shotKey(origin)}:${homing}:${leadMs}`;
      if (!rockets.has(key)) rockets.set(key, rocketeerShot(frame, { ...player, ...origin }, opponent,
        targetAt, homing, origin.facingRight ? 1 : -1, true, leadMs));
      return rockets.get(key)!;
    },
    work: () => ({ scatterCalls: scatters.size, rocketCalls: rockets.size }),
  };
}
