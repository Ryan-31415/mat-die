import type { Player } from '@/types/game';
import type { Platform } from '@/types/platform';
import type { Projectile, HazardZone } from '@/types/projectile';
import type { MapId } from '@/types/map';
import type { KeyboardState } from './useKeyboard';
import { decideAI } from './ai/controller';
import { prepareAIFrame, type LightningWarning } from './ai/world';
export { decideAI, emptyAIKeys } from './ai/controller';
export { prepareAIFrame } from './ai/world';

/** Compatibility entrypoint for callers without persistent learning. */
export function getAIKeys(player: Player, opponent: Player, projectiles: Projectile[], hazards: HazardZone[], platforms: Platform[], isOvertime: boolean, now: number, mapId: MapId = 'default', lightning: LightningWarning[] = []): KeyboardState {
  return decideAI(prepareAIFrame({
    players: player.id === 1 ? [player, opponent] : [opponent, player], projectiles, hazardZones: hazards, platforms,
    now, mapId, isOvertime, deltaTime: 1000 / 60, roundTimeRemaining: 60, lightningStrikes: lightning,
    attackHitboxes: [], sandstormActive: false, sandstormDirection: 'right', sandstormTimer: 0, soulZones: [], vineShields: [],
  }), player).keys;
}
