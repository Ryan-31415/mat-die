import type { CharacterType, Player } from '@/types/game';
import type { BasicAttackVisual, CombatVisualState } from '@/types/combatVisual';
import { WEAPONS } from './weaponDefinitions';

export function weaponPose(id: CharacterType, elapsed: number | null, player: Pick<Player, 'isShielding' | 'isStunned' | 'isFrozen'>) {
  const definition = WEAPONS[id];
  const attacking = elapsed !== null && elapsed >= 0 && elapsed < definition.durationMs;
  const t = attacking ? elapsed : 0;
  const active = attacking && t < definition.activeMs;
  const progress = !attacking ? 0 : t < definition.sweepMs
    ? 1 - Math.pow(1 - t / definition.sweepMs, 3)
    : t < definition.activeMs ? 1
    : 1 - (t - definition.activeMs) / (definition.durationMs - definition.activeMs);
  const restrained = player.isStunned || player.isFrozen;
  return {
    attacking, active,
    angle: definition.idleAngle + (definition.strikeAngle - definition.idleAngle) * progress,
    offsetX: ['hunter', 'rocketeer'].includes(id) ? -3 * progress : id === 'scientist' ? 4 * progress : 0,
    offsetY: id === 'gladiator' && player.isShielding ? 5 : 0,
    trailOpacity: active ? (restrained ? 0.12 : 0.48) * (1 - 0.65 * t / definition.activeMs) : 0,
    flash: active && t < definition.sweepMs && !restrained ? 1 - t / definition.sweepMs : 0,
    bodyAngle: id === 'gladiator' && !restrained ? 3 * progress : 0,
  };
}

/** One shared engine clock, and at most one live motion per actor. */
export function advanceCombatVisual(previous: CombatVisualState, deltaMs: number): CombatVisualState {
  const time = previous.time + Math.max(0, deltaMs);
  const attacks: Record<string, BasicAttackVisual> = {};
  for (const [actor, attack] of Object.entries(previous.attacks)) {
    if (time - attack.startedAt < WEAPONS[attack.characterId].durationMs) attacks[actor] = attack;
  }
  return { ...previous, time, sequences: { ...previous.sequences }, attacks };
}
