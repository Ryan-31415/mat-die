import { PLAYER_SIZE, type Player } from '@/types/game';
import { clampPlayerX, shieldFacesX } from '@/types/combatPhysics';
import type { AIFrame } from './world';
import type { Strategy } from './state';

/** Respond to visible opponent abilities, without assuming their next input. */
export function matchupTactics(player: Player, opponent: Player, frame: AIFrame, preferred: number, strategy: Strategy) {
  const enemy = opponent.character!.id;
  let flank: { x: number; y: number } | undefined;
  const ranged = !['gladiator', 'ninja', 'reaper'].includes(player.character!.id);
  if (enemy === 'gladiator' && strategy !== 'kite' && shieldFacesX(opponent, player.x + PLAYER_SIZE / 2)) {
    const back = { x: clampPlayerX(opponent.x + (opponent.facingRight ? -1 : 1) * (ranged ? 100 : 65)), y: opponent.y };
    const reachableSide = Math.abs(back.x - opponent.x) >= PLAYER_SIZE && (frame.world.mapId !== 'volcano' ||
      frame.world.platforms.some(p => p.id !== 'ground' && Math.abs(p.y - back.y - PLAYER_SIZE) < 12 && back.x >= p.x && back.x + PLAYER_SIZE <= p.x + p.width));
    if (reachableSide) { flank = back; preferred = 0; strategy = 'flank'; }
  }
  if (enemy === 'scientist' && opponent.isChargingSkill && !opponent.isInvulnerable && strategy !== 'kite') {
    preferred = Math.min(preferred, ranged ? 170 : 55); strategy = 'pressure';
  }
  if (ranged && ((enemy === 'hunter' && (opponent.hunterFocusedDuration > 0 || (player.isMarked && player.markOwnerId === opponent.id))) ||
      (enemy === 'ice-mage' && player.freezeGauge >= 3))) {
    preferred = Math.max(preferred, enemy === 'hunter' ? 375 : 350); strategy = 'kite';
  }
  if (enemy === 'reaper' && opponent.isFlying && opponent.invulnerableDuration > 500) {
    preferred = Math.max(preferred, 350); strategy = 'kite';
  }
  return { preferred, strategy, flank };
}

export function opponentLineRisk(opponent: Player, point: { x: number; y: number }, enemyPoint: { x: number; y: number }, elapsed: number, now: number) {
  const firingRight = opponent.facingRight;
  const inFront = (point.x - enemyPoint.x) * (firingRight ? 1 : -1) > 0;
  if (!inFront || Math.abs(point.y - enemyPoint.y) > 32) return 0;
  if (opponent.character!.id === 'archer' && opponent.archerBurstRemaining > 0 && elapsed < opponent.archerBurstRemaining * 0.08) return 90;
  if (opponent.character!.id === 'scientist' && opponent.isChargingSkill && now - opponent.skillChargeStartTime + elapsed * 1000 > 1200) return 45;
  return 0;
}
