import type { CharacterType, Player } from './game';
import type { BasicMeleeGeometry } from './combatPhysics';

/** Renderer-only data. Never attached to players, combat entities, or AI observations. */
export interface BasicAttackVisual {
  actorId: string;
  roundId: number;
  attackSequence: number;
  occurredAt: number;
  startedAt: number;
  characterId: CharacterType;
  x: number;
  y: number;
  facingRight: boolean;
  poison: boolean;
  focused: boolean;
  napalm: boolean;
  melee: BasicMeleeGeometry | null;
}

export interface CombatVisualState {
  roundId: number;
  time: number;
  sequences: Record<string, number>;
  attacks: Record<string, BasicAttackVisual>;
}

export const visualActorId = (player: Player, cloneIndex = 0) => player.isClone
  ? player.aiControllerId ?? `clone:${player.id}:${player.createdAt}:${cloneIndex}`
  : `player:${player.id}`;

export const createCombatVisualState = (roundId = 1): CombatVisualState => ({
  roundId, time: 0, sequences: {}, attacks: {},
});

/** Only called by the engine at an accepted basic attack, before consumables decrement. */
export function captureBasicAttack(visual: CombatVisualState, player: Player, occurredAt: number,
  melee: BasicMeleeGeometry | null, actorId = visualActorId(player)) {
  const attackSequence = (visual.sequences[actorId] ?? 0) + 1;
  visual.sequences[actorId] = attackSequence;
  visual.attacks[actorId] = {
    actorId, roundId: visual.roundId, attackSequence, occurredAt, startedAt: visual.time,
    characterId: player.character!.id, x: player.x, y: player.y, facingRight: player.facingRight,
    poison: player.poisonArrowsRemaining > 0, focused: player.hunterFocusedDuration > 0,
    napalm: player.napalmDuration > 0, melee: melee ? { ...melee } : null,
  };
}
