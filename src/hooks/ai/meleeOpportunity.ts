import { PLAYER_SIZE, type Player } from '@/types/game';
import { basicMeleeGeometry, playerOverlapsRect, shieldFacesX } from '@/types/combatPhysics';

/** One forecast opportunity, not a promise about the enemy's next input.
 * The caller advances readyAt only after a valid opportunity, so staying in
 * range cannot earn another reward until the public basic cooldown elapses.
 */
export function meleeOpportunityAt(player: Player, target: Player, elapsedMs: number, readyAt: number): number | null {
  if (!player.character || elapsedMs < readyAt || player.isStunned || player.isFrozen ||
      target.isInvulnerable || target.isEvading || target.dodgesRemaining > 0 ||
      shieldFacesX(target, player.x + PLAYER_SIZE / 2)) return null;
  const geometry = basicMeleeGeometry(player);
  if (!geometry || !playerOverlapsRect(target, geometry)) return null;
  return elapsedMs + player.character.attackCooldown;
}
